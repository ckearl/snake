import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, queueTurn, step, placeFood, BOARD_SIZES, snapshot, lateTurn } from '../src/game.js';

const at = (list, p) => list.some((s) => s.x === p.x && s.y === p.y);

const fixedRng = () => 0;

function running(opts) {
  const g = createGame({ rng: fixedRng, ...opts });
  g.status = 'running';
  return g;
}

test('board sizes match spec', () => {
  assert.deepEqual(
    Object.values(BOARD_SIZES).map(({ cols, rows }) => [cols, rows]),
    [[10, 9], [17, 15], [24, 21]],
  );
});

test('snake starts length 3 inside every board, food not on snake', () => {
  for (const { cols, rows } of Object.values(BOARD_SIZES)) {
    const g = createGame({ cols, rows });
    assert.equal(g.snake.length, 3);
    for (const s of g.snake) {
      assert.ok(s.x >= 0 && s.x < cols && s.y >= 0 && s.y < rows);
    }
    assert.equal(g.foods.length, 1);
    assert.ok(!at(g.snake, g.foods[0]));
  }
});

test('moves one cell per step and keeps length', () => {
  const g = running({ cols: 9, rows: 10 });
  g.foods = [{ x: 0, y: 0 }];
  const head = { ...g.snake[0] };
  assert.equal(step(g), 'move');
  assert.deepEqual(g.snake[0], { x: head.x + 1, y: head.y });
  assert.equal(g.snake.length, 3);
});

test('cannot reverse directly, but quick double-turn works', () => {
  const g = running({ cols: 9, rows: 10 });
  g.foods = [{ x: 0, y: 0 }];
  queueTurn(g, 'left'); // reverse — ignored
  assert.deepEqual(g.turnQueue, []);
  queueTurn(g, 'up');
  queueTurn(g, 'left');
  assert.deepEqual(g.turnQueue, ['up', 'left']);
  const { x, y } = g.snake[0];
  step(g);
  step(g);
  assert.deepEqual(g.snake[0], { x: x - 1, y: y - 1 });
  assert.equal(g.status, 'running');
});

test('eating grows the snake and scores', () => {
  const g = running({ cols: 9, rows: 10 });
  const h = g.snake[0];
  g.foods = [{ x: h.x + 1, y: h.y }];
  assert.equal(step(g), 'eat');
  assert.equal(g.snake.length, 4);
  assert.equal(g.score, 1);
  assert.equal(g.foods.length, 1);
  assert.ok(!at(g.snake, g.foods[0]));
});

test('hitting a wall ends the game', () => {
  const g = running({ cols: 9, rows: 10 });
  g.foods = [{ x: 0, y: 0 }];
  let ev;
  for (let i = 0; i < 20 && g.status === 'running'; i++) ev = step(g);
  assert.equal(ev, 'die');
  assert.equal(g.status, 'over');
});

test('hitting own body ends the game', () => {
  const g = running({ cols: 9, rows: 10 });
  g.foods = [{ x: 0, y: 0 }];
  g.snake = [
    { x: 4, y: 4 }, { x: 3, y: 4 }, { x: 3, y: 5 }, { x: 4, y: 5 }, { x: 5, y: 5 },
  ];
  g.dir = 'right';
  queueTurn(g, 'down'); // into (4,5), which is body
  assert.equal(step(g), 'die');
});

test('moving into the tail cell is allowed (tail moves away)', () => {
  const g = running({ cols: 9, rows: 10 });
  g.foods = [{ x: 0, y: 0 }];
  g.snake = [{ x: 4, y: 4 }, { x: 5, y: 4 }, { x: 5, y: 5 }, { x: 4, y: 5 }];
  g.dir = 'left';
  queueTurn(g, 'down'); // into (4,5) — the tail
  assert.equal(step(g), 'move');
});

test('filling the board wins', () => {
  const g = running({ cols: 3, rows: 1 });
  g.snake = [{ x: 1, y: 0 }, { x: 0, y: 0 }];
  g.foods = [{ x: 2, y: 0 }];
  assert.equal(step(g), 'win');
  assert.equal(g.status, 'won');
  assert.equal(placeFood(g), null);
});

test('fixed fruit counts keep that many fruits out, all on free cells', () => {
  for (const n of [1, 3, 5, 10]) {
    const g = createGame({ cols: 9, rows: 10, fruitCount: n });
    assert.equal(g.foods.length, n);
    const keys = new Set(g.foods.map((f) => `${f.x},${f.y}`));
    assert.equal(keys.size, n, 'no duplicate fruit cells');
    for (const f of g.foods) assert.ok(!at(g.snake, f));
  }
});

test('eating with a fixed count replaces the fruit', () => {
  const g = running({ cols: 9, rows: 10, fruitCount: 3 });
  const h = g.snake[0];
  g.foods = [{ x: h.x + 1, y: h.y }, { x: 0, y: 0 }, { x: 0, y: 9 }];
  assert.equal(step(g), 'eat');
  assert.equal(g.foods.length, 3);
});

test('random count drops a 1–10 batch and only refills when all are eaten', () => {
  let r = 0.99; // -> batch of 10
  const g = createGame({ cols: 15, rows: 17, fruitCount: 'random', rng: () => r });
  assert.equal(g.foods.length, 10);

  g.status = 'running';
  const h = g.snake[0];
  g.foods = [{ x: h.x + 1, y: h.y }, { x: 0, y: 0 }];
  assert.equal(step(g), 'eat');
  assert.deepEqual(g.foods, [{ x: 0, y: 0 }], 'no refill while some remain');

  r = 0; // -> next batch of 1
  g.foods = [{ x: g.snake[0].x + 1, y: g.snake[0].y }];
  assert.equal(step(g), 'eat');
  assert.equal(g.foods.length, 1, 'new batch after the last one is eaten');
});

test('fruit count is capped by free space', () => {
  // 4×1 board, snake fills 3 cells -> only 1 cell left for fruit.
  const g = createGame({ cols: 4, rows: 1, fruitCount: 10 });
  assert.equal(g.snake.length, 3);
  assert.deepEqual(g.foods.map(({ x, y }) => ({ x, y })), [{ x: 3, y: 0 }]);
});

// ---------- hopeful turning ----------
test('late turn: redoes a straight move as a turn', () => {
  const g = running({ cols: 10, rows: 9 });
  g.foods = [{ x: 0, y: 0 }];
  const h = { ...g.snake[0] };
  const snap = snapshot(g);
  const ev = step(g); // went straight (right)
  assert.equal(ev, 'move');
  assert.deepEqual(g.snake[0], { x: h.x + 1, y: h.y });
  assert.equal(lateTurn(g, snap, ev, 'up'), 'move');
  assert.deepEqual(g.snake[0], { x: h.x, y: h.y - 1 }, 'turned where intended');
  assert.equal(g.dir, 'up');
  assert.equal(g.snake.length, 3);
});

test('late turn: not allowed after eating, reversing, or a queued turn', () => {
  const g = running({ cols: 10, rows: 9 });
  const h = g.snake[0];
  g.foods = [{ x: h.x + 1, y: h.y }];
  let snap = snapshot(g);
  let ev = step(g);
  assert.equal(ev, 'eat');
  assert.equal(lateTurn(g, snap, ev, 'up'), null, 'ate a fruit');

  snap = snapshot(g);
  ev = step(g);
  assert.equal(lateTurn(g, snap, ev, 'left'), null, 'reverse');
  assert.equal(lateTurn(g, snap, ev, 'right'), null, 'same direction');

  queueTurn(g, 'down');
  snap = snapshot(g);
  ev = step(g);
  assert.equal(lateTurn(g, snap, ev, 'left'), null, 'move already used a queued turn');
});

test('late turn: the snapshot is not consumed (copy restored)', () => {
  const g = running({ cols: 10, rows: 9 });
  g.foods = [{ x: 0, y: 0 }];
  const snap = snapshot(g);
  const ev = step(g);
  lateTurn(g, snap, ev, 'up');
  g.snake[0].x = 99; // mutate live state
  assert.notEqual(snap.snake[0].x, 99);
});
