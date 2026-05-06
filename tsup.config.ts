import { defineConfig } from 'tsup';

export default defineConfig({
	entry: {
		cli: 'src/cli.ts',
	},
	format: ['esm'],
	dts: true,
	clean: true,
	splitting: false,
	sourcemap: false,
	target: 'node18',
	external: ['zod', 'fast-xml-parser', 'commander', 'chalk'],
	async onSuccess() {
		const fs = await import('node:fs');
		const cliPath = './dist/cli.js';
		if (fs.existsSync(cliPath)) {
			const content = fs.readFileSync(cliPath, 'utf-8');
			if (!content.startsWith('#!/usr/bin/env node')) {
				fs.writeFileSync(cliPath, `#!/usr/bin/env node\n${content}`);
				fs.chmodSync(cliPath, 0o755);
			}
		}
	},
});
