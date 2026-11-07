// Rebuilds the Figma Motion tag animation (node 1881:6713) as a transparent PNG sequence for Premiere.
// Layers are Figma's own 2x renders of each piece (glass frame, logo + label, 4 tags, cursor); this script
// replays the timeline from get_motion_context: 2 s loop, cursor moves linearly between keyframes,
// each tag jumps from 40% to 100% opacity when the cursor arrives (0.2 s, 0.4 s, 0.6 s).
// Usage: node make-motion-frames.js <layers dir> <out dir> [fps]
const fs = require('fs');
const path = require('path');
const { readImage, writePng } = require('./pixels');

const [layersDir, outDir, fpsArg] = process.argv.slice(2);
const FPS = Number(fpsArg) || 60, DURATION = 2, SCALE = 2;
const W = 1416, H = 374;

const load = (k) => readImage(path.join(layersDir, `${k}.png`), W, H).px; // premultiplied RGBA
const L = Object.fromEntries(['bg', 'static', 'pill1', 'pill2', 'pill3', 'pill4', 'cursor'].map(k => [k, load(k)]));

// Keyframes (fractions of the 2 s timeline) → values in 1x frame pixels, linear in between
const track = (times, values) => (p) => {
  if (p <= times[0]) return values[0];
  for (let i = 1; i < times.length; i++) {
    if (p <= times[i]) { const u = (p - times[i - 1]) / (times[i] - times[i - 1]); return values[i - 1] + (values[i] - values[i - 1]) * u; }
  }
  return values[values.length - 1];
};
const cursorX = track([0, 0.1, 0.2, 0.3, 1], [-23.000977, 216.999023, 25.999023, 261.999023, 261.999023]);
const cursorY = track([0, 0.1, 0.2, 1], [0.759843, 0.759843, 68.999268, 68.999268]);
const tagOn = (at) => (p) => (p >= at ? 1 : 0.4); // jumps to full at its keyframe

// "Source over" in premultiplied space: dst = src*k + dst*(1 - srcA*k)
function over(dst, src, k = 1, dx = 0, dy = 0) {
  const fx = Math.floor(dx), fy = Math.floor(dy), ax = dx - fx, ay = dy - fy;
  const w00 = (1 - ax) * (1 - ay), w10 = ax * (1 - ay), w01 = (1 - ax) * ay, w11 = ax * ay;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      if (dx === 0 && dy === 0) {
        const i = (y * W + x) * 4; r = src[i]; g = src[i + 1]; b = src[i + 2]; a = src[i + 3];
      } else { // bilinear sample of the shifted layer (sub-pixel cursor motion)
        const sx = x - fx - 1, sy = y - fy - 1;
        const s = (xx, yy, wt) => {
          if (wt === 0 || xx < 0 || yy < 0 || xx >= W || yy >= H) return;
          const i = (yy * W + xx) * 4; r += src[i] * wt; g += src[i + 1] * wt; b += src[i + 2] * wt; a += src[i + 3] * wt;
        };
        s(sx + 1, sy + 1, w00); s(sx, sy + 1, w10); s(sx + 1, sy, w01); s(sx, sy, w11);
      }
      if (a === 0) continue;
      const j = (y * W + x) * 4, inv = 1 - (a * k) / 255;
      dst[j] = r * k + dst[j] * inv; dst[j + 1] = g * k + dst[j + 1] * inv;
      dst[j + 2] = b * k + dst[j + 2] * inv; dst[j + 3] = a * k + dst[j + 3] * inv;
    }
  }
}

fs.mkdirSync(outDir, { recursive: true });
const frames = Math.round(FPS * DURATION);
for (let f = 0; f < frames; f++) {
  const p = f / frames; // 0 … just under 1, so the sequence loops seamlessly
  const acc = new Float32Array(W * H * 4);
  over(acc, L.bg);
  over(acc, L.static);
  over(acc, L.pill1, 1);
  over(acc, L.pill2, tagOn(0.1)(p));
  over(acc, L.pill3, tagOn(0.2)(p));
  over(acc, L.pill4, tagOn(0.3)(p));
  over(acc, L.cursor, 1, cursorX(p) * SCALE, cursorY(p) * SCALE);
  // PNG stores straight (un-premultiplied) colour
  const px = Buffer.alloc(W * H * 4);
  for (let i = 0; i < px.length; i += 4) {
    const a = acc[i + 3];
    if (a > 0) {
      px[i] = Math.min(255, Math.round(acc[i] * 255 / a));
      px[i + 1] = Math.min(255, Math.round(acc[i + 1] * 255 / a));
      px[i + 2] = Math.min(255, Math.round(acc[i + 2] * 255 / a));
    }
    px[i + 3] = Math.round(a);
  }
  writePng(path.join(outDir, `figma-motion-tags_${String(f).padStart(4, '0')}.png`), { w: W, h: H, px });
}
console.log(JSON.stringify({ frames, fps: FPS, size: `${W}x${H}` }));
