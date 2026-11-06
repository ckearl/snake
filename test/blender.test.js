import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, step, modeKey, modeSet, hasMode,
} from '../src/game.js';

// A repeatable "random" sequence.
export const seeded = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
};

const running = (opts) => {
  const g = createGame({ cols: 17, rows: 15, rng: seeded(7), ...opts });
  g.status = 'running';
  return g;
};

// ---------- the mode set ----------
test('blender: a blend key is its modes sorted and joined; none is classic', () => {
  assert.equal(modeKey(['key', 'box']), 'box+key');
  assert.equal(modeKey(['shield']), 'shield');
  assert.equal(modeKey([]), 'classic');
  assert.equal(modeKey(['classic']), 'classic');
});

test('blender: a mode set drops classic and anything unknown', () => {
  assert.deepEqual([...modeSet('classic')], []);
  assert.deepEqual([...modeSet('box')], ['box']);
  assert.deepEqual([...modeSet(['wall', 'nope', 'classic', 'wall', 'portal'])].sort(), ['portal', 'wall']);
});

test('blender: a game keeps its modes as a set and its key as the mode', () => {
  const one = createGame({ cols: 17, rows: 15, mode: 'box' });
  assert.equal(one.mode, 'box');
  assert.ok(hasMode(one, 'box'));
  const g = createGame({ cols: 17, rows: 15, mode: ['wall', 'mines'] });
  assert.equal(g.mode, 'mines+wall');
  assert.ok(hasMode(g, 'wall') && hasMode(g, 'mines') && !hasMode(g, 'box'));
  assert.equal(createGame({ cols: 17, rows: 15 }).mode, 'classic');
});

test('blender: a one-mode blend is that mode', () => {
  const a = running({ mode: ['portal'] });
  const b = running({ mode: 'portal' });
  assert.deepEqual(a.foods, b.foods);
  step(a);
  step(b);
  assert.deepEqual(a.snake, b.snake);
});
