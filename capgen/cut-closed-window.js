// Cuts the closed airplane window out of the reference photo (closed-ref.png, 1125×1398) so it sits on
// the dark galaxy. The outer edge is traced every half degree (sharpest brightness change near a fitted
// superellipse), smoothed, and everything outside it becomes transparent.
// Writes window-closed.png (cropped, 2× the size used on the site).
// Usage: node cut-closed-window.js
const path = require('path');
const fs = require('fs');
const { Resvg } = require('@resvg/resvg-js');
const { readImage, writePng } = require('./pixels');

const SRC = path.join(__dirname, 'closed-ref.png');
const OUT = path.join(__dirname, '..', 'smi-map', 'assets', 'stations', 'window-closed.png');

// Starting guess for the frame outline (reference-image pixels), crop box, edge softness
const CX = 561, CY = 690, A = 494, B = 652, N = 2.5, FEATHER = 2;
const X0 = 60, Y0 = 30, X1 = 1070, Y1 = 1352;

const { w, h, px } = readImage(SRC, 1125, 1398);
const cw = X1 - X0, ch = Y1 - Y0;
const out = Buffer.alloc(cw * ch * 4);
const lumAt = (x, y) => {
  const xi = Math.max(0, Math.min(w - 1, Math.round(x))), yi = Math.max(0, Math.min(h - 1, Math.round(y)));
  const i = (yi * w + xi) * 4;
  return 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
};

const superR = (t) => 1 / Math.pow(Math.pow(Math.abs(Math.cos(t)) / A, N) + Math.pow(Math.abs(Math.sin(t)) / B, N), 1 / N);
const STEPS = 720;
const edge = new Float64Array(STEPS);
for (let k = 0; k < STEPS; k++) {
  const t = (k / STEPS) * 2 * Math.PI, c = Math.cos(t), s = Math.sin(t);
  const R = superR(t);
  const L = (r) => lumAt(CX + c * r, CY + s * r);
  let best = R, bestG = -1;
  for (let r = R * 0.95; r <= R * 1.04; r += 0.5) {
    const g = Math.abs((L(r - 1) + L(r - 2) + L(r - 3)) - (L(r + 1) + L(r + 2) + L(r + 3))) / 3;
    if (g > bestG) { bestG = g; best = r; }
  }
  edge[k] = best;
}
// 1) median filter to drop stray points, 2) keep only the broad shape (first few Fourier terms),
// so the outline is one smooth curve with no wobbles, then pull it in slightly so no wall shows.
const median = Float64Array.from(edge, (_, k) => {
  const win = []; for (let j = -12; j <= 12; j++) win.push(edge[(k + j + STEPS) % STEPS]);
  return win.sort((a, b) => a - b)[12];
});
const HARMONICS = 8, INSET = 3;
const coef = [];
for (let m = 0; m <= HARMONICS; m++) {
  let ca = 0, sa = 0;
  for (let k = 0; k < STEPS; k++) { const t = (k / STEPS) * 2 * Math.PI; ca += median[k] * Math.cos(m * t); sa += median[k] * Math.sin(m * t); }
  coef.push([(m === 0 ? 1 : 2) * ca / STEPS, (m === 0 ? 1 : 2) * sa / STEPS]);
}
const smooth = Float64Array.from(median, (_, k) => {
  const t = (k / STEPS) * 2 * Math.PI;
  let r = 0; coef.forEach(([ca, sa], m) => { r += ca * Math.cos(m * t) + sa * Math.sin(m * t); });
  return r - INSET;
});
const edgeAt = (t) => {
  const f = ((t / (2 * Math.PI)) * STEPS + STEPS) % STEPS, k = Math.floor(f), u = f - k;
  return smooth[k] * (1 - u) + smooth[(k + 1) % STEPS] * u;
};

for (let y = 0; y < ch; y++) {
  for (let x = 0; x < cw; x++) {
    const sx = x + X0, sy = y + Y0, dx = sx - CX, dy = sy - CY;
    const distPx = edgeAt(Math.atan2(dy, dx)) - Math.hypot(dx, dy);
    const alpha = Math.max(0, Math.min(1, distPx / FEATHER + 0.5));
    const si = (sy * w + sx) * 4, di = (y * cw + x) * 4;
    out[di] = px[si]; out[di + 1] = px[si + 1]; out[di + 2] = px[si + 2];
    out[di + 3] = Math.round(alpha * 255);
  }
}

const tmp = path.join(__dirname, 'window-closed-full.png');
writePng(tmp, { w: cw, h: ch, px: out });
const b64 = fs.readFileSync(tmp).toString('base64');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${cw}" height="${ch}"><image width="${cw}" height="${ch}" xlink:href="data:image/png;base64,${b64}"/></svg>`;
const small = new Resvg(svg, { fitTo: { mode: 'width', value: 408 } }).render();
fs.writeFileSync(OUT, small.asPng());
fs.unlinkSync(tmp);
console.log(JSON.stringify({ out: { w: small.width, h: small.height } }));
