export type SearchOperator = '<' | '>' | '<=' | '>=' | '=' | '!=';
export type SearchToken = {
	negate: boolean;
	operator: SearchOperator;
	key: string;
	value: string;
	/** Whether the value was wrapped in quotes (quoted values are always literal). */
	quoted: boolean;
};

export function tokenize(query: string): SearchToken[] {
	const terms: string[] = [];
	let currentTerm = '';
	let inQuotes = false;

	for (const char of query) {
		if (inQuotes) {
			// Check for quotes so we don't end term on whitespace inside them
			currentTerm += char;
			if (char === '"') inQuotes = false;
		} else if (char === '"') {
			// End quote
			currentTerm += char;
			inQuotes = true;
		} else if (/\s/.test(char)) {
			// If whitespace then end term
			if (currentTerm !== '') {
				terms.push(currentTerm);
				currentTerm = '';
			}
		} else {
			currentTerm += char;
		}
	}
	if (currentTerm !== '') terms.push(currentTerm);

	const tokens: SearchToken[] = [];
	for (const term of terms) {
		const negate = term.startsWith('-');
		const key = negate ? term.slice(1) : term;
		if (key === '') continue;

		const unquoted = key.replace(/^"(.*)"$/, '$1');
		const colon = unquoted.indexOf(':');
		const field = colon === -1 ? '' : unquoted.slice(0, colon).toLowerCase();
		const rawValue = colon === -1 ? unquoted : unquoted.slice(colon + 1);

		let operator: SearchOperator;
		let valuePart: string;
		if (rawValue.startsWith('!')) {
			operator = '!=';
			valuePart = rawValue.slice(1);
			if (valuePart.startsWith('=')) valuePart = valuePart.slice(1);
		} else {
			const match = rawValue.match(/^(<=|>=|!=|=|<|>)?\s*(.*)$/);
			operator = (match?.[1] ?? '=') as SearchOperator;
			valuePart = match?.[2] ?? rawValue;
		}

		const trimmedPart = valuePart.trim();
		const quoted =
			trimmedPart.length >= 2 && trimmedPart.startsWith('"') && trimmedPart.endsWith('"');
		const value = trimmedPart.replace(/^"(.*)"$/, '$1');
		if (value === '') continue;

		tokens.push({ negate, operator, key: field, value, quoted });
	}
	return tokens;
}
