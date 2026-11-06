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
  for (const mode of ['classic', 'portal', 'winged', 'twin']) {
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

// ---------- the other modes' pieces, from chat, in any mode ----------
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

test('!shield: a bonus fruit with at least one wall, in any mode, not replaced once eaten', async () => {
  const { addBonusShield } = await import('../src/game.js');
  for (const mode of ['classic', 'box', 'portal', 'mines']) {
    const g = running({ mode });
    const before = g.foods.filter((f) => !f.bonus).length;
    const f = addBonusShield(g);
    assert.ok(f.bonus, mode);
    assert.ok(f.shields.length >= 1 && f.shields.length <= 2, `${mode}: ${f.shields}`);
    assert.equal(g.foods.filter((q) => !q.bonus).length, before, 'the mode’s own fruit untouched');
  }
  // Eaten through an open side: scores, and nothing extra appears.
  const g = running({ mode: 'classic' });
  const h = g.snake[0];
  const f = addBonusShield(g);
  f.x = h.x + 1;
  f.y = h.y;
  f.shields = ['up'];
  const n = g.foods.length;
  assert.equal(step(g), 'eat');
  assert.equal(g.foods.length, n - 1);
  // Hit on its wall: a death.
  const d = running({ mode: 'box' });
  const q = addBonusShield(d);
  q.x = d.snake[0].x + 1;
  q.y = d.snake[0].y;
  q.shields = ['left'];
  assert.equal(step(d), 'die');
});

test('!key: a bonus key + lock in classic; the fruit it frees is a bonus too', async () => {
  const { addBonusKey } = await import('../src/game.js');
  const g = running({ mode: 'classic' });
  assert.ok(addBonusKey(g));
  assert.equal(g.keys.length, 1);
  assert.equal(g.locks.length, 1);
  const [k] = g.keys;
  const h = g.snake[0];
  k.x = h.x + 1;
  k.y = h.y;
  assert.equal(step(g), 'unlock');
  const freed = g.foods.find((f) => f.keyed);
  assert.ok(freed.bonus);
  freed.x = g.snake[0].x + 1;
  freed.y = g.snake[0].y;
  const n = g.foods.length;
  assert.equal(step(g), 'eat');
  assert.equal(g.foods.length, n - 1, 'not replaced');
  assert.equal(g.keys.length, 0, 'and no new key in classic');
});

test('!key in keys mode: the mode still keeps its own count', async () => {
  const { addBonusKey } = await import('../src/game.js');
  const g = running({ mode: 'key', fruitCount: 1 });
  addBonusKey(g);
  assert.equal(g.locks.length, 2);
  // Eat the mode's own (already opened) fruit: one regular pair comes back.
  g.keys = g.keys.filter((k) => k.bonus);
  g.locks = g.locks.filter((l) => l.bonus);
  const h = g.snake[0];
  g.foods = [{ x: h.x + 1, y: h.y, id: 99, keyed: true }];
  assert.equal(step(g), 'eat');
  assert.equal(g.locks.filter((l) => !l.bonus).length, 1);
  assert.equal(g.locks.filter((l) => l.bonus).length, 1);
});

test('!box: a bonus box only opens on its own target', async () => {
  const { addBonusBox } = await import('../src/game.js');
  const g = running({ mode: 'box' });
  assert.ok(addBonusBox(g));
  assert.equal(g.boxes.length, 2);
  assert.equal(g.targets.length, 2);
  const bonus = g.boxes.find((b) => b.bonus);
  assert.equal(g.targets.find((t) => t.bonus).box, bonus.id);
  // Push the bonus box onto the *mode's* target: it just slides on.
  const h = g.snake[0];
  const own = g.targets.find((t) => !t.bonus);
  bonus.x = h.x + 1;
  bonus.y = h.y;
  own.x = h.x + 2;
  own.y = h.y;
  assert.equal(step(g), 'push');
  assert.equal(g.targets.length, 2);
  // And onto its own target: the fruit comes out, as a bonus.
  const mine = g.targets.find((t) => t.bonus);
  mine.x = bonus.x + 1;
  mine.y = bonus.y;
  assert.equal(step(g), 'release');
  assert.ok(g.foods.find((f) => f.boxed).bonus);
});

test('!box: the mode’s own box comes back even while a chat box is about', async () => {
  const { addBonusBox } = await import('../src/game.js');
  const g = running({ mode: 'box' });
  addBonusBox(g);
  g.boxes = g.boxes.filter((b) => b.bonus);
  g.targets = g.targets.filter((t) => t.bonus);
  const h = g.snake[0];
  g.foods = [{ x: h.x + 1, y: h.y, id: 99, boxed: true }];
  assert.equal(step(g), 'eat');
  assert.equal(g.boxes.filter((b) => !b.bonus).length, 1);
});

test('!mine: a mine field in classic works like mines mode', async () => {
  const { spawnMine } = await import('../src/game.js');
  const g = running({ mode: 'classic' });
  const m = spawnMine(g);
  assert.ok(m);
  const h = g.snake[0];
  g.mines = [{ x: h.x + 1, y: h.y, id: 5 }];
  assert.equal(step(g), 'die');
  assert.deepEqual(g.blast, { x: h.x + 1, y: h.y, id: 5 });
});

test('!twin: the next 5 fruits flip the snake, then it wears off', async () => {
  const { addTwin, CHAT_TWIN_FRUITS } = await import('../src/game.js');
  const g = running({ mode: 'classic', cols: 30, rows: 5 });
  addTwin(g);
  for (let i = 0; i < CHAT_TWIN_FRUITS + 1; i++) {
    const h = g.snake[0];
    const [dx, dy] = DIRS[g.dir];
    g.foods = [{ x: h.x + dx, y: h.y + dy, id: 100 + i }];
    const ev = step(g);
    assert.equal(ev, i < CHAT_TWIN_FRUITS ? 'flip' : 'eat', `fruit ${i + 1}`);
  }
  assert.equal(g.twinLeft, 0);
  addTwin(g);
  addTwin(g);
  assert.equal(g.twinLeft, CHAT_TWIN_FRUITS, 'another !twin tops it back up, not past 5');
});

test('!portal: a bonus pair teleports in classic and isn’t replaced', async () => {
  const { addBonusPortal } = await import('../src/game.js');
  const g = running({ mode: 'classic' });
  const [a, b] = addBonusPortal(g);
  assert.equal(a.pair, b.pair);
  const h = g.snake[0];
  a.x = h.x + 1;
  a.y = h.y;
  const n = g.foods.length;
  assert.equal(step(g), 'portal');
  assert.deepEqual(g.snake[0], { x: b.x, y: b.y });
  assert.equal(g.foods.length, n - 2, 'both ends gone, nothing new');
  assert.equal(g.score, 1);
});

test('!poison: a bonus fruit + poison fruit; eating the poison hands over the wheel', async () => {
  const { addBonusPoison } = await import('../src/game.js');
  const g = running({ mode: 'classic' });
  const [f, p] = addBonusPoison(g);
  assert.ok(f.bonus && !f.poison);
  assert.ok(p.bonus && p.poison);
  const h = g.snake[0];
  p.x = h.x + 1;
  p.y = h.y;
  const n = g.foods.length;
  assert.equal(step(g), 'poison');
  assert.equal(g.poison, 3);
  assert.equal(g.foods.length, n - 1, 'no refill for a chat poison fruit');
});

test('the poison wander steers round locks, mine flags and walled fruit sides', async () => {
  const { poisonDir } = await import('../src/game.js');
  for (const [name, setup] of [
    ['lock', (g, a) => { g.locks = [{ ...a, id: 1, shape: 'star' }]; }],
    ['flag', (g, a) => { g.mines = [{ ...a, id: 1 }]; }],
    ['walled fruit', (g, a) => { g.foods = [{ ...a, id: 1, shields: ['left'] }]; }],
  ]) {
    for (let i = 0; i < 30; i++) {
      const g = running({ mode: 'classic', rng: () => (i + 0.5) / 30 });
      g.foods = [];
      const h = g.snake[0];
      setup(g, { x: h.x + 1, y: h.y });
      g.poison = 5;
      assert.notEqual(poisonDir(g), 'right', name);
    }
  }
});

test('chat fruit counts: every kind of chat drop scores and grows the snake', async () => {
  const { addBonusFruit, addBonusShield, addBonusPortal } = await import('../src/game.js');
  for (const [name, add] of [['!fruit', addBonusFruit], ['!shield', addBonusShield], ['!portal', addBonusPortal]]) {
    const g = running({ mode: 'classic' });
    const made = add(g);
    const f = Array.isArray(made) ? made[0] : made;
    if (f.shields) f.shields = [];
    const h = g.snake[0];
    f.x = h.x + 1;
    f.y = h.y;
    const len = g.snake.length;
    step(g);
    assert.equal(g.score, 1, name);
    assert.equal(g.snake.length, len + 1, `${name} grows the snake`);
  }
});

test('a fruit chat picks rides along: on the drop, and on what a chat lock or box lets out', async () => {
  const { addBonusFruit, addBonusKey, addBonusBox, addBonusPoison } = await import('../src/game.js');
  const g = running({ mode: 'classic' });
  assert.equal(addBonusFruit(g, 'pineapple').pick, 'pineapple');
  assert.ok(addBonusPoison(g, 'grapes').every((f) => f.pick === 'grapes'));
  addBonusKey(g, 'mango');
  const k = g.keys[0];
  const h = g.snake[0];
  k.x = h.x + 1;
  k.y = h.y;
  assert.equal(step(g), 'unlock');
  assert.equal(g.foods.find((f) => f.keyed).pick, 'mango');

  const b = running({ mode: 'classic' });
  addBonusBox(b, 'kiwi');
  const box = b.boxes[0];
  const t = b.targets[0];
  const bh = b.snake[0];
  box.x = bh.x + 1;
  box.y = bh.y;
  t.x = bh.x + 2;
  t.y = bh.y;
  assert.equal(step(b), 'release');
  assert.equal(b.foods.find((f) => f.boxed).pick, 'kiwi');
});

test('chat drops keep out of mine fields while there’s room elsewhere', async () => {
  const game = await import('../src/game.js');
  for (let seed = 1; seed < 25; seed++) {
    let r = seed / 25;
    const g = running({ mode: 'mines', rng: () => (r = (r * 9301 + 0.49297) % 1) });
    for (let i = 0; i < 4; i++) game.spawnMine(g);
    const inField = (c) => g.mines.some((m) => Math.max(Math.abs(m.x - Math.floor(c.x)), Math.abs(m.y - Math.floor(c.y))) <= 1);
    game.addBonusFruit(g);
    game.addBonusShield(g);
    game.addBonusPortal(g);
    game.addBonusPoison(g);
    game.addBonusKey(g);
    game.addBonusBox(g);
    for (const q of [...g.foods.filter((f) => !f.fly), ...g.keys, ...g.locks, ...g.boxes, ...g.targets]) {
      assert.ok(!inField(q), `seed ${seed}: ${JSON.stringify(q)}`);
    }
  }
});
