// Lifts the glowing folder icon off its dark navy background (light-on-dark extraction):
// each pixel = bg × (1 − a) + colour × a, with a taken from how far the pixel rises above the background.
// The dark background becomes transparent; the glow and frosted panel keep partial transparency.
// Usage: node cut-folder-icon.js <in.png> <out.png> <size>
const { readImage, writePng } = require('./pixels');
const [inFile, outFile, sizeArg] = process.argv.slice(2);
const S = Number(sizeArg);
const { px } = readImage(inFile, S, S);

// Background colour: median of the border pixels
const border = [];
for (let k = 0; k < S; k++) for (const [x, y] of [[k, 0], [k, S - 1], [0, k], [S - 1, k]]) {
  const i = (y * S + x) * 4; border.push([px[i], px[i + 1], px[i + 2]]);
}
const med = (c) => border.map(b => b[c]).sort((a, b) => a - b)[border.length >> 1];
const bg = [med(0), med(1), med(2)];

const out = Buffer.alloc(S * S * 4);
let minX = S, minY = S, maxX = 0, maxY = 0;
for (let p = 0; p < S * S; p++) {
  const i = p * 4;
  let a = 0;
  for (let c = 0; c < 3; c++) a = Math.max(a, Math.max(0, px[i + c] - bg[c]) / (255 - bg[c]));
  if (a < 0.02) continue; // background (and its compression noise)
  for (let c = 0; c < 3; c++) out[i + c] = Math.min(255, Math.round(bg[c] + Math.max(0, px[i + c] - bg[c]) / a));
  out[i + 3] = Math.round(a * 255);
  const x = p % S, y = (p / S) | 0;
  if (a > 0.06) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
}
// Crop to the visible icon (plus its glow) with a little room
const pad = 6;
const x0 = Math.max(0, minX - pad), y0 = Math.max(0, minY - pad), x1 = Math.min(S - 1, maxX + pad), y1 = Math.min(S - 1, maxY + pad);
const cw = x1 - x0 + 1, ch = y1 - y0 + 1, crop = Buffer.alloc(cw * ch * 4);
for (let y = 0; y < ch; y++) out.copy(crop, y * cw * 4, ((y + y0) * S + x0) * 4, ((y + y0) * S + x1 + 1) * 4);
writePng(outFile, { w: cw, h: ch, px: crop });
console.log(JSON.stringify({ bg, crop: { x0, y0, w: cw, h: ch } }));
