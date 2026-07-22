import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { runBundle } from '../src/cli/bundle';

const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('runBundle dependency discovery', () => {
	it('bundles URL imports stored in a nested regulator directory', async () => {
		const root = makeTempDir();
		const schemas = join(root, 'schemas');
		const shared = join(schemas, 'bazowe');
		const output = join(root, 'fa3.bundled.xsd');
		mkdirSync(shared, { recursive: true });
		writeFileSync(
			join(schemas, 'fa3.xsd'),
			`<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:base="urn:base" targetNamespace="urn:fa3">
  <xs:import namespace="urn:base" schemaLocation="https://example.gov.pl/ksef/SharedTypes.xsd"/>
  <xs:element name="Faktura" type="base:FakturaType"/>
</xs:schema>`,
		);
		writeFileSync(
			join(shared, 'SharedTypes.xsd'),
			`<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:base">
  <xs:complexType name="FakturaType"><xs:sequence><xs:element name="NIP" type="xs:string"/></xs:sequence></xs:complexType>
</xs:schema>`,
		);

		await runBundle(join(schemas, 'fa3.xsd'), { outFile: output, silent: true });

		expect(existsSync(output)).toBe(true);
		const bundled = readFileSync(output, 'utf-8');
		expect(bundled).not.toContain('<xs:import');
		expect(bundled).toContain('name="FakturaType"');
		expect(bundled).toContain('name="Faktura"');
	});
});

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), 'xsd2zod-bundle-'));
	tempDirs.push(dir);
	return dir;
}
