// XSD lexical patterns shared between the source emitter (string form, embedded
// in `new RegExp(...)`) and the runtime emitter (real RegExp instance).

export const PATTERNS = {
	duration: '^-?P(?!$)((\\d+Y)?(\\d+M)?(\\d+D)?(T(\\d+H)?(\\d+M)?(\\d+(\\.\\d+)?S)?)?|\\d+W)$',
	gYear: '^-?\\d{4}(Z|[+-]\\d{2}:\\d{2})?$',
	gYearMonth: '^\\d{4}-(0[1-9]|1[0-2])(Z|[+-]\\d{2}:\\d{2})?$',
	gMonthDay: '^--(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])(Z|[+-]\\d{2}:\\d{2})?$',
	gMonth: '^--(0[1-9]|1[0-2])(Z|[+-]\\d{2}:\\d{2})?$',
	gDay: '^---(0[1-9]|[12]\\d|3[01])(Z|[+-]\\d{2}:\\d{2})?$',
	hexBinary: '^[0-9A-Fa-f]*$',
} as const;
