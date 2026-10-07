# Stalactite — SvelteKit

A SvelteKit port of the Elm app in the parent directory. Same physics, same
scene, same instrument panel; the model is reproduced formula-for-formula and
pinned to the Elm build by a parity test.

## Run it

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # static site into build/
npm run preview    # serve the production build
npm test           # physics parity + renderer tests
npm run check      # svelte-check, strict TypeScript
```

`adapter-static` prerenders the whole app to plain files, so `build/` can be
served by any static host. `npm run build` needs `svelte-kit sync` to have run
once; the `build` script does not assume it, so run `npx svelte-kit sync` if you
see a missing `.svelte-kit/tsconfig.json`.

## What is ported

| Elm | SvelteKit |
| --- | --- |
| `src/Physics.elm` | `src/lib/physics/model.ts` |
| `src/Canvas.elm` | `src/lib/render/canvas.ts` |
| `src/Scene.elm` | `src/lib/render/scene.ts` |
| `src/Ui.elm` | `src/lib/theme.ts`, `src/lib/Slider.svelte` |
| `src/Main.elm` | `src/routes/+page.svelte` |
| `js/main.js` | folded into `+page.svelte` as a `$effect` |

The port is deliberately structural, not idiomatic-to-the-point-of-differing:

- **The physics is a pure module.** `model.ts` has no imports, no Svelte, no DOM.
  It is the same set of functions with the same signatures, so it can be read
  side by side with the Elm and unit-tested without a browser.
- **The scene is a value.** `scene.ts` returns a list of `Shape` records and
  `canvas.ts` renders them. Nothing else touches the canvas context. In the Elm
  this list crossed a port; here it is an ordinary return value, which is the one
  place the Svelte version is genuinely simpler.
- **State lives in one component.** `+page.svelte` holds the environment, the
  simulation, the clock and the history, exactly as the Elm `Model` did, using
  Svelte 5 runes (`$state`, `$derived`, `$effect`).

## The parity test

`tests/physics.test.ts` compares this port against values emitted from the Elm
build, so it checks two independent implementations of the same equations rather
than the port against itself. `tests/golden.json` was generated from the Elm.

It covers the constants, the whole film family, the carbonate chemistry (the
bisection is the delicate part — a wrong bracket still converges, just to a
different root), the geometry, the integration, every `view` field, the
per-frame animation loop, and conservation:

```
96/96 checks passed
port matches the Elm model
```

Tolerances are relative and set at 1e-12. These are physics results carried
through `Math.exp` and `Math.cbrt`, so bit-exactness is not a fair bar; anything
above one part in 1e12 means the formulas differ rather than the arithmetic.

`tests/render.test.ts` exercises the renderer against a recording 2D context:
every primitive kind, the device-pixel-ratio backing store, and that a dashed
stroke does not leak into the next shape.

## Bugs found while porting

Comparing two implementations found three real defects, which were fixed in
**both**:

1. **The cone's stored radius array used the wrong slope.** It was built as
   `tipFloor + tipTaper * i * spacing`, which only reaches the right mouth radius
   if the grid happens to span the whole length. `volumeOf` therefore disagreed
   with the closed-form shape law. The profile is now anchored to the modelled
   depth, so the two agree to 1e-15.
2. **The seed nub contributed no calcite.** The length is inverted from the
   accumulated deposit, so a state starting at zero reported a length of zero and
   the seed vanished. `initialState` now carries the seed's own volume, so the
   length at t = 0 is exactly its true 12 mm.
3. **The grid span was unbounded.** The radius array covers 160 × 8 mm = 1.28 m;
   growing past that was invisible while the shape law still reported a longer
   formation. The modelled depth is now clamped to the grid.

## Deployed

Live at **https://stalactite-svelte.stalactite.workers.dev**, beside the
[Elm version](https://stalactite.stalactite.workers.dev) and the
[Angular version](https://stalactite-angular.stalactite.workers.dev).

`wrangler.jsonc` deploys it as a Worker serving static assets, the same pattern
as the Elm version, under a **separate Worker name** (`stalactite-svelte`) so the
two can be compared side by side.

```sh
export CLOUDFLARE_API_TOKEN=...      # token with the "Edit Cloudflare Workers" template
export CLOUDFLARE_ACCOUNT_ID=...     # `npx wrangler whoami` prints it
npm run build && npx wrangler deploy
npm run verify:deploy                # confirm the live site matches build/
```

`verify:deploy` fetches the shell and the whole ES module graph from the live
site, hashes each module and compares against `build/`. A deploy that uploaded
stale or partial assets fails there rather than in the browser.

## Caveats

Same as the Elm version: one stalactite receives the whole drip, so the rates are
upper bounds; `k` is a slider because the effective exchange velocity over a
whole formation is far below laboratory thin-film values; the tip profile is
tracked by radius rather than solved as a free-boundary problem; stalagmites and
columns are scenery.
