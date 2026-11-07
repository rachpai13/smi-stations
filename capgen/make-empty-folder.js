// Makes the empty version of the glass folder from the original folder image (345×345):
// removes the blue document and refills the glass panel where the document showed through,
// copying each row's panel colour from a part of the panel the document doesn't cover.
// Output is the same 345×345 image on its dark background; run cut-folder-icon.js on it with the
// same crop as folder.png so the two line up exactly.
// Usage: node make-empty-folder.js <in.png> <out.png>
const { readImage, writePng } = require('./pixels');
const [inFile, outFile] = process.argv.slice(2);
const S = 345;
const { px } = readImage(inFile, S, S);
const out = Buffer.from(px);
const BG = [1, 14, 23];

// Panel geometry (image pixels): left/right edges, tab top, right-part top, bottom
const LEFT = 68, RIGHT = 262, TAB_TOP = 121, RIGHT_TOP = 150;
const TAB_END = 145, SLOPE_END = TAB_END + (RIGHT_TOP - TAB_TOP); // 45° slope
const DOC_X0 = 86, DOC_X1 = 244;                                   // columns the document affects
const REF_LEFT = 78, REF_RIGHT = 252;                              // clean panel columns
const BORDER = [146, 153, 161];

const set = (x, y, c) => { const i = (y * S + x) * 4; out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = 255; };
const get = (x, y) => { const i = (y * S + x) * 4; return [px[i], px[i + 1], px[i + 2]]; };
const topAt = (x) => (x <= TAB_END ? TAB_TOP : x >= SLOPE_END ? RIGHT_TOP : TAB_TOP + (x - TAB_END));

for (let x = DOC_X0; x <= DOC_X1; x++) {
  const top = topAt(x);
  for (let y = 40; y < 290; y++) {
    if (y < top - 1) { set(x, y, BG); continue; }                 // document sticking out above the folder
    if (x > TAB_END && x < SLOPE_END && Math.abs(y - top) <= 1) { // redraw the sloped tab edge
      set(x, y, BORDER); continue;
    }
    // inside the panel (and its bottom edge/shadow): copy the clean column for this row
    set(x, y, get(x <= TAB_END ? REF_LEFT : REF_RIGHT, y));
  }
}
// The document's glow also spilled a few px past its sides above the folder
for (let y = 40; y < RIGHT_TOP - 1; y++) for (let x = DOC_X0 - 6; x <= DOC_X1 + 6; x++) {
  if (x >= LEFT && x <= RIGHT && y >= topAt(x) - 1) continue;
  if (x < LEFT - 2 || x > RIGHT + 2 || y < topAt(Math.min(Math.max(x, LEFT), RIGHT)) - 1) set(x, y, BG);
}
writePng(outFile, { w: S, h: S, px: out });
console.log('ok');
