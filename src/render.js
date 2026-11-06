// Canvas drawing: board, snake, and pixel sprites. No game rules here.
import { SKINS, DEFAULT_SKIN, skinColor, shade } from './themes.js';
import { FRUITS, DEFAULT_FRUIT } from './fruits.js';

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
};

export function setBoardColors({ light, dark, skyTop, skyBottom, wall = skyTop }) {
  Object.assign(PALETTE, { cellA: light, cellB: dark, skyTop, skyBottom, wall });
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
  tongue = false, skin = null, shadow = true, mouth = 0,
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
  const colorAt = (d) => skinColor(sk, L > 0 ? d / L : 0);
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
    if (r === runs.length - 1) {
      const split = Math.max(0, lens[r] - TAIL_LEN);
      addRun(subPath(run, 0, split), wide, off, start, 0);
      addRun(subPath(run, split, lens[r]), thin, off + split, split > 0 ? thin / 2 : start, thin / 2);
    } else {
      addRun(run, wide, off, start, 0);
    }
    off += lens[r];
  });

  // Head: a slightly larger square riding on the front of the tube.
  const h = runs[0][0];
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
  drawHead(ctx, h.x * cell, h.y * cell, cell, dir, { eyes, ms, tongue: tongue && eyes === 'normal', ring, mouth });
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
