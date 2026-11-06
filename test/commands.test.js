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
  const r = new CommandRouter({ now: () => t });
  assert.equal(r.handle({ user: 'a', text: '!wall' }).action, 'wall');
  t = 1000;
  const cd = r.handle({ user: 'b', text: '!wall' });
  assert.equal(cd.cooldown, 1000, 'still cooling down');
  assert.equal(r.handle({ user: 'b', text: '!fly' }).action, 'fly', 'other commands unaffected');
  t = 2000;
  assert.equal(r.handle({ user: 'b', text: '!wall' }).action, 'wall', 'cooldown over');
  assert.equal(r.handle({ user: 'c', text: 'hello chat' }), null);
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
