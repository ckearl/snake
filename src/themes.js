// Board themes and snake skins. Pure data + colour helpers.

// [topBar, margins, lightSquare, darkSquare]
const T = (name, icon, [topBar, margins, light, dark]) => ({ name, icon, topBar, margins, light, dark });

export const THEMES = {
  sun: T('Sun', 'sun', ['#4A752C', '#578A34', '#AAD751', '#A2D149']),
  moon: T('Moon', 'moon', ['#262428', '#2C2730', '#494351', '#443E4C']),
  snowflake: T('Snowflake', 'snowflake', ['#75898A', '#879FA1', '#DEECED', '#D1E4E6']),
  volcano: T('Volcano', 'volcano', ['#762D2D', '#A33E3E', '#6E3535', '#673232']),
  desert: T('Desert', 'desert', ['#725E1D', '#977B26', '#F2D78C', '#ECCD79']),
  forest: T('Forest', 'forest', ['#202822', '#253227', '#3F5543', '#3B4F3F']),
  ocean: T('Ocean', 'ocean', ['#1D457C', '#275BA5', '#B4D0F9', '#A3C5F5']),
  space: T('Space', 'space', ['#432A6F', '#604096', '#432C68', '#3D285D']),
};
export const DEFAULT_THEME = 'ocean';

// Snake skins: colour stops from head (0) to tail (1).
// Solid colours go slightly darker at the head -> base -> slightly lighter at the tail.
const solid = (name, c) => ({ name, stops: [shade(c, -0.18), c, shade(c, 0.22)] });
const blend = (name, head, tail) => ({ name, stops: [head, tail] });

export const SKINS = {
  blue: solid('Blue', '#4F7EEC'),
  cyan: solid('Cyan', '#18D4E4'),
  purple: solid('Purple', '#B446F0'),
  pink: solid('Pink', '#EA42B4'),
  red: solid('Red', '#F23D40'),
  orange: solid('Orange', '#F3993D'),
  yellow: solid('Yellow', '#E9D213'),
  green: solid('Green', '#36BA42'),
  gray: solid('Gray', '#6A6A6B'),
  white: solid('White', '#EAEAEB'),
  blueRed: blend('Blue to red', '#5E78D6', '#D04A72'),
  fuchsiaOrange: blend('Fuchsia to orange', '#C457BF', '#E9813D'),
  pinkYellow: blend('Pink to yellow', '#F55A82', '#F5C71B'),
  sandLime: blend('Sand to lime', '#D4B506', '#5FBC1A'),
  greenBlue: blend('Green to blue', '#39B16F', '#3980E0'),
  grayWhite: blend('Gray to white', '#898989', '#DBDBDC'),
  whiteGray: blend('White to gray', '#D5D5D6', '#848484'),
};
export const DEFAULT_SKIN = 'purple';

// Colour at position t (0 = head, 1 = tail) along a skin's stops.
export function skinColor(skin, t) {
  const { stops } = skin;
  if (stops.length === 1) return stops[0];
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  return mix(stops[i], stops[i + 1], x - i);
}

export function mix(a, b, t) {
  const na = parseInt(a.slice(1), 16);
  const nb = parseInt(b.slice(1), 16);
  const ch = (shift) => Math.round(((na >> shift) & 255) + (((nb >> shift) & 255) - ((na >> shift) & 255)) * t);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

// Mix a hex colour toward white (amt > 0) or black (amt < 0).
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const target = amt >= 0 ? 255 : 0;
  const a = Math.abs(amt);
  const ch = (v) => Math.round(v + (target - v) * a);
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

// Theme icons: 24×24 SVG line drawings.
export const THEME_ICONS = {
  sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z"/>',
  snowflake: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17l17.4-10M9 3.5l3 2.5 3-2.5M9 20.5l3-2.5 3 2.5"/>',
  volcano: '<path d="M2 21l6.5-10h7L22 21z"/><path d="M10 11l2 3 2-3"/><path d="M10.5 7c-1-1.5 1-2.5 0-4M14 7c-1-1.5 1-2.5 0-4"/>',
  desert: '<path d="M10 21V6a2 2 0 0 1 4 0v15"/><path d="M10 13H7.5A2 2 0 0 1 5.5 11V8.5M14 15h2.5a2 2 0 0 0 2-2v-2.5"/><path d="M3 21h18"/>',
  forest: '<path d="M12 2.5L6.5 10h3.5L5 17h14l-5-7h3.5z"/><path d="M12 17v4.5"/>',
  ocean: '<path d="M2 8.5c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0M2 13.5c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0M2 18.5c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0"/>',
  space: '<circle cx="12" cy="12" r="5"/><ellipse cx="12" cy="12" rx="10.5" ry="3.2" transform="rotate(-22 12 12)"/>',
};

// ---------- HSL helpers ----------
function toHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function fromHsl(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return `#${((1 << 24) | (f(0) << 16) | (f(8) << 8) | f(4)).toString(16).slice(1)}`;
}

// Accent for markings drawn on the board (box targets, mine fields): the board
// colour's complementary hue, kept vivid, and dark on light boards / light on
// dark ones so it always reads. Grey boards get a warm amber.
export function boardAccent(theme) {
  const [h, s] = toHsl(theme.margins);
  const [, , boardL] = toHsl(theme.light);
  const hue = s < 0.12 ? 38 : (h + 180) % 360;
  return fromHsl(hue, Math.max(0.65, s), boardL > 0.55 ? 0.36 : 0.66);
}
