// IR captures every XSD 1.1 construct losslessly, target-agnostic
// (consumed by both source-string and runtime Zod emitters).

export type IRType =
	| IRString
	| IRNumber
	| IRBoolean
	| IRDate
	| IRDateTime
	| IRTime
	| IRDuration
	| IRGYear
	| IRGYearMonth
	| IRGMonthDay
	| IRGMonth
	| IRGDay
	| IRBinary
	| IRAnyURI
	| IRQName
	| IRAny
	| IREnum
	| IRObject
	| IRArray
	| IRList
	| IRUnion
	| IRRef;

export interface IRBase {
	// xs:annotation/xs:documentation → emits as `.describe(text)`.
	doc?: string;
	src?: { file?: string };
}

export interface IRString extends IRBase {
	kind: 'string';
	// xs:token = whiteSpace="collapse"; xs:normalizedString = whiteSpace="replace".
	whiteSpace?: 'preserve' | 'replace' | 'collapse';
	length?: number;
	minLength?: number;
	maxLength?: number;
	patterns?: string[];
}

export interface IRNumber extends IRBase {
	kind: 'number';
	// True for xs:integer-derived types (drives `.int()`).
	integer: boolean;
	min?: number;
	max?: number;
	// xs:minExclusive / xs:maxExclusive → strict comparisons (.gt / .lt).
	minExclusive?: boolean;
	maxExclusive?: boolean;
	totalDigits?: number;
	fractionDigits?: number;
	patterns?: string[];
}

export interface IRBoolean extends IRBase {
	kind: 'boolean';
}

export interface IRDate extends IRBase {
	kind: 'date';
	patterns?: string[];
	min?: string;
	max?: string;
	explicitTimezone?: 'optional' | 'required' | 'prohibited';
}

export interface IRDateTime extends IRBase {
	kind: 'dateTime';
	patterns?: string[];
	min?: string;
	max?: string;
	explicitTimezone?: 'optional' | 'required' | 'prohibited';
}

export interface IRTime extends IRBase {
	kind: 'time';
	patterns?: string[];
}

export interface IRDuration extends IRBase {
	kind: 'duration';
	patterns?: string[];
	subKind?: 'duration' | 'dayTimeDuration' | 'yearMonthDuration';
}

export interface IRGYear extends IRBase {
	kind: 'gYear';
	min?: number;
	max?: number;
}

export interface IRGYearMonth extends IRBase {
	kind: 'gYearMonth';
}

export interface IRGMonthDay extends IRBase {
	kind: 'gMonthDay';
}

export interface IRGMonth extends IRBase {
	kind: 'gMonth';
}

export interface IRGDay extends IRBase {
	kind: 'gDay';
}

export interface IRBinary extends IRBase {
	kind: 'binary';
	encoding: 'hex' | 'base64';
	length?: number;
	minLength?: number;
	maxLength?: number;
}

export interface IRAnyURI extends IRBase {
	kind: 'anyURI';
	length?: number;
	minLength?: number;
	maxLength?: number;
	patterns?: string[];
}

export interface IRQName extends IRBase {
	kind: 'qname';
}

export interface IRAny extends IRBase {
	kind: 'any';
	processContents?: 'skip' | 'lax' | 'strict';
	namespaces?: string[];
}

export interface IREnumValue {
	value: string;
	doc?: string;
}

export interface IREnum extends IRBase {
	kind: 'enum';
	baseKind: 'string' | 'number' | 'boolean' | 'date' | 'dateTime';
	values: IREnumValue[];
}

export interface IRAttribute {
	name: string;
	type: IRType;
	use: 'required' | 'optional' | 'prohibited';
	default?: string;
	fixed?: string;
	form?: 'qualified' | 'unqualified';
	doc?: string;
}

export interface IRObjectField {
	name: string;
	type: IRType;
	required: boolean;
	minOccurs: number;
	maxOccurs: number | 'unbounded';
	default?: string;
	fixed?: string;
	nillable?: boolean;
	doc?: string;
}

export interface IRObject extends IRBase {
	kind: 'object';
	fields: IRObjectField[];
	attributes?: IRAttribute[];
	/** xs:choice nested in xs:sequence — emitter intersects each with the body. */
	choices?: IRObjectField[];
	/** xs:group ref entries — emitter intersects each group expansion with the body. */
	groupRefs?: IRObjectField[];
	/** xs:any wildcard slots — emitter applies `.passthrough()` when non-empty. */
	anys?: IRObjectField[];
	/** True if `<xs:complexType mixed="true">`. */
	mixed?: boolean;
	/** True if `<xs:complexType abstract="true">`. */
	abstract?: boolean;
	/** xs:complexContent / xs:simpleContent base (resolved by emitter). */
	extends?: { kind: 'extension' | 'restriction'; baseRef: string };
}

export interface IRArray extends IRBase {
	kind: 'array';
	item: IRType;
	minOccurs: number;
	maxOccurs: number | 'unbounded';
}

// xs:list — space-separated string of items → array on parse.
export interface IRList extends IRBase {
	kind: 'list';
	item: IRType;
	length?: number;
	minLength?: number;
	maxLength?: number;
}

// xs:choice / xs:union → exactly one variant matches.
export interface IRUnion extends IRBase {
	kind: 'union';
	variants: IRType[];
	discriminator?: string;
	minOccurs?: number;
	maxOccurs?: number | 'unbounded';
}

// Reference to a named global type / group / attributeGroup / element.
export interface IRRef extends IRBase {
	kind: 'ref';
	name: string;
	refKind: 'type' | 'group' | 'attributeGroup' | 'element';
}

export interface IRGroup {
	name: string;
	type: IRType;
	doc?: string;
}

export interface IRAttributeGroup {
	name: string;
	attributes: IRAttribute[];
	doc?: string;
}

export interface IRSchema {
	targetNamespace?: string;
	elementFormDefault?: 'qualified' | 'unqualified';
	attributeFormDefault?: 'qualified' | 'unqualified';
	types: Record<string, IRType>;
	elements: Record<string, IRObjectField>;
	groups: Record<string, IRGroup>;
	attributeGroups: Record<string, IRAttributeGroup>;
	rootName: string;
	root: IRType;
}

export function isObject(t: IRType): t is IRObject {
	return t.kind === 'object';
}

export function isArray(t: IRType): t is IRArray {
	return t.kind === 'array';
}

export function isUnion(t: IRType): t is IRUnion {
	return t.kind === 'union';
}

export function isRef(t: IRType): t is IRRef {
	return t.kind === 'ref';
}

export function isPrimitive(t: IRType): boolean {
	switch (t.kind) {
		case 'string':
		case 'number':
		case 'boolean':
		case 'date':
		case 'dateTime':
		case 'time':
		case 'duration':
		case 'gYear':
		case 'gYearMonth':
		case 'gMonthDay':
		case 'gMonth':
		case 'gDay':
		case 'binary':
		case 'anyURI':
		case 'qname':
			return true;
		default:
			return false;
	}
}
