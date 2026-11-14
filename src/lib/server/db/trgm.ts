import { not, or, sql, type Column, type SQL } from 'drizzle-orm';
import type { SearchOperator, SearchToken } from '#lib/shared/search.js';

/**
 * Sanitize value for LIKE and ILIKE
 *
 * @param {string} value - Value to be sanitized.
 *
 * @returns {string} Sanitized value
 */
export function escapeLike(value: string): string {
	return value.replace(/[\\%_]/g, '\\$&');
}

export function trgmMatch(column: Column | SQL, search: string): SQL {
	return sql`(${column} % ${search} OR ${column} %> ${search} OR ${column} ILIKE ${`%${escapeLike(search)}%`})`;
}

export function compareNumeric(column: Column | SQL, operator: SearchOperator, value: string): SQL {
	const target = Number(value);
	if (Number.isNaN(target)) return sql`false`;

	return sql`${column} ${sql.raw(operator)} ${target}`;
}

export function compareEnum(column: Column | SQL, operator: SearchOperator, value: string): SQL {
	if (operator === '!=') return sql`${column} != ${value}`;
	return sql`${column} = ${value}`;
}

export function compareDate(column: Column | SQL, operator: SearchOperator, value: string): SQL {
	const relative = value.match(/^(\d+)([dmy])$/);
	if (relative) {
		const amount = Number(relative[1]);
		const unit = relative[2] === 'd' ? 'day' : relative[2] === 'm' ? 'month' : 'year';
		const flipped: Record<SearchOperator, SearchOperator> = {
			'>': '<',
			'<': '>',
			'>=': '<=',
			'<=': '>=',
			'=': '=',
			'!=': '!='
		};
		return sql`${column}::date ${sql.raw(flipped[operator])} (current_date - ${amount} * ${sql.raw(`interval '1 ${unit}'`)})`;
	}

	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return sql`false`;

	return sql`${column}::date ${sql.raw(operator)} ${value}::date`;
}

export function orElseFalse(...conditions: SQL[]): SQL {
	return or(...conditions) ?? sql`false`;
}

/** Unquoted `empty` value check (`field:empty`). */
export function isEmptyKeyword(value: string): boolean {
	return value.trim().toLowerCase() === 'empty';
}

/** `NULL` or `''` (nullable text columns). Parenthesized: the `OR` must not leak out of an `AND` chain. */
export function columnIsEmpty(column: Column | SQL): SQL {
	return sql`(${column} is null or ${column} = '')`;
}

/** `NULL` (nullable non-text columns). */
export function columnIsNull(column: Column | SQL): SQL {
	return sql`${column} is null`;
}

/**
 * Routes unquoted `:empty` to an emptiness check, otherwise runs the matcher.
 * Quoted values are always literal; `!=` inverts.
 */
export function emptyKeyword(
	value: string,
	operator: SearchOperator,
	quoted: boolean,
	emptyCondition: SQL,
	otherwise: () => SQL
): SQL {
	if (quoted || !isEmptyKeyword(value)) return otherwise();
	return operator === '!=' ? not(emptyCondition) : emptyCondition;
}

export function tokenCondition(
	token: SearchToken,
	fields: Record<string, (value: string, operator: SearchOperator, quoted: boolean) => SQL>,
	bare: (value: string) => SQL,
	unknownKey?: (key: string) => SQL
): SQL {
	const handle = fields[token.key];
	let condition: SQL;
	if (token.key === '') condition = bare(token.value);
	else if (handle) condition = handle(token.value, token.operator, token.quoted);
	else condition = unknownKey ? unknownKey(token.key) : sql`false`;
	return token.negate ? not(condition) : condition;
}

// Returns float between 0 and 1
export function similarity(column: Column | SQL, search: string): SQL<number> {
	return sql<number>`similarity(${column}, ${search})`;
}

// Great when query is a substring of column
export function wordSimilarity(search: string, column: Column | SQL): SQL<number> {
	return sql<number>`word_similarity(${search}, ${column})`;
}

export function textScore(column: Column | SQL, value: string): SQL<number> {
	return sql<number>`greatest(
		${similarity(column, value)},
		${wordSimilarity(value, column)}
	)`;
}
