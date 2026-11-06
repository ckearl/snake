// Chat commands → game actions. Pure: no DOM, no network.
//
// The same actions will later be triggered by channel point redemptions, so the
// command layer only decides *which* action runs (and enforces cooldowns); the
// actions themselves are supplied by the game (see main.js).

// name -> { action, cooldown (ms, default), help (shown in the stream panel) }
export const COMMANDS = {
  wall: { action: 'wall', cooldown: 2000, help: 'Adds a wall block' },
  fly: { action: 'fly', cooldown: 2000, help: 'Adds a bonus flying fruit' },
  size: { action: 'size', cooldown: 8000, help: 'Changes the board size' },
  color: { action: 'color', cooldown: 3000, help: 'Changes the snake colour' },
  mapcolor: { action: 'mapcolor', cooldown: 3000, help: 'Changes the board colour' },
  fruit: { action: 'fruit', cooldown: 3000, help: 'Changes the fruit type' },
  speed: { action: 'speed', cooldown: 5000, help: 'Changes the snake speed' },
};

// The streamer's per-command settings: { name: { enabled, cooldown (ms) } }.
// Merges whatever was saved over the defaults, ignoring anything invalid, so new
// commands show up enabled and old saves never break things.
export const MAX_COOLDOWN = 10 * 60 * 1000;
export function loadCommandConfig(saved = {}) {
  const config = {};
  for (const [name, def] of Object.entries(COMMANDS)) {
    const s = saved?.[name] ?? {};
    const cd = Number(s.cooldown);
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

// Tracks cooldowns and turns chat messages into action requests.
export class CommandRouter {
  constructor({ now = () => Date.now(), config = loadCommandConfig() } = {}) {
    this.now = now;
    this.config = config;
    this.lastRun = new Map(); // command name -> time
  }

  setConfig(config) {
    this.config = config;
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
    this.lastRun.set(cmd.name, t);
    return { action, arg: cmd.arg, user: msg.user };
  }
}
