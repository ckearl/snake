// Chat commands → game actions. Pure: no DOM, no network.
//
// The same actions will later be triggered by channel point redemptions, so the
// command layer only decides *which* action runs (and enforces cooldowns); the
// actions themselves are supplied by the game (see main.js).

// name -> { action, cooldown (ms) }
export const COMMANDS = {
  wall: { action: 'wall', cooldown: 2000 },
  fly: { action: 'fly', cooldown: 2000 },
  size: { action: 'size', cooldown: 8000 },
  color: { action: 'color', cooldown: 3000 },
  mapcolor: { action: 'mapcolor', cooldown: 3000 },
  fruit: { action: 'fruit', cooldown: 3000 },
  speed: { action: 'speed', cooldown: 5000 },
};

// "!Size  Small" -> { name: 'size', arg: 'small' }; anything else -> null.
export function parseCommand(text) {
  const m = /^\s*!(\w+)(?:\s+(.*))?$/.exec(text ?? '');
  if (!m) return null;
  const name = m[1].toLowerCase();
  if (!COMMANDS[name]) return null;
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
  constructor({ now = () => Date.now(), commands = COMMANDS } = {}) {
    this.now = now;
    this.commands = commands;
    this.lastRun = new Map(); // command name -> time
  }

  // msg: { user, text }. Returns { action, arg, user } when a command should run,
  // { cooldown: msLeft, ... } when it's still cooling down, or null if it's not a command.
  handle(msg) {
    const cmd = parseCommand(msg.text);
    if (!cmd) return null;
    const def = this.commands[cmd.name];
    const t = this.now();
    const last = this.lastRun.get(cmd.name) ?? -Infinity;
    const left = last + def.cooldown - t;
    if (left > 0) return { cooldown: left, action: def.action, user: msg.user };
    this.lastRun.set(cmd.name, t);
    return { action: def.action, arg: cmd.arg, user: msg.user };
  }
}
