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

import { runCompile } from '../src/cli/compile';

const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('runCompile dependency discovery', () => {
	it('resolves transitive URL imports stored in nested schema directories', async () => {
		const root = makeTempDir();
		const schemas = join(root, 'schemas');
		const shared = join(schemas, 'bazowe');
		const nested = join(shared, 'typy');
		const output = join(root, 'generated');
		mkdirSync(nested, { recursive: true });

		writeFileSync(
			join(schemas, 'fa3.xsd'),
			`<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:base="urn:base" targetNamespace="urn:fa3">
  <xs:import namespace="urn:base" schemaLocation="https://example.gov.pl/ksef/SharedTypes.xsd"/>
  <xs:element name="Faktura" type="base:FakturaType"/>
</xs:schema>`,
		);
		writeFileSync(
			join(shared, 'SharedTypes.xsd'),
			`<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:nip="urn:nip" targetNamespace="urn:base">
  <xs:import namespace="urn:nip" schemaLocation="https://example.gov.pl/ksef/NipTypes.xsd"/>
  <xs:complexType name="FakturaType">
    <xs:sequence><xs:element name="NIP" type="nip:TNip"/></xs:sequence>
  </xs:complexType>
</xs:schema>`,
		);
		writeFileSync(
			join(nested, 'NipTypes.xsd'),
			`<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:nip">
  <xs:simpleType name="TNip">
    <xs:restriction base="xs:string">
      <xs:length value="10"/>
      <xs:pattern value="[0-9]{10}"/>
    </xs:restriction>
  </xs:simpleType>
</xs:schema>`,
		);

		await runCompile([join(schemas, 'fa3.xsd')], { outDir: output, silent: true });

		const generatedPath = join(output, 'fa3.ts');
		expect(existsSync(generatedPath)).toBe(true);
		const generated = readFileSync(generatedPath, 'utf-8');
		expect(generated).toContain('export const Faktura');
		expect(generated).toContain('.min(10).max(10)');
		expect(generated).toContain('[0-9]{10}');
	});

	it('fails before writing output when dependency basenames are ambiguous', async () => {
		const root = makeTempDir();
		const schemas = join(root, 'schemas');
		const output = join(root, 'generated');
		mkdirSync(join(schemas, 'one'), { recursive: true });
		mkdirSync(join(schemas, 'two'), { recursive: true });
		writeFileSync(
			join(schemas, 'entry.xsd'),
			'<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="Root" type="xs:string"/></xs:schema>',
		);
		writeFileSync(
			join(schemas, 'one', 'common.xsd'),
			'<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"/>',
		);
		writeFileSync(
			join(schemas, 'two', 'common.xsd'),
			'<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:annotation/></xs:schema>',
		);

		await expect(
			runCompile([join(schemas, 'entry.xsd')], { outDir: output, silent: true }),
		).rejects.toThrow('Ambiguous XSD import key "common.xsd"');
		expect(existsSync(output)).toBe(false);
	});
});

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), 'xsd2zod-'));
	tempDirs.push(dir);
	return dir;
}
