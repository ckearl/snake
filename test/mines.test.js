import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, step, queueTurn, spawnMine, placeFood, snapshot, lateTurn, resizeBoard, SPAWN_CLEARANCE, MINE_LIMIT,
} from '../src/game.js';

const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const seeded = (seed) => {
  let r = seed;
  return () => (r = (r * 9301 + 49297) % 233280) / 233280;
};

function running(opts) {
  const g = createGame({ cols: 17, rows: 15, rng: () => 0.5, mode: 'mines', ...opts });
  g.status = 'running';
  return g;
}

// Head at (7,7) heading right; a field with its flag at (fx, fy).
function withField(fx, fy) {
  const g = running();
  g.snake = [{ x: 7, y: 7 }, { x: 6, y: 7 }, { x: 5, y: 7 }];
  g.dir = 'right';
  g.foods = [{ x: 0, y: 0, id: 1 }];
  g.mines = [{ x: fx, y: fy, id: 77 }];
  return g;
}

test('mines mode: no fields at the start; eating a fruit lays one', () => {
  const g = running();
  assert.equal(g.mines.length, 0);
  const h = g.snake[0];
  g.foods = [{ x: h.x + 1, y: h.y, id: 1 }];
  assert.equal(step(g), 'eat');
  assert.equal(g.mines.length, 1);
  assert.equal(g.foods.length, 1, 'and the fruit is replaced as usual');
});

test('mines mode: a new field fits on the board, clear of fruit, other fields and the head', () => {
  for (let seed = 1; seed < 40; seed++) {
    const g = running({ rng: seeded(seed), fruitCount: 5 });
    for (let i = 0; i < 6; i++) spawnMine(g);
    const h = g.snake[0];
    for (const m of g.mines) {
      assert.ok(m.x >= 1 && m.y >= 1 && m.x <= g.cols - 2 && m.y <= g.rows - 2, 'whole field on the board');
      assert.ok(cheb(m, h) >= SPAWN_CLEARANCE, 'away from the head');
      assert.ok(!g.snake.some((s) => s.x === m.x && s.y === m.y), 'flag not under the snake');
      for (const f of g.foods) assert.ok(cheb(m, f) >= 2, 'no fruit in the field');
      for (const o of g.mines) if (o !== m) assert.ok(cheb(m, o) >= 3, 'fields don’t overlap');
    }
  }
});

test('mines mode: a field may lie over the snake’s body, but never its flag', () => {
  const g = running({ cols: 10, rows: 9 });
  // Body along row 4 from x=0..6, head at (6,4) heading right.
  g.snake = [];
  for (let x = 6; x >= 0; x--) g.snake.push({ x, y: 4 });
  g.foods = [];
  const spots = [];
  for (let i = 0; i < 200; i++) {
    g.rng = seeded(i + 1);
    g.mines = [];
    const m = spawnMine(g);
    if (m) spots.push(m);
  }
  assert.ok(spots.some((m) => g.snake.some((s) => cheb(m, s) <= 1)), 'some fields cover the body');
  for (const m of spots) assert.ok(!g.snake.some((s) => s.x === m.x && s.y === m.y));
});

test('mines mode: running into the flag is a death', () => {
  const g = withField(8, 7);
  assert.equal(step(g), 'die');
});

test('mines mode: dipping in and out within 3 moves clears the field', () => {
  const g = withField(9, 6); // field rows 5..7, cols 8..10; head at (7,7) going right
  assert.equal(step(g), 'move'); // (8,7) – in, 1
  assert.deepEqual(g.mineVisit, { id: 77, n: 1 });
  queueTurn(g, 'down');
  assert.equal(step(g), 'clear'); // (8,8) – out
  assert.equal(g.mines.length, 0);
  assert.deepEqual(g.cleared.map((m) => m.id), [77]);
  assert.equal(g.mineVisit, null);
  assert.equal(step(g), 'move');
  assert.deepEqual(g.cleared, [], 'only reported on the step it happened');
});

test('mines mode: straight along an edge row (3 moves) clears it', () => {
  const g = withField(9, 6); // field rows 5..7; head runs along y=7 from x=8 to 10
  for (let i = 0; i < 3; i++) assert.equal(step(g), 'move');
  assert.equal(g.mineVisit.n, 3);
  assert.equal(step(g), 'clear'); // (11,7) – out after 3
  assert.equal(g.mines.length, 0);
});

test(`mines mode: ${MINE_LIMIT} moves inside is a death`, () => {
  const g = withField(9, 6); // rows 5..7, cols 8..10
  step(g); // (8,7) 1
  step(g); // (9,7) 2 – (9,6) above is the flag, so carry on
  step(g); // (10,7) 3
  queueTurn(g, 'up');
  assert.equal(step(g), 'die'); // (10,6) 4
});

test('mines mode: the body inside a field doesn’t count, only the head', () => {
  const g = withField(9, 6);
  step(g); // head in (8,7)
  queueTurn(g, 'down');
  step(g); // head out (8,8); the body is still in the field
  assert.equal(g.mines.length, 0, 'cleared even with the body trailing through');
});

test('mines mode: fruit avoids mine fields while there is anywhere else', () => {
  const g = running({ cols: 5, rows: 5 });
  g.snake = [{ x: 0, y: 0 }];
  g.foods = [];
  g.mines = [{ x: 2, y: 2, id: 1 }];
  for (let i = 0; i < 50; i++) {
    g.rng = seeded(i + 1);
    const f = placeFood(g);
    assert.ok(cheb(f, { x: 2, y: 2 }) >= 2, JSON.stringify(f));
  }
  // Fill everything outside the field: fruit may then go in it, but never on the flag.
  g.walls = [];
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) if (cheb({ x, y }, { x: 2, y: 2 }) === 2 && (x || y)) g.walls.push({ x, y });
  const f = placeFood(g);
  assert.ok(cheb(f, { x: 2, y: 2 }) === 1);
});

test('mines mode: won once there is no room for another field', () => {
  const g = running({ cols: 10, rows: 9 });
  // Snake (4,4),(3,4),(2,4) heading right at a fruit. Walls on every even/even
  // square the snake isn't on: every 3×3 then holds a wall or has the snake on
  // its flag square.
  g.snake = [{ x: 4, y: 4 }, { x: 3, y: 4 }, { x: 2, y: 4 }];
  g.foods = [{ x: 5, y: 4, id: 1 }];
  g.walls = [];
  for (let y = 0; y < g.rows; y += 2) {
    for (let x = 0; x < g.cols; x += 2) if (!g.snake.some((c) => c.x === x && c.y === y)) g.walls.push({ x, y });
  }
  assert.equal(step(g), 'win');
  assert.equal(g.status, 'won');
});

test('mines mode: a late turn rewinds the mine count too', () => {
  const g = withField(9, 6);
  const snap = snapshot(g);
  assert.equal(step(g), 'move'); // into the field
  assert.equal(lateTurn(g, snap, 'move', 'down'), 'move'); // turned away instead
  assert.equal(g.mineVisit, null);
  assert.equal(g.mines.length, 1);
});

test('mines mode: resizing drops fields that no longer fit whole', () => {
  const g = running({ cols: 24, rows: 21 });
  g.snake = [{ x: 12, y: 10 }, { x: 11, y: 10 }, { x: 10, y: 10 }];
  g.mines = [{ x: 12, y: 13, id: 1 }, { x: 22, y: 19, id: 2 }];
  resizeBoard(g, 10, 9);
  assert.deepEqual(g.mines.map((m) => m.id), [1]);
});
