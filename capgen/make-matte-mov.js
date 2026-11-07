// Builds a transparent ProRes 4444 .mov from two Figma renders of the same animation:
// one over pure black, one over pure white. For each pixel, black = colour × alpha and
// white = colour × alpha + (1 − alpha), so alpha = 1 − (white − black) and colour = black / alpha.
// Pixels outside the frame's rounded corners are made fully transparent.
// Usage: node make-matte-mov.js <ffmpeg> <black.mp4> <white.mp4> <out.mov> <w> <h> <frames> <cornerRadiusPx>
const { spawn } = require('child_process');

const [ffmpeg, blackFile, whiteFile, outFile, wArg, hArg, framesArg, rArg] = process.argv.slice(2);
const W = Number(wArg), H = Number(hArg), FRAMES = Number(framesArg), R = Number(rArg);
const IN = W * H * 3, OUT = W * H * 4;

const decode = (file) => spawn(ffmpeg, ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { stdio: ['ignore', 'pipe', 'inherit'] });
const enc = spawn(ffmpeg, ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-framerate', '60', '-i', '-',
  '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-alpha_bits', '16', '-vendor', 'apl0', outFile], { stdio: ['pipe', 'inherit', 'inherit'] });

// Coverage of the rounded-rectangle frame (anti-aliased by 1px)
const mask = new Float32Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const cx = Math.min(Math.max(x + 0.5, R), W - R), cy = Math.min(Math.max(y + 0.5, R), H - R);
  const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - R; // > 0 outside the corner arc
  mask[y * W + x] = Math.max(0, Math.min(1, 0.5 - d));
}

// Pull whole frames off a decoder stream
function reader(proc) {
  const chunks = []; let have = 0, waiting = null, ended = false;
  proc.stdout.on('data', (d) => { chunks.push(d); have += d.length; flush(); });
  proc.stdout.on('end', () => { ended = true; flush(); });
  function take() { // copy exactly one frame out of the queued chunks
    const f = Buffer.allocUnsafe(IN); let off = 0;
    while (off < IN) {
      const c = chunks[0], n = Math.min(c.length, IN - off);
      c.copy(f, off, 0, n); off += n;
      if (n === c.length) chunks.shift(); else chunks[0] = c.subarray(n);
    }
    have -= IN;
    return f;
  }
  function flush() {
    if (!waiting) return;
    if (have >= IN) { const w = waiting; waiting = null; w(take()); }
    else if (ended) { const w = waiting; waiting = null; w(null); }
  }
  return () => new Promise((res) => { waiting = res; flush(); });
}

(async () => {
  const nextB = reader(decode(blackFile)), nextW = reader(decode(whiteFile));
  let alphaSum = 0, frames = 0;
  for (let f = 0; f < FRAMES; f++) {
    const [b, w] = await Promise.all([nextB(), nextW()]);
    if (!b || !w) break;
    const out = Buffer.alloc(OUT);
    for (let i = 0, j = 0, p = 0; p < W * H; p++, i += 3, j += 4) {
      const diff = ((w[i] - b[i]) + (w[i + 1] - b[i + 1]) + (w[i + 2] - b[i + 2])) / 3;
      let a = 1 - diff / 255;
      if (a < 0.015) a = 0; else if (a > 0.985) a = 1; // video-compression noise
      a *= mask[p];
      if (a > 0) {
        out[j] = Math.min(255, Math.round(b[i] / a));
        out[j + 1] = Math.min(255, Math.round(b[i + 1] / a));
        out[j + 2] = Math.min(255, Math.round(b[i + 2] / a));
      }
      out[j + 3] = Math.round(a * 255);
      alphaSum += a;
    }
    if (!enc.stdin.write(out)) await new Promise((r) => enc.stdin.once('drain', r));
    frames++;
  }
  enc.stdin.end();
  enc.on('close', (code) => console.log(JSON.stringify({ frames, meanAlpha: +(alphaSum / (frames * W * H)).toFixed(3), exit: code })));
})();
