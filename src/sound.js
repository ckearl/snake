// Tiny square-wave sound effects via WebAudio. No audio files needed.

let ac = null;
let muted = false;
try { muted = localStorage.getItem('snake.muted') === '1'; } catch { /* ignore */ }

function audio() {
  if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
  if (ac.state === 'suspended') ac.resume();
  return ac;
}

function tone(freq, start, dur, { type = 'square', vol = 0.05, to = null } = {}) {
  const a = audio();
  const t0 = a.currentTime + start;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// A short burst of filtered noise (for puffs and pomfs).
function noise(start, dur, { vol = 0.08, freq = 900, to = 200 } = {}) {
  const a = audio();
  const t0 = a.currentTime + start;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(freq, t0);
  filter.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const gain = a.createGain();
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(gain).connect(a.destination);
  src.start(t0);
}

export const sfx = {
  eat() {
    if (muted) return;
    tone(660, 0, 0.06);
    tone(990, 0.06, 0.08);
  },
  die() {
    if (muted) return;
    tone(330, 0, 0.45, { type: 'sawtooth', vol: 0.04, to: 70 });
  },
  // Celebratory jingle: quick rising run, a sparkly trill, then a held top note.
  win() {
    if (muted) return;
    const run = [523, 659, 784, 1047, 1319];
    run.forEach((f, i) => tone(f, i * 0.07, 0.09, { vol: 0.045 }));
    const t = run.length * 0.07;
    [1568, 1319, 1568, 1319, 1568].forEach((f, i) => tone(f, t + i * 0.05, 0.05, { vol: 0.03 }));
    tone(2093, t + 0.27, 0.32, { vol: 0.04 });
    tone(1047, t + 0.27, 0.32, { type: 'triangle', vol: 0.05 });
  },
  // Portal: a quick warbling rise.
  portal() {
    if (muted) return;
    tone(330, 0, 0.16, { type: 'triangle', vol: 0.07, to: 1320 });
    tone(660, 0.05, 0.12, { vol: 0.025, to: 1760 });
  },
  // Yin Yang flip: a quick down-up swap.
  flip() {
    if (muted) return;
    tone(880, 0, 0.07, { vol: 0.045, to: 440 });
    tone(440, 0.07, 0.09, { vol: 0.045, to: 990 });
  },
  // Wall drops in: a short low thunk.
  wall() {
    if (muted) return;
    tone(150, 0, 0.09, { type: 'triangle', vol: 0.09, to: 70 });
  },
  // Box mode: a soft scrape for each push, a bright pop when the fruit comes out.
  push() {
    if (muted) return;
    tone(95, 0, 0.07, { type: 'triangle', vol: 0.05, to: 80 });
  },
  release() {
    if (muted) return;
    tone(392, 0, 0.06, { type: 'triangle', vol: 0.07, to: 784 });
    tone(1175, 0.06, 0.1, { vol: 0.03 });
  },
  // Poison: a queasy, wobbling slide down. Cure: a little "phew" back up.
  poison() {
    if (muted) return;
    tone(520, 0, 0.12, { type: 'triangle', vol: 0.07, to: 300 });
    tone(340, 0.12, 0.18, { type: 'triangle', vol: 0.06, to: 160 });
  },
  cure() {
    if (muted) return;
    tone(440, 0, 0.07, { type: 'triangle', vol: 0.05 });
    tone(660, 0.07, 0.1, { type: 'triangle', vol: 0.05 });
  },
  // Mines: a field lands with two soft blips; clearing one sparkles.
  mine() {
    if (muted) return;
    tone(260, 0, 0.05, { type: 'triangle', vol: 0.05 });
    tone(260, 0.09, 0.05, { type: 'triangle', vol: 0.04 });
  },
  clear() {
    if (muted) return;
    [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.055, 0.08, { type: 'triangle', vol: 0.05 }));
  },
  // Mine goes off: a soft, muffled pomf with a little low thump, then a sad slide.
  boom() {
    if (muted) return;
    noise(0, 0.45, { vol: 0.12, freq: 1100, to: 140 });
    tone(140, 0, 0.22, { type: 'triangle', vol: 0.1, to: 45 });
    tone(330, 0.28, 0.35, { type: 'sawtooth', vol: 0.025, to: 90 });
  },
  // A turn: a tiny, quiet blip with its own note per direction (all from one
  // pentatonic scale, so weaving around plays a little tune). Each one chirps
  // the way it's heading: up and right lift, down and left dip.
  turn(dir) {
    if (muted) return;
    const [f, to] = {
      up: [880, 990], right: [784, 860], left: [659, 600], down: [587, 530],
    }[dir] ?? [700, 700];
    tone(f, 0, 0.045, { type: 'triangle', vol: 0.045, to });
    tone(f * 2, 0, 0.025, { vol: 0.008 });
  },
  // New high score: a quick bright sparkle up.
  record() {
    if (muted) return;
    [1047, 1319, 1568].forEach((f, i) => tone(f, i * 0.06, 0.07, { vol: 0.035 }));
    tone(2093, 0.18, 0.18, { type: 'triangle', vol: 0.05 });
  },
  start() {
    if (muted) return;
    tone(523, 0, 0.07);
    tone(784, 0.08, 0.1);
  },
};

export function isMuted() { return muted; }

export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('snake.muted', m ? '1' : '0'); } catch { /* ignore */ }
}
