# `project()` — projected coordinates for gradient fills

**Date:** 2026-06-21
**Status:** Approved, pre-implementation

## Problem

You can already fill a wall with an SVG gradient today: face styles pass `fill`
through verbatim (`_buildSvgAttributes`, `src/svg-renderer.js:264`), and
`toSVG({ prepend })` injects a raw `<defs>` block right after the opening `<svg>`
(`src/svg-renderer.js:130`). So `fill: "url(#grad)"` + a prepended
`<linearGradient>` works.

The missing piece is **aiming the gradient**. A `<linearGradient>` with
`gradientUnits="userSpaceOnUse"` needs `x1,y1,x2,y2` in the rendered 2D
coordinate space. The user has no supported way to convert a 3D point into that
space, so they can't make a gradient flow along a wall — especially under
perspective, where projection is non-linear and there is no single constant
"direction vector".

## Solution

Expose the engine's existing private projection as a public primitive.

### `project([x, y, z]) → { x, y }`

- Thin public wrapper over `_projectPoint` (`src/heerich.js:1483`). No new math.
- Input: a 3D point as a `[x, y, z]` array (voxel/world coordinates).
- Output: `{ x, y }` in the **same space as the rendered polygon points** — i.e.
  *before* the `<g transform="translate(offset)">`. This is exactly what a
  `gradientUnits="userSpaceOnUse"` gradient needs, because the gradient is
  referenced from elements inside that same translated `<g>`. No offset is baked
  in, by design.
- Uses the engine's **current** `renderOptions` (camera type, angle/pitch, tile
  sizes, distance). `setCamera()` runs in the constructor and fully resolves
  `renderOptions`, so `project()` is correct immediately after construction and
  after any `setCamera()` call.

### Usage — wall gradient

```js
const a = h.project([0, 0, 5]); // top of wall    → {x, y}
const b = h.project([0, 8, 5]); // bottom of wall → {x, y}

h.toSVG({ prepend:
  `<defs><linearGradient id="wall" gradientUnits="userSpaceOnUse"
     x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}">
     <stop offset="0" stop-color="#f70"/>
     <stop offset="1" stop-color="#70f"/>
   </linearGradient></defs>` });
```

The caller projects the **actual two endpoints** of the gradient axis (not a
direction), so the same code is correct for oblique, orthographic, isometric,
and perspective cameras.

## Scope

In scope:

1. Add `project()` to `src/heerich.js`, delegating to `_projectPoint`, with a
   JSDoc block.
2. README section ("Gradients & projected coordinates") documenting the recipe
   and the perspective non-linearity caveat (project endpoints, not a
   direction).
3. Demo: add a Plain/Gradient toggle to the "Styling faces" section.

Out of scope (YAGNI — user chose the low-level primitive only):

- A high-level `gradientCoords(p0, p1) → {x1,y1,x2,y2}` wrapper.
- Batch projection / projecting many points in one call.
- Any `<defs>`/gradient registration API on the engine.
- Renderer or build changes.

## Demo changes — "Styling faces" Plain/Gradient toggle

The `demo-style` section already has a live `Heerich` instance with Top/Front/
Right colour pickers (`site/site.js:611`, controls in `site/index.html:728`).
`setupDemo` already supports `<select data-bind>` natively (`site/site.js:421,
429`), so the control value arrives in the builder's `v` object with no new
plumbing.

**HTML** (`site/index.html`, in the `demo-style` `.demo-controls`, before the
colour pickers):

```html
<label class="control-label">Fill
  <select data-bind="mode">
    <option value="plain">Plain</option>
    <option value="gradient">Gradient</option>
  </select>
</label>
```

**JS** (`site/site.js`, the `demo-style` builder):

- `v.mode === "plain"` → current behaviour unchanged (solid `fill: v.top` etc.).
- `v.mode === "gradient"` → for each visible face, project its two 3D endpoints
  with `e.project(...)`, emit a `<linearGradient gradientUnits="userSpaceOnUse">`
  into a `<defs>`, and set that face's `fill: "url(#...)"`. The gradient runs
  from the picked colour to a derived second stop (e.g. a darkened variant) so
  the toggle reads clearly.

**Gotcha:** `getSvgOpts()` already sets `prepend` for the cel-shading outline
filter (`site/site.js:354`). The gradient `<defs>` must be **concatenated** onto
any existing `prepend`, never overwrite it.

## Testing

No automated test framework is configured. Verification is manual:

- `npm run build` succeeds (library build unaffected).
- `npm run dev` → "Styling faces" demo: toggling Plain/Gradient changes the
  fill; gradients visibly align to the faces across all four camera types;
  changing the camera re-aims the gradients correctly.
- Confirm the cel-shading outline still works when combined with a gradient fill
  (prepend concatenation, not clobber).
