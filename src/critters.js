// Pixel-art speed icons: a bunny (fast) and a turtle (slow).
import { map, sprite, outline } from './pixels.js';

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
