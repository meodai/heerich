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
  tile: [40, 40],
  camera: { type: 'oblique', angle: 45, distance: 15 },
})

// A simple house
h.addBox({ position: [0, 0, 0], size: [5, 4, 5], style: {
  default: { fill: '#e8d4b8', stroke: '#333' },
  top:     { fill: '#c94c3a' },
}})

// Carve out a door
h.removeBox({ position: [2, 1, 0], size: [1, 3, 1] })

document.body.innerHTML = h.toSVG()
```

## Camera

Two projection modes are available:

```js
// Oblique (default) — classic pixel-art look
const h = new Heerich({
  camera: { type: 'oblique', angle: 45, distance: 15 }
})

// Perspective — vanishing-point projection
const h = new Heerich({
  camera: { type: 'perspective', position: [5, 5], distance: 10 }
})

// Update camera at any time
h.setCamera({ angle: 30, distance: 20 })
```

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

### Box

```js
h.addBox({ position: [0, 0, 0], size: [3, 2, 4] })
h.removeBox({ position: [1, 0, 1], size: [1, 1, 1] })

// Style the carved walls (optional)
h.removeBox({ position: [0, 0, 0], size: [1, 1, 1], style: { default: { fill: '#222' } } })
```

### Sphere

```js
h.addSphere({ center: [5, 5, 5], radius: 3 })
h.removeSphere({ center: [5, 5, 5], radius: 1.5 })

// Style the carved walls (optional)
h.removeSphere({ center: [5, 5, 5], radius: 1, style: { default: { fill: '#222' } } })
```

### Line

Draw a line between two points with an optional brush:

```js
h.addLine({ from: [0, 0, 0], to: [10, 5, 0] })

// Thick rounded line
h.addLine({ from: [0, 0, 0], to: [10, 0, 0], radius: 2, shape: 'rounded' })

// Thick square line
h.addLine({ from: [0, 0, 0], to: [0, 10, 0], radius: 1, shape: 'square' })

h.removeLine({ from: [3, 0, 0], to: [7, 0, 0] })
```

### Custom Shapes

`addWhere` is the general-purpose shape primitive — define any shape as a function of `(x, y, z)`. Boxes, spheres, and lines are just convenience wrappers around this pattern.

```js
// Hollow sphere
h.addWhere({
  bounds: [[-6, -6, -6], [6, 6, 6]],
  test: (x, y, z) => {
    const d = x*x + y*y + z*z
    return d <= 25 && d >= 16
  }
})

// Torus
h.addWhere({
  bounds: [[-8, -3, -8], [8, 3, 8]],
  test: (x, y, z) => {
    const R = 6, r = 2
    const q = Math.sqrt(x*x + z*z) - R
    return q*q + y*y <= r*r
  }
})

h.removeWhere({
  bounds: [[0, -6, -6], [6, 6, 6]],
  test: () => true
})
```

Combine with functional `scale` and `style` for fully procedural shapes — closest thing to a voxel shader.

## Boolean Operations

All shape methods support a `mode` option for CSG-like operations:

```js
// Union (default) — add voxels
h.addBox({ position: [0, 0, 0], size: [5, 5, 5] })

// Subtract — carve out voxels
h.addSphere({ center: [2, 2, 2], radius: 2, mode: 'subtract' })

// Intersect — keep only the overlap
h.addBox({ position: [1, 1, 1], size: [3, 3, 3], mode: 'intersect' })

// Exclude — XOR: add where empty, remove where occupied
h.addBox({ position: [0, 0, 0], size: [5, 5, 5], mode: 'exclude' })
```

### Styling carved faces

When removing voxels, you can pass a `style` to color the newly exposed faces of neighboring voxels — the "walls" of the carved hole:

```js
h.addBox({ position: [0, 0, 0], size: [10, 10, 10] })

// Carve a hole with dark walls
h.removeBox({
  position: [3, 3, 0],
  size: [4, 4, 5],
  style: { default: { fill: '#222', stroke: '#111' } }
})
```

This works on all remove methods (`removeBox`, `removeSphere`, `removeLine`, `removeWhere`) and on `addBox`/`addSphere` etc. with `mode: 'subtract'`. Without a `style`, subtract behaves as before — just deleting voxels.

## Styling

Styles are set per face name: `default`, `top`, `bottom`, `left`, `right`, `front`, `back`.
Each face style is an object with SVG presentation attributes (`fill`, `stroke`, `strokeWidth`, etc.).

```js
h.addBox({
  position: [0, 0, 0],
  size: [3, 3, 3],
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
h.addBox({
  position: [0, 0, 0],
  size: [8, 8, 8],
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
h.styleBox({ position: [0, 0, 0], size: [3, 3, 3], style: { top: { fill: 'red' } } })
h.styleSphere({ center: [5, 5, 5], radius: 2, style: { default: { fill: 'gold' } } })
h.styleLine({ from: [0, 0, 0], to: [10, 0, 0], radius: 1, style: { default: { fill: 'blue' } } })
```

## Voxel Scaling

Shrink individual voxels along any axis. Scaled voxels automatically become non-opaque, revealing neighbors behind them.

```js
// Static — same scale for every voxel
h.addBox({
  position: [0, 0, 0],
  size: [1, 1, 1],
  scale: [1, 0.5, 1],
  scaleOrigin: [0.5, 1, 0.5]
})

// Functional — scale varies by position
h.addBox({
  position: [0, 0, 0],
  size: [4, 4, 4],
  scale: (x, y, z) => [1, 1 - y * 0.2, 1],
  scaleOrigin: [0.5, 1, 0.5]
})
```

The `scaleOrigin` sets where scaling anchors within the voxel cell (0–1 per axis). `[0.5, 1, 0.5]` pins to the bottom-center (floor), `[0.5, 0, 0.5]` pins to the top-center (ceiling). Both `scale` and `scaleOrigin` accept functions of `(x, y, z)` for per-voxel control. Return `null` from a scale function to leave that voxel at full size.

## Rotation

Rotate coordinates by 90-degree increments before or after placement:

```js
// Rotate a shape before placing it
h.addBox({
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

### `getFaces()` / `getFacesFrom(opts)`

Get the projected 2D face array directly (for custom renderers or Canvas output):

```js
// From stored voxels
const faces = h.getFaces()

// Stateless — from a test function, no voxels stored
const faces = h.getFacesFrom({
  bounds: [[-10, -10, -10], [10, 10, 10]],
  test: (x, y, z) => x*x + y*y + z*z <= 100,
  style: (x, y, z, faceName) => ({ fill: faceName === 'top' ? '#fff' : '#ccc' })
})

// Render pre-computed faces
const svg = h.toSVG({ faces })
```

### Custom Renderers

`getFaces()` returns everything you need to build your own renderer. Each face has:

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

### `getViewBoxBounds()` / `getOptimalViewBox(padding?, faces?)`

Compute the bounding box of the rendered geometry:

```js
const { x, y, w, h } = h.getViewBoxBounds()
const [vbX, vbY, vbW, vbH] = h.getOptimalViewBox(30)
```

## Content Voxels

Embed arbitrary SVG at a voxel position (depth-sorted with the rest of the scene):

```js
h.addBox({
  position: [3, 0, 3],
  size: [1, 1, 1],
  content: '<text font-size="12" text-anchor="middle">Hi</text>',
  opaque: false,
})
```

Content voxels receive CSS custom properties `--x`, `--y`, `--z`, `--scale`, `--tile` for positioning.

## Querying

```js
h.getVoxel([2, 3, 1])       // voxel data or null
h.hasVoxel([2, 3, 1])       // boolean
h.getNeighbors([2, 3, 1])   // { top, bottom, left, right, front, back }
h.forEach((voxel, pos) => { /* ... */ })
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
