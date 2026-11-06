// Read-only Twitch chat over WebSocket (IRC), logged in anonymously — no account
// or token needed just to read a channel's chat.

const CHAT_URL = 'wss://irc-ws.chat.twitch.tv:443';

// Parse one IRC line, e.g.
// "@display-name=Foo;mod=1 :foo!foo@foo.tmi.twitch.tv PRIVMSG #chan :!wall"
// -> { tags: {...}, command: 'PRIVMSG', channel: 'chan', text: '!wall', login: 'foo' }
export function parseIrcLine(line) {
  let rest = line;
  const tags = {};
  if (rest.startsWith('@')) {
    const sp = rest.indexOf(' ');
    for (const kv of rest.slice(1, sp).split(';')) {
      const eq = kv.indexOf('=');
      tags[kv.slice(0, eq)] = kv.slice(eq + 1);
    }
    rest = rest.slice(sp + 1);
  }
  let prefix = '';
  if (rest.startsWith(':')) {
    const sp = rest.indexOf(' ');
    prefix = rest.slice(1, sp);
    rest = rest.slice(sp + 1);
  }
  const colon = rest.indexOf(' :');
  const head = colon === -1 ? rest : rest.slice(0, colon);
  const text = colon === -1 ? '' : rest.slice(colon + 2);
  const [command, ...params] = head.split(' ');
  return {
    tags,
    command,
    channel: params[0]?.replace(/^#/, '') ?? '',
    text,
    login: prefix.split('!')[0],
  };
}

// Connects to a channel and calls onMessage({ user, text, isMod }) for each
// chat message. Reconnects with backoff if the connection drops.
export class TwitchChat {
  constructor({ onMessage, onStatus = () => {} }) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.ws = null;
    this.channel = null;
    this.retry = 0;
    this.closedByUs = false;
  }

  connect(channel) {
    this.disconnect();
    this.channel = channel.toLowerCase().replace(/^#/, '');
    this.closedByUs = false;
    this.open();
  }

  disconnect() {
    this.closedByUs = true;
    clearTimeout(this.retryTimer);
    if (this.ws) this.ws.close();
    this.ws = null;
    this.onStatus('off');
  }

  open() {
    this.onStatus('connecting');
    const ws = new WebSocket(CHAT_URL);
    this.ws = ws;
    ws.onopen = () => {
      ws.send('CAP REQ :twitch.tv/tags');
      ws.send('PASS SCHMOOPIIE'); // ignored for anonymous logins
      ws.send(`NICK justinfan${Math.floor(10000 + Math.random() * 80000)}`);
      ws.send(`JOIN #${this.channel}`);
    };
    ws.onmessage = (e) => {
      for (const line of String(e.data).split('\r\n')) {
        if (line) this.handleLine(line);
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws || this.closedByUs) return;
      this.onStatus('connecting');
      const delay = Math.min(30000, 1000 * 2 ** this.retry++);
      this.retryTimer = setTimeout(() => this.open(), delay);
    };
  }

  handleLine(line) {
    const msg = parseIrcLine(line);
    if (msg.command === 'PING') {
      this.ws?.send(`PONG :${msg.text}`);
    } else if (msg.command === 'JOIN' || msg.command === 'ROOMSTATE') {
      this.retry = 0;
      this.onStatus('on');
    } else if (msg.command === 'PRIVMSG') {
      const badges = msg.tags.badges ?? '';
      this.onMessage({
        user: msg.tags['display-name'] || msg.login,
        text: msg.text,
        isMod: msg.tags.mod === '1' || badges.includes('broadcaster/'),
      });
    }
  }
}
