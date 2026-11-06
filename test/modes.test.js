import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, step, queueTurn, spawnWall, placeFood, keepsBoardOpen, redirectExit, updateFlyers, FRUIT_RADIUS,
  MAGNET_SPEED,
} from '../src/game.js';

const at = (list, p) => list.some((s) => s.x === p.x && s.y === p.y);

function running(opts) {
  const g = createGame({ cols: 10, rows: 9, rng: () => 0, ...opts });
  g.status = 'running';
  return g;
}

// ---------- wall ----------
test('wall mode: a wall appears after every 2nd fruit, on a free square', () => {
  const g = running({ mode: 'wall' });
  const eatAhead = () => {
    const h = g.snake[0];
    g.foods = [{ x: h.x + 1, y: h.y }];
    assert.equal(step(g), 'eat');
  };
  eatAhead();
  assert.equal(g.walls.length, 0, 'no wall after 1 fruit');
  eatAhead();
  assert.equal(g.walls.length, 1, 'wall after 2 fruits');
  const w = g.walls[0];
  assert.ok(!at(g.snake, w) && !at(g.foods, w));
});

test('wall mode: never drops a wall on the two squares straight ahead', () => {
  for (let seed = 0; seed < 50; seed++) {
    let r = seed / 50;
    const g = running({ mode: 'wall', rng: () => (r = (r * 9301 + 0.49297) % 1) });
    const h = g.snake[0];
    for (let i = 0; i < 20; i++) spawnWall(g);
    assert.ok(!at(g.walls, { x: h.x + 1, y: h.y }));
    assert.ok(!at(g.walls, { x: h.x + 2, y: h.y }));
  }
});

test('wall mode: running into a wall kills the snake', () => {
  const g = running({ mode: 'wall' });
  const h = g.snake[0];
  g.foods = [{ x: 0, y: 0 }];
  g.walls = [{ x: h.x + 1, y: h.y }];
  assert.equal(step(g), 'die');
});

test('walls block fruit spawns', () => {
  const g = createGame({ cols: 5, rows: 1, mode: 'wall' }); // snake on x=0..2
  g.foods = [];
  g.walls = [{ x: 3, y: 0 }];
  assert.deepEqual(placeFood(g), { x: 4, y: 0 }, 'only the non-wall square is offered');
  g.walls.push({ x: 4, y: 0 });
  assert.equal(placeFood(g), null);
});

test('wall mode: walls never box anything in, even when packed', () => {
  // Keep dropping walls until no legal square is left; the board must stay
  // one connected region with no dead-end squares the whole time.
  for (const [cols, rows] of [[10, 9], [17, 15]]) {
    let r = 0.123;
    const g = running({ mode: 'wall', cols, rows, rng: () => (r = (r * 9301 + 0.49297) % 1) });
    g.foods = [];
    while (spawnWall(g)) {
      assert.ok(keepsBoardOpen(g), `board stayed open with ${g.walls.length} walls`);
    }
    assert.ok(g.walls.length > 5, 'still managed to place a good number of walls');
  }
});

test('wall mode: refuses a square that would cut off a corner', () => {
  const g = running({ mode: 'wall' });
  g.walls = [];
  // (1,0) would leave corner (0,0) with only one open neighbour.
  assert.equal(keepsBoardOpen(g, { x: 1, y: 0 }), false);
  // Splitting the board in two isn't allowed either.
  g.walls = Array.from({ length: 8 }, (_, y) => ({ x: 5, y }));
  assert.equal(keepsBoardOpen(g, { x: 5, y: 8 }), false);
});

test('wall mode: walls count toward the win (fewer fruits needed)', () => {
  // 5×1 board: snake fills 3, a wall fills 1 — eating the last fruit wins.
  const g = createGame({ cols: 5, rows: 1, mode: 'wall' });
  g.status = 'running';
  g.walls = [{ x: 4, y: 0 }];
  g.foods = [{ x: 3, y: 0 }];
  assert.equal(step(g), 'win');
});

test('wall mode: a wall taking the last open square wins instead of getting stuck', () => {
  // 3×3 board, snake 7 long; eating the 2nd fruit drops a wall. Whether the
  // wall fits or not, the game must end in a win or leave a fruit to eat.
  const g = createGame({ cols: 3, rows: 3, mode: 'wall' });
  g.status = 'running';
  g.snake = [{ x: 1, y: 1 }, { x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }];
  g.dir = 'down';
  g.score = 1;
  g.foods = [{ x: 1, y: 2 }];
  const ev = step(g);
  assert.ok(ev === 'win' || g.foods.length > 0, `got ${ev} with ${g.foods.length} fruits`);
});

// ---------- portal ----------
test('portal mode: fruits spawn in matched pairs', () => {
  const g = createGame({ cols: 17, rows: 15, mode: 'portal', fruitCount: 3 });
  assert.equal(g.foods.length, 6);
  const pairs = new Map();
  for (const f of g.foods) pairs.set(f.pair, (pairs.get(f.pair) ?? 0) + 1);
  assert.equal(pairs.size, 3);
  for (const n of pairs.values()) assert.equal(n, 2);
});

test('portal mode: eating one end pops the head out of its twin', () => {
  const g = running({ mode: 'portal' });
  const h = g.snake[0];
  const entry = { x: h.x + 1, y: h.y, pair: 9 };
  const exit = { x: 1, y: 1, pair: 9 };
  g.foods = [entry, exit];
  assert.equal(step(g), 'portal');
  assert.deepEqual(g.snake[0], { x: 1, y: 1 });
  assert.equal(g.snake.length, 4, 'grew by one');
  assert.equal(g.score, 1, 'a pair counts once');
  assert.ok(!g.foods.some((f) => f.pair === 9), 'both ends consumed');
  assert.equal(g.foods.length, 2, 'a fresh pair replaced it');
  assert.equal(g.jumps.length, 1);
});

test('portal mode: the portal closes once the tail has passed through', () => {
  const g = running({ mode: 'portal', cols: 17, rows: 15 });
  const h = g.snake[0];
  g.foods = [{ x: h.x + 1, y: h.y, pair: 9 }, { x: 2, y: 2, pair: 9 }];
  step(g); // head now at (2,2) heading right
  g.foods = [{ x: 0, y: 14, pair: 10 }, { x: 16, y: 14, pair: 10 }]; // out of the way
  let open = 0;
  while (g.jumps.length && open < 20) { step(g); open++; }
  // Length 4: the body needs ~4 ticks to pass, +1 lingering tick for the tail animation.
  assert.ok(open >= 3 && open <= 6, `closed after ${open} ticks`);
  assert.equal(g.status, 'running');
});

test('classic mode: any body segment is solid', () => {
  const g = running({ mode: 'classic' });
  g.snake = [{ x: 5, y: 4 }, { x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 4 }, { x: 6, y: 3 }, { x: 5, y: 3 }, { x: 4, y: 3 }];
  g.dir = 'left';
  g.foods = [{ x: 0, y: 0 }];
  queueTurn(g, 'up');
  assert.equal(step(g), 'die');
});

test('portal mode: a turn pressed while going in steers the way out', () => {
  const g = running({ mode: 'portal', cols: 17, rows: 15 });
  g.dir = 'down';
  g.snake = [{ x: 4, y: 4 }, { x: 4, y: 3 }, { x: 4, y: 2 }];
  g.foods = [{ x: 4, y: 5, pair: 7 }, { x: 10, y: 8, pair: 7 }];
  assert.equal(step(g), 'portal'); // head now at the exit (10,8)
  queueTurn(g, 'right');
  step(g);
  assert.deepEqual(g.snake[0], { x: 11, y: 8 }, 'came out heading right');
});

test('portal mode: grace turn re-aims the first move out of the exit', () => {
  const g = running({ mode: 'portal', cols: 17, rows: 15 });
  g.dir = 'down';
  g.snake = [{ x: 4, y: 4 }, { x: 4, y: 3 }, { x: 4, y: 2 }];
  g.foods = [{ x: 4, y: 5, pair: 7 }, { x: 10, y: 8, pair: 7 }];
  step(g); // into the portal
  step(g); // out of the exit, still heading down
  assert.deepEqual(g.snake[0], { x: 10, y: 9 });
  assert.equal(redirectExit(g, 'right'), true);
  assert.deepEqual(g.snake[0], { x: 11, y: 8 });
  assert.equal(g.dir, 'right');
  assert.equal(redirectExit(g, 'up'), false, 'only once');
  step(g);
  assert.deepEqual(g.snake[0], { x: 12, y: 8 });
});

test('portal mode: no grace turn on ordinary moves', () => {
  const g = running({ mode: 'portal', cols: 17, rows: 15 });
  g.foods = [];
  step(g);
  assert.equal(redirectExit(g, 'up'), false);
});

// ---------- winged ----------

test('winged mode: fruits spawn mid-square with a velocity', () => {
  const g = createGame({ cols: 17, rows: 15, mode: 'winged', fruitCount: 5 });
  assert.equal(g.foods.length, 5);
  for (const f of g.foods) {
    assert.equal(f.x % 1, 0.5);
    assert.ok(Math.hypot(f.vx, f.vy) > 0);
  }
});

test('winged mode: fruits fly and bounce off the board edges', () => {
  const g = running({ mode: 'winged', cols: 10, rows: 9 });
  g.foods = [{ id: 1, fly: 'winged', x: 9.4, y: 4.5, vx: 2, vy: 0 }];
  g.snake = [{ x: 0, y: 8 }, { x: 0, y: 7 }];
  updateFlyers(g, 0.5);
  const f = g.foods[0];
  assert.ok(f.vx < 0, 'bounced back off the right edge');
  assert.ok(f.x <= 10 - FRUIT_RADIUS);
});

test('winged mode: fruits bounce off the snake body', () => {
  const g = running({ mode: 'winged', cols: 10, rows: 9 });
  g.snake = [{ x: 0, y: 0 }, { x: 5, y: 4 }, { x: 5, y: 5 }];
  g.foods = [{ id: 1, fly: 'winged', x: 3.5, y: 4.5, vx: 2, vy: 0 }];
  updateFlyers(g, 1); // 2 squares of travel: reaches the body at x=5 and bounces
  const f = g.foods[0];
  assert.ok(f.vx < 0, 'bounced back');
  assert.ok(f.x <= 5 - FRUIT_RADIUS + 1e-9, 'never entered the body square');
});

test('winged mode: touching the head eats the fruit and grows next tick', () => {
  const g = running({ mode: 'winged', cols: 10, rows: 9 });
  const h = g.snake[0];
  g.foods = [{ id: 1, fly: 'winged', x: h.x + 1.2, y: h.y + 0.5, vx: -2, vy: 0 }];
  const eaten = updateFlyers(g, 0.2);
  assert.equal(eaten.length, 1);
  assert.equal(g.score, 1);
  assert.equal(g.grow, 1);
  assert.equal(g.foods.length, 1, 'replaced');
  const len = g.snake.length;
  step(g);
  assert.equal(g.snake.length, len + 1, 'grew on the next tick');
  assert.equal(g.grow, 0);
});

test('winged mode: stepping onto a fruit square does not eat (only touching does)', () => {
  const g = running({ mode: 'winged', cols: 10, rows: 9 });
  const h = g.snake[0];
  g.foods = [{ id: 1, fly: 'winged', x: 0.5, y: 0.5, vx: 0, vy: 0 }];
  // Nothing at the next square; stepping just moves.
  assert.equal(step(g), 'move');
  assert.equal(g.snake[0].x, h.x + 1);
});

// ---------- yin yang ----------
test('yin yang mode: eating flips the snake — tail becomes head, direction reverses', () => {
  const g = running({ mode: 'yinyang', cols: 10, rows: 9 });
  g.snake = [{ x: 5, y: 4 }, { x: 4, y: 4 }, { x: 3, y: 4 }, { x: 3, y: 5 }];
  g.dir = 'right';
  g.foods = [{ x: 6, y: 4 }];
  assert.equal(step(g), 'flip');
  // Grew to 5, then reversed: old tail (3,5) is the new head.
  assert.deepEqual(g.snake, [{ x: 3, y: 5 }, { x: 3, y: 4 }, { x: 4, y: 4 }, { x: 5, y: 4 }, { x: 6, y: 4 }]);
  assert.equal(g.dir, 'down', 'heading away from the body, the way the old tail pointed');
  assert.equal(g.score, 1);
  step(g);
  assert.deepEqual(g.snake[0], { x: 3, y: 6 });
});

test('yin yang mode: a straight snake flips to head straight back', () => {
  const g = running({ mode: 'yinyang', cols: 10, rows: 9 });
  g.snake = [{ x: 5, y: 4 }, { x: 4, y: 4 }, { x: 3, y: 4 }];
  g.dir = 'right';
  g.foods = [{ x: 6, y: 4 }];
  step(g);
  assert.deepEqual(g.turnQueue, []);
  assert.equal(g.dir, 'left');
});

// ---------- magnet ----------
test('magnet mode: fruits are drawn toward the head and get eaten', () => {
  const g = running({ mode: 'magnet', cols: 17, rows: 15 });
  const h = g.snake[0];
  const head = { x: h.x + 0.5, y: h.y + 0.5 };
  g.foods = [{ id: 1, fly: 'magnet', x: head.x + 5, y: head.y + 4, vx: 0, vy: 0 }];
  const d0 = Math.hypot(g.foods[0].x - head.x, g.foods[0].y - head.y);
  updateFlyers(g, 0.5);
  const f = g.foods[0];
  const d1 = Math.hypot(f.x - head.x, f.y - head.y);
  assert.ok(d1 < d0, `moved closer (${d0.toFixed(2)} -> ${d1.toFixed(2)})`);
  assert.ok(Math.hypot(f.vx, f.vy) <= MAGNET_SPEED + 1e-9, 'never faster than the magnet speed');
  // Keep pulling: it reaches the head and is eaten.
  let eaten = 0;
  for (let i = 0; i < 100 && !eaten; i++) eaten = updateFlyers(g, 0.05).length;
  assert.equal(eaten, 1);
  assert.equal(g.score, 1);
});

test('magnet mode: the body still blocks a fruit', () => {
  const g = running({ mode: 'magnet', cols: 17, rows: 15 });
  // Head at (2,7); a wall of body squares at x=5 between it and the fruit.
  g.snake = [{ x: 2, y: 7 }, ...Array.from({ length: 15 }, (_, y) => ({ x: 5, y }))];
  g.foods = [{ id: 1, fly: 'magnet', x: 9.5, y: 7.5, vx: 0, vy: 0 }];
  for (let i = 0; i < 100; i++) updateFlyers(g, 0.05);
  assert.ok(g.foods[0].x >= 6 + FRUIT_RADIUS - 1e-6, `stayed behind the body (x=${g.foods[0].x.toFixed(2)})`);
  assert.equal(g.score, 0);
});
