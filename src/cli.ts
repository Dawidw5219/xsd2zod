import { Command } from 'commander';

import { runBundle, type CliBundleOptions } from './cli/bundle';
import { runCompile, type CliCompileOptions } from './cli/compile';

const program = new Command();

program
	.name('xsd2zod')
	.description('Compile XSD (XML Schema) into Zod schemas');

program
	.argument('[inputs...]', 'XSD file(s) and/or directory(ies) to compile')
	.option('--outDir <dir>', 'output directory (default: next to each input)')
	.option('-o, --out <dir>', 'alias for --outDir')
	.option(
		'--include-libraries',
		'also emit .ts for library schemas (XSDs without a root element). Default: skip — their types are already inlined into the root schemas that import them.',
		false,
	)
	.option(
		'--allow-missing-imports',
		'silently skip xs:include / xs:import refs that cannot be resolved',
		false,
	)
	.option('--silent', 'suppress informational output', false)
	.action(async (inputs: string[], opts: CliCompileOptions) => {
		if (!inputs || inputs.length === 0) {
			program.help();
			return;
		}
		try {
			await runCompile(inputs, opts);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			// eslint-disable-next-line no-console
			console.error(msg);
			process.exit(1);
		}
	});

program
	.command('bundle <input>')
	.description(
		'Merge an entry XSD with all its xs:include / xs:import references ' +
			'into a single self-contained .xsd file',
	)
	.option(
		'--outFile <file>',
		'output file path (default: <input-stem>.bundled.xsd next to input)',
	)
	.option('--silent', 'suppress informational output', false)
	.action(async (input: string, opts: CliBundleOptions) => {
		try {
			await runBundle(input, opts);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			// eslint-disable-next-line no-console
			console.error(msg);
			process.exit(1);
		}
	});

program.parse();
