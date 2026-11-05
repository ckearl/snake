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
export function drawFruit(ctx, kind, x, y, size, opts = {}) {
  drawSprite(ctx, (FRUITS[kind] ?? FRUITS[DEFAULT_FRUIT]).sprite, x, y, size, opts);
}

// Draw any sprite centred in a size×size box, keeping its aspect ratio.
export function drawSprite(ctx, sprite, x, y, size, { shadow = false } = {}) {
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
export function drawSnake(ctx, cells, cell, opts = {}) {
  if (!cells.length) return;
  const pts = cells.map(centre);
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

// Path for a snake partway (alpha 0..1) through a move from P (before) to S (after).
// Body cells stay put; the head slides from the previous head cell into the new
// one and the tail slides out of the cell it just left.
export function interpolateSnake(S, P, alpha) {
  const c = (q) => ({ x: q.x + 0.5, y: q.y + 0.5 });
  const lerp = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
  const pts = [S.length > 1 ? lerp(c(S[1]), c(S[0]), alpha) : c(S[0])];
  for (let i = 1; i < S.length; i++) pts.push(c(S[i]));
  const from = P[P.length - 1];
  const to = S[S.length - 1];
  if (from.x !== to.x || from.y !== to.y) pts.push(lerp(c(from), c(to), alpha));
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

export function drawSnakePath(ctx, rawPts, cell, {
  dir = 'right', dead = false, tongue = false, skin = null, shadow = true,
} = {}) {
  const pts = rawPts.filter((p, i) => i === 0 || dist(p, rawPts[i - 1]) > 1e-6);
  if (!pts.length) return;
  const sk = skin ?? currentSkin;
  const L = pathLength(pts);
  const colorAt = (d) => skinColor(sk, L > 0 ? d / L : 0);
  const border = Math.max(2, Math.round(cell * 0.08));
  const wide = BODY_W * cell;
  const thin = TAIL_W * cell;
  const split = Math.max(0, L - TAIL_LEN);

  // Pieces of the tube: [a, b, width, capA, capB, colour-distance]
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
  addRun(subPath(pts, 0, split), wide, 0, wide / 2, 0);
  addRun(subPath(pts, split, L), thin, split, thin / 2, thin / 2);

  // Head: a slightly larger square riding on the front of the tube.
  const h = pts[0];
  const hs = HEAD_SIZE * cell;
  const hx = Math.round(h.x * cell - hs / 2);
  const hy = Math.round(h.y * cell - hs / 2);
  const hsz = Math.round(hs);

  if (shadow) {
    ctx.fillStyle = PALETTE.shadow;
    const sh = Math.max(2, Math.round(cell * 0.08));
    for (const p of pieces) tubeRect(ctx, p.a, p.b, p.w, p.capA, p.capB, cell, 0, sh);
    ctx.fillRect(hx, hy + sh, hsz, hsz);
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
  drawHead(ctx, h.x * cell, h.y * cell, cell, dir, { dead, tongue, ring });
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
function drawHead(ctx, cx, cy, cell, dir, { dead, tongue, ring }) {
  const [dx, dy] = DIR_VEC[dir];
  const px = -dy;
  const py = dx;

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
