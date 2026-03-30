// CSS color string → [r, g, b, a] (floats 0–1), cached.

const _cache = new Map();

const NAMED = {
  transparent: [0, 0, 0, 0],
  black: [0, 0, 0, 1], silver: [0.75, 0.75, 0.75, 1], gray: [0.5, 0.5, 0.5, 1],
  grey: [0.5, 0.5, 0.5, 1], white: [1, 1, 1, 1], maroon: [0.5, 0, 0, 1],
  red: [1, 0, 0, 1], purple: [0.5, 0, 0.5, 1], fuchsia: [1, 0, 1, 1],
  magenta: [1, 0, 1, 1], green: [0, 0.5, 0, 1], lime: [0, 1, 0, 1],
  olive: [0.5, 0.5, 0, 1], yellow: [1, 1, 0, 1], navy: [0, 0, 0.5, 1],
  blue: [0, 0, 1, 1], teal: [0, 0.5, 0.5, 1], aqua: [0, 1, 1, 1],
  cyan: [0, 1, 1, 1], orange: [1, 0.647, 0, 1], aliceblue: [0.941, 0.973, 1, 1],
  antiquewhite: [0.98, 0.922, 0.843, 1], aquamarine: [0.498, 1, 0.831, 1],
  azure: [0.941, 1, 1, 1], beige: [0.961, 0.961, 0.863, 1],
  bisque: [1, 0.894, 0.769, 1], blanchedalmond: [1, 0.922, 0.804, 1],
  blueviolet: [0.541, 0.169, 0.886, 1], brown: [0.647, 0.165, 0.165, 1],
  burlywood: [0.871, 0.722, 0.529, 1], cadetblue: [0.373, 0.62, 0.627, 1],
  chartreuse: [0.498, 1, 0, 1], chocolate: [0.824, 0.412, 0.118, 1],
  coral: [1, 0.498, 0.314, 1], cornflowerblue: [0.392, 0.584, 0.929, 1],
  cornsilk: [1, 0.973, 0.863, 1], crimson: [0.863, 0.078, 0.235, 1],
  darkblue: [0, 0, 0.545, 1], darkcyan: [0, 0.545, 0.545, 1],
  darkgoldenrod: [0.722, 0.525, 0.043, 1], darkgray: [0.663, 0.663, 0.663, 1],
  darkgrey: [0.663, 0.663, 0.663, 1], darkgreen: [0, 0.392, 0, 1],
  darkkhaki: [0.741, 0.718, 0.42, 1], darkmagenta: [0.545, 0, 0.545, 1],
  darkolivegreen: [0.333, 0.42, 0.184, 1], darkorange: [1, 0.549, 0, 1],
  darkorchid: [0.6, 0.196, 0.8, 1], darkred: [0.545, 0, 0, 1],
  darksalmon: [0.914, 0.588, 0.478, 1], darkseagreen: [0.561, 0.737, 0.561, 1],
  darkslateblue: [0.282, 0.239, 0.545, 1], darkslategray: [0.184, 0.31, 0.31, 1],
  darkslategrey: [0.184, 0.31, 0.31, 1], darkturquoise: [0, 0.808, 0.82, 1],
  darkviolet: [0.58, 0, 0.827, 1], deeppink: [1, 0.078, 0.576, 1],
  deepskyblue: [0, 0.749, 1, 1], dimgray: [0.412, 0.412, 0.412, 1],
  dimgrey: [0.412, 0.412, 0.412, 1], dodgerblue: [0.118, 0.565, 1, 1],
  firebrick: [0.698, 0.133, 0.133, 1], floralwhite: [1, 0.98, 0.941, 1],
  forestgreen: [0.133, 0.545, 0.133, 1], gainsboro: [0.863, 0.863, 0.863, 1],
  ghostwhite: [0.973, 0.973, 1, 1], gold: [1, 0.843, 0, 1],
  goldenrod: [0.855, 0.647, 0.125, 1], greenyellow: [0.678, 1, 0.184, 1],
  honeydew: [0.941, 1, 0.941, 1], hotpink: [1, 0.412, 0.706, 1],
  indianred: [0.804, 0.361, 0.361, 1], indigo: [0.294, 0, 0.51, 1],
  ivory: [1, 1, 0.941, 1], khaki: [0.941, 0.902, 0.549, 1],
  lavender: [0.902, 0.902, 0.98, 1], lavenderblush: [1, 0.941, 0.961, 1],
  lawngreen: [0.486, 0.988, 0, 1], lemonchiffon: [1, 0.98, 0.804, 1],
  lightblue: [0.678, 0.847, 0.902, 1], lightcoral: [0.941, 0.502, 0.502, 1],
  lightcyan: [0.878, 1, 1, 1], lightgoldenrodyellow: [0.98, 0.98, 0.824, 1],
  lightgray: [0.827, 0.827, 0.827, 1], lightgrey: [0.827, 0.827, 0.827, 1],
  lightgreen: [0.565, 0.933, 0.565, 1], lightpink: [1, 0.714, 0.757, 1],
  lightsalmon: [1, 0.627, 0.478, 1], lightseagreen: [0.125, 0.698, 0.667, 1],
  lightskyblue: [0.529, 0.808, 0.98, 1], lightslategray: [0.467, 0.533, 0.6, 1],
  lightslategrey: [0.467, 0.533, 0.6, 1], lightsteelblue: [0.69, 0.769, 0.871, 1],
  lightyellow: [1, 1, 0.878, 1], limegreen: [0.196, 0.804, 0.196, 1],
  linen: [0.98, 0.941, 0.902, 1], mediumaquamarine: [0.4, 0.804, 0.667, 1],
  mediumblue: [0, 0, 0.804, 1], mediumorchid: [0.729, 0.333, 0.827, 1],
  mediumpurple: [0.576, 0.439, 0.859, 1], mediumseagreen: [0.235, 0.702, 0.443, 1],
  mediumslateblue: [0.482, 0.408, 0.933, 1], mediumspringgreen: [0, 0.98, 0.604, 1],
  mediumturquoise: [0.282, 0.82, 0.8, 1], mediumvioletred: [0.78, 0.082, 0.522, 1],
  midnightblue: [0.098, 0.098, 0.439, 1], mintcream: [0.961, 1, 0.98, 1],
  mistyrose: [1, 0.894, 0.882, 1], moccasin: [1, 0.894, 0.71, 1],
  navajowhite: [1, 0.871, 0.678, 1], oldlace: [0.992, 0.961, 0.902, 1],
  olivedrab: [0.42, 0.557, 0.137, 1], orangered: [1, 0.271, 0, 1],
  orchid: [0.855, 0.439, 0.839, 1], palegoldenrod: [0.933, 0.91, 0.667, 1],
  palegreen: [0.596, 0.984, 0.596, 1], paleturquoise: [0.686, 0.933, 0.933, 1],
  palevioletred: [0.859, 0.439, 0.576, 1], papayawhip: [1, 0.937, 0.835, 1],
  peachpuff: [1, 0.855, 0.725, 1], peru: [0.804, 0.522, 0.247, 1],
  pink: [1, 0.753, 0.796, 1], plum: [0.867, 0.627, 0.867, 1],
  powderblue: [0.69, 0.878, 0.902, 1], rosybrown: [0.737, 0.561, 0.561, 1],
  royalblue: [0.255, 0.412, 0.882, 1], saddlebrown: [0.545, 0.271, 0.075, 1],
  salmon: [0.98, 0.502, 0.447, 1], sandybrown: [0.957, 0.643, 0.376, 1],
  seagreen: [0.18, 0.545, 0.341, 1], seashell: [1, 0.961, 0.933, 1],
  sienna: [0.627, 0.322, 0.176, 1], skyblue: [0.529, 0.808, 0.922, 1],
  slateblue: [0.416, 0.353, 0.804, 1], slategray: [0.439, 0.502, 0.565, 1],
  slategrey: [0.439, 0.502, 0.565, 1], snow: [1, 0.98, 0.98, 1],
  springgreen: [0, 1, 0.498, 1], steelblue: [0.275, 0.51, 0.706, 1],
  tan: [0.824, 0.706, 0.549, 1], thistle: [0.847, 0.749, 0.847, 1],
  tomato: [1, 0.388, 0.278, 1], turquoise: [0.251, 0.878, 0.816, 1],
  violet: [0.933, 0.51, 0.933, 1], wheat: [0.961, 0.871, 0.702, 1],
  whitesmoke: [0.961, 0.961, 0.961, 1], yellowgreen: [0.604, 0.804, 0.196, 1],
  rebeccapurple: [0.4, 0.2, 0.6, 1],
};

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r, g, b;
  if (h < 60)       { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  return [r + m, g + m, b + m];
}

export function parseColor(css) {
  if (!css) return [0, 0, 0, 1];
  const cached = _cache.get(css);
  if (cached) return cached;

  const s = css.trim().toLowerCase();
  let result;

  // Named color
  if (NAMED[s]) {
    result = NAMED[s].slice();
  }
  // #rgb, #rrggbb, #rrggbbaa, #rgba
  else if (s[0] === "#") {
    const hex = s.slice(1);
    if (hex.length === 3) {
      result = [
        parseInt(hex[0] + hex[0], 16) / 255,
        parseInt(hex[1] + hex[1], 16) / 255,
        parseInt(hex[2] + hex[2], 16) / 255,
        1,
      ];
    } else if (hex.length === 4) {
      result = [
        parseInt(hex[0] + hex[0], 16) / 255,
        parseInt(hex[1] + hex[1], 16) / 255,
        parseInt(hex[2] + hex[2], 16) / 255,
        parseInt(hex[3] + hex[3], 16) / 255,
      ];
    } else if (hex.length === 6) {
      result = [
        parseInt(hex.slice(0, 2), 16) / 255,
        parseInt(hex.slice(2, 4), 16) / 255,
        parseInt(hex.slice(4, 6), 16) / 255,
        1,
      ];
    } else if (hex.length === 8) {
      result = [
        parseInt(hex.slice(0, 2), 16) / 255,
        parseInt(hex.slice(2, 4), 16) / 255,
        parseInt(hex.slice(4, 6), 16) / 255,
        parseInt(hex.slice(6, 8), 16) / 255,
      ];
    } else {
      result = [0, 0, 0, 1];
    }
  }
  // rgb() / rgba()
  else if (s.startsWith("rgb")) {
    const m = s.match(/rgba?\(\s*([\d.]+)[,%\s]+([\d.]+)[,%\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)/);
    if (m) {
      const r = parseFloat(m[1]) > 1 ? parseFloat(m[1]) / 255 : parseFloat(m[1]);
      const g = parseFloat(m[2]) > 1 ? parseFloat(m[2]) / 255 : parseFloat(m[2]);
      const b = parseFloat(m[3]) > 1 ? parseFloat(m[3]) / 255 : parseFloat(m[3]);
      const a = m[4] !== undefined ? parseFloat(m[4]) : 1;
      result = [r, g, b, a > 1 ? a / 255 : a];
    } else {
      result = [0, 0, 0, 1];
    }
  }
  // hsl() / hsla()
  else if (s.startsWith("hsl")) {
    const m = s.match(/hsla?\(\s*([\d.]+)[,\s]+([\d.]+)%[,\s]+([\d.]+)%(?:[,/\s]+([\d.]+))?\s*\)/);
    if (m) {
      const [r, g, b] = hslToRgb(parseFloat(m[1]), parseFloat(m[2]) / 100, parseFloat(m[3]) / 100);
      const a = m[4] !== undefined ? parseFloat(m[4]) : 1;
      result = [r, g, b, a > 1 ? a / 255 : a];
    } else {
      result = [0, 0, 0, 1];
    }
  } else {
    result = [0, 0, 0, 1];
  }

  _cache.set(css, result);
  return result;
}
