import {
  BOARD_SIZES, FRUIT_COUNTS, SPEEDS, GAME_MODES, BASE_TICK_MS, MINE_LIMIT,
  createGame, queueTurn, step, redirectExit, updateFlyers, snapshot, lateTurn,
  spawnWall, addBonusFlyer, resizeBoard, spawnMine,
  addBonusShield, addBonusKey, addBonusBox, addBonusPortal, addBonusPoison, addTwin, CHAT_TWIN_FRUITS,
} from './game.js';
import {
  sizeCanvas, drawBoard, drawSnake, drawSnakePath, interpolateSnake, snakePoints, drawWall, drawWings, drawFruit, drawSprite, drawCrown, drawScene, setBoardColors, setSnakeSkin,
  drawBox, drawTarget, drawKey, drawLock, drawShield, drawPoisonBubbles, isGrayFruit, drawMineField, drawFlag, PALETTE,
} from './render.js';
import { THEMES, SKINS, DEFAULT_THEME, DEFAULT_SKIN, shade, mix, boardAccent } from './themes.js';
import { FRUITS, DEFAULT_FRUIT, BASKET } from './fruits.js';
import {
  BUNNY, TURTLE, WALL_ICON, PORTAL_ICON, MAGNET_ICON, BOX, MINES_ICON, THEME_SPRITES,
} from './critters.js';
import {
  makeFireworks, drawFireworks, drawDizzyStars, makeConfetti, drawConfetti, CONFETTI_MS, makeBlast, drawBlast,
} from './effects.js';
import { sfx, isMuted, setMuted } from './sound.js';
import { CommandRouter, matchOption, COMMANDS, loadCommandConfig } from './commands.js';
import { TwitchChat } from './chat.js';

const MAX_CELL = 56;
const TOPBAR_H = 64;
const DEATH_TO_MENU_MS = 1400; // long enough to see the bonk + dizzy eyes
const WIN_TO_MENU_MS = 3400; // let the fireworks play out
const BONK_MS = 220;
// Space / Enter right after a game ends starts the next one. Ignored for this
// long so a key already on its way down (e.g. Space to pause) doesn't count.
const RESTART_GUARD_MS = 150;
// Hopeful turning: a turn pressed within this fraction of a square after the head
// passes a square's centre still turns at that square.
const LATE_TURN_WINDOW = 0.1;
// Eating mouth: how long (in ticks) the mouth takes to open and close.
const MOUTH_TICKS = 1.4;
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
  stream: $('stream'),
  lastScore: $('last-score'),
  bestScore: $('best-score'),
  topBest: $('top-best'),
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
// High scores are kept per board size and game mode.
const bestKey = (mode = game?.mode ?? 'classic') => `snake.best.${sizeKey}.${mode}`;
// Before scores were per mode there was one per size; it carries over as Classic's.
for (const size of Object.keys(BOARD_SIZES)) {
  const old = store.get(`snake.best.${size}`, null);
  if (old !== null && store.get(`snake.best.${size}.classic`, null) === null) store.set(`snake.best.${size}.classic`, old);
}

// Chat can change the size and colours for the current round (or the next one, if
// it happens on the menu). They're cleared once that round ends, so chat never
// overwrites the streamer's own settings.
const chatOverride = { size: null, skin: null, theme: null, fruit: null, speed: null };
let roundPlayed = false; // a round with the current overrides has started
const boardSizeKey = () => chatOverride.size ?? sizeKey;
const themeId = () => chatOverride.theme ?? active.theme;
const skinId = () => chatOverride.skin ?? active.skin;
const fruitId = () => chatOverride.fruit ?? prefs.fruit;
const speedId = () => chatOverride.speed ?? prefs.speed;
// Yin Yang mode was renamed Twin: carry over a saved choice and its high scores.
if (store.get('snake.mode') === 'yinyang') store.set('snake.mode', 'twin');
for (const size of Object.keys(BOARD_SIZES)) {
  const old = store.get(`snake.best.${size}.yinyang`, null);
  if (old !== null && store.get(`snake.best.${size}.twin`, null) === null) store.set(`snake.best.${size}.twin`, old);
}
const getBest = () => Number(store.get(bestKey(), 0)) || 0;

// ---------- state ----------
let game = null;
let screen = 'menu'; // menu | settings | play
let lastScore = 0;
let startBest = 0; // the high score for this game's mode when it began
let recordShown = false; // this game has already had its new-record moment
let cell = 32;
let boardCtx = null;
let sceneCtx = null;
let sceneFruit = DEFAULT_FRUIT; // fruit in the menu picture (varies when mixed)
let acc = 0;
let lastTime = 0;
const wallBorn = new Map(); // "x,y" -> time the wall appeared (for pop-in)
const pairKinds = new Map(); // portal pair id -> fruit kind (distinct per pair on the board)
const foodBorn = new Map(); // "x,y" -> time the fruit appeared (for pop-in)
const boxBorn = new Map(); // box id -> time it appeared (for pop-in)
let boxGone = []; // boxes leaving the board: { x, y, to?, t0 } (released onto a target, or knocked away)
const mineBorn = new Map(); // mine field id -> time it appeared (for fade-in)
let confetti = []; // cleared mine fields: { pieces, t0 }
let lockGone = []; // key mode: locks popping open { x, y, shape, t0 }, keys being eaten { key: true, ... }
let shieldGone = []; // shield mode: walls fading after their fruit was eaten { x, y, side, t0 }
let deathTimer = null;
let prevSnake = null; // snake before the latest step (for smooth interpolation)
let endFx = null; // { type: 'lose' | 'win', t0, fireworks? }
let lastSnap = null; // game state just before the latest step (for hopeful turning)
let lastEv = null; // what that step did
let mouthT0 = -1e9; // when the mouth last started opening
let eaten = []; // fruits shrinking away after being eaten: { cx, cy, kind, t0 }
let portalFruits = null; // { kind, from, to } – the pair just entered, shown until the head reaches it
let elapsedMs = 0; // stopwatch: time spent with the snake actually moving
let timerText = '';

function newGame() {
  const { cols, rows } = BOARD_SIZES[boardSizeKey()];
  game = createGame({ cols, rows, fruitCount: FRUIT_COUNTS[active.count], mode: active.mode });
  startBest = getBest();
  recordShown = false;
  foodBorn.clear();
  boxBorn.clear();
  boxGone = [];
  mineBorn.clear();
  confetti = [];
  lockGone = [];
  shieldGone = [];
  wallBorn.clear();
  pairKinds.clear();
  prevSnake = null;
  lastSnap = null;
  lastEv = null;
  mouthT0 = -1e9;
  eaten = [];
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
  el.stream.hidden = name !== 'stream';
  if (name === 'menu') {
    if (roundPlayed) clearChatOverrides();
    pickSceneFruit();
    el.lastScore.textContent = lastScore;
    el.bestScore.textContent = getBest();
    setHint(null);
    $('btn-play').focus();
  } else if (name === 'settings') {
    for (const s of SETTINGS) syncSetting(s, 'instant');
    SETTINGS[0].track.focus({ preventScroll: true });
  } else if (name === 'stream') {
    syncStreamPanel();
  }
}

function play() {
  roundPlayed = true;
  rollRound();
  newGame();
  setHint(null);
  el.board.parentElement.classList.remove('shake');
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
  const score = game ? game.score : 0;
  el.score.textContent = score;
  // The best for the mode in play; climbs along with the score once it's beaten
  // (and stays gold until the next game).
  el.topBest.textContent = Math.max(getBest(), score);
  el.topBest.classList.toggle('new', score > startBest);
  // The moment the old record falls: a little jingle and the crown hops.
  if (score > startBest && startBest > 0 && !recordShown) {
    recordShown = true;
    sfx.record();
    const crown = $('best-icon');
    crown.classList.remove('record');
    void crown.offsetWidth; // restart the animation
    crown.classList.add('record');
  }
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
  if (fruitId() !== MIXED) return fruitId();
  if (!f.kind) {
    // Poison mode: regular fruit is never a greyish kind, so it can't be mistaken for poison.
    const ids = Object.keys(FRUITS).filter((k) => !(game?.mode === 'poison' && !f.poison && isGrayFruit(k)));
    f.kind = ids[Math.floor(Math.random() * ids.length)];
  }
  return f.kind;
}

// Portal twins share a fruit; every pair on the board gets a different one so you
// can tell which ends connect. The chosen fruit is used first when it's free.
function pairKind(pair) {
  if (pairKinds.has(pair)) return pairKinds.get(pair);
  const live = new Set([...game.foods.map((f) => f.pair), ...game.jumps.map((j) => j.pair)]);
  const used = new Set([...pairKinds].filter(([p]) => live.has(p)).map(([, k]) => k));
  let kind = fruitId() !== MIXED && !used.has(fruitId()) ? fruitId() : null;
  if (!kind) {
    const free = Object.keys(FRUITS).filter((k) => !used.has(k));
    kind = free.length ? free[Math.floor(Math.random() * free.length)] : randomFruit();
  }
  pairKinds.set(pair, kind);
  return kind;
}

const tickMs = () => BASE_TICK_MS * SPEEDS[speedId()];
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
  const t = THEMES[themeId()];
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

// Pixel glyph on the theme's top-bar colour, with a strip of its board squares.
function themeIcon(id, tile) {
  const t = THEMES[id];
  tile.classList.add('theme');
  tile.style.background =
    `linear-gradient(90deg, ${t.light} 50%, ${t.dark} 50%) bottom / 100% 14px no-repeat, ${t.topBar}`;
  tile.style.boxShadow = `inset 0 0 0 2px ${t.margins}`;
  const c = document.createElement('canvas');
  c.className = 'theme-glyph';
  drawSprite(sizeCanvas(c, 32, 32), THEME_SPRITES[t.icon], 0, 0, 32);
  return c;
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
const MODE_SPRITES = {
  wall: WALL_ICON, portal: PORTAL_ICON, magnet: MAGNET_ICON, box: BOX, mines: MINES_ICON,
};
function paintModeIcon(c) {
  const id = c.dataset.modeIcon;
  const ctx = sizeCanvas(c, 45, 45);
  if (MODE_SPRITES[id]) {
    drawSprite(ctx, MODE_SPRITES[id], 2, 2, 41);
    return;
  }
  if (id === 'poison') {
    // A poisoned fruit, bubbling.
    drawFruit(ctx, iconFruit(0), 6, 9, 33, { poison: true });
    drawPoisonBubbles(ctx, 22.5, 25, 33, 500);
    return;
  }
  if (id === 'key') {
    // A grey lock with a star on it, and its star key (in the board accent) above.
    ctx.save();
    ctx.translate(3, 15);
    drawLock(ctx, 'star', 0, 0, 27);
    ctx.restore();
    ctx.save();
    ctx.translate(20, 0);
    drawKey(ctx, 'star', 0, 0, 24);
    ctx.restore();
    return;
  }
  if (id === 'shield') {
    // A fruit with walls on two of its sides.
    const C = 27;
    ctx.save();
    ctx.translate(9, 9);
    drawFruit(ctx, iconFruit(0), 2, 2, C - 4);
    drawShield(ctx, 0, 0, 'up', C);
    drawShield(ctx, 0, 0, 'right', C);
    ctx.restore();
    return;
  }
  if (id === 'twin') {
    // A snake with a head at each end, in the current skin.
    drawSnake(ctx, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }],
      15, { dir: 'left', shadow: false, twin: true });
    return;
  }
  if (id === 'winged') {
    // A fruit with wings.
    drawWings(ctx, 22.5, 22, 26, true);
    drawFruit(ctx, iconFruit(0), 10, 9, 25);
    return;
  }
  const t = THEMES[themeId()];
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
const iconFruit = (i) => (fruitId() === MIXED ? ICON_MIX[i % ICON_MIX.length] : fruitId());

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
    if (fruitId() === MIXED) drawSprite(ctx, BASKET, 0, 0, size);
    else drawFruit(ctx, fruitId(), 0, 0, size);
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
  const t = THEMES[themeId()];
  const css = document.documentElement.style;
  css.setProperty('--topbar', t.topBar);
  css.setProperty('--frame', t.margins);
  css.setProperty('--page', shade(t.topBar, -0.5));
  css.setProperty('--btn', shade(t.margins, 0.15));
  css.setProperty('--btn-hover', shade(t.margins, 0.25));
  css.setProperty('--btn-edge', shade(t.topBar, -0.25));
  setBoardColors({
    light: t.light, dark: t.dark, skyTop: t.margins, skyBottom: shade(t.margins, 0.4), wall: t.margins, accent: boardAccent(t),
  });
}

function applySkin() {
  setSnakeSkin(SKINS[skinId()]);
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


  // Box targets lie flat on the board, under everything else.
  for (const tg of game.targets) drawTarget(ctx, tg.x, tg.y, cell, t);

  // Mine fields (the snake's body may lie over them; the flag never has it on).
  for (const m of game.mines) {
    if (!mineBorn.has(m.id)) mineBorn.set(m.id, t);
    const born = Math.min(1, (t - mineBorn.get(m.id)) / 260);
    const visit = game.mineVisit?.id === m.id ? game.mineVisit.n : 0;
    drawMineField(ctx, m.x, m.y, cell, { visit, born, ms: t, limit: MINE_LIMIT });
    drawFlag(ctx, m.x, m.y, cell, t + m.id * 113, born < 1 ? 0.4 + 0.6 * born : 1);
  }
  for (const id of mineBorn.keys()) if (!game.mines.some((m) => m.id === id)) mineBorn.delete(id);

  drawKeysAndLocks(ctx, t);

  // How far through the current tile the snake is (0..1). Paused keeps its place.
  const moving = game.status === 'running' || game.status === 'paused';
  const alpha = moving && prevSnake ? Math.min(1, acc / tickMs()) : 1;

  const onBoard = new Set();
  for (const f of game.foods) {
    const flying = !!f.fly;
    const key = f.id ?? `${f.x},${f.y}`;
    onBoard.add(key);
    if (!foodBorn.has(key)) foodBorn.set(key, t);
    // Little pop-in when a new fruit appears.
    const p = Math.min(1, (t - foodBorn.get(key)) / 180);
    if (p < 0) continue; // not out yet (a box is still sliding onto its target)
    const scale = p < 1 ? 0.4 + 0.75 * p - 0.15 * p * p : 1;
    const size = cell * (flying ? 0.78 : 0.9) * scale;
    // Grid fruits sit in their square; flying fruits are positioned by centre.
    const cx = flying ? f.x * cell : (f.x + 0.5) * cell;
    const cy = flying ? f.y * cell : (f.y + 0.5) * cell;
    if (f.fly === 'winged') drawWings(ctx, cx, cy, size, Math.floor((t + (f.id ?? 0) * 97) / 130) % 2 === 0);
    const lift = flying ? 0 : fruitHop(t, f.id ?? f.x * 31 + f.y);
    drawFruit(ctx, fruitKind(f), cx - size / 2, cy - size / 2 - cell * 0.03, size, { shadow: !flying, poison: f.poison, lift });
    if (f.poison) drawPoisonBubbles(ctx, cx, cy, size, t, f.id ?? 0);
    for (const side of f.shields ?? []) drawShield(ctx, f.x, f.y, side, cell, Math.min(1, p * 1.5));
  }
  // Walls whose fruit was just eaten fade away.
  shieldGone = shieldGone.filter((g) => t - g.t0 < 220);
  for (const g of shieldGone) drawShield(ctx, g.x, g.y, g.side, cell, 1 - (t - g.t0) / 220);
  drawPoppingLocks(ctx, t);
  for (const key of foodBorn.keys()) if (!onBoard.has(key)) foodBorn.delete(key);

  drawBoxes(ctx, t, alpha);

  // Portal pair just entered: both fruits stay until the head reaches the entry,
  // then vanish together as it goes through.
  if (portalFruits && alpha < 1) {
    for (const end of [portalFruits.from, portalFruits.to]) {
      drawFruit(ctx, portalFruits.kind, end.x * cell + cell * 0.05, end.y * cell + cell * 0.02, cell * 0.9, { shadow: true });
    }
  }

  // The fruit just eaten shrinks away as the head slides onto it.
  for (const e of eaten) {
    const k = (t - e.t0) / tickMs();
    if (k >= 1) continue;
    const size = cell * 0.9 * (1 - k);
    drawFruit(ctx, e.kind, e.cx * cell - size / 2, e.cy * cell - size / 2, size, { poison: e.poison });
  }
  eaten = eaten.filter((e) => t - e.t0 < tickMs());

  const live = game.status === 'running' || game.status === 'ready';
  // Mouth eases open and shut after eating.
  const mk = (t - mouthT0) / (tickMs() * MOUTH_TICKS);
  const mouth = mk >= 0 && mk < 1 ? Math.sin(Math.PI * mk) : 0;
  const opts = {
    dir: game.dir, tongue: live && tongueOut(t) && !mouth, ms: t, jumps: game.jumps, mouth,
    strain: moving && game.pushing,
  };
  if (game.poison > 0 && game.status !== 'over') {
    // Poisoned: grey and dizzy. Flickers back to normal over the last two moves.
    const ending = game.poison <= 2 && Math.floor(t / 110) % 2;
    if (!ending) Object.assign(opts, { skin: SKINS.gray, eyes: 'dizzy', tongue: false });
  }

  if (game.status === 'over' && endFx?.type === 'lose') {
    if (endFx.blast) drawExploded(ctx, t - endFx.t0, opts);
    else drawBonk(ctx, t - endFx.t0, opts);
  } else if (game.status === 'won' && endFx?.type === 'win') {
    drawSnake(ctx, game.snake, cell, { ...opts, eyes: 'happy' });
    drawFireworks(ctx, endFx.fireworks, t - endFx.t0, cell);
  } else if (alpha < 1) {
    drawSnakePath(ctx, interpolateSnake(game.snake, prevSnake, alpha, game.jumps), cell, opts);
  } else {
    drawSnake(ctx, game.snake, cell, opts);
  }

  confetti = confetti.filter((c) => t - c.t0 < CONFETTI_MS);
  for (const c of confetti) drawConfetti(ctx, c.pieces, t - c.t0, cell);
}

// Fruit waiting on the board gives a little hop now and then (each on its own
// beat), then sits still. Returns how high it is off the ground, in px.
const HOP_MS = 1500;
function fruitHop(t, id) {
  const p = ((t + id * 337) % HOP_MS) / HOP_MS;
  if (p >= 0.3) return 0;
  return Math.sin((Math.PI * p) / 0.3) * cell * 0.08;
}

// Key mode: locks (solid grey blocks) and their keys, which hop like fruit.
// An opened lock pops up and away as its fruit appears; an eaten key shrinks.
const LOCK_POP_MS = 320;
function drawKeysAndLocks(ctx, t) {
  for (const l of game.locks) drawLock(ctx, l.shape, l.x, l.y, cell);
  lockGone = lockGone.filter((g) => t - g.t0 < (g.key ? tickMs() : LOCK_POP_MS));
  for (const g of lockGone) {
    if (g.key) drawKey(ctx, g.shape, g.x, g.y, cell, { scale: 1 - (t - g.t0) / tickMs() });
  }
  for (const k of game.keys) drawKey(ctx, k.shape, k.x, k.y, cell, { lift: fruitHop(t, k.id + 7) });
}

// Opened locks lift off over the fruit they were holding (so drawn after it).
function drawPoppingLocks(ctx, t) {
  for (const g of lockGone) if (!g.key) drawLock(ctx, g.shape, g.x, g.y, cell, (t - g.t0) / LOCK_POP_MS);
}

// Box mode crates. A pushed box slides along with the head; a released one
// slides onto its target and sinks away as the fruit pops out; one knocked into
// a wall shrinks away while a fresh one pops in somewhere else.
function drawBoxes(ctx, t, alpha) {
  const before = prevSnake && lastSnap ? lastSnap.boxes : [];
  for (const b of game.boxes) {
    if (!boxBorn.has(b.id)) boxBorn.set(b.id, t);
    const p = Math.min(1, (t - boxBorn.get(b.id)) / 220);
    const prev = before.find((q) => q.id === b.id);
    const x = prev && alpha < 1 ? prev.x + (b.x - prev.x) * alpha : b.x;
    const y = prev && alpha < 1 ? prev.y + (b.y - prev.y) * alpha : b.y;
    drawBox(ctx, x, y, cell, p < 1 ? 0.3 + 0.85 * p - 0.15 * p * p : 1);
  }
  for (const id of boxBorn.keys()) if (!game.boxes.some((b) => b.id === id)) boxBorn.delete(id);

  const tick = tickMs();
  boxGone = boxGone.filter((g) => t - g.t0 < tick * 1.6);
  for (const g of boxGone) {
    const k = Math.min(1, (t - g.t0) / tick);
    if (g.to) {
      // Slide onto the target over the tick, then sink into it.
      const sink = Math.max(0, (t - g.t0) / tick - 1) / 0.6;
      drawBox(ctx, g.x + (g.to.x - g.x) * k, g.y + (g.to.y - g.y) * k, cell, 1 - 0.7 * sink, 1 - sink);
    } else {
      // Knocked away: a quick shrink and fade as the head takes its square.
      const q = Math.min(1, k * 2);
      drawBox(ctx, g.x, g.y, cell, 1 - 0.6 * q, 1 - q);
    }
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

// Mines mode loss: the field goes off with a soft pomf. It flushes red and fades,
// the flag pops up and tumbles away, and the snake flinches back from the blast,
// a little sooty and dazed, while smoke puffs drift up.
function drawExploded(ctx, ms, opts) {
  const b = game.blast;
  const fade = Math.max(0, 1 - ms / 320);
  if (fade > 0) drawMineField(ctx, b.x, b.y, cell, { visit: MINE_LIMIT, born: fade, ms: 140, limit: MINE_LIMIT }); // 140 ms: the red half of its warning blink

  const pts = snakePoints(game.snake, game.jumps);
  const h = pts[0];
  const ax = h.x - (b.x + 0.5);
  const ay = h.y - (b.y + 0.5);
  const len = Math.hypot(ax, ay) || 1;
  const jolt = ms < 280 ? Math.sin((Math.PI * ms) / 280) * 0.16 : 0;
  const head = { x: h.x + (ax / len) * jolt, y: h.y + (ay / len) * jolt };
  const soot = Math.min(1, ms / 160) * 0.42;
  const base = opts.skin ?? SKINS[skinId()];
  const skin = { ...base, stops: base.stops.map((c) => mix(c, '#2B2522', soot)) };
  drawSnakePath(ctx, [head, ...pts], cell, { ...opts, skin, tongue: false, eyes: ms < 320 ? 'closed' : 'dizzy' });

  if (ms < 950) {
    const s = ms / 1000;
    ctx.save();
    ctx.globalAlpha = 1 - ms / 950;
    ctx.translate((b.x + 0.5 + 0.7 * s) * cell, (b.y + 0.5 - 2.4 * s + 3.6 * s * s) * cell);
    ctx.rotate(s * 4.5);
    drawFlag(ctx, -0.5, -0.5, cell, 0);
    ctx.restore();
  }
  drawBlast(ctx, endFx.blast, ms, cell);
}

// Flying fruits: move them, and catch any touching the head where it's drawn.
function flyFruits(dt, t) {
  const alpha = prevSnake ? Math.min(1, acc / tickMs()) : 1;
  const head = prevSnake ? interpolateSnake(game.snake, prevSnake, alpha, game.jumps)[0] : null;
  const caught = updateFlyers(game, dt, head);
  for (const f of caught) {
    eaten.push({ cx: f.x, cy: f.y, kind: fruitKind(f), t0: t });
    sfx.eat();
  }
  if (caught.length) {
    updateScore();
    mouthT0 = t;
    lastEv = 'catch'; // fruit state moved on; don't rewind this move
  }
}

// Advance the game one tile.
function doStep() {
  prevSnake = game.snake.map((q) => ({ ...q }));
  lastSnap = snapshot(game);
  const ev = step(game);
  lastEv = ev;
  afterStep(ev, lastSnap.foods, lastSnap.walls.length);
}

// Hopeful turn: rewind the last (straight) move and redo it with this turn.
function tryLateTurn(dir) {
  const ev = lateTurn(game, lastSnap, lastEv, dir);
  if (ev === null) return false;
  lastEv = 'late'; // only once per move
  afterStep(ev, lastSnap.foods, lastSnap.walls.length);
  return true;
}

// Sounds, score, and animations for whatever a step just did.
function afterStep(ev, before, wallsBefore) {
  if (ev === 'eat' || ev === 'flip' || ev === 'portal' || ev === 'win' || ev === 'poison') mouthT0 = performance.now();
  if (ev === 'poison') {
    const at = game.snake[0];
    const f = before.find((q) => q.x === at.x && q.y === at.y);
    eaten.push({ cx: at.x + 0.5, cy: at.y + 0.5, kind: f ? fruitKind(f) : fruitId(), poison: true, t0: performance.now() });
    sfx.poison();
  } else if (lastSnap?.poison > 0 && game.poison === 0 && game.status === 'running') {
    sfx.cure();
  }
  if (ev === 'flip') {
    // Twin: the fruit was eaten where the head was, which is now the tail end.
    const at = game.snake[game.snake.length - 1];
    const f = before.find((q) => q.x === at.x && q.y === at.y);
    eaten.push({ cx: at.x + 0.5, cy: at.y + 0.5, kind: f ? fruitKind(f) : fruitId(), t0: performance.now() });
    // The body jumped ends, so hold it still for this tick instead of interpolating.
    prevSnake = null;
    sfx.flip();
    updateScore();
  }
  if (ev === 'eat' || ev === 'win') {
    const at = game.snake[0];
    const f = before.find((q) => !q.fly && q.x === at.x && q.y === at.y);
    // (A win can also come from simply growing into the last square — no fruit then.)
    if (f || ev === 'eat') {
      eaten.push({ cx: at.x + 0.5, cy: at.y + 0.5, kind: f ? fruitKind(f) : fruitId(), t0: performance.now() });
    }
  }
  portalFruits = null;
  if (ev === 'portal') {
    const j = game.jumps[game.jumps.length - 1];
    portalFruits = { kind: pairKind(j.pair), from: j.from, to: j.to };
  }
  if (ev === 'eat') { sfx.eat(); updateScore(); }
  if (ev === 'portal') { sfx.portal(); updateScore(); }
  if (game.walls.length > wallsBefore) sfx.wall();
  if (ev === 'push') sfx.push();
  if (ev === 'unlock') {
    // The key that was just eaten, and the lock it opened (in the snapshot, gone now).
    const now = performance.now();
    const key = lastSnap?.keys.find((k) => !game.keys.some((q) => q.id === k.id));
    const lock = key && lastSnap.locks.find((l) => l.id === key.id);
    if (key) lockGone.push({ key: true, x: key.x, y: key.y, shape: key.shape, t0: now });
    if (lock) {
      lockGone.push({ x: lock.x, y: lock.y, shape: lock.shape, t0: now });
      // The fruit pops in as the lock lifts off it.
      const f = game.foods.find((q) => q.keyed && q.x === lock.x && q.y === lock.y);
      if (f) foodBorn.set(f.id, now + LOCK_POP_MS * 0.3);
    }
    sfx.unlock();
  }
  // Shield mode: the eaten fruit's walls (and any it shared) fade out.
  if (ev === 'eat' && lastSnap) {
    const now = performance.now();
    for (const f of lastSnap.foods) {
      if (!f.shields?.length) continue;
      const after = game.foods.find((q) => q.id === f.id);
      for (const side of f.shields) if (!after?.shields?.includes(side)) shieldGone.push({ x: f.x, y: f.y, side, t0: now });
    }
  }
  // A turn the player made (poison does its own steering, quietly).
  if (lastSnap && game.dir !== lastSnap.dir && !lastSnap.poison && ev !== 'die' && ev !== 'flip') sfx.turn(game.dir);
  if (ev === 'release' || ev === 'bump') {
    // The box that's gone (in the snapshot, not on the board any more).
    const now = performance.now();
    const old = lastSnap?.boxes.find((b) => !game.boxes.some((q) => q.id === b.id));
    if (old && ev === 'release') {
      const f = game.foods.find((q) => q.boxed && Math.abs(q.x - old.x) + Math.abs(q.y - old.y) === 1);
      boxGone.push({ x: old.x, y: old.y, to: f && { x: f.x, y: f.y }, t0: now });
      // The fruit pops out once the box has reached the target.
      if (f) foodBorn.set(f.id, now + tickMs() * 0.85);
      sfx.release();
    } else if (old) {
      boxGone.push({ x: old.x, y: old.y, t0: now });
      sfx.wall();
    }
  }
  for (const m of game.cleared) {
    confetti.push({ pieces: makeConfetti(m.x + 0.5, m.y + 0.5, PALETTE.accent), t0: performance.now() });
    sfx.clear();
  }
  if (lastSnap && game.mines.length > lastSnap.mines.length - game.cleared.length) sfx.mine();
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
    if (game.status === 'running' && game.foods.some((f) => f.fly)) flyFruits(dt / 1000, t);
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
    if (game.blast) sfx.boom();
    else {
      sfx.die();
      shakeBoard(game.dir);
    }
    endFx = { type: 'lose', t0, blast: game.blast && makeBlast(game.blast.x + 0.5, game.blast.y + 0.5) };
    deathTimer = setTimeout(() => showScreen('menu'), DEATH_TO_MENU_MS);
  } else {
    sfx.win();
    endFx = { type: 'win', t0, fireworks: makeFireworks(game.cols, game.rows) };
    setHint('Perfect game!', true, 'win');
    deathTimer = setTimeout(() => showScreen('menu'), WIN_TO_MENU_MS);
  }
}

// Straight into the next round from the end of the last one, skipping the menu.
function restart() {
  // A game given up part way still counts toward the high score.
  if (game.status === 'running' || game.status === 'paused') recordScore();
  if (roundPlayed) clearChatOverrides(); // as the menu would have
  play();
}

// A crash into a wall or the snake itself gives the board a gentle shake, mostly
// along the direction it hit, timed with the bonk.
function shakeBoard(dir) {
  const wrap = el.board.parentElement;
  const [x, y] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
  wrap.style.setProperty('--sx', x);
  wrap.style.setProperty('--sy', y);
  wrap.classList.remove('shake');
  void wrap.offsetWidth; // restart the animation
  wrap.classList.add('shake');
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
  // Typing in the stream panel's fields shouldn't trigger anything.
  const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
  if (screen === 'stream') {
    if (e.code === 'Escape') closeStream();
    return;
  }
  if (typing) return;
  // Global hotkeys (any screen). Skip when a modifier is held so Cmd+F etc. still work.
  if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat) {
    if (e.code === 'KeyT') { toggleTimer(); return; }
    if (e.code === 'KeyM') { toggleMute(); return; }
    if (e.code === 'KeyF') { toggleFullscreen(); return; }
    if (e.code === 'KeyC') { toggleChatCommands(); return; }
  }

  if (screen === 'settings') {
    if (e.code === 'Escape') showScreen('menu');
    return;
  }
  if (screen !== 'play' || !game) return;

  // R: straight back to the start of a fresh game.
  if (e.code === 'KeyR' && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
    restart();
    return;
  }

  if (game.status === 'over' || game.status === 'won') {
    const go = e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter';
    if (go && !e.repeat && endFx && performance.now() - endFx.t0 > RESTART_GUARD_MS) {
      e.preventDefault();
      restart();
    } else if (e.code === 'Escape') {
      toMenu();
    }
    return;
  }

  const dir = KEY_DIRS[e.code];
  if (dir) {
    e.preventDefault();
    if (game.status === 'ready') {
      queueTurn(game, dir);
      sfx.start();
      start();
    } else if (game.status === 'running') {
      const progress = acc / tickMs();
      // Pressed just after the head passed the square's centre? Turn there anyway.
      if (progress < LATE_TURN_WINDOW && tryLateTurn(dir)) return;
      // Just popped out of a portal? Early in that move, a turn re-aims it.
      if (game.leftExit && progress < 0.5 && redirectExit(game, dir)) return;
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

// ---------- chat actions ----------
// Each action is what a chat command (and, later, a channel point reward) does.
// They return a short description for the on-screen toast, or null to stay quiet.
const inRound = () => screen === 'play' && game && ['ready', 'running', 'paused'].includes(game.status);
const SIZE_ORDER = ['small', 'medium', 'large'];
const pickOther = (ids, current) => {
  const pool = ids.filter((id) => id !== current);
  return pool[Math.floor(Math.random() * pool.length)];
};

const ACTIONS = {
  wall() {
    if (!inRound()) return null;
    if (!spawnWall(game)) return 'tried to add a wall, but there was no room';
    sfx.wall();
    return 'added a wall';
  },

  fly() {
    if (!inRound()) return null;
    if (!addBonusFlyer(game)) return null;
    sfx.portal();
    return 'released a flying fruit';
  },

  // The other modes' pieces, dropped into whatever mode is being played.
  shield() {
    if (!inRound()) return null;
    if (!addBonusShield(game)) return null;
    sfx.wall();
    return 'added a shielded fruit';
  },

  key() {
    if (!inRound()) return null;
    if (!addBonusKey(game)) return 'tried to add a key, but there was no room';
    sfx.unlock();
    return 'added a key and its lock';
  },

  box() {
    if (!inRound()) return null;
    if (!addBonusBox(game)) return 'tried to add a box, but there was no room';
    sfx.push();
    return 'added a box and its target';
  },

  mine() {
    if (!inRound()) return null;
    if (!spawnMine(game)) return 'tried to lay a mine field, but there was no room';
    sfx.mine();
    return 'laid a mine field';
  },

  twin() {
    if (!inRound() || game.mode === 'twin') return null;
    addTwin(game);
    sfx.flip();
    return `made the snake a twin for ${CHAT_TWIN_FRUITS} fruits`;
  },

  portal() {
    if (!inRound()) return null;
    if (!addBonusPortal(game)) return null;
    sfx.portal();
    return 'opened a portal';
  },

  poison() {
    if (!inRound()) return null;
    if (!addBonusPoison(game)) return null;
    sfx.poison();
    return 'added a fruit and a poison one';
  },

  size(arg) {
    const current = boardSizeKey();
    const i = SIZE_ORDER.indexOf(current);
    let next = matchOption(arg, BOARD_SIZES);
    if (arg === 'bigger' || arg === 'up') next = SIZE_ORDER[Math.min(i + 1, SIZE_ORDER.length - 1)];
    if (arg === 'smaller' || arg === 'down') next = SIZE_ORDER[Math.max(i - 1, 0)];
    if (!next) next = pickOther(SIZE_ORDER, current);
    if (next === current) return null;
    chatOverride.size = next;
    const { cols, rows } = BOARD_SIZES[next];
    if (inRound()) {
      resizeBoard(game, cols, rows);
      // Everything moved: drop any in-between animation state.
      prevSnake = null;
      lastSnap = null;
      portalFruits = null;
      eaten = [];
      boxGone = [];
      confetti = [];
      wallBorn.clear();
      fitBoard();
    } else if (screen !== 'play') {
      newGame(); // preview it behind the menu
    }
    return `made the board ${BOARD_SIZES[next].label.toLowerCase()}`;
  },

  color(arg) {
    const next = matchOption(arg, SKINS) ?? pickOther(Object.keys(SKINS), skinId());
    chatOverride.skin = next;
    applySkin();
    repaintThemedIcons();
    return `turned the snake ${SKINS[next].name.toLowerCase()}`;
  },

  fruit(arg) {
    // Chat text is untrusted: only look up real alias keys (not e.g. "constructor").
    const aliases = new Map([['basket', MIXED], ['mix', MIXED], ['mixed', MIXED]]);
    const next = aliases.get(arg?.replace(/[^a-z]/g, '')) ?? matchOption(arg, OPTIONS.fruit)
      ?? pickOther(Object.keys(OPTIONS.fruit), fruitId());
    if (!Object.hasOwn(OPTIONS.fruit, next) || next === fruitId()) return null;
    chatOverride.fruit = next;
    paintFruitIcons();
    pickSceneFruit();
    return next === MIXED ? 'mixed up the fruit' : `changed the fruit to ${FRUITS[next].name.toLowerCase()}`;
  },

  speed(arg) {
    // Chat text is untrusted: only look up real alias keys (not e.g. "constructor").
    const aliases = new Map([['turtle', 'slow'], ['snake', 'normal'], ['bunny', 'fast'], ['medium', 'normal']]);
    const order = ['slow', 'normal', 'fast'];
    const current = speedId();
    const i = order.indexOf(current);
    let next = aliases.get(arg) ?? matchOption(arg, SPEEDS);
    if (arg === 'faster' || arg === 'up') next = order[Math.min(i + 1, order.length - 1)];
    if (arg === 'slower' || arg === 'down') next = order[Math.max(i - 1, 0)];
    if (!next) next = pickOther(order, current);
    if (!Object.hasOwn(SPEEDS, next) || next === current) return null;
    // Keep the head at the same point between squares at the new pace.
    const before = tickMs();
    chatOverride.speed = next;
    acc *= tickMs() / before;
    const label = { slow: 'slowed the snake down', normal: 'set the snake to normal speed', fast: 'sped the snake up' };
    return label[next];
  },

  mapcolor(arg) {
    const next = matchOption(arg, THEMES) ?? pickOther(Object.keys(THEMES), themeId());
    chatOverride.theme = next;
    applyTheme();
    repaintThemedIcons();
    return `switched the board to ${THEMES[next].name}`;
  },
};

function clearChatOverrides() {
  const sizeChanged = chatOverride.size !== null;
  const fruitChanged = chatOverride.fruit !== null;
  for (const k of Object.keys(chatOverride)) chatOverride[k] = null;
  roundPlayed = false;
  applyTheme();
  applySkin();
  repaintThemedIcons();
  if (fruitChanged) paintFruitIcons();
  if (sizeChanged) newGame();
}

// Run an action on behalf of a viewer and credit them on screen.
function runAction(action, arg, user) {
  const what = ACTIONS[action]?.(arg);
  if (what) toast(user, what);
}

// ---------- toasts ----------
const MAX_TOASTS = 4;
function toast(user, what) {
  const box = $('toasts');
  const t = document.createElement('div');
  t.className = 'toast';
  const name = document.createElement('b');
  name.textContent = user; // textContent: usernames are untrusted
  t.append(name, ` ${what}`);
  box.append(t);
  while (box.children.length > MAX_TOASTS) box.firstElementChild.remove();
  setTimeout(() => t.classList.add('out'), 3200);
  setTimeout(() => t.remove(), 3700);
}

// ---------- twitch chat ----------
let commandConfig = loadCommandConfig(JSON.parse(store.get('snake.commands', '{}') || '{}'));
const router = new CommandRouter({ config: commandConfig });
function saveCommandConfig() {
  store.set('snake.commands', JSON.stringify(commandConfig));
  router.setConfig(commandConfig);
}
// C turns chat's commands off and on (the connection stays up). Remembered.
let chatPaused = store.get('snake.chatPaused', '0') === '1';
function toggleChatCommands() {
  chatPaused = !chatPaused;
  store.set('snake.chatPaused', chatPaused ? '1' : '0');
  syncChatPaused();
  toast('Chat commands', chatPaused ? 'off' : 'on');
}
function syncChatPaused() {
  $('btn-chat').classList.toggle('paused', chatPaused);
  syncChannelStatus();
}

function onChatMessage(msg) {
  if (chatPaused) return;
  const req = router.handle(msg);
  if (req && !req.cooldown) runAction(req.action, req.arg, req.user);
}

const chat = new TwitchChat({
  onMessage: onChatMessage,
  onStatus: (status) => {
    const btn = $('btn-chat');
    btn.dataset.status = status;
    btn.title = chat.channel ? `Twitch chat: ${chat.channel} (${status})` : 'Connect Twitch chat';
    syncChannelStatus();
  },
});

// Channel comes from ?channel=name (remembered), or the chat button.
function initChat() {
  const param = new URLSearchParams(location.search).get('channel');
  if (param !== null) store.set('snake.channel', param.trim());
  const channel = store.get('snake.channel', '');
  if (channel) chat.connect(channel);
  else $('btn-chat').dataset.status = 'off';
  syncChatPaused();
}

// ---------- stream settings panel ----------
let streamReturn = 'menu'; // where Done goes back to

function openStream() {
  if (screen === 'stream') return;
  streamReturn = screen;
  if (screen === 'play' && game?.status === 'running') pause();
  showScreen('stream');
}

function closeStream() {
  if (streamReturn === 'play') {
    // Back to the (paused) game; the pause pill is still showing.
    screen = 'play';
    el.stream.hidden = true;
    document.activeElement?.blur();
  } else {
    showScreen(streamReturn);
  }
}

function syncChannelStatus() {
  const line = $('channel-status');
  const status = $('btn-chat').dataset.status ?? 'off';
  line.dataset.status = status;
  line.textContent = !chat.channel || status === 'off'
    ? 'Not connected'
    : status === 'on' ? `Reading chat in #${chat.channel}` : `Connecting to #${chat.channel}…`;
  if (chatPaused) line.textContent += ' · commands off (C)';
  $('channel-connect').textContent = chat.channel && status !== 'off' ? 'Disconnect' : 'Connect';
}

function syncStreamPanel() {
  $('channel-input').value = store.get('snake.channel', '');
  syncChannelStatus();
  const rows = $('cmd-rows');
  rows.replaceChildren();
  for (const [name, def] of Object.entries(COMMANDS)) {
    const cfg = commandConfig[name];
    const row = document.createElement('div');
    row.className = `cmd-row${cfg.enabled ? '' : ' off'}`;

    const sw = document.createElement('label');
    sw.className = 'switch';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = cfg.enabled;
    box.setAttribute('aria-label', `Enable !${name}`);
    box.addEventListener('change', () => {
      cfg.enabled = box.checked;
      row.classList.toggle('off', !cfg.enabled);
      saveCommandConfig();
    });
    sw.append(box, document.createElement('span'));

    const label = document.createElement('div');
    label.className = 'cmd-name';
    const b = document.createElement('b');
    b.textContent = `!${name}`;
    const help = document.createElement('small');
    help.textContent = def.help;
    label.append(b, help);

    const cd = document.createElement('label');
    cd.className = 'cooldown';
    const num = document.createElement('input');
    num.type = 'number';
    num.min = '0';
    num.max = '600';
    num.step = '0.5';
    num.value = String(cfg.cooldown / 1000);
    num.setAttribute('aria-label', `!${name} cooldown in seconds`);
    num.addEventListener('change', () => {
      const secs = Math.min(600, Math.max(0, Number(num.value) || 0));
      num.value = String(secs);
      cfg.cooldown = Math.round(secs * 1000);
      saveCommandConfig();
    });
    const unit = document.createElement('span');
    unit.textContent = 's';
    cd.append(num, unit);

    row.append(sw, label, cd);
    rows.append(row);
  }
}

$('btn-chat').addEventListener('click', openStream);
$('btn-stream').addEventListener('click', openStream);
$('stream-done').addEventListener('click', closeStream);

$('channel-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('channel-input').value.trim().replace(/^#/, '');
  const connected = chat.channel && $('btn-chat').dataset.status !== 'off';
  if (connected && name === chat.channel) {
    chat.disconnect(); // the button reads "Disconnect"
    chat.channel = null;
    store.set('snake.channel', '');
  } else if (name) {
    store.set('snake.channel', name);
    chat.connect(name);
  }
  syncChannelStatus();
});

$('cmd-reset').addEventListener('click', () => {
  commandConfig = loadCommandConfig();
  saveCommandConfig();
  syncStreamPanel();
});

// ---------- debug ----------
// Open with ?debug to get window.snakeDebug for poking at the game from devtools.
if (new URLSearchParams(location.search).has('debug')) {
  window.snakeDebug = {
    get game() { return game; },
    get progress() { return acc / tickMs(); }, // how far the head is into its current square (0..1)
    win() { game.status = 'won'; onGameEnd('win'); },
    lose() { game.status = 'over'; onGameEnd('die'); },
    chat(user, text) { onChatMessage({ user, text }); }, // simulate a chat message
  };
}

// ---------- boot ----------
function pickSceneFruit() {
  sceneFruit = fruitId() === MIXED ? randomFruit() : fruitId();
}

function initIcons() {
  paintFruitIcons();
  drawCrown(sizeCanvas($('stat-crown'), 48, 48), 0, 2, 48);
  drawCrown(sizeCanvas($('best-icon'), 30, 30), 0, 1, 30);
  sceneCtx = sizeCanvas(el.scene, SCENE_W, SCENE_H);
}

for (const k of ROLLABLE) resolve(k);
applyTheme();
applySkin();
buildSettings();
initIcons();
el.mute.classList.toggle('on', isMuted());
newGame();
initChat();
showScreen('menu');
requestAnimationFrame((t) => { lastTime = t; frame(t); });
