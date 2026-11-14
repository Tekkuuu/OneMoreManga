import { and, eq, exists, not, sql, type SQL } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { genre, series, seriesGenre } from '#lib/server/db/schema.js';
import {
	columnIsEmpty,
	emptyKeyword,
	orElseFalse,
	textScore,
	tokenCondition,
	trgmMatch
} from '#lib/server/db/trgm.js';
import type { SearchToken } from '#lib/shared/search.js';

export function genreMatch(value: string): SQL {
	return exists(
		db
			.select({ one: sql`1` })
			.from(seriesGenre)
			.innerJoin(genre, eq(genre.id, seriesGenre.genreId))
			.where(
				and(
					eq(seriesGenre.seriesId, series.id),
					eq(genre.userId, series.userId),
					trgmMatch(genre.name, value)
				)
			)
	);
}

export function genreExists(): SQL {
	return exists(
		db
			.select({ one: sql`1` })
			.from(seriesGenre)
			.innerJoin(genre, eq(genre.id, seriesGenre.genreId))
			.where(and(eq(seriesGenre.seriesId, series.id), eq(genre.userId, series.userId)))
	);
}

export function seriesTermCondition(term: SearchToken): SQL {
	return tokenCondition(
		term,
		{
			title: (v, op, q) => emptyKeyword(v, op, q, sql`false`, () => trgmMatch(series.title, v)),
			author: (v, op, q) =>
				emptyKeyword(v, op, q, columnIsEmpty(series.author), () =>
					trgmMatch(sql`coalesce(${series.author}, '')`, v)
				),
			genre: (v, op, q) => emptyKeyword(v, op, q, not(genreExists()), () => genreMatch(v))
		},
		(v) =>
			orElseFalse(
				trgmMatch(series.title, v),
				trgmMatch(sql`coalesce(${series.author}, '')`, v),
				genreMatch(v)
			)
	);
}

const scoredKeys = new Set(['', 'title', 'author', 'genre']);

export function seriesSearchScore(terms: SearchToken[]): SQL<number> | null {
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

		switch (term.key) {
			case 'title':
				return titleScore;
			case 'author':
				return authorScore;
			case 'genre':
				return genreScore;
			case '':
				return sql<number>`greatest(${titleScore}, ${authorScore}, ${genreScore})`;
			default:
				return sql<number>`0`;
		}
	});

	return sql<number>`(${sql.join(parts, sql` + `)})`;
}
