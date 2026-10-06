/**
 * A labelled range input with a live value readout.
 *
 * Svelte 5 runes: `value` is bound two-way with `$bindable`, and the displayed
 * text comes from the `format` callback so each caller can pick its own units.
 */
<script lang="ts">
	interface Props {
		label: string;
		value: number;
		min: number;
		max: number;
		step: number;
		format: (v: number) => string;
		note?: string;
	}

	let { label, value = $bindable(), min, max, step, format, note }: Props = $props();
</script>

<div style="display:flex;flex-direction:column;gap:3px">
	<div
		style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"
	>
		<span style="font:500 11.5px ui-sans-serif, system-ui, sans-serif;color:#e8eef6">{label}</span
		>
		<span
			style="font:600 11.5px ui-monospace, monospace;color:#e0b070;white-space:nowrap"
			>{format(value)}</span
		>
	</div>
	<input
		type="range"
		{min}
		{max}
		{step}
		bind:value
		style="width:100%;height:18px;accent-color:#e0b070;cursor:pointer;background:transparent"
	/>
	{#if note}
		<div style="font:400 10.5px ui-sans-serif, system-ui, sans-serif;color:#5a6675;line-height:1.45">
			{note}
		</div>
	{/if}
</div>
