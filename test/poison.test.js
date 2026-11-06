import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, step, queueTurn, poisonDir, snapshot, lateTurn, resizeBoard, SPAWN_CLEARANCE,
} from '../src/game.js';

const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const seeded = (seed) => {
  let r = seed;
  return () => (r = (r * 9301 + 49297) % 233280) / 233280;
};

function running(opts) {
  const g = createGame({ cols: 10, rows: 9, rng: () => 0.5, mode: 'poison', ...opts });
  g.status = 'running';
  return g;
}

test('poison mode: a regular and a poison fruit per fruit count, both away from the head', () => {
  for (const fruitCount of [1, 3, 5]) {
    for (let seed = 1; seed < 20; seed++) {
      const g = createGame({ cols: 17, rows: 15, mode: 'poison', fruitCount, rng: seeded(seed) });
      assert.equal(g.foods.filter((f) => !f.poison).length, fruitCount);
      assert.equal(g.foods.filter((f) => f.poison).length, fruitCount);
      for (const f of g.foods) assert.ok(cheb(f, g.snake[0]) >= SPAWN_CLEARANCE);
    }
  }
});

test('poison mode: regular fruit grows and scores as usual, and is replaced by a regular one', () => {
  const g = running();
  const h = g.snake[0];
  g.foods = [{ x: h.x + 1, y: h.y, id: 50 }, { x: 0, y: 0, id: 51, poison: true }];
  assert.equal(step(g), 'eat');
  assert.equal(g.score, 1);
  assert.equal(g.snake.length, 4);
  assert.equal(g.poison, 0);
  assert.equal(g.foods.filter((f) => !f.poison).length, 1);
  assert.equal(g.foods.filter((f) => f.poison).length, 1);
});

test('poison mode: poison takes over for as many moves as the snake is long, then hands back', () => {
  const g = running({ rng: seeded(7) });
  const h = g.snake[0];
  g.foods = [{ x: h.x + 1, y: h.y, id: 50, poison: true }, { x: 0, y: 8, id: 51 }];
  assert.equal(step(g), 'poison');
  assert.equal(g.score, 0, 'no point');
  assert.equal(g.snake.length, 3, 'no growth');
  assert.equal(g.poison, 3);
  assert.equal(g.foods.filter((f) => f.poison).length, 1, 'a new poison fruit');

  queueTurn(g, 'up');
  assert.deepEqual(g.turnQueue, [], 'input ignored while poisoned');
  for (let i = 3; i > 0; i--) {
    assert.equal(g.poison, i);
    assert.notEqual(step(g), 'die');
  }
  assert.equal(g.poison, 0);
  const dir = g.dir;
  const turn = dir === 'up' || dir === 'down' ? 'left' : 'up';
  queueTurn(g, turn);
  assert.deepEqual(g.turnQueue, [turn], 'control is back');
});

test('poison mode: the wander goes straight about half the time and turns either way a quarter', () => {
  const counts = { straight: 0, left: 0, right: 0 };
  const rng = seeded(3);
  for (let i = 0; i < 4000; i++) {
    const g = createGame({ cols: 24, rows: 21, mode: 'poison', rng });
    g.poison = 5;
    const dir = poisonDir(g); // heading right on an open board
    counts[dir === 'right' ? 'straight' : dir === 'up' ? 'left' : 'right']++;
  }
  assert.ok(Math.abs(counts.straight / 4000 - 0.5) < 0.04, JSON.stringify(counts));
  assert.ok(Math.abs(counts.left / 4000 - 0.25) < 0.04, JSON.stringify(counts));
  assert.ok(Math.abs(counts.right / 4000 - 0.25) < 0.04, JSON.stringify(counts));
});

test('poison mode: the wander never runs into a wall or itself', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const g = running({ rng: seeded(seed), cols: 10, rows: 9 });
    // A long snake snaking down the left half of a small board.
    g.snake = [];
    for (let x = 4; x >= 0; x--) g.snake.push({ x, y: 0 });
    for (let x = 0; x <= 4; x++) g.snake.push({ x, y: 1 });
    for (let x = 4; x >= 0; x--) g.snake.push({ x, y: 2 });
    g.snake.unshift({ x: 5, y: 0 });
    g.dir = 'right';
    g.foods = [];
    g.walls = [{ x: 7, y: 5 }, { x: 8, y: 5 }];
    g.poison = 200;
    for (let i = 0; i < 200; i++) {
      const ev = step(g);
      assert.notEqual(ev, 'die', `seed ${seed}, move ${i}`);
    }
  }
});

test('poison mode: steps over poison fruit only when there is no other way', () => {
  const g = running();
  g.snake = [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }];
  g.dir = 'up';
  g.poison = 3;
  // Only way out of the corner is right, onto a poison fruit.
  g.foods = [{ x: 1, y: 0, id: 9, poison: true }];
  assert.equal(poisonDir(g), 'right');
  // With another poison fruit somewhere safe instead, it still avoids the poison.
  const o = running();
  o.poison = 3;
  const h = o.snake[0];
  o.foods = [{ x: h.x + 1, y: h.y, id: 9, poison: true }];
  for (let i = 0; i < 50; i++) assert.notEqual(poisonDir(o), 'right');
});

test('poison mode: a late turn can’t undo a poisoned move', () => {
  const g = running();
  g.foods = [];
  g.poison = 3;
  const snap = snapshot(g);
  const ev = step(g);
  assert.equal(lateTurn(g, snap, ev, 'up'), null);
});

test('poison mode: won once there is no room for the next fruit', () => {
  const g = running();
  const h = g.snake[0];
  g.foods = [{ x: h.x + 1, y: h.y, id: 50 }];
  // Wall off everything far from the head.
  g.walls = [];
  for (let y = 0; y < g.rows; y++) {
    for (let x = 0; x < g.cols; x++) {
      if (cheb({ x, y }, h) >= SPAWN_CLEARANCE - 1) g.walls.push({ x, y });
    }
  }
  assert.equal(step(g), 'win');
});

test('poison mode: resizing tops both kinds back up', () => {
  const g = running({ cols: 24, rows: 21, fruitCount: 3, rng: seeded(5) });
  resizeBoard(g, 10, 9);
  assert.equal(g.foods.filter((f) => !f.poison).length, 3);
  assert.equal(g.foods.filter((f) => f.poison).length, 3);
});
