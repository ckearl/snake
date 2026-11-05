// Pixel-art speed icons: a bunny (fast) and a turtle (slow).
import { map, sprite, outline, ellipse, put } from './pixels.js';

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

// Cheese: a wedge with holes.
export const CHEESE_ICON = sprite(14, 12, (px) => {
  // Wedge: slope from (1,10) up to (12,2), flat bottom, upright right side.
  for (let y = 0; y < 12; y++) {
    for (let x = 1; x <= 12; x++) {
      const top = 10 - ((x - 1) * 8) / 11;
      if (y + 0.5 < top || y > 11) continue;
      let c = '#F7C948'; // face
      if (y + 0.5 < top + 1.2) c = '#FFE89A'; // rind along the slope
      else if (x >= 11) c = '#E0A82E'; // shaded right side
      else if (y === 11) c = '#D9A23A'; // bottom edge
      px[y][x] = c;
    }
  }
  // Holes
  // Holes: dark inside, lighter lower-right lip.
  const hole = ({ dx, dy }) => (dx + dy > 0.5 ? '#C98A1A' : '#8A5A0E');
  ellipse(px, 4.4, 9.2, 1.3, 1.3, hole);
  ellipse(px, 8.2, 7.2, 1.6, 1.6, hole);
  ellipse(px, 9.6, 10.3, 1, 1, hole);
  put(px, 6, 10, '#8A5A0E');
  outline(px, '#7A4E0E');
});
