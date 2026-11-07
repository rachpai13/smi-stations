// Makes the white glass of the open airplane window (window.png) transparent so the galaxy shows
// through. Flood-fills the white glass from its centre, clears it, and softens the 1–2px edge where
// the glass meets the grey rim. Also prints the glass bounds (in window.png pixels) for placing the folder.
// Usage: node clear-window-glass.js <in.png> <out.png>
const { readImage, writePng } = require('./pixels');
const [inFile, outFile] = process.argv.slice(2);
const W = 612, H = 612;
const { px } = readImage(inFile, W, H); // premultiplied, but the window is fully opaque here
const lum = (i) => 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];

const glass = new Uint8Array(W * H);
const stack = [[306, 330]];
while (stack.length) {
  const [x, y] = stack.pop();
  if (x < 0 || y < 0 || x >= W || y >= H) continue;
  const p = y * W + x;
  if (glass[p] || px[p * 4 + 3] < 255 || lum(p * 4) < 248) continue;
  glass[p] = 1;
  stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
}

const out = Buffer.from(px);
let minX = W, minY = H, maxX = 0, maxY = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const p = y * W + x, i = p * 4;
  if (glass[p]) {
    out[i] = out[i + 1] = out[i + 2] = out[i + 3] = 0;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    continue;
  }
  // Edge pixels touching the glass: keep the rim colour, fade out the white part of the blend
  let near = false;
  for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) {
    const q = (y + dy) * W + (x + dx);
    if (q >= 0 && q < W * H && glass[q]) { near = true; break; }
  }
  const a0 = px[i + 3];
  if (a0 > 0 && a0 < 255) { // soft outer edge: PNG stores straight colour
    for (let c = 0; c < 3; c++) out[i + c] = Math.min(255, Math.round(px[i + c] * 255 / a0));
  }
  if (near) {
    const l = lum(i);
    if (l > 200) {
      const a = Math.max(0, Math.min(1, (255 - l) / 55)); // 200 → opaque rim, 255 → clear
      const rim = 190; // rim grey the blend is mixed from
      out[i] = out[i + 1] = out[i + 2] = Math.round(rim);
      out[i + 3] = Math.round(a * 255);
    }
  }
}
writePng(outFile, { w: W, h: H, px: out });
console.log(JSON.stringify({ glass: { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 } }));
