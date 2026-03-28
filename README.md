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

### Box

```js
h.addBox({ position: [0, 0, 0], size: [3, 2, 4] })
h.removeBox({ position: [1, 0, 1], size: [1, 1, 1] })
```

### Sphere

```js
h.addSphere({ center: [5, 5, 5], radius: 3 })
h.removeSphere({ center: [5, 5, 5], radius: 1.5 })
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

### Where (Procedural)

Add voxels anywhere a test function returns `true`:

```js
// Hollow sphere
h.addWhere({
  bounds: [[-6, -6, -6], [6, 6, 6]],
  test: (x, y, z) => {
    const d = x*x + y*y + z*z
    return d <= 25 && d >= 16
  }
})

h.removeWhere({
  bounds: [[0, -6, -6], [6, 6, 6]],
  test: () => true
})
```

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

Every polygon gets data attributes for interactivity:

```
data-voxel="x,y,z"  data-x="x"  data-y="y"  data-z="z"  data-face="top"
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

- **x** — left/right
- **y** — up/down (y increases downward in screen space)
- **z** — depth (front/back)
- Valid range: **-512 to 511** on each axis

## License

MIT
