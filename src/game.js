// Pure game logic — no DOM. Rendering and input live in main.js so that
// future event sources (Twitch chat, channel points) can drive the same state.

export const BOARD_SIZES = {
  small: { label: 'Small', cols: 10, rows: 9 },
  medium: { label: 'Medium', cols: 17, rows: 15 },
  large: { label: 'Large', cols: 24, rows: 21 },
};

export const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

// How many fruits are on the board. A number keeps that many out at all times
// (each eaten fruit is replaced). 'random' drops a batch of 1–10 and only drops
// the next batch once every fruit in the current one has been eaten.
export const FRUIT_COUNTS = { one: 1, three: 3, five: 5, ten: 10, random: 'random' };
// Game modes.
//  classic – plain snake.
//  wall    – every 2nd fruit eaten drops a deadly wall block on a free square.
//  portal  – fruits come in matching pairs; eat one and the head pops out of its
//            twin, the body following through until the tail has passed.
//  winged  – fruits fly freely around the board, bouncing off the edges and the
//            snake's body.
//  yinyang – eating a fruit flips the snake: the tail becomes the head and it
//            heads off the way the old tail was pointing.
//  magnet  – fruits fly like winged mode but steer toward the snake's head.
export const GAME_MODES = {
  classic: { name: 'Classic' },
  wall: { name: 'Walls' },
  portal: { name: 'Portals' },
  winged: { name: 'Winged' },
  yinyang: { name: 'Yin Yang' },
  magnet: { name: 'Magnet' },
};

// Modes where fruits move freely (x, y are the fruit's centre in cell units).
export const FLYING_MODES = new Set(['winged', 'magnet']);
export const FRUIT_RADIUS = 0.34; // cells
export const WING_SPEED = 2.2; // cells per second
export const MAGNET_SPEED = 2; // top speed toward the head, cells per second
export const MAGNET_STEER = 2.5; // how quickly a fruit turns toward the head (per second)
export const FRUITS_PER_WALL = 2;

// Milliseconds per tile at speed 1. Speed is a multiplier on that time:
// lower = faster (bunny), higher = slower (turtle).
export const BASE_TICK_MS = 135;
export const SPEEDS = { slow: 1.33, normal: 1, fast: 0.67 };

export const RANDOM_MIN = 1;
export const RANDOM_MAX = 10;

const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
const MAX_QUEUED_TURNS = 2;

export function createGame({ cols, rows, fruitCount = 1, mode = 'classic', rng = Math.random }) {
  const midY = Math.floor(rows / 2);
  const startX = Math.max(2, Math.floor(cols / 2) - 1);
  const state = {
    cols,
    rows,
    rng,
    mode,
    // Head first. Starts length 3, facing right.
    snake: [
      { x: startX, y: midY },
      { x: startX - 1, y: midY },
      { x: startX - 2, y: midY },
    ],
    dir: 'right',
    turnQueue: [],
    fruitCount,
    foods: [], // { x, y, pair? } – pair links portal twins
    walls: [], // wall mode blocks
    jumps: [], // portal mode: open portals { from, to, pair } while the body passes through
    nextPair: 1,
    nextId: 1,
    grow: 0, // pending growth from fruits caught between ticks (flying modes)
    score: 0,
    status: 'ready', // ready | running | paused | over | won
  };
  spawnFoods(state, batchSize(state));
  return state;
}

const same = (a, b) => a.x === b.x && a.y === b.y;
export const adjacent = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;

export function queueTurn(state, dir) {
  if (!DIRECTIONS[dir]) return;
  if (state.status === 'over' || state.status === 'won') return;
  // Compare against the last queued direction so quick double-taps
  // (e.g. up then left) work without letting the snake reverse into itself.
  const last = state.turnQueue.length
    ? state.turnQueue[state.turnQueue.length - 1]
    : state.dir;
  if (dir === last || dir === OPPOSITE[last]) return;
  if (state.turnQueue.length >= MAX_QUEUED_TURNS) return;
  state.turnQueue.push(dir);
}

// Advance one tick. Returns 'move' | 'eat' | 'portal' | 'die' | 'win' (or null if not running).
export function step(state) {
  if (state.status !== 'running') return null;

  if (state.turnQueue.length) state.dir = state.turnQueue.shift();
  const d = DIRECTIONS[state.dir];
  const head = state.snake[0];
  const next = { x: head.x + d.x, y: head.y + d.y };
  // Portal grace: remember when this move is the first one out of a portal exit.
  const leavingExit = state.justTeleported;
  state.justTeleported = false;
  state.leftExit = null;

  if (next.x < 0 || next.y < 0 || next.x >= state.cols || next.y >= state.rows) return die(state);
  if (state.walls.some((w) => same(w, next))) return die(state);

  // Flying fruits are caught continuously (updateFlyers), not by stepping onto a square.
  const flying = FLYING_MODES.has(state.mode);
  const eatIdx = flying ? -1 : state.foods.findIndex((f) => same(f, next));
  const eating = eatIdx !== -1;
  const growing = eating || state.grow > 0;

  // Portal: the head comes out of the eaten fruit's twin instead.
  let newHead = next;
  let jump = null;
  if (eating && state.mode === 'portal') {
    const f = state.foods[eatIdx];
    const twin = state.foods.find((o) => o !== f && o.pair === f.pair);
    if (twin) {
      newHead = { x: twin.x, y: twin.y };
      jump = { from: { x: next.x, y: next.y }, to: newHead, pair: f.pair };
    }
  }

  // The tail vacates its cell this tick unless we're growing, so it's safe to move into.
  const body = growing ? state.snake : state.snake.slice(0, -1);
  if (body.some((s) => same(s, newHead))) return die(state);

  state.snake.unshift(newHead);
  if (!growing) state.snake.pop();
  else if (!eating) state.grow--;
  if (jump) {
    state.jumps.push(jump);
    state.justTeleported = true;
  }
  if (leavingExit && !eating) state.leftExit = { exit: { x: head.x, y: head.y } };
  pruneJumps(state);
  if (!eating) {
    if (occupiedCount(state) >= state.cols * state.rows) {
      state.status = 'won';
      return 'win';
    }
    return 'move';
  }

  state.score += 1;
  const eatenFood = state.foods[eatIdx];
  state.foods = state.foods.filter((f) => f !== eatenFood && !(jump && f.pair === eatenFood.pair));

  if (state.mode === 'wall' && state.score % FRUITS_PER_WALL === 0) spawnWall(state);
  // Checked after the wall drops: walls shrink the board, so a wall taking the
  // last open square means there's nothing left to fill — that's a win.
  if (occupiedCount(state) >= state.cols * state.rows) {
    state.status = 'won';
    return 'win';
  }
  refill(state);
  if (state.mode === 'yinyang') {
    flip(state);
    return 'flip';
  }
  return jump ? 'portal' : 'eat';
}

// Yin Yang: reverse the snake. The old tail becomes the head, moving away from
// the body (the way the tail was pointing). Pending turns are dropped.
export function flip(state) {
  const S = state.snake.reverse();
  state.turnQueue = [];
  if (S.length < 2) return;
  const dx = S[0].x - S[1].x;
  const dy = S[0].y - S[1].y;
  state.dir = Object.keys(DIRECTIONS).find((k) => DIRECTIONS[k].x === dx && DIRECTIONS[k].y === dy) ?? state.dir;
}

// Top fruits back up after one is eaten: replace it, or drop a new random batch.
function refill(state) {
  if (state.fruitCount === 'random') {
    if (state.foods.length === 0) spawnFoods(state, batchSize(state));
  } else {
    spawnFoods(state, 1);
  }
}

// ---------- flying fruits ----------
// Move flying fruits by dt seconds, bouncing off the board edges, walls and the
// snake's body, then catch any touching the head. `head` is the head centre in
// cell units (the drawn, in-between-squares position); defaults to its square.
// Returns the fruits eaten this frame.
export function updateFlyers(state, dt, head = null) {
  if (!FLYING_MODES.has(state.mode) || state.status !== 'running') return [];
  const h = head ?? { x: state.snake[0].x + 0.5, y: state.snake[0].y + 0.5 };
  const r = FRUIT_RADIUS;
  const obstacles = [...state.snake.slice(1), ...state.walls];

  for (const f of state.foods) {
    if (state.mode === 'magnet') {
      // Ease the velocity toward "straight at the head, at MAGNET_SPEED".
      const dx = h.x - f.x;
      const dy = h.y - f.y;
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, MAGNET_STEER * dt);
      f.vx += ((dx / d) * MAGNET_SPEED - f.vx) * k;
      f.vy += ((dy / d) * MAGNET_SPEED - f.vy) * k;
    }
    const speed = Math.hypot(f.vx, f.vy);
    const n = Math.max(1, Math.ceil((speed * dt) / 0.1)); // small sub-steps: no tunnelling
    const sdt = dt / n;
    for (let k = 0; k < n; k++) {
      f.x += f.vx * sdt;
      f.y += f.vy * sdt;
      // Board edges
      if (f.x < r) { f.x = r; f.vx = Math.abs(f.vx); }
      if (f.x > state.cols - r) { f.x = state.cols - r; f.vx = -Math.abs(f.vx); }
      if (f.y < r) { f.y = r; f.vy = Math.abs(f.vy); }
      if (f.y > state.rows - r) { f.y = state.rows - r; f.vy = -Math.abs(f.vy); }
      // Snake body / walls: circle vs square
      for (const c of obstacles) bounceOffCell(f, c, r);
    }
  }

  // Catch: a fruit touching the head gets eaten.
  const reach = 0.5 + r * 0.6;
  const eaten = state.foods.filter((f) => Math.abs(f.x - h.x) < reach && Math.abs(f.y - h.y) < reach);
  if (!eaten.length) return [];
  state.foods = state.foods.filter((f) => !eaten.includes(f));
  for (let i = 0; i < eaten.length; i++) {
    state.score += 1;
    state.grow += 1;
    refill(state);
  }
  return eaten;
}

function bounceOffCell(f, c, r) {
  const px = Math.max(c.x, Math.min(f.x, c.x + 1));
  const py = Math.max(c.y, Math.min(f.y, c.y + 1));
  let dx = f.x - px;
  let dy = f.y - py;
  let d = Math.hypot(dx, dy);
  if (d >= r) return;
  if (d === 0) {
    // Centre inside the square: push out through the nearest side.
    const sides = [
      [f.x - c.x, -1, 0], [c.x + 1 - f.x, 1, 0], [f.y - c.y, 0, -1], [c.y + 1 - f.y, 0, 1],
    ].sort((a, b) => a[0] - b[0]);
    [, dx, dy] = sides[0];
    d = 1;
    f.x = dx ? (dx < 0 ? c.x - r : c.x + 1 + r) : f.x;
    f.y = dy ? (dy < 0 ? c.y - r : c.y + 1 + r) : f.y;
  } else {
    dx /= d;
    dy /= d;
    f.x = px + dx * r;
    f.y = py + dy * r;
  }
  const dot = f.vx * dx + f.vy * dy;
  if (dot < 0) {
    f.vx -= 2 * dot * dx;
    f.vy -= 2 * dot * dy;
  }
}

// Portal grace turn: right after the head comes out of a portal exit, a turn can
// re-aim that first move (as if it had been pressed before going in). Only when
// the new square is safe and empty; returns true if the move was redirected.
export function redirectExit(state, dir) {
  const ex = state.leftExit;
  if (!ex || state.status !== 'running' || !DIRECTIONS[dir] || dir === state.dir) return false;
  const d = DIRECTIONS[dir];
  const cell = { x: ex.exit.x + d.x, y: ex.exit.y + d.y };
  if (cell.x < 0 || cell.y < 0 || cell.x >= state.cols || cell.y >= state.rows) return false;
  if (state.walls.some((w) => same(w, cell))) return false;
  if (state.foods.some((f) => same(f, cell))) return false;
  if (state.snake.slice(1).some((s) => same(s, cell))) return false;
  state.snake[0] = cell;
  state.dir = dir;
  state.turnQueue = [];
  state.leftExit = null;
  return true;
}

function die(state) {
  state.status = 'over';
  return 'die';
}

// Squares filled by the snake or walls. The board is won when this covers every square.
function occupiedCount(state) {
  return state.snake.length + state.walls.length;
}

// A portal stays open while some segment sits on its exit with the next segment
// still on the entry side. It lingers one extra tick so the tail can animate through.
function pruneJumps(state) {
  const S = state.snake;
  for (const j of state.jumps) {
    const open = S.some((c, i) => same(c, j.to) && S[i + 1] && adjacent(S[i + 1], j.from));
    j.stale = open ? 0 : (j.stale ?? 0) + 1;
  }
  state.jumps = state.jumps.filter((j) => j.stale < 2);
}

function batchSize(state) {
  if (state.fruitCount !== 'random') return state.fruitCount;
  return RANDOM_MIN + Math.floor(state.rng() * (RANDOM_MAX - RANDOM_MIN + 1));
}

// Add up to n fruits (n portal pairs in portal mode) on free cells.
export function spawnFoods(state, n) {
  for (let i = 0; i < n; i++) {
    if (state.mode === 'portal') {
      const a = placeFood(state);
      if (!a) break;
      state.foods.push(a);
      const b = placeFood(state);
      if (!b) {
        state.foods.pop(); // a portal needs both ends
        break;
      }
      a.pair = b.pair = state.nextPair++;
      a.id = state.nextId++;
      b.id = state.nextId++;
      state.foods.push(b);
    } else {
      const f = placeFood(state);
      if (!f) break;
      f.id = state.nextId++;
      if (FLYING_MODES.has(state.mode)) {
        // Centre of its square, heading off in a random direction.
        const a = state.rng() * Math.PI * 2;
        f.x += 0.5;
        f.y += 0.5;
        const v = state.mode === 'magnet' ? MAGNET_SPEED * 0.3 : WING_SPEED;
        f.vx = Math.cos(a) * v;
        f.vy = Math.sin(a) * v;
      }
      state.foods.push(f);
    }
  }
}

function freeCells(state, extraBlocked = []) {
  const occupied = new Set(
    [...state.snake, ...state.foods, ...state.walls, ...extraBlocked]
      .map((s) => Math.floor(s.y) * state.cols + Math.floor(s.x)),
  );
  const free = [];
  for (let i = 0; i < state.cols * state.rows; i++) {
    if (!occupied.has(i)) free.push(i);
  }
  return free;
}

export function placeFood(state, extraBlocked = []) {
  const free = freeCells(state, extraBlocked);
  if (!free.length) return null;
  const idx = free[Math.floor(state.rng() * free.length)];
  return { x: idx % state.cols, y: Math.floor(idx / state.cols) };
}

// Wall mode: a block on a free square that
//  - is never one of the two squares straight ahead of the head, and
//  - keeps the board winnable: every open square (anything that isn't a wall,
//    snake included) stays connected, and none becomes a dead end with fewer
//    than two open neighbours, so the snake can never be boxed in.
// Returns the wall, or null if no square qualifies (then no wall is added).
export function spawnWall(state) {
  const d = DIRECTIONS[state.dir];
  const h = state.snake[0];
  const ahead = [1, 2].map((k) => ({ x: h.x + d.x * k, y: h.y + d.y * k }));
  const order = freeCells(state, ahead);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(state.rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (const idx of order) {
    const w = { x: idx % state.cols, y: Math.floor(idx / state.cols) };
    if (keepsBoardOpen(state, w)) {
      state.walls.push(w);
      return w;
    }
  }
  return null;
}

export function keepsBoardOpen(state, extraWall) {
  const { cols, rows } = state;
  const blocked = new Uint8Array(cols * rows);
  for (const w of state.walls) blocked[w.y * cols + w.x] = 1;
  if (extraWall) blocked[extraWall.y * cols + extraWall.x] = 1;
  const open = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows && !blocked[y * cols + x];
  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  let total = 0;
  let start = -1;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!open(x, y)) continue;
      total++;
      start = y * cols + x;
      if (NB.filter(([dx, dy]) => open(x + dx, y + dy)).length < 2) return false; // dead end
    }
  }
  if (!total) return false;
  // Flood fill: every open square must be reachable from every other.
  const seen = new Uint8Array(cols * rows);
  const stack = [start];
  seen[start] = 1;
  let count = 0;
  while (stack.length) {
    const i = stack.pop();
    count++;
    const x = i % cols;
    const y = Math.floor(i / cols);
    for (const [dx, dy] of NB) {
      const nx = x + dx;
      const ny = y + dy;
      const j = ny * cols + nx;
      if (open(nx, ny) && !seen[j]) {
        seen[j] = 1;
        stack.push(j);
      }
    }
  }
  return count === total;
}
