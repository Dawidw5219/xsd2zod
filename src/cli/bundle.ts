import { writeFileSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import chalk from 'chalk';

import { bundleXsd } from '../bundler';
import { buildImportsMap } from './imports';

export interface CliBundleOptions {
	outFile?: string;
	silent?: boolean;
}

export async function runBundle(
	input: string,
	opts: CliBundleOptions,
): Promise<void> {
	const absPath = resolve(input);
	let stat;
	try {
		stat = statSync(absPath);
	} catch {
		throw new Error(`Input does not exist: ${input}`);
	}
	if (!stat.isFile() || !absPath.endsWith('.xsd')) {
		throw new Error(`Bundle input must be a single .xsd file: ${input}`);
	}

	const bundled = bundleXsd({
		filePath: absPath,
		imports: buildImportsMap([dirname(absPath)]),
	});

	const outFile = opts.outFile
		? resolve(opts.outFile)
		: join(dirname(absPath), `${basename(absPath, '.xsd')}.bundled.xsd`);
	writeFileSync(outFile, bundled);

	if (!opts.silent) {
		const sizeKb = (bundled.length / 1024).toFixed(1);
		// eslint-disable-next-line no-console
		console.log(
			`${chalk.green('✓')} bundled ${chalk.dim(absPath)}\n  → ${outFile} ${chalk.gray(`(${sizeKb} KB)`)}`,
		);
	}
}
