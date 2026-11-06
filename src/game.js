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
//  twin – eating a fruit flips the snake: the tail becomes the head and it
//            heads off the way the old tail was pointing.
//  magnet  – fruits fly like winged mode but steer toward the snake's head.
//  box     – the fruit is shut in a box: push it (head first) onto its target
//            square to release the fruit, then eat it. Always one box + target.
//  poison  – every regular fruit comes with a poison one. Eating poison hands
//            the snake over to a random (but never suicidal) wander for as many
//            moves as it is long.
//  mines   – every fruit eaten lays a 3×3 mine field with a flag in the middle.
//            Touch the flag, or spend 4+ moves inside, and it's over; dip in and
//            out within 3 moves and the field is cleared.
export const GAME_MODES = {
  classic: { name: 'Classic' },
  wall: { name: 'Walls' },
  portal: { name: 'Portals' },
  winged: { name: 'Winged' },
  twin: { name: 'Twin' },
  magnet: { name: 'Magnet' },
  box: { name: 'Box' },
  poison: { name: 'Poison' },
  mines: { name: 'Mines' },
};

// Modes where fruits move freely. Flying is a per-fruit property (`fly`), so a
// flying fruit can also be dropped into any mode (e.g. from chat). A flying
// fruit's x, y are its centre in cell units; it also has a velocity vx, vy.
export const FLYING_MODES = new Set(['winged', 'magnet']);
export const FRUIT_RADIUS = 0.34; // cells
export const WING_SPEED = 2.2; // cells per second
export const MAGNET_SPEED = 2; // top speed toward the head, cells per second
export const MAGNET_STEER = 2.5; // how quickly a fruit turns toward the head (per second)
export const FRUITS_PER_WALL = 2;
// Mines: a field is 3×3 around its flag; this many moves inside is fatal.
export const MINE_LIMIT = 4;
// New boxes / poison fruits / mine fields keep at least this far from the head
// (Chebyshev distance: squares in any direction, diagonals included).
export const SPAWN_CLEARANCE = 3;

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
    boxes: [], // box mode: { x, y, id } – pushable, holds a fruit
    targets: [], // box mode: { x, y, id } – push a box here to release its fruit
    pushing: false, // box mode: the last step pushed a box
    poison: 0, // poison mode: moves left before the player gets control back
    mines: [], // mines mode: { x, y, id } – flag square; the field is the 3×3 around it
    blast: null, // { x, y, id }: the mine field that went off (mines mode death)
    mineVisit: null, // { id, n }: the field the head is in and how many moves it's been there
    cleared: [], // fields cleared by the last step (for the confetti)
    jumps: [], // portal mode: open portals { from, to, pair } while the body passes through
    nextPair: 1,
    nextId: 1,
    grow: 0, // pending growth from fruits caught between ticks (flying modes)
    score: 0,
    status: 'ready', // ready | running | paused | over | won
  };
  if (mode === 'box') spawnPuzzle(state);
  else spawnFoods(state, batchSize(state));
  return state;
}

const same = (a, b) => a.x === b.x && a.y === b.y;
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const inBounds = (state, c) => c.x >= 0 && c.y >= 0 && c.x < state.cols && c.y < state.rows;
export const adjacent = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;

export function queueTurn(state, dir) {
  if (!DIRECTIONS[dir]) return;
  if (state.status === 'over' || state.status === 'won') return;
  if (state.poison > 0) return; // the poison is steering
  // Compare against the last queued direction so quick double-taps
  // (e.g. up then left) work without letting the snake reverse into itself.
  const last = state.turnQueue.length
    ? state.turnQueue[state.turnQueue.length - 1]
    : state.dir;
  if (dir === last || dir === OPPOSITE[last]) return;
  if (state.turnQueue.length >= MAX_QUEUED_TURNS) return;
  state.turnQueue.push(dir);
}

// Advance one tick. Returns 'move' | 'eat' | 'portal' | 'flip' | 'push' | 'release' |
// 'bump' | 'poison' | 'clear' | 'die' | 'win' (or null if not running). Mine
// fields cleared by the step are listed in state.cleared.
export function step(state) {
  if (state.status !== 'running') return null;

  const poisoned = state.poison > 0;
  if (poisoned) {
    state.turnQueue = [];
    state.dir = poisonDir(state);
  } else if (state.turnQueue.length) {
    state.dir = state.turnQueue.shift();
  }
  const d = DIRECTIONS[state.dir];
  const head = state.snake[0];
  const next = { x: head.x + d.x, y: head.y + d.y };
  // Portal grace: remember when this move is the first one out of a portal exit.
  const leavingExit = state.justTeleported;
  state.justTeleported = false;
  state.leftExit = null;
  state.pushing = false;
  state.cleared = [];

  if (!inBounds(state, next)) return die(state);
  if (state.walls.some((w) => same(w, next))) return die(state);
  const flag = state.mines.find((m) => same(m, next));
  if (flag) return explode(state, flag);

  // Flying fruits are caught continuously (updateFlyers), not by stepping onto a square.
  const eatIdx = state.foods.findIndex((f) => !f.fly && same(f, next));
  const eating = eatIdx !== -1;
  // Poison fruit doesn't make you longer.
  const toxic = eating && !!state.foods[eatIdx].poison;
  const growing = (eating && !toxic) || state.grow > 0;

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

  // Box mode: walking into a box pushes it one square on.
  let push = null;
  const box = state.boxes.find((b) => same(b, next));
  if (box) {
    push = pushBox(state, box, { x: next.x + d.x, y: next.y + d.y }, body);
    if (push === 'die') return die(state);
    state.pushing = true;
  }

  state.snake.unshift(newHead);
  if (!growing) state.snake.pop();
  else if (!eating || toxic) state.grow--;
  if (poisoned) state.poison--;
  if (jump) {
    state.jumps.push(jump);
    state.justTeleported = true;
  }
  if (leavingExit && !eating) state.leftExit = { exit: { x: head.x, y: head.y } };
  pruneJumps(state);
  if (state.mines.length && !trackMines(state)) {
    return explode(state, state.mines.find((m) => m.id === state.mineVisit.id));
  }
  if (!eating) {
    if (occupiedCount(state) >= state.cols * state.rows) return win(state);
    if (push === 'bump') {
      const spot = placeBox(state);
      // A box knocked into a wall that can't find a new spot: the board's full.
      if (!spot) return win(state);
      state.boxes.push({ ...spot, id: state.nextId++ });
    }
    // (A cleared mine field is its own event so a late turn can't undo it.)
    return push ?? (state.cleared.length ? 'clear' : 'move');
  }

  const eatenFood = state.foods[eatIdx];
  state.foods = state.foods.filter((f) => f !== eatenFood && !(jump && f.pair === eatenFood.pair));
  if (toxic) {
    // Poison: no point, no growth; the snake wanders for as long as it is long.
    state.poison = state.snake.length;
    state.turnQueue = [];
    if (!refill(state, eatenFood)) return win(state);
    return 'poison';
  }
  state.score += 1;

  if (state.mode === 'wall' && state.score % FRUITS_PER_WALL === 0) spawnWall(state);
  // Mines: every fruit lays a field; no room for one any more is a win.
  if (state.mode === 'mines' && !eatenFood.bonus && !spawnMine(state)) return win(state);
  // Checked after the wall drops: walls shrink the board, so a wall taking the
  // last open square means there's nothing left to fill — that's a win.
  if (occupiedCount(state) >= state.cols * state.rows) return win(state);
  // Modes that need room for their next thing (a box and its target) are won
  // once there isn't any.
  if (!eatenFood.bonus && !refill(state, eatenFood)) return win(state);
  if (state.mode === 'twin') {
    flip(state);
    return 'flip';
  }
  return jump ? 'portal' : 'eat';
}

// Twin: reverse the snake. The old tail becomes the head, moving away from
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
// Bonus fruits (dropped in from chat) don't count toward the fruit count.
// Returns false when the mode couldn't place what it needs (that's a win).
function refill(state, eaten = null) {
  if (state.mode === 'box') {
    if (!state.boxes.length && !state.foods.some((f) => f.boxed)) return spawnPuzzle(state);
    return true;
  }
  if (state.mode === 'poison') {
    if (state.fruitCount === 'random') {
      // A fresh batch once every regular fruit is gone (leftover poison is cleared).
      if (state.foods.some((f) => !f.bonus && !f.poison)) return true;
      state.foods = state.foods.filter((f) => !f.poison);
      return spawnFoods(state, batchSize(state));
    }
    return !!spawnPoisonFruit(state, !!eaten?.poison);
  }
  if (state.fruitCount === 'random') {
    if (!state.foods.some((f) => !f.bonus)) spawnFoods(state, batchSize(state));
  } else {
    spawnFoods(state, 1);
  }
  return true;
}

// ---------- box mode ----------
// Push `box` onto `dest` (the square beyond it). `body` is the snake as it will
// be after this move, minus the new head. Returns:
//  'push'    – the box slid onto dest
//  'release' – dest was a target: box and target are gone, the fruit sits on dest
//  'bump'    – dest is off the board / a wall / another box / a fruit: the box
//              respawns somewhere else (or vanishes if there's no room)
//  'die'     – dest is part of the snake
function pushBox(state, box, dest, body) {
  if (body.some((s) => same(s, dest))) return 'die';
  const blocked = !inBounds(state, dest)
    || state.walls.some((w) => same(w, dest))
    || state.boxes.some((b) => b !== box && same(b, dest))
    || state.foods.some((f) => !f.fly && same(f, dest));
  if (blocked) {
    // Respawned by step() once the head has moved onto the old box square.
    state.boxes = state.boxes.filter((b) => b !== box);
    return 'bump';
  }
  const target = state.targets.find((t) => same(t, dest));
  if (target) {
    state.boxes = state.boxes.filter((b) => b !== box);
    state.targets = state.targets.filter((t) => t !== target);
    state.foods.push({ x: dest.x, y: dest.y, id: state.nextId++, boxed: true });
    return 'release';
  }
  box.x = dest.x;
  box.y = dest.y;
  return 'push';
}

// Squares a new box could go on: off the edge, at least SPAWN_CLEARANCE from the
// head, and with all 8 squares around it open (so the snake can get round it to
// push it any way).
export function placeBox(state) {
  const { cols, rows } = state;
  const taken = takenCells(state);
  const h = state.snake[0];
  const ok = [];
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      if (h && cheb(h, { x, y }) < SPAWN_CLEARANCE) continue;
      let clear = true;
      for (let dy = -1; dy <= 1 && clear; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (taken.has((y + dy) * cols + x + dx)) { clear = false; break; }
        }
      }
      if (clear) ok.push({ x, y });
    }
  }
  return ok.length ? ok[Math.floor(state.rng() * ok.length)] : null;
}

// A target on any open square at least 2 away from its box.
function placeTarget(state, box) {
  const taken = takenCells(state);
  const ok = [];
  for (let y = 0; y < state.rows; y++) {
    for (let x = 0; x < state.cols; x++) {
      if (!taken.has(y * state.cols + x) && cheb(box, { x, y }) >= 2) ok.push({ x, y });
    }
  }
  return ok.length ? ok[Math.floor(state.rng() * ok.length)] : null;
}

// Drop a new box and its target. Returns false if there's no room for both.
export function spawnPuzzle(state) {
  const box = placeBox(state);
  if (!box) return false;
  box.id = state.nextId++;
  state.boxes.push(box);
  const target = placeTarget(state, box);
  if (!target) {
    state.boxes.pop();
    return false;
  }
  target.id = state.nextId++;
  state.targets.push(target);
  return true;
}

// Grid squares holding something solid: snake, grid fruits, walls, boxes, targets.
function takenCells(state) {
  const c = state.cols;
  const cells = [
    ...state.snake, ...state.walls, ...state.targets, ...state.boxes,
    ...state.foods.filter((f) => !f.fly),
  ];
  return new Set(cells.map((s) => s.y * c + s.x));
}

// ---------- flying fruits ----------
// Move flying fruits by dt seconds, bouncing off the board edges, walls and the
// snake's body, then catch any touching the head. `head` is the head centre in
// cell units (the drawn, in-between-squares position); defaults to its square.
// Returns the fruits eaten this frame.
export function updateFlyers(state, dt, head = null) {
  if (state.status !== 'running' || !state.foods.some((f) => f.fly)) return [];
  const h = head ?? { x: state.snake[0].x + 0.5, y: state.snake[0].y + 0.5 };
  const r = FRUIT_RADIUS;
  const obstacles = [...state.snake.slice(1), ...state.walls, ...state.boxes, ...state.mines];

  for (const f of state.foods) {
    if (!f.fly) continue;
    if (f.fly === 'magnet') {
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
  const eaten = state.foods.filter((f) => f.fly && Math.abs(f.x - h.x) < reach && Math.abs(f.y - h.y) < reach);
  if (!eaten.length) return [];
  state.foods = state.foods.filter((f) => !eaten.includes(f));
  for (const f of eaten) {
    state.score += 1;
    state.grow += 1;
    if (!f.bonus) refill(state);
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

// ---------- hopeful turning ----------
// The drawn snake trails the game by up to one square, so a turn pressed just
// after the head passes a square's centre would normally land one square late.
// Snapshot the state before each step; if a turn arrives right after a plain
// straight move, rewind and redo that move with the turn.
export function snapshot(state) {
  return {
    snake: state.snake.map((c) => ({ ...c })),
    dir: state.dir,
    turnQueue: [...state.turnQueue],
    foods: state.foods.map((f) => ({ ...f })),
    walls: state.walls.map((w) => ({ ...w })),
    boxes: state.boxes.map((b) => ({ ...b })),
    targets: state.targets.map((t) => ({ ...t })),
    pushing: state.pushing,
    poison: state.poison,
    mines: state.mines.map((m) => ({ ...m })),
    mineVisit: state.mineVisit && { ...state.mineVisit },
    cleared: [...state.cleared],
    jumps: state.jumps.map((j) => ({ ...j, from: { ...j.from }, to: { ...j.to } })),
    grow: state.grow,
    score: state.score,
    status: state.status,
    nextPair: state.nextPair,
    nextId: state.nextId,
    justTeleported: state.justTeleported,
    leftExit: state.leftExit,
  };
}

// Redo the last step turning `dir` instead of going straight. `snap` is the state
// from just before that step, `lastEvent` what the step returned. Returns the new
// step's event, or null if a late turn isn't allowed here.
export function lateTurn(state, snap, lastEvent, dir) {
  if (!snap || (lastEvent !== 'move' && lastEvent !== 'push') || state.status !== 'running') return null;
  if (snap.turnQueue.length) return null; // that move already used a queued turn
  if (snap.poison > 0) return null; // the poison chose that move
  if (!DIRECTIONS[dir] || dir === snap.dir || dir === OPPOSITE[snap.dir]) return null;
  Object.assign(state, snapshot(snap)); // copy so the snapshot stays reusable
  state.turnQueue = [dir];
  return step(state);
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

// Mines mode death: the field goes off. It's taken off the board and kept in
// state.blast so the explosion can be drawn there.
function explode(state, mine) {
  state.mines = state.mines.filter((m) => m !== mine);
  state.blast = { x: mine.x, y: mine.y, id: mine.id };
  return die(state);
}

function win(state) {
  state.status = 'won';
  return 'win';
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

// Add up to n fruits (n portal pairs in portal mode, n regular + n poison in
// poison mode) on free cells. Returns false if it ran out of room.
export function spawnFoods(state, n) {
  for (let i = 0; i < n; i++) {
    if (state.mode === 'poison') {
      if (!spawnPoisonFruit(state, false) || !spawnPoisonFruit(state, true)) return false;
    } else if (state.mode === 'portal') {
      const a = placeFood(state);
      if (!a) return false;
      state.foods.push(a);
      const b = placeFood(state);
      if (!b) {
        state.foods.pop(); // a portal needs both ends
        return false;
      }
      a.pair = b.pair = state.nextPair++;
      a.id = state.nextId++;
      b.id = state.nextId++;
      state.foods.push(b);
    } else {
      const f = placeFood(state);
      if (!f) return false;
      f.id = state.nextId++;
      if (FLYING_MODES.has(state.mode)) makeFlyer(state, f, state.mode);
      state.foods.push(f);
    }
  }
  return true;
}

// ---------- mines mode ----------
const inField = (m, c) => cheb(m, c) <= 1;

// Count the head's moves inside a mine field. Leaving within MINE_LIMIT - 1
// moves clears the field; reaching MINE_LIMIT is fatal. Returns false on death.
function trackMines(state) {
  const h = state.snake[0];
  const m = state.mines.find((q) => inField(q, h));
  const v = state.mineVisit;
  if (v && (!m || m.id !== v.id)) {
    // Out of the field (or straight into a neighbouring one): it's cleared.
    const gone = state.mines.find((q) => q.id === v.id);
    if (gone) {
      state.mines = state.mines.filter((q) => q !== gone);
      state.cleared.push(gone);
    }
    state.mineVisit = null;
  }
  if (m) {
    state.mineVisit = state.mineVisit ? { id: m.id, n: state.mineVisit.n + 1 } : { id: m.id, n: 1 };
    if (state.mineVisit.n >= MINE_LIMIT) return false;
  }
  return true;
}

// Lay a mine field: the whole 3×3 on the board, clear of walls, fruit and other
// fields, at least SPAWN_CLEARANCE from the head. It may cover the snake's body,
// but never on the flag square. Returns the field, or null if none fits.
export function spawnMine(state) {
  const { cols, rows } = state;
  const h = state.snake[0];
  const solid = new Set([...state.walls, ...state.foods.filter((f) => !f.fly)].map((c) => c.y * cols + c.x));
  const body = new Set(state.snake.map((c) => c.y * cols + c.x));
  const ok = [];
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      if (body.has(y * cols + x)) continue;
      if (h && cheb(h, { x, y }) < SPAWN_CLEARANCE) continue;
      if (state.mines.some((m) => cheb(m, { x, y }) <= 2)) continue; // fields can't overlap
      let clear = true;
      for (let dy = -1; dy <= 1 && clear; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (solid.has((y + dy) * cols + x + dx)) { clear = false; break; }
        }
      }
      if (clear) ok.push({ x, y });
    }
  }
  if (!ok.length) return null;
  const m = ok[Math.floor(state.rng() * ok.length)];
  m.id = state.nextId++;
  state.mines.push(m);
  return m;
}

// Squares inside a mine field (flags included).
function mineCells(state) {
  const out = [];
  for (const m of state.mines) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) out.push({ x: m.x + dx, y: m.y + dy });
    }
  }
  return out;
}

// ---------- poison mode ----------
// One regular or poison fruit on a free square at least SPAWN_CLEARANCE from the head.
export function spawnPoisonFruit(state, poison) {
  const taken = takenCells(state);
  const h = state.snake[0];
  const ok = [];
  for (let y = 0; y < state.rows; y++) {
    for (let x = 0; x < state.cols; x++) {
      if (!taken.has(y * state.cols + x) && (!h || cheb(h, { x, y }) >= SPAWN_CLEARANCE)) ok.push({ x, y });
    }
  }
  if (!ok.length) return null;
  const f = ok[Math.floor(state.rng() * ok.length)];
  f.id = state.nextId++;
  if (poison) f.poison = true;
  state.foods.push(f);
  return f;
}

// Poisoned steering: carry on straight half the time, turn left or right a
// quarter each — but only among moves that are safe. A move is safe if it hits
// nothing and leaves the head able to reach its own tail (or at least as much
// open room as the snake is long), so the wander can't paint itself into a
// corner. Poison fruit is only stepped on if nothing else is safe.
export function poisonDir(state) {
  const dir = state.dir;
  const options = [
    [dir, 0.5],
    ...Object.keys(DIRECTIONS)
      .filter((k) => k !== dir && k !== OPPOSITE[dir])
      .map((k) => [k, 0.25]),
  ];
  let bestTier = -1;
  let pool = [];
  for (const [k, w] of options) {
    const tier = moveSafety(state, k);
    if (tier > bestTier) {
      bestTier = tier;
      pool = [];
    }
    if (tier === bestTier) pool.push([k, w]);
  }
  if (bestTier <= 0) return dir; // nowhere safe: carry on (into whatever it is)
  const total = pool.reduce((a, [, w]) => a + w, 0);
  let r = state.rng() * total;
  for (const [k, w] of pool) {
    if ((r -= w) < 0) return k;
  }
  return pool[pool.length - 1][0];
}

// Higher is safer. 0 = fatal. Otherwise, from best to worst: the snake can
// still chase its own tail after this; it at least has room for its length;
// it's trapped (but not dead yet). Within each, stepping on poison fruit ranks
// a notch lower.
function moveSafety(state, k) {
  const sim = { snake: state.snake, grow: state.grow };
  const fruit = new Map(state.foods.filter((f) => !f.fly).map((f) => [f.y * state.cols + f.x, f]));
  const blocked = wallGrid(state);
  const next = simMove(state, sim, k, blocked, fruit);
  if (!next) return 0;
  let level = 1;
  if (lookAhead(state, next, LOOKAHEAD, blocked, fruit, TAIL, { n: LOOKAHEAD_BUDGET })) level = 3;
  else if (lookAhead(state, next, LOOKAHEAD, blocked, fruit, ROOM, { n: LOOKAHEAD_BUDGET })) level = 2;
  const h = next.snake[0];
  return level * 2 + (fruit.get(h.y * state.cols + h.x)?.poison ? 0 : 1);
}

// roomy() results
const ROOM = 1; // as many open squares as the snake is long
const TAIL = 2; // can catch up with its own retreating tail

const LOOKAHEAD = 10; // moves
const LOOKAHEAD_BUDGET = 300; // positions checked per candidate move

function wallGrid(state) {
  const g = new Uint8Array(state.cols * state.rows);
  for (const w of state.walls) g[w.y * state.cols + w.x] = 1;
  return g;
}

// One simulated move of a { snake, grow } in direction k (fruit eaten along the
// way makes it grow; nothing respawns). Returns the new sim, or null if it dies.
function simMove(state, sim, k, blocked, fruit) {
  const d = DIRECTIONS[k];
  const h = sim.snake[0];
  const next = { x: h.x + d.x, y: h.y + d.y };
  if (!inBounds(state, next) || blocked[next.y * state.cols + next.x]) return null;
  const f = fruit.get(next.y * state.cols + next.x);
  const eats = f && !f.poison;
  const growing = eats || sim.grow > 0;
  const body = growing ? sim.snake : sim.snake.slice(0, -1);
  if (body.some((s) => same(s, next))) return null;
  return { snake: [next, ...body], grow: eats ? sim.grow : Math.max(0, sim.grow - 1) };
}

// Is there some way to keep going for `depth` more moves and end up at least
// `need` (ROOM or TAIL) safe? Ignores fruit already eaten in this line (close enough).
function lookAhead(state, sim, depth, blocked, fruit, need, budget) {
  const r = roomy(state, sim, blocked, fruit);
  if (r >= need) return true;
  if (depth === 0 || budget.n <= 0 || r === 0) return false;
  budget.n--;
  const h = sim.snake[0];
  const n = sim.snake[1];
  for (const k of Object.keys(DIRECTIONS)) {
    const d = DIRECTIONS[k];
    if (n && h.x + d.x === n.x && h.y + d.y === n.y) continue;
    const next = simMove(state, sim, k, blocked, fruit);
    if (next && lookAhead(state, next, depth - 1, blocked, fruit, need, budget)) return true;
  }
  return false;
}

// Time-aware flood fill from the head: a body square counts as open once the
// tail will have moved off it by the time the head could get there. TAIL if
// the head can reach a square the body is leaving (it can then chase its own
// tail forever), else ROOM if it has at least as many open squares as the
// snake is long, else 0. Fruit eaten on the way there makes the snake longer,
// so the tail is that much later.
function roomy(state, sim, blocked, fruit) {
  const { cols, rows } = state;
  const { snake, grow } = sim;
  const n = snake.length;
  const freeAt = new Int32Array(cols * rows);
  // Segment i (0 = head) leaves its square after n - i moves (later while still growing).
  for (let i = 1; i < n; i++) freeAt[snake[i].y * cols + snake[i].x] = n - i + grow;
  const start = snake[0].y * cols + snake[0].x;
  const dist = new Int32Array(cols * rows).fill(-1);
  const ate = new Int32Array(cols * rows); // regular fruit eaten along the way
  dist[start] = 0;
  const queue = [start];
  let area = 0;
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const x = i % cols;
    const y = (i - x) / cols;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const j = ny * cols + nx;
      if (blocked[j] || dist[j] !== -1) continue;
      const t = dist[i] + 1;
      if (freeAt[j]) {
        if (t < freeAt[j] + ate[i]) continue;
        return TAIL; // caught up with the retreating tail
      }
      dist[j] = t;
      const f = fruit.get(j);
      ate[j] = ate[i] + (f && !f.poison ? 1 : 0);
      area++;
      queue.push(j);
    }
  }
  return area >= n ? ROOM : 0;
}

// Turn a fruit placed on a square into a flying one ('winged' or 'magnet'):
// centre of its square, heading off in a random direction.
function makeFlyer(state, f, kind) {
  const a = state.rng() * Math.PI * 2;
  const v = kind === 'magnet' ? MAGNET_SPEED * 0.3 : WING_SPEED;
  f.x += 0.5;
  f.y += 0.5;
  f.fly = kind;
  f.vx = Math.cos(a) * v;
  f.vy = Math.sin(a) * v;
  return f;
}

// ---------- chat / external actions ----------
// Drop one extra winged fruit (any mode). It's a bonus: not replaced once eaten.
export function addBonusFlyer(state) {
  const f = placeFood(state);
  if (!f) return null;
  f.id = state.nextId++;
  f.bonus = true;
  makeFlyer(state, f, 'winged');
  state.foods.push(f);
  return f;
}

// Change the board size mid-game.
//  - Shrinking an axis: the new board is centred on the head; whatever falls
//    outside is lost (the snake is cut off at its first segment outside).
//  - Growing an axis: the old board is centred in the new one; nothing is lost.
export function resizeBoard(state, cols, rows) {
  if (cols === state.cols && rows === state.rows) return false;
  const head = state.snake[0];
  const offset = (oldN, newN, h) => (newN < oldN ? Math.floor(newN / 2) - h : Math.floor((newN - oldN) / 2));
  const ox = offset(state.cols, cols, head.x);
  const oy = offset(state.rows, rows, head.y);
  const inside = (c) => c.x >= 0 && c.y >= 0 && c.x < cols && c.y < rows;
  const move = (c) => ({ ...c, x: c.x + ox, y: c.y + oy });

  const snake = [];
  for (const c of state.snake.map(move)) {
    if (!inside(c)) break;
    snake.push(c);
  }
  state.snake = snake;

  let foods = state.foods.map(move).filter(inside);
  // A portal pair loses both ends if either is clipped.
  foods = foods.filter((f) => !f.pair || foods.some((o) => o !== f && o.pair === f.pair));
  state.foods = foods;
  state.walls = state.walls.map(move).filter(inside);
  state.boxes = state.boxes.map(move).filter(inside);
  // Mine fields have to fit on the board whole.
  state.mines = state.mines.map(move).filter((m) => m.x >= 1 && m.y >= 1 && m.x < cols - 1 && m.y < rows - 1);
  if (state.mineVisit && !state.mines.some((m) => m.id === state.mineVisit.id)) state.mineVisit = null;
  state.targets = state.targets.map(move).filter(inside);
  state.jumps = state.jumps
    .map((j) => ({ ...j, from: move(j.from), to: move(j.to) }))
    .filter((j) => inside(j.from) && inside(j.to));
  state.cols = cols;
  state.rows = rows;
  state.justTeleported = false;
  state.leftExit = null;

  // Walls that would now box the snake in are knocked down.
  while (state.walls.length && !keepsBoardOpen(state)) {
    state.walls.splice(Math.floor(state.rng() * state.walls.length), 1);
  }
  if (state.mode === 'box') {
    // Lost the box or its target off the edge: start a fresh one.
    if ((!state.boxes.length || !state.targets.length) && !state.foods.some((f) => f.boxed)) {
      state.boxes = [];
      state.targets = [];
      spawnPuzzle(state);
    }
    return true;
  }
  if (state.mode === 'poison') {
    // Top each kind back up to the count.
    const n = state.fruitCount === 'random' ? 1 : state.fruitCount;
    for (const poison of [false, true]) {
      const have = state.foods.filter((f) => !f.bonus && !!f.poison === poison).length;
      for (let i = have; i < n; i++) spawnPoisonFruit(state, poison);
    }
    return true;
  }
  // Top the fruit back up to the normal count.
  const regular = state.foods.filter((f) => !f.bonus);
  if (state.fruitCount === 'random') {
    if (!regular.length) spawnFoods(state, batchSize(state));
  } else {
    const have = state.mode === 'portal' ? regular.length / 2 : regular.length;
    if (have < state.fruitCount) spawnFoods(state, state.fruitCount - have);
  }
  return true;
}

// Free squares for fruit and walls. Mine fields are avoided while there's
// anywhere else (their flags always).
function freeCells(state, extraBlocked = []) {
  const key = (s) => Math.floor(s.y) * state.cols + Math.floor(s.x);
  const occupied = new Set(
    [...state.snake, ...state.foods, ...state.walls, ...state.boxes, ...state.targets, ...state.mines, ...extraBlocked]
      .map(key),
  );
  const fields = new Set(mineCells(state).map(key));
  const free = [];
  const inFields = [];
  for (let i = 0; i < state.cols * state.rows; i++) {
    if (!occupied.has(i)) (fields.has(i) ? inFields : free).push(i);
  }
  return free.length ? free : inFields;
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
