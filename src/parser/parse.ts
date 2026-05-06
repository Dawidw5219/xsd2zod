import type {
	IRAttribute,
	IRAttributeGroup,
	IRGroup,
	IRObjectField,
	IRSchema,
	IRType,
} from '../ir';
import { Xsd2ZodError, UnresolvedReferenceError } from '../errors';
import {
	findChildren,
	getAttr,
	getChildren,
	getDocumentation,
	getTagName,
	stripPrefix,
	type OrderedNode,
} from './xml';
import { loadAll, type LoadOptions, type LoadedSchema } from './loader';
import { parseSimpleType } from './simple-type';
import {
	parseAttribute,
	parseComplexType,
	parseElement,
} from './complex-type';

export interface ParseOptions extends LoadOptions {
	rootElementName?: string;
}

export function parseXsd(opts: ParseOptions): IRSchema {
	const schemas = loadAll(opts);
	const entry = schemas[0];
	if (!entry) {
		throw new Xsd2ZodError('empty_schema_set', 'No XSD schema loaded');
	}

	const types: Record<string, IRType> = {};
	const elements: Record<string, IRObjectField> = {};
	const groups: Record<string, IRGroup> = {};
	const attributeGroups: Record<string, IRAttributeGroup> = {};

	for (const schema of schemas) {
		registerGlobals(schema, { knownTypes: types, file: schema.path }, {
			types,
			elements,
			groups,
			attributeGroups,
		});
	}

	// Library schemas (no global xs:element) get rootName="" — emitter skips
	// the root export but still emits every named type.
	const entryGlobals = findChildren(entry.root, 'element').map((n) => ({
		name: getAttr(n, 'name'),
		node: n,
	}));
	let rootName = '';
	let rootType: IRType = { kind: 'object', fields: [] };
	if (opts.rootElementName) {
		const rootHit = entryGlobals.find((e) => e.name === opts.rootElementName);
		if (!rootHit?.name || !rootHit.node) {
			throw new UnresolvedReferenceError('element', opts.rootElementName, {
				file: entry.path,
			});
		}
		const rootField = elements[rootHit.name];
		if (!rootField) {
			throw new UnresolvedReferenceError('element', rootHit.name, { file: entry.path });
		}
		rootName = rootHit.name;
		rootType = rootField.type;
	} else if (entryGlobals[0]?.name) {
		const first = entryGlobals[0];
		const rootField = first.name ? elements[first.name] : undefined;
		if (rootField && first.name) {
			rootName = first.name;
			rootType = rootField.type;
		}
	}

	const result: IRSchema = {
		types,
		elements,
		groups,
		attributeGroups,
		rootName,
		root: rootType,
	};
	if (entry.targetNamespace !== undefined) result.targetNamespace = entry.targetNamespace;
	if (entry.elementFormDefault !== undefined) result.elementFormDefault = entry.elementFormDefault;
	if (entry.attributeFormDefault !== undefined) {
		result.attributeFormDefault = entry.attributeFormDefault;
	}
	return result;
}

function registerGlobals(
	schema: LoadedSchema,
	ctx: { knownTypes: Record<string, IRType>; file: string },
	out: {
		types: Record<string, IRType>;
		elements: Record<string, IRObjectField>;
		groups: Record<string, IRGroup>;
		attributeGroups: Record<string, IRAttributeGroup>;
	},
): void {
	for (const child of getChildren(schema.root)) {
		const tag = stripPrefix(getTagName(child));
		switch (tag) {
			case 'simpleType': {
				const name = getAttr(child, 'name');
				if (!name) break;
				const t = parseSimpleType(child, ctx);
				out.types[name] = t;
				break;
			}
			case 'complexType': {
				const name = getAttr(child, 'name');
				if (!name) break;
				const t = parseComplexType(child, ctx);
				out.types[name] = t;
				break;
			}
			case 'element': {
				const name = getAttr(child, 'name');
				if (!name) break;
				const field = parseElement(child, ctx);
				out.elements[name] = field;
				break;
			}
			case 'group': {
				const name = getAttr(child, 'name');
				if (!name) break;
				const sequence = getChildren(child).find((c) => stripPrefix(getTagName(c)) === 'sequence');
				const choice = getChildren(child).find((c) => stripPrefix(getTagName(c)) === 'choice');
				const all = getChildren(child).find((c) => stripPrefix(getTagName(c)) === 'all');
				const inner = sequence ?? choice ?? all;
				if (!inner) break;
				const synth: OrderedNode = { complexType: [inner] };
				const t = parseComplexType(synth, ctx);
				const gr: IRGroup = { name, type: t };
				const doc = getDocumentation(child);
				if (doc !== undefined) gr.doc = doc;
				out.groups[name] = gr;
				out.types[name] = t;
				break;
			}
			case 'attributeGroup': {
				const name = getAttr(child, 'name');
				if (!name) break;
				const attrs: IRAttribute[] = [];
				for (const c of findChildren(child, 'attribute')) {
					const a = parseAttribute(c, ctx);
					if (a) attrs.push(a);
				}
				const ag: IRAttributeGroup = { name, attributes: attrs };
				const doc = getDocumentation(child);
				if (doc !== undefined) ag.doc = doc;
				out.attributeGroups[name] = ag;
				break;
			}
			case 'notation':
				// xs:notation is a DTD-era binding of non-XML data formats to a name.
				// It declares no element/type and has no validation impact on parsed
				// XML data — accept and ignore.
				break;
		}
	}
}

