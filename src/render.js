// Canvas drawing: board, snake, and pixel sprites. No game rules here.
import { SKINS, DEFAULT_SKIN, skinColor, shade } from './themes.js';
import { FRUITS, DEFAULT_FRUIT } from './fruits.js';

export const PALETTE = {
  cellA: '#B4D0F9',
  cellB: '#A3C5F5',
  shadow: 'rgba(0, 0, 0, 0.18)',
  skyTop: '#275BA5',
  skyBottom: '#7E9FD8',
  eyeWhite: '#FFFFFF',
  pupil: '#1B1238',
  tongue: '#E8364F',
};

export function setBoardColors({ light, dark, skyTop, skyBottom }) {
  Object.assign(PALETTE, { cellA: light, cellB: dark, skyTop, skyBottom });
}

let currentSkin = SKINS[DEFAULT_SKIN];
export function setSnakeSkin(skin) {
  currentSkin = skin;
}

// Per-segment colours along the skin gradient (head -> tail).
function segmentColors(skin, n) {
  return Array.from({ length: n }, (_, i) => {
    const body = skinColor(skin, n > 1 ? i / (n - 1) : 0);
    return { body, outline: shade(body, -0.42), dot: shade(body, 0.3) };
  });
}

// ---------- canvas helpers ----------
export function sizeCanvas(canvas, w, h) {
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

// Draws a sprite (2D array of color strings / null) into a w×h box at (x, y),
// snapping each sprite pixel to whole screen pixels so there are no seams.
function blit(ctx, sprite, x, y, w, h) {
  const rows = sprite.length;
  const cols = sprite[0].length;
  for (let r = 0; r < rows; r++) {
    const y0 = Math.round(y + (r * h) / rows);
    const y1 = Math.round(y + ((r + 1) * h) / rows);
    for (let c = 0; c < cols; c++) {
      const color = sprite[r][c];
      if (!color) continue;
      const x0 = Math.round(x + (c * w) / cols);
      const x1 = Math.round(x + ((c + 1) * w) / cols);
      ctx.fillStyle = color;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }
}

function fromMap(map, colors) {
  return map.map((row) => [...row].map((ch) => colors[ch] ?? null));
}

// ---------- sprites ----------
const CROWN = fromMap(
  [
    '.............',
    '.o....o....o.',
    'oYo..oYo..oYo',
    '.y....y....y.',
    '.yy..yyy..yy.',
    '.yyy.yyy.yyy.',
    '.yyyyyyyyyyy.',
    '.yYyyyyyyyYy.',
    '.yyyryybyyry.',
    '.yyyyyyyyyyy.',
    '.ddddddddddd.',
    '.............',
  ],
  { y: '#F7C33C', Y: '#FFE48A', o: '#F7C33C', d: '#C98E12', r: '#E8364F', b: '#4B8BF5' },
);

// Draw a fruit sprite centred in a size×size box, keeping its aspect ratio.
export function drawFruit(ctx, kind, x, y, size, { shadow = false } = {}) {
  const sprite = (FRUITS[kind] ?? FRUITS[DEFAULT_FRUIT]).sprite;
  const h = sprite.length;
  const w = sprite[0].length;
  const scale = size / Math.max(w, h);
  const bw = w * scale;
  const bh = h * scale;
  const bx = x + (size - bw) / 2;
  const by = y + (size - bh) / 2;
  if (shadow) {
    ctx.fillStyle = PALETTE.shadow;
    ctx.beginPath();
    ctx.ellipse(x + size / 2, by + bh * 0.97, bw * 0.36, size * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  blit(ctx, sprite, bx, by, bw, bh);
}

export function drawCrown(ctx, x, y, size) {
  blit(ctx, CROWN, x, y, size, (size * CROWN.length) / CROWN[0].length);
}

// ---------- board ----------
export function drawBoard(ctx, cols, rows, cell) {
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      ctx.fillStyle = (x + y) % 2 ? PALETTE.cellB : PALETTE.cellA;
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
}

// ---------- snake ----------
const DIR_VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

function sidesConnected(seg, a, b) {
  const s = { left: false, right: false, up: false, down: false };
  for (const n of [a, b]) {
    if (!n) continue;
    if (n.x === seg.x - 1 && n.y === seg.y) s.left = true;
    if (n.x === seg.x + 1 && n.y === seg.y) s.right = true;
    if (n.y === seg.y - 1 && n.x === seg.x) s.up = true;
    if (n.y === seg.y + 1 && n.x === seg.x) s.down = true;
  }
  return s;
}

// Fill a cell, inset by `inset` on sides that aren't joined to a neighbour,
// so consecutive segments read as one continuous tube.
function segRect(ctx, seg, cell, sides, inset, ox = 0, oy = 0) {
  const l = sides.left ? 0 : inset;
  const r = sides.right ? 0 : inset;
  const t = sides.up ? 0 : inset;
  const b = sides.down ? 0 : inset;
  ctx.fillRect(seg.x * cell + l + ox, seg.y * cell + t + oy, cell - l - r, cell - t - b);
}

export function drawSnake(ctx, snake, cell, { dir = 'right', dead = false, tongue = false, skin = null, shadow = true, biteTail = false } = {}) {
  if (!snake.length) return;
  const n = snake.length;
  // biteTail joins head and tail so the snake forms a closed loop (used for icons).
  const tail = snake[n - 1];
  const sides = snake.map((s, i) => sidesConnected(
    s,
    snake[i - 1] ?? (biteTail ? tail : undefined),
    snake[i + 1] ?? (biteTail ? snake[0] : undefined),
  ));
  const baseInset = (i) => {
    if (i === 0) return Math.round(cell * 0.05);
    if (i === n - 1) return Math.round(cell * 0.2);
    return Math.round(cell * 0.1);
  };
  const border = Math.max(2, Math.round(cell * 0.08));
  const dot = Math.max(2, Math.round(cell * 0.2));

  const colors = segmentColors(skin ?? currentSkin, n);

  if (shadow) {
    ctx.fillStyle = PALETTE.shadow;
    const sh = Math.max(2, Math.round(cell * 0.08));
    snake.forEach((s, i) => segRect(ctx, s, cell, sides[i], baseInset(i), 0, sh));
  }

  // Outline + body passes
  snake.forEach((s, i) => {
    ctx.fillStyle = colors[i].outline;
    segRect(ctx, s, cell, sides[i], baseInset(i));
  });
  snake.forEach((s, i) => {
    ctx.fillStyle = colors[i].body;
    segRect(ctx, s, cell, sides[i], baseInset(i) + border);
  });

  if (biteTail && n > 2) drawBite(ctx, snake[0], tail, cell, baseInset(n - 1) + border, colors[n - 1].body, colors[0].outline);

  // A scale dot down the middle of each body segment
  for (let i = 1; i < n - 1; i++) {
    const s = snake[i];
    ctx.fillStyle = colors[i].dot;
    const o = Math.round((cell - dot) / 2);
    ctx.fillRect(s.x * cell + o, s.y * cell + o, dot, dot);
  }

  drawHead(ctx, snake[0], cell, dir, { dead, tongue, ring: colors[0].outline });
}

// Tail tip disappearing into the head's mouth: a dark lip line across the
// joint with the (narrower) tail poking through it.
function drawBite(ctx, head, tail, cell, tailInset, tailColor, lipColor) {
  const lip = Math.max(2, Math.round(cell * 0.12));
  const horizontal = head.x === tail.x; // joint runs left-right
  const jx = Math.max(head.x, tail.x) * cell;
  const jy = Math.max(head.y, tail.y) * cell;
  const inner = cell - tailInset * 2;
  const pad = Math.round(cell * 0.12);
  ctx.fillStyle = lipColor;
  if (horizontal) ctx.fillRect(head.x * cell + pad, jy - lip / 2, cell - pad * 2, lip);
  else ctx.fillRect(jx - lip / 2, head.y * cell + pad, lip, cell - pad * 2);
  ctx.fillStyle = tailColor;
  if (horizontal) ctx.fillRect(tail.x * cell + tailInset, jy - lip / 2, inner, lip);
  else ctx.fillRect(jx - lip / 2, tail.y * cell + tailInset, lip, inner);
}

function drawHead(ctx, head, cell, dir, { dead, tongue, ring }) {
  const [dx, dy] = DIR_VEC[dir];
  const px = -dy;
  const py = dx;
  const cx = head.x * cell + cell / 2;
  const cy = head.y * cell + cell / 2;

  if (tongue && !dead) {
    const w = Math.max(2, Math.round(cell * 0.08));
    const start = cell * 0.45;
    const len = cell * 0.3;
    ctx.fillStyle = PALETTE.tongue;
    const tx = cx + dx * (start + len / 2);
    const ty = cy + dy * (start + len / 2);
    const lw = dx ? len : w;
    const lh = dy ? len : w;
    ctx.fillRect(Math.round(tx - lw / 2), Math.round(ty - lh / 2), Math.round(lw), Math.round(lh));
    // Fork
    for (const sgn of [-1, 1]) {
      const fx = cx + dx * (start + len) + px * sgn * w;
      const fy = cy + dy * (start + len) + py * sgn * w;
      ctx.fillRect(Math.round(fx - w / 2), Math.round(fy - w / 2), w, w);
    }
  }

  const eye = Math.max(4, Math.round(cell * 0.26));
  const pupil = Math.max(2, Math.round(eye * 0.5));
  for (const sgn of [-1, 1]) {
    const ex = Math.round(cx + dx * cell * 0.1 + px * sgn * cell * 0.2 - eye / 2);
    const ey = Math.round(cy + dy * cell * 0.1 + py * sgn * cell * 0.2 - eye / 2);
    // Thin ring so eyes still read on very light skins.
    ctx.fillStyle = ring;
    ctx.fillRect(ex - 1, ey - 1, eye + 2, eye + 2);
    ctx.fillStyle = PALETTE.eyeWhite;
    ctx.fillRect(ex, ey, eye, eye);
    ctx.fillStyle = PALETTE.pupil;
    if (dead) {
      // Closed eye: a flat line across the middle.
      const t = Math.max(2, Math.round(eye * 0.25));
      ctx.fillRect(ex, ey + Math.round((eye - t) / 2), eye, t);
    } else {
      // Pupil pushed toward the direction of travel.
      const off = Math.round((eye - pupil) / 2);
      const pxPos = ex + off + Math.round(dx * off);
      const pyPos = ey + off + Math.round(dy * off);
      ctx.fillRect(pxPos, pyPos, pupil, pupil);
    }
  }
}

// ---------- menu scene: snake curled around an orange ----------
export function drawScene(ctx, w, h, { tongue = false, fruit = DEFAULT_FRUIT } = {}) {
  const cell = 32;
  const cols = Math.ceil(w / cell);
  const floorRow = 4;

  const sky = ctx.createLinearGradient(0, 0, 0, floorRow * cell);
  sky.addColorStop(0, PALETTE.skyTop);
  sky.addColorStop(1, PALETTE.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, floorRow * cell);

  for (let y = floorRow; y * cell < h; y++) {
    for (let x = 0; x < cols; x++) {
      ctx.fillStyle = (x + y) % 2 ? PALETTE.cellB : PALETTE.cellA;
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }

  drawFruit(ctx, fruit, 5 * cell + 2, 5 * cell + 2, cell - 4, { shadow: true });
  const snake = [
    { x: 4, y: 5 }, { x: 4, y: 4 }, { x: 5, y: 4 }, { x: 6, y: 4 }, { x: 7, y: 4 },
    { x: 7, y: 5 }, { x: 7, y: 6 }, { x: 6, y: 6 }, { x: 5, y: 6 }, { x: 4, y: 6 },
    { x: 3, y: 6 }, { x: 2, y: 6 }, { x: 1, y: 6 },
  ];
  drawSnake(ctx, snake, cell, { dir: 'right', tongue });
}
