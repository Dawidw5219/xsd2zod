import { readFileSync, readdirSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';

// Dependencies published by regulators are commonly kept in nested folders
// while schemaLocation still points at an absolute URL. Index the whole local
// schema tree so URL imports can resolve by basename without network access.
export function buildImportsMap(baseDirs: string[]): Record<string, string> {
	const seenDirs = new Set<string>();
	const imports: Record<string, string> = {};
	for (const baseDir of baseDirs) {
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
