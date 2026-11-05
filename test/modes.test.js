import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, queueTurn, spawnWall, placeFood } from '../src/game.js';

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

// ---------- cheese ----------
test('cheese mode: head passes through a hole but not a solid segment', () => {
  // Body laid out so the head's next square holds segment j.
  const make = (j) => {
    const g = running({ mode: 'cheese', cols: 10, rows: 9 });
    // A long snake: head at (5,4) facing up; segment j sits at (5,3) directly above.
    const snake = [{ x: 5, y: 4 }, { x: 5, y: 5 }, { x: 5, y: 6 }];
    // Build a winding tail and drop segment j onto (5,3).
    const trail = [{ x: 6, y: 6 }, { x: 6, y: 5 }, { x: 6, y: 4 }, { x: 6, y: 3 }, { x: 6, y: 2 }, { x: 5, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 3 }];
    for (const c of trail) snake.push(c);
    snake.splice(j, 0, { x: 5, y: 3 });
    g.snake = snake;
    g.dir = 'right';
    g.foods = [{ x: 0, y: 0 }];
    queueTurn(g, 'up');
    return g;
  };
  // Old index j becomes j+1 after the move: odd → solid, even → hole.
  assert.equal(step(make(4)), 'die', 'segment 4 → 5 (solid)');
  assert.equal(step(make(5)), 'move', 'segment 5 → 6 (hole)');
});

test('classic mode: any body segment is solid', () => {
  const g = running({ mode: 'classic' });
  g.snake = [{ x: 5, y: 4 }, { x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 4 }, { x: 6, y: 3 }, { x: 5, y: 3 }, { x: 4, y: 3 }];
  g.dir = 'left';
  g.foods = [{ x: 0, y: 0 }];
  queueTurn(g, 'up');
  assert.equal(step(g), 'die');
});
