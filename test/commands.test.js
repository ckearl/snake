import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, matchOption, CommandRouter, loadCommandConfig, COMMANDS } from '../src/commands.js';
import { SKINS, THEMES } from '../src/themes.js';
import { FRUITS } from '../src/fruits.js';
import { SPEEDS } from '../src/game.js';
import { parseIrcLine } from '../src/chat.js';

test('parseCommand: known commands, any case, optional argument', () => {
  assert.deepEqual(parseCommand('!wall'), { name: 'wall', arg: '' });
  assert.deepEqual(parseCommand('  !SIZE  Small '), { name: 'size', arg: 'small' });
  assert.deepEqual(parseCommand('!color pink yellow'), { name: 'color', arg: 'pink yellow' });
  assert.equal(parseCommand('wall'), null, 'needs the !');
  assert.equal(parseCommand('!dance'), null, 'unknown command');
  assert.equal(parseCommand('lol !wall'), null, 'must start the message');
  assert.equal(parseCommand(''), null);
});

test('matchOption: loose names for colours and themes', () => {
  assert.equal(matchOption('red', SKINS), 'red');
  assert.equal(matchOption('Pink-Yellow', SKINS), 'pinkYellow');
  assert.equal(matchOption('pink to yellow', SKINS), 'pinkYellow');
  assert.equal(matchOption('volcano', THEMES), 'volcano');
  assert.equal(matchOption('SNOWFLAKE', THEMES), 'snowflake');
  assert.equal(matchOption('chartreuse', SKINS), null);
  assert.equal(matchOption('', SKINS), null);
});

test('CommandRouter: cooldown per command', () => {
  let t = 0;
  const wall = COMMANDS.wall.cooldown;
  const r = new CommandRouter({ now: () => t, perMinute: 0 });
  assert.equal(r.handle({ user: 'a', text: '!wall' }).action, 'wall');
  t = 1000;
  const cd = r.handle({ user: 'b', text: '!wall' });
  assert.equal(cd.cooldown, wall - 1000, 'still cooling down');
  assert.equal(r.handle({ user: 'b', text: '!fly' }).action, 'fly', 'other commands unaffected');
  t = wall;
  assert.equal(r.handle({ user: 'b', text: '!wall' }).action, 'wall', 'cooldown over');
  assert.equal(r.handle({ user: 'c', text: 'hello chat' }), null);
});

test('CommandRouter: only 3 commands a minute across all of chat, by default', () => {
  let t = 0;
  const r = new CommandRouter({ now: () => t, config: loadCommandConfig(Object.fromEntries(
    Object.keys(COMMANDS).map((n) => [n, { cooldown: 0 }]),
  )) });
  for (const c of ['!wall', '!fly', '!mine']) assert.equal(r.handle({ user: 'a', text: c }).action, c.slice(1));
  t = 10000;
  const no = r.handle({ user: 'b', text: '!box' });
  assert.equal(no.limited, true);
  assert.equal(no.cooldown, 50000, 'free again once the oldest is a minute old');
  t = 60000;
  assert.equal(r.handle({ user: 'b', text: '!box' }).action, 'box');
  r.setPerMinute(0);
  for (let i = 0; i < 10; i++) assert.equal(r.handle({ user: 'c', text: `!${['fly', 'wall', 'mine'][i % 3]}` }).action !== undefined, true);
});

test('command config: cooldowns still at the old defaults move up to the new ones', () => {
  const cfg = loadCommandConfig({ wall: { enabled: true, cooldown: 2000 }, mine: { cooldown: 12000 } });
  assert.equal(cfg.wall.cooldown, COMMANDS.wall.cooldown, 'old default: upgraded');
  assert.equal(cfg.mine.cooldown, 12000, 'the streamer’s own choice: kept');
});

test('command config: an old !fruit setting (board fruit type) carries over to !fruittype', () => {
  const cfg = loadCommandConfig({ fruit: { enabled: false, cooldown: 9000 } });
  assert.deepEqual(cfg.fruittype, { enabled: false, cooldown: 9000 });
  assert.deepEqual(cfg.fruit, { enabled: true, cooldown: COMMANDS.fruit.cooldown });
});


test('parseIrcLine: chat message with tags', () => {
  const m = parseIrcLine('@badges=moderator/1;display-name=CoolViewer;mod=1 :coolviewer!coolviewer@coolviewer.tmi.twitch.tv PRIVMSG #ckearl :!size small');
  assert.equal(m.command, 'PRIVMSG');
  assert.equal(m.channel, 'ckearl');
  assert.equal(m.text, '!size small');
  assert.equal(m.tags['display-name'], 'CoolViewer');
  assert.equal(m.login, 'coolviewer');
});

test('parseIrcLine: PING and JOIN', () => {
  assert.deepEqual(
    { c: parseIrcLine('PING :tmi.twitch.tv').command, t: parseIrcLine('PING :tmi.twitch.tv').text },
    { c: 'PING', t: 'tmi.twitch.tv' },
  );
  assert.equal(parseIrcLine(':justinfan123!justinfan123@justinfan123.tmi.twitch.tv JOIN #ckearl').command, 'JOIN');
});

test('!fruit and !speed parse, with loose names', () => {
  assert.deepEqual(parseCommand('!fruit Water Melon'), { name: 'fruit', arg: 'water melon' });
  assert.deepEqual(parseCommand('!speed bunny'), { name: 'speed', arg: 'bunny' });
  assert.equal(matchOption('water melon', FRUITS), 'watermelon');
  assert.equal(matchOption('JALAPENO', FRUITS), 'jalapeno');
  assert.equal(matchOption('white turnip', FRUITS), 'turnip');
  assert.equal(matchOption('fast', SPEEDS), 'fast');
});

test('command config: defaults, merging saved values, ignoring junk', () => {
  const def = loadCommandConfig();
  for (const [name, c] of Object.entries(COMMANDS)) {
    assert.deepEqual(def[name], { enabled: true, cooldown: c.cooldown });
  }
  const cfg = loadCommandConfig({
    wall: { enabled: false, cooldown: 500 },
    fly: { cooldown: -5 },
    size: { cooldown: 'lots', enabled: 'yes' },
    bogus: { enabled: true },
  });
  assert.deepEqual(cfg.wall, { enabled: false, cooldown: 500 });
  assert.equal(cfg.fly.cooldown, 0, 'clamped to 0');
  assert.deepEqual(cfg.size, { enabled: true, cooldown: COMMANDS.size.cooldown }, 'invalid values fall back');
  assert.ok(!('bogus' in cfg));
});

test('CommandRouter: honours disabled commands and custom cooldowns', () => {
  let t = 0;
  const r = new CommandRouter({ now: () => t, config: loadCommandConfig({ wall: { enabled: false }, fly: { cooldown: 10000 } }) });
  assert.equal(r.handle({ user: 'a', text: '!wall' }), null, 'disabled');
  assert.equal(r.handle({ user: 'a', text: '!fly' }).action, 'fly');
  t = 5000;
  assert.ok(r.handle({ user: 'a', text: '!fly' }).cooldown > 0, 'custom 10s cooldown');
  r.setConfig(loadCommandConfig({ wall: { enabled: true }, fly: { cooldown: 0 } }));
  assert.equal(r.handle({ user: 'a', text: '!wall' }).action, 'wall', 're-enabled live');
  assert.equal(r.handle({ user: 'a', text: '!fly' }).action, 'fly', 'cooldown change applies live');
});

test('chat text cannot reach built-in object properties', () => {
  for (const name of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    assert.equal(parseCommand(`!${name}`), null, name);
  }
  const r = new CommandRouter({ now: () => 0 });
  assert.equal(r.handle({ user: 'x', text: '!constructor' }), null);
  // Option names are matched against own entries only.
  assert.equal(matchOption('constructor', SPEEDS), null);
  assert.equal(matchOption('__proto__', FRUITS), null);
});
