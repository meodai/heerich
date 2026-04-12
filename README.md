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
| `offset` | [x,y] | Translate all geometry |
| `prepend` | string | Raw SVG inserted before faces |
| `append` | string | Raw SVG inserted after faces |
| `faceAttributes` | function | Per-face attribute callback |
| `occlusion` | boolean | Enable built-in occlusion culling (no external dependency) |
| `resolveOcclusion` | function | Custom occlusion resolver (overrides built-in). Providing this implicitly enables occlusion. Input `(subjectCoords, overlappingCoords[])`, return `pathString` or `null` |

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

### `getBounds(padding?, faces?)`

Compute the 2D bounding box of the rendered geometry:

```js
const { x, y, w, h } = h.getBounds()
const padded = h.getBounds(30)
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
for (const voxel of h) { /* voxel.x, voxel.y, voxel.z, voxel.styles, ... */ }
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
2. **Oblique Z-Offset**: At the default angle of `315°` (pointing up and left visually), the Z-axis projects horizontally and vertically on screen.
3. **The "Front" Quadrant**: Due to this isometric-style camera offset and Painter's Algorithm sorting, the closest visual corner pointing toward the camera is the `[-X, -Y, -Z]` (Negative) octant, not `[+X, +Y, +Z]` (Positive) as one might expect. Carving out the "front" of a block to expose the inside means subtracting negative values.

Valid voxel coordinate bounds range from **-512 to 511** on each axis.

## Acknowledgements

Shape calculations for lines and spheres are based on the excellent guides by Red Blob Games:

- [Line drawing on a grid](https://www.redblobgames.com/grids/line-drawing/)
- [Circle/sphere drawing on a grid](https://www.redblobgames.com/grids/circle-drawing/)

## License

MIT © 2026 David Aerne
