// Pixel-art fruit sprites. Each sprite is a 2D array of CSS colours (null = transparent).
// Round fruits are generated from shaded ellipses; the rest are hand-drawn char maps.
import { put, map, ellipse, shaded, sprite, outline } from './pixels.js';

const BROWN = '#6B4423';
const LEAF = '#4CBF55';
const LEAF_DARK = '#2C8A37';

// ---------- the fruits ----------
const apple = sprite(14, 14, (px) => {
  ellipse(px, 7, 8.4, 6, 5.4, shaded({ base: '#E0352B', light: '#F4705F', dark: '#A9201A' }));
  put(px, 6, 3, null); // dimple
  put(px, 4, 5, '#FFD0C8');
  map(px, [
    '.......k.ll',
    '.......kll.',
    '.......k...',
  ], { k: BROWN, l: LEAF }, 0, 1);
});

const banana = sprite(14, 14, (px) => {
  map(px, [
    '..........kk..',
    '..........yy..',
    '.........yYy..',
    '.........yYyd.',
    '........yYyyd.',
    '.......yYyyd..',
    '......yYyyyd..',
    '.....yYyyydd..',
    '...yyYyyydd...',
    '.kyYYyyydd....',
    '.kyyyyddd.....',
    '..dddd........',
  ], { y: '#F5D63D', Y: '#FFF08A', d: '#CFA51C', k: '#5A3D1E' }, 0, 1);
});

const pineapple = sprite(14, 16, (px) => {
  ellipse(px, 7, 10.6, 4.7, 5.3, ({ dx, dy, d, x, y }) => {
    if (d > 0.82 && dx + dy > 0.2) return '#B8761A';
    if ((x + y) % 3 === 0 || (x - y + 99) % 3 === 0) return '#D08E1C';
    if (dx + dy < -0.55) return '#FFD75A';
    return '#F2B33D';
  });
  map(px, [
    '......g.......',
    '...g..gg...g..',
    '...gg.gG..gg..',
    '....gGgGgGg...',
    '.....gGGgg....',
    '......gg......',
  ], { g: LEAF, G: LEAF_DARK });
});

const grapes = sprite(14, 14, (px) => {
  const grape = ({ dx, dy, d }) => {
    if (d > 0.72) return '#3F2170'; // rim keeps overlapping grapes distinct
    if (dx + dy < -0.5) return '#B98BE8';
    return '#7D46C8';
  };
  const centres = [
    [2.6, 4.4], [5.5, 4.2], [8.5, 4.2], [11.4, 4.4],
    [4, 7.1], [7, 7], [10, 7.1],
    [5.5, 9.8], [8.5, 9.8],
    [7, 12.4],
  ];
  for (const [cx, cy] of centres) ellipse(px, cx, cy, 1.85, 1.85, grape);
  map(px, [
    '.......k.ll',
    '.......kll.',
    '.......k...',
  ], { k: BROWN, l: LEAF });
});

const orange = sprite(12, 12, (px) => {
  ellipse(px, 6, 7.1, 5.25, 5.25, ({ dx, dy, d, x, y }) => {
    const s = dx + dy;
    if (d > 0.8 && s > 0.1) return '#D9690B';
    if (s < -0.8 && d < 0.82) return '#FFC56A';
    if (s > 0.65) return '#E97E12';
    if ((x * 3 + y * 5) % 7 === 0 && d < 0.78) return '#EC8516';
    return '#F7931E';
  });
  put(px, 3, 3, '#FFE2A8');
  map(px, [
    '......kll',
    '......klll',
  ], { k: BROWN, l: LEAF });
});

const turnip = sprite(14, 14, (px) => {
  map(px, [
    '....g.g.g.....',
    '...gg.g.gg....',
    '....gGgGg.....',
    '.....gGg......',
    '....pPPPp.....',
    '...pPPPPPp....',
    '..wWWwwwwwd...',
    '..wWwwwwwwd...',
    '..wwwwwwwwd...',
    '...wwwwwwd....',
    '....wwwwd.....',
    '.....wwd......',
    '......d.......',
    '......d.......',
  ], { g: LEAF, G: LEAF_DARK, p: '#8B3FA6', P: '#B565CF', w: '#EEEAE0', W: '#FFFFFF', d: '#C8BFAE' }, 1);
});

const eggplant = sprite(14, 14, (px) => {
  map(px, [
    '.....gg.....',
    '....gggg....',
    '...gGggGg...',
    '....gpPg....',
    '...pPPPpp...',
    '..pPPppppp..',
    '..pPpppppp..',
    '..pPppppppd.',
    '..ppppppppd.',
    '..ppppppppd.',
    '...ppppppd..',
    '...pppppdd..',
    '....pppdd...',
    '.....ddd....',
  ], { g: LEAF, G: LEAF_DARK, p: '#6B2E8C', P: '#9A5BC0', d: '#4A1D63' }, 1);
});

const strawberry = sprite(14, 14, (px) => {
  map(px, [
    '.....g.g.g....',
    '....gggGggg...',
    '...rrgrrgrr...',
    '..rRrrrrrrrr..',
    '..rRryrrryrd..',
    '..rrrrrryrrd..',
    '..ryrrrrrrrd..',
    '...rrryrrrd...',
    '...rrrrryrd...',
    '....ryrrrd....',
    '.....rrrd.....',
    '......rd......',
  ], { g: LEAF, G: LEAF_DARK, r: '#E2303B', R: '#FF7A80', y: '#FFE36B', d: '#A81E2A' }, 0, 1);
});

const cherries = sprite(14, 14, (px) => {
  map(px, [
    '........ll.',
    '.......kll.',
    '......k.k..',
    '......k..k.',
    '.....k...k.',
    '.....k....k',
    '....k.....k',
    '....k.....k',
  ], { k: '#4F7A2A', l: LEAF });
  const cherry = shaded({ base: '#D21F3C', light: '#F2627A', dark: '#8E1026' });
  ellipse(px, 4.2, 10.4, 2.9, 2.9, cherry);
  ellipse(px, 10.6, 10, 2.9, 2.9, cherry);
  put(px, 3, 9, '#FFD1D9');
  put(px, 9, 9, '#FFD1D9');
});

const carrot = sprite(14, 14, (px) => {
  map(px, [
    '.......g.g..',
    '........gg.g',
    '......g.ggg.',
    '.......oog..',
    '......oOoo..',
    '.....oOooo..',
    '.....Oood...',
    '....oOood...',
    '....Oood....',
    '...oOod.....',
    '...ood......',
    '..ood.......',
    '..od........',
    '.o..........',
  ], { g: LEAF, o: '#F28A1E', O: '#FFB25A', d: '#C9600E' }, 1);
});

const mushroom = sprite(14, 14, (px) => {
  map(px, [
    '.....rrrr.....',
    '...rrwwrrrr...',
    '..rrwwwrrwwr..',
    '.rrrwwrrrwwrr.',
    '.rwwrrrrrrrrr.',
    'rrwwrrrwwrrrrd',
    'rrrrrrrwwrrrdd',
    '.ddrrrrrrrrdd.',
    '....cccccc....',
    '....cCcccck...',
    '....cCcccck...',
    '....cCcccck...',
    '....cccccck...',
    '.....ckkkk....',
  ], { r: '#E2303B', w: '#FFF6EC', d: '#A81E2A', c: '#F3E6CF', C: '#FFFFFF', k: '#CDB894' });
});

const broccoli = sprite(14, 14, (px) => {
  map(px, [
    '.....sSss.....',
    '.....sSss.....',
    '....sSsss.....',
    '....sSssss....',
    '...ssSsss.s...',
    '....sssss.....',
  ], { s: '#9CCB5B', S: '#C3E58A' }, 0, 8);
  const floret = ({ dx, dy, d, x, y }) => {
    if (d > 0.75 && dx + dy > 0.2) return '#2A6E28';
    if ((x * 7 + y * 3) % 5 === 0) return '#2F7F2C';
    if (dx + dy < -0.6) return '#6CC25A';
    return '#3E9B3A';
  };
  for (const [cx, cy, r] of [[4, 4.8, 2.7], [7.4, 3.3, 2.9], [10.4, 5, 2.7], [5.6, 7.2, 2.6], [9, 7.4, 2.6]]) {
    ellipse(px, cx, cy, r, r, floret);
  }
});

const watermelon = sprite(14, 11, (px) => {
  ellipse(px, 7, 1, 7, 9.2, ({ d, y }) => {
    if (y < 1) return null; // flat cut face on top
    if (d > 0.9) return '#2E8B3A';
    if (d > 0.82) return '#6CC25A';
    if (d > 0.76) return '#E8F5D0';
    if (y === 1) return '#FF7A82';
    return '#F0444F';
  });
  for (const [x, y] of [[4, 3], [7, 4], [10, 3], [5, 6], [9, 6], [7, 7]]) put(px, x, y, '#2A1A1A');
});

const jalapeno = sprite(14, 14, (px) => {
  ellipse(px, 7.6, 8.2, 6.1, 2.9, ({ v, d, u }) => {
    if (d > 0.75 && v > 0.15) return '#24661F';
    if (v < -0.35 && u > -0.75 && u < 0.6) return '#7CCB60';
    return '#3E9B3A';
  }, Math.PI / 4.2);
  map(px, [
    '..k...........',
    '..kk..........',
    '..CCC.........',
    '.CCCC.........',
  ], { k: BROWN, C: '#2C7A2A' }, 1, 0);
});

const kiwi = sprite(14, 14, (px) => {
  ellipse(px, 7, 7, 6.3, 6.3, ({ dx, dy, d, x, y }) => {
    if (d > 0.87) return '#8A6A3A';
    if (d > 0.79) return '#B9D86A';
    if (d < 0.2) return '#F3F0C8';
    if (d > 0.3 && d < 0.52 && (x + y) % 3 === 0) return '#1E1A10';
    if (dx + dy < -0.35) return '#A3D85A';
    return '#7BBF3A';
  });
});

const lemon = sprite(14, 14, (px) => {
  ellipse(px, 7, 7, 6, 4.6, shaded({ base: '#F7D93A', light: '#FFF08A', dark: '#D4AC0D' }));
  put(px, 0, 6, '#E8C21C');
  put(px, 13, 7, '#D4AC0D');
  put(px, 4, 5, '#FFFBD0');
});

const peach = sprite(14, 14, (px) => {
  ellipse(px, 7, 8.2, 5.8, 5.6, ({ dx, dy, d }) => {
    if (d > 0.82 && dx + dy > 0.3) return '#D9534F';
    if (dx > 0.25) return '#F2706A';
    if (dx > -0.3) return '#F7A66B';
    return '#FBC98A';
  });
  for (const [x, y] of [[7, 3], [7, 4], [7, 5], [8, 6]]) put(px, x, y, '#D9534F');
  map(px, [
    '.......k.ll',
    '.......kll.',
  ], { k: BROWN, l: LEAF }, 0, 1);
});

const tomato = sprite(14, 14, (px) => {
  ellipse(px, 7, 8, 6.2, 5.3, shaded({ base: '#E8322E', light: '#FF7466', dark: '#AE1E1C' }));
  put(px, 3, 6, '#FFC4BA');
  map(px, [
    '.......k......',
    '...gg.ggg.gg..',
    '.....ggggg....',
    '....g..g..g...',
  ], { k: LEAF_DARK, g: LEAF }, 0, 1);
});

const mango = sprite(14, 14, (px) => {
  ellipse(px, 7, 7.6, 6.3, 4.7, ({ u, v, d }) => {
    if (d > 0.82 && v > 0.2) return '#B5542A';
    if (u > 0.4) return '#EE5A3A';
    if (u > 0) return '#F79A2B';
    if (u > -0.45) return '#F5C43A';
    return '#8CC23A';
  }, -Math.PI / 5);
  put(px, 6, 5, '#FFE7A0');
  map(px, [
    '...........k',
    '..........kl',
    '...........l',
  ], { k: BROWN, l: LEAF });
});

const avocado = sprite(14, 14, (px) => {
  const inShape = (x, y, shrink) => {
    const cx = x + 0.5;
    const cy = y + 0.5;
    return Math.hypot(cx - 7, cy - 4.6) <= 3.4 - shrink
      || Math.hypot(cx - 7, cy - 9.1) <= 4.7 - shrink;
  };
  for (let y = 0; y < 14; y++) {
    for (let x = 0; x < 14; x++) {
      if (!inShape(x, y, 0)) continue;
      if (!inShape(x, y, 0.95)) px[y][x] = '#2F5A1E';
      else if (!inShape(x, y, 2)) px[y][x] = '#A6CF5A';
      else px[y][x] = '#E3EC9C';
    }
  }
  ellipse(px, 7, 9.4, 2.2, 2.2, ({ dx, dy }) => (dx + dy < -0.4 ? '#A0683A' : '#7A4A26'));
});

export const FRUITS = {
  apple: { name: 'Apple', sprite: apple },
  banana: { name: 'Banana', sprite: banana },
  pineapple: { name: 'Pineapple', sprite: pineapple },
  grapes: { name: 'Grapes', sprite: grapes },
  orange: { name: 'Orange', sprite: orange },
  turnip: { name: 'White turnip', sprite: turnip },
  eggplant: { name: 'Eggplant', sprite: eggplant },
  strawberry: { name: 'Strawberry', sprite: strawberry },
  cherries: { name: 'Cherries', sprite: cherries },
  carrot: { name: 'Carrot', sprite: carrot },
  mushroom: { name: 'Mushroom', sprite: mushroom },
  broccoli: { name: 'Broccoli', sprite: broccoli },
  watermelon: { name: 'Watermelon', sprite: watermelon },
  jalapeno: { name: 'Jalapeño', sprite: jalapeno },
  kiwi: { name: 'Kiwi', sprite: kiwi },
  lemon: { name: 'Lemon', sprite: lemon },
  peach: { name: 'Peach', sprite: peach },
  tomato: { name: 'Tomato', sprite: tomato },
  mango: { name: 'Mango', sprite: mango },
  avocado: { name: 'Avocado', sprite: avocado },
};
export const DEFAULT_FRUIT = 'orange';

// Fruit basket: the icon for "mixed fruit" (every fruit a random kind).
export const BASKET = sprite(14, 14, (px) => {
  // Handle
  for (const [x, y] of [[4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [9, 0], [3, 1], [10, 1], [2, 2], [11, 2], [2, 3], [11, 3], [2, 4], [11, 4]]) {
    put(px, x, y, '#8A5A2B');
  }
  // Fruit peeking out: apple, banana, orange, grapes
  ellipse(px, 4.4, 5.4, 1.9, 1.9, shaded({ base: '#E0352B', light: '#F4705F', dark: '#A9201A' }));
  map(px, ['..yy', '.yy.', 'yy..'], { y: '#F5D63D' }, 5, 2);
  ellipse(px, 7.4, 5.6, 1.7, 1.7, shaded({ base: '#F7931E', light: '#FFC56A', dark: '#D9690B' }));
  for (const [x, y] of [[9.4, 4.6], [10.6, 5.4], [9.6, 6]]) {
    ellipse(px, x, y, 0.9, 0.9, () => '#7D46C8');
  }
  // Woven basket body, tapering toward the bottom
  const rows = [[1, 12], [1, 12], [1, 12], [2, 11], [2, 11], [3, 10]];
  rows.forEach(([x0, x1], i) => {
    const y = 7 + i;
    for (let x = x0; x <= x1; x++) {
      px[y][x] = i === 0 ? '#6B3F1C' : (x + y) % 2 ? '#B87838' : '#93592A';
    }
  });
  outline(px, '#4A2A12');
});
