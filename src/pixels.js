// Tiny pixel-sprite toolkit. A sprite is a 2D array of CSS colours (null = transparent).

export function grid(w, h) {
  return Array.from({ length: h }, () => Array(w).fill(null));
}

export function put(px, x, y, c) {
  if (px[y] && x >= 0 && x < px[y].length) px[y][x] = c;
}

// Paint a char map; unknown chars (e.g. '.') are left untouched.
export function map(px, rows, colors, ox = 0, oy = 0) {
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (colors[ch]) put(px, x + ox, y + oy, colors[ch]);
    });
  });
}

// Fill an (optionally rotated) ellipse. colorAt gets normalised coords:
// dx, dy in ellipse space (-1..1), d = distance from centre (0..1), plus x, y.
export function ellipse(px, cx, cy, rx, ry, colorAt, rot = 0) {
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  for (let y = 0; y < px.length; y++) {
    for (let x = 0; x < px[0].length; x++) {
      const ox = x + 0.5 - cx;
      const oy = y + 0.5 - cy;
      const u = (ox * cos + oy * sin) / rx;
      const v = (-ox * sin + oy * cos) / ry;
      const d = Math.hypot(u, v);
      if (d > 1) continue;
      const c = colorAt({ dx: ox / rx, dy: oy / ry, u, v, d, x, y });
      if (c) px[y][x] = c;
    }
  }
}

// Classic top-left lit sphere shading.
export const shaded = ({ base, light, dark }) => ({ dx, dy, d }) => {
  const s = dx + dy;
  if (d > 0.78 && s > 0.25) return dark;
  if (s < -0.8 && d < 0.9) return light;
  return base;
};

export function sprite(w, h, paint) {
  const px = grid(w, h);
  paint(px);
  return px;
}

// Add a 1px outline around every filled pixel (for sprites on light backgrounds).
export function outline(px, color) {
  const h = px.length;
  const w = px[0].length;
  const filled = (x, y) => y >= 0 && y < h && x >= 0 && x < w && px[y][x] && px[y][x] !== color;
  const add = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[y][x]) continue;
      if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) add.push([x, y]);
    }
  }
  for (const [x, y] of add) px[y][x] = color;
}
