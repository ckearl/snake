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
  // Wall drops in: a short low thunk.
  wall() {
    if (muted) return;
    tone(150, 0, 0.09, { type: 'triangle', vol: 0.09, to: 70 });
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
