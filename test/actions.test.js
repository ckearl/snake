import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, step, spawnWall, addBonusFlyer, resizeBoard, updateFlyers, keepsBoardOpen,
} from '../src/game.js';

function running(opts) {
  const g = createGame({ cols: 17, rows: 15, rng: () => 0.37, ...opts });
  g.status = 'running';
  return g;
}

test('!wall: a wall can be added in any mode', () => {
  for (const mode of ['classic', 'portal', 'winged', 'yinyang']) {
    const g = running({ mode });
    assert.ok(spawnWall(g), mode);
    assert.equal(g.walls.length, 1);
    assert.ok(keepsBoardOpen(g));
  }
});

test('!fly: a bonus winged fruit flies in classic mode and is not replaced once eaten', () => {
  const g = running({ mode: 'classic' });
  assert.equal(g.foods.length, 1);
  const f = addBonusFlyer(g);
  assert.equal(f.fly, 'winged');
  assert.equal(f.bonus, true);
  assert.equal(g.foods.length, 2);
  // Park it on the head and let it be caught.
  const h = g.snake[0];
  f.x = h.x + 0.5;
  f.y = h.y + 0.5;
  f.vx = f.vy = 0;
  const eaten = updateFlyers(g, 0.01);
  assert.deepEqual(eaten, [f]);
  assert.equal(g.score, 1);
  assert.equal(g.foods.length, 1, 'bonus not replaced; the regular fruit is still there');
  assert.ok(!g.foods[0].fly, 'the regular fruit is still a grid fruit');
});

test('!fly: regular grid fruits are still eaten by stepping onto them', () => {
  const g = running({ mode: 'classic' });
  addBonusFlyer(g);
  const h = g.snake[0];
  const grid = g.foods.find((f) => !f.fly);
  grid.x = h.x + 1;
  grid.y = h.y;
  assert.equal(step(g), 'eat');
});

test('!size shrink: new board is centred on the head; clipped parts are lost', () => {
  const g = running({ cols: 24, rows: 21 });
  // Long snake heading right along row 3, tail trailing off to the left.
  g.snake = Array.from({ length: 12 }, (_, i) => ({ x: 20 - i, y: 3 }));
  g.foods = [{ id: 1, x: 22, y: 3 }, { id: 2, x: 0, y: 20 }];
  g.walls = [{ x: 21, y: 4 }, { x: 0, y: 0 }];
  resizeBoard(g, 10, 9);
  assert.equal(g.cols, 10);
  assert.equal(g.rows, 9);
  assert.deepEqual(g.snake[0], { x: 5, y: 4 }, 'head at the centre');
  assert.equal(g.snake.length, 6, 'body cut off at the left edge');
  for (const c of [...g.snake, ...g.walls]) assert.ok(c.x >= 0 && c.x < 10 && c.y >= 0 && c.y < 9);
  assert.deepEqual(g.walls, [{ x: 6, y: 5 }], 'nearby wall kept, far one lost');
  assert.equal(g.foods.length, 1, 'fruit count topped back up');
});

test('!size grow: everything is kept, centred in the bigger board', () => {
  const g = running({ cols: 10, rows: 9 });
  const before = g.snake.map((c) => ({ ...c }));
  g.walls = [{ x: 0, y: 0 }];
  resizeBoard(g, 24, 21);
  const ox = Math.floor((24 - 10) / 2);
  const oy = Math.floor((21 - 9) / 2);
  assert.deepEqual(g.snake, before.map((c) => ({ x: c.x + ox, y: c.y + oy })));
  assert.deepEqual(g.walls, [{ x: ox, y: oy }]);
});

test('!size: portal pairs lose both ends if one is clipped', () => {
  const g = running({ cols: 24, rows: 21, mode: 'portal' });
  g.snake = [{ x: 12, y: 10 }, { x: 11, y: 10 }];
  g.foods = [{ id: 1, x: 13, y: 10, pair: 5 }, { id: 2, x: 0, y: 0, pair: 5 }];
  resizeBoard(g, 10, 9);
  assert.ok(!g.foods.some((f) => f.pair === 5));
  assert.equal(g.foods.length, 2, 'a fresh pair was added');
});

test('!size: the game keeps running normally afterwards', () => {
  const g = running({ cols: 17, rows: 15 });
  resizeBoard(g, 10, 9);
  g.foods = [];
  assert.equal(step(g), 'move');
  assert.equal(g.status, 'running');
});
