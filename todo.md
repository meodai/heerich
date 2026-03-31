# TODO

## A) Code changes (do first)

- **Breaking API: `applyGeometry()` / `removeGeometry()` / `applyStyle()`**
  - Replace `addBox/addSphere/addLine/addWhere` with `applyGeometry({ type: 'box'|'sphere'|'line'|'fill', ...params })`
  - `removeGeometry({ type, ...params })` as shortcut for `mode: 'subtract'`
  - Replace `styleBox/styleSphere/styleLine` with `applyStyle({ type, style, ...params })`
  - `applyStyle` without a type iterates ALL voxels (document that this is O(n))
  - Rename `where` → `fill`
  - No deprecation aliases — just replace
  - Document breaking changes in commit message only, not in README/site

- **Tile size: accept single number and `[x, y, z]`**
  - Single number → uniform tile size
  - Array of 2 → current behavior (X, Y), Z defaults to X
  - Array of 3 → independent X, Y, Z scaling
  - Default to 10 (currently 40)

- **Auto-clamp perspective camera distance**
  - Compute minimum safe distance from scene Z extent so geometry never clips behind camera
  - `minDistance = maxZ + 1`
  - Apply in `setCamera` or `getFaces`

## B) Docs / site changes (do after code)

- **Reorder site sections**: Position → Shapes (box, sphere, line, fill — all together) → Alignment → Boolean ops → ...
- **Move Content voxels after Transparent voxels** (content references `opaque`)
- **Split "Coordinate System"** into "Coordinate System" (axes, Y-down, range) and "Alignment & Projection" (oblique Z-offset, front quadrant)
- **Rewrite alignment section**: Lead with concrete example, not abstract principle
- **Fix sphere radius in text**: Says 3.5, demo uses 4. Match them. Clarify how sphere test works
- **Simplify remove docs**: No dedicated section — one sentence per shape mentioning `mode: 'subtract'`
- **De-emphasize tile size on site**: Keep in README, brief note that it's rarely needed since SVG scales via viewBox
- **Highlight auto-fitting viewBox**: Document that SVG viewport auto-adjusts. Add demo toggle (auto-fit vs fixed viewBox)
- **Fix settings panel intro text**: Remove "typically in the top right". Make "Settings panel" clickable to open it. Less flowery wording
