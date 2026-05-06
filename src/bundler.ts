// Bundle entry XSD + transitive xs:include / xs:import / xs:redefine into one
// self-contained file. Strategy: collect every top-level definition from
// dependency schemas, prepend them to the entry, strip directive elements,
// drop foreign xmlns:* declarations, and rewrite cross-namespace QName refs
// (XSD has no notion of "same name in two namespaces" within one file —
// everything coalesces into the entry's targetNamespace).

import { XMLBuilder, XMLParser } from 'fast-xml-parser';

import { loadAll } from './parser/loader';
import {
	getAttr,
	getChildren,
	getTagName,
	stripPrefix,
	type OrderedNode,
} from './parser/xml';

const parser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: '@_',
	allowBooleanAttributes: true,
	preserveOrder: true,
	trimValues: false,
	parseTagValue: false,
	parseAttributeValue: false,
});

const builder = new XMLBuilder({
	ignoreAttributes: false,
	attributeNamePrefix: '@_',
	preserveOrder: true,
	format: true,
	indentBy: '\t',
	suppressEmptyNode: true,
});

const TOP_LEVEL_DEFS = new Set([
	'simpleType',
	'complexType',
	'element',
	'group',
	'attributeGroup',
	'notation',
	'annotation',
]);

const SCHEMA_DIRECTIVES = new Set([
	'include',
	'import',
	'redefine',
	'override',
]);

export interface BundleOptions {
	filePath?: string;
	source?: string;
	imports?: Record<string, string>;
	indent?: string;
}

export function bundleXsd(opts: BundleOptions): string {
	const schemas = loadAll({
		...(opts.filePath !== undefined ? { filePath: opts.filePath } : {}),
		...(opts.source !== undefined ? { source: opts.source } : {}),
		...(opts.imports !== undefined ? { imports: opts.imports } : {}),
	});
	const entry = schemas[0];
	if (!entry) throw new Error('No XSD schema loaded');

	const externalDefs: OrderedNode[] = [];
	for (let i = 1; i < schemas.length; i++) {
		const dep = schemas[i];
		if (!dep) continue;
		for (const child of getChildren(dep.root)) {
			if (TOP_LEVEL_DEFS.has(stripPrefix(getTagName(child)))) {
				externalDefs.push(child);
			}
		}
	}

	const entryTagName = getTagName(entry.root);
	const entryAttrs = entry.root[':@'] ?? {};
	const ownChildren = getChildren(entry.root).filter(
		(c) => !SCHEMA_DIRECTIVES.has(stripPrefix(getTagName(c))),
	);

	// Drop foreign `xmlns:*` declarations — only XSD spec namespace stays.
	const newAttrs: Record<string, string> = {};
	for (const [k, v] of Object.entries(entryAttrs)) {
		if (typeof v !== 'string') continue;
		if (k.startsWith('@_xmlns:')) {
			const prefix = k.slice('@_xmlns:'.length);
			if (prefix !== 'xs' && prefix !== 'xsd') continue;
		}
		newAttrs[k] = v;
	}

	const newSchema = {
		[entryTagName]: [...externalDefs, ...ownChildren],
		':@': newAttrs,
	} as unknown as OrderedNode;

	rewritePrefixes(newSchema);

	const xml = builder.build([newSchema]) as string;
	return '<?xml version="1.0" encoding="UTF-8"?>\n' + xml;
}

const REF_ATTRS = new Set([
	'@_type',
	'@_base',
	'@_ref',
	'@_substitutionGroup',
	'@_itemType',
	'@_refer',
]);

function rewritePrefixes(node: OrderedNode): void {
	const attrs = node[':@'];
	if (attrs) {
		for (const [k, v] of Object.entries(attrs)) {
			if (typeof v !== 'string') continue;
			if (REF_ATTRS.has(k)) {
				attrs[k] = stripUserPrefix(v);
			} else if (k === '@_memberTypes') {
				attrs[k] = v
					.split(/\s+/)
					.filter(Boolean)
					.map(stripUserPrefix)
					.join(' ');
			}
		}
	}
	for (const child of getChildren(node)) {
		rewritePrefixes(child);
	}
}

function stripUserPrefix(value: string): string {
	const idx = value.indexOf(':');
	if (idx < 0) return value;
	const prefix = value.slice(0, idx);
	// Preserve `xs:string` / `xsd:integer` — those reference built-in types.
	if (prefix === 'xs' || prefix === 'xsd') return value;
	return value.slice(idx + 1);
}

