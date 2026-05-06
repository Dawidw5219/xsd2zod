import { z } from 'zod';

import { parseXsd } from './parser/parse';
import { emitZodSource } from './emitter/source';
import { emitZodSchema } from './emitter/runtime';
import type { IRSchema } from './ir';

export interface CompileOptions {
	filePath?: string;
	source?: string;
	imports?: Record<string, string>;
	rootElementName?: string;
	exportName?: string;
	allowMissingImports?: boolean;
}

export interface CompileResult {
	ir: IRSchema;
	source: string;
	schema: z.ZodTypeAny;
}

export function xsdToZod(opts: CompileOptions): CompileResult {
	const ir = parseXsd(opts);
	const source = emitZodSource(ir, { exportName: opts.exportName });
	const schema = emitZodSchema(ir);
	return { ir, source, schema };
}
