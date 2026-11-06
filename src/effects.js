// Small celebratory / comedic effects drawn on the board canvas.
// Everything is a pure function of elapsed time, so there's no per-frame state.

const FIREWORK_COLORS = ['#FFD34D', '#FF6B8B', '#5BD1FF', '#FFFFFF', '#9BFF6A', '#FFA94D'];
const RISE_MS = 380; // rocket climbs from the bottom edge
const GRAVITY = 2.6; // cells / s²

// Plan a short fireworks show over a cols×rows board (cell units).
export function makeFireworks(cols, rows, rng = Math.random) {
  const bursts = [];
  const count = 6;
  for (let i = 0; i < count; i++) {
    const n = 14 + Math.floor(rng() * 6);
    const particles = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rng() * 0.3;
      const speed = 2 + rng() * 1.6;
      particles.push({ vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 850 + rng() * 350 });
    }
    bursts.push({
      launch: i * 330 + rng() * 120,
      x: 1.5 + rng() * (cols - 3),
      y: 1 + rng() * Math.max(1, rows * 0.55),
      fromY: rows + 0.5,
      color: FIREWORK_COLORS[Math.floor(rng() * FIREWORK_COLORS.length)],
      particles,
    });
  }
  return bursts;
}

// Draw the show at `ms` since it started.
export function drawFireworks(ctx, bursts, ms, cell) {
  const px = Math.max(2, Math.round(cell * 0.11));
  const dot = (x, y, color, alpha) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x * cell - px / 2), Math.round(y * cell - px / 2), px, px);
  };
  for (const b of bursts) {
    const t = ms - b.launch;
    if (t < 0) continue;
    if (t < RISE_MS) {
      // Rising rocket with a two-pixel trail.
      const k = 1 - (1 - t / RISE_MS) ** 2;
      const y = b.fromY + (b.y - b.fromY) * k;
      dot(b.x, y, b.color, 1);
      dot(b.x, y + 0.18, b.color, 0.5);
      dot(b.x, y + 0.36, b.color, 0.25);
      continue;
    }
    const s = (t - RISE_MS) / 1000;
    for (const p of b.particles) {
      const age = (t - RISE_MS) / p.life;
      if (age >= 1) continue;
      // Ease the outward speed down so bursts bloom then droop.
      const travel = s * (1 - 0.45 * Math.min(1, s / (p.life / 1000)));
      const x = b.x + p.vx * travel;
      const y = b.y + p.vy * travel + 0.5 * GRAVITY * s * s;
      const twinkle = age > 0.6 && Math.floor(t / 60) % 2 ? 0.5 : 1;
      dot(x, y, b.color, (1 - age) * twinkle);
    }
  }
  ctx.globalAlpha = 1;
}

// Little stars circling a dizzy head. (cx, cy) is the orbit centre in pixels.
export function drawDizzyStars(ctx, cx, cy, cell, ms, alpha = 1) {
  const u = Math.max(1, Math.round(cell / 16));
  const phase = (ms / 1000) * Math.PI * 1.6;
  ctx.globalAlpha = alpha;
  for (let k = 0; k < 3; k++) {
    const a = phase + (k * Math.PI * 2) / 3;
    const x = Math.round(cx + Math.cos(a) * cell * 0.5);
    const y = Math.round(cy + Math.sin(a) * cell * 0.16);
    ctx.fillStyle = '#FFD34D';
    ctx.fillRect(x - u, y - u * 2, u * 2, u * 4); // vertical arm
    ctx.fillRect(x - u * 2, y - u, u * 4, u * 2); // horizontal arm
    ctx.fillStyle = '#FFF4C2';
    ctx.fillRect(x - u, y - u, u * 2, u * 2); // bright centre
  }
  ctx.globalAlpha = 1;
}

// Gentle confetti for a cleared mine field: a soft pop upward, then the pieces
// drift down, swaying side to side and fluttering, and fade out.
// (cx, cy) is the field's centre in cell units.
const CONFETTI_COLORS = ['#FFD34D', '#FF8FA3', '#7FD4FF', '#B6F07A', '#FFFFFF', '#C9A2FF'];
export const CONFETTI_MS = 2200;

export function makeConfetti(cx, cy, accent, rng = Math.random) {
  const colors = [...CONFETTI_COLORS, accent];
  return Array.from({ length: 24 }, () => ({
    x: cx + (rng() - 0.5) * 2.6,
    y: cy + (rng() - 0.5) * 2.2,
    pop: -(1.2 + rng() * 1.3), // initial upward speed, cells/s
    fall: 0.55 + rng() * 0.4, // gentle drift-down speed, cells/s
    sway: 0.15 + rng() * 0.2, // side-to-side, cells
    freq: 2.5 + rng() * 2.5, // rad/s
    phase: rng() * Math.PI * 2,
    life: 1500 + rng() * (CONFETTI_MS - 1500),
    color: colors[Math.floor(rng() * colors.length)],
  }));
}

export function drawConfetti(ctx, pieces, ms, cell) {
  const u = Math.max(2, Math.round(cell * 0.07));
  const t = ms / 1000;
  for (const p of pieces) {
    if (ms >= p.life) continue;
    // Velocity eases from the pop to the steady fall.
    const y = p.y + p.fall * t + ((p.pop - p.fall) * (1 - Math.exp(-4 * t))) / 4;
    const x = p.x + p.sway * Math.sin(p.freq * t + p.phase);
    const k = ms / p.life;
    ctx.globalAlpha = k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45;
    ctx.fillStyle = p.color;
    // Flutter: the piece turns, so its width breathes.
    const w = Math.max(1, Math.round(u * 1.6 * Math.abs(Math.cos(p.freq * 1.4 * t + p.phase))));
    ctx.fillRect(Math.round(x * cell - w / 2), Math.round(y * cell - u / 2), w, u);
  }
  ctx.globalAlpha = 1;
}

// Mines mode death: a soft "pomf" rather than a big bang. A brief warm flash, a
// ring of light spreading out, a few embers arcing away, and grey smoke puffs
// that swell, drift up and sway, and fade. (cx, cy) is the blast centre in cell units.
export const BLAST_MS = 1700;
const EMBER_COLORS = ['#FFD34D', '#FFA94D', '#FF7A4D', '#FFF4C2'];

export function makeBlast(cx, cy, rng = Math.random) {
  const embers = Array.from({ length: 8 }, (_, k) => {
    const a = (k / 8) * Math.PI * 2 + rng() * 0.5;
    const speed = 1.6 + rng() * 1.2;
    return {
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 1.2,
      life: 450 + rng() * 300, color: EMBER_COLORS[k % EMBER_COLORS.length],
    };
  });
  const smoke = Array.from({ length: 9 }, () => ({
    x: cx + (rng() - 0.5) * 1.1,
    y: cy + (rng() - 0.5) * 0.8,
    delay: 40 + rng() * 220,
    rise: 0.45 + rng() * 0.35, // cells/s
    sway: 0.08 + rng() * 0.1,
    phase: rng() * Math.PI * 2,
    life: 900 + rng() * (BLAST_MS - 1100),
    shade: rng() < 0.5 ? '#9A938E' : '#B7B0AA',
  }));
  return { cx, cy, embers, smoke };
}

export function drawBlast(ctx, blast, ms, cell) {
  const { cx, cy } = blast;
  const u = Math.max(2, Math.round(cell * 0.07));
  const sq = (x, y, s, color, alpha) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x * cell - s / 2), Math.round(y * cell - s / 2), s, s);
  };

  // Flash: a soft disc of warm light, gone in a blink.
  if (ms < 220) {
    const k = ms / 220;
    const r = cell * (0.55 + 0.6 * k);
    ctx.globalAlpha = 0.45 * (1 - k);
    ctx.fillStyle = '#FFE9A8';
    ctx.beginPath();
    ctx.arc(cx * cell, cy * cell, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Ring of pixel dots spreading out and fading.
  if (ms < 520) {
    const k = ms / 520;
    const r = 0.35 + 1.45 * (1 - (1 - k) ** 2);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      sq(cx + Math.cos(a) * r, cy + Math.sin(a) * r, u, '#FFC46B', 0.8 * (1 - k));
    }
  }
  // Embers: arc outward, droop, and wink out.
  const s = ms / 1000;
  for (const e of blast.embers) {
    const age = ms / e.life;
    if (age >= 1) continue;
    const twinkle = age > 0.6 && Math.floor(ms / 70) % 2 ? 0.5 : 1;
    sq(cx + e.vx * s * (1 - 0.4 * age), cy + e.vy * s + 2.2 * s * s, u, e.color, (1 - age) * twinkle);
  }
  // Smoke: little puffs that swell as they rise, then thin away.
  for (const p of blast.smoke) {
    const t = ms - p.delay;
    if (t < 0 || t >= p.life) continue;
    const k = t / p.life;
    const x = p.x + p.sway * Math.sin(t / 260 + p.phase);
    const y = p.y - p.rise * (t / 1000);
    const size = Math.round(u * (2.6 + 3 * k));
    sq(x, y, size, p.shade, 0.65 * (k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8));
  }
  ctx.globalAlpha = 1;
}
