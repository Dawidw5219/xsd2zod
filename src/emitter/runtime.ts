import { z } from 'zod';

import type { IRObject, IRObjectField, IRSchema, IRType } from '../ir';
import { PATTERNS } from './patterns';
import { withDocRuntime } from './shared';

interface RuntimeContext {
	schema: IRSchema;
	cache: WeakMap<IRType, z.ZodTypeAny>;
	resolutionStack: Set<string>;
}

export function emitZodSchema(schema: IRSchema): z.ZodTypeAny {
	const ctx: RuntimeContext = {
		schema,
		cache: new WeakMap(),
		resolutionStack: new Set(),
	};
	return materialize(schema.root, ctx);
}

function materialize(t: IRType, ctx: RuntimeContext): z.ZodTypeAny {
	const cached = ctx.cache.get(t);
	if (cached) return cached;
	const result = build(t, ctx);
	ctx.cache.set(t, result);
	return result;
}

function build(t: IRType, ctx: RuntimeContext): z.ZodTypeAny {
	switch (t.kind) {
		case 'string': {
			let s: z.ZodString = z.string();
			const min = t.length ?? t.minLength;
			const max = t.length ?? t.maxLength;
			if (min !== undefined && min > 0) s = s.min(min);
			if (max !== undefined) s = s.max(max);
			for (const p of t.patterns ?? []) s = s.regex(new RegExp(p));
			return withDocRuntime(s, t.doc);
		}
		case 'number': {
			let n: z.ZodNumber = z.number();
			if (t.integer) n = n.int();
			if (t.min !== undefined) n = t.minExclusive ? n.gt(t.min) : n.min(t.min);
			if (t.max !== undefined) n = t.maxExclusive ? n.lt(t.max) : n.max(t.max);
			if (t.fractionDigits !== undefined && t.fractionDigits >= 0) {
				n = n.multipleOf(Math.pow(10, -t.fractionDigits));
			}
			return withDocRuntime(n, t.doc);
		}
		case 'boolean':
			return withDocRuntime(z.boolean(), t.doc);
		case 'date':
			return withDocRuntime(z.iso.date(), t.doc);
		case 'dateTime':
			return withDocRuntime(z.iso.datetime(), t.doc);
		case 'time':
			return withDocRuntime(z.iso.time(), t.doc);
		case 'duration':
			return withDocRuntime(z.string().regex(new RegExp(PATTERNS.duration)), t.doc);
		case 'gYear':
			return withDocRuntime(z.string().regex(new RegExp(PATTERNS.gYear)), t.doc);
		case 'gYearMonth':
			return withDocRuntime(z.string().regex(new RegExp(PATTERNS.gYearMonth)), t.doc);
		case 'gMonthDay':
			return withDocRuntime(z.string().regex(new RegExp(PATTERNS.gMonthDay)), t.doc);
		case 'gMonth':
			return withDocRuntime(z.string().regex(new RegExp(PATTERNS.gMonth)), t.doc);
		case 'gDay':
			return withDocRuntime(z.string().regex(new RegExp(PATTERNS.gDay)), t.doc);
		case 'binary': {
			let s: z.ZodString =
				t.encoding === 'hex'
					? z.string().regex(new RegExp(PATTERNS.hexBinary))
					: z.string().base64();
			const min = t.length ?? t.minLength;
			const max = t.length ?? t.maxLength;
			if (min !== undefined && min > 0) s = s.min(min);
			if (max !== undefined) s = s.max(max);
			return withDocRuntime(s, t.doc);
		}
		case 'anyURI': {
			let s: z.ZodString = z.string();
			const min = t.length ?? t.minLength;
			const max = t.length ?? t.maxLength;
			if (min !== undefined && min > 0) s = s.min(min);
			if (max !== undefined) s = s.max(max);
			for (const p of t.patterns ?? []) s = s.regex(new RegExp(p));
			return withDocRuntime(s, t.doc);
		}
		case 'qname':
			return withDocRuntime(z.string(), t.doc);
		case 'any': {
			// processContents="skip" → opt-out of validation entirely (z.any).
			// "lax"/"strict" → keep typed as unknown (no runtime element registry).
			const base: z.ZodTypeAny = t.processContents === 'skip' ? z.any() : z.unknown();
			return withDocRuntime(base, t.doc);
		}
		case 'enum': {
			if (t.values.length === 0) return z.never();
			const values = t.values.map((v) => v.value) as [string, ...string[]];
			return withDocRuntime(z.enum(values), t.doc);
		}
		case 'object':
			return buildObject(t, ctx);
		case 'array': {
			let arr: z.ZodArray<z.ZodTypeAny> = z.array(materialize(t.item, ctx));
			if (typeof t.minOccurs === 'number' && t.minOccurs > 0) arr = arr.min(t.minOccurs);
			if (typeof t.maxOccurs === 'number') arr = arr.max(t.maxOccurs);
			return withDocRuntime(arr, t.doc);
		}
		case 'list': {
			let arr: z.ZodArray<z.ZodTypeAny> = z.array(materialize(t.item, ctx));
			if (t.length !== undefined) arr = arr.length(t.length);
			else {
				if (t.minLength !== undefined) arr = arr.min(t.minLength);
				if (t.maxLength !== undefined) arr = arr.max(t.maxLength);
			}
			// xs:list lexical form: space-separated string → array.
			const wrapped = z.preprocess(
				(v) => (typeof v === 'string' ? v.trim().split(/\s+/) : v),
				arr,
			);
			return withDocRuntime(wrapped, t.doc);
		}
		case 'union': {
			if (t.variants.length === 0) return z.never();
			if (t.variants.length === 1) {
				const v = t.variants[0];
				return v ? materialize(v, ctx) : z.never();
			}
			const vs = t.variants.map((v) => materialize(v, ctx));
			const u = z.union(vs as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
			return withDocRuntime(u, t.doc);
		}
		case 'ref':
			return materializeRef(t.name, t.refKind, ctx);
	}
}

function buildObject(t: IRObject, ctx: RuntimeContext): z.ZodTypeAny {
	const shape: Record<string, z.ZodTypeAny> = {};

	for (const a of t.attributes ?? []) {
		if (a.type.kind === 'ref' && a.type.refKind === 'attributeGroup') continue;
		let inner = materialize(a.type, ctx);
		if (a.fixed !== undefined) inner = z.literal(a.fixed);
		if (a.default !== undefined) inner = inner.default(a.default);
		if (a.use !== 'required') inner = inner.optional();
		shape[`@${a.name}`] = inner;
	}

	for (const f of t.fields) {
		shape[f.name] = wrapField(f, ctx);
	}

	let obj: z.ZodTypeAny = z.object(shape);

	// xs:any → passthrough for unknown keys.
	if (t.anys && t.anys.length > 0) {
		obj = (obj as z.ZodObject<Record<string, z.ZodTypeAny>>).passthrough();
	}

	// xs:complexContent + xs:extension → z.intersection(base, ownFields).
	if (t.extends && t.extends.kind === 'extension') {
		const base = materializeRef(t.extends.baseRef, 'type', ctx);
		obj = z.intersection(base, obj);
	}

	for (const choiceField of t.choices ?? []) {
		obj = z.intersection(obj, materialize(choiceField.type, ctx));
	}

	for (const groupField of t.groupRefs ?? []) {
		if (groupField.type.kind === 'ref') {
			obj = z.intersection(obj, materializeRef(groupField.type.name, 'group', ctx));
		}
	}

	return withDocRuntime(obj, t.doc);
}

function wrapField(field: IRObjectField, ctx: RuntimeContext): z.ZodTypeAny {
	let inner = materialize(field.type, ctx);
	if (field.nillable) inner = z.union([inner, z.null()]);
	if (field.default !== undefined) inner = inner.default(field.default);
	if (!field.required) inner = inner.optional();
	return inner;
}

function materializeRef(
	name: string,
	refKind: 'type' | 'group' | 'attributeGroup' | 'element',
	ctx: RuntimeContext,
): z.ZodTypeAny {
	if (ctx.resolutionStack.has(name)) {
		return z.lazy(() => {
			const target = lookup(name, refKind, ctx);
			if (!target) return z.unknown();
			return materialize(target, ctx);
		});
	}
	ctx.resolutionStack.add(name);
	try {
		const target = lookup(name, refKind, ctx);
		if (!target) return z.unknown();
		return materialize(target, ctx);
	} finally {
		ctx.resolutionStack.delete(name);
	}
}

function lookup(
	name: string,
	refKind: 'type' | 'group' | 'attributeGroup' | 'element',
	ctx: RuntimeContext,
): IRType | undefined {
	if (refKind === 'group') return ctx.schema.groups[name]?.type;
	if (refKind === 'element') return ctx.schema.elements[name]?.type;
	if (refKind === 'attributeGroup') {
		const ag = ctx.schema.attributeGroups[name];
		if (!ag) return undefined;
		// Synthesize an object whose keys are attribute names prefixed with `@`.
		return {
			kind: 'object',
			fields: ag.attributes.map<IRObjectField>((a) => ({
				name: `@${a.name}`,
				type: a.type,
				required: a.use === 'required',
				minOccurs: a.use === 'required' ? 1 : 0,
				maxOccurs: 1,
			})),
		};
	}
	return ctx.schema.types[name];
}

