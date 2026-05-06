import type { z } from 'zod';

const RESERVED = new Set([
	'default',
	'class',
	'function',
	'const',
	'let',
	'var',
	'return',
	'export',
	'import',
	'package',
	'private',
	'public',
	'protected',
	'enum',
	'extends',
	'implements',
	'interface',
	'new',
	'null',
	'super',
	'this',
	'true',
	'false',
	'typeof',
	'void',
	'yield',
]);

export function safeIdent(name: string): string {
	const cleaned = name.replace(/[^A-Za-z0-9_$]/g, '_');
	if (RESERVED.has(cleaned)) return `${cleaned}_`;
	if (/^[0-9]/.test(cleaned)) return `_${cleaned}`;
	return cleaned;
}

/** Convention for emitted constants for named types: just the safe name. */
export function typeIdent(name: string): string {
	return safeIdent(name);
}

/** Convention for emitted constants for groups: `Group_<Name>` (avoids collision with types). */
export function groupIdent(name: string): string {
	return `Group_${safeIdent(name)}`;
}

/** Convention for emitted constants for attribute groups: `AttrGroup_<Name>`. */
export function attrGroupIdent(name: string): string {
	return `AttrGroup_${safeIdent(name)}`;
}

/** JSON-stringify a string value safely for embedding in TS source. */
export function jsString(s: string): string {
	return JSON.stringify(s);
}

/** Attach `.describe(doc)` to a runtime Zod schema if doc is present. */
export function withDocRuntime<T extends z.ZodTypeAny>(s: T, doc: string | undefined): T {
	return (doc ? s.describe(doc) : s) as T;
}

/** Append `.describe("...")` to an emitted source-string expression. */
export function withDocSource(expr: string, doc: string | undefined): string {
	return doc ? `${expr}.describe(${jsString(doc)})` : expr;
}

/** Indent a multi-line block of source code by N tabs. */
export function indent(src: string, level: number): string {
	const pad = '\t'.repeat(level);
	return src
		.split('\n')
		.map((line) => (line.length ? pad + line : line))
		.join('\n');
}

