# heerich.js

A tiny engine for 3D voxel scenes rendered to SVG. Build shapes with CSG-like boolean operations, style individual faces, and output crisp vector graphics — no WebGL, no canvas, just `<svg>`.

Named after [Erwin Heerich](https://en.wikipedia.org/wiki/Erwin_Heerich), the German sculptor known for geometric cardboard sculptures.

## Install

```bash
npm install heerich
```

```js
import { Heerich } from 'heerich'
```

Or use the UMD build via a `<script>` tag — the global `Heerich` will be available.

## Quick Start

```js
import { Heerich } from 'heerich'

const h = new Heerich({
  tile: 40,
  camera: { type: 'oblique', angle: 45, distance: 15 },
})

// A simple house
h.applyGeometry({ type: 'box', position: [0, 0, 0], size: [5, 4, 5], style: {
  default: { fill: '#e8d4b8', stroke: '#333' },
  top:     { fill: '#c94c3a' },
}})

// Carve out a door
h.removeGeometry({
  type: 'box',
  position: [2, 1, 0],
  size: [1, 3, 1]
})

document.body.innerHTML = h.toSVG()
```

## Camera

The engine exposes four projection types:

- **oblique** (default): Parallel projection where depth recedes at a configurable angle. Classic pixel-art / cabinet-projection look.
- **perspective**: Single-vanishing-point projection with an explicit camera position.
- **orthographic**: True 3D parallel projection with configurable pan (`angle`) and tilt (`pitch`). Use this for dimetric, trimetric, or any custom orthographic view.
- **isometric**: Orthographic preset with pitch locked to 35.264°. For the classic isometric diamond grid.

```js
// Oblique (parallel)
new Heerich({ camera: { type: 'oblique', angle: 45, distance: 15 } })

// Perspective (1-point)
new Heerich({ camera: { type: 'perspective', position: [5, 5], distance: 10 } })

// Orthographic (parallel 3D)
new Heerich({ camera: { type: 'orthographic', angle: 45, pitch: 35.264 } })

// Isometric (orthographic with fixed pitch)
new Heerich({ camera: { type: 'isometric', angle: 45 } })

// Update camera at any time
h.setCamera({ angle: 30, distance: 20 })
```

### The `angle` parameter

The `angle` parameter is shared across camera types for easy switching, but its meaning differs:

| Type | `angle` controls | Default |
|------|-----------------|---------|
| `oblique` | Direction the depth (Z) axis recedes | 45° |
| `orthographic` | Horizontal rotation (pan) around the scene | 45° |
| `isometric` | Horizontal rotation — recommended values: 45°, 135°, 225°, 315° | 45° |
| `perspective` | (Mapped to camera X position) | — |

For isometric, any `angle` value works, but **45°, 135°, 225°, and 315°** produce the standard isometric orientations where edges align to the pixel grid.

> **Note**: `orthographic` and `isometric` use parallel projection — `distance` has no effect in these modes.

## Shapes

All shape methods accept a common set of options:

| Option    | Type | Description |
|-----------|------|-------------|
| `mode`    | `'union'` \| `'subtract'` \| `'intersect'` \| `'exclude'` | Boolean operation (default: `'union'`) |
| `style`   | object or function | Per-face styles (see [Styling](#styling)) |
| `content` | string | Raw SVG content to render instead of polygon faces |
| `opaque`  | boolean | Whether this voxel occludes neighbors (default: `true`) |
| `meta`    | object | Key/value pairs emitted as `data-*` attributes on SVG polygons |
| `rotate`  | object | Rotate coordinates before placement (see [Rotation](#rotation)) |
| `scale`   | `[x, y, z]` or `(x, y, z) => [sx, sy, sz]` | Per-axis scale 0–1 (auto-sets `opaque: false`) |
| `scaleOrigin` | `[x, y, z]` or `(x, y, z) => [ox, oy, oz]` | Scale anchor within the voxel cell (default: `[0.5, 0, 0.5]`) |
| `gap`   | number | Gap between voxels, 0–0.5 (overrides constructor default) |
| `slope` | string or `(x, y, z) => string \| null` | Make voxels ramps, corners or tips (see [Slopes](#slopes)) |

#### Convenience methods

- `addGeometry(opts)` — shortcut for `applyGeometry({ ...opts, mode: 'union' })`
- `removeGeometry(opts)` — shortcut for `applyGeometry({ ...opts, mode: 'subtract' })`

#### Uniform positioning

Box, sphere, and fill all accept both `position` (min-corner) and `center` (geometric center) — the engine converts between them automatically based on the shape's size:

```js
// These are equivalent for a 5×5×5 box:
h.applyGeometry({ type: 'box', position: [0, 0, 0], size: 5 })
h.applyGeometry({ type: 'box', center: [2, 2, 2], size: 5 })

// These are equivalent for a sphere with radius 3:
h.applyGeometry({ type: 'sphere', center: [3, 3, 3], radius: 3 })
h.applyGeometry({ type: 'sphere', position: [0, 0, 0], radius: 3 })
h.applyGeometry({ type: 'sphere', center: [3, 3, 3], size: 7 })
```

Fill also accepts `position`/`center` + `size` as an alternative to `bounds`.

### Box

```js
h.applyGeometry({
  type: 'box',
  position: [0, 0, 0],
  size: [3, 2, 4]
})
h.removeGeometry({
  type: 'box',
  position: [1, 0, 1],
  size: 1
})

// Style the carved walls (optional)
h.removeGeometry({
  type: 'box',
  position: [0, 0, 0],
  size: 1,
  style: { default: { fill: '#222' } }
})
```

### Sphere

```js
h.applyGeometry({
  type: 'sphere',
  center: [5, 5, 5],
  radius: 3
})
h.removeGeometry({
  type: 'sphere',
  center: [5, 5, 5],
  radius: 1.5
})

// Style the carved walls (optional)
h.removeGeometry({
  type: 'sphere',
  center: [5, 5, 5],
  radius: 1,
  style: { default: { fill: '#222' } }
})
```

### Line

Lines are the only shape that uses different positioning — `from`/`to` instead of `position`/`center` + `size`:

```js
h.applyGeometry({
  type: 'line',
  from: [0, 0, 0],
  to: [10, 5, 0]
})

// Thick rounded line
h.applyGeometry({
  type: 'line',
  from: [0, 0, 0],
  to: [10, 0, 0],
  radius: 2,
  shape: 'rounded'
})

// Thick square line
h.applyGeometry({
  type: 'line',
  from: [0, 0, 0],
  to: [0, 10, 0],
  radius: 1,
  shape: 'square'
})

h.removeGeometry({
  type: 'line',
  from: [3, 0, 0],
  to: [7, 0, 0]
})
```

### Custom Shapes

`applyGeometry` with `type: 'fill'` is the general-purpose shape primitive — define any shape as a function of `(x, y, z)`. Boxes, spheres, and lines are just convenience wrappers around this pattern.

```js
// Hollow sphere
h.applyGeometry({
  type: 'fill',
  bounds: [[-6, -6, -6], [6, 6, 6]],
  test: (x, y, z) => {
    const d = x*x + y*y + z*z
    return d <= 25 && d >= 16
  }
})

// Torus
h.applyGeometry({
  type: 'fill',
  bounds: [[-8, -3, -8], [8, 3, 8]],
  test: (x, y, z) => {
    const R = 6, r = 2
    const q = Math.sqrt(x*x + z*z) - R
    return q*q + y*y <= r*r
  }
})

h.removeGeometry({
  type: 'fill',
  bounds: [[0, -6, -6], [6, 6, 6]],
  test: () => true
})
```

Combine with functional `scale` and `style` for fully procedural shapes — closest thing to a voxel shader.

## Boolean Operations

All shape methods support a `mode` option for CSG-like operations:

```js
// Union (default) — add voxels
h.applyGeometry({
  type: 'box',
  position: [0, 0, 0],
  size: 5
})

// Subtract — carve out voxels
h.applyGeometry({
  type: 'sphere',
  center: [2, 2, 2],
  radius: 2,
  mode: 'subtract'
})

// Intersect — keep only the overlap
h.applyGeometry({
  type: 'box',
  position: [1, 1, 1],
  size: 3,
  mode: 'intersect'
})

// Exclude — XOR: add where empty, remove where occupied
h.applyGeometry({
  type: 'box',
  position: [0, 0, 0],
  size: 5,
  mode: 'exclude'
})
```

### Styling carved faces

When removing voxels, you can pass a `style` to color the newly exposed faces of neighboring voxels — the "walls" of the carved hole:

```js
h.applyGeometry({
  type: 'box',
  position: [0, 0, 0],
  size: 10
})

// Carve a hole with dark walls
h.removeGeometry({
  type: 'box',
  position: [3, 3, 0],
  size: [4, 4, 5],
  style: { default: { fill: '#222', stroke: '#111' } }
})
```

This works on `removeGeometry` (with any type) and on `applyGeometry` with `mode: 'subtract'`. Without a `style`, subtract behaves as before — just deleting voxels.

## Styling

Styles are set per face name: `default`, `top`, `bottom`, `left`, `right`, `front`, `back`.
Each face style is an object with SVG presentation attributes (`fill`, `stroke`, `strokeWidth`, etc.).

```js
h.applyGeometry({
  type: 'box',
  position: [0, 0, 0],
  size: 3,
  style: {
    default: { fill: '#6699cc', stroke: '#234' },
    top:     { fill: '#88bbee' },
    front:   { fill: '#557799' },
  }
})
```

### Axis shorthand

Besides the six face names, a style object accepts the axis shorthands `x`
(`left` + `right`), `y` (`top` + `bottom`) and `z` (`front` + `back`) to paint
both faces of an axis at once. Precedence is `default` < axis < explicit face,
so an explicit face always overrides the axis shorthand regardless of key order:

```js
h.applyGeometry({
  type: 'box',
  position: [0, 0, 0],
  size: 3,
  style: {
    default: { fill: '#eee', stroke: '#333' },
    x: { fill: '#e2d058' }, // left + right
    y: { fill: '#f1a03c' }, // top + bottom
    z: { fill: '#0e0e0e' }, // front + back
    right: { fill: '#c0392b' }, // overrides x on the right face only
  }
})
```

### Dynamic styles

Style values can be functions of `(x, y, z)`:

```js
h.applyGeometry({
  type: 'box',
  position: [0, 0, 0],
  size: 8,
  style: {
    default: (x, y, z) => ({
      fill: `hsl(${x * 40}, 60%, ${50 + z * 5}%)`,
      stroke: '#222',
    })
  }
})
```

### Restyling

Restyle existing voxels without adding or removing them:

```js
h.applyStyle({
  type: 'box',
  position: [0, 0, 0],
  size: 3,
  style: { top: { fill: 'red' } }
})
h.applyStyle({
  type: 'sphere',
  center: [5, 5, 5],
  radius: 2,
  style: { default: { fill: 'gold' } }
})
h.applyStyle({
  type: 'line',
  from: [0, 0, 0],
  to: [10, 0, 0],
  radius: 1,
  style: { default: { fill: 'blue' } }
})
```

### Gradients & projected coordinates

Face styles pass `fill` through verbatim, so an SVG gradient works as a fill —
`fill: 'url(#myGradient)'` — as long as you inject the gradient's `<defs>` via
`toSVG({ prepend })`.

To make a gradient flow along a wall you need its `x1,y1,x2,y2` in the rendered
2D space. Use `project([x, y, z])` to convert a 3D point into that space, then
feed a `<linearGradient>` with `gradientUnits="userSpaceOnUse"`:

```js
const a = h.project([0, 0, 5]); // top of wall    → {x, y}
const b = h.project([0, 8, 5]); // bottom of wall → {x, y}

h.applyStyle({ type: 'box', position: [0, 0, 0], size: 8, style: { right: { fill: 'url(#wall)' } } });

h.toSVG({ prepend:
  `<defs><linearGradient id="wall" gradientUnits="userSpaceOnUse"
     x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}">
     <stop offset="0" stop-color="#f70"/>
     <stop offset="1" stop-color="#70f"/>
   </linearGradient></defs>` });
```

`project()` returns coordinates that match the rendered polygon points (before
the translate `toSVG` applies), which is exactly what `userSpaceOnUse` gradients
need. It reflects the current camera, so call it after `setCamera()`.

Under perspective the projection is non-linear — there is no single constant
"gradient direction". Always project the wall's **two actual endpoints** (as
above) rather than projecting a direction vector; the same code then stays
correct for oblique, orthographic, isometric, and perspective cameras.

### Aligning fills to a face — `faceTransform()`

Where `project()` maps a single point, `faceTransform(face)` maps a whole face:
it returns an SVG `matrix(a b c d e f)` that maps the unit square `[0,1]²` onto
that face's projected quad. Define a gradient (or pattern) once in 0–1 space and
drop the matrix on as `gradientTransform` — it now follows the face. This covers
what endpoint projection can't: radial gradients, diagonal axes, and patterns.

```js
const faces = h.getFaces();
const defs = faces.map((f, i) =>
  `<radialGradient id="g${i}" gradientUnits="userSpaceOnUse"
     cx="0.5" cy="0.5" r="0.5" gradientTransform="${h.faceTransform(f)}">
     <stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#70f"/>
   </radialGradient>`);

h.toSVG({
  faces, // reuse the same faces we transformed
  faceAttributes: (f) => ({ fill: `url(#g${faces.indexOf(f)})` }),
  prepend: `<defs>${defs.join('')}</defs>`,
});
```

The mapping uses the quad's `0/1/3` corners as origin / +U / +V — an affine
(parallelogram) fit, exact for oblique/orthographic and a close approximation
under perspective.

Pass a second argument to **lift the quad off the surface in 3D** before
projecting — e.g. the face normal times a small distance — to float a plane,
label or sticker just above the face. Because the lift happens in 3D it
foreshortens correctly under perspective (nudging the result in screen space
does not):

```js
// float content 0.2 units off each face, along its normal
const m = h.faceTransform(f, [f.n[0] * 0.2, f.n[1] * 0.2, f.n[2] * 0.2]);
```

## Voxel Scaling

Shrink individual voxels along any axis. Scaled voxels automatically become non-opaque, revealing neighbors behind them.

```js
// Static — same scale for every voxel
h.applyGeometry({
  type: 'box',
  position: [0, 0, 0],
  size: 1,
  scale: [1, 0.5, 1],
  scaleOrigin: [0.5, 1, 0.5]
})

// Functional — scale varies by position
h.applyGeometry({
  type: 'box',
  position: [0, 0, 0],
  size: 4,
  scale: (x, y, z) => [1, 1 - y * 0.2, 1],
  scaleOrigin: [0.5, 1, 0.5]
})
```

The `scaleOrigin` sets where scaling anchors within the voxel cell (0–1 per axis). `[0.5, 1, 0.5]` pins to the bottom-center (floor), `[0.5, 0, 0.5]` pins to the top-center (ceiling). Both `scale` and `scaleOrigin` accept functions of `(x, y, z)` for per-voxel control. Return `null` from a scale function to leave that voxel at full size.

## Slopes

`slope` turns voxels into wedge-shaped pieces. Every piece has a full floor (or ceiling); the value names the shape and the side its full wall faces.

| Value | Shape |
|---|---|
| `'+x'` `'-x'` `'+z'` `'-z'` | Ramp: a full wall facing that direction, open on the opposite side, triangles on the other two |
| `'outer+x+z'` (and `-x+z`, `-x-z`, `+x-z`) | Outer corner: only the corner between the two named sides reaches the top. Caps the outside corner where two ramps meet |
| `'inner+x+z'` (and the other three) | Inner corner: full walls on both named sides, only the opposite corner stays low. Fills the inside corner where two ramps meet |
| `'tip'` | A pyramid with its apex at the top centre |
| `'ceiling:'` + any of the above | The same piece upside down: a full ceiling instead of a floor, slanted faces pointing down. For brackets, arches and overhangs |

```js
h.addGeometry({ type: 'box', position: [0, 2, 0], size: [1, 1, 3], slope: '+x' })

// per voxel: ramps around the rim of a box, outer corners at its corners
h.addGeometry({
  type: 'box', position: [0, 0, 0], size: [5, 1, 5],
  slope: (x, y, z) => {
    const ex = x === 0 ? '+x' : x === 4 ? '-x' : ''
    const ez = z === 0 ? '+z' : z === 4 ? '-z' : ''
    if (ex && ez) return 'outer' + ex + ez
    return ex || ez || null // null leaves a plain cube
  },
})
```

Slanted faces have type `slope` and take the `slope` style key, falling back to `top` (`bottom` for ceiling pieces). Upright faces keep their side's name and style. A neighbour hides a piece's side face when its own face there is full or has exactly the same outline, so a ramp next to a matching ramp, corner or cube joins without seams.

`scale` works on pieces like on cubes, and gives you gentler or steeper slopes: `scale: [1, 0.5, 1], scaleOrigin: [0.5, 1, 0.5]` makes a half-height ramp. As with any scaled voxel, a scaled piece no longer hides its neighbours' faces, so pieces of different heights can stand side by side.

`rotate()` turns pieces with the scene: any turn around y, and half turns around x or z (which flip floor pieces to ceiling pieces). A quarter turn around x or z would stand a piece on its side, so it becomes a plain cube.

Limits: no vertical (wall) slopes; content voxels ignore `slope` (with a console warning), since they draw their content instead of faces; on `applyGeometry`, `slope` is given in world directions after `rotate` is applied; `renderTest()` doesn't support slopes.

### Pieces between two heights

Every piece can also start and end partway up the cell. Pass `{ side, from, to }`, where `side` is any of the names above (`'+x'`, `'outer+x+z'`, `'ceiling:tip'`, …) and `from` and `to` are heights as a fraction of the cell (0 = floor, 1 = full height):

| Piece | `from` | `to` |
|---|---|---|
| Ramp | height at its open end | height at its wall |
| Outer corner | height along its two low sides | height at its one high corner |
| Inner corner | height at its one low corner | height along its two walls |
| Tip | height along its four edges | height of its apex |

`from` defaults to 0 and `to` to 1, so `{ side: '+x' }` is the plain `'+x'`. The walls become trapezoids (triangles where a height is 0). For ceiling pieces the heights are measured down from the ceiling.

Cells that continue where the last one stopped make one straight slope at any angle, one cell at a time:

```js
// a 1:3 slope: 0→⅓, ⅓→⅔, ⅔→1
for (let i = 0; i < 3; i++)
  h.addGeometry({
    type: 'box', position: [i, 0, 0], size: [1, 1, 3],
    slope: { side: '+x', from: i / 3, to: (i + 1) / 3 },
  })

// on its own: a half slope on a raised block
h.addGeometry({ type: 'box', position: [0, 2, 0], size: 1, slope: { side: '+x', from: 0.5, to: 1 } })

// a 45° tip, the same as scale: [1, 0.5, 1] on a plain 'tip'
h.addGeometry({ type: 'box', position: [2, 2, 0], size: 1, slope: { side: 'tip', from: 0, to: 0.5 } })
```

Corners with the same heights join the ramps beside them, so a gentle roof keeps its angle all the way around. A 1:2 hip roof on a 4×4 footprint, its outer ring rising 0 → ½ and the 2×2 in the middle ½ → 1:

```js
const ring = (x, z, lo, hi) => {
  const ex = x === lo ? '+x' : x === hi ? '-x' : ''
  const ez = z === lo ? '+z' : z === hi ? '-z' : ''
  return ex && ez ? 'outer' + ex + ez : ex || ez
}
h.addGeometry({
  type: 'box', position: [0, 0, 0], size: [4, 1, 4],
  slope: (x, y, z) => {
    const edge = x === 0 || x === 3 || z === 0 || z === 3
    return edge
      ? { side: ring(x, z, 0, 3), from: 0, to: 0.5 }
      : { side: ring(x, z, 1, 2), from: 0.5, to: 1 }
  },
})
```

The voxel stores the piece as a string, the side and both heights joined with colons: `'+x:0.5:1'`, `'outer+x+z:0:0.5'` (heights rounded to 6 decimals). You can pass that string too; it is what `getVoxel()` and `toJSON()` return, and `rotate()` turns it like any other piece. A flat top (`from === to`) is allowed on ramps only, giving a block of partial height; heights must be 0–1 and not both 0.

### Pieces from corner heights

For terrain, give the height at each of the top's four corners: `{ corners: [h00, h10, h01, h11] }`, at (x, z), (x+1, z), (x, z+1) and (x+1, z+1), each from 0 to 1. Add `ceiling: true` to hang it. Neighbours that share corner heights join without seams, so a height field sampled at the grid's corners becomes one continuous surface, whatever the angle:

```js
// corner heights in levels, e.g. from noise: g(i, k) for i, k = 0..n
for (let i = 0; i < n; i++)
  for (let k = 0; k < n; k++) {
    const c = [g(i, k), g(i + 1, k), g(i, k + 1), g(i + 1, k + 1)]
    const L = Math.floor(Math.min(...c)) // whole levels of cubes below
    if (L > 0) h.addGeometry({ type: 'box', position: [i, FLOOR - L + 1, k], size: [1, L, 1] })
    const top = c.map((v) => v - L)
    if (top.some((v) => v > 0))
      h.addGeometry({ type: 'box', position: [i, FLOOR - L, k], size: 1, slope: { corners: top } })
  }
```

Every corner of a cell has to fit in the one voxel above its whole level: no corner higher than `floor(lowest) + 1`. Lower the corners that stick out until that holds (each one you lower can push its other cells back into range, so repeat until nothing changes).

A top that isn't one plane folds into two triangles along the diagonal with the larger height difference: a single odd corner gets the fold through it, as the outer and inner corners do. A saddle (two opposite corners high) folds along its high pair, a ridge. Every named piece is one of these: `[0, 1, 0, 1]` is `'+x'`, `[0, 0, 0, 1]` is `'outer+x+z'`, `[0, 1, 1, 1]` is `'inner+x+z'`.

The voxel stores it as `'c:h00:h10:h01:h11'` (`'ceiling:c:…'` hung); `rotate()` moves the heights with the corners. Pieces with heights are built the first time each combination is used and cached, up to 4,096 of them; past that the oldest is dropped and rebuilt when needed, so animating heights smoothly costs time, not memory. Rounding heights (to quarters, say) keeps the number small.

The idea comes from Geoff Crammond's *The Sentinel* (1986), which stores its landscape as corner heights and derives each tile's shape from its four corners. See Mark Moxon's commentary on [tile shapes](https://thesentinel.bbcelite.com/deep_dives/tile_shapes.html) and [generating the landscape](https://thesentinel.bbcelite.com/deep_dives/generating_the_landscape.html).

### `autoSlope(options?)`

Picks pieces for you: run it after building a shape and it smooths the surfaces from each voxel's neighbours, replacing any slopes already set.

```js
h.addGeometry({ type: 'box', position: [0, 0, 0], size: [6, 3, 4] })
h.autoSlope()                                  // tops and undersides
h.autoSlope({ bottom: false, tips: false })    // tops only, no lone peaks
h.autoSlope({ filter: (v) => v.y < 4 })        // only some voxels
```

A voxel with nothing above it gets a ramp falling toward its one open side, an outer corner where two adjacent sides are open (if both its high neighbours are surface too), an inner corner where all four sides are closed but one diagonal is open, and a tip if it stands alone. One-wide ridges stay cubes. Undersides get the same with `ceiling:` pieces. Ramps on neighbouring layers line up, so a 45° staircase becomes one smooth slope. Edges that run diagonally in plan (sphere and line outlines) stay stepped: smoothing those would need slopes on vertical walls.

## Gap

Add uniform spacing between voxels. Set a global default in the constructor, or override per-geometry.

```js
// Global gap — applies to all voxels
const h = new Heerich({ tile: 40, gap: 0.05 })

// Per-geometry override
h.addGeometry({ type: 'box', position: [0, 0, 0], size: 3, gap: 0.1 })
h.addGeometry({ type: 'box', position: [4, 0, 0], size: 3, gap: 0 }) // no gap
```

Gap shrinks each voxel toward its center by the specified amount on each side. A gap of `0.05` means each voxel is 10% smaller overall. Gap is applied after `scale` and is independent of it — a scaled voxel with a gap will shrink first, then have spacing applied.

## Rotation

Rotate coordinates by 90-degree increments before or after placement:

```js
// Rotate a shape before placing it
h.applyGeometry({
  type: 'box',
  position: [0, 0, 0],
  size: [5, 1, 3],
  rotate: { axis: 'z', turns: 1 }
})

// Rotate all existing voxels in place
h.rotate({ axis: 'y', turns: 2 })

// With explicit center
h.rotate({ axis: 'x', turns: 1, center: [5, 5, 5] })
```

These turn voxels on the grid. To turn something smoothly, by any angle, see [Moving groups](#moving-groups).

## Clipping

Cut the scene down to a box or by planes when rendering. The bounds can fall anywhere, not just on cell edges, so a cut can pass through voxels, and the voxels stay as they are: clipping only changes what is drawn.

```js
// Keep what's inside a box
h.toSVG({ clip: { min: [0.5, -10, 0.25], max: [8.5, 10, 6.75] } })

// Keep the side of a plane its normal points into
h.toSVG({ clip: { point: [4, 0, 4], normal: [1, 0, 1] } })

// Or a list of them: kept where inside all
h.toSVG({
  clip: [
    { min: [0, -10, 0], max: [10, 10, 10] },
    { point: [5, 2, 5], normal: [0, 1, -0.5] },
  ],
})
```

Where the cut goes through a voxel, the cut side is closed with a wall: the voxel's cross-section there, slopes included, in the voxel's style for the side the wall faces. Give voxels a `cap` style to paint walls differently, or pass `caps: false` to leave the cut open:

```js
h.addGeometry({
  type: 'box', position: [0, 0, 0], size: 8,
  style: { default: { fill: '#ccc' }, cap: { fill: '#e33' } },
})
h.toSVG({ clip: { point: [4, 4, 4], normal: [-1, -1, -1] } })      // red walls
h.toSVG({ clip: { point: [4, 4, 4], normal: [-1, -1, -1] }, caps: false })
```

Walls get `cap: true` on their face, and `data-face` names the side they face. `Heerich.clipBox(min, max)` returns a box's six planes, for mixing with others.

Since every plane keeps everything on one side, what is kept is always convex: a box, a wedge, a prism, or a rounder shape from many planes. For a cut that follows the grid, the [boolean operations](#boolean-operations) work too.

A decal on a cut face stays where it was: it is laid on the whole face and clipped to what is left. Walls don't take decals.

`clip` works with `getFaces()`, `toSVG()` and `updateSVG()`, and `renderTest()` (which has no stored voxels to slice, so its cuts stay open). It isn't available with `getFaces({ raw: true })` (for `GPURenderer`). To keep a clip until you change it, and have lookups use it too, set it as the [view](#setting-the-view).

## Moving groups

Name a group when adding voxels, then move, turn or scale it when rendering, smoothly and off the grid:

```js
h.addGeometry({ type: 'box', position: [0, 0, 0], size: [4, 2, 2], group: 'car' })

function frame(t) {
  h.updateSVG(svg, {
    groups: {
      car: { translate: [t * 2, 0, 0], rotate: [0, t * 30, 0], center: [2, 1, 1] },
    },
  })
}
```

A transform scales, then rotates (degrees), then translates, with `center` as the point it turns and scales around (default `[0, 0, 0]`), as in [`rotate()`](#rotation). It turns about x, then y, then z; set `order` to change that, for example `order: 'yxz'` to spin about y and then tilt about x, like a turntable. `scale` takes one number or one per axis; a negative scale mirrors. Or pass `{ matrix }`: 12 numbers, a 3×4 matrix by rows.

The voxels stay where they were added (queries, `findByPosition()` and `data-*` attributes use those cells); only the drawing moves. Moved faces depth-sort with everything else, so a group can pass in front of and behind the rest of the scene. As with any back-to-front renderer, two shapes that cut into each other can't sort right everywhere.

Voxels in different groups never hide each other's faces, since either may move. That draws a few more faces where groups touch, so group only what moves.

To move the whole scene, pass one `transform` (same form). It goes after any group's own transform, so a group keeps moving relative to the rest. Neighbours still hide each other's faces under it, so turning a whole scene costs little:

```js
// turn everything around its middle, inside a box that stays put
h.toSVG({
  transform: { rotate: [20, 35, 0], center: [4, 4, 4] },
  clip: { min: [0, 0, 0], max: [8, 8, 8] },
})
```

`groups` and `transform` are applied before `clip`, so a moving group can pass through a fixed cut. Like `clip`, they work with `getFaces()`, `toSVG()` and `updateSVG()`, and `renderTest()` takes `transform` (it has no groups); not `raw` faces.

## Setting the view

`clip`, `caps`, `transform` and `groups` say how the scene is shown, so like the camera they can be set once and kept:

```js
h.setView({
  clip: { min: [0, 0, 0], max: [8, 8, 8] },
  transform: { rotate: [20, 35, 0], order: 'yxz', center: [4, 4, 4] },
  groups: { car: { translate: [2, 0, 0] } },
})

h.updateSVG(svg)                  // turned, cut, the car moved
h.findByPosition([x, y])          // finds the voxel drawn there
h.getVoxelInfo(voxel).center2D    // where its centre is drawn
h.toSVG({ clip: null })           // just this once, uncut
```

Every render (`getFaces()`, `toSVG()`, `updateSVG()`, `renderTest()`) and lookup (`findByPosition()`, `getVoxelInfo()`) uses the view. Passing any of the four in a call replaces it for that call, and `null` turns it off. `getView()` returns it, `setView(null)` clears it, and `new Heerich({ view })` sets it from the start. `toJSON()` keeps it.

Changing the view doesn't change the voxels, so the scene's faces stay cached and `epoch` doesn't move: setting a new view every frame is cheap.

## Rendering

### `toSVG(options?)`

Render the scene to an SVG string:

```js
const svg = h.toSVG()
const svg = h.toSVG({ padding: 40 })
const svg = h.toSVG({ viewBox: [0, 0, 800, 600] })
```

Options:

| Option | Type | Description |
|--------|------|-------------|
| `padding` | number | ViewBox padding in px (default: `20`) |
| `faces` | Face[] | Pre-computed faces (skips internal rendering) |
| `viewBox` | [x,y,w,h] | Custom viewBox override |
| `fit` | FitFrame, object or `true` | Keep one frame while the camera moves. See [`getFitFrame()`](#getfitframeoptions). `viewBox` takes priority |
| `offset` | [x,y] | Translate all geometry |
| `prepend` | string | Raw SVG inserted before faces |
| `append` | string | Raw SVG inserted after faces |
| `faceAttributes` | function | Per-face attribute callback |
| `dataAttributes` | boolean | Write `data-voxel`, `data-x`/`y`/`z`, `data-face` and `meta` as `data-*` (default `true`). Turn off when nothing reads them: smaller markup, and `updateSVG()` writes far fewer attributes per frame |
| `occlusion` | boolean | Enable built-in occlusion culling (no external dependency) |
| `resolveOcclusion` | function | Custom occlusion resolver (overrides built-in). Providing this implicitly enables occlusion. Input `(subjectCoords, overlappingCoords[])`, return `pathString` or `null` |
| `clip` | box, plane or list | Keep only what is inside. See [Clipping](#clipping) |
| `caps` | boolean | Close the clip's cut with walls (default `true`) |
| `transform` | object | Move the whole scene. See [Moving groups](#moving-groups) |
| `groups` | object | Move groups by name. See [Moving groups](#moving-groups) |

`clip`, `caps`, `transform` and `groups` default to the [view](#setting-the-view).

### `updateSVG(target, options?)`

Render into an existing `<svg>` or `<g>` instead of building a string. Elements are reused between calls and only changed attributes are written, so use this when rendering repeatedly, such as in an animation:

```js
const svg = document.querySelector('svg')

function frame(t) {
  const faces = h.renderTest({ bounds, test: makeTest(t) })
  h.updateSVG(svg, {
    faces,
    faceAttributes: (f) => ({ fill: colorFor(f, t) }),
  })
  requestAnimationFrame(frame)
}
```

It needs a DOM, so use `toSVG()` on a server. It takes the same options as `toSVG()`, except `prepend` and `append`: add those elements to `target` yourself. To wrap the faces, such as in a filter, pass that `<g>` as the target and set the `viewBox` on its `<svg>`. The faces go in a `<g>` appended to `target` on the first call, and everything else in `target` is left alone. An `<svg>` target also gets its `viewBox` set; a `<g>` target doesn't. Faces with content, decals, hatching or occlusion clipping work too, but each is rewritten as markup when it changes, so plain polygons are the fastest.

Reuse is tracked per `target`, so building a new `Heerich` every frame is fine. Clearing the target, or setting its `innerHTML`, starts over with new elements.

#### Occlusion Culling for Pen Plotters
By default, the engine relies on the browser's Paint Algorithm (back-to-front rendering). For zero overlapping vectors (perfect for plotters), enable built-in occlusion culling:

```javascript
const svg = h.toSVG({ occlusion: true });
```

The built-in clipper assumes convex occluders, which works well for oblique projection but may produce minor artifacts with perspective (where projected quads can become non-convex). For exact clipping, drop in [polygon-clipping](https://github.com/mfogel/polygon-clipping):

```html
<script src="https://unpkg.com/polygon-clipping@0.15.3/dist/polygon-clipping.umd.js"></script>
```

```javascript
const svg = h.toSVG({
  resolveOcclusion: (subject, occluders) => {
    try {
      const result = polygonClipping.difference([subject], ...occluders.map(o => [o]));
      if (!result || result.length === 0) return null; // Fully occluded

      let d = "";
      for (const polygon of result) {
        for (const ring of polygon) {
          ring.forEach((pt, i) => { d += (i === 0 ? `M ${pt[0]} ${pt[1]} ` : `L ${pt[0]} ${pt[1]} `); });
          d += "Z ";
        }
      }
      return d.trim();
    } catch { return null; }
  }
});
```

Use `prepend` and `append` to inject SVG filters for effects like cel-shaded outlines:

```js
const svg = h.toSVG({
  prepend: `<defs><filter id="cel">
    <feMorphology in="SourceAlpha" operator="dilate" radius="2" result="thick"/>
    <feFlood flood-color="#000"/>
    <feComposite in2="thick" operator="in" result="border"/>
    <feMerge><feMergeNode in="border"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter></defs><g filter="url(#cel)">`,
  append: `</g>`,
})
```

Every polygon gets data attributes for interactivity:

```html
<... data-voxel="x,y,z"  data-x="x"  data-y="y"  data-z="z"  data-face="top" ../>
```

Voxels with a `meta` object get additional `data-*` attributes.

### `getFaces()` / `renderTest(opts)`

Get the projected 2D face array directly (for custom renderers or Canvas output):

```js
// From stored voxels
const faces = h.getFaces()

// Raw 3D faces (no projection or backface culling) — for GPU renderers
const raw = h.getFaces({ raw: true })

// Stateless — from a test function, no voxels stored
const faces = h.renderTest({
  bounds: [[-10, -10, -10], [10, 10, 10]],
  test: (x, y, z) => x*x + y*y + z*z <= 100,
  style: (x, y, z, faceName) => ({ fill: faceName === 'top' ? '#fff' : '#ccc' })
})

// Render pre-computed faces
const svg = h.toSVG({ faces })
```

`renderTest` only runs `test` on neighbours whose shared side could face the camera, so don't rely on it being called for every neighbour.

Pass `nearZ` to place a voxel's camera-facing side at a fractional depth. Its front face moves there and its side faces stretch to meet it, so a surface can slide smoothly between layers. It's only available on `renderTest`, not on stored voxels:

```js
// Animate a floor from layer 3 to layer 4 (depth goes 3 → 4)
const faces = h.renderTest({
  bounds: [[0, 0, 0], [10, 10, 6]],
  test: (x, y, z) => z >= Math.ceil(depth),
  nearZ: (x, y, z) => (z === Math.ceil(depth) ? depth : z),
})
```

Pass `{ raw: true }` to get all neighbour-exposed 3D faces without camera-dependent culling or projection. Raw faces keep their original 3D coordinates — useful for GPU renderers that handle their own backface culling and projection.

### Custom Renderers

`getFaces()` returns everything you need to build your own renderer. Each projected face has:

- `face.points` — projected 2D coordinates (flat array via `face.points.data`: `[x0, y0, x1, y1, ...]`)
- `face.style` — resolved style object (`fill`, `stroke`, `strokeWidth`, etc.)
- `face.type` — face direction (`'top'`, `'front'`, `'right'`, etc.) or `'content'`
- `face.voxel` — source voxel with `x`, `y`, `z`, and optional `meta`
- `face.depth` — depth value (array is already sorted back-to-front)

```js
const faces = h.getFaces()

for (const face of faces) {
  if (face.type === 'content') continue
  const d = face.points.data
  // d = [x0, y0, x1, y1, x2, y2, x3, y3] — four corners of a quad
  ctx.beginPath()
  ctx.moveTo(d[0], d[1])
  ctx.lineTo(d[2], d[3])
  ctx.lineTo(d[4], d[5])
  ctx.lineTo(d[6], d[7])
  ctx.closePath()
  ctx.fillStyle = face.style.fill
  ctx.fill()
}
```

### `GPURenderer`

Convert voxel faces into typed arrays ready to upload to a WebGL or WebGPU buffer (e.g. Three.js `BufferGeometry`). Each visible quad face is triangulated into two CCW triangles.

```js
import { Heerich, GPURenderer } from 'heerich'
import * as THREE from 'three'

const engine = new Heerich()
engine.addGeometry({ type: 'box', position: [0, 0, 0], size: [4, 4, 4] })

const { position, normal, uv, index } = new GPURenderer().render(
  engine.getFaces({ raw: true }), // all neighbour-exposed faces, no camera culling
  { yUp: true },                  // convert to Three.js coordinate space
)

const geo = new THREE.BufferGeometry()
geo.setAttribute('position', new THREE.BufferAttribute(position, 3))
geo.setAttribute('normal',   new THREE.BufferAttribute(normal,   3))
geo.setAttribute('uv',       new THREE.BufferAttribute(uv,       2))
geo.setIndex(new THREE.BufferAttribute(index, 1))
scene.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial()))
```

`render(faces, options?)` options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `yUp` | boolean | `false` | Convert from Heerich's Y-down/Z-into-screen space to Three.js Y-up/Z-toward-viewer by negating Y and Z. Winding is preserved (determinant +1). Without this, apply `mesh.rotation.x = Math.PI` in Three.js — do **not** use `scale.y = -1`, which changes handedness and breaks winding. |
| `scale` | number | `1` | Uniform scale applied to vertex positions. Useful for converting voxel grid units to world-space metres. |
| `color` | boolean | `false` | Parse `face.style.fill` and include a `color` Float32Array with RGB floats (0–1) per vertex. |
| `defaultColor` | `[r,g,b]` | `[1,1,1]` | Fallback colour when `color` is true and a face has no parseable fill. Handles `#rgb`, `#rrggbb`, `rgb()`, and `rgba()`. |

Returns a `GPUGeometry` object:

| Property | Type | Description |
|----------|------|-------------|
| `position` | `Float32Array` | XYZ vertex positions (3 floats/vertex) |
| `normal` | `Float32Array` | XYZ face normals, flat-shaded (3 floats/vertex) |
| `uv` | `Float32Array` | UV texture coordinates (2 floats/vertex) |
| `index` | `Uint32Array` | Triangle indices (3 indices/triangle) |
| `color` | `Float32Array` | RGB vertex colours (3 floats/vertex) — present when `options.color` is true |
| `faceCount` | number | Number of quad faces encoded |
| `vertexCount` | number | Total vertices (`faceCount × 4`) |

### `getBounds(padding?, faces?)`

Compute the 2D bounding box of the rendered geometry:

```js
const { x, y, w, h } = h.getBounds()
const padded = h.getBounds(30)
```

### `getFitFrame(options?)`

By default the view is fitted to what's drawn. That's what you want most of the time, when you show a shape from one perspective. But if your animation or interaction turns any axis of the camera, the shape's outline changes every frame, so it rescales and wiggles. A fit frame covers that: it measures one frame that holds the shape at every camera setting you plan to use, and the shape turns around one fixed point in the middle of it.

```js
const frame = h.getFitFrame()

function turn(angle) {
  h.setCamera({ type: 'isometric', angle })
  h.updateSVG(svg, { fit: frame })
}
```

`toSVG({ fit: frame })` works the same way. Measure again when the voxels change; a moving camera can keep reusing the frame.

If you rebuild the scene on every render anyway, skip the measuring step. `fit` also takes `true`, or the options below, and measures on each render:

```js
h.toSVG({ fit: true })
h.toSVG({ fit: { cameras: ['isometric'] } })
```

Options:

| Option | Type | Description |
|--------|------|-------------|
| `cameras` | string[] | Camera types to cover (default: all four) |
| `angle` | [from,to] | Angle range in degrees (default: `[0, 360]`) |
| `pitch` | [from,to] | Orthographic pitch range in degrees (default: `[0, 89]`) |
| `distance` | [from,to] | Oblique and perspective distance range (default: `[1, 40]`) |
| `positions` | [x,y][] | Perspective camera positions to cover. For a range, pass its corners (default: the current position if the camera is perspective, otherwise the pivot) |
| `pivot` | [x,y,z] | The point to turn around (default: the voxels' average position) |

It returns `{ pivot, frontZ, width, height }`, with the size in pixels and without padding. An oblique camera holds the shape's front still rather than the pivot, so changing its angle or distance only moves the depth behind it.

A frame that fits every view is bigger than any single view needs, so the shape looks smaller than with the default fit. Only cover the settings you use: narrow ranges give a tighter frame.

```js
// Only ever turns a little, under one camera
const frame = h.getFitFrame({ cameras: ['isometric'], angle: [30, 60] })
```

The frame never crops: a view that reaches past it, like a perspective camera very close to the voxels, grows the frame for that view. It measures stored voxels, so with `renderTest()` faces `fit` falls back to the normal fit.

For a `<g>` target, or to frame only part of a scene, get the `viewBox` yourself:

```js
const [x, y, w, h] = h.getFitViewBox(frame, { padding: 40, faces: bodyFaces })
svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`)
```

## Content Voxels

Embed arbitrary SVG at a voxel position (depth-sorted with the rest of the scene):

```js
h.applyGeometry({
  type: 'box',
  position: [3, 0, 3],
  size: 1,
  content: '<text font-size="12" text-anchor="middle">Hi</text>',
  opaque: false,
})
```

Content voxels receive CSS custom properties `--x`, `--y`, `--z`, `--scale`, `--tile` for positioning.

## Decals

Stamp SVG paths onto voxel faces. Define decals as `<path>` elements in a `0–1` unit coordinate space, then reference them by name in any face style. The engine warps every path coordinate via bilinear interpolation onto the projected face quad — perspective-correct, no affine approximation.

```js
// Register a decal — one or more <path> elements in 0–1 unit space
h.defineDecal('circle', {
  content: '<path d="M0.5 0 A0.5 0.5 0 1 1 0.5 1 A0.5 0.5 0 1 1 0.5 0 Z" fill="none" stroke="#333" stroke-width="1" vector-effect="non-scaling-stroke"/>'
})

// Shorthand — just the SVG string
h.defineDecal('cross', '<path d="M0 0 L1 1 M1 0 L0 1" stroke="#333" stroke-width="1" vector-effect="non-scaling-stroke" fill="none"/>')

// Reference by name in any face style
h.addGeometry({
  type: 'box', position: [0, 0, 0], size: 3,
  style: {
    top:   { fill: '#fff', decal: 'circle' },
    front: { fill: '#ccc', decal: 'cross' },
  }
})

// Per-use style overrides
h.addGeometry({
  type: 'box', position: [4, 0, 0], size: 1,
  style: {
    top: { fill: '#fff', decal: { name: 'circle', style: { opacity: 0.5 } } }
  }
})
```

All SVG path commands are supported, both absolute (M, L, H, V, C, S, Q, T, A, Z) and relative (m, l, h, v, c, s, q, t, a, z). Arcs are automatically converted to cubic beziers before warping. Use `vector-effect="non-scaling-stroke"` for uniform stroke widths across faces. Decals are included in `toJSON()`/`fromJSON()` serialization.

**Limitations:**
- Only `<path>` elements are currently supported. Other SVG shapes (`<circle>`, `<rect>`, `<line>`, etc.) must be converted to `<path>` before use.
- Decals are not clipped by occlusion culling. Partially occluded faces will render their decals at full size — the painter's algorithm (back-to-front rendering) hides the overflow in most cases, but it may be visible with transparent occluders.

## Querying

```js
h.getVoxel([2, 3, 1])       // voxel data or null
h.hasVoxel([2, 3, 1])       // boolean
h.getNeighbors([2, 3, 1])   // { top, bottom, left, right, front, back }
h.clear()                    // remove all voxels
h.epoch                      // mutation counter (increments on every add/remove/style change)
for (const voxel of h) { /* voxel.x, voxel.y, voxel.z, voxel.styles, ... */ }
```

The instance is iterable — `for...of`, `[...h]`, and `Array.from(h)` all yield every voxel in the scene.

### `findVoxels(predicate)`

Returns all voxels matching a predicate function. The predicate receives each voxel object and should return `true` to include it.

```js
// Find by meta ID (set at add time via the meta option)
h.addGeometry({ type: 'box', position: [0, 0, 0], size: 3, meta: { id: 'tower' } })
const tower = h.findVoxels(v => v.meta?.id === 'tower')

// Find all voxels at ground level
const ground = h.findVoxels(v => v.y === 0)

// Find voxels in a coordinate range
const slab = h.findVoxels(v => v.x >= 2 && v.x <= 5 && v.z >= 2 && v.z <= 5)

// Find by style property
const redVoxels = h.findVoxels(v => v.styles?.default?.fill === '#ff0000')
```

Returns a plain array of voxel objects. Each voxel has `x`, `y`, `z`, `styles`, and optionally `meta`, `scale`, `scaleOrigin`, `content`, and `opaque`. The returned references are live — mutations to them affect the scene (call `h.batch(() => {})` or trigger `applyStyle` to rerender after manual mutations).

### `getVoxelInfo(posOrVoxel)`

Returns projected position and size data for a single voxel. Accepts either a `[x, y, z]` coordinate array or a voxel object reference (from `getVoxel()`, `findVoxels()`, or `face.voxel`).

```js
const info = h.getVoxelInfo([2, 0, 3])
const info = h.getVoxelInfo(someVoxelRef)

// {
//   voxel              — the raw voxel object (null if not found)
//   center3D           — [x+0.5, y+0.5, z+0.5] in voxel space
//   center2D           — { x, y } projected centroid in pixel space
//   bounds2D           — { x, y, w, h } pixel bounding box of visible faces
//   normalizedCenter2D — { x, y } center as 0–1 fraction of scene bounds
//   normalizedSize2D   — { w, h } size as 0–1 fraction of scene bounds
// }
```

All 2D values are in the same coordinate space as `getFaces()` and `getBounds()` — before any SVG viewBox offset or padding. `bounds2D` is `null` when the voxel exists but all its faces are culled (e.g. fully surrounded).

```js
// Combine with findVoxels to query a group
const voxels = h.findVoxels(v => v.meta?.id === 'tower')
const infos = voxels.map(v => h.getVoxelInfo(v))
const avgX = infos.reduce((s, i) => s + i.center2D.x, 0) / infos.length
```

### `findByPosition([x, y], options?)`

Finds the frontmost voxel at a 2D screen-space position. Iterates projected faces front-to-back and returns the first hit, or `null` if the position is over empty space.

```js
const hit = h.findByPosition([px, py])
// { voxel, face } | null
//   voxel — the hit voxel object
//   face  — the specific projected face that was hit (includes face.type, face.style, etc.)
```

Coordinates are in the same raw pixel space as `getFaces()`. When working from mouse events on a rendered SVG, use the SVG coordinate transform to convert client coordinates:

```js
svgEl.addEventListener('mousemove', e => {
  const pt = svgEl.createSVGPoint()
  pt.x = e.clientX
  pt.y = e.clientY
  const { x, y } = pt.matrixTransform(svgEl.getScreenCTM().inverse())

  const hit = h.findByPosition([x, y])
  if (hit) {
    console.log(hit.voxel.x, hit.voxel.y, hit.voxel.z)
    console.log(hit.face.type) // 'top', 'front', 'left', …
  }
})
```

If you have mouse coordinates relative to the SVG element (not the viewport), pass the viewBox origin as an offset:

```js
const bounds = h.getBounds(padding)
const hit = h.findByPosition([elX, elY], { offset: [bounds.x, bounds.y] })
```

Combine with `getVoxelInfo` for the full interactivity loop — hit test, then retrieve projected position:

```js
const hit = h.findByPosition([x, y])
if (hit) {
  const { center2D, bounds2D, normalizedCenter2D } = h.getVoxelInfo(hit.voxel)
}
```

## Serialization

```js
const data = h.toJSON()
const json = JSON.stringify(data)

const h2 = Heerich.fromJSON(JSON.parse(json))
```

Note: functional styles (callbacks) cannot be serialized and will be omitted with a console warning.

## Coordinate System

- **X** — horizontal (left/right)
- **Y** — vertical (up/down). **Note: Y increases downward**, originating from SVG/DOM screen space.
- **Z** — depth (front/back).

### Common 3D "Gotchas"

Because the engine outputs standard SVG graphics and relies on Oblique projections, its grid behaves slightly differently than classic WebGL or mathematical 3D setups:

1. **Y Pointing Down**: Setting a voxel at `y: -4` places it *above* the origin, and `y: 4` places it *below* the origin in standard rendering.
2. **Oblique Z-Offset**: At the default angle of `45°` (pointing up and left visually), the Z-axis projects horizontally and vertically on screen.
3. **The "Front" Quadrant**: Due to this isometric-style camera offset and Painter's Algorithm sorting, the closest visual corner pointing toward the camera is the `[-X, -Y, -Z]` (Negative) octant, not `[+X, +Y, +Z]` (Positive) as one might expect. Carving out the "front" of a block to expose the inside means subtracting negative values.

Valid voxel coordinate bounds range from **-512 to 511** on each axis.

## Acknowledgements

Shape calculations for lines and spheres are based on the excellent guides by Red Blob Games:

- [Line drawing on a grid](https://www.redblobgames.com/grids/line-drawing/)
- [Circle/sphere drawing on a grid](https://www.redblobgames.com/grids/circle-drawing/)

## License

MIT © 2026 David Aerne
