// Canvas drawing: board, snake, and pixel sprites. No game rules here.
import { SKINS, DEFAULT_SKIN, skinColor, shade, mix } from './themes.js';
import { FRUITS, DEFAULT_FRUIT } from './fruits.js';
import { BOX, FLAG, shapeSprite } from './critters.js';

export const PALETTE = {
  cellA: '#B4D0F9',
  cellB: '#A3C5F5',
  shadow: 'rgba(0, 0, 0, 0.18)',
  skyTop: '#275BA5',
  skyBottom: '#7E9FD8',
  wall: '#275BA5',
  eyeWhite: '#FFFFFF',
  pupil: '#1B1238',
  tongue: '#E8364F',
  accent: '#976620', // board markings (box targets, mine fields)
  sweat: '#9BDCFF',
};

export function setBoardColors({ light, dark, skyTop, skyBottom, wall = skyTop, accent = PALETTE.accent }) {
  Object.assign(PALETTE, { cellA: light, cellB: dark, skyTop, skyBottom, wall, accent });
}

let currentSkin = SKINS[DEFAULT_SKIN];
export function setSnakeSkin(skin) {
  currentSkin = skin;
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
// opts.poison draws the poisoned version (see poisonSprite).
export function drawFruit(ctx, kind, x, y, size, opts = {}) {
  const sprite = opts.poison ? poisonSprite(kind) : (FRUITS[kind] ?? FRUITS[DEFAULT_FRUIT]).sprite;
  drawSprite(ctx, sprite, x, y, size, opts);
}

// Poison fruit: the same fruit in the poisoned snake's grey, recoloured by
// brightness (so its shading survives), leaves and all.
const POISON_RAMP = ['#2A2A2B', '#4A4A4B', '#6A6A6B', '#8C8C8D', '#B5B5B6'];
const poisonCache = new Map();
const rgbOf = (c) => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// Is this fruit greyish already (so a poisoned one could be mistaken for it)?
export function isGrayFruit(kind) {
  const px = (FRUITS[kind]?.sprite ?? []).flat().filter(Boolean).map(rgbOf);
  if (!px.length) return false;
  const dull = px.filter(([r, g, b]) => {
    const mx = Math.max(r, g, b);
    return !mx || (mx - Math.min(r, g, b)) / mx < 0.2;
  });
  return dull.length / px.length > 0.3;
}
function poisonSprite(kind) {
  if (!FRUITS[kind]) kind = DEFAULT_FRUIT;
  if (poisonCache.has(kind)) return poisonCache.get(kind);
  const sprite = FRUITS[kind].sprite.map((row) => row.map((c) => {
    if (!c) return c;
    const [r, g, b] = rgbOf(c);
    const lum = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
    const x = Math.min(0.999, lum * 1.1) * (POISON_RAMP.length - 1);
    const i = Math.floor(x);
    return mix(POISON_RAMP[i], POISON_RAMP[i + 1], x - i);
  }));
  poisonCache.set(kind, sprite);
  return sprite;
}

// Little toxic bubbles rising off a poison fruit centred at (cx, cy) px.
export function drawPoisonBubbles(ctx, cx, cy, size, ms, seed = 0) {
  const u = Math.max(1, Math.round(size / 16));
  for (let k = 0; k < 2; k++) {
    const p = ((ms + seed * 337 + k * 700) % 1400) / 1400;
    const x = Math.round(cx + (k ? 0.22 : -0.16) * size + Math.sin(p * 6 + k) * u);
    const y = Math.round(cy - size * 0.35 - p * size * 0.45);
    ctx.globalAlpha = p < 0.7 ? 0.9 : (1 - p) / 0.3 * 0.9;
    ctx.fillStyle = '#9BE23A';
    ctx.fillRect(x, y, u * 2, u * 2);
    ctx.fillStyle = '#E4FFB8';
    ctx.fillRect(x, y, u, u);
  }
  ctx.globalAlpha = 1;
}

// Draw any sprite centred in a size×size box, keeping its aspect ratio.
// lift: px the sprite is raised off the ground (its shadow stays put and shrinks).
export function drawSprite(ctx, sprite, x, y, size, { shadow = false, lift = 0 } = {}) {
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
    const k = 1 - Math.min(0.4, lift / size);
    ctx.ellipse(x + size / 2, by + bh * 0.97, bw * 0.36 * k, size * 0.09 * k, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  blit(ctx, sprite, bx, Math.round(by - lift), bw, bh);
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

// ---------- obstacles ----------
// Wall-mode block: same colour as the board's border walls, with a bevel.
export function drawWall(ctx, x, y, cell, scale = 1) {
  const size = cell * scale;
  const px = Math.round(x * cell + (cell - size) / 2);
  const py = Math.round(y * cell + (cell - size) / 2);
  const s = Math.round(size);
  const b = Math.max(2, Math.round(size * 0.12));
  ctx.fillStyle = PALETTE.shadow;
  ctx.fillRect(px, py + Math.max(2, Math.round(cell * 0.08)), s, s);
  ctx.fillStyle = shade(PALETTE.wall, -0.3);
  ctx.fillRect(px, py, s, s);
  ctx.fillStyle = shade(PALETTE.wall, 0.18);
  ctx.fillRect(px, py, s, s - b);
  ctx.fillStyle = PALETTE.wall;
  ctx.fillRect(px + b, py + b, s - b * 2, s - b * 3);
}

// ---------- key mode ----------
// Keys are all one colour: the board accent (the theme's complementary hue,
// like mine fields and box targets), so they stand out on any board.
const keyCache = new Map();
function keySprite(shape) {
  const c = PALETTE.accent;
  const id = `${shape}|${c}`;
  if (!keyCache.has(id)) keyCache.set(id, shapeSprite(shape, c, mix(c, '#FFFFFF', 0.45), shade(c, -0.25), shade(c, -0.62)));
  return keyCache.get(id);
}
const lockCache = new Map();
function lockSymbol(shape) {
  if (!lockCache.has(shape)) lockCache.set(shape, shapeSprite(shape, '#8D909C', '#A9ACB8', '#70737E', null));
  return lockCache.get(shape);
}

// A key: its shape in the accent colour, sitting in its square (lift raises it off its shadow).
export function drawKey(ctx, shape, x, y, cell, { scale = 1, lift = 0 } = {}) {
  const size = cell * 0.98 * scale;
  drawSprite(ctx, keySprite(shape), (x + 0.5) * cell - size / 2, (y + 0.5) * cell - size / 2, size, { shadow: true, lift });
}

// A lock: a solid dark-grey block (lit top edge, dark bottom edge) with its
// shape stamped on it in grey. pop (0..1) lifts it up and away as it opens.
export function drawLock(ctx, shape, x, y, cell, pop = 0) {
  const k = 1 + 0.25 * Math.sin(Math.min(1, pop) * Math.PI * 0.5);
  const size = cell * 0.92 * k;
  const px = Math.round((x + 0.5) * cell - size / 2);
  const py = Math.round((y + 0.5) * cell - size / 2 - cell * 0.45 * pop);
  const s = Math.round(size);
  const b = Math.max(2, Math.round(size * 0.1));
  ctx.globalAlpha = 1 - pop;
  if (!pop) {
    ctx.fillStyle = PALETTE.shadow;
    ctx.fillRect(px, py + Math.max(2, Math.round(cell * 0.08)), s, s);
  }
  ctx.fillStyle = '#26272D';
  ctx.fillRect(px, py, s, s);
  ctx.fillStyle = '#5A5D68';
  ctx.fillRect(px, py, s, s - b);
  ctx.fillStyle = '#3B3D45';
  ctx.fillRect(px + b, py + b, s - b * 2, s - b * 3);
  const sym = s * 0.62;
  drawSprite(ctx, lockSymbol(shape), px + (s - sym) / 2, py + (s - sym) / 2 - b / 2, sym);
  ctx.globalAlpha = 1;
}

// ---------- shield mode ----------
// A fruit's wall: a short block lying along one side of its square, centred
// on the line between the squares, in the board's wall colour.
export function drawShield(ctx, x, y, side, cell, alpha = 1) {
  const t = Math.max(5, Math.round(cell * 0.26));
  const len = Math.round(cell + t * 0.5);
  const horizontal = side === 'up' || side === 'down';
  const cx = (x + 0.5) * cell + (side === 'left' ? -0.5 : side === 'right' ? 0.5 : 0) * cell;
  const cy = (y + 0.5) * cell + (side === 'up' ? -0.5 : side === 'down' ? 0.5 : 0) * cell;
  const w = horizontal ? len : t;
  const h = horizontal ? t : len;
  const px = Math.round(cx - w / 2);
  const py = Math.round(cy - h / 2);
  const b = Math.max(1, Math.round(t * 0.25));
  ctx.globalAlpha = alpha;
  ctx.fillStyle = PALETTE.shadow;
  ctx.fillRect(px, py + Math.max(2, Math.round(cell * 0.06)), w, h);
  // A touch lighter than wall blocks: thin, so it needs the extra contrast.
  const base = shade(PALETTE.wall, 0.22);
  ctx.fillStyle = shade(PALETTE.wall, -0.4);
  ctx.fillRect(px, py, w, h);
  ctx.fillStyle = shade(base, 0.35);
  ctx.fillRect(px, py, w, h - b);
  ctx.fillStyle = base;
  ctx.fillRect(px + b, py + b, w - b * 2, h - b * 2);
  ctx.globalAlpha = 1;
}

// Box mode crate at (x, y) in cell units (fractional while it's being pushed).
export function drawBox(ctx, x, y, cell, scale = 1, alpha = 1) {
  const size = cell * 0.98 * scale;
  ctx.globalAlpha = alpha;
  drawSprite(ctx, BOX, (x + 0.5) * cell - size / 2, (y + 0.5) * cell - size / 2, size, { shadow: true });
  ctx.globalAlpha = 1;
}

// Box target: corner brackets in the board accent around a faintly tinted
// square, breathing gently so it's easy to spot.
export function drawTarget(ctx, x, y, cell, ms) {
  const u = Math.max(2, Math.round(cell * 0.09));
  const x0 = Math.round(x * cell + cell * 0.1);
  const y0 = Math.round(y * cell + cell * 0.1);
  const s = Math.round(cell * 0.8);
  const arm = Math.round(s * 0.34);
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = PALETTE.accent;
  ctx.fillRect(x0, y0, s, s);
  ctx.globalAlpha = 0.75 + 0.25 * Math.sin(ms / 260);
  for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x0 + s, y0, -1, 1], [x0, y0 + s, 1, -1], [x0 + s, y0 + s, -1, -1]]) {
    ctx.fillRect(sx > 0 ? cx : cx - arm, sy > 0 ? cy : cy - u, arm, u);
    ctx.fillRect(sx > 0 ? cx : cx - u, sy > 0 ? cy : cy - arm, u, arm);
  }
  ctx.globalAlpha = 1;
}

// Mine field: the 3×3 around a flag at (x, y), as a faint tint inside a dashed
// outline in the board accent. `visit` is how many moves the head has spent
// inside (0 if it isn't in): the tint deepens and the outline warms toward red,
// blinking on the last safe move. `born` (0..1) fades it in.
export function drawMineField(ctx, x, y, cell, { visit = 0, born = 1, ms = 0, limit = 4 } = {}) {
  const x0 = Math.round((x - 1) * cell);
  const y0 = Math.round((y - 1) * cell);
  const s = Math.round(cell * 3);
  const u = Math.max(2, Math.round(cell * 0.07));
  const warn = visit >= limit - 1;
  const color = warn ? (Math.floor(ms / 140) % 2 ? '#FF4D5E' : PALETTE.accent)
    : visit === limit - 2 ? mix(PALETTE.accent, '#FF4D5E', 0.45) : PALETTE.accent;

  ctx.globalAlpha = born * (0.1 + 0.06 * visit);
  ctx.fillStyle = color;
  ctx.fillRect(x0, y0, s, s);
  // Faint dotted lines between the cells.
  ctx.globalAlpha = born * 0.35;
  const dot = Math.max(1, Math.round(u / 2));
  for (let k = 1; k < 3; k++) {
    const p = Math.round(k * cell);
    for (let d = Math.round(cell * 0.2); d < s; d += Math.round(cell / 3)) {
      ctx.fillRect(x0 + p - dot / 2, y0 + d, dot, dot);
      ctx.fillRect(x0 + d, y0 + p - dot / 2, dot, dot);
    }
  }
  // Dashed outline, drawn as pixel dashes so it stays crisp.
  ctx.globalAlpha = born;
  const dash = Math.max(4, Math.round(cell * 0.28));
  const gap = Math.max(3, Math.round(cell * 0.18));
  for (let d = 0; d < s; d += dash + gap) {
    const len = Math.min(dash, s - d);
    ctx.fillRect(x0 + d, y0, len, u);
    ctx.fillRect(x0 + s - d - len, y0 + s - u, len, u);
    ctx.fillRect(x0, y0 + s - d - len, u, len);
    ctx.fillRect(x0 + s - u, y0 + d, u, len);
  }
  ctx.globalAlpha = 1;
}

// The flag in a mine field's middle square, gently waving.
export function drawFlag(ctx, x, y, cell, ms, scale = 1) {
  const size = cell * 0.86 * scale;
  const pose = FLAG[Math.floor(ms / 380) % 2];
  drawSprite(ctx, pose, (x + 0.5) * cell - size / 2, (y + 0.5) * cell - size / 2 - cell * 0.02, size, { shadow: true });
}

// Winged fruit: little pixel wings either side of a fruit centred at (cx, cy) px,
// flapping between an up and a down pose.
export function drawWings(ctx, cx, cy, size, up) {
  const u = Math.max(1, Math.round(size / 11));
  // Feather rows as [x offset from centre, y offset, width] in units, left wing
  // (mirrored for the right). They stick out past the fruit so they read clearly.
  const rows = up
    ? [[-11, -5, 3], [-12, -4, 5], [-11, -3, 6], [-9, -2, 4]]
    : [[-11, 2, 3], [-12, 1, 5], [-11, 0, 6], [-9, -1, 4]];
  for (const pass of ['#8C95A8', '#FFFFFF']) {
    const o = pass === '#FFFFFF' ? 0 : 1; // outline pass is 1px bigger
    ctx.fillStyle = pass;
    for (const [dx, dy, w] of rows) {
      for (const side of [-1, 1]) {
        const x0 = side < 0 ? cx + dx * u : cx - (dx + w) * u;
        ctx.fillRect(Math.round(x0) - o, Math.round(cy + dy * u) - o, w * u + o * 2, u + o * 2);
      }
    }
  }
}

// ---------- snake ----------
// The snake is drawn as a thick axis-aligned polyline through cell centres
// (points in cell units, e.g. {x: 3.5, y: 2.5}). Points may be fractional,
// which is what lets the head glide into the next cell and the tail glide out.
const DIR_VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const BODY_W = 0.8; // body thickness, in cells
const TAIL_W = 0.58; // the last TAIL_LEN of the body is thinner
const TAIL_LEN = 0.45;
const HEAD_SIZE = 0.9;

const centre = (c) => ({ x: c.x + 0.5, y: c.y + 0.5 });
const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y); // axis-aligned

// Static snake from grid cells (menu scene, icons, ready/game-over states).
// opts.jumps: open portals, so the body can be drawn going in one and out the other.
export function drawSnake(ctx, cells, cell, opts = {}) {
  if (!cells.length) return;
  const pts = withPortalBreaks(cells, opts.jumps);
  if (opts.biteTail && cells.length > 2) {
    // Run the tail right up to the head's edge so the loop closes.
    const h = pts[0];
    const t = pts[pts.length - 1];
    pts.push({ x: (h.x + t.x) / 2, y: (h.y + t.y) / 2 });
  }
  drawSnakePath(ctx, pts, cell, opts);
  if (opts.biteTail && cells.length > 2) {
    drawBite(ctx, cells[0], cells[cells.length - 1], cell, opts.skin ?? currentSkin);
  }
}

const isAdj = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
const sameCell = (a, b) => a.x === b.x && a.y === b.y;
const lerpPt = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });

// Find the portal a body link (ahead -> behind) goes through, if any.
function portalBetween(ahead, behind, jumps = []) {
  return jumps.find((j) => sameCell(j.to, ahead) && isAdj(j.from, behind));
}

// Cell centres head→tail, with a `null` break wherever the body goes through a
// portal: the part behind the break starts at the entry portal's centre.
export const snakePoints = (cells, jumps) => withPortalBreaks(cells, jumps);
function withPortalBreaks(cells, jumps, startAt = 0) {
  const pts = [];
  for (let i = startAt; i < cells.length; i++) {
    pts.push(centre(cells[i]));
    const nxt = cells[i + 1];
    if (nxt && !isAdj(cells[i], nxt)) {
      pts.push(null);
      const j = portalBetween(cells[i], nxt, jumps);
      if (j) pts.push(centre(j.from));
    }
  }
  return pts;
}

// Path for a snake partway (alpha 0..1) through a move from P (before) to S (after).
// Body cells stay put; the head slides from the previous head cell into the new
// one and the tail slides out of the cell it just left. Through a portal the
// head keeps sliding into the entry fruit, then carries on out of the exit on
// the next tick — no pause.
export function interpolateSnake(S, P, alpha, jumps = []) {
  const c = centre;
  let pts;
  if (S.length > 1 && !isAdj(S[0], S[1])) {
    // Teleported this tick (logically the head is already at the exit): show it
    // still gliding into the entry so the motion never stops.
    const j = portalBetween(S[0], S[1], jumps);
    pts = [j ? lerpPt(c(S[1]), c(j.from), alpha) : c(S[1]), ...withPortalBreaks(S, jumps, 1)];
  } else {
    pts = [S.length > 1 ? lerpPt(c(S[1]), c(S[0]), alpha) : c(S[0]), ...withPortalBreaks(S, jumps, 1)];
  }
  const from = P[P.length - 1];
  const to = S[S.length - 1];
  if (!sameCell(from, to)) {
    if (isAdj(from, to)) {
      pts.push(lerpPt(c(from), c(to), alpha));
    } else {
      // The tail just went through a portal: a stub still sliding into the entry.
      const j = jumps.find((q) => sameCell(q.to, to) && isAdj(q.from, from));
      if (j) pts.push(null, c(j.from), lerpPt(c(j.from), c(from), 1 - alpha));
    }
  }
  return pts;
}

// Sub-polyline between distances d0 and d1 measured from the head.
function subPath(pts, d0, d1) {
  const out = [];
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = dist(a, b);
    const s0 = Math.max(d0, acc);
    const s1 = Math.min(d1, acc + len);
    if (s1 >= s0 && len > 0) {
      const at = (d) => ({ x: a.x + ((b.x - a.x) * (d - acc)) / len, y: a.y + ((b.y - a.y) * (d - acc)) / len });
      if (!out.length) out.push(at(s0));
      out.push(at(s1));
    }
    acc += len;
  }
  return out;
}

function pathLength(pts) {
  let L = 0;
  for (let i = 0; i < pts.length - 1; i++) L += dist(pts[i], pts[i + 1]);
  return L;
}

// One straight piece of the tube. capA/capB: how far (px) to extend past each end.
function tubeRect(ctx, a, b, w, capA, capB, cell, ox = 0, oy = 0) {
  let x0;
  let x1;
  let y0;
  let y1;
  if (a.y === b.y) {
    const left = a.x <= b.x ? a : b;
    const right = left === a ? b : a;
    x0 = left.x * cell - (left === a ? capA : capB);
    x1 = right.x * cell + (right === a ? capA : capB);
    y0 = a.y * cell - w / 2;
    y1 = a.y * cell + w / 2;
  } else {
    const top = a.y <= b.y ? a : b;
    const bot = top === a ? b : a;
    y0 = top.y * cell - (top === a ? capA : capB);
    y1 = bot.y * cell + (bot === a ? capA : capB);
    x0 = a.x * cell - w / 2;
    x1 = a.x * cell + w / 2;
  }
  const rx = Math.round(x0 + ox);
  const ry = Math.round(y0 + oy);
  ctx.fillRect(rx, ry, Math.round(x1 + ox) - rx, Math.round(y1 + oy) - ry);
}

// eyes: 'normal' | 'closed' | 'dizzy' (pupils spin) | 'happy' (^ ^). ms drives the spin.
export function drawSnakePath(ctx, rawPts, cell, {
  dir = 'right', dead = false, eyes = dead ? 'closed' : 'normal', ms = 0,
  tongue = false, skin = null, shadow = true, mouth = 0, strain = false, twin = false,
} = {}) {
  // Split into runs at null breaks (portals), dropping zero-length steps.
  const runs = [];
  let cur = [];
  for (const p of rawPts) {
    if (p === null) {
      if (cur.length) runs.push(cur);
      cur = [];
    } else if (!cur.length || dist(p, cur[cur.length - 1]) > 1e-6) {
      cur.push(p);
    }
  }
  if (cur.length) runs.push(cur);
  if (!runs.length) return;

  const sk = skin ?? currentSkin;
  const lens = runs.map(pathLength);
  const L = lens.reduce((a, b) => a + b, 0);
  // twin: a head at both ends (the Twin mode icon) – no tail, and the colour
  // runs head → tail → head.
  const colorAt = (d) => skinColor(sk, L > 0 ? (twin ? 1 - Math.abs(2 * d / L - 1) : d / L) : 0);
  const border = Math.max(2, Math.round(cell * 0.08));
  const wide = BODY_W * cell;
  const thin = TAIL_W * cell;

  // Pieces of the tube: { a, b, w, capA, capB, mid (colour distance) }
  const pieces = [];
  const addRun = (run, w, d0, capStart, capEnd) => {
    let d = d0;
    for (let i = 0; i < run.length - 1; i++) {
      const len = dist(run[i], run[i + 1]);
      if (len <= 1e-6) continue;
      const first = i === 0;
      const last = i === run.length - 2;
      pieces.push({
        a: run[i], b: run[i + 1], w,
        capA: first ? capStart : w / 2,
        capB: last ? capEnd : w / 2,
        mid: d + len / 2,
      });
      d += len;
    }
  };
  // Runs meet portals with flat (uncapped) ends; the very first run starts under
  // the head and the last run tapers into the tail.
  let off = 0;
  runs.forEach((run, r) => {
    const start = r === 0 ? wide / 2 : 0;
    if (r === runs.length - 1 && twin) {
      addRun(run, wide, off, start, wide / 2);
    } else if (r === runs.length - 1) {
      const split = Math.max(0, lens[r] - TAIL_LEN);
      addRun(subPath(run, 0, split), wide, off, start, 0);
      addRun(subPath(run, split, lens[r]), thin, off + split, split > 0 ? thin / 2 : start, thin / 2);
    } else {
      addRun(run, wide, off, start, 0);
    }
    off += lens[r];
  });

  // Head: a slightly larger square riding on the front of the tube. Straining
  // (pushing a box) makes it tremble a pixel side to side.
  let h = runs[0][0];
  if (strain && Math.floor(ms / 70) % 2) {
    const [sx, sy] = DIR_VEC[dir];
    const j = Math.max(1, Math.round(cell * 0.03)) / cell;
    h = { x: h.x - sy * j, y: h.y + sx * j };
  }
  const hs = HEAD_SIZE * cell;
  const hx = Math.round(h.x * cell - hs / 2);
  const hy = Math.round(h.y * cell - hs / 2);
  const hsz = Math.round(hs);

  // The second head of a twin, facing out of the far end.
  let tw = null;
  if (twin) {
    const last = runs[runs.length - 1];
    const e = last[last.length - 1];
    const q = last[last.length - 2] ?? e;
    const tdir = Math.abs(e.x - q.x) > Math.abs(e.y - q.y) ? (e.x > q.x ? 'right' : 'left') : (e.y > q.y ? 'down' : 'up');
    tw = { p: e, dir: tdir, x: Math.round(e.x * cell - hs / 2), y: Math.round(e.y * cell - hs / 2) };
  }

  if (shadow) {
    ctx.fillStyle = PALETTE.shadow;
    const sh = Math.max(2, Math.round(cell * 0.08));
    for (const p of pieces) tubeRect(ctx, p.a, p.b, p.w, p.capA, p.capB, cell, 0, sh);
    ctx.fillRect(hx, hy + sh, hsz, hsz);
    if (tw) ctx.fillRect(tw.x, tw.y + sh, hsz, hsz);
  }
  for (const p of pieces) {
    ctx.fillStyle = shade(colorAt(p.mid), -0.42);
    tubeRect(ctx, p.a, p.b, p.w, p.capA, p.capB, cell);
  }
  for (const p of pieces) {
    ctx.fillStyle = colorAt(p.mid);
    tubeRect(ctx, p.a, p.b, p.w - border * 2, Math.max(0, p.capA - border), Math.max(0, p.capB - border), cell);
  }

  const headCol = colorAt(0);
  const ring = shade(headCol, -0.42);
  ctx.fillStyle = ring;
  ctx.fillRect(hx, hy, hsz, hsz);
  ctx.fillStyle = headCol;
  ctx.fillRect(hx + border, hy + border, hsz - border * 2, hsz - border * 2);
  drawHead(ctx, h.x * cell, h.y * cell, cell, dir, {
    eyes: strain && eyes === 'normal' ? 'strain' : eyes, ms, tongue: tongue && eyes === 'normal' && !strain, ring, mouth,
  });
  if (tw) {
    ctx.fillStyle = ring;
    ctx.fillRect(tw.x, tw.y, hsz, hsz);
    ctx.fillStyle = headCol;
    ctx.fillRect(tw.x + border, tw.y + border, hsz - border * 2, hsz - border * 2);
    drawHead(ctx, tw.p.x * cell, tw.p.y * cell, cell, tw.dir, { eyes, ms, tongue: false, ring });
  }
}

// Tail tip disappearing into the head's mouth: a dark lip line across the joint.
function drawBite(ctx, head, tail, cell, skin) {
  const lip = Math.max(2, Math.round(cell * 0.12));
  const horizontal = head.x === tail.x; // joint runs left-right
  const jx = Math.max(head.x, tail.x) * cell;
  const jy = Math.max(head.y, tail.y) * cell;
  const pad = Math.round(cell * 0.12);
  const border = Math.max(2, Math.round(cell * 0.08));
  const inner = TAIL_W * cell - border * 2;
  ctx.fillStyle = shade(skinColor(skin, 0), -0.42);
  if (horizontal) ctx.fillRect(head.x * cell + pad, jy - lip / 2, cell - pad * 2, lip);
  else ctx.fillRect(jx - lip / 2, head.y * cell + pad, lip, cell - pad * 2);
  ctx.fillStyle = skinColor(skin, 1);
  if (horizontal) ctx.fillRect(Math.round(tail.x * cell + (cell - inner) / 2), jy - lip / 2, Math.round(inner), lip);
  else ctx.fillRect(jx - lip / 2, Math.round(tail.y * cell + (cell - inner) / 2), lip, Math.round(inner));
}

// Eyes + tongue for a head centred at pixel (cx, cy).
function drawHead(ctx, cx, cy, cell, dir, { eyes, ms, tongue, ring, mouth = 0 }) {
  const [dx, dy] = DIR_VEC[dir];
  const px = -dy;
  const py = dx;

  if (tongue) {
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

  // Mouth: a small dark slot set just inside the front of the head (head colour
  // all around it), opening a little (0..1).
  if (mouth > 0.05) {
    const inset = Math.max(2, Math.round(cell * 0.08)) + cell * 0.07; // border + a gap
    const front = (HEAD_SIZE * cell) / 2 - inset;
    const width = cell * 0.3; // across the face
    const depth = Math.max(2, cell * 0.15 * mouth); // grows back into the head
    const fx = cx + dx * front; // front of the slot
    const fy = cy + dy * front;
    const w = dx ? depth : width;
    const h = dy ? depth : width;
    const x = dx > 0 ? fx - depth : dx < 0 ? fx : fx - width / 2;
    const y = dy > 0 ? fy - depth : dy < 0 ? fy : fy - width / 2;
    ctx.fillStyle = PALETTE.pupil;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  const eye = Math.max(4, Math.round(cell * 0.26));
  const pupil = Math.max(2, Math.round(eye * 0.5));
  [-1, 1].forEach((sgn, i) => {
    const ex = Math.round(cx - dx * cell * 0.06 + px * sgn * cell * 0.2 - eye / 2);
    const ey = Math.round(cy - dy * cell * 0.06 + py * sgn * cell * 0.2 - eye / 2);

    if (eyes === 'strain') {
      // Squeezed-shut > < eyes, each pointing in toward the other: a big push.
      const u = Math.max(1, Math.round(eye / 4));
      const ax = -sgn * px;
      const ay = -sgn * py;
      const ecx = ex + eye / 2;
      const ecy = ey + eye / 2;
      ctx.fillStyle = PALETTE.pupil;
      for (const [gx, gy] of [[0, 0], [1, 1], [2, 2], [1, 3], [0, 4]]) {
        const ox = (gx - 1) * ax - (gy - 2) * ay;
        const oy = (gx - 1) * ay + (gy - 2) * ax;
        ctx.fillRect(Math.round(ecx + ox * u - u / 2), Math.round(ecy + oy * u - u / 2), u, u);
      }
      return;
    }

    if (eyes === 'happy') {
      // Closed, smiling eyes: a little ^ arch, no whites.
      const u = Math.max(1, Math.round(eye / 4));
      ctx.fillStyle = PALETTE.pupil;
      ctx.fillRect(ex + u, ey + u, u * 2, u);
      ctx.fillRect(ex, ey + u * 2, u, u * 2);
      ctx.fillRect(ex + u * 3, ey + u * 2, u, u * 2);
      return;
    }

    // Thin ring so eyes still read on very light skins.
    ctx.fillStyle = ring;
    ctx.fillRect(ex - 1, ey - 1, eye + 2, eye + 2);
    ctx.fillStyle = PALETTE.eyeWhite;
    ctx.fillRect(ex, ey, eye, eye);
    ctx.fillStyle = PALETTE.pupil;
    const off = Math.round((eye - pupil) / 2);
    if (eyes === 'closed') {
      const t = Math.max(2, Math.round(eye * 0.25));
      ctx.fillRect(ex, ey + Math.round((eye - t) / 2), eye, t);
    } else if (eyes === 'dizzy') {
      // Pupils roll around the eye, each the opposite way.
      const a = (ms / 1000) * Math.PI * 2 * 1.4 * (i ? -1 : 1) + (i ? Math.PI : 0);
      ctx.fillRect(ex + off + Math.round(Math.cos(a) * off), ey + off + Math.round(Math.sin(a) * off), pupil, pupil);
    } else {
      // Pupil pushed toward the direction of travel.
      ctx.fillRect(ex + off + Math.round(dx * off), ey + off + Math.round(dy * off), pupil, pupil);
    }
  });

  if (eyes === 'strain') {
    // Every so often a bead of sweat flicks off the back corner of the head
    // (upper side, so it never lands on the box or the body) and fades.
    const k = (ms % 900) / 900;
    if (k < 0.55) {
      const u = Math.max(1, Math.round(cell / 22));
      const [ox, oy] = dx ? [-dx * 0.3, -0.56] : [0.56, -dy * 0.3];
      const fly = 0.12 * (k / 0.55);
      const sx = Math.round(cx + (ox + Math.sign(ox) * fly * (dx ? 0.5 : 1)) * cell);
      const sy = Math.round(cy + (oy - fly * (dx ? 1 : 0.5)) * cell);
      ctx.globalAlpha = k < 0.35 ? 1 : (0.55 - k) / 0.2;
      ctx.fillStyle = PALETTE.sweat;
      ctx.fillRect(sx, sy - u, u, u);
      ctx.fillRect(sx - u, sy, u * 3, u * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(sx - u, sy, u, u);
      ctx.globalAlpha = 1;
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
