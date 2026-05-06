// XSD 1.1 datatype table — maps `xs:*` names to fresh IRType templates.
// Each call returns a NEW object; callers mutate freely (apply facets etc.)
// without affecting subsequent lookups.

import type { IRType } from '../ir';

const INT_MIN_LONG = -9223372036854775808 as const;
const INT_MAX_LONG = 9223372036854775807 as const;

export function builtinFor(localName: string): IRType | undefined {
	switch (localName) {
		// Primitives (XSD §3.3)
		case 'string':
			return { kind: 'string' };
		case 'boolean':
			return { kind: 'boolean' };
		case 'decimal':
			return { kind: 'number', integer: false };
		case 'float':
		case 'double':
			return { kind: 'number', integer: false };
		case 'duration':
			return { kind: 'duration' };
		case 'dateTime':
			return { kind: 'dateTime' };
		case 'time':
			return { kind: 'time' };
		case 'date':
			return { kind: 'date' };
		case 'gYearMonth':
			return { kind: 'gYearMonth' };
		case 'gYear':
			return { kind: 'gYear' };
		case 'gMonthDay':
			return { kind: 'gMonthDay' };
		case 'gDay':
			return { kind: 'gDay' };
		case 'gMonth':
			return { kind: 'gMonth' };
		case 'hexBinary':
			return { kind: 'binary', encoding: 'hex' };
		case 'base64Binary':
			return { kind: 'binary', encoding: 'base64' };
		case 'anyURI':
			return { kind: 'anyURI' };
		case 'QName':
		case 'NOTATION':
			return { kind: 'qname' };

		// Derived from xs:string
		case 'normalizedString':
			return { kind: 'string', whiteSpace: 'replace' };
		case 'token':
			return { kind: 'string', whiteSpace: 'collapse' };
		case 'language':
			return {
				kind: 'string',
				whiteSpace: 'collapse',
				patterns: ['[a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*'],
			};
		case 'NMTOKEN':
		case 'Name':
		case 'NCName':
		case 'ID':
		case 'IDREF':
		case 'ENTITY':
			return { kind: 'string', whiteSpace: 'collapse' };
		case 'NMTOKENS':
		case 'IDREFS':
		case 'ENTITIES':
			return { kind: 'list', item: { kind: 'string', whiteSpace: 'collapse' } };

		// Derived integer chain (xs:integer → long → int → short → byte; unsigned*)
		case 'integer':
			return { kind: 'number', integer: true };
		case 'nonPositiveInteger':
			return { kind: 'number', integer: true, max: 0 };
		case 'negativeInteger':
			return { kind: 'number', integer: true, max: -1 };
		case 'long':
			return { kind: 'number', integer: true, min: INT_MIN_LONG, max: INT_MAX_LONG };
		case 'int':
			return { kind: 'number', integer: true, min: -2147483648, max: 2147483647 };
		case 'short':
			return { kind: 'number', integer: true, min: -32768, max: 32767 };
		case 'byte':
			return { kind: 'number', integer: true, min: -128, max: 127 };
		case 'nonNegativeInteger':
			return { kind: 'number', integer: true, min: 0 };
		case 'unsignedLong':
			return { kind: 'number', integer: true, min: 0, max: 18446744073709551615 };
		case 'unsignedInt':
			return { kind: 'number', integer: true, min: 0, max: 4294967295 };
		case 'unsignedShort':
			return { kind: 'number', integer: true, min: 0, max: 65535 };
		case 'unsignedByte':
			return { kind: 'number', integer: true, min: 0, max: 255 };
		case 'positiveInteger':
			return { kind: 'number', integer: true, min: 1 };

		// Derived duration / dateTime (XSD 1.1)
		case 'dayTimeDuration':
			return { kind: 'duration', subKind: 'dayTimeDuration' };
		case 'yearMonthDuration':
			return { kind: 'duration', subKind: 'yearMonthDuration' };
		case 'dateTimeStamp':
			return { kind: 'dateTime', explicitTimezone: 'required' };

		case 'anyType':
		case 'anySimpleType':
		case 'anyAtomicType':
			return { kind: 'any' };
		// XSD 1.1 xs:error — no instance is ever valid. Empty union ≡ z.never().
		case 'error':
			return { kind: 'union', variants: [] };

		default:
			return undefined;
	}
}

export function cloneType(t: IRType): IRType {
	return JSON.parse(JSON.stringify(t)) as IRType;
}
