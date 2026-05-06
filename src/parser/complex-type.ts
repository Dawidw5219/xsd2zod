import type {
	IRArray,
	IRAttribute,
	IRObject,
	IRObjectField,
	IRType,
	IRUnion,
} from '../ir';
import { Xsd2ZodError } from '../errors';
import {
	findChild,
	findChildren,
	getAttr,
	getChildren,
	getDocumentation,
	getTagName,
	stripPrefix,
	type OrderedNode,
} from './xml';
import { resolveTypeRef, parseSimpleType, type SimpleTypeContext } from './simple-type';

export type ComplexTypeContext = SimpleTypeContext;

function parseOccurs(node: OrderedNode): { minOccurs: number; maxOccurs: number | 'unbounded' } {
	const minStr = getAttr(node, 'minOccurs');
	const maxStr = getAttr(node, 'maxOccurs');
	const minOccurs = minStr === undefined ? 1 : Number(minStr);
	const maxOccurs: number | 'unbounded' =
		maxStr === undefined
			? 1
			: maxStr === 'unbounded'
				? 'unbounded'
				: Number(maxStr);
	return { minOccurs, maxOccurs };
}

function isRepeatable(maxOccurs: number | 'unbounded'): boolean {
	return maxOccurs === 'unbounded' || (typeof maxOccurs === 'number' && maxOccurs > 1);
}

export function parseElement(node: OrderedNode, ctx: ComplexTypeContext): IRObjectField {
	const name = getAttr(node, 'name');
	const ref = getAttr(node, 'ref');
	const typeRef = getAttr(node, 'type');
	const { minOccurs, maxOccurs } = parseOccurs(node);
	const doc = getDocumentation(node);
	const nillable = getAttr(node, 'nillable') === 'true';
	const defaultVal = getAttr(node, 'default');
	const fixedVal = getAttr(node, 'fixed');

	let inner: IRType;
	let fieldName: string;

	if (ref) {
		fieldName = stripPrefix(ref);
		inner = { kind: 'ref', name: fieldName, refKind: 'element', doc };
	} else if (name) {
		fieldName = name;
		if (typeRef) {
			inner = resolveTypeRef(typeRef, ctx);
			if (doc) inner = { ...inner, doc };
		} else {
			const inlineComplex = findChild(node, 'complexType');
			const inlineSimple = findChild(node, 'simpleType');
			if (inlineComplex) {
				inner = parseComplexType(inlineComplex, ctx);
				if (doc) inner = { ...inner, doc };
			} else if (inlineSimple) {
				inner = parseSimpleType(inlineSimple, ctx);
				if (doc) inner = { ...inner, doc };
			} else {
				// xs:element without type defaults to xs:anyType.
				inner = { kind: 'any', doc };
			}
		}
	} else {
		throw new Xsd2ZodError(
			'invalid_element',
			'xs:element must have either a name or a ref attribute',
			{ construct: 'xs:element', specSection: 'Part 1 §4' },
		);
	}

	let typed: IRType;
	if (isRepeatable(maxOccurs)) {
		// maxOccurs > 1 → wrap in xs:list-style array.
		const arr: IRArray = { kind: 'array', item: inner, minOccurs, maxOccurs };
		if (doc !== undefined) arr.doc = doc;
		typed = arr;
	} else {
		typed = inner;
	}

	const field: IRObjectField = {
		name: fieldName,
		type: typed,
		required: minOccurs > 0,
		minOccurs,
		maxOccurs,
		nillable,
	};
	if (defaultVal !== undefined) field.default = defaultVal;
	if (fixedVal !== undefined) field.fixed = fixedVal;
	if (doc !== undefined) field.doc = doc;
	return field;
}

export function parseAttribute(node: OrderedNode, ctx: ComplexTypeContext): IRAttribute | undefined {
	const name = getAttr(node, 'name');
	const ref = getAttr(node, 'ref');
	const typeRef = getAttr(node, 'type');
	const useStr = getAttr(node, 'use');
	const use: IRAttribute['use'] =
		useStr === 'required' || useStr === 'prohibited' ? useStr : 'optional';
	const defaultVal = getAttr(node, 'default');
	const fixedVal = getAttr(node, 'fixed');
	const formStr = getAttr(node, 'form');
	const form: IRAttribute['form'] | undefined =
		formStr === 'qualified' || formStr === 'unqualified' ? formStr : undefined;
	const doc = getDocumentation(node);

	if (use === 'prohibited') return undefined;

	let attrName: string;
	let inner: IRType;
	if (ref) {
		attrName = stripPrefix(ref);
		inner = { kind: 'ref', name: attrName, refKind: 'attributeGroup' };
	} else if (name) {
		attrName = name;
		if (typeRef) {
			inner = resolveTypeRef(typeRef, ctx);
		} else {
			const inline = findChild(node, 'simpleType');
			inner = inline ? parseSimpleType(inline, ctx) : { kind: 'string' };
		}
	} else {
		throw new Xsd2ZodError(
			'invalid_attribute',
			'xs:attribute must have either a name or a ref attribute',
			{ construct: 'xs:attribute', specSection: 'Part 1 §5' },
		);
	}

	const attr: IRAttribute = { name: attrName, type: inner, use };
	if (defaultVal !== undefined) attr.default = defaultVal;
	if (fixedVal !== undefined) attr.fixed = fixedVal;
	if (form !== undefined) attr.form = form;
	if (doc !== undefined) attr.doc = doc;
	return attr;
}

function parseChoice(node: OrderedNode, ctx: ComplexTypeContext): IRUnion {
	const doc = getDocumentation(node);
	const { minOccurs, maxOccurs } = parseOccurs(node);
	const variants: IRType[] = [];
	for (const c of getChildren(node)) {
		const tag = stripPrefix(getTagName(c));
		switch (tag) {
			case 'element': {
				const field = parseElement(c, ctx);
				const obj: IRObject = { kind: 'object', fields: [field] };
				if (field.doc !== undefined) obj.doc = field.doc;
				variants.push(obj);
				break;
			}
			case 'sequence':
				variants.push(parseSequence(c, ctx));
				break;
			case 'choice':
				variants.push(parseChoice(c, ctx));
				break;
			case 'group': {
				const ref = getAttr(c, 'ref');
				if (ref) variants.push({ kind: 'ref', name: stripPrefix(ref), refKind: 'group' });
				break;
			}
			case 'any':
				variants.push({ kind: 'any' });
				break;
		}
	}
	const union: IRUnion = { kind: 'union', variants, minOccurs, maxOccurs };
	if (doc !== undefined) union.doc = doc;
	return union;
}

interface ModelBody {
	fields: IRObjectField[];
	choices: IRObjectField[];
	groupRefs: IRObjectField[];
	anys: IRObjectField[];
	doc?: string;
}

function emptyBody(): ModelBody {
	return { fields: [], choices: [], groupRefs: [], anys: [] };
}

function parseSequence(node: OrderedNode, ctx: ComplexTypeContext): IRObject {
	const body = parseInlineModel(node, ctx, 'sequence');
	return modelBodyToObject(body);
}

function parseAll(node: OrderedNode, ctx: ComplexTypeContext): IRObject {
	const body = parseInlineModel(node, ctx, 'all');
	return modelBodyToObject(body);
}

/** Parse the contents of an xs:sequence / xs:all node into a ModelBody. */
function parseInlineModel(
	node: OrderedNode,
	ctx: ComplexTypeContext,
	kind: 'sequence' | 'all',
): ModelBody {
	const out = emptyBody();
	const doc = getDocumentation(node);
	if (doc !== undefined) out.doc = doc;
	for (const c of getChildren(node)) {
		const tag = stripPrefix(getTagName(c));
		if (kind === 'all' && tag !== 'element') continue;
		switch (tag) {
			case 'element':
				out.fields.push(parseElement(c, ctx));
				break;
			case 'sequence': {
				const inner = parseInlineModel(c, ctx, 'sequence');
				out.fields.push(...inner.fields);
				out.choices.push(...inner.choices);
				out.groupRefs.push(...inner.groupRefs);
				out.anys.push(...inner.anys);
				break;
			}
			case 'choice': {
				const choice = parseChoice(c, ctx);
				const f: IRObjectField = {
					name: '',
					type: choice,
					required: (choice.minOccurs ?? 1) > 0,
					minOccurs: choice.minOccurs ?? 1,
					maxOccurs: choice.maxOccurs ?? 1,
				};
				if (choice.doc !== undefined) f.doc = choice.doc;
				out.choices.push(f);
				break;
			}
			case 'group': {
				const ref = getAttr(c, 'ref');
				if (!ref) break;
				const { minOccurs, maxOccurs } = parseOccurs(c);
				out.groupRefs.push({
					name: '',
					type: { kind: 'ref', name: stripPrefix(ref), refKind: 'group' },
					required: minOccurs > 0,
					minOccurs,
					maxOccurs,
				});
				break;
			}
			case 'any': {
				const { minOccurs, maxOccurs } = parseOccurs(c);
				const procContents = getAttr(c, 'processContents');
				const ns = getAttr(c, 'namespace');
				const namespaces = ns
					? ns.split(/\s+/).filter((s) => s.length > 0)
					: undefined;
				const irAny: IRType = {
					kind: 'any',
					processContents:
						procContents === 'skip' || procContents === 'lax' || procContents === 'strict'
							? procContents
							: 'strict',
				};
				if (namespaces) (irAny as Extract<IRType, { kind: 'any' }>).namespaces = namespaces;
				out.anys.push({
					name: '',
					type: irAny,
					required: minOccurs > 0,
					minOccurs,
					maxOccurs,
				});
				break;
			}
		}
	}
	return out;
}

function modelBodyToObject(body: ModelBody): IRObject {
	const out: IRObject = { kind: 'object', fields: body.fields };
	if (body.choices.length) out.choices = body.choices;
	if (body.groupRefs.length) out.groupRefs = body.groupRefs;
	if (body.anys.length) out.anys = body.anys;
	if (body.doc !== undefined) out.doc = body.doc;
	return out;
}

interface CollectedAttributes {
	attributes: IRAttribute[];
	/** xs:anyAttribute → caller adds a wildcard `anys` entry to keep `@*` keys. */
	hasAnyAttribute: boolean;
}

function collectAttributes(parent: OrderedNode, ctx: ComplexTypeContext): CollectedAttributes {
	const attributes: IRAttribute[] = [];
	for (const c of findChildren(parent, 'attribute')) {
		const a = parseAttribute(c, ctx);
		if (a) attributes.push(a);
	}
	for (const c of findChildren(parent, 'attributeGroup')) {
		const ref = getAttr(c, 'ref');
		if (!ref) continue;
		// xs:attributeGroup ref → emitter inlines via intersection at resolve time.
		attributes.push({
			name: stripPrefix(ref),
			type: { kind: 'ref', name: stripPrefix(ref), refKind: 'attributeGroup' },
			use: 'optional',
		});
	}
	const hasAnyAttribute = findChildren(parent, 'anyAttribute').length > 0;
	return { attributes, hasAnyAttribute };
}

/** Append an xs:anyAttribute marker — drives `.passthrough()` on emit. */
function addAnyAttributeWildcard(obj: IRObject): void {
	const wildcard: IRObjectField = {
		name: '',
		type: { kind: 'any', processContents: 'lax' },
		required: false,
		minOccurs: 0,
		maxOccurs: 'unbounded',
	};
	obj.anys = [...(obj.anys ?? []), wildcard];
}

function parseModelBlock(parent: OrderedNode, ctx: ComplexTypeContext): IRObject {
	const sequence = findChild(parent, 'sequence');
	const choice = findChild(parent, 'choice');
	const all = findChild(parent, 'all');
	const group = findChild(parent, 'group');

	if (sequence) return parseSequence(sequence, ctx);
	if (all) return parseAll(all, ctx);
	if (choice) {
		const ch = parseChoice(choice, ctx);
		const f: IRObjectField = {
			name: '',
			type: ch,
			required: (ch.minOccurs ?? 1) > 0,
			minOccurs: ch.minOccurs ?? 1,
			maxOccurs: ch.maxOccurs ?? 1,
		};
		if (ch.doc !== undefined) f.doc = ch.doc;
		return { kind: 'object', fields: [], choices: [f] };
	}
	if (group) {
		const ref = getAttr(group, 'ref');
		const obj: IRObject = { kind: 'object', fields: [] };
		if (ref) {
			const { minOccurs, maxOccurs } = parseOccurs(group);
			obj.groupRefs = [
				{
					name: '',
					type: { kind: 'ref', name: stripPrefix(ref), refKind: 'group' },
					required: minOccurs > 0,
					minOccurs,
					maxOccurs,
				},
			];
		}
		return obj;
	}
	return { kind: 'object', fields: [] };
}

function parseComplexContent(
	complexContent: OrderedNode,
	ctx: ComplexTypeContext,
): { body: IRObject; baseRef: string | undefined; kind: 'extension' | 'restriction' } {
	const extension = findChild(complexContent, 'extension');
	const restriction = findChild(complexContent, 'restriction');
	const op = extension ?? restriction;
	if (!op) {
		throw new Xsd2ZodError(
			'invalid_complex_content',
			'xs:complexContent must contain xs:extension or xs:restriction',
			{ file: ctx.file, construct: 'xs:complexContent', specSection: 'Part 1 §3.4' },
		);
	}
	const baseRef = getAttr(op, 'base');
	const body = parseModelBlock(op, ctx);
	const { attributes, hasAnyAttribute } = collectAttributes(op, ctx);
	if (hasAnyAttribute) addAnyAttributeWildcard(body);
	if (attributes.length) body.attributes = attributes;
	return { body, baseRef, kind: extension ? 'extension' : 'restriction' };
}

function parseSimpleContent(simpleContent: OrderedNode, ctx: ComplexTypeContext): IRObject {
	const extension = findChild(simpleContent, 'extension');
	const restriction = findChild(simpleContent, 'restriction');
	const op = extension ?? restriction;
	if (!op) {
		throw new Xsd2ZodError(
			'invalid_simple_content',
			'xs:simpleContent must contain xs:extension or xs:restriction',
			{ file: ctx.file, construct: 'xs:simpleContent', specSection: 'Part 1 §3.3' },
		);
	}
	const baseRef = getAttr(op, 'base');
	const baseType: IRType = baseRef ? resolveTypeRef(baseRef, ctx) : { kind: 'string' };
	// xs:simpleContent → object with a synthetic `_value` field carrying the
	// text content, plus attributes. Emitter folds this into z.object.
	const valueField: IRObjectField = {
		name: '_value',
		type: baseType,
		required: true,
		minOccurs: 1,
		maxOccurs: 1,
	};
	const out: IRObject = { kind: 'object', fields: [valueField] };
	const { attributes, hasAnyAttribute } = collectAttributes(op, ctx);
	if (hasAnyAttribute) addAnyAttributeWildcard(out);
	if (attributes.length) out.attributes = attributes;
	return out;
}

export function parseComplexType(node: OrderedNode, ctx: ComplexTypeContext): IRType {
	const doc = getDocumentation(node);
	const mixed = getAttr(node, 'mixed') === 'true';
	const abstract = getAttr(node, 'abstract') === 'true';
	const simpleContent = findChild(node, 'simpleContent');
	const complexContent = findChild(node, 'complexContent');

	let result: IRObject;

	if (complexContent) {
		const { body, baseRef, kind } = parseComplexContent(complexContent, ctx);
		result = body;
		if (baseRef) {
			result.extends = { kind, baseRef: stripPrefix(baseRef) };
		}
	} else if (simpleContent) {
		result = parseSimpleContent(simpleContent, ctx);
	} else {
		result = parseModelBlock(node, ctx);
		const { attributes, hasAnyAttribute } = collectAttributes(node, ctx);
		if (hasAnyAttribute) addAnyAttributeWildcard(result);
		if (attributes.length) result.attributes = attributes;
	}

	if (mixed) result.mixed = true;
	if (abstract) result.abstract = true;
	if (doc !== undefined) result.doc = doc;
	return result;
}
