import {
	mkdirSync,
	readFileSync,
	readdirSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

import chalk from 'chalk';

import { xsdToZod } from '../compile';

export interface CliCompileOptions {
	outDir?: string;
	out?: string;
	includeLibraries?: boolean;
	allowMissingImports?: boolean;
	silent?: boolean;
}

interface InputFile {
	absPath: string;
	baseDir: string;
}

function collectInputs(inputs: string[]): InputFile[] {
	const out: InputFile[] = [];
	for (const input of inputs) {
		const abs = resolve(input);
		let stat;
		try {
			stat = statSync(abs);
		} catch {
			throw new Error(`Path does not exist: ${input}`);
		}
		if (stat.isDirectory()) {
			const files = readdirSync(abs).filter((f) => f.endsWith('.xsd'));
			if (files.length === 0) {
				throw new Error(`No .xsd files found in directory: ${input}`);
			}
			for (const f of files) {
				out.push({ absPath: join(abs, f), baseDir: abs });
			}
		} else if (abs.endsWith('.xsd')) {
			out.push({ absPath: abs, baseDir: dirname(abs) });
		} else {
			throw new Error(`Not an .xsd file or directory: ${input}`);
		}
	}
	return out;
}

// Dependencies published by regulators are commonly kept in nested folders
// while schemaLocation still points at an absolute URL. Index the whole local
// schema tree so URL imports can resolve by basename without network access.
function buildImportsMap(files: InputFile[]): Record<string, string> {
	const seenDirs = new Set<string>();
	const imports: Record<string, string> = {};
	for (const { baseDir } of files) {
		if (seenDirs.has(baseDir)) continue;
		seenDirs.add(baseDir);
		for (const absPath of collectDependencyFiles(baseDir)) {
			const source = readFileSync(absPath, 'utf-8');
			const relativePath = relative(baseDir, absPath).split(sep).join('/');
			registerImport(imports, relativePath, source, absPath);
			registerImport(imports, absPath, source, absPath);
			registerImport(imports, basename(absPath), source, absPath);
		}
	}
	return imports;
}

function collectDependencyFiles(rootDir: string): string[] {
	const files: string[] = [];
	const visit = (dir: string): void => {
		const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
			a.name.localeCompare(b.name),
		);
		for (const entry of entries) {
			const absPath = join(dir, entry.name);
			if (
				entry.isDirectory() &&
				entry.name !== 'node_modules' &&
				!entry.name.startsWith('.')
			) {
				visit(absPath);
			} else if (entry.isFile() && entry.name.endsWith('.xsd')) {
				files.push(absPath);
			}
		}
	};
	visit(rootDir);
	return files;
}

function registerImport(
	imports: Record<string, string>,
	key: string,
	source: string,
	absPath: string,
): void {
	const existing = imports[key];
	if (existing !== undefined && existing !== source) {
		throw new Error(
			`Ambiguous XSD import key "${key}" while indexing "${absPath}". ` +
				'Use unique dependency filenames or compile each schema family in a separate invocation.',
		);
	}
	imports[key] = source;
}

interface PlannedWrite {
	absPath: string;
	outFile: string;
	source: string;
	rootName: string;
	typesCount: number;
	sizeKb: number;
}

export async function runCompile(
	inputs: string[],
	opts: CliCompileOptions,
): Promise<void> {
	const files = collectInputs(inputs);
	const imports = buildImportsMap(files);
	const outDirOpt = opts.outDir ?? opts.out;

	if (!opts.silent) {
		// eslint-disable-next-line no-console
		console.log(chalk.bold(`xsd2zod`) + chalk.gray(`  ·  scanning ${files.length} XSD(s)`));
	}

	// All-or-nothing: compile every input in memory first; abort the whole
	// run BEFORE touching disk if any throws.
	const planned: PlannedWrite[] = [];
	const skipped: string[] = [];

	for (const { absPath, baseDir } of files) {
		const stem = basename(absPath, '.xsd');
		const outDir = outDirOpt ? resolve(outDirOpt) : baseDir;

		const result = xsdToZod({
			filePath: absPath,
			imports,
			allowMissingImports: opts.allowMissingImports ?? false,
		});

		if (!result.ir.rootName && !opts.includeLibraries) {
			skipped.push(absPath);
			continue;
		}

		planned.push({
			absPath,
			outFile: join(outDir, `${stem}.ts`),
			source: result.source,
			rootName: result.ir.rootName,
			typesCount: Object.keys(result.ir.types).length,
			sizeKb: result.source.length / 1024,
		});
	}

	let totalKb = 0;
	for (const item of planned) {
		mkdirSync(dirname(item.outFile), { recursive: true });
		writeFileSync(item.outFile, item.source);
		totalKb += item.sizeKb;

		if (!opts.silent) {
			const kind = item.rootName
				? chalk.cyan(`root: ${item.rootName}`)
				: chalk.gray('library');
			// eslint-disable-next-line no-console
			console.log(
				`  ${chalk.green('✓')} ${chalk.dim(item.absPath)}\n` +
					`    → ${item.outFile}\n` +
					`    ${chalk.gray(`${item.sizeKb.toFixed(1)} KB · ${item.typesCount} types · ${kind}`)}`,
			);
		}
	}

	if (!opts.silent) {
		for (const path of skipped) {
			// eslint-disable-next-line no-console
			console.log(
				`  ${chalk.gray('·')} ${chalk.dim(path)} ${chalk.gray('(library — types inlined into root, skipped)')}`,
			);
		}
		// eslint-disable-next-line no-console
		console.log(
			chalk.gray(
				`\n${planned.length} file(s) emitted · ${totalKb.toFixed(1)} KB total` +
					(skipped.length ? ` · ${skipped.length} library schema(s) skipped` : ''),
			),
		);
	}
}
