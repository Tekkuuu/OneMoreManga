import { logger } from '#lib/server/logger.js';
import { getRequestEvent, query } from '$app/server';
import { error } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.js';
import { book, genre, order, series } from '#lib/server/db/schema.js';
import { escapeLike } from '#lib/server/db/trgm.js';
import z from 'zod';
import { and, asc, desc, eq, ilike, isNotNull, ne, sql } from 'drizzle-orm';

async function suggestTitle(userId: string, prefix: string): Promise<string[]> {
	const rows = await db
		.selectDistinct({ entry: series.title })
		.from(series)
		.where(and(eq(series.userId, userId), ilike(series.title, `%${escapeLike(prefix)}%`)))
		.orderBy(asc(series.title))
		.limit(10);
	return rows.map((r) => r.entry).filter((v): v is string => !!v);
}

async function suggestAuthor(userId: string, prefix: string): Promise<string[]> {
	const rows = await db
		.selectDistinct({ entry: series.author })
		.from(series)
		.where(
			and(
				eq(series.userId, userId),
				isNotNull(series.author),
				ne(series.author, ''),
				ilike(series.author, `%${escapeLike(prefix)}%`)
			)
		)
		.orderBy(asc(series.author))
		.limit(10);
	return rows.map((r) => r.entry).filter((v): v is string => !!v);
}

async function suggestGenre(userId: string, prefix: string): Promise<string[]> {
	const rows = await db
		.selectDistinct({ entry: genre.name })
		.from(genre)
		.where(and(eq(genre.userId, userId), ilike(genre.name, `%${escapeLike(prefix)}%`)))
		.orderBy(asc(genre.name))
		.limit(10);
	return rows.map((r) => r.entry).filter((v): v is string => !!v);
}

async function suggestStore(userId: string, prefix: string): Promise<string[]> {
	const rows = await db
		.selectDistinct({ entry: order.storeName })
		.from(order)
		.where(and(eq(order.userId, userId), ilike(order.storeName, `%${escapeLike(prefix)}%`)))
		.orderBy(asc(order.storeName))
		.limit(10);
	return rows.map((r) => r.entry).filter((v): v is string => !!v);
}

async function suggestIsbn(userId: string, prefix: string): Promise<string[]> {
	const rows = await db
		.selectDistinct({ entry: book.isbn })
		.from(book)
		.where(
			and(
				eq(book.userId, userId),
				isNotNull(book.isbn),
				ne(book.isbn, ''),
				ilike(book.isbn, `%${escapeLike(prefix)}%`)
			)
		)
		.orderBy(asc(book.isbn))
		.limit(10);
	return rows.map((r) => r.entry).filter((v): v is string => !!v);
}

const bookStatuses = ['Wishlist', 'Ordered', 'Owned'];
const readStatuses = ['Not Read', 'Reading', 'Completed'];

function suggestStatic(options: string[], prefix: string): string[] {
	const p = prefix.toLowerCase();
	return options.filter((o) => o.toLowerCase().includes(p)).slice(0, 10);
}

async function suggestCurrency(userId: string, prefix: string): Promise<string[]> {
	const pattern = `${escapeLike(prefix)}%`;
	const [fromBooks, fromOrders] = await Promise.all([
		db
			.selectDistinct({ entry: book.currencyCode })
			.from(book)
			.where(
				and(
					eq(book.userId, userId),
					isNotNull(book.currencyCode),
					ilike(book.currencyCode, pattern)
				)
			)
			.limit(10),
		db
			.selectDistinct({ entry: order.currencyCode })
			.from(order)
			.where(
				and(
					eq(order.userId, userId),
					isNotNull(order.currencyCode),
					ilike(order.currencyCode, pattern)
				)
			)
			.limit(10)
	]);
	const merged = new Set<string>();
	for (const r of [...fromBooks, ...fromOrders]) if (r.entry) merged.add(r.entry);
	return [...merged].slice(0, 10);
}

async function suggestPrice(
	userId: string,
	prefix: string,
	column: typeof book.paidPrice | typeof book.originalPrice
): Promise<string[]> {
	const rows = await db
		.selectDistinct({ entry: column })
		.from(book)
		.where(
			and(
				eq(book.userId, userId),
				isNotNull(column),
				ilike(sql`cast(${column} as text)`, `${escapeLike(prefix)}%`)
			)
		)
		.orderBy(asc(column))
		.limit(10);
	return rows.map((r) => r.entry).filter((v): v is string => !!v);
}

async function suggestBoughtAt(userId: string, prefix: string): Promise<string[]> {
	const entry = sql<string>`to_char(${book.boughtAt}, 'YYYY-MM')`;
	const rows = await db
		.selectDistinct({ entry })
		.from(book)
		.where(
			and(eq(book.userId, userId), isNotNull(book.boughtAt), ilike(entry, `${escapeLike(prefix)}%`))
		)
		.orderBy(desc(entry))
		.limit(10);
	return rows.map((r) => r.entry).filter((v): v is string => !!v);
}

async function suggestDateColumn(
	userId: string,
	prefix: string,
	column: typeof book.startedAt | typeof book.completedAt
): Promise<string[]> {
	const entry = sql<string>`${column}::text`;
	const rows = await db
		.selectDistinct({ entry })
		.from(book)
		.where(and(eq(book.userId, userId), isNotNull(column), ilike(entry, `${escapeLike(prefix)}%`)))
		.orderBy(desc(entry))
		.limit(10);
	return rows.map((r) => r.entry).filter((v): v is string => !!v);
}

async function suggestOrderDate(userId: string, prefix: string): Promise<string[]> {
	const entry = sql<string>`to_char(${order.orderDate}, 'YYYY-MM-DD')`;
	const rows = await db
		.selectDistinct({ entry })
		.from(order)
		.where(and(eq(order.userId, userId), ilike(entry, `${escapeLike(prefix)}%`)))
		.orderBy(desc(entry))
		.limit(10);
	return rows.map((r) => r.entry).filter((v): v is string => !!v);
}

async function suggestOrderNumber(userId: string, prefix: string): Promise<string[]> {
	const rows = await db
		.selectDistinct({ entry: order.orderNumber })
		.from(order)
		.where(
			and(
				eq(order.userId, userId),
				isNotNull(order.orderNumber),
				ne(order.orderNumber, ''),
				ilike(order.orderNumber, `%${escapeLike(prefix)}%`)
			)
		)
		.orderBy(desc(order.orderNumber))
		.limit(10);
	return rows.map((r) => r.entry).filter((v): v is string => !!v);
}

const handlers: Record<string, (userId: string, prefix: string) => Promise<string[]>> = {
	title: suggestTitle,
	author: suggestAuthor,
	genre: suggestGenre,
	store: suggestStore,
	isbn: suggestIsbn,
	status: async (_userId, prefix) => suggestStatic(bookStatuses, prefix),
	readstatus: async (_userId, prefix) => suggestStatic(readStatuses, prefix),
	currency: suggestCurrency,
	paidprice: (userId, prefix) => suggestPrice(userId, prefix, book.paidPrice),
	originalprice: (userId, prefix) => suggestPrice(userId, prefix, book.originalPrice),
	boughtat: suggestBoughtAt,
	startedat: (userId, prefix) => suggestDateColumn(userId, prefix, book.startedAt),
	completedat: (userId, prefix) => suggestDateColumn(userId, prefix, book.completedAt),
	orderdate: suggestOrderDate,
	date: suggestOrderDate,
	order: suggestOrderNumber,
	note: suggestNote
};

async function suggestNote(userId: string, prefix: string): Promise<string[]> {
	const rows = await db
		.selectDistinct({ entry: order.note })
		.from(order)
		.where(
			and(
				eq(order.userId, userId),
				isNotNull(order.note),
				ne(order.note, ''),
				ilike(order.note, `%${escapeLike(prefix)}%`)
			)
		)
		.orderBy(asc(order.note))
		.limit(10);
	return rows.map((r) => r.entry).filter((v): v is string => !!v);
}

// Nullable fields where `:empty` can match (others return no rows).
const emptyableFields = new Set([
	'author',
	'genre',
	'isbn',
	'currency',
	'paidprice',
	'originalprice',
	'boughtat',
	'startedat',
	'completedat',
	'order',
	'note'
]);

export const getSuggestionForField = query(
	z.object({
		field: z.string().max(32),
		prefix: z.string().max(100)
	}),
	async (data) => {
		const { locals } = getRequestEvent();

		if (!locals.user) {
			logger.warn('Unauthorized search fetch attempt');
			error(401, 'Unauthorized');
		}

		const field = data.field.toLowerCase();
		const handler = handlers[field];
		if (!handler) return [];

		const results = await handler(locals.user.id, data.prefix);
		if (emptyableFields.has(field) && 'empty'.startsWith(data.prefix.toLowerCase())) {
			return ['empty', ...results].slice(0, 10);
		}
		return results;
	}
);
