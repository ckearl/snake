// Pure game logic — no DOM. Rendering and input live in main.js so that
// future event sources (Twitch chat, channel points) can drive the same state.

export const BOARD_SIZES = {
  small: { label: 'Small', cols: 9, rows: 10 },
  medium: { label: 'Medium', cols: 15, rows: 17 },
  large: { label: 'Large', cols: 21, rows: 24 },
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
// Milliseconds per tile at speed 1. Speed is a multiplier on that time:
// lower = faster (bunny), higher = slower (turtle).
export const BASE_TICK_MS = 135;
export const SPEEDS = { slow: 1.33, normal: 1, fast: 0.67 };

export const RANDOM_MIN = 1;
export const RANDOM_MAX = 10;

const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
const MAX_QUEUED_TURNS = 2;

export function createGame({ cols, rows, fruitCount = 1, rng = Math.random }) {
  const midY = Math.floor(rows / 2);
  const startX = Math.max(2, Math.floor(cols / 2) - 1);
  const state = {
    cols,
    rows,
    rng,
    // Head first. Starts length 3, facing right.
    snake: [
      { x: startX, y: midY },
      { x: startX - 1, y: midY },
      { x: startX - 2, y: midY },
    ],
    dir: 'right',
    turnQueue: [],
    fruitCount,
    foods: [],
    score: 0,
    status: 'ready', // ready | running | paused | over | won
  };
  spawnFoods(state, batchSize(state));
  return state;
}

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

// Advance one tick. Returns an event name for the renderer/sfx: 'move' | 'eat' | 'die' | 'win'.
export function step(state) {
  if (state.status !== 'running') return null;

  if (state.turnQueue.length) state.dir = state.turnQueue.shift();
  const d = DIRECTIONS[state.dir];
  const head = state.snake[0];
  const next = { x: head.x + d.x, y: head.y + d.y };

  if (next.x < 0 || next.y < 0 || next.x >= state.cols || next.y >= state.rows) {
    state.status = 'over';
    return 'die';
  }

  const eatIdx = state.foods.findIndex((f) => f.x === next.x && f.y === next.y);
  const eating = eatIdx !== -1;
  // The tail vacates its cell this tick unless we're growing, so it's safe to move into.
  const body = eating ? state.snake : state.snake.slice(0, -1);
  if (body.some((s) => s.x === next.x && s.y === next.y)) {
    state.status = 'over';
    return 'die';
  }

  state.snake.unshift(next);
  if (!eating) {
    state.snake.pop();
    return 'move';
  }

  state.score += 1;
  state.foods.splice(eatIdx, 1);
  if (state.snake.length >= state.cols * state.rows) {
    state.status = 'won';
    return 'win';
  }
  if (state.fruitCount === 'random') {
    if (state.foods.length === 0) spawnFoods(state, batchSize(state));
  } else {
    spawnFoods(state, 1);
  }
  return 'eat';
}

function batchSize(state) {
  if (state.fruitCount !== 'random') return state.fruitCount;
  return RANDOM_MIN + Math.floor(state.rng() * (RANDOM_MAX - RANDOM_MIN + 1));
}

// Add up to n fruits on free cells (fewer if the board is nearly full).
export function spawnFoods(state, n) {
  for (let i = 0; i < n; i++) {
    const f = placeFood(state);
    if (!f) break;
    state.foods.push(f);
  }
}

export function placeFood(state) {
  const occupied = new Set(
    [...state.snake, ...state.foods].map((s) => s.y * state.cols + s.x),
  );
  const free = [];
  for (let i = 0; i < state.cols * state.rows; i++) {
    if (!occupied.has(i)) free.push(i);
  }
  if (!free.length) return null;
  const idx = free[Math.floor(state.rng() * free.length)];
  return { x: idx % state.cols, y: Math.floor(idx / state.cols) };
}
