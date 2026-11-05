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
//  cheese  – every other body segment is a hole the head can pass through.
export const GAME_MODES = {
  classic: { name: 'Classic' },
  wall: { name: 'Walls' },
  portal: { name: 'Portals' },
  cheese: { name: 'Cheese' },
};
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

// In cheese mode, body segment i (counted from the head after the move) is
// solid when i is odd; even segments are holes.
export const cheeseSolid = (i) => i % 2 === 1;

// Advance one tick. Returns 'move' | 'eat' | 'portal' | 'die' | 'win' (or null if not running).
export function step(state) {
  if (state.status !== 'running') return null;

  if (state.turnQueue.length) state.dir = state.turnQueue.shift();
  const d = DIRECTIONS[state.dir];
  const head = state.snake[0];
  const next = { x: head.x + d.x, y: head.y + d.y };

  if (next.x < 0 || next.y < 0 || next.x >= state.cols || next.y >= state.rows) return die(state);
  if (state.walls.some((w) => same(w, next))) return die(state);

  const eatIdx = state.foods.findIndex((f) => same(f, next));
  const eating = eatIdx !== -1;

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
  const body = eating ? state.snake : state.snake.slice(0, -1);
  const hit = body.some((s, j) => {
    if (!same(s, newHead)) return false;
    // After the move, old segment j becomes segment j + 1.
    return state.mode === 'cheese' ? cheeseSolid(j + 1) : true;
  });
  if (hit) return die(state);

  state.snake.unshift(newHead);
  if (!eating) state.snake.pop();
  if (jump) state.jumps.push(jump);
  pruneJumps(state);
  if (!eating) return 'move';

  state.score += 1;
  const eatenFood = state.foods[eatIdx];
  state.foods = state.foods.filter((f) => f !== eatenFood && !(jump && f.pair === eatenFood.pair));

  if (occupiedCount(state) >= state.cols * state.rows) {
    state.status = 'won';
    return 'win';
  }
  if (state.mode === 'wall' && state.score % FRUITS_PER_WALL === 0) spawnWall(state);
  if (state.fruitCount === 'random') {
    if (state.foods.length === 0) spawnFoods(state, batchSize(state));
  } else {
    spawnFoods(state, 1);
  }
  return jump ? 'portal' : 'eat';
}

function die(state) {
  state.status = 'over';
  return 'die';
}

// Squares that can never take a fruit or wall again: snake (distinct cells) + walls.
function occupiedCount(state) {
  return new Set(state.snake.map((s) => s.y * state.cols + s.x)).size + state.walls.length;
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
      state.foods.push(b);
    } else {
      const f = placeFood(state);
      if (!f) break;
      state.foods.push(f);
    }
  }
}

function freeCells(state, extraBlocked = []) {
  const occupied = new Set(
    [...state.snake, ...state.foods, ...state.walls, ...extraBlocked].map((s) => s.y * state.cols + s.x),
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

// Wall mode: a block on a free square, never the two squares straight ahead of the head.
export function spawnWall(state) {
  const d = DIRECTIONS[state.dir];
  const h = state.snake[0];
  const ahead = [1, 2].map((k) => ({ x: h.x + d.x * k, y: h.y + d.y * k }));
  const w = placeFood(state, ahead);
  if (w) state.walls.push(w);
  return w;
}
