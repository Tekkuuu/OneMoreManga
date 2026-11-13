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

export function compareDate(column: Column | SQL, operator: SearchOperator, value: string): SQL {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return sql`false`;

	return sql`${column}::date ${sql.raw(operator)} ${value}::date`;
}

export function orElseFalse(...conditions: SQL[]): SQL {
	return or(...conditions) ?? sql`false`;
}

export function tokenCondition(
	token: SearchToken,
	fields: Record<string, (value: string, operator: SearchOperator) => SQL>,
	bare: (value: string) => SQL,
	unknownKey?: (key: string) => SQL
): SQL {
	const handle = fields[token.key];
	let condition: SQL;
	if (token.key === '') condition = bare(token.value);
	else if (handle) condition = handle(token.value, token.operator);
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
