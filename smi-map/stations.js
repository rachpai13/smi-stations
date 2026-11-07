// SMI Stations: a zoomable galaxy of airplane windows, one per student, shared through Supabase.
import { supabase } from './supabase.js';
import { makeSeats } from './stations-data.js';
import { openTrack, closeTrack } from './racetrack.js';

const DESIGN_W = 888;          // Figma frame width
const SIZE = 322;              // window size in world px
const DX = 262;                // gap between windows in a row
const FAR_BELOW = 70;          // window smaller than this on screen → show as a star
const BUCKET = 'stations';
const URL_TTL = 60 * 60;       // signed file links last an hour
const MAX_BYTES = 20 * 1024 * 1024;

const galaxy = document.getElementById('galaxy');
const world = document.getElementById('world');
const starsCanvas = document.getElementById('stars');
const tip = document.getElementById('tip');
const toast = document.getElementById('toast');
const loading = document.getElementById('loading');
const tpl = document.getElementById('stationTpl');


/* ---------------- Session ---------------- */

// No login screen: visitors get a guest (anonymous) Supabase account automatically.
// If that isn't available yet (Supabase not set up), the page falls back to a local preview,
// which shows the design but saves nothing. stations.html?preview forces the preview.
let PREVIEW = new URLSearchParams(location.search).has('preview');

let session = null;
if (!PREVIEW) {
  ({ data: { session } } = await supabase.auth.getSession());
  if (!session) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) console.warn('Guest sign-in unavailable, showing preview:', error.message);
    session = data?.session ?? null;
  }
  if (!session) PREVIEW = true;
}
let uid = PREVIEW ? 'preview' : session.user.id;

/* ---------------- Data ---------------- */

let rows = [];           // stations from the database, in seat order
let seats = [];          // [{ x, y, el, cx, cy, row|null }]
let mySeat = null;

async function ensureMyStation() {
  const { data } = await supabase.from('stations').select('id').eq('id', uid).maybeSingle();
  if (data) return;
  // Guests have no email; they can set their name in their folder.
  const name = session.user.email ? session.user.email.split('@')[0].split('.')[0] : 'Guest';
  const { error } = await supabase.from('stations').insert({ id: uid, name: name.charAt(0).toUpperCase() + name.slice(1) });
  if (error && error.code !== '23505') throw error; // 23505 = already exists (another tab)
}

async function signedUrls(paths) {
  const list = [...new Set(paths.filter(Boolean))];
  if (!list.length) return {};
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(list, URL_TTL);
  if (error) { console.error(error); return {}; }
  return Object.fromEntries(data.filter(d => d.signedUrl).map(d => [d.path, d.signedUrl]));
}

async function loadStations() {
  if (PREVIEW) {
    let coverUrl = 'assets/stations/pixel-character.png';
    try { coverUrl = URL.createObjectURL(await trimToBlob(await (await fetch(coverUrl)).blob())); } catch { /* use as-is */ }
    rows = [{ id: uid, seat: 1, name: 'You', year: '2nd year', major: 'Visual Communication', is_open: true,
      cover_path: null, coverUrl }];
    return;
  }
  const { data, error } = await supabase
    .from('stations')
    .select('id, seat, slot, name, year, major, is_open, cover_path')
    .order('seat');
  if (error) throw error;
  rows = data;
  const urls = await signedUrls(rows.map(r => r.cover_path));
  for (const r of rows) r.coverUrl = r.cover_path ? urls[r.cover_path] : null;
}

/* ---------------- Build the galaxy ---------------- */

function build() {
  const positions = makeSeats(rows.length + 30);
  if (seats.length !== positions.length) {
    world.replaceChildren();
    seats = positions.map((p, i) => {
      const el = tpl.content.firstElementChild.cloneNode(true);
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
      el.dataset.index = i;
      world.append(el);
      return { ...p, el, cx: p.x + SIZE / 2, cy: p.y + SIZE / 2, row: null };
    });
  }
  // Windows someone picked (slot) go there; everyone else fills the free seats in joining order.
  const placed = new Array(seats.length).fill(null);
  const unplaced = [];
  for (const r of rows) {
    if (!r.coverUrl && r.id !== uid) continue; // only people who've put a character up get a window
    if (Number.isInteger(r.slot) && r.slot >= 0 && r.slot < placed.length && !placed[r.slot]) placed[r.slot] = r;
    else unplaced.push(r);
  }
  let free = 0;
  for (const r of unplaced) {
    while (free < placed.length && placed[free]) free++;
    if (free < placed.length) placed[free] = r;
  }

  // One window per person: once your character is up, empty windows no longer offer you a "+".
  const boarded = !!rows.find(r => r.id === uid)?.coverUrl;

  seats.forEach((seat, i) => {
    const row = placed[i];
    seat.row = row;
    const isMe = row?.id === uid;
    seat.el.classList.toggle('me', isMe);
    seat.el.classList.toggle('empty', !row);
    // A "+" sits on empty windows (until you've boarded), and on yours until you've added your character.
    const addable = (!row && !boarded) || (isMe && !row.coverUrl);
    seat.el.classList.toggle('addable', addable);
    const cover = seat.el.querySelector('.cover');
    if (row?.coverUrl) cover.src = row.coverUrl; else cover.removeAttribute('src');
    seat.el.setAttribute('aria-label', !row ? 'Empty window: add your character here'
      : `${isMe ? 'Your station' : row.name}${row.year ? `, ${row.year}` : ''}${row.major ? `, ${row.major}` : ''}${row.is_open ? '' : ', friends only'}${addable ? ': add your character' : ''}`);
  });
  mySeat = seats.find(s => s.row?.id === uid);
  computeBounds();
  apply();
}

const me = () => mySeat?.row;

let bounds;
function computeBounds() {
  bounds = seats.reduce((b, s) => ({
    minX: Math.min(b.minX, s.x), maxX: Math.max(b.maxX, s.x + SIZE),
    minY: Math.min(b.minY, s.y), maxY: Math.max(b.maxY, s.y + SIZE),
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
}

/* ---------------- Camera ---------------- */

const cam = { s: 1, tx: 0, ty: 0 };
const baseScale = () => Math.min(innerWidth / DESIGN_W, 0.6);
const minScale = () => Math.min(innerWidth / (bounds.maxX - bounds.minX), innerHeight / (bounds.maxY - bounds.minY)) * 0.55;
const maxScale = () => baseScale() * 2.2;

function homeView() {
  const s = baseScale();
  // My window sits where it does in the Figma frame (top-left of the first row).
  const anchor = mySeat ?? seats[0];
  return { s, tx: Math.max(0, (innerWidth - DESIGN_W * s) / 2) + (24 - anchor.x) * s, ty: (202 - anchor.y) * s };
}

function clampCam() {
  cam.s = Math.min(maxScale(), Math.max(minScale(), cam.s));
  cam.tx = Math.min(innerWidth / 2 - bounds.minX * cam.s, Math.max(innerWidth / 2 - bounds.maxX * cam.s, cam.tx));
  cam.ty = Math.min(innerHeight / 2 - bounds.minY * cam.s, Math.max(innerHeight / 2 - bounds.maxY * cam.s, cam.ty));
}

let frameQueued = false;
function apply() {
  if (!bounds) return; // galaxy not built yet
  clampCam();
  world.style.transform = `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.s})`;
  world.style.setProperty('--inv', String(1 / cam.s));
  world.classList.toggle('far', SIZE * cam.s < FAR_BELOW);
  if (!frameQueued) {
    frameQueued = true;
    requestAnimationFrame(() => { frameQueued = false; drawStars(); updateSpotlight(); positionTip(); });
  }
}

function zoomAt(sx, sy, factor) {
  const s = Math.min(maxScale(), Math.max(minScale(), cam.s * factor));
  const k = s / cam.s;
  cam.tx = sx - (sx - cam.tx) * k;
  cam.ty = sy - (sy - cam.ty) * k;
  cam.s = s;
  apply();
}

let flight = 0;
function flyTo(target, ms = 600) {
  cancelAnimationFrame(flight);
  const from = { ...cam };
  const t0 = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const step = (now) => {
    const t = Math.min(1, (now - t0) / ms);
    const e = ease(t);
    cam.s = from.s + (target.s - from.s) * e;
    cam.tx = from.tx + (target.tx - from.tx) * e;
    cam.ty = from.ty + (target.ty - from.ty) * e;
    apply();
    if (t < 1) flight = requestAnimationFrame(step);
  };
  flight = requestAnimationFrame(step);
}

function zoomBy(factor) {
  const s = Math.min(maxScale(), Math.max(minScale(), cam.s * factor));
  const cx = innerWidth / 2, cy = innerHeight / 2;
  flyTo({ s, tx: cx - (cx - cam.tx) * (s / cam.s), ty: cy - (cy - cam.ty) * (s / cam.s) }, 350);
}

function viewCentredOn(seat) {
  const s = baseScale();
  return { s, tx: innerWidth / 2 - seat.cx * s, ty: innerHeight * 0.45 - seat.cy * s };
}

/* ---------------- Background stars ---------------- */

const stars = Array.from({ length: 420 }, () => ({
  x: Math.random(), y: Math.random(), r: Math.random() * 1.2 + 0.3, a: Math.random() * 0.6 + 0.2, d: Math.random() * 0.12 + 0.03,
}));

function drawStars() {
  const dpr = devicePixelRatio || 1;
  const w = innerWidth, h = innerHeight;
  if (starsCanvas.width !== Math.round(w * dpr) || starsCanvas.height !== Math.round(h * dpr)) {
    starsCanvas.width = Math.round(w * dpr); starsCanvas.height = Math.round(h * dpr);
  }
  const ctx = starsCanvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#191919';
  ctx.fillRect(0, 0, w, h);
  const zoomOut = Math.min(1, Math.max(0, (baseScale() - cam.s) / baseScale()));
  const glow = 0.35 + 0.65 * zoomOut;
  for (const st of stars) {
    const x = (((st.x * w + cam.tx * st.d) % w) + w) % w;
    const y = (((st.y * h + cam.ty * st.d) % h) + h) % h;
    ctx.globalAlpha = st.a * glow;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y, st.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* ---------------- Spotlight: nearest 3 to the cursor/finger ---------------- */

let focus = null; // screen point, or null → my row (me + the two next to me, as in the design)
let lit = new Set();

function updateSpotlight() {
  if (!seats.length) return;
  const anchor = mySeat ?? seats[0];
  const fx = focus ? (focus.x - cam.tx) / cam.s : anchor.cx + DX;
  const fy = focus ? (focus.y - cam.ty) / cam.s : anchor.cy;
  const next = new Set(seats
    .map(s => ({ s, d: Math.hypot(s.cx - fx, (s.cy - fy) * 1.8) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3)
    .map(n => n.s));
  for (const s of lit) if (!next.has(s)) s.el.classList.remove('lit');
  for (const s of next) s.el.classList.add('lit');
  lit = next;
}

/* ---------------- Hover card ---------------- */

let tipFor = null;
const seatOf = (el) => seats[Number(el.dataset.index)];

function describe(seat) {
  const r = seat.row;
  if (!r) return seat.el.classList.contains('addable')
    ? { name: 'Empty window', meta: 'Tap + to add your character here' }
    : { name: 'Empty window', meta: 'Waiting for a student to board' };
  const isMe = r.id === uid;
  const details = [r.year, r.major].filter(Boolean).join(' · ') || (isMe ? 'Add your year and major' : '');
  const privacy = r.is_open ? (isMe ? 'Window open: everyone can peek in' : '') : 'Friends only';
  return { name: isMe ? `${r.name} (you)` : r.name, meta: [details, privacy].filter(Boolean).join('\n') };
}

function showTip(seat) {
  tipFor = seat;
  const { name, meta } = describe(seat);
  tip.querySelector('.tip-name').textContent = name;
  tip.querySelector('.tip-meta').textContent = meta;
  tip.hidden = false;
  positionTip();
}
function hideTip() { tipFor = null; tip.hidden = true; }
function positionTip() {
  if (!tipFor) return;
  if (world.classList.contains('far') && !tipFor.el.matches(':hover, :focus-visible')) return hideTip();
  const x = cam.tx + tipFor.cx * cam.s;
  const top = cam.ty + (tipFor.y + (world.classList.contains('far') ? SIZE / 2 - 10 / cam.s : 40)) * cam.s;
  tip.style.left = `${Math.min(innerWidth - 90, Math.max(90, x))}px`;
  tip.style.top = `${Math.max(tip.offsetHeight + 16, top)}px`;
}

world.addEventListener('pointerover', (e) => {
  const el = e.target.closest('.station');
  if (el && e.pointerType === 'mouse' && !drag) showTip(seatOf(el));
});
world.addEventListener('pointerout', (e) => {
  const el = e.target.closest('.station');
  if (el && !el.contains(e.relatedTarget)) hideTip();
});
world.addEventListener('focusin', (e) => {
  const el = e.target.closest('.station');
  if (!el) return;
  const seat = seatOf(el);
  focus = { x: cam.tx + seat.cx * cam.s, y: cam.ty + seat.cy * cam.s };
  updateSpotlight();
  showTip(seat);
});
world.addEventListener('focusout', hideTip);

/* ---------------- Pan, pinch and zoom ---------------- */

const pointers = new Map();
let drag = null;
let pinch = null;
let suppressClick = false;

galaxy.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  cancelAnimationFrame(flight);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) drag = { moved: 0 };
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) };
  }
  focus = { x: e.clientX, y: e.clientY };
  updateSpotlight();
});

addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) {
    if (e.pointerType === 'mouse' && e.target.closest('#galaxy')) {
      focus = { x: e.clientX, y: e.clientY };
      updateSpotlight();
    }
    return;
  }
  const prev = pointers.get(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size === 2 && pinch) {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    cam.tx += (e.clientX - prev.x) / 2;
    cam.ty += (e.clientY - prev.y) / 2;
    zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, dist / pinch.dist);
    pinch.dist = dist;
    if (drag) drag.moved = 99;
  } else if (drag) {
    cam.tx += e.clientX - prev.x;
    cam.ty += e.clientY - prev.y;
    drag.moved += Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y);
    if (drag.moved > 6) { galaxy.classList.add('is-dragging'); hideTip(); }
    focus = { x: e.clientX, y: e.clientY };
    apply();
  }
});

function endPointer(e) {
  if (!pointers.delete(e.pointerId)) return;
  if (pointers.size < 2) pinch = null;
  if (pointers.size === 0) {
    if (drag?.moved > 6) suppressClick = true;
    drag = null;
    galaxy.classList.remove('is-dragging');
  }
}
addEventListener('pointerup', endPointer);
addEventListener('pointercancel', endPointer);

galaxy.addEventListener('wheel', (e) => {
  e.preventDefault();
  cancelAnimationFrame(flight);
  hideTip();
  const trackpadPan = !e.ctrlKey && e.deltaMode === 0 && (Math.abs(e.deltaX) > 0 || Math.abs(e.deltaY) < 40);
  if (trackpadPan) {
    cam.tx -= e.deltaX;
    cam.ty -= e.deltaY;
    apply();
  } else {
    const speed = e.ctrlKey ? 0.01 : 0.0018;
    zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : speed)));
  }
}, { passive: false });

addEventListener('keydown', (e) => {
  if (e.target.closest('input, dialog')) return;
  if (e.key === '+' || e.key === '=') zoomBy(1.6);
  if (e.key === '-' || e.key === '_') zoomBy(1 / 1.6);
});
// The navbar stays on top of the track screen: map toggles the track, home closes it and flies home.
const trackOpen = () => !document.getElementById('trackView').hidden;
document.getElementById('openTrack').addEventListener('click', () => {
  if (trackOpen()) return closeTrack();
  openTrack({
    supabase, uid, preview: PREVIEW,
    people: rows.map(r => ({ id: r.id, name: r.name, coverUrl: r.coverUrl })),
  });
});

addEventListener('resize', apply);

/* ---------------- Clicking a window ---------------- */

world.addEventListener('click', (e) => {
  const el = e.target.closest('.station');
  if (!el) return;
  if (suppressClick) { suppressClick = false; return; }
  const seat = seatOf(el);

  if (world.classList.contains('far')) return flyTo(viewCentredOn(seat));
  // "+" on an empty window (or on yours before you've added a character): upload a character here.
  if (seat.el.classList.contains('addable')) return addCharacterAt(seat.row ? null : Number(seat.el.dataset.index));
  if (!seat.row) { // empty window, but you've already boarded
    say('You already have a window. Taking you there.');
    if (mySeat) flyTo(viewCentredOn(mySeat));
    return;
  }
  if (seat.row.id !== uid && !seat.row.is_open) return say(`${seat.row.name.split(' ')[0]}'s window is friends only.`);
  // In an open window, the folder opens that person's work (Enter/Space on the window does the same).
  if (seat.el.classList.contains('open') && (e.target.closest('.win-folder') || e.detail === 0)) return openFolder(seat);
  // Tap slides the window open; tap again slides it shut. Only one window is open at a time.
  const opening = !seat.el.classList.contains('open');
  seats.forEach(s => s.el.classList.remove('open'));
  if (opening) seat.el.classList.add('open');
}, true);

let toastTimer;
function say(text) {
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

document.getElementById('home').addEventListener('click', () => {
  if (trackOpen()) closeTrack();
  focus = null;
  flyTo(homeView());
});

/* ---------------- Search ---------------- */

const search = document.getElementById('search');
const results = document.getElementById('results');

search.addEventListener('input', () => {
  const q = search.value.trim().toLowerCase();
  results.replaceChildren();
  if (!q) { results.hidden = true; return; }
  const matches = seats.filter(s => s.row && `${s.row.name} ${s.row.major}`.toLowerCase().includes(q)).slice(0, 6);
  if (!matches.length) {
    const li = document.createElement('li');
    li.className = 'none';
    li.textContent = 'No stations found';
    results.append(li);
  }
  for (const seat of matches) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    const name = document.createElement('span');
    const meta = document.createElement('small');
    name.textContent = seat.row.id === uid ? `${seat.row.name} (you)` : seat.row.name;
    meta.textContent = seat.row.major || '';
    b.append(name, meta);
    b.addEventListener('click', () => {
      results.hidden = true;
      search.value = '';
      focus = { x: innerWidth / 2, y: innerHeight * 0.45 };
      flyTo(viewCentredOn(seat));
      setTimeout(() => showTip(seat), 650);
    });
    li.append(b);
    results.append(li);
  }
  results.hidden = false;
});
search.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') results.querySelector('button')?.click();
  if (e.key === 'Escape') { search.value = ''; results.hidden = true; }
});

/* ---------------- Covers ---------------- */

// Crop away empty/white margins so a pixel character fills the window glass. Returns a PNG blob.
async function trimToBlob(file) {
  const url = URL.createObjectURL(file);
  try {
    // onload rather than decode(): decode() can stall in background tabs.
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const empty = data[i + 3] < 16 || (data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245);
        if (!empty) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
    }
    if (x1 < 0) return file;
    const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.04);
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
    x1 = Math.min(width - 1, x1 + pad); y1 = Math.min(height - 1, y1 + pad);
    const out = document.createElement('canvas');
    out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
    out.getContext('2d').drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    return await new Promise(res => out.toBlob(res, 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ---------------- Folder overlay ---------------- */

const folder = document.getElementById('folder');
const worksEl = document.getElementById('works');
const mineControls = document.getElementById('mineControls');
const privacy = document.getElementById('privacy');
const fields = { name: document.getElementById('myName'), year: document.getElementById('myYear'), major: document.getElementById('myMajor') };
let openSeat = null;
let works = [];

async function openFolder(seat) {
  openSeat = seat;
  hideTip();
  works = [];
  renderFolder({ loading: true });
  if (!folder.open) folder.showModal();
  await loadWorks();
}

async function loadWorks() {
  const seat = openSeat;
  if (PREVIEW) { works = []; return renderFolder(); }
  const { data, error } = await supabase
    .from('station_works')
    .select('id, path, type, title, created_at')
    .eq('station_id', seat.row.id)
    .order('created_at');
  if (seat !== openSeat) return;
  if (error) { say(`Couldn't load work: ${error.message}`); return renderFolder(); }
  const urls = await signedUrls(data.map(w => w.path));
  works = data.map(w => ({ ...w, url: urls[w.path] }));
  renderFolder();
}

function renderFolder({ loading = false } = {}) {
  const r = openSeat.row;
  const isMe = r.id === uid;
  document.getElementById('folderName').textContent = r.name;
  document.getElementById('folderMeta').textContent = [r.year, r.major].filter(Boolean).join(' · ');
  const mini = folder.querySelector('.mini-glass img');
  if (r.coverUrl) mini.src = r.coverUrl; else mini.removeAttribute('src');
  folder.setAttribute('aria-label', `${r.name}'s folder`);

  mineControls.hidden = !isMe;
  if (isMe) {
    if (document.activeElement?.closest('.fields') == null) {
      fields.name.value = r.name;
      fields.year.value = r.year;
      fields.major.value = r.major;
    }
    privacy.setAttribute('aria-pressed', String(r.is_open));
    privacy.textContent = r.is_open ? 'Window open: public' : 'Friends only';
  }

  worksEl.replaceChildren();
  if (loading || !works.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = loading ? 'Opening folder…' : isMe ? 'Nothing here yet. Upload your first piece!' : 'Nothing uploaded yet.';
    worksEl.append(p);
    return;
  }

  for (const w of works) {
    const fig = document.createElement('figure');
    fig.className = 'work';
    const media = w.type.startsWith('video/') ? document.createElement('video') : document.createElement('img');
    media.className = 'art';
    if (w.url) media.src = w.url;
    if (media.tagName === 'VIDEO') Object.assign(media, { muted: true, loop: true, autoplay: true, playsInline: true });
    else { media.alt = w.title; media.loading = 'lazy'; }
    const cap = document.createElement('figcaption');
    const label = document.createElement('span');
    label.textContent = w.title;
    cap.append(label);
    if (isMe) {
      const remove = document.createElement('button');
      remove.className = 'remove';
      remove.textContent = 'Remove';
      remove.addEventListener('click', () => removeWork(w));
      cap.append(remove);
    }
    fig.append(media, cap);
    worksEl.append(fig);
  }
}

document.getElementById('closeFolder').addEventListener('click', () => folder.close());
folder.addEventListener('click', (e) => { if (e.target === folder) folder.close(); });
folder.addEventListener('close', () => {
  // The window stays open behind the folder; tap it to slide it shut.
  openSeat = null;
});

/* ---------------- Editing my station ---------------- */

const channel = supabase.channel('stations');
channel.on('broadcast', { event: 'changed' }, () => refresh()).subscribe();
const announce = () => channel.send({ type: 'broadcast', event: 'changed', payload: {} });

async function updateMe(patch) {
  const { error } = await supabase.from('stations').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', uid);
  if (error) { say(`Couldn't save: ${error.message}`); return false; }
  Object.assign(me(), patch);
  build();
  announce();
  return true;
}

let saveTimer;
for (const [key, input] of Object.entries(fields)) {
  input.addEventListener('input', () => {
    const value = input.value.trim();
    if (key === 'name' && !value) return;
    me()[key] = value;
    document.getElementById('folderName').textContent = me().name;
    document.getElementById('folderMeta').textContent = [me().year, me().major].filter(Boolean).join(' · ');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => updateMe({ name: me().name, year: me().year, major: me().major }), 600);
  });
}

privacy.addEventListener('click', async () => {
  privacy.setAttribute('aria-busy', 'true');
  await updateMe({ is_open: !me().is_open });
  privacy.removeAttribute('aria-busy');
  renderFolder();
  say(me().is_open ? 'Your window is open. Everyone can see your work.' : 'Your window is friends only.');
});

const ext = (file) => (file.name.split('.').pop() || 'bin').toLowerCase();

// Put a character on your window. With `slot`, your window also moves to that seat (the "+" you tapped).
async function setCharacter(file, slot = null) {
  if (!file) return;
  // One window per person: claiming a new window is only possible before your character is up.
  if (slot !== null && me()?.coverUrl) return say('You already have a window.');
  if (!file.type.startsWith('image/')) return say('Your character must be an image.');
  const blob = await trimToBlob(file);

  if (PREVIEW) { // nothing is saved in preview; show it on this screen only
    me().coverUrl = URL.createObjectURL(blob);
    if (slot !== null) me().slot = slot;
    build();
    slideOpenMine();
    return say('Your character is on the window! (preview: not saved)');
  }

  const path = `covers/${uid}/${crypto.randomUUID()}.png`;
  const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/png' });
  if (up.error) return say(`Upload failed: ${up.error.message}`);
  const old = me().cover_path;
  const patch = slot === null ? { cover_path: path } : { cover_path: path, slot };
  const { error } = await supabase.from('stations').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', uid);
  if (error) {
    supabase.storage.from(BUCKET).remove([path]);
    return say(error.code === '23505' ? 'Someone just took that window. Pick another +.' : `Couldn't save: ${error.message}`);
  }
  if (old) supabase.storage.from(BUCKET).remove([old]);
  announce();
  await refresh();
  slideOpenMine();
  say('Your character is on the window!');
}

// Let the character be seen for a moment, then slide your window open.
function slideOpenMine() {
  const el = mySeat?.el;
  if (!el) return;
  setTimeout(() => {
    seats.forEach(s => s.el.classList.remove('open'));
    el.classList.add('open');
  }, 700);
}

document.getElementById('coverInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  const label = e.target.closest('.pill-btn');
  label.setAttribute('aria-busy', 'true');
  try { await setCharacter(file); } finally { label.removeAttribute('aria-busy'); }
});

// The "+" on an empty window: pick a character image and claim that window.
const addInput = document.getElementById('addCharInput');
let pendingSlot = null;
function addCharacterAt(index) {
  pendingSlot = index;
  addInput.click();
}
addInput.addEventListener('change', async () => {
  const file = addInput.files[0];
  addInput.value = '';
  const slot = pendingSlot;
  pendingSlot = null;
  await setCharacter(file, slot);
});

document.getElementById('workInput').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  const ok = files.filter(f => (f.type.startsWith('image/') || f.type.startsWith('video/')) && f.size <= MAX_BYTES);
  if (ok.length < files.length) say('Some files were skipped (images or videos up to 20 MB).');
  if (!ok.length) return;
  const label = e.target.closest('.pill-btn');
  label.setAttribute('aria-busy', 'true');
  let added = 0;
  for (const f of ok) {
    const path = `works/${uid}/${crypto.randomUUID()}.${ext(f)}`;
    const up = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type });
    if (up.error) { say(`Upload failed: ${up.error.message}`); continue; }
    const { error } = await supabase.from('station_works').insert({
      station_id: uid, path, type: f.type, title: f.name.replace(/\.[^.]+$/, '').slice(0, 80),
    });
    if (error) { say(`Saved the file but not the entry: ${error.message}`); continue; }
    added++;
  }
  label.removeAttribute('aria-busy');
  if (added) { say(`Uploaded ${added} piece${added === 1 ? '' : 's'}.`); announce(); }
  await loadWorks();
});

async function removeWork(w) {
  if (!confirm(`Remove "${w.title}"?`)) return;
  const { error } = await supabase.from('station_works').delete().eq('id', w.id);
  if (error) return say(`Couldn't remove: ${error.message}`);
  await supabase.storage.from(BUCKET).remove([w.path]);
  announce();
  await loadWorks();
}

// No login step, so there's nothing to log out of.
document.getElementById('logout').hidden = true;

/* ---------------- Start ---------------- */

async function refresh() {
  try {
    await loadStations();
    build();
    if (openSeat) {
      openSeat = seats.find(s => s.row?.id === openSeat.row.id) ?? null;
      if (openSeat) await loadWorks(); else folder.close();
    }
  } catch (err) {
    console.error(err);
    say(`Couldn't refresh: ${err.message}`);
  }
}

function enterPreview() {
  PREVIEW = true;
  uid = 'preview';
  // Nothing is saved in preview: block the edit controls.
  for (const id of ['coverInput', 'workInput']) document.getElementById(id).disabled = true;
  mineControls.addEventListener('click', (e) => {
    if (e.target.closest('.pill-btn')) { e.preventDefault(); e.stopImmediatePropagation(); say('Preview: changes aren’t saved yet.'); }
  }, true);
}

async function start() {
  if (!PREVIEW) await ensureMyStation();
  await loadStations();
  build();
  Object.assign(cam, homeView());
  apply();
  loading.hidden = true;
}

if (PREVIEW) enterPreview();
try {
  await start();
} catch (err) {
  // Supabase tables not set up yet (or unreachable): show the design anyway.
  console.warn('Falling back to preview:', err.message);
  enterPreview();
  try { await start(); } catch (e) { console.error(e); loading.textContent = `Couldn't load stations: ${e.message}`; }
}
