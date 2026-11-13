import { and, eq, exists, sql, type SQL } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { book, order, orderItem, series } from '#lib/server/db/schema.js';
import {
	compareDate,
	compareNumeric,
	orElseFalse,
	textScore,
	tokenCondition,
	trgmMatch
} from '#lib/server/db/trgm.js';
import type { SearchToken } from '#lib/shared/search.js';

const itemFields = new Set(['title', 'author', 'volume', 'paidprice', 'originalprice']);

export function orderItemCondition(term: SearchToken, userId: string): SQL {
	const condition = tokenCondition(
		term,
		{
			title: (v) => trgmMatch(series.title, v),
			author: (v) => trgmMatch(sql`coalesce(${series.author}, '')`, v),
			volume: (v, op) => compareNumeric(book.volumeNumber, op, v),
			paidprice: (v, op) => compareNumeric(book.paidPrice, op, v),
			originalprice: (v, op) => compareNumeric(book.originalPrice, op, v)
		},
		(v) =>
			orElseFalse(trgmMatch(series.title, v), trgmMatch(sql`coalesce(${series.author}, '')`, v))
	);

	return exists(
		db
			.select({ matched: sql`1` })
			.from(orderItem)
			.innerJoin(book, eq(orderItem.bookId, book.id))
			.innerJoin(series, eq(book.seriesId, series.id))
			.where(and(eq(orderItem.orderId, order.id), eq(orderItem.userId, userId), condition))
	);
}

export function orderTermCondition(term: SearchToken, userId: string): SQL {
	return tokenCondition(
		term,
		{
			order: (v) => trgmMatch(sql`coalesce(${order.orderNumber}, '')`, v),
			store: (v) => trgmMatch(order.storeName, v),
			note: (v) => trgmMatch(sql`coalesce(${order.note}, '')`, v),
			date: (v, op) => compareDate(order.orderDate, op, v)
		},
		(v) =>
			orElseFalse(
				trgmMatch(sql`coalesce(${order.orderNumber}, '')`, v),
				trgmMatch(order.storeName, v),
				trgmMatch(sql`coalesce(${order.note}, '')`, v),
				orderItemCondition(term, userId)
			),
		() => (itemFields.has(term.key) ? orderItemCondition(term, userId) : sql`false`)
	);
}

function itemTextScore(value: string, column: SQL): SQL<number> {
	return sql<number>`(
    select coalesce(max(${textScore(column, value)}), 0)
    from order_item oi
    inner join book b on b.id = oi.book_id
    inner join series s on s.id = b.series_id
    where oi.order_id = ${order.id}
  )`;
}

const scoredKeys = new Set(['', 'order', 'store', 'note', 'title', 'author']);

export function orderSearchScore(terms: SearchToken[]): SQL<number> | null {
	const scorable = terms.filter((term) => !term.negate && scoredKeys.has(term.key));

	if (scorable.length === 0) {
		return null;
	}

	const parts = scorable.map((term) => {
		const orderScore = textScore(sql`coalesce(${order.orderNumber}, '')`, term.value);
		const storeScore = textScore(order.storeName, term.value);
		const noteScore = textScore(sql`coalesce(${order.note}, '')`, term.value);
		const titleScore = itemTextScore(term.value, sql`s.title`);
		const authorScore = itemTextScore(term.value, sql`coalesce(s.author, '')`);

		switch (term.key) {
			case 'order':
				return orderScore;
			case 'store':
				return storeScore;
			case 'note':
				return noteScore;
			case 'title':
				return titleScore;
			case 'author':
				return authorScore;
			case '':
				return sql<number>`greatest(${orderScore}, ${storeScore}, ${noteScore}, ${titleScore}, ${authorScore})`;
			default:
				return sql<number>`0`;
		}
	});

	return sql<number>`(${sql.join(parts, sql` + `)})`;
}
