# xsd2zod

[![npm version](https://img.shields.io/npm/v/xsd2zod.svg?color=cb3837&logo=npm)](https://www.npmjs.com/package/xsd2zod)
[![license](https://img.shields.io/npm/l/xsd2zod.svg?color=blue)](./LICENSE)

Compile XSD (XML Schema) into [Zod](https://zod.dev) schemas. CLI tool — one
`.xsd` in, one `.ts` out.

```bash
npx xsd2zod schema.xsd
# → schema.ts (next to source, with all types as Zod schemas)
```

## Why

Industry XML schemas are everywhere — SEPA, HL7, ISO20022, FpML, e-invoice
formats, SOAP WSDL — and they ship as `.xsd`. To use them safely in TypeScript
you need runtime validation that mirrors the schema, and hand-translating
hundreds of types every time the spec gets republished isn't realistic.

xsd2zod compiles XSD straight into **declarative Zod** — `z.string()`,
`z.number().int().min(0)`, `z.enum([...])`, `z.object({...}).describe('...')`.
No `refine()`, no escape hatches. Annotations from `xs:documentation` become
`.describe()` calls, so IDE tooltips and downstream form generators get
human-readable labels for free.

## Install

```bash
# Global (recommended for CLI usage)
npm install -g xsd2zod

# Or use directly with npx (no install)
npx xsd2zod schema.xsd

# Or as a dev dependency for codegen scripts
pnpm add -D xsd2zod
```

The compiled output uses `zod` as a peer dependency — install it in your project:

```bash
pnpm add zod
```

## Usage

### Single file → `.ts` next to it

```bash
xsd2zod order.xsd
# → order.ts
```

### Whole folder

```bash
xsd2zod schemas/
# → schemas/<each>.ts
```

### Custom output directory

```bash
xsd2zod schemas/ --outDir generated/
# → generated/<each>.ts
```

### Multiple inputs sharing imports

```bash
xsd2zod schemas/order.xsd schemas/customer.xsd --outDir generated/
# → generated/order.ts, generated/customer.ts
# Both inputs share the same imports map — xs:import / xs:include resolve
# across the whole input set.
```

Dependency discovery is recursive. If a regulator ships `main.xsd` next to a
`bazowe/` or `common/` directory, compiling `main.xsd` is enough — nested
`xs:import`, `xs:include`, `xs:redefine`, and `xs:override` files are indexed
automatically, including URL-style `schemaLocation` values used by KSeF FA(3).

### Bundle multi-file XSD into a single self-contained `.xsd`

When your schema imports other schemas (e.g. official MF / EU / ISO standards
that live in separate files), bundle them into one before committing:

```bash
xsd2zod bundle main.xsd --outFile main.bundled.xsd
# main.bundled.xsd has all xs:include / xs:import inlined.
# No more dependency files to track.
```

Then compile the bundled schema like any single-file XSD:

```bash
xsd2zod main.bundled.xsd
```

## Options

```
xsd2zod <inputs...> [options]

  --outDir <dir>             output directory (default: next to each input)
  -o, --out <dir>            alias for --outDir
  --include-libraries        also emit .ts for library schemas (XSDs without
                             a root element). Default: skip — their types are
                             already inlined into the root schemas that
                             import them.
  --allow-missing-imports    silently skip xs:include / xs:import refs that
                             cannot be resolved (default: error out)
  --silent                   suppress informational output
  -h, --help                 show help

xsd2zod bundle <input> [options]

  --outFile <file>           output file (default: <stem>.bundled.xsd)
  --silent                   suppress informational output
```

## XSD → Zod at a glance

A condensed Rosetta Stone of what you get:

| XSD | Generated Zod |
|---|---|
| `<xs:element name="age" type="xs:int" minOccurs="0"/>` | `age: z.number().int().optional()` |
| `<xs:element name="name" type="xs:string" maxOccurs="unbounded"/>` | `name: z.array(z.string())` |
| `<xs:simpleType><xs:restriction base="xs:string"><xs:pattern value="[A-Z]{2}"/></xs:restriction></xs:simpleType>` | `z.string().regex(new RegExp("[A-Z]{2}"))` |
| `<xs:enumeration value="A"/><xs:enumeration value="B"/>` | `z.enum(["A", "B"])` |
| `<xs:totalDigits value="16"/><xs:fractionDigits value="2"/>` | `z.number().multipleOf(0.01)` (with bound) |
| `<xs:complexType><xs:sequence>…</xs:sequence></xs:complexType>` | `z.object({ … })` |
| `<xs:choice>…</xs:choice>` | `z.union([…])` |
| `<xs:extension base="Base">…</xs:extension>` | `z.intersection(Base, z.object({…}))` |
| `<xs:attribute name="id" type="xs:string"/>` | `'@id': z.string()` |
| `<xs:annotation><xs:documentation>Pierwsze imię</xs:documentation></xs:annotation>` | `.describe("Pierwsze imię")` |
| `<xs:nillable/>` | `z.union([T, z.null()])` |

### Full example with annotations

Given an XSD like:

```xml
<xs:simpleType name="TKwota2">
  <xs:annotation>
    <xs:documentation>Wartość kwotowa wykazana w zł i gr</xs:documentation>
  </xs:annotation>
  <xs:restriction base="xs:decimal">
    <xs:totalDigits value="16"/>
    <xs:fractionDigits value="2"/>
  </xs:restriction>
</xs:simpleType>
```

xsd2zod emits:

```ts
export const TKwota2 = z.lazy(() =>
  z.number().multipleOf(0.01).describe("Wartość kwotowa wykazana w zł i gr")
);
```

`xs:annotation/xs:documentation` becomes `.describe()` on every type and field
— one of the most useful properties of the conversion. Downstream form
generators get human-readable labels for free.

## Coverage

### Supported

Primitives (all 19): `string`, `boolean`, `decimal`, `float`, `double`,
`duration`, `dateTime`, `time`, `date`, `gYearMonth`, `gYear`, `gMonthDay`,
`gDay`, `gMonth`, `hexBinary`, `base64Binary`, `anyURI`, `QName`, `NOTATION`.

Derived datatypes (all 25): `normalizedString`, `token`, `language`, `Name`,
`NCName`, `ID`, `IDREF`, `IDREFS`, `ENTITY`, `ENTITIES`, `NMTOKEN`,
`NMTOKENS`, `integer`, `nonPositiveInteger`, `negativeInteger`, `long`, `int`,
`short`, `byte`, `nonNegativeInteger`, `unsignedLong`, `unsignedInt`,
`unsignedShort`, `unsignedByte`, `positiveInteger`.

Facets: `length`, `minLength`, `maxLength`, `pattern`, `enumeration`,
`whiteSpace`, `maxInclusive`, `maxExclusive`, `minInclusive`, `minExclusive`,
`totalDigits`, `fractionDigits`.

Structural:

- `xs:simpleType` with `xs:restriction` / `xs:list` / `xs:union`
- `xs:complexType` with `xs:sequence` / `xs:choice` / `xs:all`
- `xs:complexContent` with `xs:extension` / `xs:restriction`
- `xs:simpleContent`
- `xs:attribute`, `xs:attributeGroup`, `xs:group` (definition + reference)
- `xs:nillable`
- `xs:annotation` / `xs:documentation` → `.describe()`

Module composition:

- `xs:include` (same namespace) — inlined
- `xs:import` (cross namespace) — inlined
- `xs:redefine` — resolved at parse time

Wildcards & no-op constructs:

- `xs:any` — parent object emits as `z.object({...}).passthrough()` so unknown
  keys are preserved. `processContents="skip"` emits `z.any()` (no validation),
  `lax`/`strict` emit `z.unknown()`. Namespace constraints (`namespace="##other"`
  etc.) are parsed into the IR but not enforced at the JS-object layer —
  namespace info doesn't survive XML→JS flattening.
- `xs:notation` — DTD-era binding for non-XML data formats. Accepted without
  error, has no validation impact on parsed XML data.

### Not yet supported

- `xs:assert` — XSD 1.1 XPath assertion
- `xs:alternative` — XSD 1.1 conditional type selection
- `xs:key` / `xs:keyref` / `xs:unique` — identity constraints

These all need an XPath evaluator at runtime. Open an issue if you have a
real-world schema blocked by one of them.

XSD spec references:
[Part 1: Structures](https://www.w3.org/TR/xmlschema11-1/) ·
[Part 2: Datatypes](https://www.w3.org/TR/xmlschema11-2/).

## Behavior notes

### Strict-by-default error handling

If an `xs:include` / `xs:import` cannot be resolved (file missing, URL
unreachable), xsd2zod throws with a clear message. Pass
`--allow-missing-imports` to skip silently — types from the missing schema
will resolve to `z.unknown()`.

### All-or-nothing writes

If any input file fails to compile, **no** output files are written. You'll
never end up with a half-emitted `generated/` directory. The compile happens
fully in memory before anything touches disk.

### Library schemas auto-skipped

XSDs without a root `xs:element` (typed type-definition libraries — common
for shared bases like country codes, base types) are recognized as
"libraries" and their `.ts` is skipped by default. Their types are already
inlined into root schemas that `xs:import` them. Pass `--include-libraries`
to emit them too.

### Lazy references

Every named type emits as `z.lazy(() => ...)` so the generated file is
order-independent and supports cyclic references. Standard `ZodType` methods
(`.parse()`, `.safeParse()`, `.optional()`, `.nullable()`) work directly on
the exported constants. Schema-specific methods (`.extend()` on objects,
`.min()` on strings/numbers, `.element` on arrays) require unwrapping the
inner schema:

```ts
import { Person } from './person.ts';

Person.parse(input);                                    // ✓ works directly
const Extended = Person.def.getter().extend({ id: z.string() });  // unwrap once
```

## Alternatives

| Tool | Approach | Why xsd2zod instead |
|---|---|---|
| `xsd2jsonschema` + `json-schema-to-zod` | XSD → JSON Schema → Zod (two-stage pipeline) | Loses `xs:documentation`, fails on nested required `xs:sequence`, drops attribute group composition. xsd2zod compiles directly. |
| `xsd-to-zod` | Subset XSD → Zod | Doesn't handle `xs:choice` mixed with siblings, `xs:complexContent` extension chains, `xs:redefine`. |
| Hand-rolled types + manual Zod | — | Works for 5 types. Doesn't scale to 113-type schemas with regulator-driven updates. |
| `zod-from-x` (XML samples → schema) | Infer Zod from XML *instances* | Different problem entirely — only works if you have data, can't capture facets/constraints from sample alone. |

## FAQ

**Q: My XSD has cycles (Type A → Type B → Type A). Does that work?**
Yes. Every named type wraps in `z.lazy(() => ...)` so cycles resolve at runtime
without ordering issues.

**Q: What about `xs:assert` (XSD 1.1 XPath assertions)?**
Not yet — see the support table. Most real-world schemas don't use them.
Workaround: extend the generated schema with `.superRefine()` manually.

**Q: How are `dateTime`, `date`, `time` represented?**
`xs:dateTime` → `z.iso.datetime()`, `xs:date` → `z.iso.date()`, `xs:time` →
`z.iso.time()`. Output is the validated string, not a `Date` object — call
`new Date(result)` if you need it parsed.

**Q: My schema imports `http://www.w3.org/2001/XMLSchema-instance`. Does that break?**
No. The `xsi:` namespace is recognized and treated as built-in (used for
`nil` / `type` attributes).

**Q: How do I debug a parse error?**
Run with `--silent` removed to see which file/element xsd2zod choked on. Errors
include the XSD location. Open an issue with the smallest reproducer XSD if
the error message isn't enough.

**Q: Can I customize identifiers (e.g. strip a prefix)?**
Not currently — the CLI is intentionally one-shot. PRs welcome if you have a
concrete need.

## License

MIT — © Dawid Wiewiórski
