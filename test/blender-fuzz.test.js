// Blender fuzz: many seeded games of random-but-sensible play in every pair of
// modes, some bigger blends and all ten at once, checking the board stays
// sound after every step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, step, updateFlyers, queueTurn, keepsBoardOpen, slotsInPlay, BLEND_MODES, DIRECTIONS, BASE_TICK_MS,
} from '../src/game.js';

const seeded = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
};
const same = (a, b) => a.x === b.x && a.y === b.y;
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

// Would moving `k` kill the snake straight away? (A rough check: enough to keep
// the fuzz games going for a while.)
function deadly(g, k) {
  const d = DIRECTIONS[k];
  const h = g.snake[0];
  const n = { x: h.x + d.x, y: h.y + d.y };
  if (n.x < 0 || n.y < 0 || n.x >= g.cols || n.y >= g.rows) return true;
  if ([...g.walls, ...g.locks, ...g.mines, ...g.snake.slice(0, -1)].some((c) => same(c, n))) return true;
  const f = g.foods.find((q) => !q.fly && same(q, n));
  if (f?.shields?.includes(OPPOSITE[k])) return true;
  if (f?.poison) return true;
  if (g.mineVisit && g.mineVisit.n >= 3 && g.mines.some((m) => m.id === g.mineVisit.id && Math.max(Math.abs(m.x - n.x), Math.abs(m.y - n.y)) <= 1)) return true;
  return false;
}

// As deadly(), but stepping on poison is fine (the wander may have to).
function deadlyToWander(g, k) {
  const d = DIRECTIONS[k];
  const h = g.snake[0];
  const f = g.foods.find((q) => !q.fly && q.x === h.x + d.x && q.y === h.y + d.y);
  if (f?.poison && !f.shields?.includes(OPPOSITE[k])) {
    const saved = g.foods;
    g.foods = g.foods.filter((q) => q !== f);
    const r = deadly(g, k);
    g.foods = saved;
    return r;
  }
  // Pushing a box into the body or eating a portal is never chosen, but isn't deadly.
  return deadly(g, k);
}

// Head for the nearest thing worth eating (a key, a box to push, a fruit),
// with some randomness; never straight into something deadly if it can help it.
function choose(g, rng) {
  const h = g.snake[0];
  const goals = [...g.keys, ...g.boxes, ...g.foods.filter((f) => !f.poison)];
  const options = Object.keys(DIRECTIONS).filter((k) => k !== OPPOSITE[g.dir] && !deadly(g, k));
  if (!options.length) return null;
  if (goals.length && rng() < 0.7) {
    const goal = goals[0];
    const gx = Math.floor(goal.x);
    const gy = Math.floor(goal.y);
    const toward = options.filter((k) => {
      const d = DIRECTIONS[k];
      return Math.sign(gx - h.x) === d.x && d.x !== 0 || Math.sign(gy - h.y) === d.y && d.y !== 0;
    });
    if (toward.length) return toward[Math.floor(rng() * toward.length)];
  }
  return options[Math.floor(rng() * options.length)];
}

function checkInvariants(g, label) {
  const msg = (m) => `${label}: ${m}`;
  // Keys and locks go together.
  for (const k of g.keys) assert.ok(g.locks.some((l) => l.id === k.id), msg('key without its lock'));
  for (const l of g.locks) assert.ok(g.keys.some((k) => k.id === l.id), msg('lock without its key'));
  // Portal fruit comes in twos (one end may be waiting on the next step after a catch).
  const pairs = new Map();
  for (const f of g.foods) if (f.pair) pairs.set(f.pair, (pairs.get(f.pair) ?? 0) + 1);
  for (const [p, n] of pairs) {
    const pending = g.caught.some((c) => c.pair === p);
    assert.ok(n === 2 || (n === 1 && pending), msg(`portal pair ${p} has ${n} ends`));
  }
  // Boxes and targets go together.
  const crates = new Set([...g.boxes.map((b) => b.id), ...g.locks.filter((l) => l.box).map((l) => l.box)]);
  for (const t of g.targets) assert.ok(t.box === undefined || crates.has(t.box), msg('target without its box'));
  for (const b of g.boxes) assert.ok(g.targets.some((t) => t.box === b.id || t.box === undefined), msg('box without a target'));
  // Nothing solid on the snake, and no two grid pieces on one square.
  const tag = (arr, t) => arr.map((c) => ({ ...c, t }));
  const grid = [...tag(g.walls, 'wall'), ...tag(g.locks, 'lock'), ...tag(g.keys, 'key'), ...tag(g.boxes, 'box'),
    ...tag(g.targets, 'target'), ...tag(g.mines, 'flag'), ...tag(g.foods.filter((f) => !f.fly), 'fruit')];
  const seen = new Map();
  for (const c of grid) {
    const key = `${c.x},${c.y}`;
    // (A box may be pushed onto another box's target: only its own opens it.)
    if ([seen.get(key), c.t].sort().join() === 'box,target') continue;
    assert.ok(!seen.has(key), msg(`${seen.get(key)} and ${c.t} on ${key}`));
    seen.set(key, c.t);
    assert.ok(Number.isInteger(c.x) && Number.isInteger(c.y), msg('grid piece off the grid'));
  }
  const solid = [...g.walls, ...g.locks, ...g.keys, ...g.boxes, ...g.mines, ...g.foods.filter((f) => !f.fly)];
  for (const s of g.snake) assert.ok(!solid.some((c) => same(c, s)), msg(`piece on the snake at ${s.x},${s.y}`));
  // Flying fruit stays on the board.
  for (const f of g.foods.filter((q) => q.fly)) {
    assert.ok(f.x >= 0 && f.y >= 0 && f.x <= g.cols && f.y <= g.rows, msg('flying fruit off the board'));
  }
  // Walls and locks never cut the board up.
  assert.ok(keepsBoardOpen(g), msg('board walled off'));
  assert.ok(keepsBoardOpen(g, null, g.locks), msg('opening the locks leaves a dead end'));
  // Every slot is there (while the game is on, and the count is fixed).
  if (g.status === 'running' && g.fruitCount !== 'random') {
    const needsRoom = ['key', 'box', 'poison'].some((m) => g.modes.has(m));
    // A caught fruit's slot is rebuilt on the next step (a caught portal end's
    // twin still stands for it until then).
    const slots = slotsInPlay(g) + g.caught.filter((c) => !c.bonus && !c.pair).length;
    if (needsRoom) assert.equal(slots, g.fruitCount, msg('slot count'));
    else assert.ok(slots <= g.fruitCount, msg(`too many slots: ${slots}`));
    if (g.modes.has('poison')) {
      assert.equal(g.foods.filter((f) => f.poison && !f.bonus).length, g.fruitCount, msg('poison count'));
    }
  }
}

function fuzz(modes, { seeds = 3, steps = 250 } = {}) {
  const label = modes.join('+');
  const sizes = [[10, 9], [17, 15]];
  const counts = [1, 3, 'random'];
  let games = 0;
  let moves = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const rng = seeded(seed * 7919 + label.length);
    const [cols, rows] = sizes[seed % sizes.length];
    const fruitCount = counts[seed % counts.length];
    let g = createGame({ cols, rows, mode: modes, fruitCount, rng });
    g.status = 'running';
    games++;
    checkInvariants(g, `${label} #${seed} start`);
    for (let i = 0; i < steps; i++) {
      if (g.poison === 0) {
        const k = choose(g, rng);
        if (k) queueTurn(g, k);
      }
      // The poison wander never walks into death while a safe move is there.
      const wandering = g.poison > 0;
      const safe = wandering && Object.keys(DIRECTIONS).filter((k) => k !== OPPOSITE[g.dir] && !deadlyToWander(g, k));
      const ev = step(g);
      moves++;
      if (wandering && ev === 'die') assert.deepEqual(safe, [], `${label} #${seed} step ${i}: the wander died with a way out`);
      if (g.status === 'running') {
        const h = g.snake[0];
        updateFlyers(g, BASE_TICK_MS / 1000, { x: h.x + 0.5, y: h.y + 0.5 });
      }
      if (g.status === 'over' || g.status === 'won') {
        g = createGame({ cols, rows, mode: modes, fruitCount, rng });
        g.status = 'running';
        games++;
      }
      checkInvariants(g, `${label} #${seed} step ${i}`);
    }
  }
  return { games, moves };
}

const pairs = [];
for (let i = 0; i < BLEND_MODES.length; i++) {
  for (let j = i + 1; j < BLEND_MODES.length; j++) pairs.push([BLEND_MODES[i], BLEND_MODES[j]]);
}

export { fuzz, checkInvariants, choose };

test(`blender fuzz: all ${pairs.length} pairs`, () => {
  assert.equal(pairs.length, 45);
  for (const p of pairs) fuzz(p);
});

test('blender fuzz: bigger blends', () => {
  const blends = [
    ['shield', 'winged', 'portal'],
    ['mines', 'twin', 'portal'],
    ['portal', 'wall', 'magnet'],
    ['key', 'box', 'portal'],
    ['shield', 'magnet', 'portal'],
    ['poison', 'mines', 'key', 'wall'],
    ['box', 'poison', 'twin', 'winged', 'shield'],
    ['key', 'box', 'shield', 'mines', 'magnet', 'winged'],
  ];
  for (const b of blends) fuzz(b, { seeds: 4 });
});

test('blender fuzz: all ten modes at once', () => {
  fuzz([...BLEND_MODES], { seeds: 9, steps: 400 });
});
