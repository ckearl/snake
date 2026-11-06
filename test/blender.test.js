import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, step, modeKey, modeSet, hasMode,
} from '../src/game.js';

// A repeatable "random" sequence.
export const seeded = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
};

const running = (opts) => {
  const g = createGame({ cols: 17, rows: 15, rng: seeded(7), ...opts });
  g.status = 'running';
  return g;
};

// ---------- the mode set ----------
test('blender: a blend key is its modes sorted and joined; none is classic', () => {
  assert.equal(modeKey(['key', 'box']), 'box+key');
  assert.equal(modeKey(['shield']), 'shield');
  assert.equal(modeKey([]), 'classic');
  assert.equal(modeKey(['classic']), 'classic');
});

test('blender: a mode set drops classic and anything unknown', () => {
  assert.deepEqual([...modeSet('classic')], []);
  assert.deepEqual([...modeSet('box')], ['box']);
  assert.deepEqual([...modeSet(['wall', 'nope', 'classic', 'wall', 'portal'])].sort(), ['portal', 'wall']);
});

test('blender: a game keeps its modes as a set and its key as the mode', () => {
  const one = createGame({ cols: 17, rows: 15, mode: 'box' });
  assert.equal(one.mode, 'box');
  assert.ok(hasMode(one, 'box'));
  const g = createGame({ cols: 17, rows: 15, mode: ['wall', 'mines'] });
  assert.equal(g.mode, 'mines+wall');
  assert.ok(hasMode(g, 'wall') && hasMode(g, 'mines') && !hasMode(g, 'box'));
  assert.equal(createGame({ cols: 17, rows: 15 }).mode, 'classic');
});

test('blender: a one-mode blend is that mode', () => {
  const a = running({ mode: ['portal'] });
  const b = running({ mode: 'portal' });
  assert.deepEqual(a.foods, b.foods);
  step(a);
  step(b);
  assert.deepEqual(a.snake, b.snake);
});

// ---------- helpers ----------
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const same = (a, b) => a.x === b.x && a.y === b.y;
const blend = (mode, opts = {}) => running({ mode, ...opts });

// ---------- wrapping order ----------
test('blender keys + box: each slot starts as a key, a lock with a clear ring, and a target', () => {
  for (let seed = 1; seed < 30; seed++) {
    const g = createGame({ cols: 17, rows: 15, mode: ['key', 'box'], fruitCount: 3, rng: seeded(seed) });
    assert.equal(g.keys.length, 3);
    assert.equal(g.locks.length, 3);
    assert.equal(g.targets.length, 3);
    assert.equal(g.boxes.length, 0, 'no box until its lock opens');
    assert.equal(g.foods.length, 0);
    for (const l of g.locks) {
      const t = g.targets.find((q) => q.box === l.box);
      assert.ok(t, 'the lock knows which target its box goes to');
      assert.ok(cheb(t, l) >= 2);
      assert.ok(l.x > 0 && l.y > 0 && l.x < 16 && l.y < 14, 'off the edge, like a box');
    }
  }
});

test('blender keys + box: the key opens the lock to reveal the box; home on its target, out comes the fruit', () => {
  const g = blend(['key', 'box']);
  const h = g.snake[0];
  g.locks = [{ x: 10, y: 3, id: 40, shape: 'star', box: 41, slot: 's40' }];
  g.keys = [{ x: h.x + 1, y: h.y, id: 40, shape: 'star', slot: 's40' }];
  g.targets = [{ x: 13, y: 3, id: 42, box: 41, slot: 's40' }];
  assert.equal(step(g), 'unlock');
  assert.deepEqual(g.locks, []);
  assert.equal(g.boxes.length, 1);
  assert.deepEqual({ x: g.boxes[0].x, y: g.boxes[0].y, id: g.boxes[0].id }, { x: 10, y: 3, id: 41 });
  assert.equal(g.foods.length, 0);
  // Push it right twice: onto 12, then onto the target at 13.
  g.snake = [{ x: 9, y: 3 }, { x: 8, y: 3 }, { x: 7, y: 3 }];
  g.dir = 'right';
  assert.equal(step(g), 'push');
  assert.equal(step(g), 'push');
  assert.equal(step(g), 'release');
  const f = g.foods.find((q) => q.boxed);
  assert.deepEqual({ x: f.x, y: f.y }, { x: 13, y: 3 });
});

test('blender box + portal: a box lets out one end of a pair; its twin appears away from the head', () => {
  for (let seed = 1; seed < 20; seed++) {
    const g = blend(['box', 'portal'], { rng: seeded(seed) });
    g.boxes = [{ x: 9, y: 7, id: 30 }];
    g.targets = [{ x: 10, y: 7, id: 31, box: 30 }];
    g.foods = [];
    g.snake = [{ x: 8, y: 7 }, { x: 7, y: 7 }, { x: 6, y: 7 }];
    g.dir = 'right';
    assert.equal(step(g), 'release');
    assert.equal(g.foods.length, 2);
    const [a, b] = g.foods;
    assert.ok(a.pair && a.pair === b.pair, 'a linked pair');
    const twin = g.foods.find((q) => !same(q, { x: 10, y: 7 }));
    assert.ok(cheb(twin, { x: 8, y: 7 }) >= 3);
  }
});

test('blender keys + portal: one key opens two locks with the same shape, letting out a pair', () => {
  const g = createGame({ cols: 17, rows: 15, mode: ['key', 'portal'], fruitCount: 2, rng: seeded(3) });
  assert.equal(g.keys.length, 2);
  assert.equal(g.locks.length, 4);
  for (const k of g.keys) {
    const ls = g.locks.filter((l) => l.id === k.id);
    assert.equal(ls.length, 2);
    assert.ok(ls.every((l) => l.shape === k.shape));
  }
  g.status = 'running';
  const k = g.keys[0];
  g.snake = [{ x: k.x - 1, y: k.y }, { x: k.x - 2, y: k.y }];
  g.dir = 'right';
  const before = g.foods.length;
  assert.equal(step(g), 'unlock');
  const out = g.foods.slice(before);
  assert.equal(out.length, 2);
  assert.ok(out[0].pair && out[0].pair === out[1].pair);
});

test('blender box in a blend: one box and target per fruit, each opening only on its own', () => {
  const g = createGame({ cols: 24, rows: 21, mode: ['box', 'wall'], fruitCount: 3, rng: seeded(5) });
  assert.equal(g.boxes.length, 3);
  assert.equal(g.targets.length, 3);
  for (const b of g.boxes) assert.equal(g.targets.filter((t) => t.box === b.id).length, 1);
});

test('blender shields: walls go on the fruit once it is out, never on a lock, key, box or target', () => {
  const g = createGame({ cols: 17, rows: 15, mode: ['key', 'box', 'shield'], fruitCount: 3, rng: seeded(9) });
  for (const p of [...g.keys, ...g.locks, ...g.targets]) assert.equal(p.shields, undefined);
  g.status = 'running';
  g.boxes = [{ x: 9, y: 7, id: 30 }];
  g.targets.push({ x: 10, y: 7, id: 31, box: 30 });
  g.snake = [{ x: 8, y: 7 }, { x: 7, y: 7 }, { x: 6, y: 7 }];
  g.dir = 'right';
  assert.equal(step(g), 'release');
  const f = g.foods.find((q) => q.boxed);
  assert.ok(Array.isArray(f.shields), 'the fruit got its walls when it came out');
});

// ---------- placement next to boxes and fields ----------
test('blender walls + box: walls never land in a box’s ring', async () => {
  const { spawnWall } = await import('../src/game.js');
  for (let seed = 1; seed < 15; seed++) {
    const g = createGame({ cols: 10, rows: 9, mode: ['box', 'wall'], fruitCount: 1, rng: seeded(seed) });
    for (let i = 0; i < 12; i++) spawnWall(g);
    for (const w of g.walls) for (const b of g.boxes) assert.ok(cheb(w, b) >= 2);
    for (const w of g.walls) for (const t of g.targets) assert.ok(!same(w, t));
  }
});

test('blender mines + box: fields keep off a box’s ring and its target; a box pushed onto a flag bumps', async () => {
  const { spawnMine } = await import('../src/game.js');
  for (let seed = 1; seed < 15; seed++) {
    const g = createGame({ cols: 24, rows: 21, mode: ['box', 'mines'], fruitCount: 2, rng: seeded(seed) });
    for (let i = 0; i < 4; i++) spawnMine(g);
    for (const m of g.mines) {
      for (const b of g.boxes) assert.ok(cheb(m, b) >= 3);
      for (const t of g.targets) assert.ok(cheb(m, t) >= 2);
    }
  }
  const g = blend(['box', 'mines']);
  g.boxes = [{ x: 9, y: 7, id: 30 }];
  g.targets = [{ x: 2, y: 2, id: 31, box: 30 }];
  g.mines = [{ x: 10, y: 7, id: 32 }];
  g.foods = [];
  g.snake = [{ x: 8, y: 7 }, { x: 7, y: 7 }, { x: 6, y: 7 }];
  g.dir = 'right';
  g.mineVisit = null;
  const ev = step(g);
  assert.ok(ev === 'bump' || ev === 'die', ev);
  assert.ok(!g.boxes.some((b) => same(b, { x: 10, y: 7 })), 'never on the flag');
});

test('blender mines + keys: a flag never lands on a key or lock', async () => {
  const { spawnMine } = await import('../src/game.js');
  for (let seed = 1; seed < 20; seed++) {
    const g = createGame({ cols: 17, rows: 15, mode: ['key', 'mines'], fruitCount: 5, rng: seeded(seed) });
    for (let i = 0; i < 4; i++) spawnMine(g);
    for (const m of g.mines) for (const p of [...g.keys, ...g.locks]) assert.ok(!same(m, p));
  }
});

// ---------- on-eat order ----------
test('blender twin + walls: the flip comes first, so the wall keeps off the new head’s path', () => {
  for (let seed = 1; seed < 40; seed++) {
    const g = blend(['twin', 'wall'], { rng: seeded(seed) });
    const h = g.snake[0];
    g.score = 1; // the next fruit drops a wall
    g.foods = [{ x: h.x + 1, y: h.y, id: 90 }];
    assert.equal(step(g), 'flip');
    assert.equal(g.walls.length, 1);
    const nh = g.snake[0];
    const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[g.dir];
    for (const k of [1, 2]) assert.ok(!same(g.walls[0], { x: nh.x + d[0] * k, y: nh.y + d[1] * k }));
  }
});

test('blender portal + twin: teleport, then flip (the exit ends up at the tail end)', () => {
  const g = blend(['portal', 'twin']);
  const h = g.snake[0];
  g.foods = [{ x: h.x + 1, y: h.y, id: 1, pair: 9 }, { x: 3, y: 2, id: 2, pair: 9 }];
  assert.equal(step(g), 'flip');
  assert.deepEqual(g.snake[g.snake.length - 1], { x: 3, y: 2 }, 'came out of the twin, then flipped');
  assert.equal(g.score, 1);
});

test('blender portal + twin + mines: the field lands away from the new head', () => {
  for (let seed = 1; seed < 30; seed++) {
    const g = blend(['portal', 'twin', 'mines'], { rng: seeded(seed) });
    const h = g.snake[0];
    g.foods = [{ x: h.x + 1, y: h.y, id: 1, pair: 9 }, { x: 3, y: 2, id: 2, pair: 9 }];
    step(g);
    assert.equal(g.mines.length, 1);
    assert.ok(cheb(g.mines[0], g.snake[0]) >= 3);
  }
});

test('blender twin + keys / poison: eating a key or poison never flips', () => {
  const g = blend(['twin', 'key']);
  const h = g.snake[0];
  g.keys = [{ x: h.x + 1, y: h.y, id: 70, shape: 'star' }];
  g.locks = [{ x: 1, y: 1, id: 70, shape: 'star' }];
  const tail = { ...g.snake[g.snake.length - 1] };
  assert.equal(step(g), 'unlock');
  assert.notDeepEqual(g.snake[0], tail);
  const p = blend(['twin', 'poison']);
  const ph = p.snake[0];
  p.foods = [{ x: ph.x + 1, y: ph.y, id: 5, poison: true }];
  assert.equal(step(p), 'poison');
  assert.deepEqual(p.snake[0], { x: ph.x + 1, y: ph.y });
});

// ---------- movement ----------
test('blender winged + magnet: fruit flies at Winged speed with a gentle pull', async () => {
  const { updateFlyers, WING_SPEED } = await import('../src/game.js');
  const g = createGame({ cols: 24, rows: 21, mode: ['winged', 'magnet'], fruitCount: 3, rng: seeded(2) });
  assert.ok(g.foods.every((f) => f.fly === 'both'));
  g.status = 'running';
  for (let i = 0; i < 20; i++) updateFlyers(g, 0.05);
  for (const f of g.foods) assert.ok(Math.abs(Math.hypot(f.vx, f.vy) - WING_SPEED) < 0.6);
});

test('blender shields + winged: running into a flying fruit’s wall is a death; one flying into you bounces', async () => {
  const { updateFlyers } = await import('../src/game.js');
  const g = blend(['winged', 'shield']);
  const h = g.snake[0]; // heading right
  g.foods = [{ id: 1, fly: 'winged', x: h.x + 1.15, y: h.y + 0.5, vx: 0, vy: 0, shields: ['left'] }];
  updateFlyers(g, 0.01);
  assert.equal(g.status, 'over');

  const b = blend(['winged', 'shield']);
  // Coming down onto the head from above while it moves right: the fruit hit the head, not the other way round.
  b.snake = [{ x: 8, y: 7 }, { x: 7, y: 7 }, { x: 6, y: 7 }];
  b.foods = [{ id: 1, fly: 'winged', x: 8.5, y: 6.85, vx: 0, vy: 2, shields: ['down'] }];
  updateFlyers(b, 0.05);
  assert.equal(b.status, 'running');
  assert.equal(b.foods.length, 1, 'not eaten');
  assert.ok(b.foods[0].vy < 0, 'bounced away');
});

test('blender portal + winged: catching one end takes the head out of the other on the next step', async () => {
  const { updateFlyers } = await import('../src/game.js');
  const g = blend(['portal', 'winged']);
  const h = g.snake[0];
  g.foods = [
    { id: 1, pair: 4, fly: 'winged', x: h.x + 1.1, y: h.y + 0.5, vx: 0, vy: 0 },
    { id: 2, pair: 4, fly: 'winged', x: 3.4, y: 2.6, vx: 0, vy: 0 },
  ];
  assert.equal(updateFlyers(g, 0.01).length, 1);
  assert.equal(g.score, 1);
  assert.equal(step(g), 'portal');
  assert.deepEqual(g.snake[0], { x: 3, y: 2 });
  assert.ok(!g.foods.some((f) => f.pair === 4), 'the pair is gone');
  assert.equal(g.foods.filter((f) => f.pair).length, 2, 'a new pair took its place');
});

test('blender twin + winged: a caught fruit flips the snake on the next step', async () => {
  const { updateFlyers } = await import('../src/game.js');
  const g = blend(['twin', 'winged']);
  const h = g.snake[0];
  g.foods = [{ id: 1, fly: 'winged', x: h.x + 1.1, y: h.y + 0.5, vx: 0, vy: 0 }];
  updateFlyers(g, 0.01);
  const tail = { ...g.snake[g.snake.length - 1] };
  assert.equal(step(g), 'flip');
  assert.deepEqual(g.snake[0], tail);
});

test('blender poison + winged: a caught poison fruit poisons, no point', async () => {
  const { updateFlyers } = await import('../src/game.js');
  const g = blend(['poison', 'winged']);
  const h = g.snake[0];
  g.foods = [{ id: 1, fly: 'winged', poison: true, x: h.x + 1.1, y: h.y + 0.5, vx: 0, vy: 0 }];
  updateFlyers(g, 0.01);
  assert.equal(g.score, 0);
  assert.equal(g.grow, 0);
  assert.equal(g.poison, g.snake.length);
  assert.equal(g.foods.filter((f) => f.poison).length, 1, 'replaced');
});

test('blender keys + winged: keys stay put; the fruit flies once its lock opens', () => {
  const g = blend(['key', 'winged']);
  assert.ok(g.keys.every((k) => Number.isInteger(k.x)));
  const h = g.snake[0];
  g.keys = [{ x: h.x + 1, y: h.y, id: 70, shape: 'star' }];
  g.locks = [{ x: 1, y: 1, id: 70, shape: 'star' }];
  step(g);
  const f = g.foods.find((q) => q.keyed);
  assert.equal(f.fly, 'winged');
});

// ---------- poison ----------
test('blender poison: decoys are loose single fruit, one per slot', () => {
  for (const mode of [['poison', 'key'], ['poison', 'box', 'portal'], ['poison', 'shield', 'magnet']]) {
    const g = createGame({ cols: 24, rows: 21, mode, fruitCount: 3, rng: seeded(4) });
    const decoys = g.foods.filter((f) => f.poison);
    assert.equal(decoys.length, 3, mode.join('+'));
    for (const d of decoys) assert.ok(!d.pair && !d.keyed && !d.boxed);
  }
});

test('blender poison + mines: the wander leaves a field before its 4th move in there', async () => {
  const { poisonDir } = await import('../src/game.js');
  for (let seed = 1; seed < 40; seed++) {
    const g = blend(['poison', 'mines'], { rng: seeded(seed) });
    g.foods = [];
    g.mines = [{ x: 8, y: 7, id: 60 }];
    // Head at the right edge of the field heading down, 3 moves in already.
    g.snake = [{ x: 9, y: 7 }, { x: 9, y: 6 }, { x: 9, y: 5 }];
    g.dir = 'down';
    g.mineVisit = { id: 60, n: 3 };
    g.poison = 3;
    assert.equal(poisonDir(g), 'right');
  }
});

test('blender poison + keys / portal: the wander never eats a key or goes into a portal', async () => {
  const { poisonDir } = await import('../src/game.js');
  for (let seed = 1; seed < 40; seed++) {
    const g = blend(['poison', 'key', 'portal'], { rng: seeded(seed) });
    const h = g.snake[0];
    g.locks = [{ x: 1, y: 1, id: 70, shape: 'star' }];
    g.keys = [{ x: h.x + 1, y: h.y, id: 70, shape: 'star' }];
    g.foods = [{ x: h.x, y: h.y - 1, id: 1, pair: 3 }, { x: 1, y: 13, id: 2, pair: 3 }];
    g.poison = 3;
    assert.equal(poisonDir(g), 'down');
  }
});

// ---------- chat in a blend ----------
test('blender: chat drops are bonus pieces, not slots', async () => {
  const { addBonusBox, addBonusKey, addBonusPortal, slotsInPlay } = await import('../src/game.js');
  const g = blend(['key', 'box', 'portal'], { fruitCount: 1 });
  const n = slotsInPlay(g);
  addBonusBox(g);
  addBonusKey(g);
  addBonusPortal(g);
  assert.equal(slotsInPlay(g), n);
});

test('blender: all ten modes at once start with key, lock and target per slot, and a decoy', () => {
  const g = createGame({ cols: 24, rows: 21, mode: ['wall', 'portal', 'winged', 'twin', 'magnet', 'box', 'poison', 'mines', 'key', 'shield'], fruitCount: 3, rng: seeded(1) });
  assert.equal(g.mode.split('+').length, 10);
  assert.equal(g.keys.length, 3);
  assert.equal(g.locks.length, 3);
  assert.equal(g.targets.length, 3);
  const decoys = g.foods.filter((f) => f.poison);
  assert.equal(decoys.length, 3);
  assert.ok(decoys.every((d) => d.fly === 'both'));
});
