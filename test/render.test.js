import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpolateSnake } from '../src/render.js';
import { createGame, step } from '../src/game.js';

const len = (pts) => pts.slice(1).reduce((L, p, i) => L + Math.abs(p.x - pts[i].x) + Math.abs(p.y - pts[i].y), 0);
const copy = (s) => s.map((q) => ({ ...q }));

test('interpolated snake keeps a constant length while gliding', () => {
  const g = createGame({ cols: 15, rows: 17, rng: () => 0.999 });
  g.status = 'running';
  const prev = copy(g.snake);
  step(g);
  for (const a of [0, 0.25, 0.5, 0.75, 0.999]) {
    assert.ok(Math.abs(len(interpolateSnake(g.snake, prev, a)) - (g.snake.length - 1)) < 1e-9, `alpha ${a}`);
  }
});

test('no jump across a tick: end of one move matches start of the next', () => {
  const g = createGame({ cols: 15, rows: 17, rng: () => 0.999 });
  g.status = 'running';
  let prev = copy(g.snake);
  step(g);
  const before = interpolateSnake(g.snake, prev, 1);
  prev = copy(g.snake);
  step(g);
  const after = interpolateSnake(g.snake, prev, 0);
  // Same head and tail positions on both sides of the tick.
  assert.deepEqual(after[0], before[0]);
  assert.deepEqual(after[after.length - 1], before[before.length - 1]);
});

test('when growing, the tail holds still', () => {
  const g = createGame({ cols: 15, rows: 17 });
  g.status = 'running';
  const h = g.snake[0];
  g.foods = [{ x: h.x + 1, y: h.y }];
  const prev = copy(g.snake);
  assert.equal(step(g), 'eat');
  const tail = (a) => interpolateSnake(g.snake, prev, a).at(-1);
  assert.deepEqual(tail(0), tail(0.9));
});

test('portal: the head keeps moving through the teleport tick (no pause)', () => {
  const g = createGame({ cols: 15, rows: 17, mode: 'portal' });
  g.status = 'running';
  const h = g.snake[0];
  g.foods = [{ x: h.x + 1, y: h.y, pair: 1 }, { x: 2, y: 2, pair: 1 }];
  const prev = copy(g.snake);
  assert.equal(step(g), 'portal');
  const S = copy(g.snake);
  const jumps = g.jumps.map((j) => ({ ...j }));
  const at = (a) => interpolateSnake(S, prev, a, jumps);
  // Head slides from the old head cell into the entry fruit across the tick.
  assert.deepEqual(at(0)[0], { x: h.x + 0.5, y: h.y + 0.5 });
  assert.deepEqual(at(0.5)[0], { x: h.x + 1, y: h.y + 0.5 });
  // Visible length stays constant through the tick (it just grew by one, so the tail holds).
  const visible = (pts) => pts.reduce((L, p, i) => (i && p && pts[i - 1] ? L + Math.abs(p.x - pts[i - 1].x) + Math.abs(p.y - pts[i - 1].y) : L), 0);
  for (const a of [0, 0.3, 0.7]) assert.ok(Math.abs(visible(at(a)) - (prev.length - 1 + a)) < 1e-9, `alpha ${a}: ${visible(at(a))}`);
  // The next tick starts the head at the exit fruit and keeps going.
  step(g);
  assert.deepEqual(interpolateSnake(g.snake, S, 0, g.jumps)[0], { x: 2.5, y: 2.5 });
});
