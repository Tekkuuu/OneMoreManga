<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';
	import { ToggleGroup } from 'bits-ui';
	import { twMerge } from 'tailwind-merge';

	interface Props {
		class?: string;
		ariaLabel?: string;
		value: string;
		viewModes: {
			value: string;
			icon?: LucideIcon;
			text?: string;
		}[];
	}

	let { value = $bindable(), viewModes, ariaLabel, ...props }: Props = $props();
</script>

<ToggleGroup.Root
	bind:value
	type="single"
	aria-label={ariaLabel}
	class={twMerge('field-group flex gap-0', props.class)}
>
	{#each viewModes as vm}
		<ToggleGroup.Item
			aria-label={vm.text ?? vm.value}
			value={vm.value}
			class={['btn', vm.value === value ? 'preset-filled-surface-950-50' : 'preset-tonal']}
		>
			{#if vm.icon}
				{@const Icon = vm.icon}
				<Icon class="size-4" />
			{/if}
			{#if vm.text}
				<span>{vm.text}</span>
			{/if}
		</ToggleGroup.Item>
	{/each}
</ToggleGroup.Root>
