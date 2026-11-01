const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Draw an engine's scene into a container, reusing the same <svg> between calls
 * so animations only touch what changed. The faces go in a <g> that also carries
 * the outline filter, if there is one.
 */
export function draw(container, engine, opts) {
  let live = container._liveSvg;
  if (!live || live.svg.parentNode !== container) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.style.cssText = "width:100%; height:100%;";
    const defs = document.createElementNS(SVG_NS, "defs");
    const group = document.createElementNS(SVG_NS, "g");
    svg.append(defs, group);
    container.replaceChildren(svg);
    live = container._liveSvg = { svg, defs, group, filter: "" };
  }

  const filter = opts.outlineFilter || "";
  if (live.filter !== filter) {
    live.filter = filter;
    live.defs.innerHTML = filter;
    if (filter) live.group.setAttribute("filter", "url(#cel)");
    else live.group.removeAttribute("filter");
  }

  const faces = opts.faces || engine.getFaces();
  let viewBox;
  if (opts.fit) {
    viewBox = engine
      .getFitViewBox(opts.fit, { padding: opts.padding, faces })
      .join(" ");
  } else {
    const b = engine.getBounds(opts.padding ?? 20, faces);
    viewBox = `${b.x} ${b.y} ${b.w} ${b.h}`;
  }
  if (live.viewBox !== viewBox) {
    live.viewBox = viewBox;
    live.svg.setAttribute("viewBox", viewBox);
  }

  engine.updateSVG(live.group, { ...opts, faces });
}
