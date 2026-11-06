import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, addShields, snapshot, DIRECTIONS } from '../src/game.js';

const seeded = (seed) => {
  let r = seed;
  return () => (r = (r * 9301 + 49297) % 233280) / 233280;
};

function running(opts) {
  const g = createGame({ cols: 10, rows: 9, rng: () => 0.5, mode: 'shield', ...opts });
  g.status = 'running';
  return g;
}

// Head at (4,4) heading right; a fruit straight ahead with the given walls.
function fruitAhead(g, shields) {
  const h = g.snake[0];
  g.foods = [{ x: h.x + 1, y: h.y, id: 9, shields }];
  return g.foods[0];
}

test('shield mode: every fruit gets 0–2 walls (mostly one), on sides that face open board', () => {
  const counts = [0, 0, 0];
  for (let seed = 1; seed < 60; seed++) {
    const g = createGame({ cols: 17, rows: 15, mode: 'shield', fruitCount: 5, rng: seeded(seed) });
    for (const f of g.foods) {
      assert.ok(Array.isArray(f.shields));
      assert.ok(f.shields.length <= 2);
      counts[f.shields.length]++;
      assert.equal(new Set(f.shields).size, f.shields.length, 'no side twice');
      for (const s of f.shields) {
        const d = DIRECTIONS[s];
        const c = { x: f.x + d.x, y: f.y + d.y };
        assert.ok(c.x >= 0 && c.y >= 0 && c.x < g.cols && c.y < g.rows, 'never against the board edge');
      }
    }
  }
  // Odds are 5% / 65% / 30%; a fruit near the edge or the head can't always
  // take a second wall, so two comes up a bit less than that.
  const total = counts[0] + counts[1] + counts[2];
  const share = counts.map((n) => n / total);
  assert.ok(share[0] < 0.1, `rarely none: ${counts}`);
  assert.ok(share[1] > 0.55 && share[1] < 0.8, `mostly one: ${counts}`);
  assert.ok(share[2] > 0.18 && share[2] < 0.35, `sometimes two: ${counts}`);
});

test('shield mode: there is always an open way in', () => {
  for (let seed = 1; seed < 200; seed++) {
    const g = running({ rng: seeded(seed) });
    g.snake = [{ x: 0, y: 0 }];
    // A fruit boxed in on two sides by the edge and on a third by a wall block.
    g.walls = [{ x: 8, y: 7 }];
    g.foods = [];
    const f = addShields(g, { x: 9, y: 7 });
    // Only up (to 9,6) and down (to 9,8) face open ground; one must stay open.
    assert.ok(f.shields.length <= 1, JSON.stringify(f.shields));
  }
});

test('shield mode: no wall facing right where the head is about to be', () => {
  for (let seed = 1; seed < 100; seed++) {
    const g = running({ rng: seeded(seed) });
    const h = g.snake[0];
    const f = addShields(g, { x: h.x + 2, y: h.y });
    assert.ok(!f.shields.includes('left'), 'the side facing the head stays open');
  }
});

test('shield mode: hitting a wall head-on is a death', () => {
  const g = running();
  fruitAhead(g, ['left']);
  assert.equal(step(g), 'die');
});

test('shield mode: coming in through an open side eats the fruit as usual', () => {
  const g = running();
  fruitAhead(g, ['up', 'right']);
  assert.equal(step(g), 'eat');
  assert.equal(g.score, 1);
  assert.equal(g.snake.length, 4);
});

test('shield mode: eating a fruit takes the wall it shares with a neighbouring fruit', () => {
  const g = running();
  const h = g.snake[0];
  // Two fruits side by side ahead; the far one's wall is on the shared side.
  g.foods = [
    { x: h.x + 1, y: h.y, id: 1, shields: [] },
    { x: h.x + 2, y: h.y, id: 2, shields: ['left', 'up'] },
  ];
  assert.equal(step(g), 'eat');
  const far = g.foods.find((f) => f.id === 2);
  assert.deepEqual(far.shields, ['up'], 'shared wall gone, the other stays');
  assert.equal(step(g), 'eat', 'so you can go straight on into it');
});

test('shield mode: walls only stop the head, not the body sliding past', () => {
  const g = running();
  const h = g.snake[0];
  g.foods = [{ x: h.x, y: h.y - 1, id: 1, shields: ['down', 'left'] }];
  // Moving right along the walled side is fine.
  assert.equal(step(g), 'move');
  assert.equal(step(g), 'move');
});

test('shield mode: a snapshot (for late turns) keeps its own copy of the walls', () => {
  const g = running();
  fruitAhead(g, ['up', 'down']);
  const snap = snapshot(g);
  g.foods[0].shields.pop();
  assert.deepEqual(snap.foods[0].shields, ['up', 'down']);
});
