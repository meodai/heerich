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
- `npm test` — Run the consistency tests in `tests/` (plain Node scripts, no test framework), then the benchmarks

## Architecture

The main entry is `src/heerich.js`, exporting the `Heerich` class. Rendering, decals, hatching, occlusion and shape generators live in the other modules in `src/`.

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
4. `updateSVG()` — alternative to `toSVG()` that writes into a live DOM element, reusing elements and skipping unchanged attributes (`SVGRenderer.update`)

### Fit frames
- `getFitFrame()` sweeps the camera ranges over the voxels' corners with `makeProjector()` and returns one frame size plus a pivot. `getFitViewBox()` centres that frame on the projected pivot (under an oblique camera, on the camera-facing plane `frontZ`, so distance and angle only move the depth behind it)
- `makeProjector()` is the single source for point projection (`project()` uses it too). `_projectAndSort()` still has its own inline copy for speed, so change both together

### Clipping, transforms and the view (optional)
- `getFaces({ clip, caps, transform, groups })` (also through `toSVG()`/`updateSVG()`) goes through `_shapedFaces()`. Those four default to the stored view (`setView()`), resolved by `_viewFor(options)`; the view is not a scene edit, so it doesn't bump the epoch. `_shapedFaces()`: the cached 3D faces (kept per epoch), moved by their voxel's `group` transform, cut by the clip planes in world space (as copies, never the cached faces), then projected and sorted. `_movesFor()` and `_shaper()` are shared with `renderTest()` (no walls there), `findByPosition()` and `getVoxelInfo()`. Not for `raw` faces. A cut face with a decal keeps its whole outline (`_whole` → `_wholePoints`); `SVGRenderer` lays the decal on that and clips it to the cut
- Plane and matrix maths live in `src/clip.js` (pure functions). A clip is a convex set of planes; `{ min, max }` is six of them
- `_capFaces()` closes the cut: for each plane facing the camera, each voxel it cuts is sliced (`section()` on `_solidFaces()`), trimmed to the other planes, and drawn after everything else (safe because the kept shape is convex). Anything lying in a plane is dropped and redrawn as a wall
- A `cutLine` style strokes the edges a clip cut: `_shaper()` marks them on cut faces and `_outlineCaps()` on walls (edges no other wall on the plane shares) as `_cutEdges`, indices into the polygon; `SVGRenderer` draws them as a `<path>` after the face
- Voxels in different groups never hide each other (`solidSide`/`covered` compare `group`). Grouped voxels skip oblique's build-time type cull; moved faces and walls carry `_free` and are culled by their normal in `_projectAndSort`
- `tests/clip.test.js` fuzzes this against scenes rebuilt from the kept or moved voxels, and samples points inside the solid for holes

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
- Culls sides by camera position before calling the neighbour test. `nearZ` places a voxel's camera-facing side at a fractional z.

### Two build targets
- **Library build** (`vite.config.js`): builds `src/heerich.js` as UMD+ESM to `dist/`
- **Site build** (`vite.site.config.js`): builds `index.html` demo page to `dist-site/`
