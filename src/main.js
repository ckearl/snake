import {
  BOARD_SIZES, FRUIT_COUNTS, SPEEDS, GAME_MODES, BASE_TICK_MS, createGame, queueTurn, step, redirectExit,
} from './game.js';
import {
  sizeCanvas, drawBoard, drawSnake, drawSnakePath, interpolateSnake, snakePoints, drawWall, drawFruit, drawSprite, drawCrown, drawScene, setBoardColors, setSnakeSkin,
} from './render.js';
import { THEMES, SKINS, DEFAULT_THEME, DEFAULT_SKIN, THEME_ICONS, shade } from './themes.js';
import { FRUITS, DEFAULT_FRUIT, BASKET } from './fruits.js';
import { BUNNY, TURTLE, WALL_ICON, PORTAL_ICON } from './critters.js';
import { makeFireworks, drawFireworks, drawDizzyStars } from './effects.js';
import { sfx, isMuted, setMuted } from './sound.js';

const MAX_CELL = 56;
const TOPBAR_H = 64;
const DEATH_TO_MENU_MS = 1400; // long enough to see the bonk + dizzy eyes
const WIN_TO_MENU_MS = 3400; // let the fireworks play out
const BONK_MS = 220;
const SCENE_W = 340;
const SCENE_H = 256;

const KEY_DIRS = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};

const $ = (id) => document.getElementById(id);
const el = {
  app: $('app'),
  board: $('board'),
  score: $('score'),
  hint: $('hint'),
  menu: $('menu'),
  settings: $('settings'),
  lastScore: $('last-score'),
  bestScore: $('best-score'),
  scene: $('scene'),
  fullscreen: $('btn-fullscreen'),
  mute: $('btn-mute'),
  timer: $('timer'),
};

// ---------- persistence ----------
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

let sizeKey = BOARD_SIZES[store.get('snake.size')] ? store.get('snake.size') : 'medium';
const bestKey = () => `snake.best.${sizeKey}`;
const getBest = () => Number(store.get(bestKey(), 0)) || 0;

// ---------- state ----------
let game = null;
let screen = 'menu'; // menu | settings | play
let lastScore = 0;
let cell = 32;
let boardCtx = null;
let sceneCtx = null;
let sceneFruit = DEFAULT_FRUIT; // fruit in the menu picture (varies when mixed)
let acc = 0;
let lastTime = 0;
const wallBorn = new Map(); // "x,y" -> time the wall appeared (for pop-in)
const pairKinds = new Map(); // portal pair id -> fruit kind (distinct per pair on the board)
const foodBorn = new Map(); // "x,y" -> time the fruit appeared (for pop-in)
let deathTimer = null;
let prevSnake = null; // snake before the latest step (for smooth interpolation)
let endFx = null; // { type: 'lose' | 'win', t0, fireworks? }
let eaten = null;
let portalFruits = null; // { kind, from, to } – the pair just entered, shown until the head reaches it // fruit eaten on the latest step, shrinks as the head arrives
let elapsedMs = 0; // stopwatch: time spent with the snake actually moving
let timerText = '';

function newGame() {
  const { cols, rows } = BOARD_SIZES[sizeKey];
  game = createGame({ cols, rows, fruitCount: FRUIT_COUNTS[active.count], mode: active.mode });
  foodBorn.clear();
  wallBorn.clear();
  pairKinds.clear();
  prevSnake = null;
  eaten = null;
  portalFruits = null;
  endFx = null;
  elapsedMs = 0;
  updateTimer();
  acc = 0;
  updateScore();
  fitBoard();
}

// ---------- screens ----------
function showScreen(name) {
  screen = name;
  clearTimeout(deathTimer);
  el.menu.hidden = name !== 'menu';
  el.settings.hidden = name !== 'settings';
  if (name === 'menu') {
    pickSceneFruit();
    el.lastScore.textContent = lastScore;
    el.bestScore.textContent = getBest();
    setHint(null);
    $('btn-play').focus();
  } else if (name === 'settings') {
    for (const s of SETTINGS) syncSetting(s, 'instant');
    SETTINGS[0].track.focus({ preventScroll: true });
  }
}

function play() {
  rollRound();
  newGame();
  showScreen('play');
  document.activeElement?.blur();
}

function toMenu() {
  if (game && game.status !== 'ready' && game.status !== 'over' && game.status !== 'won') {
    recordScore();
    game.status = 'over';
  }
  showScreen('menu');
}

function recordScore() {
  lastScore = game.score;
  if (game.score > getBest()) store.set(bestKey(), game.score);
}

function setHint(text, center = false, variant = null) {
  el.hint.hidden = !text;
  el.hint.textContent = text ?? '';
  el.hint.classList.toggle('center', center);
  el.hint.classList.toggle('win', variant === 'win');
}

function updateScore() {
  el.score.textContent = game ? game.score : 0;
}

// ---------- settings ----------
// "?" option at the end of some rows: re-rolled from that row's other options every round.
const SURPRISE = 'surprise';
const SURPRISE_OPT = { name: 'Random each round' };
// "mixed" fruit: every fruit on the board is a random kind.
const MIXED = 'mixed';

const OPTIONS = {
  fruit: { ...FRUITS, [MIXED]: { name: 'Mixed fruit' } },
  mode: { ...GAME_MODES, [SURPRISE]: SURPRISE_OPT },
  count: { ...FRUIT_COUNTS, [SURPRISE]: SURPRISE_OPT },
  speed: SPEEDS,
  size: BOARD_SIZES,
  skin: { ...SKINS, [SURPRISE]: SURPRISE_OPT },
  theme: { ...THEMES, [SURPRISE]: SURPRISE_OPT },
};

const pick = (k, table, d) => (Object.hasOwn(table, store.get(k)) ? store.get(k) : d);
const prefs = {
  fruit: pick('snake.fruit', OPTIONS.fruit, DEFAULT_FRUIT),
  mode: pick('snake.mode', OPTIONS.mode, 'classic'),
  count: pick('snake.count', OPTIONS.count, 'one'),
  speed: pick('snake.speed', OPTIONS.speed, 'normal'),
  size: sizeKey,
  skin: pick('snake.skin', OPTIONS.skin, DEFAULT_SKIN),
  theme: pick('snake.theme', OPTIONS.theme, DEFAULT_THEME),
};

// What's actually in play this round (prefs, with any "?" rolled to a real value).
const ROLLABLE = ['mode', 'count', 'skin', 'theme'];
const active = {};
function resolve(key) {
  if (prefs[key] !== SURPRISE) {
    active[key] = prefs[key];
    return;
  }
  const ids = Object.keys(OPTIONS[key]).filter((id) => id !== SURPRISE);
  const fresh = ids.filter((id) => id !== active[key]); // avoid repeating last round's roll
  const pool = fresh.length ? fresh : ids;
  active[key] = pool[Math.floor(Math.random() * pool.length)];
}
function rollRound() {
  for (const k of ROLLABLE) resolve(k);
  applyTheme();
  applySkin();
  repaintThemedIcons();
}

const randomFruit = () => {
  const ids = Object.keys(FRUITS);
  return ids[Math.floor(Math.random() * ids.length)];
};
// Fruit kind for a board fruit: fixed choice, or the fruit's own rolled kind when mixed.
function fruitKind(f) {
  if (f.pair) return pairKind(f.pair);
  if (prefs.fruit !== MIXED) return prefs.fruit;
  if (!f.kind) f.kind = randomFruit();
  return f.kind;
}

// Portal twins share a fruit; every pair on the board gets a different one so you
// can tell which ends connect. The chosen fruit is used first when it's free.
function pairKind(pair) {
  if (pairKinds.has(pair)) return pairKinds.get(pair);
  const live = new Set([...game.foods.map((f) => f.pair), ...game.jumps.map((j) => j.pair)]);
  const used = new Set([...pairKinds].filter(([p]) => live.has(p)).map(([, k]) => k));
  let kind = prefs.fruit !== MIXED && !used.has(prefs.fruit) ? prefs.fruit : null;
  if (!kind) {
    const free = Object.keys(FRUITS).filter((k) => !used.has(k));
    kind = free.length ? free[Math.floor(Math.random() * free.length)] : randomFruit();
  }
  pairKinds.set(pair, kind);
  return kind;
}

const tickMs = () => BASE_TICK_MS * SPEEDS[prefs.speed];
const SPEED_NAMES = { slow: 'Slow (turtle)', normal: 'Normal (snake)', fast: 'Fast (bunny)' };

const COUNT_NAMES = { one: '1 fruit', three: '3 fruits', five: '5 fruits', ten: '10 fruits', random: 'Random 1–10 fruits' };
const optName = (names) => (o, id) => (id === SURPRISE ? o.name : names ? names[id] : o.name);

const SETTINGS = [
  { key: 'fruit', label: 'Fruit', name: optName(), icon: fruitIcon },
  { key: 'mode', label: 'Game mode', name: optName(), icon: modeIcon },
  { key: 'count', label: 'Fruit count', name: optName(COUNT_NAMES), icon: countIcon },
  { key: 'speed', label: 'Speed', name: optName(SPEED_NAMES), icon: speedIcon },
  { key: 'size', label: 'Board size', name: (o) => `${o.label} · ${o.cols}×${o.rows}`, icon: sizeIcon },
  { key: 'skin', label: 'Snake color', name: optName(), icon: skinIcon },
  { key: 'theme', label: 'Board theme', name: optName(), icon: themeIcon },
].map((s) => ({ ...s, options: OPTIONS[s.key] }));

const SIZE_ICON_GRID = { small: 3, medium: 4, large: 6 };
const SVG_NS = 'http://www.w3.org/2000/svg';

// Mini checkerboard in the current theme; denser grid = bigger board.
function sizeIcon(id) {
  const c = document.createElement('canvas');
  c.dataset.sizeIcon = id;
  paintSizeIcon(c);
  return c;
}

function paintSizeIcon(c) {
  const S = 40;
  const ctx = sizeCanvas(c, S, S);
  const t = THEMES[active.theme];
  ctx.fillStyle = t.margins;
  ctx.fillRect(0, 0, S, S);
  const n = SIZE_ICON_GRID[c.dataset.sizeIcon];
  const inner = S - 8;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const x0 = 4 + Math.round((x * inner) / n);
      const y0 = 4 + Math.round((y * inner) / n);
      const x1 = 4 + Math.round(((x + 1) * inner) / n);
      const y1 = 4 + Math.round(((y + 1) * inner) / n);
      // Alternate shade so the grid reads even on single-colour themes.
      ctx.fillStyle = (x + y) % 2 ? shade(t.dark, -0.06) : t.light;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }
}

// Theme glyph on the theme's top-bar colour, with a strip of its board squares.
function themeIcon(id, tile) {
  const t = THEMES[id];
  tile.classList.add('theme');
  tile.style.background =
    `linear-gradient(90deg, ${t.light} 50%, ${t.dark} 50%) bottom / 100% 14px no-repeat, ${t.topBar}`;
  tile.style.boxShadow = `inset 0 0 0 2px ${t.margins}`;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.innerHTML = THEME_ICONS[t.icon];
  return svg;
}

// The snake curled into a loop, head about to eat its own tail.
const LOOP = [
  { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 },
  { x: 2, y: 1 }, { x: 2, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 },
];
function skinIcon(id) {
  const c = document.createElement('canvas');
  const ctx = sizeCanvas(c, 45, 45);
  drawSnake(ctx, LOOP, 15, { dir: 'up', skin: SKINS[id], shadow: false, biteTail: true });
  return c;
}

function fruitIcon(id) {
  const c = document.createElement('canvas');
  const ctx = sizeCanvas(c, 42, 42);
  if (id === MIXED) drawSprite(ctx, BASKET, 0, 0, 42);
  else drawFruit(ctx, id, 0, 0, 42);
  return c;
}

// "?" tile for random-each-round options.
function surpriseIcon() {
  const q = document.createElement('span');
  q.className = 'q';
  q.textContent = '?';
  return q;
}

// Game mode icons. Classic: a little board with a snake heading for a fruit.
function modeIcon(id) {
  const c = document.createElement('canvas');
  c.dataset.modeIcon = id;
  paintModeIcon(c);
  return c;
}

// Classic: a tiny board with a snake heading for a fruit. The other modes are
// simple pixel sprites: a brick wall, two offset portals.
const MODE_SPRITES = { wall: WALL_ICON, portal: PORTAL_ICON };
function paintModeIcon(c) {
  const id = c.dataset.modeIcon;
  const ctx = sizeCanvas(c, 45, 45);
  if (MODE_SPRITES[id]) {
    drawSprite(ctx, MODE_SPRITES[id], 2, 2, 41);
    return;
  }
  const t = THEMES[active.theme];
  const C = 15;
  drawBoard(ctx, 3, 3, C);
  ctx.strokeStyle = t.margins;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 43, 43);
  drawFruit(ctx, iconFruit(0), 31, 16, 13);
  drawSnake(ctx, [{ x: 1, y: 1 }, { x: 0, y: 1 }, { x: 0, y: 2 }], C, { dir: 'right', shadow: false });
}

// Fruit to show in icons: the chosen one, or a varied set when mixed.
const ICON_MIX = ['apple', 'banana', 'grapes', 'orange', 'strawberry', 'cherries', 'kiwi', 'lemon', 'peach', 'watermelon'];
const iconFruit = (i) => (prefs.fruit === MIXED ? ICON_MIX[i % ICON_MIX.length] : prefs.fruit);

function repaintThemedIcons() {
  for (const c of document.querySelectorAll('[data-size-icon]')) paintSizeIcon(c);
  for (const c of document.querySelectorAll('[data-mode-icon]')) paintModeIcon(c);
  for (const c of document.querySelectorAll('[data-speed-snake]')) paintSpeedSnake(c);
}

// Fruit-count icons are drawn with the currently selected fruit.
function countIcon(id) {
  if (id === 'random') {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.innerHTML = '<g transform="rotate(-12 12 12)"><rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/>'
      + [[8, 7.5], [8, 12], [8, 16.5], [16, 7.5], [16, 12], [16, 16.5]]
        .map(([x, y]) => `<circle class="fill" cx="${x}" cy="${y}" r="1.6"/>`).join('')
      + '</g>';
    return svg;
  }
  const c = document.createElement('canvas');
  c.dataset.countIcon = id;
  paintCountIcon(c);
  return c;
}

function paintCountIcon(c) {
  const S = 48;
  const ctx = sizeCanvas(c, S, S);
  let n = 0;
  const place = (cx, cy, size) => drawFruit(ctx, iconFruit(n++), cx - size / 2, cy - size / 2, size);
  switch (c.dataset.countIcon) {
    case 'one':
      place(24, 24, 36);
      break;
    case 'three': // pyramid: 1 on top of 2
      place(24, 13, 21);
      place(13, 34, 21);
      place(35, 34, 21);
      break;
    case 'five': // the five face of a die
      for (const [x, y] of [[10, 10], [38, 10], [24, 24], [10, 38], [38, 38]]) place(x, y, 17);
      break;
    case 'ten': // pyramid with a base of 4
      for (let r = 0; r < 4; r++) {
        for (let i = 0; i <= r; i++) place(24 + (i - r / 2) * 12, 7 + r * 11.3, 12);
      }
      break;
  }
}

// Speed icons: turtle (slow), a little wiggling snake in the current skin (normal), bunny (fast).
const WIGGLE = [{ x: 3, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 0, y: 2 }];
function speedIcon(id) {
  const c = document.createElement('canvas');
  if (id === 'normal') {
    c.dataset.speedSnake = '1';
    paintSpeedSnake(c);
  } else {
    drawSprite(sizeCanvas(c, 44, 44), id === 'fast' ? BUNNY : TURTLE, 0, 0, 44);
  }
  return c;
}

function paintSpeedSnake(c) {
  const ctx = sizeCanvas(c, 44, 33);
  drawSnake(ctx, WIGGLE, 11, { dir: 'right', shadow: false });
}

function paintFruitIcons() {
  const paint = (canvas, size) => {
    const ctx = sizeCanvas(canvas, size, size);
    if (prefs.fruit === MIXED) drawSprite(ctx, BASKET, 0, 0, size);
    else drawFruit(ctx, prefs.fruit, 0, 0, size);
  };
  paint($('score-icon'), 34);
  paint($('stat-fruit'), 48);
  for (const c of document.querySelectorAll('[data-count-icon]')) paintCountIcon(c);
  for (const c of document.querySelectorAll('[data-mode-icon]')) paintModeIcon(c);
}

// ---------- settings carousels ----------
// Each row is a horizontal strip of icons. Drag (or scroll/swipe) it;
// whichever icon comes to rest in the centre frame is the chosen value.
function buildSettings() {
  const host = $('settings-rows');
  for (const s of SETTINGS) {
    const row = document.createElement('div');
    row.className = 'setting';
    s.track = document.createElement('div');
    s.track.className = 'track';
    s.track.tabIndex = 0;
    s.track.setAttribute('role', 'listbox');
    s.track.setAttribute('aria-label', s.label);
    for (const [id, opt] of Object.entries(s.options)) {
      const tile = document.createElement('div');
      tile.className = 'tile';
      tile.id = `opt-${s.key}-${id}`;
      tile.dataset.id = id;
      tile.setAttribute('role', 'option');
      tile.setAttribute('aria-label', s.name(opt, id));
      if (id === SURPRISE) tile.classList.add('surprise');
      tile.append(id === SURPRISE ? surpriseIcon() : s.icon(id, tile));
      s.track.append(tile);
    }
    row.append(s.track);
    host.append(row);
    wireCarousel(s);
  }
}

function wireCarousel(s) {
  const { track } = s;
  let drag = null;
  let suppressClick = false;
  let settleTimer = null;
  let raf = 0;

  const onMove = (e) => {
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 4) drag.moved = true;
    track.scrollLeft = drag.left - dx;
  };
  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    track.classList.remove('dragging');
    if (drag?.moved) {
      suppressClick = true;
      const tile = nearestTile(s);
      choose(s, tile.dataset.id);
    }
    drag = null;
  };

  // Mouse drag. Touch and trackpads already scroll natively.
  track.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    track.focus({ preventScroll: true });
    suppressClick = false;
    drag = { x: e.clientX, left: track.scrollLeft, moved: false };
    track.classList.add('dragging');
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp, { once: true });
  });

  // Click/tap an icon to bring it to the centre.
  track.addEventListener('click', (e) => {
    if (suppressClick) { suppressClick = false; return; }
    const tile = e.target.closest('.tile');
    if (tile) choose(s, tile.dataset.id);
  });

  track.addEventListener('scroll', () => {
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; updateTileScales(s); });
    if (drag) return;
    // Once native scrolling/snapping settles, adopt whatever is centred.
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      // Ignore if Settings was closed mid-scroll: a hidden track measures as
      // all-zero and would wrongly "select" its first option.
      if (drag || screen !== 'settings' || !track.clientWidth) return;
      const id = nearestTile(s).dataset.id;
      if (id !== prefs[s.key]) choose(s, id, { scroll: false });
    }, 150);
  }, { passive: true });

  track.addEventListener('keydown', (e) => {
    const d = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
    if (!d) return;
    e.preventDefault();
    stepSetting(s, d);
  });
}

function trackCenter(track) {
  return track.scrollLeft + track.clientWidth / 2;
}

function nearestTile(s) {
  const c = trackCenter(s.track);
  let best = null;
  let bestD = Infinity;
  for (const tile of s.track.children) {
    const d = Math.abs(tile.offsetLeft + tile.offsetWidth / 2 - c);
    if (d < bestD) { bestD = d; best = tile; }
  }
  return best;
}

function scrollToTile(s, id, behavior) {
  const tile = s.track.querySelector(`[data-id="${id}"]`);
  if (!tile) return;
  const left = tile.offsetLeft + tile.offsetWidth / 2 - s.track.clientWidth / 2;
  s.track.scrollTo({ left, behavior });
}

// Icons shrink and fade the further they are from the centre frame.
function updateTileScales(s) {
  const c = trackCenter(s.track);
  for (const tile of s.track.children) {
    const d = Math.abs(tile.offsetLeft + tile.offsetWidth / 2 - c) / (tile.offsetWidth + 10);
    const t = Math.min(d / 2.5, 1);
    tile.style.transform = `scale(${1 - 0.3 * t})`;
    tile.style.opacity = String(1 - 0.65 * t);
  }
}

function stepSetting(s, d) {
  const ids = Object.keys(s.options);
  const i = ids.indexOf(prefs[s.key]);
  const j = Math.max(0, Math.min(ids.length - 1, i + d));
  choose(s, ids[j]);
}

function choose(s, id, { scroll = true } = {}) {
  if (prefs[s.key] !== id) {
    prefs[s.key] = id;
    store.set(`snake.${s.key}`, id);
    if (ROLLABLE.includes(s.key)) resolve(s.key);
    if (s.key === 'size') {
      sizeKey = id;
      lastScore = 0;
      newGame(); // preview the new board behind the menu
    } else if (s.key === 'theme') {
      applyTheme();
      repaintThemedIcons();
    } else if (s.key === 'skin') {
      applySkin();
      repaintThemedIcons();
    } else if (s.key === 'fruit') {
      paintFruitIcons();
      pickSceneFruit();
    } else if (s.key === 'count' || s.key === 'mode') {
      newGame(); // preview the new layout behind the menu
    }
  }
  syncSetting(s, scroll ? 'smooth' : null);
}

function syncSetting(s, behavior) {
  const current = prefs[s.key];
  for (const tile of s.track.children) {
    tile.setAttribute('aria-selected', String(tile.dataset.id === current));
  }
  s.track.setAttribute('aria-activedescendant', `opt-${s.key}-${current}`);
  if (behavior) scrollToTile(s, current, behavior);
  updateTileScales(s);
}

function applyTheme() {
  const t = THEMES[active.theme];
  const css = document.documentElement.style;
  css.setProperty('--topbar', t.topBar);
  css.setProperty('--frame', t.margins);
  css.setProperty('--page', shade(t.topBar, -0.5));
  css.setProperty('--btn', shade(t.margins, 0.15));
  css.setProperty('--btn-hover', shade(t.margins, 0.25));
  css.setProperty('--btn-edge', shade(t.topBar, -0.25));
  setBoardColors({ light: t.light, dark: t.dark, skyTop: t.margins, skyBottom: shade(t.margins, 0.4), wall: t.margins });
}

function applySkin() {
  setSnakeSkin(SKINS[active.skin]);
}

// ---------- layout ----------
function fitBoard() {
  if (!game) return;
  const pad = Math.round(Math.min(32, Math.max(12, Math.min(innerWidth, innerHeight) * 0.035)));
  el.app.style.setProperty('--frame-pad', `${pad}px`);
  const availW = innerWidth - pad * 2 - 16;
  const availH = innerHeight - TOPBAR_H - pad * 2 - 16;
  cell = Math.max(10, Math.floor(Math.min(availW / game.cols, availH / game.rows, MAX_CELL)));
  boardCtx = sizeCanvas(el.board, cell * game.cols, cell * game.rows);
}

// ---------- drawing ----------
function tongueOut(t) {
  return t % 1600 < 260;
}

function drawGame(t) {
  if (!game || !boardCtx) return;
  const ctx = boardCtx;
  drawBoard(ctx, game.cols, game.rows, cell);

  // Wall blocks (wall mode), popping in when they appear.
  for (const w of game.walls) {
    const key = `${w.x},${w.y}`;
    if (!wallBorn.has(key)) wallBorn.set(key, t);
    const p = Math.min(1, (t - wallBorn.get(key)) / 220);
    drawWall(ctx, w.x, w.y, cell, p < 1 ? 0.3 + 0.85 * p - 0.15 * p * p : 1);
  }


  const onBoard = new Set();
  for (const f of game.foods) {
    const key = `${f.x},${f.y}`;
    onBoard.add(key);
    if (!foodBorn.has(key)) foodBorn.set(key, t);
    // Little pop-in when a new fruit appears.
    const p = Math.min(1, (t - foodBorn.get(key)) / 180);
    const scale = p < 1 ? 0.4 + 0.75 * p - 0.15 * p * p : 1;
    const size = cell * 0.9 * scale;
    const x = f.x * cell + (cell - size) / 2;
    const y = f.y * cell + (cell - size) / 2 - cell * 0.03;
    drawFruit(ctx, fruitKind(f), x, y, size, { shadow: true });
  }
  for (const key of foodBorn.keys()) if (!onBoard.has(key)) foodBorn.delete(key);

  // How far through the current tile the snake is (0..1). Paused keeps its place.
  const moving = game.status === 'running' || game.status === 'paused';
  const alpha = moving && prevSnake ? Math.min(1, acc / tickMs()) : 1;

  // Portal pair just entered: both fruits stay until the head reaches the entry,
  // then vanish together as it goes through.
  if (portalFruits && alpha < 1) {
    for (const end of [portalFruits.from, portalFruits.to]) {
      drawFruit(ctx, portalFruits.kind, end.x * cell + cell * 0.05, end.y * cell + cell * 0.02, cell * 0.9, { shadow: true });
    }
  }

  // The fruit just eaten shrinks away as the head slides onto it.
  if (eaten && alpha < 1) {
    const size = cell * 0.9 * (1 - alpha);
    drawFruit(ctx, eaten.kind, eaten.x * cell + (cell - size) / 2, eaten.y * cell + (cell - size) / 2, size);
  }

  const live = game.status === 'running' || game.status === 'ready';
  const opts = {
    dir: game.dir, tongue: live && tongueOut(t), ms: t, jumps: game.jumps,
  };

  if (game.status === 'over' && endFx?.type === 'lose') {
    drawBonk(ctx, t - endFx.t0, opts);
  } else if (game.status === 'won' && endFx?.type === 'win') {
    drawSnake(ctx, game.snake, cell, { ...opts, eyes: 'happy' });
    drawFireworks(ctx, endFx.fireworks, t - endFx.t0, cell);
  } else if (alpha < 1) {
    drawSnakePath(ctx, interpolateSnake(game.snake, prevSnake, alpha, game.jumps), cell, opts);
  } else {
    drawSnake(ctx, game.snake, cell, opts);
  }
}

// Loss: the head bumps forward into whatever it hit and springs back, then the
// eyes go dizzy and a few stars circle overhead.
function drawBonk(ctx, ms, opts) {
  const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[game.dir];
  const bump = ms < BONK_MS ? Math.sin((Math.PI * ms) / BONK_MS) * 0.2 : 0;
  const pts = snakePoints(game.snake, game.jumps);
  const head = { x: pts[0].x + dx * bump, y: pts[0].y + dy * bump };
  drawSnakePath(ctx, [head, ...pts], cell, { ...opts, eyes: ms > BONK_MS * 0.6 ? 'dizzy' : 'closed' });
  if (ms > BONK_MS * 0.6) {
    const fade = Math.min(1, (ms - BONK_MS * 0.6) / 300);
    // Orbit just above the head, but kept on the board (e.g. after hitting the top wall).
    const w = game.cols * cell;
    const ox = Math.min(w - cell * 0.6, Math.max(cell * 0.6, head.x * cell));
    const oy = Math.max(cell * 0.3, head.y * cell - cell * 0.62);
    drawDizzyStars(ctx, ox, oy, cell, ms, fade);
  }
}

// Advance the game one tile.
function doStep() {
  prevSnake = game.snake.map((q) => ({ ...q }));
  const before = game.foods.slice();
  const wallsBefore = game.walls.length;
  const ev = step(game);
  if (ev === 'eat' || ev === 'win') {
    const at = game.snake[0];
    const f = before.find((q) => q.x === at.x && q.y === at.y);
    eaten = { x: at.x, y: at.y, kind: f ? fruitKind(f) : prefs.fruit };
  } else {
    eaten = null;
  }
  portalFruits = null;
  if (ev === 'portal') {
    const j = game.jumps[game.jumps.length - 1];
    portalFruits = { kind: pairKind(j.pair), from: j.from, to: j.to };
  }
  if (ev === 'eat') { sfx.eat(); updateScore(); }
  if (ev === 'portal') { sfx.portal(); updateScore(); }
  if (game.walls.length > wallsBefore) sfx.wall();
  if (ev === 'die' || ev === 'win') onGameEnd(ev);
}

function drawMenuScene(t) {
  if (!sceneCtx) return;
  drawScene(sceneCtx, SCENE_W, SCENE_H, { tongue: tongueOut(t + 800), fruit: sceneFruit });
}

// ---------- loop ----------
function formatTime(ms) {
  const tenths = Math.floor(ms / 100);
  const m = Math.floor(tenths / 600);
  const s = Math.floor(tenths / 10) % 60;
  return `${m}:${String(s).padStart(2, '0')}.${tenths % 10}`;
}

function updateTimer() {
  const text = formatTime(elapsedMs);
  if (text !== timerText) el.timer.textContent = timerText = text;
}

function toggleTimer() {
  el.timer.hidden = !el.timer.hidden;
}

function toggleMute() {
  setMuted(!isMuted());
  el.mute.classList.toggle('on', isMuted());
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
}

function frame(t) {
  const realDt = t - lastTime;
  const dt = Math.min(realDt, 250);
  lastTime = t;

  if (game && game.status === 'running') {
    elapsedMs += realDt;
    updateTimer();
    acc += dt;
    const tick = tickMs();
    while (acc >= tick && game.status === 'running') {
      acc -= tick;
      doStep();
    }
  }

  drawGame(t);
  if (screen === 'menu') drawMenuScene(t);
  requestAnimationFrame(frame);
}

function onGameEnd(ev) {
  updateScore();
  recordScore();
  const t0 = performance.now();
  if (ev === 'die') {
    sfx.die();
    endFx = { type: 'lose', t0 };
    deathTimer = setTimeout(() => showScreen('menu'), DEATH_TO_MENU_MS);
  } else {
    sfx.win();
    endFx = { type: 'win', t0, fireworks: makeFireworks(game.cols, game.rows) };
    setHint('Perfect game!', true, 'win');
    deathTimer = setTimeout(() => showScreen('menu'), WIN_TO_MENU_MS);
  }
}

function pause() {
  game.status = 'paused';
  setHint('Paused · Space to resume', true);
}

// Unpausing keeps the in-between-tiles progress so there's no visual jump.
function resume() {
  game.status = 'running';
  setHint(null);
}

// First move: step straight away so the head starts gliding immediately.
function start() {
  game.status = 'running';
  acc = 0;
  setHint(null);
  doStep();
}

// ---------- input ----------
window.addEventListener('keydown', (e) => {
  // Global hotkeys (any screen). Skip when a modifier is held so Cmd+F etc. still work.
  if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat) {
    if (e.code === 'KeyT') { toggleTimer(); return; }
    if (e.code === 'KeyM') { toggleMute(); return; }
    if (e.code === 'KeyF') { toggleFullscreen(); return; }
  }

  if (screen === 'settings') {
    if (e.code === 'Escape') showScreen('menu');
    return;
  }
  if (screen !== 'play' || !game) return;

  const dir = KEY_DIRS[e.code];
  if (dir) {
    e.preventDefault();
    if (game.status === 'ready') {
      queueTurn(game, dir);
      sfx.start();
      start();
    } else if (game.status === 'running') {
      // Just popped out of a portal? Early in that move, a turn re-aims it.
      if (game.leftExit && acc / tickMs() < 0.5 && redirectExit(game, dir)) return;
      queueTurn(game, dir);
    }
    return;
  }

  switch (e.code) {
    case 'Space':
    case 'KeyP':
      e.preventDefault();
      if (game.status === 'running') pause();
      else if (game.status === 'paused') resume();
      break;
    case 'Escape':
      toMenu();
      break;
  }
});

// Auto-pause if the window loses focus mid-game.
window.addEventListener('blur', () => {
  if (game?.status === 'running') pause();
});

window.addEventListener('resize', fitBoard);

$('btn-play').addEventListener('click', play);
$('btn-settings').addEventListener('click', () => showScreen('settings'));
$('btn-back').addEventListener('click', () => showScreen('menu'));

// Shuffle: every row jumps to a random concrete option ("?" and the current pick excluded).
$('btn-shuffle').addEventListener('click', () => {
  for (const s of SETTINGS) {
    const ids = Object.keys(s.options).filter((id) => id !== SURPRISE && id !== prefs[s.key]);
    if (ids.length) choose(s, ids[Math.floor(Math.random() * ids.length)]);
  }
});
$('btn-close').addEventListener('click', () => {
  if (screen === 'settings') showScreen('menu');
  else if (screen === 'play') toMenu();
});

el.mute.addEventListener('click', toggleMute);

el.fullscreen.addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', () => {
  el.fullscreen.classList.toggle('on', !!document.fullscreenElement);
});

// ---------- debug ----------
// Open with ?debug to get window.snakeDebug for poking at the game from devtools.
if (new URLSearchParams(location.search).has('debug')) {
  window.snakeDebug = {
    get game() { return game; },
    win() { game.status = 'won'; onGameEnd('win'); },
    lose() { game.status = 'over'; onGameEnd('die'); },
  };
}

// ---------- boot ----------
function pickSceneFruit() {
  sceneFruit = prefs.fruit === MIXED ? randomFruit() : prefs.fruit;
}

function initIcons() {
  paintFruitIcons();
  drawCrown(sizeCanvas($('stat-crown'), 48, 48), 0, 2, 48);
  sceneCtx = sizeCanvas(el.scene, SCENE_W, SCENE_H);
}

for (const k of ROLLABLE) resolve(k);
applyTheme();
applySkin();
buildSettings();
initIcons();
el.mute.classList.toggle('on', isMuted());
newGame();
showScreen('menu');
requestAnimationFrame((t) => { lastTime = t; frame(t); });
