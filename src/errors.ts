export interface ErrorContext {
	file?: string;
	construct?: string;
	specSection?: string;
}

export class Xsd2ZodError extends Error {
	readonly code: string;
	readonly context: ErrorContext;

	constructor(code: string, message: string, context: ErrorContext = {}) {
		const prefix = context.file ? `[${context.file}] ` : '';
		super(prefix + message);
		this.name = 'Xsd2ZodError';
		this.code = code;
		this.context = context;
	}
}

export class UnsupportedConstructError extends Xsd2ZodError {
	constructor(construct: string, context: ErrorContext = {}) {
		const section = context.specSection ? ` (XSD spec ${context.specSection})` : '';
		super(
			'unsupported_construct',
			`Unsupported XSD construct "${construct}"${section}`,
			{ ...context, construct },
		);
		this.name = 'UnsupportedConstructError';
	}
}

export class InvalidFacetError extends Xsd2ZodError {
	constructor(facet: string, value: string, baseType: string, context: ErrorContext = {}) {
		super(
			'invalid_facet',
			`Facet "${facet}" with value "${value}" cannot apply to base type "${baseType}"`,
			{ ...context, construct: facet },
		);
		this.name = 'InvalidFacetError';
	}
}

export class UnresolvedReferenceError extends Xsd2ZodError {
	constructor(refKind: string, name: string, context: ErrorContext = {}) {
		super(
			'unresolved_reference',
			`Cannot resolve ${refKind} reference "${name}". Make sure the schema declaring it is included or imported.`,
			{ ...context, construct: refKind },
		);
		this.name = 'UnresolvedReferenceError';
	}
}

