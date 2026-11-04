// Campus Track (Figma node 1715:6795): the card stays pinned while you scroll.
// The track snakes through three columns: down 1–8, right along the bottom, up 9–16, right along
// the top, down 17–24. Scrolling grows the white line along it; each number box turns into glass
// (node 1715:6723) when the line reaches it, one at a time.
// Your pixel character runs in the lane beside the boxes, level with the line. Tap a number to park
// it there for a while (shared through Supabase); tap the same number again to keep running.
// Tap outside the card (or press Esc) to go back. Events are dummy for now.

const DAYS = [
  {
    label: 'Today',
    events: [
      { time: '9:00 AM', title: 'Figma Basics' },
      { time: '10:30 AM', title: 'Poster Pin-up' },
      { time: '12:00 PM', title: 'Pixel Character Jam' },
      { time: '1:00 – 2:00 PM', title: 'Lunch Break' },
      { time: '2:30 PM', title: 'Motion Profiles' },
      { time: '4:00 PM', title: 'Window Reveal' },
      { time: '5:30 PM', title: 'Chai & Critique' },
      { time: '7:00 PM', title: 'Galaxy Night' },
    ],
  },
  {
    label: 'This week',
    events: [
      { time: 'Tue · 4:00 PM', title: 'Zine Swap' },
      { time: 'Wed · 3:00 PM', title: 'Type Walk' },
      { time: 'Wed · 6:00 PM', title: 'Film Night' },
      { time: 'Thu · 11:00 AM', title: 'Portfolio Clinic' },
      { time: 'Fri · 2:00 PM', title: 'Clay Day' },
      { time: 'Sat · 10:00 AM', title: 'Sketch Crawl' },
      { time: 'Sun · 5:00 PM', title: 'Week Wrap-up' },
      { time: 'Sun · 7:00 PM', title: 'Closing Night' },
    ],
  },
  {
    label: 'Next week',
    events: [
      { time: 'Mon · 10:00 AM', title: 'Print Lab' },
      { time: 'Mon · 3:00 PM', title: 'Mural Day' },
      { time: 'Tue · 11:00 AM', title: 'UX Teardown' },
      { time: 'Wed · 2:00 PM', title: 'Photo Walk' },
      { time: 'Thu · 4:00 PM', title: 'Sound Booth' },
      { time: 'Fri · 12:00 PM', title: 'Makers Market' },
      { time: 'Sat · 6:00 PM', title: 'Open Mic' },
      { time: 'Sun · 8:00 PM', title: 'Stargazing' },
    ],
  },
];

// Geometry in card pixels (matches stations.css). Each day is one column of 8 boxes.
const COL_W = 245;               // column spacing
const PAD = 20;                  // card padding
const FIRST_TOP = 50;            // first box's top
const STEP = 60;                 // box spacing
const ROWS = 8;
const LINE_X = 73;               // line centre, from a column's left edge
const TURN = 45;                 // how far past the end boxes the track turns
const CARD_W = PAD * 2 + COL_W * (DAYS.length - 1) + 250, CARD_H = 624;
const colX = (c) => PAD + c * COL_W;
const rowY = (r) => FIRST_TOP + r * STEP;
// Column c runs downwards when c is even, upwards when odd.
const rowOf = (c, i) => (c % 2 ? ROWS - 1 - i : i);

// The track as straight segments: [x1, y1, x2, y2]
const centre = (r) => rowY(r) + 17;
const SEGMENTS = [];
const TOP = centre(0) - TURN, BOTTOM = centre(ROWS - 1) + TURN;
DAYS.forEach((_, c) => {
  const x = colX(c) + LINE_X, down = c % 2 === 0;
  SEGMENTS.push(down ? [x, TOP, x, BOTTOM] : [x, BOTTOM, x, TOP]);
  if (c < DAYS.length - 1) SEGMENTS.push([x, down ? BOTTOM : TOP, colX(c + 1) + LINE_X, down ? BOTTOM : TOP]);
});
// The track starts at the first box and ends at the last one (no turn there).
SEGMENTS[0][1] = centre(0);
SEGMENTS[SEGMENTS.length - 1][3] = DAYS.length % 2 ? centre(ROWS - 1) : centre(0);
const segLen = ([x1, y1, x2, y2]) => Math.abs(x2 - x1) + Math.abs(y2 - y1);
const TOTAL = SEGMENTS.reduce((s, g) => s + segLen(g), 0);
function pointAt(d) {
  for (const g of SEGMENTS) {
    const L = segLen(g);
    if (d <= L) { const t = L ? d / L : 0; return [g[0] + (g[2] - g[0]) * t, g[1] + (g[3] - g[1]) * t]; }
    d -= L;
  }
  const g = SEGMENTS[SEGMENTS.length - 1];
  return [g[2], g[3]];
}
// Distance along the track to each box's centre
const BOX_D = [];
{
  let d = 0;
  SEGMENTS.forEach(g => {
    if (g[0] === g[2]) DAYS.forEach((_, c) => {
      if (colX(c) + LINE_X !== g[0]) return;
      for (let i = 0; i < ROWS; i++) BOX_D[c * ROWS + i] = d + Math.abs(centre(rowOf(c, i)) - g[1]);
    });
    d += segLen(g);
  });
}
const pathD = 'M' + SEGMENTS.map((g, k) => (k ? '' : `${g[0]} ${g[1]} `) + `L${g[2]} ${g[3]}`).join(' ');
const PARK_HOURS = 3;            // parked characters go back to running after this long

const view = document.getElementById('trackView');
const daysEl = document.getElementById('trackDays');
const fit = document.getElementById('trackFit');
const spacer = document.getElementById('trackSpacer');

const make = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

let ctx = null;            // { supabase, uid, preview, people: [{ id, name, coverUrl }] }
let boards = [];           // [{ section, fill, runner, markers, labels, count }]
const stops = new Map();   // key → { marker, parked }
const parks = new Map();   // user id → stop key
let channel = null;

/* ---------------- Characters ---------------- */

const personOf = (id) => ctx.people.find(p => p.id === id);

function avatar(person, mine) {
  const a = make('span', `avatar${mine ? ' mine' : ''}`);
  a.dataset.name = mine ? `${person?.name ?? 'You'} (you)` : person?.name ?? 'Someone';
  if (person?.coverUrl) {
    const img = document.createElement('img');
    img.src = person.coverUrl;
    img.alt = '';
    img.draggable = false;
    a.append(img);
  } else {
    a.append(make('span', 'initial', (person?.name ?? '?').charAt(0).toUpperCase()));
  }
  return a;
}

/* ---------------- Build ---------------- */

function build() {
  daysEl.replaceChildren();
  boards = [];
  stops.clear();
  let n = 0;
  const section = make('section', 'day current');
  section.setAttribute('aria-label', 'Campus events');
  const tcard = make('div', 'tcard');

  const pill = make('div', 'pill');
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'line');
  svg.setAttribute('viewBox', `0 0 ${CARD_W} ${CARD_H}`);
  const rail = document.createElementNS(NS, 'path');
  rail.setAttribute('class', 'rail');
  rail.setAttribute('d', pathD);
  const fill = document.createElementNS(NS, 'path');
  fill.setAttribute('class', 'fill');
  fill.setAttribute('d', pathD);
  svg.append(rail, fill);
  pill.append(svg);

  const labels = make('ol', 'labels');
  const labelEls = [];
  const markers = [];
  DAYS.forEach((day, d) => {
    day.events.forEach((ev, i) => {
      const number = ++n;
      const key = `${d}-${i}`;
      const top = rowY(rowOf(d, i));

      const marker = make('button', 'marker');
      marker.type = 'button';
      marker.style.setProperty('--x', `${colX(d)}px`);
      marker.style.top = `${top}px`;
      marker.setAttribute('aria-label', `${number}. ${ev.title}, ${ev.time}. Tap to park here.`);
      marker.append(make('span', 'glass-img'), make('span', 'n', String(number)));
      marker.addEventListener('click', () => park(key));
      pill.append(marker);
      markers.push(marker);

      const parked = make('span', 'parked');
      parked.style.setProperty('--x', `${colX(d)}px`);
      parked.style.top = `${top - 4}px`;
      pill.append(parked);
      stops.set(key, { marker, parked });

      const tl = make('li', 'tl');
      tl.style.setProperty('--x', `${colX(d)}px`);
      tl.style.top = `${top + 2}px`;
      tl.append(make('span', 'time', ev.time), make('span', 'title', ev.title));
      labels.append(tl);
      labelEls.push(tl);
    });
  });

  // Figma logo under the last box
  const logo = make('div', 'flogo');
  logo.setAttribute('aria-hidden', 'true');
  logo.style.setProperty('--x', `${colX(DAYS.length - 1)}px`);
  for (const c of 'abcde') logo.append(make('i', c));
  pill.append(logo);

  const runner = make('div', 'runner');
  runner.setAttribute('aria-hidden', 'true');
  const body = make('span', 'body');
  body.append(avatar(personOf(ctx.uid), true));
  runner.append(body);
  pill.append(runner);

  tcard.append(pill, labels);
  section.append(tcard);
  daysEl.append(section);
  boards.push({ section, fill, runner, markers, labels: labelEls, count: n });
}

/* ---------------- Scroll: grow the line; boxes turn to glass as it reaches them ---------------- */

function sizeStage() {
  spacer.style.height = `${DAYS.length * innerHeight * 1.3}px`;
  // The navbar stays on screen: keep the (centred) card clear of it, top and bottom alike.
  const dock = document.querySelector('.dock')?.getBoundingClientRect();
  const dockSpace = dock ? innerHeight - dock.top + 12 : 24;
  fit.style.setProperty('--fit', Math.min(1, (innerHeight - 2 * dockSpace) / CARD_H, (innerWidth - 24) / CARD_W).toFixed(3));
}

let currentDay = 0; // one card holds every day now
function update() {
  const max = view.scrollHeight - view.clientHeight;
  const p = max > 0 ? Math.min(1, view.scrollTop / max) : 0;

  const b = boards[0];
  const d = p * TOTAL;                        // how far along the track the line has grown
  b.fill.style.strokeDasharray = `${d} ${TOTAL + 10}`;
  b.fill.style.visibility = d > 0 ? 'visible' : 'hidden';
  const [x, y] = pointAt(d);
  b.runner.style.transform = `translate(${x - LINE_X + 13}px, ${y + 20}px)`; // in the lane, feet just below the line's front
  // Last box the line has reached (small tolerance: scroll positions are whole pixels).
  let reached = 0;
  BOX_D.forEach((bd, j) => { if (bd <= d + 1) reached = j; });
  b.markers.forEach((m, j) => m.classList.toggle('glass', j === reached));
  b.labels.forEach((tl, j) => {
    tl.style.opacity = Math.max(0.18, 1 - 0.2 * Math.abs(j - reached)).toFixed(2);
    tl.classList.toggle('active', j === reached);
  });
}

// Walk or run depending on how fast you scroll.
let lastTop = 0, lastTime = 0, stillTimer = 0;
function onScroll() {
  update(); // scroll events arrive at most once per frame
  const now = performance.now();
  const v = Math.abs(view.scrollTop - lastTop) / Math.max(1, now - lastTime); // px per ms
  lastTop = view.scrollTop; lastTime = now;
  const runner = boards[currentDay]?.runner;
  if (!runner) return;
  runner.classList.add('moving');
  runner.classList.toggle('running', v > 1.4);
  runner.style.setProperty('--step', `${Math.max(0.14, Math.min(0.55, 0.3 / Math.max(v, 0.2))).toFixed(2)}s`);
  clearTimeout(stillTimer);
  stillTimer = setTimeout(() => runner.classList.remove('moving', 'running'), 160);
}

/* ---------------- Parking ---------------- */

function renderParks() {
  const byStop = new Map();
  for (const [id, key] of parks) {
    if (!stops.has(key)) continue;
    if (!byStop.has(key)) byStop.set(key, []);
    byStop.get(key).push(id);
  }
  for (const [key, stop] of stops) {
    const ids = (byStop.get(key) ?? []).sort((a, b) => (a === ctx.uid ? -1 : b === ctx.uid ? 1 : 0));
    stop.parked.replaceChildren(...ids.slice(0, 3).map(id => {
      const a = avatar(personOf(id), id === ctx.uid);
      a.tabIndex = 0;
      a.setAttribute('role', 'img');
      a.setAttribute('aria-label', a.dataset.name);
      a.addEventListener('click', (e) => {
        e.stopPropagation();
        if (id === ctx.uid) return unpark(); // tap yourself to keep running
        a.classList.add('show-name');        // tap shows the name on phones
        setTimeout(() => a.classList.remove('show-name'), 1800);
      });
      return a;
    }));
    if (ids.length > 3) stop.parked.append(make('span', 'more', `+${ids.length - 3}`));
  }
  const parked = parks.has(ctx.uid);
  boards.forEach(b => { b.runner.hidden = parked; });
}

let previewMine = null;
async function loadParks() {
  parks.clear();
  if (ctx.preview) {
    // Demo friends so you can see what parked characters look like.
    if (!ctx.people.some(p => p.id === 'demo-1')) {
      ctx.people.push({ id: 'demo-1', name: 'Tanvi' }, { id: 'demo-2', name: 'Kabir' }, { id: 'demo-3', name: 'Meera' });
    }
    parks.set('demo-1', '0-1').set('demo-2', '0-1').set('demo-3', '0-4');
    if (previewMine) parks.set(ctx.uid, previewMine);
    return renderParks();
  }
  const since = new Date(Date.now() - PARK_HOURS * 3600e3).toISOString();
  const { data, error } = await ctx.supabase.from('track_parks').select('user_id, stop_key').gte('updated_at', since);
  if (error) { console.warn('Parking unavailable (run track-setup.sql?)', error); return renderParks(); }
  for (const p of data) parks.set(p.user_id, p.stop_key);
  renderParks();
}

async function park(key) {
  if (parks.get(ctx.uid) === key) return unpark(); // tapping your own spot again → keep running
  parks.set(ctx.uid, key);
  renderParks();
  if (ctx.preview) { previewMine = key; return; }
  const { error } = await ctx.supabase.from('track_parks')
    .upsert({ user_id: ctx.uid, stop_key: key, updated_at: new Date().toISOString() });
  if (error) { console.warn(error); return loadParks(); }
  channel?.send({ type: 'broadcast', event: 'parked', payload: {} });
}

async function unpark() {
  parks.delete(ctx.uid);
  renderParks();
  if (ctx.preview) { previewMine = null; return; }
  const { error } = await ctx.supabase.from('track_parks').delete().eq('user_id', ctx.uid);
  if (error) { console.warn(error); return loadParks(); }
  channel?.send({ type: 'broadcast', event: 'parked', payload: {} });
}

/* ---------------- Open / close ---------------- */

view.addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', () => { if (!view.hidden) { sizeStage(); update(); } });

export async function openTrack(context) {
  const first = !ctx;
  ctx = context;
  build(); // rebuild so your runner uses your current cover
  if (first && !ctx.preview) {
    channel = ctx.supabase.channel('track');
    channel.on('broadcast', { event: 'parked' }, () => { if (!view.hidden) loadParks(); }).subscribe();
  }
  sizeStage();
  currentDay = 0;
  view.hidden = false;
  view.scrollTop = 0;
  lastTop = 0; lastTime = performance.now();
  update();
  await loadParks();
}

export function closeTrack() {
  view.hidden = true;
}

// Tap anywhere outside the card to go back to the galaxy.
document.getElementById('trackStage').addEventListener('click', (e) => {
  if (!e.target.closest('.tcard')) closeTrack();
});
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !view.hidden) closeTrack(); });
