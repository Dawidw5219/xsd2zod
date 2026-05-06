// Thin layer over fast-xml-parser's `preserveOrder` output, tailored for XSD.
// preserveOrder shape: { tagName: [children], ':@': { '@_attr': value } }.

export type OrderedNode = {
	':@'?: Record<string, string>;
} & Record<string, OrderedNode[] | string>;

const NS_DELIM = ':';

export function stripPrefix(qname: string): string {
	const idx = qname.indexOf(NS_DELIM);
	return idx >= 0 ? qname.slice(idx + 1) : qname;
}

export function getTagName(node: OrderedNode): string {
	for (const k of Object.keys(node)) {
		if (k !== ':@' && k !== '#text') return k;
	}
	return '';
}

export function getChildren(node: OrderedNode): OrderedNode[] {
	const tag = getTagName(node);
	if (!tag) return [];
	const value = node[tag];
	return Array.isArray(value) ? (value as OrderedNode[]) : [];
}

export function getAttr(node: OrderedNode, name: string): string | undefined {
	return node[':@']?.[`@_${name}`];
}

export function findChildren(node: OrderedNode, localTag: string): OrderedNode[] {
	return getChildren(node).filter((c) => stripPrefix(getTagName(c)) === localTag);
}

export function findChild(node: OrderedNode, localTag: string): OrderedNode | undefined {
	return findChildren(node, localTag)[0];
}

export function getInnerText(node: OrderedNode): string {
	const out: string[] = [];
	for (const c of getChildren(node)) {
		if (typeof c['#text'] === 'string') out.push(c['#text'] as string);
	}
	return out.join(' ').trim();
}

// xs:annotation/xs:documentation → joined string. Multiple xml:lang variants
// are concatenated.
export function getDocumentation(node: OrderedNode): string | undefined {
	const annotation = findChild(node, 'annotation');
	if (!annotation) return undefined;
	const docs: string[] = [];
	for (const documentation of findChildren(annotation, 'documentation')) {
		const text = getInnerText(documentation);
		if (text) docs.push(text);
	}
	const merged = docs.join(' ').trim();
	return merged || undefined;
}
