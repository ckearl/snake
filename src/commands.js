// Chat commands → game actions. Pure: no DOM, no network.
//
// The same actions will later be triggered by channel point redemptions, so the
// command layer only decides *which* action runs (and enforces cooldowns); the
// actions themselves are supplied by the game (see main.js).

// name -> { action, cooldown (ms, default), group, usage (the word shown after
// the command for ones that take an argument), help (hover text in the panel) }.
// Listed in the order the stream panel shows them, alike ones together.
export const COMMANDS = {
  // Drop something in to eat (any mode). All take an optional fruit, e.g. !box pineapple.
  fruit: { action: 'fruit', cooldown: 20000, group: 'Drop fruit', usage: 'fruit', help: 'Drops a bonus fruit' },
  fly: { action: 'fly', cooldown: 20000, group: 'Drop fruit', usage: 'fruit', help: 'Drops a bonus flying fruit' },
  shield: { action: 'shield', cooldown: 30000, group: 'Drop fruit', usage: 'fruit', help: 'Drops a fruit with walls on it' },
  portal: { action: 'portal', cooldown: 30000, group: 'Drop fruit', usage: 'fruit', help: 'Opens a portal (a linked fruit pair)' },
  key: { action: 'key', cooldown: 30000, group: 'Drop fruit', usage: 'fruit', help: 'Drops a key and the lock it opens' },
  box: { action: 'box', cooldown: 30000, group: 'Drop fruit', usage: 'fruit', help: 'Drops a box and its target' },
  poison: { action: 'poison', cooldown: 45000, group: 'Drop fruit', usage: 'fruit', help: 'Drops a fruit and a poison one' },
  // Hazards.
  wall: { action: 'wall', cooldown: 30000, group: 'Hazards', help: 'Adds a wall block' },
  mine: { action: 'mine', cooldown: 45000, group: 'Hazards', help: 'Lays a mine field' },
  // The snake.
  twin: { action: 'twin', cooldown: 60000, group: 'Snake', help: 'Twin snake for the next 5 fruits' },
  speed: { action: 'speed', cooldown: 30000, group: 'Snake', usage: 'speed', help: 'Changes the snake speed' },
  color: { action: 'color', cooldown: 15000, group: 'Snake', usage: 'color', help: 'Changes the snake colour' },
  // The board.
  mapcolor: { action: 'mapcolor', cooldown: 15000, group: 'Board', usage: 'map', help: 'Changes the board colour' },
  fruittype: { action: 'fruittype', cooldown: 20000, group: 'Board', usage: 'fruit', help: 'Changes the fruit on the board' },
  size: { action: 'size', cooldown: 60000, group: 'Board', usage: 'size', help: 'Changes the board size' },
};

// All chat commands together can only run this many times a minute (the
// streamer can change it; 0 = no limit).
export const DEFAULT_PER_MINUTE = 3;
export const MAX_PER_MINUTE = 60;

// Cooldowns from before they were raised. A saved cooldown still at its old
// default was never chosen by the streamer, so it moves up to the new one.
const OLD_DEFAULTS = {
  wall: 2000, fly: 2000, shield: 3000, key: 3000, box: 3000, mine: 4000, twin: 8000,
  portal: 3000, poison: 3000, size: 8000, color: 3000, mapcolor: 3000, fruit: 3000, speed: 5000,
};

// The streamer's per-command settings: { name: { enabled, cooldown (ms) } }.
// Merges whatever was saved over the defaults, ignoring anything invalid, so new
// commands show up enabled and old saves never break things.
export const MAX_COOLDOWN = 10 * 60 * 1000;
export function loadCommandConfig(saved = {}) {
  const config = {};
  // !fruit used to change the board's fruit; that's !fruittype now, so a saved
  // !fruit setting from before belongs to !fruittype.
  const legacy = saved && !Object.hasOwn(saved, 'fruittype') && Object.hasOwn(saved, 'fruit');
  for (const [name, def] of Object.entries(COMMANDS)) {
    let from = name;
    if (legacy && name === 'fruittype') from = 'fruit';
    else if (legacy && name === 'fruit') from = null;
    const s = (from && saved && Object.hasOwn(saved, from) ? saved[from] : null) ?? {};
    let cd = Number(s.cooldown);
    if (cd === OLD_DEFAULTS[from]) cd = NaN; // never changed: take the new default
    config[name] = {
      enabled: typeof s.enabled === 'boolean' ? s.enabled : true,
      cooldown: Number.isFinite(cd) ? Math.min(MAX_COOLDOWN, Math.max(0, cd)) : def.cooldown,
    };
  }
  return config;
}

// "!Size  Small" -> { name: 'size', arg: 'small' }; anything else -> null.
export function parseCommand(text) {
  const m = /^\s*!(\w+)(?:\s+(.*))?$/.exec(text ?? '');
  if (!m) return null;
  const name = m[1].toLowerCase();
  if (!Object.hasOwn(COMMANDS, name)) return null; // own keys only: chat text is untrusted
  return { name, arg: (m[2] ?? '').trim().toLowerCase() };
}

// Loose match of a user-typed option against { id: { name } } tables:
// case, spaces and punctuation don't matter ("Pink-Yellow", "pinkyellow", "pink to yellow").
const squash = (s) => s.toLowerCase().replace(/\bto\b/g, '').replace(/[^a-z0-9]/g, '');
export function matchOption(arg, table) {
  if (!arg) return null;
  const want = squash(arg);
  for (const [id, opt] of Object.entries(table)) {
    if (squash(id) === want || squash(opt.name ?? '') === want) return id;
  }
  return null;
}

// Tracks cooldowns (each command's own, and the shared per-minute limit) and
// turns chat messages into action requests.
export class CommandRouter {
  constructor({ now = () => Date.now(), config = loadCommandConfig(), perMinute = DEFAULT_PER_MINUTE } = {}) {
    this.now = now;
    this.config = config;
    this.perMinute = perMinute;
    this.lastRun = new Map(); // command name -> time
    this.recent = []; // times of the commands run in the last minute (all of them)
  }

  setConfig(config) {
    this.config = config;
  }

  setPerMinute(n) {
    this.perMinute = n;
  }

  // msg: { user, text }. Returns { action, arg, user } when a command should run,
  // { cooldown: msLeft, ... } when it's still cooling down, or null if it's not a command.
  handle(msg) {
    const cmd = parseCommand(msg.text);
    if (!cmd) return null;
    const settings = Object.hasOwn(this.config, cmd.name) ? this.config[cmd.name] : null;
    if (!settings?.enabled) return null; // turned off by the streamer
    const { action } = COMMANDS[cmd.name];
    const t = this.now();
    const last = this.lastRun.get(cmd.name) ?? -Infinity;
    const left = last + settings.cooldown - t;
    if (left > 0) return { cooldown: left, action, user: msg.user };
    // The shared limit: only so many commands a minute, whoever sends them.
    this.recent = this.recent.filter((r) => r > t - 60000);
    if (this.perMinute > 0 && this.recent.length >= this.perMinute) {
      return { cooldown: this.recent[0] + 60000 - t, limited: true, action, user: msg.user };
    }
    this.recent.push(t);
    this.lastRun.set(cmd.name, t);
    return { action, arg: cmd.arg, user: msg.user };
  }
}
