import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, step, queueTurn, placeBox, spawnPuzzle, snapshot, lateTurn, resizeBoard, SPAWN_CLEARANCE,
} from '../src/game.js';

const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

function running(opts) {
  const g = createGame({ cols: 10, rows: 9, rng: () => 0.5, mode: 'box', ...opts });
  g.status = 'running';
  return g;
}

// Snake on row 4 heading right, head at (4,4); put a box right in front of it.
function boxAhead(g, target = { x: 9, y: 0 }) {
  const h = g.snake[0];
  g.boxes = [{ x: h.x + 1, y: h.y, id: 100 }];
  g.targets = [{ ...target, id: 101 }];
  g.foods = [];
  return g.boxes[0];
}

test('box mode: starts with one box and one target, no loose fruit, whatever the fruit count', () => {
  for (const fruitCount of [1, 5, 'random']) {
    const g = createGame({ cols: 17, rows: 15, mode: 'box', fruitCount });
    assert.equal(g.boxes.length, 1);
    assert.equal(g.targets.length, 1);
    assert.equal(g.foods.length, 0);
  }
});

test('box mode: a new box sits off the edge, clear all round, and away from the head', () => {
  for (let seed = 0; seed < 40; seed++) {
    let r = seed / 40;
    const g = createGame({ cols: 17, rows: 15, mode: 'box', rng: () => (r = (r * 9301 + 0.49297) % 1) });
    const [b] = g.boxes;
    const [t] = g.targets;
    assert.ok(b.x >= 1 && b.y >= 1 && b.x <= 15 && b.y <= 13);
    assert.ok(cheb(b, g.snake[0]) >= SPAWN_CLEARANCE);
    for (const s of g.snake) assert.ok(cheb(b, s) >= 2, 'nothing in the ring around the box');
    assert.ok(cheb(b, t) >= 2, 'target not touching the box');
  }
});

test('box mode: walking into the box pushes it one square on', () => {
  const g = running();
  const b = boxAhead(g);
  const h = { ...g.snake[0] };
  assert.equal(step(g), 'push');
  assert.deepEqual(g.snake[0], { x: h.x + 1, y: h.y }, 'head takes the box’s old square');
  assert.deepEqual({ x: b.x, y: b.y }, { x: h.x + 2, y: h.y });
  assert.equal(g.pushing, true);
  assert.equal(g.snake.length, 3);
  assert.equal(step(g), 'push');
  queueTurn(g, 'up');
  assert.equal(step(g), 'move');
  assert.equal(g.pushing, false);
});

test('box mode: pushing the box onto the target releases the fruit; eating it is a separate step', () => {
  const g = running();
  const h = g.snake[0];
  boxAhead(g, { x: h.x + 2, y: h.y });
  assert.equal(step(g), 'release');
  assert.equal(g.boxes.length, 0);
  assert.equal(g.targets.length, 0);
  assert.equal(g.foods.length, 1);
  assert.deepEqual({ x: g.foods[0].x, y: g.foods[0].y }, { x: 6, y: 4 });
  assert.equal(g.score, 0, 'releasing does not score');

  // You can walk away and leave the fruit for later…
  queueTurn(g, 'up');
  assert.equal(step(g), 'move');
  assert.equal(g.foods.length, 1);
  queueTurn(g, 'right');
  step(g);
  queueTurn(g, 'down');
  assert.equal(step(g), 'eat'); // …or come back and eat it
  assert.equal(g.score, 1);
  assert.equal(g.snake.length, 4);
  assert.equal(g.boxes.length, 1, 'a new box and target come once it’s eaten');
  assert.equal(g.targets.length, 1);
});

test('box mode: pushing the box into the edge or a wall respawns just the box', () => {
  const g = running();
  // Box on the last column: the next push goes off the board.
  g.snake = [{ x: 8, y: 4 }, { x: 7, y: 4 }, { x: 6, y: 4 }];
  g.boxes = [{ x: 9, y: 4, id: 100 }];
  g.targets = [{ x: 0, y: 0, id: 101 }];
  g.foods = [];
  assert.equal(step(g), 'bump');
  assert.deepEqual(g.snake[0], { x: 9, y: 4 });
  assert.equal(g.boxes.length, 1);
  assert.notEqual(g.boxes[0].id, 100);
  assert.ok(cheb(g.boxes[0], g.snake[0]) >= SPAWN_CLEARANCE);
  assert.deepEqual(g.targets, [{ x: 0, y: 0, id: 101 }], 'target stays put');

  const w = running();
  const b = boxAhead(w);
  w.walls = [{ x: b.x + 1, y: b.y }];
  assert.equal(step(w), 'bump');
  assert.equal(w.status, 'running');
});

test('box mode: pushing the box into the snake is a death', () => {
  const g = running();
  // Head (4,4) going up; body loops so (4,2) is part of the snake.
  g.snake = [
    { x: 4, y: 4 }, { x: 5, y: 4 }, { x: 5, y: 3 }, { x: 5, y: 2 }, { x: 4, y: 2 }, { x: 3, y: 2 }, { x: 2, y: 2 },
  ];
  g.dir = 'up';
  g.boxes = [{ x: 4, y: 3, id: 100 }];
  g.foods = [];
  assert.equal(step(g), 'die');
  assert.equal(g.status, 'over');
});

test('box mode: the tail moving out of the way is not a death', () => {
  const g = running();
  g.snake = [{ x: 4, y: 4 }, { x: 4, y: 5 }, { x: 3, y: 5 }, { x: 2, y: 5 }, { x: 2, y: 4 }];
  g.dir = 'left';
  g.boxes = [{ x: 3, y: 4, id: 100 }];
  g.foods = [];
  // Box goes to (2,4), which the tail leaves this tick.
  assert.equal(step(g), 'push');
});

test('box mode: won once there is no room for another box and target', () => {
  const g = running({ cols: 5, rows: 5 });
  // Fill the board so no square has a clear ring around it.
  g.snake = [];
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) if (!(x === 2 && y === 2)) g.snake.push({ x, y });
  }
  g.boxes = [];
  g.targets = [];
  assert.equal(placeBox(g), null);
  assert.equal(spawnPuzzle(g), false);

  // Eating the last released fruit with no room left: a win.
  const w = running();
  const h = w.snake[0];
  w.boxes = [];
  w.targets = [];
  w.foods = [{ x: h.x + 1, y: h.y, boxed: true }];
  w.walls = [];
  for (let y = 0; y < w.rows; y++) {
    for (let x = 0; x < w.cols; x++) {
      if (y === h.y || (x === 0 && y === 0)) continue;
      w.walls.push({ x, y });
    }
  }
  assert.equal(step(w), 'win');
  assert.equal(w.status, 'won');
});

test('box mode: a late turn can undo a push', () => {
  const g = running();
  const b = boxAhead(g);
  const start = { x: b.x, y: b.y };
  const snap = snapshot(g);
  assert.equal(step(g), 'push');
  assert.equal(lateTurn(g, snap, 'push', 'up'), 'move');
  assert.deepEqual({ x: g.boxes[0].x, y: g.boxes[0].y }, start, 'box back where it was');
  assert.equal(g.pushing, false);
});

test('box mode: resizing keeps a box and target on the board', () => {
  const g = running({ cols: 24, rows: 21 });
  g.boxes = [{ x: 22, y: 19, id: 100 }];
  g.targets = [{ x: 1, y: 1, id: 101 }];
  resizeBoard(g, 10, 9);
  assert.equal(g.boxes.length, 1);
  assert.equal(g.targets.length, 1);
  assert.equal(g.foods.length, 0, 'no stray fruit topped up');
});
