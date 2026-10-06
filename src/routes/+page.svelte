<!--
  Stalactite — how a cave formation actually grows.

  Water arrives at the tip, runs back up the surface as a thin gravity-driven
  film, loses CO2 to the cave air, and precipitates calcite. Every mole of
  calcium taken out of the film becomes one mole of calcite added to the solid,
  so the growth rate is governed by the calcium the drip water can deliver and by
  how fast the film can shed CO2.

  Nothing about the shape is imposed. The tapered profile emerges because the
  water supply is fixed while the surface that water must cover widens with
  radius.

  A SvelteKit port of the Elm app. The physics in `lib/physics/model.ts` is
  formula-for-formula the same and is pinned to it by `tests/physics.test.ts`.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import * as P from '$lib/physics/model';
	import * as Scene from '$lib/render/scene';
	import { draw } from '$lib/render/canvas';
	import Slider from '$lib/Slider.svelte';
	import * as T from '$lib/theme';

	interface Preset {
		name: string;
		blurb: string;
		env: P.Env;
		stalagmiteM: number;
		chamberM: number;
	}

	const presets: Preset[] = [
		{
			name: 'Cave chamber',
			blurb:
				'A steady, well-fed drip: half a millimole of excess lime, one drop every 42 minutes.',
			env: {
				tempC: 10,
				cavePCO2: 6.0e-4,
				caIn: 1.0,
				dripRate: 2.0e-5,
				wetness: 0.25,
				kineticK: 5.0e-8,
				evaporation: 0,
				maxDepth: 1.6
			},
			stalagmiteM: 0.05,
			chamberM: 1.6
		},
		{
			name: 'Starving drip',
			blurb: 'An old cave with almost no supply: dense, very hard calcite, and a very long wait.',
			env: {
				tempC: 11,
				cavePCO2: 5.0e-4,
				caIn: 0.72,
				dripRate: 3.0e-6,
				wetness: 0.15,
				kineticK: 5.0e-8,
				evaporation: 0,
				maxDepth: 1.6
			},
			stalagmiteM: 0.03,
			chamberM: 1.6
		},
		{
			name: 'Well fed',
			blurb:
				'Plenty of water and lime. This one builds a metre in a few hundred thousand years.',
			env: {
				tempC: 12,
				cavePCO2: 6.0e-4,
				caIn: 1.6,
				dripRate: 5.0e-4,
				wetness: 0.35,
				kineticK: 8.0e-8,
				evaporation: 0,
				maxDepth: 1.6
			},
			stalagmiteM: 0.1,
			chamberM: 1.6
		},
		{
			name: 'Tropical cave',
			blurb:
				'Warm water holds less CO₂ and calcite kinetics run faster, but the extra CO₂ in the air works against it.',
			env: {
				tempC: 22,
				cavePCO2: 9.0e-4,
				caIn: 1.7,
				dripRate: 1.5e-4,
				wetness: 0.3,
				kineticK: 6.0e-8,
				evaporation: 0,
				maxDepth: 1.6
			},
			stalagmiteM: 0.06,
			chamberM: 1.6
		},
		{
			name: 'Drafty passage',
			blurb: 'Dry air sweeps through, so evaporation deposits calcite alongside degassing.',
			env: {
				tempC: 9,
				cavePCO2: 3.0e-4,
				caIn: 1.1,
				dripRate: 4.0e-5,
				wetness: 0.2,
				kineticK: 5.0e-8,
				evaporation: 0.6,
				maxDepth: 1.6
			},
			stalagmiteM: 0.04,
			chamberM: 1.6
		},
		{
			name: 'Undersaturated',
			blurb: 'Drip water poorer in lime than cave air allows. Nothing can be deposited at all.',
			env: {
				tempC: 10,
				cavePCO2: 3.0e-3,
				caIn: 0.7,
				dripRate: 2.0e-5,
				wetness: 0.25,
				kineticK: 5.0e-8,
				evaporation: 0,
				maxDepth: 1.6
			},
			stalagmiteM: 0.0,
			chamberM: 1.6
		}
	];

	// --- state ---------------------------------------------------------------

	let preset = $state<Preset>(presets[0]);
	let env = $state<P.Env>({ ...presets[0].env });
	let sim = $state<P.Sim>(P.initialSim());
	let running = $state(true);
	/** simulated years per real second */
	let speed = $state(80000);
	let clock = $state(0);
	let showRings = $state(true);
	let stalagmiteM = $state(presets[0].stalagmiteM);
	let chamberM = $state(presets[0].chamberM);
	let history = $state<Array<[number, number]>>([[0, P.seedRadius * 1000]]);
	let lastSample = $state(0);

	let canvas = $state<HTMLCanvasElement | null>(null);

	// --- derived -------------------------------------------------------------

	const v = $derived(P.view(env, sim));
	const warning = $derived(v.saturationIndex <= 0.05);
	const dripInterval = $derived(P.dripIntervalFromRate(env.dripRate));

	/** The scene is a value: rebuilt whenever anything it depends on changes. */
	const scene = $derived(
		Scene.draw({
			w: 620,
			h: 720,
			env,
			sim,
			time: clock,
			chamberM,
			showRings,
			stalagmiteM
		})
	);

	/** Log-scale slider mappings, matching the Elm. */
	const rateMin = 5.0e-7;
	const rateMax = 2.0e-3;
	const rateToSlider = (r: number) =>
		Math.min(Math.max(((Math.min(Math.max(r, rateMin), rateMax) / rateMin) ** (1 / 3) - 1), 0), 1);
	const sliderToRate = (x: number) => rateMin * (1 + Math.min(Math.max(x, 0), 1)) ** 3;

	const intervalMin = 100.0;
	const intervalMax = 8.0e5;
	const intervalToSlider = (s: number) =>
		Math.min(
			Math.max(
				Math.log10(Math.min(Math.max(s, intervalMin), intervalMax) / intervalMin) /
					Math.log10(intervalMax / intervalMin),
				0
			),
			1
		);
	const sliderToInterval = (x: number) =>
		intervalMin * (intervalMax / intervalMin) ** Math.min(Math.max(x, 0), 1);

	let rateSlider = $derived(rateToSlider(env.dripRate));
	let intervalSlider = $derived(intervalToSlider(dripInterval));

	// --- animation -----------------------------------------------------------

	onMount(() => {
		let raf = 0;
		let last = performance.now();

		const frame = (now: number) => {
			const dt = Math.min(Math.max((now - last) / 1000, 0), 0.1);
			last = now;
			clock += dt;

			if (running) {
				const slice = Math.min(speed * dt, 40000);
				sim = P.advance(P.defaultParams, env, slice, sim);

				const grain = Math.max(500.0, sim.years / 140);
				if (sim.years - lastSample >= grain) {
					lastSample = sim.years;
					const point: [number, number] = [
						sim.years,
						P.profileAtDepth(P.lengthOf(sim), sim) * 1000
					];
					history = [...history, point].slice(-140);
				}
			}
			raf = requestAnimationFrame(frame);
		};

		raf = requestAnimationFrame(frame);
		return () => cancelAnimationFrame(raf);
	});

	// Draw whenever the scene changes. `$effect` runs after the DOM updates, so
	// the canvas element exists by the time this reads it.
	$effect(() => {
		if (canvas) draw(canvas, scene);
	});

	// --- actions -------------------------------------------------------------

	function applyPreset(p: Preset) {
		preset = p;
		env = { ...p.env };
		sim = P.initialSim();
		history = [[0, P.seedRadius * 1000]];
		lastSample = 0;
		stalagmiteM = p.stalagmiteM;
		chamberM = p.chamberM;
	}

	function newStalactite() {
		sim = P.resetSim(sim);
		history = [[0, P.seedRadius * 1000]];
		lastSample = 0;
	}

	// --- chart ---------------------------------------------------------------

	const yMax = $derived(Math.max(3.0, ...history.map((h) => h[1])));
	const bars = $derived(
		history.map((h, i) => ({
			frac: Math.min(Math.max(h[1] / yMax, 0), 1),
			alpha: 0.25 + 0.6 * ((i + 1) / history.length)
		}))
	);
</script>

<svelte:head>
	<title>Stalactite — the physics of cave growth</title>
	<meta
		name="description"
		content="A physically grounded simulation of stalactite growth: a Nusselt water film, CO2 degassing, and calcite deposition solved from the calcium budget."
	/>
</svelte:head>

<div
	style="min-height:100vh;background:#05070a;color:{T.ink};font:13px ui-sans-serif, system-ui, sans-serif;display:flex;flex-direction:column;gap:12px;padding:16px 16px 28px;box-sizing:border-box"
>
	<!-- header -->
	<div
		style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;max-width:1600px;width:100%;margin:0 auto"
	>
		<div style="display:flex;flex-direction:column;gap:3px">
			<div style="font:600 20px ui-sans-serif, system-ui, sans-serif;letter-spacing:-0.015em">
				Stalactite
			</div>
			<div style="font:11.5px ui-sans-serif, system-ui, sans-serif;color:{T.dim}">
				calcite growth solved from the calcium budget of a thin water film
			</div>
		</div>
		<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
			<span style={T.badgeStyle(T.water)}>elapsed {T.formatYears(sim.years)}</span>
			<span style={T.badgeStyle(T.accent)}>{preset.name}</span>
			<span style={T.badgeStyle(T.faint)}>SvelteKit</span>
		</div>
	</div>

	<div
		style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;justify-content:center"
	>
		<!-- left column: controls -->
		<div style="width:312px;flex:0 0 312px;display:flex;flex-direction:column;gap:12px">
			<div style={T.sheetStyle}>
				<div style={T.sectionStyle}>
					<div style={T.sectionTitleStyle}>Run</div>
					<div style="display:flex;flex-wrap:wrap;gap:6px">
						<button style={T.buttonStyle(running)} onclick={() => (running = !running)}>
							{running ? '❚❚  Pause' : '▶  Run'}
						</button>
						<button style={T.buttonStyle(false)} onclick={newStalactite}>⟲  New stalactite</button>
						<button style={T.buttonStyle(showRings)} onclick={() => (showRings = !showRings)}>
							≡  Years
						</button>
					</div>
					<Slider
						label="Time-lapse"
						bind:value={speed}
						min={1000}
						max={2000000}
						step={1000}
						format={T.formatSpeed}
						note="Simulated cave time per real second. A stalactite needs hundreds of thousands of years."
					/>
					<Slider
						label="Chamber height"
						bind:value={chamberM}
						min={0.4}
						max={1.6}
						step={0.05}
						format={(x) => `${Math.round(x * 100) / 100} m`}
						note="Ceiling to floor. When the tip reaches the floor it becomes a column."
					/>
				</div>

				<div style="height:1px;background:{T.faint};opacity:0.4;margin:2px 0"></div>

				<div style={T.sectionStyle}>
					<div style={T.sectionTitleStyle}>Water supply</div>
					<Slider
						label="Drip rate"
						bind:value={rateSlider}
						min={0}
						max={1}
						step={0.005}
						format={() => T.formatRateText(env.dripRate)}
						note={`one drop every ${T.formatInterval(dripInterval)}  ·  ${Math.round(env.dripRate * 525.6 * 1000) / 1000} L / yr`}
					/>
					<Slider
						label="Drip interval"
						bind:value={intervalSlider}
						min={0.02}
						max={1}
						step={0.005}
						format={() => T.formatInterval(dripInterval)}
						note="The same supply read as a rhythm. Real cave drips run from a second to a day."
					/>
					<Slider
						label="Surface wetness"
						bind:value={env.wetness}
						min={0.02}
						max={1.0}
						step={0.01}
						format={(x) => `${Math.round(x * 100)} % of circumference`}
						note="A starving stalactite carries a narrow rivulet; a well-fed one is sheathed."
					/>
				</div>
			</div>

			<div style={T.sheetStyle}>
				<div style={T.sectionStyle}>
					<div style={T.sectionTitleStyle}>Water chemistry</div>
					<Slider
						label="Calcium in drip water"
						bind:value={env.caIn}
						min={0.2}
						max={4.0}
						step={0.01}
						format={(x) => `${Math.round(x * 100) / 100} mmol / L`}
						note="Set by limestone dissolution along the flow path: usually 0.7–2."
					/>
					<Slider
						label="Cave air CO₂"
						bind:value={env.cavePCO2}
						min={2.0e-4}
						max={6.0e-3}
						step={2.5e-5}
						format={(x) => `${Math.round(x * 1.0e6)} ppm`}
						note="Drip water equilibrates to this, which fixes the calcium it cannot keep."
					/>
					<Slider
						label="Temperature"
						bind:value={env.tempC}
						min={0}
						max={30}
						step={0.5}
						format={(x) => `${Math.round(x * 100) / 100} °C`}
						note="Calcite is less soluble in warm water, but so is CO₂."
					/>
					<Slider
						label="Deposition coefficient k"
						bind:value={env.kineticK}
						min={5.0e-9}
						max={5.0e-7}
						step={1.0e-9}
						format={(x) => `${Math.round((x * 1.0e9) * 1000) / 1000} nm / s`}
						note="Exchange velocity k. Literature values for calcite in thin films run from 0.4 to 10 mm/s; the effective rate over a whole stalactite is far smaller."
					/>
					<Slider
						label="Evaporation"
						bind:value={env.evaporation}
						min={0}
						max={1}
						step={0.05}
						format={(x) => `${Math.round(x * 100)} %`}
						note="Only in dry, draughty passages. A second, non-CO₂ growth path."
					/>
				</div>
			</div>

			<div style={T.sheetStyle}>
				<div style={T.sectionStyle}>
					<div style={T.sectionTitleStyle}>Cave analogues</div>
					{#each presets as p (p.name)}
						<button
							style={T.buttonStyle(p.name === preset.name)}
							onclick={() => applyPreset(p)}
						>
							{p.name}
						</button>
						<div
							style="font:10px ui-sans-serif, system-ui, sans-serif;color:{T.faint};line-height:1.45;margin:-2px 0 6px 2px"
						>
							{p.blurb}
						</div>
					{/each}
				</div>
			</div>
		</div>

		<!-- centre: the cave -->
		<div
			style="position:relative;flex:1 1 420px;min-width:320px;max-width:780px;border-radius:12px;overflow:hidden;border:1px solid {T.faint};background:#06080b"
		>
			<canvas
				bind:this={canvas}
				width={620}
				height={720}
				style="display:block;width:100%;height:auto"
			></canvas>
			<div
				style="position:absolute;top:10px;left:14px;font:500 10px ui-monospace, monospace;letter-spacing:0.14em;text-transform:uppercase;color:{T.faint}"
			>
				cave chamber · cross-section
			</div>
			<div
				style="position:absolute;top:10px;right:14px;font:600 10px ui-monospace, monospace;letter-spacing:0.1em;color:{T.dim}"
			>
				{running ? `×  ${T.formatSpeed(speed)}` : 'paused'}
			</div>
		</div>

		<!-- right column: readouts -->
		<div style="width:330px;flex:0 0 330px;display:flex;flex-direction:column;gap:12px">
			<div style={T.sheetStyle}>
				<div style={T.sectionStyle}>
					<div style={T.sectionTitleStyle}>Growth</div>
					<div style={T.rowStyle}>
						<span style="color:{T.dim}">tip advance</span>
						<span style="{T.rowValueStyle};color:{warning ? T.warn : T.accent}"
							>{T.formatRate(v.tipGrowthMmPerYear)}</span
						>
					</div>
					<div style={T.rowStyle}>
						<span style="color:{T.dim}">wall thickening</span>
						<span style="{T.rowValueStyle};color:{T.ink}"
							>{T.formatRate(v.wallGrowthMmPerYear)}</span
						>
					</div>
					<div style={T.rowStyle}>
						<span style="color:{T.dim}">length</span>
						<span style="{T.rowValueStyle};color:{T.ink}"
							>{Math.round(v.length * 100 * 100) / 100} cm</span
						>
					</div>
					<div style={T.rowStyle}>
						<span style="color:{T.dim}">tip diameter</span>
						<span style="{T.rowValueStyle};color:{T.ink}"
							>{Math.round(v.apexRadius * 2000 * 1000) / 1000} mm</span
						>
					</div>
					<div style={T.rowStyle}>
						<span style="color:{T.dim}">calcite deposited</span>
						<span style="{T.rowValueStyle};color:{T.ink}">{T.formatMass(v.massGrams)}</span>
					</div>
					<div style={T.rowStyle}>
						<span style="color:{T.dim}">surface area</span>
						<span style="{T.rowValueStyle};color:{T.dim}"
							>{Math.round(v.surfaceAreaM2 * 1.0e4 * 1000) / 1000} cm²</span
						>
					</div>
					<div style={T.rowStyle}>
						<span style="color:{T.dim}">elapsed</span>
						<span style="{T.rowValueStyle};color:{T.dim}">{T.formatYears(sim.years)}</span>
					</div>
					{#if warning}
						<div style={T.hintStyle}>
							⚠ The drip water is at or below calcite equilibrium for this cave air, so nothing
							can precipitate. Raise the calcium or lower the CO₂.
						</div>
					{:else}
						<div style={T.hintStyle}>
							The tip advances at γ times the wall thickening, because a fixed taper means the
							whole profile grows together.
						</div>
					{/if}
				</div>
			</div>

			<div style={T.sheetStyle}>
				<div style={T.sectionStyle}>
					<div style={T.sectionTitleStyle}>Water film</div>
					<div style={T.rowStyle}>
						<span style="color:{T.dim}">thickness</span>
						<span style="{T.rowValueStyle};color:{T.water}"
							>{Math.round(v.filmMicrons * 100) / 100} µm</span
						>
					</div>
					<div style={T.rowStyle}>
						<span style="color:{T.dim}">downslope speed</span>
						<span style="{T.rowValueStyle};color:{T.water}"
							>{Math.round(v.filmVelocityMmS * 1000) / 1000} mm / s</span
						>
					</div>
					<div style={T.rowStyle}>
						<span style="color:{T.dim}">wetted perimeter</span>
						<span style="{T.rowValueStyle};color:{T.water}"
							>{Math.round(v.wettedPerimeterMm * 1000) / 1000} mm</span
						>
					</div>
					<div style={T.rowStyle}>
						<span style="color:{T.dim}">CO₂ degassing time</span>
						<span style="{T.rowValueStyle};color:{T.water}">{T.formatSeconds(v.degasSeconds)}</span>
					</div>
					<div style={T.rowStyle}>
						<span style="color:{T.dim}">film residence time</span>
						<span style="{T.rowValueStyle};color:{T.water}"
							>{T.formatSeconds(v.residenceSeconds)}</span
						>
					</div>
					<div style={T.rowStyle}>
						<span style="color:{T.dim}">Reynolds number</span>
						<span style="{T.rowValueStyle};color:{T.dim}">{T.formatSmall(v.reynolds)}</span>
					</div>
					<div style={T.hintStyle}>
						{v.degasSeconds < v.residenceSeconds
							? 'The film sheds its CO₂ long before it leaves the surface, so the water finishes the climb close to equilibrium.'
							: 'The film is too thick to finish degassing: the water still carries excess CO₂ at the tip.'}
					</div>
				</div>
			</div>

			<div style={T.sheetStyle}>
				<div style={T.sectionStyle}>
					<div style={T.sectionTitleStyle}>Chemistry</div>
					<div style={T.rowStyle}>
						<span style="color:{T.dim}">calcium arriving</span>
						<span style="{T.rowValueStyle};color:{T.ok}"
							>{Math.round(v.caIn * 100) / 100} mmol / L</span
						>
					</div>
					<div style={T.rowStyle}>
						<span style="color:{T.dim}">at equilibrium with cave air</span>
						<span style="{T.rowValueStyle};color:{T.dim}"
							>{Math.round(v.caEq * 1000) / 1000} mmol / L</span
						>
					</div>
					<div style={T.rowStyle}>
						<span style="color:{T.dim}">excess at the tip</span>
						<span style="{T.rowValueStyle};color:{T.accent}"
							>{Math.round(v.apexExcess * 1000) / 1000} mmol / L</span
						>
					</div>
					<div style={T.rowStyle}>
						<span style="color:{T.dim}">saturation index</span>
						<span style="{T.rowValueStyle};color:{warning ? T.warn : T.ok}"
							>{Math.round(v.saturationIndex * 100) / 100}</span
						>
					</div>
					<div style={T.rowStyle}>
						<span style="color:{T.dim}">depletion length L = Q / kP</span>
						<span style="{T.rowValueStyle};color:{T.accent}"
							>{Math.round(v.depletionLengthM * 100) / 100} m</span
						>
					</div>
					<div
						style="height:4px;border-radius:2px;background:rgba(255,255,255,0.07);overflow:hidden"
					>
						<div
							style="height:100%;background:{T.accent};border-radius:2px;width:{Math.min(Math.max(v.apexExcess / 5, 0), 1) * 100}%"
						></div>
					</div>
					<div style={T.hintStyle}>
						{v.depletionLengthM > v.length * 1.5
							? 'L is longer than the formation, so the film still carries excess calcium when it reaches the tip: the whole surface grows, and the tip runs ahead.'
							: 'L is shorter than the formation, so most of the calcium is spent near the ceiling and the lower shaft starves.'}
					</div>
					<div style={T.hintStyle}>SI = log₁₀(Ca / Ca_eq). Cave drip waters run from about 0.3 to 1.2.</div>
				</div>
			</div>

			<div style={T.sheetStyle}>
				<div style={T.sectionStyle}>
					<div style={T.sectionTitleStyle}>Growth curve</div>
					<div
						style="position:relative;height:92px;border-left:1px solid {T.faint};border-bottom:1px solid {T.faint};margin-top:2px"
					>
						<div
							style="position:absolute;inset:0;display:flex;align-items:flex-end;gap:1px;padding:0 1px"
						>
							{#each bars as bar, i (i)}
								<div
									style="flex:1 1 0;border-radius:1px 1px 0 0;height:{Math.max(1, bar.frac * 100)}%;background:rgba(224,176,112,{bar.alpha})"
								></div>
							{/each}
						</div>
						<div
							style="position:absolute;top:-2px;right:2px;font:600 9.5px ui-monospace, monospace;color:{T.faint}"
						>
							{Math.round(yMax * 100) / 100} mm
						</div>
					</div>
					<div style={T.hintStyle}>
						Tip diameter against elapsed time. The curve flattens as the widening tip spreads the
						same water over more surface.
					</div>
				</div>
			</div>

			<div style={T.sheetStyle}>
				<div style={T.sectionStyle}>
					<div style={T.sectionTitleStyle}>What the model solves</div>
					<div style={T.rowStyle}>
						<span style="color:{T.dim}">supply</span>
						<span style="{T.rowValueStyle};color:{T.dim}">q from the drip rate</span>
					</div>
					<div style={T.rowStyle}>
						<span style="color:{T.dim}">film</span>
						<span style="{T.rowValueStyle};color:{T.dim}">Nusselt  h ∝ (νq/gP)^⅓</span>
					</div>
					<div style={T.rowStyle}>
						<span style="color:{T.dim}">degassing</span>
						<span style="{T.rowValueStyle};color:{T.dim}">k = D/h²</span>
					</div>
					<div style={T.rowStyle}>
						<span style="color:{T.dim}">chemistry</span>
						<span style="{T.rowValueStyle};color:{T.dim}">carbonate system, bisected</span>
					</div>
					<div style={T.rowStyle}>
						<span style="color:{T.dim}">deposition</span>
						<span style="{T.rowValueStyle};color:{T.dim}">R = k(c − c_eq)</span>
					</div>
					<div style={T.rowStyle}>
						<span style="color:{T.dim}">shape</span>
						<span style="{T.rowValueStyle};color:{T.dim}">cone, L from deposited V</span>
					</div>
					<div style={T.hintStyle}>
						Equilibrium calcium is solved from the full carbonate system by geometric bisection.
						{160} nodes along the surface, 8 mm apart.
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
