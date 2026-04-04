# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Heerich is a tiny JavaScript engine for building 3D voxel scenes and rendering them to SVG. It supports oblique and perspective camera projections, CSG-like boolean operations (union, subtract, intersect, exclude), and outputs SVG with per-face data attributes for interactivity.

Named after Erwin Heerich, the German sculptor known for geometric cardboard sculptures.

## Commands

- `npm run dev` — Start Vite dev server (with `--host`)
- `npm run build` — Build the library to `dist/` (UMD + ESM via Vite library mode)
- `npm run build:site` — Build the demo/docs page to `dist-site/`
- `npm run preview` — Preview the built site

No test framework is configured.

## Architecture

The entire library is a single file: `src/heerich.js`, exporting the `Heerich` class.

### Core data model
- Voxels stored in a `Map` keyed by packed integer coords (`_k(x,y,z)` — 10-bit per axis, range -512 to 511)
- Each voxel holds `{x, y, z, styles, content?, opaque?, meta?}`
- Dirty flag + cached faces for lazy recomputation (`_dirty`, `_cachedFaces`)

### Shape primitives & boolean ops
- Shapes (box, sphere, line, where) are defined as coordinate generators (JS generators yielding `[x,y,z]`)
- `_applyOp()` applies union/subtract/intersect/exclude using these iterators
- Optional rotation via `_rotateCoords()` wrapping any coord iterator
- Style functions: can be static objects or `(x,y,z)` callbacks, resolved per-voxel at add time

### Camera projections
- **oblique** (default): parallel projection, Z axis at configurable `angle` + `distance`
- **perspective**: single-vanishing-point with `position` + `distance`
- **orthographic**: true 3D parallel projection with `angle` (pan) + `pitch` (tilt)
- **isometric**: orthographic preset with `pitch` locked to 35.264°, only `angle` exposed
- `angle` is shared across types for easy switching; meaning differs per type (see README)

### Rendering pipeline
1. `getFaces()` — iterates voxels, culls hidden faces (neighbor check + backface culling for perspective/orthographic), produces 3D face objects
2. `_projectAndSort()` — projects 3D faces to 2D points, depth-sorts back-to-front
3. `toSVG()` — converts projected faces to SVG polygon elements with data attributes

### Occlusion culling (optional)
- `OccluderIndex` (`src/bsp.js`) — grid-based spatial index for 2D polygon occlusion
- Built-in clipper assumes convex occluders (good for oblique, approximate for perspective); `resolveOcclusion` callback provides exact clipping
- Enabled in `toSVG()` via `occlusion: true` (built-in) or by providing a `resolveOcclusion` function
- `SVGRenderer` (`src/svg-renderer.js`) processes faces front-to-back, clips against inserted occluders

### Decals
- `defineDecal(name, def)` registers named `<path>` elements in 0–1 unit space
- `src/decal-warp.js` — bilinear interpolation warps path coordinates onto projected face quads
- All SVG path commands supported; arcs (A) auto-converted to cubic beziers
- Only `<path>` elements are supported (limitation); other shapes must be pre-converted

### Stateless rendering
- `renderTest()` — renders from a test function without storing voxels (zero Map allocations). Useful for procedural/infinite scenes.

### Two build targets
- **Library build** (`vite.config.js`): builds `src/heerich.js` as UMD+ESM to `dist/`
- **Site build** (`vite.site.config.js`): builds `index.html` demo page to `dist-site/`
