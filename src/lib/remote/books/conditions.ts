import { and, eq, exists, not, sql, type SQL } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { book, order, orderItem, series } from '#lib/server/db/schema.js';
import {
	columnIsEmpty,
	columnIsNull,
	compareDate,
	compareEnum,
	compareNumeric,
	emptyKeyword,
	isEmptyKeyword,
	orElseFalse,
	textScore,
	tokenCondition,
	trgmMatch
} from '#lib/server/db/trgm.js';
import { genreExists, genreMatch } from '../series/conditions.js';
import type { SearchToken } from '#lib/shared/search.js';

function bookOrderCondition(term: SearchToken, userId: string): SQL {
	// Empty here means "volume in no order": must replace the EXISTS below,
	// nesting it inside would be false for every book.
	if (!term.quoted && isEmptyKeyword(term.value)) {
		const noOrder = not(
			exists(
				db
					.select({ one: sql`1` })
					.from(orderItem)
					.where(and(eq(orderItem.bookId, book.id), eq(orderItem.userId, userId)))
			)
		);
		const cond = term.operator === '!=' ? not(noOrder) : noOrder;
		// tokenCondition already applies `-` negation — do not negate here.
		return cond;
	}
	const condition = tokenCondition(
		term,
		{
			orderdate: (v, op) => compareDate(order.orderDate, op, v),
			store: (v) => trgmMatch(order.storeName, v),
			order: (v) => trgmMatch(sql`coalesce(${order.orderNumber}, '')`, v)
		},
		(v) =>
			orElseFalse(
				trgmMatch(order.storeName, v),
				trgmMatch(sql`coalesce(${order.orderNumber}, '')`, v)
			)
	);

	return exists(
		db
			.select({ one: sql`1` })
			.from(orderItem)
			.innerJoin(order, eq(order.id, orderItem.orderId))
			.where(and(eq(orderItem.bookId, book.id), eq(orderItem.userId, userId), condition))
	);
}

const orderKeys = new Set(['orderdate', 'store', 'order']);

export function bookTermCondition(term: SearchToken, userId: string): SQL {
	return tokenCondition(
		term,
		{
			title: (v, op, q) => emptyKeyword(v, op, q, sql`false`, () => trgmMatch(series.title, v)),
			author: (v, op, q) =>
				emptyKeyword(v, op, q, columnIsEmpty(series.author), () =>
					trgmMatch(sql`coalesce(${series.author}, '')`, v)
				),
			genre: (v, op, q) => emptyKeyword(v, op, q, not(genreExists()), () => genreMatch(v)),
			volume: (v, op, q) =>
				emptyKeyword(v, op, q, sql`false`, () => compareNumeric(book.volumeNumber, op, v)),
			isbn: (v, op, q) =>
				emptyKeyword(v, op, q, columnIsEmpty(book.isbn), () =>
					trgmMatch(sql`coalesce(${book.isbn}, '')`, v)
				),
			status: (v, op, q) =>
				emptyKeyword(v, op, q, sql`false`, () => compareEnum(book.status, op, v)),
			readstatus: (v, op, q) =>
				emptyKeyword(v, op, q, sql`false`, () => compareEnum(book.readStatus, op, v)),
			currency: (v, op, q) =>
				emptyKeyword(v, op, q, columnIsEmpty(book.currencyCode), () =>
					op === '!='
						? sql`lower(${book.currencyCode}) != lower(${v})`
						: sql`lower(${book.currencyCode}) = lower(${v})`
				),
			paidprice: (v, op, q) =>
				emptyKeyword(v, op, q, columnIsNull(book.paidPrice), () =>
					compareNumeric(book.paidPrice, op, v)
				),
			originalprice: (v, op, q) =>
				emptyKeyword(v, op, q, columnIsNull(book.originalPrice), () =>
					compareNumeric(book.originalPrice, op, v)
				),
			boughtat: (v, op, q) =>
				emptyKeyword(v, op, q, columnIsNull(book.boughtAt), () => {
					if (!/^\d{4}-\d{2}$/.test(v)) return sql`false`;
					return op === '!='
						? sql`to_char(${book.boughtAt}, 'YYYY-MM') != ${v}`
						: sql`to_char(${book.boughtAt}, 'YYYY-MM') = ${v}`;
				}),
			startedat: (v, op, q) =>
				emptyKeyword(v, op, q, columnIsNull(book.startedAt), () =>
					compareDate(book.startedAt, op, v)
				),
			completedat: (v, op, q) =>
				emptyKeyword(v, op, q, columnIsNull(book.completedAt), () =>
					compareDate(book.completedAt, op, v)
				),
			readcount: (v, op, q) =>
				emptyKeyword(v, op, q, sql`false`, () => compareNumeric(book.readCount, op, v))
		},
		(v) =>
			orElseFalse(
				trgmMatch(series.title, v),
				trgmMatch(sql`coalesce(${series.author}, '')`, v),
				genreMatch(v),
				trgmMatch(sql`coalesce(${book.isbn}, '')`, v),
				bookOrderCondition(term, userId)
			),
		(key) => (orderKeys.has(key) ? bookOrderCondition(term, userId) : sql`false`)
	);
}

function orderTextScore(value: string, column: SQL): SQL<number> {
	return sql<number>`(
    select coalesce(max(${textScore(column, value)}), 0)
    from order_item oi
    inner join "order" o on o.id = oi.order_id
    where oi.book_id = ${book.id}
  )`;
}

const scoredKeys = new Set(['', 'title', 'author', 'genre', 'isbn', 'store', 'order']);

export function bookSearchScore(terms: SearchToken[]): SQL<number> | null {
	const scorable = terms.filter((term) => !term.negate && scoredKeys.has(term.key));

	if (scorable.length === 0) {
		return null;
	}

	const parts = scorable.map((term) => {
		const titleScore = textScore(series.title, term.value);
		const authorScore = textScore(sql`coalesce(${series.author}, '')`, term.value);
		const genreScore = sql<number>`(
      select coalesce(max(${textScore(sql`g.name`, term.value)}), 0)
      from series_genre sg
      join genre g on g.id = sg.genre_id
      where sg.series_id = ${series.id}
    )`;
		const isbnScore = textScore(sql`coalesce(${book.isbn}, '')`, term.value);
		const storeScore = orderTextScore(term.value, sql`o.store_name`);
		const orderScore = orderTextScore(term.value, sql`coalesce(o.order_number, '')`);

		switch (term.key) {
			case 'title':
				return titleScore;
			case 'author':
				return authorScore;
			case 'genre':
				return genreScore;
			case 'isbn':
				return isbnScore;
			case 'store':
				return storeScore;
			case 'order':
				return orderScore;
			case '':
				return sql<number>`greatest(${titleScore}, ${authorScore}, ${genreScore}, ${isbnScore}, ${storeScore}, ${orderScore})`;
			default:
				return sql<number>`0`;
		}
	});

	return sql<number>`(${sql.join(parts, sql` + `)})`;
}
