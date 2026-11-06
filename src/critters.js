// Pixel-art speed icons: a bunny (fast) and a turtle (slow).
import { map, sprite, outline, ellipse } from './pixels.js';

export const BUNNY = sprite(14, 14, (px) => {
  map(px, [
    '......ww.ww...',
    '......wp.wp...',
    '......wp.wp...',
    '......wp.wp...',
    '.......wwww...',
    '......wwwwww..',
    '......wwwkww..',
    '......wwwwwwn.',
    '...wwwwwwwww..',
    '..wwwwwwwwww..',
    '.Wwwwwwwwwww..',
    '..wwwwwwwwww..',
    '...wwd..wwd...',
  ], { w: '#F4F1EA', W: '#FFFFFF', p: '#F2A0B8', k: '#2A1A1A', n: '#F2709A', d: '#C8BFAE' }, 0, 1);
  outline(px, '#7D766A');
});

export const TURTLE = sprite(16, 12, (px) => {
  map(px, [
    '....ssssss......',
    '..ssSSsSSSss....',
    '.sSSSsSSSsSSs...',
    '.sSsSSSsSSSsS.hh',
    '.sSSSsSSSsSSshkh',
    'bbbbbbbbbbbbbhhh',
    '.ll........ll...',
    '.ll........ll...',
  ], { s: '#2F6B2A', S: '#5FA84A', h: '#9CCB5B', k: '#1E1A10', b: '#D9C27A', l: '#7FB34A' }, 0, 2);
  outline(px, '#1F4019');
});

// ---------- game mode icons ----------

// Walls: a little brick wall.
export const WALL_ICON = sprite(14, 12, (px) => {
  map(px, [
    'bbbbbmbbbbbmbb',
    'BBBBBmBBBBBmBB',
    'mmmmmmmmmmmmmm',
    'bbmbbbbbmbbbbb',
    'BBmBBBBBmBBBBB',
    'mmmmmmmmmmmmmm',
    'bbbbbmbbbbbmbb',
    'BBBBBmBBBBBmBB',
    'mmmmmmmmmmmmmm',
    'bbmbbbbbmbbbbb',
    'BBmBBBBBmBBBBB',
  ], { b: '#C8664A', B: '#A44E37', m: '#E9DCC8' }, 0, 1);
  outline(px, '#5A2A1C');
});

// Portals: two glowing ovals, offset diagonally.
export const PORTAL_ICON = sprite(14, 14, (px) => {
  const ring = (cx, cy, base, glow) => ellipse(px, cx, cy, 3, 4.6, ({ d, dx }) => {
    if (d < 0.55) return null; // open middle
    if (d > 0.85) return dx > 0 ? '#1B1238' : base;
    return glow;
  });
  ring(4.2, 5.2, '#3FD9C9', '#A8FFF6');
  ring(9.8, 8.8, '#B46CFF', '#E3C6FF');
});

// Magnet: a horseshoe magnet with silver tips.
export const MAGNET_ICON = sprite(14, 13, (px) => {
  map(px, [
    '.SSS......SSS.',
    '.sss......sss.',
    '.rRr......rRr.',
    '.rRr......rRr.',
    '.rRr......rRr.',
    '.rRr......rRr.',
    '.rRrr....rrRr.',
    '..rRrrrrrrRr..',
    '...rRRRRRRr...',
    '....rrrrrr....',
  ], { r: '#D8343F', R: '#F2707A', S: '#F4F4F8', s: '#B8BCC8' }, 0, 1);
  outline(px, '#5A1418');
});

// Box: a tan wooden crate with a cross brace. Used for the mode icon and on the board.
export const BOX = sprite(14, 14, (px) => {
  map(px, [
    'FFFFFFFFFFFF',
    'FFFFFFFFFFFf',
    'FFXttttttXff',
    'FFtXttttXtff',
    'FFttXttXttff',
    'FFtttXXtttff',
    'FFtttXXtttff',
    'FFttXttXttff',
    'FFtXttttXtff',
    'FFXttttttXff',
    'Ffffffffffff',
    'ffffffffffff',
  ], { F: '#E3BC7E', f: '#B98A4E', t: '#CFA164', X: '#8E5F31' }, 1, 1);
  outline(px, '#5A3A1C');
});

// Mine field flag: red pennant on a dark pole, in two waving poses.
const FLAG_COLORS = { k: '#3A2A22', R: '#E8364F', r: '#B3203A', w: '#FF8A9C', b: '#6B5A4E' };
export const FLAG = [
  [
    '..k.........',
    '..kwRRR.....',
    '..kRRRRRR...',
    '..kRRRRRRRR.',
    '..kRRRRRrr..',
    '..kRRrr.....',
    '..k.........',
    '..k.........',
    '..k.........',
    '..k.........',
    '.bbbb.......',
  ],
  [
    '..k.........',
    '..kwRRRR....',
    '..kRRRRRRR..',
    '..kRRRRRRRRR',
    '..kRRRRrr...',
    '..kRrr......',
    '..k.........',
    '..k.........',
    '..k.........',
    '..k.........',
    '.bbbb.......',
  ],
].map((rows) => sprite(14, 13, (px) => {
  map(px, rows, FLAG_COLORS, 1, 1);
  outline(px, '#1E1612');
}));

// Mines mode icon: a dashed 3×3 field with the flag in the middle.
export const MINES_ICON = sprite(15, 15, (px) => {
  for (let i = 0; i < 15; i++) {
    const on = i % 4 < 2;
    if (!on) continue;
    for (const [x, y] of [[i, 0], [i, 14], [0, i], [14, i]]) px[y][x] = '#F3A93D';
  }
  map(px, [
    '.k.....',
    '.kRRR..',
    '.kRRRRR',
    '.kRRr..',
    '.k.....',
    '.k.....',
    'bbb....',
  ], FLAG_COLORS, 5, 4);
});

// ---------- board theme icons ----------
// 16×16 pixel glyphs (drawn at 2×), each with a dark outline so it reads on its
// theme's top-bar colour.

const inDisc = (x, y, cx, cy, r) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r;

const SUN_ICON = sprite(16, 16, (px) => {
  // Rays: a two-pixel stub on each side, single pixels on the diagonals.
  const ray = '#FFB730';
  for (const [x, y] of [[7, 1], [8, 1], [7, 2], [8, 2], [7, 13], [8, 13], [7, 14], [8, 14],
    [1, 7], [1, 8], [2, 7], [2, 8], [13, 7], [13, 8], [14, 7], [14, 8],
    [3, 3], [12, 3], [3, 12], [12, 12]]) px[y][x] = ray;
  ellipse(px, 8, 8, 3.9, 3.9, ({ dx, dy, d }) => (dx + dy < -0.7 && d < 0.85 ? '#FFF2A6' : dx + dy > 0.6 ? '#F7A21B' : '#FFD23F'));
  outline(px, '#5A3A08');
});

const MOON_ICON = sprite(16, 16, (px) => {
  // A crescent: the disc minus a second one nudged up and right.
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      if (!inDisc(x, y, 8, 8, 6) || inDisc(x, y, 11, 5.5, 5)) continue;
      px[y][x] = x + y < 11 ? '#FFF6CF' : x + y > 16 ? '#D8C46A' : '#F4E39A';
    }
  }
  outline(px, '#3A3216');
});

const SNOWFLAKE_ICON = sprite(16, 16, (px) => {
  const ice = '#EAF7FF';
  const c = 7;
  for (let k = -6; k <= 6; k++) {
    px[c][c + k] = ice; // across
    px[c + k][c] = ice; // down
  }
  for (let k = -4; k <= 4; k++) {
    px[c + k][c + k] = ice; // diagonals
    px[c + k][c - k] = ice;
  }
  // Little V branches near the end of each straight arm.
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const bx = c + dx * 4;
    const by = c + dy * 4;
    for (const s of [-1, 1]) px[by + dy + (dx ? s : 0)][bx + dx + (dy ? s : 0)] = ice;
  }
  px[c][c] = '#8FD3FF';
  outline(px, '#2A5675');
});

const VOLCANO_ICON = sprite(16, 16, (px) => {
  map(px, [
    '.....o...o.....',
    '......o.o......',
    '.......r.......',
    '......LLL......',
    '.....bLLLb.....',
    '.....bbLbbd....',
    '....bbbLbbdd...',
    '....bbbbLbddd..',
    '...bbbbbbbbddd.',
    '...bbbbbbbbbddd',
    '..bbbbbbbbbbddd',
    '.bbbbbbbbbbbbdd',
  ], { o: '#FFD34D', r: '#FF8A2E', L: '#FF5A1F', b: '#9A6440', d: '#6E4229' }, 0, 3);
  outline(px, '#2A1810');
});

const DESERT_ICON = sprite(16, 16, (px) => {
  map(px, [
    '......ggg.......',
    '.....gGggg......',
    '.....gGggg..g...',
    '..g..gGggg.gGg..',
    '.gGg.gGggg.gGg..',
    '.gGg.gGggg.gGg..',
    '.gGg.gGgggggGg..',
    '.gGgggGggggggg..',
    '..gggggGgg......',
    '.....gGggg......',
    '.....gGggg......',
    '.....gGggg......',
    '..ssssssssssss..',
  ], { g: '#3E9B4A', G: '#74CF72', s: '#E8C96A' }, 0, 2);
  outline(px, '#173A1C');
});

const FOREST_ICON = sprite(16, 16, (px) => {
  map(px, [
    '.......g.......',
    '......gGg......',
    '.....gGggd.....',
    '....gGggggd....',
    '......gGg......',
    '.....gGggd.....',
    '....gGggggd....',
    '...gGgggggdd...',
    '.....gGggd.....',
    '....gGggggd....',
    '...gGgggggdd...',
    '..gGggggggddd..',
    '......ttt......',
    '......ttt......',
  ], { g: '#2F9A44', G: '#66CC66', d: '#1F7032', t: '#8A5530' }, 0, 1);
  outline(px, '#0E2A14');
});

const OCEAN_ICON = sprite(16, 16, (px) => {
  // Two rolling waves: a white crest over two shades of blue.
  [[4, '#7CC4FF', '#3E8EE0'], [10, '#4B95E6', '#2560AE']].forEach(([base, a, b], i) => {
    for (let x = 1; x < 15; x++) {
      const y = base + Math.round(1.4 * Math.sin(((x + i * 3) * Math.PI * 2) / 9));
      px[y][x] = '#F2FAFF';
      if (px[y + 1]) px[y + 1][x] = a;
      if (px[y + 2]) px[y + 2][x] = b;
    }
  });
  outline(px, '#0E2A4F');
});

const SPACE_ICON = sprite(16, 16, (px) => {
  // A ringed planet: the back of the ring goes behind it, the front across it.
  const ring = (x, y) => {
    const ox = x + 0.5 - 8;
    const oy = y + 0.5 - 8;
    const a = -0.4;
    const u = (ox * Math.cos(a) + oy * Math.sin(a)) / 7.4;
    const v = (-ox * Math.sin(a) + oy * Math.cos(a)) / 2.2;
    const d = Math.hypot(u, v);
    return d <= 1 && d > 0.62 ? v : null;
  };
  const RING = '#FFB45E';
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (ring(x, y) !== null && ring(x, y) < 0) px[y][x] = RING;
  ellipse(px, 8, 8, 4.4, 4.4, ({ dx, dy, d }) => (dx + dy < -0.6 && d < 0.85 ? '#E2B8FF' : dx + dy > 0.5 ? '#8A4FCB' : '#B57BEF'));
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (ring(x, y) !== null && ring(x, y) >= 0) px[y][x] = RING;
  outline(px, '#1E1036');
});

export const THEME_SPRITES = {
  sun: SUN_ICON,
  moon: MOON_ICON,
  snowflake: SNOWFLAKE_ICON,
  volcano: VOLCANO_ICON,
  desert: DESERT_ICON,
  forest: FOREST_ICON,
  ocean: OCEAN_ICON,
  space: SPACE_ICON,
};
