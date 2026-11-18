<script lang="ts">
	import { format } from 'date-fns';
	import { CalendarDays, Check, LoaderCircle, Plus } from '@lucide/svelte';
	import Dialog from '#lib/components/ui/Dialog.svelte';
	import { createRemoteActionHandler } from '#lib/client/form-handlers.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import {
		scheduleReading,
		type CalendarRemainingVolume,
		type PlannedReadingItem
	} from '#lib/remote/reading-plan.remote.js';

	/**
	 * @property open Dialog visibility.
	 * @property volumes Volumes available for scheduling in add mode.
	 * @property item When set, changes this item's date instead of adding a volume.
	 * @property onSaved Called after a successful save.
	 */
	type Props = {
		open?: boolean;
		volumes?: CalendarRemainingVolume[];
		item?: PlannedReadingItem | null;
		onSaved?: () => void | Promise<void>;
	};

	let { open = $bindable(false), volumes = [], item = null, onSaved }: Props = $props();

	const locale = getLocale();
	const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });

	let date = $state(format(new Date(), 'yyyy-MM-dd'));
	let search = $state('');
	let savingId = $state<string | null>(null);

	const changingDate = $derived(item !== null);

	const filtered = $derived.by(() => {
		const query = search.trim().toLocaleLowerCase(locale);
		const matches = query
			? volumes.filter(
					(volume) =>
						volume.seriesTitle.toLocaleLowerCase(locale).includes(query) ||
						(volume.author ?? '').toLocaleLowerCase(locale).includes(query)
				)
			: volumes;

		return matches.toSorted(
			(a, b) => collator.compare(a.seriesTitle, b.seriesTitle) || a.volumeNumber - b.volumeNumber
		);
	});

	$effect(() => {
		if (!open) return;
		date = item?.plannedDate ?? format(new Date(), 'yyyy-MM-dd');
		search = '';
	});

	async function save(bookId: string) {
		if (!date || savingId !== null) return;

		savingId = bookId;
		await createRemoteActionHandler({
			success: changingDate
				? m.books_queue_change_success()
				: m.dashboard_calendar_schedule_success(),
			error: changingDate ? m.books_queue_change_error() : m.dashboard_calendar_schedule_error(),
			run: () => scheduleReading({ bookId, plannedDate: date }),
			onSuccess: async () => {
				await onSaved?.();
				open = false;
			}
		})();
		savingId = null;
	}
</script>

<Dialog bind:open size="md">
	{#snippet dialogTitle()}
		{changingDate ? m.books_queue_change_date_title() : m.books_queue_add_title()}
	{/snippet}

	{#snippet content()}
		<form
			class="space-y-3"
			onsubmit={(event) => {
				event.preventDefault();
				if (item) void save(item.bookId);
			}}
		>
			{#if changingDate && item}
				<div class="flex items-center gap-2 rounded-base preset-tonal p-2">
					<CalendarDays class="size-4 shrink-0" />
					<span class="min-w-0 truncate font-medium">
						{item.seriesTitle} · {m.series_entry_volume({ volumeNumber: item.volumeNumber })}
					</span>
				</div>
			{/if}

			<label class="block space-y-1">
				<span class="text-sm font-semibold">{m.books_queue_add_date_label()}</span>
				<input class="input" type="date" bind:value={date} required disabled={savingId !== null} />
			</label>

			{#if changingDate && item}
				<button
					type="submit"
					class="btn w-full justify-center preset-filled-primary-500"
					disabled={!date || savingId !== null}
				>
					{#if savingId !== null}
						<LoaderCircle class="size-4 animate-spin" />
					{:else}
						<Check class="size-4" />
					{/if}
					{m.books_queue_change_date_save()}
				</button>
			{:else}
				<input
					class="input"
					bind:value={search}
					placeholder={m.books_queue_add_search()}
					aria-label={m.books_queue_add_search()}
				/>

				<ul class="max-h-80 space-y-1 overflow-y-auto">
					{#each filtered as volume (volume.bookId)}
						{@const isBusy = savingId === volume.bookId}
						<li>
							<button
								type="button"
								class="flex w-full items-center justify-between gap-2 rounded-base border border-surface-200-800 bg-surface-50-950 p-2 text-left transition-colors hover:border-primary-500 hover:bg-primary-500/10 disabled:cursor-not-allowed disabled:opacity-60"
								disabled={savingId !== null}
								onclick={() => save(volume.bookId)}
							>
								<span class="min-w-0">
									<span class="block truncate font-medium">{volume.seriesTitle}</span>
									<span class="block truncate text-xs text-surface-500">
										{#if volume.author}{volume.author} ·
										{/if}
										{m.series_entry_volume({ volumeNumber: volume.volumeNumber })}
									</span>
								</span>
								<span class="shrink-0 text-xs font-medium text-surface-500">
									{#if isBusy}
										<LoaderCircle class="size-4 animate-spin" />
									{:else}
										<Plus class="size-4" />
									{/if}
								</span>
							</button>
						</li>
					{:else}
						<li class="p-2 text-sm text-surface-500">
							{volumes.length === 0 ? m.books_queue_add_no_volumes() : m.books_queue_add_empty()}
						</li>
					{/each}
				</ul>
			{/if}
		</form>
	{/snippet}
</Dialog>
