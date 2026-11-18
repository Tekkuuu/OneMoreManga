<script lang="ts">
	import { CalendarDays, Layers3, Milestone, Plus, Trash2 } from '@lucide/svelte';
	import { resolve } from '$app/paths';
	import { refreshAll } from '$app/navigation';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import BookCover from '#lib/components/book/BookCover.svelte';
	import ViewModeToggle from '#lib/components/ui/ViewModeToggle.svelte';
	import { createRemoteActionHandler } from '#lib/client/form-handlers.js';
	import { persistedStorage } from '#lib/client/persisted-storage.svelte.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import {
		getSchedulableVolumes,
		plannedReading,
		unscheduleReading,
		type PlannedReadingItem
	} from '#lib/remote/reading-plan.remote.js';
	import { coverSrc } from '#lib/shared/file-url.js';
	import PlanDialog from './PlanDialog.svelte';

	type SeriesGroup = {
		seriesId: string;
		seriesTitle: string;
		items: PlannedReadingItem[];
	};

	const viewMode = persistedStorage<'series' | 'chronological'>(
		'readingPlanViewMode',
		'chronological'
	);

	const plannedQuery = plannedReading();
	const volumesQuery = getSchedulableVolumes();

	const locale = getLocale();
	const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });

	let addOpen = $state(false);
	let changeOpen = $state(false);
	let changeItem = $state<PlannedReadingItem | null>(null);

	const books = $derived(plannedQuery.current ?? []);
	const plannedBookIds = $derived(new SvelteSet(books.map((book) => book.bookId)));
	const schedulable = $derived(
		(volumesQuery.current ?? []).filter((volume) => !plannedBookIds.has(volume.bookId))
	);

	const chronologicalBooks = $derived(
		books.toSorted(
			(a, b) =>
				a.plannedDate.localeCompare(b.plannedDate) ||
				collator.compare(a.seriesTitle, b.seriesTitle) ||
				a.volumeNumber - b.volumeNumber
		)
	);

	const seriesGroups = $derived.by((): SeriesGroup[] => {
		const groups = new SvelteMap<string, SeriesGroup>();

		for (const book of books) {
			let group = groups.get(book.seriesId);
			if (!group) {
				group = { seriesId: book.seriesId, seriesTitle: book.seriesTitle, items: [] };
				groups.set(book.seriesId, group);
			}
			group.items.push(book);
		}

		return [...groups.values()]
			.map((group) => ({
				...group,
				items: group.items.toSorted(
					(a, b) => a.plannedDate.localeCompare(b.plannedDate) || a.volumeNumber - b.volumeNumber
				)
			}))
			.toSorted((a, b) => collator.compare(a.seriesTitle, b.seriesTitle));
	});

	const skeletonSlots = [0, 1, 2, 3, 4, 5];

	async function reload() {
		await refreshAll();
	}

	function openChangeDate(book: PlannedReadingItem) {
		changeItem = book;
		changeOpen = true;
	}

	async function remove(book: PlannedReadingItem) {
		await createRemoteActionHandler({
			success: m.dashboard_calendar_unschedule_success(),
			error: m.dashboard_calendar_unschedule_error(),
			run: () => unscheduleReading({ id: book.id }),
			onSuccess: reload
		})();
	}
</script>

{#snippet planItem(book: PlannedReadingItem)}
	<div
		class="flex flex-wrap items-center gap-x-3 gap-y-2 card rounded-base preset-filled-surface-100-900 p-3"
	>
		<a href={resolve(`series/${book.seriesId}/${book.bookId}`)} class="shrink-0">
			<BookCover
				src={coverSrc(book)}
				alt={m.series_detail_cover_alt_volume({ volumeNumber: book.volumeNumber })}
				imgClass="h-10 w-7 rounded-sm object-cover"
				fallbackClass="h-10 w-7 rounded-sm"
			/>
		</a>
		<div class="min-w-0 flex-1">
			<a
				href={resolve(`series/${book.seriesId}/${book.bookId}`)}
				class="block truncate font-medium"
			>
				{book.seriesTitle}
				<span class="text-surface-500">
					{m.series_entry_volume({ volumeNumber: book.volumeNumber })}
				</span>
			</a>
			<p class="truncate text-xs text-surface-500">
				{book.author || m.series_detail_unknown_author()}
			</p>
		</div>
		<time
			class="shrink-0 rounded-base preset-tonal px-2 py-1 text-xs font-medium tabular-nums"
			datetime={book.plannedDate}
		>
			{book.plannedDate}
		</time>
		<div class="flex shrink-0 items-center gap-1">
			<button
				type="button"
				class="btn btn-icon preset-tonal btn-sm"
				aria-label={m.books_queue_change_date()}
				title={m.books_queue_change_date()}
				onclick={() => openChangeDate(book)}
			>
				<CalendarDays class="size-4" />
			</button>
			<button
				type="button"
				class="btn btn-icon preset-tonal btn-sm hover:preset-filled-error-500"
				aria-label={m.books_queue_remove()}
				title={m.books_queue_remove()}
				onclick={() => remove(book)}
			>
				<Trash2 class="size-4" />
			</button>
		</div>
	</div>
{/snippet}

{#snippet skeletonItem()}
	<div class="flex items-center gap-3 card rounded-base preset-filled-surface-100-900 p-3">
		<div class="h-10 w-7 shrink-0 animate-pulse rounded-sm bg-surface-300-700"></div>
		<div class="flex-1 space-y-2">
			<div class="h-3.5 w-2/3 animate-pulse rounded bg-surface-300-700"></div>
			<div class="h-3 w-1/2 animate-pulse rounded bg-surface-300-700"></div>
		</div>
		<div class="h-6 w-24 animate-pulse rounded bg-surface-300-700"></div>
	</div>
{/snippet}

<main class="container flex flex-col gap-4">
	<header class="flex min-w-0 flex-wrap items-center justify-between gap-2">
		<div class="flex min-w-0 items-center gap-2">
			<CalendarDays class="size-5 shrink-0" />
			<h1 class="truncate text-xl font-semibold">{m.books_queue_title()}</h1>
			{#if plannedQuery.current && books.length > 0}
				<span class="shrink-0 rounded-base preset-tonal px-2 py-1 text-xs">
					{m.books_queue_count({ count: books.length })}
				</span>
			{/if}
		</div>

		<div class="flex flex-wrap items-center gap-2">
			<button
				type="button"
				class="btn flex items-center preset-filled"
				onclick={() => (addOpen = true)}
			>
				<Plus class="size-4" />
				{m.books_queue_add()}
			</button>
			<ViewModeToggle
				bind:value={viewMode.value}
				ariaLabel={m.books_queue_view_switch()}
				viewModes={[
					{ value: 'series', icon: Layers3, text: m.books_queue_view_series() },
					{ value: 'chronological', icon: Milestone, text: m.books_queue_view_chronological() }
				]}
			/>
		</div>
	</header>

	{#if plannedQuery.error}
		<p class="py-8 text-center text-surface-500">{m.error_description()}</p>
	{:else if plannedQuery.current}
		{#if viewMode.value === 'series'}
			{#each seriesGroups as group (group.seriesId)}
				<section class="flex flex-col gap-2">
					<h2 class="px-1 text-sm font-semibold tracking-wide text-surface-500 uppercase">
						{group.seriesTitle}
						<span class="ml-1 font-normal normal-case">
							({m.books_queue_count({ count: group.items.length })})
						</span>
					</h2>
					{#each group.items as book (book.id)}
						{@render planItem(book)}
					{/each}
				</section>
			{/each}
		{:else}
			<div class="relative">
				<div
					class="absolute inset-y-2 left-[5px] w-0.5 bg-surface-300-700"
					aria-hidden="true"
				></div>
				<ol class="flex flex-col gap-2 pl-8">
					{#each chronologicalBooks as book (book.id)}
						<li class="relative">
							<span
								class="absolute top-5 -left-8 size-3 rounded-full border-2 border-surface-50-950 bg-primary-500"
								aria-hidden="true"
							></span>
							{@render planItem(book)}
						</li>
					{/each}
				</ol>
			</div>
		{/if}

		{#if books.length === 0}
			<p class="py-8 text-center text-surface-500">{m.books_queue_empty()}</p>
		{/if}
	{:else}
		<p class="sr-only" role="status">{m.books_queue_loading()}</p>
		<div class="flex flex-col gap-2" aria-hidden="true">
			{#each skeletonSlots as slot (slot)}
				{@render skeletonItem()}
			{/each}
		</div>
	{/if}
</main>

<PlanDialog bind:open={addOpen} volumes={schedulable} onSaved={async () => reload()} />
<PlanDialog bind:open={changeOpen} item={changeItem} onSaved={async () => reload()} />
