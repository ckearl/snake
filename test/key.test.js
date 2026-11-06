import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, step, snapshot, lateTurn, resizeBoard, keepsBoardOpen, SPAWN_CLEARANCE, KEY_SHAPES,
} from '../src/game.js';

const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const seeded = (seed) => {
  let r = seed;
  return () => (r = (r * 9301 + 49297) % 233280) / 233280;
};

function running(opts) {
  const g = createGame({ cols: 10, rows: 9, rng: () => 0.5, mode: 'key', ...opts });
  g.status = 'running';
  return g;
}

// Head at (4,4) heading right; a key straight ahead, its lock up in a corner.
function keyAhead(g, lock = { x: 8, y: 1 }) {
  const h = g.snake[0];
  g.keys = [{ x: h.x + 1, y: h.y, id: 50, shape: 'star' }];
  g.locks = [{ ...lock, id: 50, shape: 'star' }];
  g.foods = [];
}

test('key mode: one key + lock per fruit count, matching shapes, no loose fruit', () => {
  for (const fruitCount of [1, 3, 5, 10]) {
    for (let seed = 1; seed < 15; seed++) {
      const g = createGame({ cols: 17, rows: 15, mode: 'key', fruitCount, rng: seeded(seed) });
      assert.equal(g.keys.length, fruitCount);
      assert.equal(g.locks.length, fruitCount);
      assert.equal(g.foods.length, 0);
      for (const k of g.keys) {
        const l = g.locks.find((q) => q.id === k.id);
        assert.ok(l, 'every key has its lock');
        assert.equal(k.shape, l.shape);
        assert.ok(KEY_SHAPES.includes(k.shape));
      }
      assert.equal(new Set(g.locks.map((l) => l.shape)).size, fruitCount, 'a different shape for every pair');
    }
  }
});

test('key mode: keys and locks spawn away from the head; a lock never walls anything off', () => {
  for (let seed = 1; seed < 40; seed++) {
    const g = createGame({ cols: 17, rows: 15, mode: 'key', fruitCount: 5, rng: seeded(seed) });
    const h = g.snake[0];
    for (const q of [...g.keys, ...g.locks]) assert.ok(cheb(q, h) >= SPAWN_CLEARANCE);
    for (const k of g.keys) assert.ok(cheb(k, g.locks.find((l) => l.id === k.id)) >= 2, 'key not touching its lock');
    assert.ok(keepsBoardOpen(g), 'every open square still reachable');
  }
});

test('key mode: eating the key opens its lock; the fruit is a separate bite', () => {
  const g = running();
  keyAhead(g);
  assert.equal(step(g), 'unlock');
  assert.equal(g.score, 0, 'a key scores nothing');
  assert.equal(g.snake.length, 3, 'and doesn’t grow you');
  assert.deepEqual(g.keys, []);
  assert.deepEqual(g.locks, []);
  assert.equal(g.foods.length, 1);
  assert.deepEqual({ x: g.foods[0].x, y: g.foods[0].y, keyed: g.foods[0].keyed }, { x: 8, y: 1, keyed: true });
});

test('key mode: eating the let-out fruit scores, grows, and lays the next key + lock', () => {
  const g = running();
  const h = g.snake[0];
  g.keys = [];
  g.locks = [];
  g.foods = [{ x: h.x + 1, y: h.y, id: 7, keyed: true }];
  assert.equal(step(g), 'eat');
  assert.equal(g.score, 1);
  assert.equal(g.snake.length, 4);
  assert.equal(g.keys.length, 1);
  assert.equal(g.locks.length, 1);
});

test('key mode: a locked square is solid', () => {
  const g = running();
  const h = g.snake[0];
  g.keys = [{ x: 0, y: 0, id: 5, shape: 'heart' }];
  g.locks = [{ x: h.x + 1, y: h.y, id: 5, shape: 'heart' }];
  assert.equal(step(g), 'die');
});

test('key mode: won once there is no room for another key and lock', () => {
  const g = running();
  const h = g.snake[0];
  g.keys = [];
  g.locks = [];
  g.foods = [{ x: h.x + 1, y: h.y, id: 7, keyed: true }];
  // Wall off every square SPAWN_CLEARANCE or more from where the head is about
  // to be (on the fruit), so there's nowhere left for a key and lock.
  const at = { x: h.x + 1, y: h.y };
  g.walls = [];
  for (let y = 0; y < g.rows; y++) {
    for (let x = 0; x < g.cols; x++) if (cheb({ x, y }, at) >= SPAWN_CLEARANCE) g.walls.push({ x, y });
  }
  assert.equal(step(g), 'win');
  assert.equal(g.status, 'won');
});

test('key mode: a late turn can’t take back a key', () => {
  const g = running();
  keyAhead(g);
  const snap = snapshot(g);
  const ev = step(g);
  assert.equal(ev, 'unlock');
  assert.equal(lateTurn(g, snap, ev, 'up'), null);
});

test('key mode: a late turn away from a key puts it (and its lock) back', () => {
  const g = running();
  const h = g.snake[0];
  g.keys = [{ x: h.x + 2, y: h.y, id: 50, shape: 'star' }];
  g.locks = [{ x: 8, y: 1, id: 50, shape: 'star' }];
  g.foods = [];
  const snap = snapshot(g);
  assert.equal(step(g), 'move');
  assert.equal(lateTurn(g, snap, 'move', 'down'), 'move');
  assert.equal(g.keys.length, 1);
  assert.equal(g.locks.length, 1);
});

test('key mode: resizing drops a key or lock that lost its partner, then tops back up', () => {
  const g = running({ cols: 24, rows: 21, fruitCount: 3, rng: seeded(9) });
  g.snake = [{ x: 12, y: 10 }, { x: 11, y: 10 }, { x: 10, y: 10 }];
  g.keys = [{ x: 13, y: 12, id: 1, shape: 'star' }, { x: 22, y: 19, id: 2, shape: 'heart' }];
  g.locks = [{ x: 10, y: 13, id: 1, shape: 'star' }, { x: 11, y: 12, id: 2, shape: 'heart' }];
  g.foods = [];
  resizeBoard(g, 10, 9);
  assert.equal(g.keys.length, 3);
  assert.equal(g.locks.length, 3);
  for (const k of g.keys) assert.ok(g.locks.some((l) => l.id === k.id));
  assert.ok(!g.keys.some((k) => k.id === 2), 'the clipped pair is gone');
});
