<script lang="ts">
	import { Info, X } from '@lucide/svelte';
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import { getSuggestionForField } from '#lib/remote/help-search-popover.remote.js';

	type Props = {
		value?: string;
		placeholder: string;
		title: string;
		description: string;
		fieldsTitle: string;
		fields: string[];
		examplesTitle: string;
		examples: string[];
		operators: string;
	};

	let {
		value = $bindable(''),
		placeholder,
		title,
		description,
		fieldsTitle,
		fields,
		examplesTitle,
		examples,
		operators
	}: Props = $props();

	type ActiveField = {
		key: string;
		prefix: string;
		operator: string;
		negate: boolean;
		quoted: boolean;
		start: number;
	};

	type FieldPrefix = {
		prefix: string;
		negate: boolean;
		start: number;
	};

	const allowed = $derived(fields.map((f) => f.toLowerCase()));

	function getActiveField(input: string): ActiveField | null {
		if (!input) {
			return null;
		}

		const m = /(?:^|\s)(-)?([A-Za-z]+):(?:"([^"]*)|([^\s]*))$/.exec(input);
		if (!m) {
			return null;
		}

		const key = m[2].toLowerCase();
		if (!allowed.includes(key)) {
			return null;
		}
		// Closed quote (`a:"b"`) falls into the unquoted branch: token is done.
		if (m[4] !== undefined && m[4].includes('"')) {
			return null;
		}

		const raw = (m[3] ?? m[4] ?? '').replace(/^"/, '');

		const opMatch = /^(<=|>=|!=|=|<|>|!)/.exec(raw);
		const operator = opMatch?.[1] ?? '';

		const prefix = raw.slice(operator.length);

		const quoted = m[3] !== undefined;

		const leadingSpace = m[0][0] === ' ' || m[0][0] === '\t' || m[0][0] === '\n' ? 1 : 0;

		return { key, prefix, operator, negate: m[1] === '-', quoted, start: m.index + leadingSpace };
	}

	function getFieldPrefix(input: string): FieldPrefix | null {
		if (getActiveField(input)) {
			return null;
		}

		const m = /(?:^|\s)(-)?([A-Za-z]*)$/.exec(input);
		if (!m) {
			return null;
		}

		const leadingSpace = m[0][0] === ' ' || m[0][0] === '\t' || m[0][0] === '\n' ? 1 : 0;
		return { prefix: m[2], negate: m[1] === '-', start: m.index + leadingSpace };
	}

	let inputEl: HTMLInputElement | undefined = $state(undefined);
	let focused = $state(false);
	let active = $derived(getActiveField(value));
	let fieldPrefix = $derived(getFieldPrefix(value));
	let showDropdown = $derived(focused && (active !== null || fieldPrefix !== null));
	let suggestionQuery = $derived(
		active ? getSuggestionForField({ field: active.key, prefix: active.prefix }) : undefined
	);
	let suggestions = $derived(
		active?.quoted
			? (suggestionQuery?.current ?? []).filter((s) => s !== 'empty')
			: (suggestionQuery?.current ?? [])
	);
	let filteredFields = $derived(
		fieldPrefix
			? fields.filter((f) => f.toLowerCase().startsWith(fieldPrefix.prefix.toLowerCase()))
			: fields
	);

	function quoteIfNeeded(s: string): string {
		return /[\s"]/.test(s) || s === '' ? `"${s}"` : s;
	}

	function applySuggestion(s: string) {
		if (!active) {
			return;
		}

		const token = `${active.negate ? '-' : ''}${active.key}:${active.operator}${quoteIfNeeded(s)} `;
		value = value.slice(0, active.start) + token;
		inputEl?.focus();
	}

	function insertField(f: string) {
		const sep = value && !/\s$/.test(value) ? ' ' : '';
		value = `${value}${sep}${f}:`;
		inputEl?.focus();
	}

	function completeFieldName(f: string) {
		if (!fieldPrefix) {
			return;
		}

		value = `${value.slice(0, fieldPrefix.start)}${fieldPrefix.negate ? '-' : ''}${f}:`;
		inputEl?.focus();
	}
</script>

<Popover>
	<Popover.Anchor class="w-full">
		<div class="relative w-full">
			<div class="field-group grid w-full grid-cols-[1fr_auto_auto] gap-0">
				<input
					type="search"
					bind:this={inputEl}
					bind:value
					{placeholder}
					class="input w-full preset-tonal"
					onfocus={() => (focused = true)}
					onblur={() => (focused = false)}
				/>
				<button
					class="btn preset-tonal hover:preset-filled-error-500"
					onclick={() => {
						value = '';
					}}
				>
					<X class="size-4" />
				</button>
				<Popover.Trigger class="btn preset-tonal" aria-label={title}>
					<Info class="size-4" />
				</Popover.Trigger>
			</div>
			{#if showDropdown}
				<div
					class="absolute -bottom-2 left-0 z-20 flex w-full min-w-0 translate-y-full flex-col overflow-hidden rounded-container preset-filled-surface-100-900 shadow-lg shadow-surface-50-950"
				>
					{#if active && suggestions.length > 0}
						<div class="flex flex-col">
							{#each suggestions as fs}
								<button
									type="button"
									onmousedown={(e) => e.preventDefault()}
									onclick={() => applySuggestion(fs)}
									class="flex w-full items-center gap-1 border-b border-surface-500 px-2 py-1 text-left text-surface-500 transition-colors last:border-none hover:preset-filled-surface-200-800"
								>
									<span class="text-tertiary-500">{active.key}:</span>
									<span class="min-w-0 flex-1 truncate font-bold text-tertiary-500">
										{active.operator}{quoteIfNeeded(fs)}
									</span>
								</button>
							{/each}
						</div>

						<div class="border-b-4 border-surface-500"></div>
					{/if}

					{#if filteredFields.length > 0}
						<div class="grid grid-cols-2">
							{#each filteredFields as f}
								<button
									type="button"
									class="flex w-full items-center px-2 py-0.5 text-left text-surface-500 transition-colors hover:bg-surface-200-800 hover:text-secondary-500"
									onmousedown={(e) => e.preventDefault()}
									onclick={() =>
										fieldPrefix && fieldPrefix.prefix ? completeFieldName(f) : insertField(f)}
								>
									<span class="text-surface-500">{f}:</span>
								</button>
							{/each}
						</div>
					{:else}
						<p class="px-2 py-0.5 text-sm text-surface-500">No matching fields</p>
					{/if}
				</div>
			{/if}
		</div>
	</Popover.Anchor>
	<Portal>
		<Popover.Positioner>
			<Popover.Content class="z-50 card bg-surface-200-800 p-4 shadow-xl">
				<Popover.Arrow
					class="[--arrow-background:var(--color-surface-200-800)] [--arrow-size:--spacing(2)]"
				>
					<Popover.ArrowTip />
				</Popover.Arrow>
				<div class="max-w-sm space-y-3 text-sm">
					<h2 class="font-semibold">{title}</h2>
					<p>{description}</p>
					<div>
						<p class="mb-1 font-medium">{fieldsTitle}</p>
						<p class="text-surface-500-500">
							{#each fields as field, index (field)}
								<code>{field}:</code>
								{index < fields.length - 1 ? ', ' : ''}
							{/each}
						</p>
					</div>
					<div>
						<p class="mb-1 font-medium">{examplesTitle}</p>
						<ul class="text-surface-500-500 list-inside list-disc space-y-1">
							{#each examples as example (example)}
								<li><code>{example}</code></li>
							{/each}
						</ul>
					</div>
					<p class="text-surface-500-500">{operators}</p>
				</div>
			</Popover.Content>
		</Popover.Positioner>
	</Portal>
</Popover>
