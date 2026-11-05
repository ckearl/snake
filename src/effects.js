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
