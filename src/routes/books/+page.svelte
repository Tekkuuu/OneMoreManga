<script lang="ts">
	import BookCover from '#lib/components/book/BookCover.svelte';
	import { getBookStatusText, getReadStatusText } from '#lib/components/book/book-labels.js';
	import { coverSrc } from '#lib/shared/file-url.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getBooks } from '#lib/remote/books.remote.js';
	import { persistedStorage } from '#lib/client/persisted-storage.svelte.js';
	import SearchHelpPopover from '#lib/components/ui/SearchHelpPopover.svelte';
	import ViewModeToggle from '#lib/components/ui/ViewModeToggle.svelte';
	import Pagination from '#lib/components/ui/Pagination.svelte';
	import { LayoutGrid, List } from '@lucide/svelte';
	import { resolve } from '$app/paths';
	import { snapshot } from '$app/navigation';
	import { SvelteSet } from 'svelte/reactivity';

	type BooksResult = Awaited<ReturnType<typeof getBooks>>;
	type BookEntry = BooksResult['books'][number];

	const viewMode = persistedStorage<'grid' | 'list'>('bookViewMode', 'grid');

	let searchQuery = $state('');
	let appliedSearch = $state('');
	let viewPage = $state(1);
	let perPage = $state(24);

	$effect(() => {
		const nextSearch = searchQuery;
		if (nextSearch === appliedSearch) return;

		const timeout = setTimeout(() => {
			appliedSearch = nextSearch;
			viewPage = 1;
		}, 250);

		return () => clearTimeout(timeout);
	});

	function createBooksQuery(targetPage: number) {
		return getBooks({
			count: perPage,
			page: targetPage,
			search: appliedSearch.trim() || undefined
		});
	}

	let lastTotal = $state(0);
	const totalPages = $derived(Math.max(1, Math.ceil(lastTotal / perPage)));

	const pageQueries = $derived.by(() => {
		const candidates = new SvelteSet([viewPage]);

		if (viewPage > 1) candidates.add(viewPage - 1);
		if (viewPage < totalPages) candidates.add(viewPage + 1);

		return [...candidates]
			.sort((a, b) => a - b)
			.map((candidate) => ({
				page: candidate,
				query: createBooksQuery(candidate)
			}));
	});
	const booksQuery = $derived(
		pageQueries.find((candidate) => candidate.page === viewPage)?.query ??
			createBooksQuery(viewPage)
	);
	const booksPage = $derived(booksQuery.current);

	$effect(() => {
		if (booksPage) lastTotal = booksPage.total;
	});

	$effect(() => {
		for (const candidate of pageQueries) {
			void candidate.query.current;
		}
	});

	const total = $derived(booksPage?.total ?? lastTotal);
	const booksGridClass = $derived([
		'mx-auto max-w-[calc(100vw-6rem)]',
		viewMode.value === 'grid'
			? 'grid w-full grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2'
			: 'grid w-full grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-3'
	]);
	const skeletonSlots = $derived(Array.from({ length: perPage }, (_, index) => index));

	$effect(() => {
		if (!booksPage) return;

		const pageCount = Math.max(1, Math.ceil(booksPage.total / perPage));
		if (viewPage > pageCount) viewPage = pageCount;
	});

	snapshot({
		capture: () => ({
			searchQuery,
			page: viewPage,
			perPage
		}),
		restore: (value) => {
			searchQuery = value.searchQuery;
			viewPage = value.page;
			perPage = value.perPage;
		}
	});
</script>

{#snippet listItem(book: BookEntry)}
	<div
		class="grid grid-cols-[2.25rem_1fr_auto] grid-rows-3 items-center gap-x-2 rounded-base preset-tonal p-2"
	>
		<a href={resolve(`series/${book.seriesId}/${book.id}`)} class="col-start-1 row-span-3">
			<BookCover
				src={coverSrc(book)}
				alt={m.series_detail_cover_alt_volume({ volumeNumber: book.volumeNumber })}
				imgClass="h-12 w-9 rounded object-cover"
				fallbackClass="h-12 w-9 rounded"
			/>
		</a>
		<a
			href={resolve(`series/${book.seriesId}/${book.id}`)}
			class="col-start-2 row-start-1 block truncate text-sm font-semibold"
		>
			{book.seriesTitle}
		</a>
		<p class="col-start-2 row-start-2 truncate text-sm opacity-70">
			{book.seriesAuthor || m.series_detail_unknown_author()}
		</p>
		<p class="col-start-2 row-start-3 truncate text-sm">
			{m.series_entry_volume({ volumeNumber: book.volumeNumber })}
			{#if book.isbn}
				<span class="text-surface-500-500 hidden text-sm sm:inline">
					{m.series_detail_isbn({ isbn: book.isbn })}
				</span>
			{/if}
			· {getBookStatusText(book.status)} · {getReadStatusText(book.readStatus)}
		</p>
	</div>
{/snippet}

{#snippet gridItem(book: BookEntry)}
	<div
		class={[
			'group relative rounded-base bg-transparent p-2 transition-all duration-200',
			'ease-[cubic-bezier(0.6,0,0.3,2)] hover:z-50 sm:hover:scale-125 sm:hover:rotate-5'
		]}
	>
		<div class="aura aura-dual aura-light scale-105" aria-hidden="true"></div>
		<a
			href={resolve(`series/${book.seriesId}/${book.id}`)}
			class="relative z-10 block transition-all duration-150"
		>
			<BookCover
				src={coverSrc(book)}
				alt={m.series_detail_cover_alt_volume({ volumeNumber: book.volumeNumber })}
				imgClass="aspect-2/3 w-full rounded object-cover shadow-md"
				fallbackClass="aspect-2/3 w-full rounded shadow-md"
			/>
			<div
				class="absolute top-0 left-0 hidden h-full w-full flex-col items-center justify-center gap-1 bg-black/50 px-2 text-center text-white opacity-0 group-hover:flex group-hover:opacity-100"
			>
				<span class="line-clamp-2 text-sm font-bold">{book.seriesTitle}</span>
				<span class="text-2xl font-bold">
					{m.series_entry_volume({ volumeNumber: book.volumeNumber })}
				</span>
			</div>
		</a>
	</div>
{/snippet}

{#snippet skeletonItem()}
	{#if viewMode.value === 'grid'}
		<div class="aspect-2/3 w-full animate-pulse rounded bg-surface-200-800 shadow-md"></div>
	{:else}
		<div
			class="grid grid-cols-[2.25rem_1fr_auto] grid-rows-[repeat(3,1.25rem)] items-center gap-x-2 rounded-base preset-tonal p-2"
		>
			<div class="col-start-1 row-span-3 h-12 w-9 animate-pulse rounded bg-surface-300-700"></div>

			<div
				class="col-start-2 row-start-1 h-3.5 w-2/3 animate-pulse rounded bg-surface-300-700"
			></div>

			<div class="col-start-2 row-start-2 h-3 w-1/2 animate-pulse rounded bg-surface-300-700"></div>

			<div class="col-start-2 row-start-3 h-3 w-3/4 animate-pulse rounded bg-surface-300-700"></div>

			<div
				class="col-start-3 row-span-3 h-8 w-8 animate-pulse self-start justify-self-end rounded bg-surface-300-700"
			></div>
		</div>
	{/if}
{/snippet}

<main class="container flex flex-col gap-2">
	<div class="flex w-full gap-2">
		<SearchHelpPopover
			bind:value={searchQuery}
			placeholder={m.books_search_placeholder()}
			title={m.books_search_help_title()}
			description={m.books_search_help_description()}
			fieldsTitle={m.books_search_help_fields_title()}
			fields={[
				'title',
				'author',
				'genre',
				'volume',
				'isbn',
				'status',
				'readstatus',
				'currency',
				'paidprice',
				'originalprice',
				'boughtat',
				'startedat',
				'completedat',
				'readcount',
				'orderdate',
				'store',
				'order'
			]}
			examplesTitle={m.books_search_help_examples_title()}
			examples={[
				'title:Berserk',
				'author:"Kentarō Miura"',
				'genre:Action',
				'volume:5',
				'status:Owned',
				'paidprice:>39.99',
				'boughtat:2024-01',
				'orderdate:>30d',
				'-status:Wishlist'
			]}
			operators={m.books_search_help_operators()}
		/>
		<ViewModeToggle
			bind:value={viewMode.value}
			viewModes={[
				{ value: 'grid', icon: LayoutGrid },
				{ value: 'list', icon: List }
			]}
		/>
	</div>

	{#if booksPage}
		<div class={booksGridClass}>
			{#each booksPage.books as book (book.id)}
				{@render (viewMode.value === 'grid' ? gridItem : listItem)(book)}
			{/each}
		</div>

		{#if booksPage.books.length === 0}
			<p class="py-8 text-center text-surface-500">
				{appliedSearch ? m.books_no_results() : m.books_empty()}
			</p>
		{/if}
	{:else if booksQuery.error}
		<p class="py-8 text-center text-surface-500">{m.error_description()}</p>
	{:else}
		<div class={booksGridClass} aria-hidden="true">
			{#each skeletonSlots as slot (slot)}
				{@render skeletonItem()}
			{/each}
		</div>
	{/if}

	{#if total > 0 && !booksQuery.error}
		<Pagination bind:page={viewPage} count={total} bind:perPage class="w-full" />
	{/if}
</main>
