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

// Yin Yang: the two-tone circle.
export const YINYANG_ICON = sprite(14, 14, (px) => {
  const LIGHT = '#F4F1EA';
  const DARK = '#1E1A2E';
  const cx = 7;
  const cy = 7;
  for (let y = 0; y < 14; y++) {
    for (let x = 0; x < 14; x++) {
      const X = x + 0.5;
      const Y = y + 0.5;
      if (Math.hypot(X - cx, Y - cy) > 6.4) continue;
      const top = Math.hypot(X - cx, Y - (cy - 3.2));
      const bot = Math.hypot(X - cx, Y - (cy + 3.2));
      let c = X > cx ? DARK : LIGHT;
      if (top < 3.2) c = LIGHT;
      if (bot < 3.2) c = DARK;
      if (top < 1.1) c = DARK; // dots
      if (bot < 1.1) c = LIGHT;
      px[y][x] = c;
    }
  }
  outline(px, '#8C95A8');
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
