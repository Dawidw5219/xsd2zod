import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { XMLParser } from 'fast-xml-parser';

import {
	findChildren,
	getAttr,
	getTagName,
	stripPrefix,
	type OrderedNode,
} from './xml';

const XML_OPTIONS = {
	ignoreAttributes: false,
	attributeNamePrefix: '@_',
	allowBooleanAttributes: true,
	preserveOrder: true,
	trimValues: true,
	parseTagValue: false,
	parseAttributeValue: false,
} as const;

const xmlParser = new XMLParser(XML_OPTIONS);

// fast-xml-parser chokes on DTD parameter entities (`<!ENTITY % p ''>`) used
// by W3C-authored XSDs (xmldsig, xenc). The DTD frame has no semantic meaning
// for our purposes, so we drop the whole `<!DOCTYPE … [ … ]>` block.
function stripDoctype(source: string): string {
	const start = source.indexOf('<!DOCTYPE');
	if (start === -1) return source;
	let depth = 0;
	let i = start + '<!DOCTYPE'.length;
	while (i < source.length) {
		const c = source[i];
		if (c === '[') depth++;
		else if (c === ']') depth--;
		else if (c === '>' && depth === 0) {
			return source.slice(0, start) + source.slice(i + 1);
		}
		i++;
	}
	return source;
}

export interface LoadedSchema {
	path: string;
	root: OrderedNode;
	targetNamespace: string | undefined;
	elementFormDefault: 'qualified' | 'unqualified' | undefined;
	attributeFormDefault: 'qualified' | 'unqualified' | undefined;
}

export interface LoadOptions {
	filePath?: string;
	source?: string;
	imports?: Record<string, string>;
	allowMissingImports?: boolean;
}

// Convert `StrukturyDanych_v10-0E.xsd` → `struktury-danych.xsd` so URL-style
// schemaLocations match locally-named files saved with our convention.
function kebabize(base: string): string {
	const stem = base.replace(/_v\d+-\d+E?\.xsd$/i, '').replace(/\.xsd$/i, '');
	const parts: string[] = [];
	let cur = '';
	for (const ch of stem) {
		if (/[A-Z]/.test(ch) && cur && /[a-z]/.test(cur[cur.length - 1] ?? '')) {
			parts.push(cur);
			cur = ch;
		} else {
			cur += ch;
		}
	}
	if (cur) parts.push(cur);
	return parts.map((p) => p.toLowerCase()).join('-') + '.xsd';
}

function resolveSchemaLocation(
	loc: string,
	baseDir: string,
	imports: Record<string, string>,
): { key: string; source: string; dir: string } | undefined {
	const base = basename(loc);
	const candidates = [loc, base, kebabize(base), base.toLowerCase()];

	for (const c of candidates) {
		if (imports[c] !== undefined) {
			return { key: c, source: imports[c]!, dir: baseDir };
		}
	}

	for (const c of candidates) {
		const full = join(baseDir, c);
		try {
			return { key: full, source: readFileSync(full, 'utf-8'), dir: dirname(full) };
		} catch {
			// not found at this candidate, try the next
		}
	}

	return undefined;
}

export function loadAll(opts: LoadOptions): LoadedSchema[] {
	const imports = opts.imports ?? {};
	const out: LoadedSchema[] = [];
	const visited = new Set<string>();

	const sourceMap: Record<string, string> = { ...imports };
	if (opts.source && !opts.filePath) {
		sourceMap['__entry__.xsd'] = opts.source;
	}

	const visit = (key: string, source: string, baseDir: string): void => {
		if (visited.has(key)) return;
		visited.add(key);
		const tree = xmlParser.parse(stripDoctype(source)) as OrderedNode[];
		const schemaNode = tree.find((n) => stripPrefix(getTagName(n)) === 'schema');
		if (!schemaNode) {
			throw new Error(`No xs:schema element found in ${key}`);
		}
		const targetNamespace = getAttr(schemaNode, 'targetNamespace');
		const elementFormDefault = getAttr(schemaNode, 'elementFormDefault') as
			| 'qualified'
			| 'unqualified'
			| undefined;
		const attributeFormDefault = getAttr(schemaNode, 'attributeFormDefault') as
			| 'qualified'
			| 'unqualified'
			| undefined;
		out.push({
			path: key,
			root: schemaNode,
			targetNamespace,
			elementFormDefault,
			attributeFormDefault,
		});

		// xs:include / xs:import / xs:redefine / xs:override resolve transitively.
		const directiveTags = ['include', 'import', 'redefine', 'override'] as const;
		for (const tag of directiveTags) {
			for (const d of findChildren(schemaNode, tag)) {
				const loc = getAttr(d, 'schemaLocation');
				// xs:import without schemaLocation is spec-legal (host already knows the namespace).
				if (!loc) continue;

				const resolved = resolveSchemaLocation(loc, baseDir, sourceMap);
				if (resolved) {
					visit(resolved.key, resolved.source, resolved.dir);
				} else if (!opts.allowMissingImports) {
					throw new Error(
						`Cannot resolve xs:${tag} schemaLocation="${loc}" referenced from "${key}". ` +
							`Place the file at "${join(baseDir, basename(loc))}" or pass it via the ` +
							`\`imports\` option (keyed by "${basename(loc)}" or by the full URL). ` +
							`Pass \`allowMissingImports: true\` to skip silently — types from the ` +
							`missing schema will resolve to z.unknown().`,
					);
				}
			}
		}
	};

	if (opts.filePath) {
		const entrySource = readFileSync(opts.filePath, 'utf-8');
		visit(opts.filePath, entrySource, dirname(opts.filePath));
	} else if (opts.source) {
		visit('__entry__.xsd', opts.source, '.');
	} else {
		throw new Error('loadAll requires either filePath or source');
	}

	return out;
}
