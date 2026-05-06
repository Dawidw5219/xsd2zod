import type { IRType, IREnumValue } from '../ir';
import { Xsd2ZodError } from '../errors';
import { builtinFor, cloneType } from './builtin-types';
import {
	findChild,
	findChildren,
	getAttr,
	getDocumentation,
	stripPrefix,
	type OrderedNode,
} from './xml';

export interface SimpleTypeContext {
	file?: string;
	knownTypes: Record<string, IRType>;
}

interface RestrictionFacets {
	base?: string;
	length?: number;
	minLength?: number;
	maxLength?: number;
	patterns: string[];
	whiteSpace?: 'preserve' | 'replace' | 'collapse';
	enumeration: IREnumValue[];
	totalDigits?: number;
	fractionDigits?: number;
	minInclusive?: string;
	maxInclusive?: string;
	minExclusive?: string;
	maxExclusive?: string;
	explicitTimezone?: 'optional' | 'required' | 'prohibited';
}

const numAttr = (n: OrderedNode | undefined): number | undefined => {
	if (!n) return undefined;
	const v = getAttr(n, 'value');
	return v === undefined ? undefined : Number(v);
};

const strAttr = (n: OrderedNode | undefined): string | undefined => {
	if (!n) return undefined;
	return getAttr(n, 'value');
};

function parseFacets(restriction: OrderedNode): RestrictionFacets {
	const facets: RestrictionFacets = {
		base: getAttr(restriction, 'base'),
		patterns: [],
		enumeration: [],
	};
	for (const c of findChildren(restriction, 'length')) facets.length = numAttr(c);
	for (const c of findChildren(restriction, 'minLength')) facets.minLength = numAttr(c);
	for (const c of findChildren(restriction, 'maxLength')) facets.maxLength = numAttr(c);
	for (const c of findChildren(restriction, 'pattern')) {
		const v = strAttr(c);
		if (v !== undefined) facets.patterns.push(v);
	}
	for (const c of findChildren(restriction, 'whiteSpace')) {
		const v = strAttr(c);
		if (v === 'preserve' || v === 'replace' || v === 'collapse') facets.whiteSpace = v;
	}
	for (const c of findChildren(restriction, 'enumeration')) {
		const value = getAttr(c, 'value');
		if (value === undefined) continue;
		facets.enumeration.push({ value, doc: getDocumentation(c) });
	}
	for (const c of findChildren(restriction, 'totalDigits')) facets.totalDigits = numAttr(c);
	for (const c of findChildren(restriction, 'fractionDigits')) facets.fractionDigits = numAttr(c);
	facets.minInclusive = strAttr(findChild(restriction, 'minInclusive'));
	facets.maxInclusive = strAttr(findChild(restriction, 'maxInclusive'));
	facets.minExclusive = strAttr(findChild(restriction, 'minExclusive'));
	facets.maxExclusive = strAttr(findChild(restriction, 'maxExclusive'));
	const tz = strAttr(findChild(restriction, 'explicitTimezone'));
	if (tz === 'optional' || tz === 'required' || tz === 'prohibited') {
		facets.explicitTimezone = tz;
	}
	return facets;
}

function applyFacets(base: IRType, facets: RestrictionFacets, doc: string | undefined): IRType {
	const out = cloneType(base);
	out.doc = doc ?? out.doc;

	switch (out.kind) {
		case 'string': {
			if (facets.length !== undefined) {
				out.length = facets.length;
				out.minLength = facets.length;
				out.maxLength = facets.length;
			}
			if (facets.minLength !== undefined) out.minLength = facets.minLength;
			if (facets.maxLength !== undefined) out.maxLength = facets.maxLength;
			if (facets.patterns.length > 0) {
				out.patterns = [...(out.patterns ?? []), ...facets.patterns];
			}
			if (facets.whiteSpace) out.whiteSpace = facets.whiteSpace;
			break;
		}
		case 'number': {
			const min =
				facets.minInclusive !== undefined
					? Number(facets.minInclusive)
					: facets.minExclusive !== undefined
						? Number(facets.minExclusive)
						: undefined;
			const max =
				facets.maxInclusive !== undefined
					? Number(facets.maxInclusive)
					: facets.maxExclusive !== undefined
						? Number(facets.maxExclusive)
						: undefined;
			if (min !== undefined && Number.isFinite(min)) out.min = min;
			if (max !== undefined && Number.isFinite(max)) out.max = max;
			if (facets.minExclusive !== undefined) out.minExclusive = true;
			if (facets.maxExclusive !== undefined) out.maxExclusive = true;
			if (facets.totalDigits !== undefined) out.totalDigits = facets.totalDigits;
			if (facets.fractionDigits !== undefined) out.fractionDigits = facets.fractionDigits;
			if (facets.patterns.length > 0) {
				out.patterns = [...(out.patterns ?? []), ...facets.patterns];
			}
			break;
		}
		case 'date':
		case 'dateTime': {
			if (facets.minInclusive !== undefined) out.min = facets.minInclusive;
			if (facets.maxInclusive !== undefined) out.max = facets.maxInclusive;
			if (facets.patterns.length > 0) {
				out.patterns = [...(out.patterns ?? []), ...facets.patterns];
			}
			if (facets.explicitTimezone) out.explicitTimezone = facets.explicitTimezone;
			break;
		}
		case 'gYear': {
			if (facets.minInclusive !== undefined) out.min = Number(facets.minInclusive);
			if (facets.maxInclusive !== undefined) out.max = Number(facets.maxInclusive);
			break;
		}
		case 'binary':
		case 'anyURI': {
			if (facets.length !== undefined) out.length = facets.length;
			if (facets.minLength !== undefined) out.minLength = facets.minLength;
			if (facets.maxLength !== undefined) out.maxLength = facets.maxLength;
			break;
		}
		default:
			break;
	}
	return out;
}

// Resolve `base="ns:Name"` / `type="..."` → builtin / known type / forward ref.
export function resolveTypeRef(ref: string, ctx: SimpleTypeContext): IRType {
	const local = stripPrefix(ref);
	const builtin = builtinFor(local);
	if (builtin) return builtin;
	const known = ctx.knownTypes[local];
	if (known) return cloneType(known);
	return { kind: 'ref', name: local, refKind: 'type' };
}

export function parseSimpleType(node: OrderedNode, ctx: SimpleTypeContext): IRType {
	const doc = getDocumentation(node);
	const restriction = findChild(node, 'restriction');
	const list = findChild(node, 'list');
	const union = findChild(node, 'union');

	if (list) {
		const itemType = getAttr(list, 'itemType');
		let item: IRType;
		if (itemType) {
			item = resolveTypeRef(itemType, ctx);
		} else {
			const inner = findChild(list, 'simpleType');
			if (!inner) {
				throw new Xsd2ZodError(
					'invalid_simple_type',
					'xs:list must have an itemType attribute or an inline xs:simpleType',
					{ file: ctx.file, construct: 'xs:list', specSection: 'Part 2 §4.2' },
				);
			}
			item = parseSimpleType(inner, ctx);
		}
		return { kind: 'list', item, doc };
	}

	if (union) {
		const memberTypes = getAttr(union, 'memberTypes');
		const variants: IRType[] = [];
		if (memberTypes) {
			for (const m of memberTypes.split(/\s+/).filter(Boolean)) {
				variants.push(resolveTypeRef(m, ctx));
			}
		}
		for (const inner of findChildren(union, 'simpleType')) {
			variants.push(parseSimpleType(inner, ctx));
		}
		return { kind: 'union', variants, doc };
	}

	if (!restriction) {
		throw new Xsd2ZodError(
			'invalid_simple_type',
			'xs:simpleType must contain xs:restriction, xs:list, or xs:union',
			{ file: ctx.file, construct: 'xs:simpleType', specSection: 'Part 1 §3.1' },
		);
	}

	const facets = parseFacets(restriction);

	let base: IRType;
	if (facets.base) {
		base = resolveTypeRef(facets.base, ctx);
	} else {
		const inner = findChild(restriction, 'simpleType');
		if (!inner) {
			throw new Xsd2ZodError(
				'invalid_restriction',
				'xs:restriction must have a base attribute or inline xs:simpleType',
				{ file: ctx.file, construct: 'xs:restriction', specSection: 'Part 1 §3.6' },
			);
		}
		base = parseSimpleType(inner, ctx);
	}

	// xs:enumeration → z.enum (collapses any base type into a string-like enum).
	if (facets.enumeration.length > 0) {
		return {
			kind: 'enum',
			baseKind: enumBaseKind(base),
			values: facets.enumeration,
			doc,
		};
	}

	return applyFacets(base, facets, doc);
}

function enumBaseKind(t: IRType): 'string' | 'number' | 'boolean' | 'date' | 'dateTime' {
	switch (t.kind) {
		case 'number':
			return 'number';
		case 'boolean':
			return 'boolean';
		case 'date':
			return 'date';
		case 'dateTime':
			return 'dateTime';
		default:
			return 'string';
	}
}
