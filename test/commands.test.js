import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, matchOption, CommandRouter } from '../src/commands.js';
import { SKINS, THEMES } from '../src/themes.js';
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
