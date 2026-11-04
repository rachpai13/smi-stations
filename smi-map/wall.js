// Poster wall prototype: shared folders + posters stored in Supabase, open to everyone.
import { supabase } from './supabase.js';

const BUCKET = 'posters';
const MAX_BYTES = 5 * 1024 * 1024;

const foldersEl = document.getElementById('folders');
const message = document.getElementById('message');
const newFolder = document.getElementById('newFolder');
const folderName = document.getElementById('folderName');
const viewer = document.getElementById('viewer');
const viewerTitle = document.getElementById('viewerTitle');
const viewerMessage = document.getElementById('viewerMessage');
const postersEl = document.getElementById('posters');
const ownerActions = document.getElementById('ownerActions');
const fileInput = document.getElementById('fileInput');
const folderTpl = document.getElementById('folderTpl');

let folders = [];
let openFolderId = null;

// The secret key for each folder you made lives only in this browser.
const myKeys = (() => {
  try { return JSON.parse(localStorage.getItem('wall-keys') || '{}'); } catch { return {}; }
})();
function saveKeys() {
  try { localStorage.setItem('wall-keys', JSON.stringify(myKeys)); } catch { /* private mode */ }
}

const publicUrl = (path) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

function say(el, text, ok = false) {
  el.textContent = text;
  el.classList.toggle('ok', ok);
}

// Tell everyone else's open page to refresh.
const channel = supabase.channel('poster-wall');
channel.on('broadcast', { event: 'changed' }, () => load()).subscribe();
const announce = () => channel.send({ type: 'broadcast', event: 'changed', payload: {} });

async function load() {
  const { data, error } = await supabase
    .from('folders')
    .select('id, name, created_at, posters(path, created_at)')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return say(message, /does not exist|schema cache/i.test(error.message)
      ? 'The wall isn\'t set up yet: run wall-setup.sql in Supabase.'
      : `Couldn't load the wall: ${error.message}`);
  }
  folders = data;
  render();
  if (openFolderId) renderViewer();
}

function render() {
  foldersEl.replaceChildren();
  if (!folders.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'No folders yet. Make the first one!';
    return foldersEl.append(p);
  }
  for (const f of folders) {
    const node = folderTpl.content.firstElementChild.cloneNode(true);
    const latest = [...f.posters].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (latest) node.querySelector('img').src = publicUrl(latest.path);
    node.querySelector('.folder-name').textContent = f.name;
    node.querySelector('.folder-meta').textContent =
      `${f.posters.length} poster${f.posters.length === 1 ? '' : 's'}${myKeys[f.id] ? ' · yours' : ''}`;
    node.classList.toggle('is-mine', Boolean(myKeys[f.id]));
    node.addEventListener('click', () => openFolder(f.id));
    foldersEl.append(node);
  }
}

newFolder.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = folderName.value.trim();
  if (!name) return;
  const button = newFolder.querySelector('button');
  button.disabled = true;

  const key = crypto.randomUUID();
  const { data, error } = await supabase.from('folders').insert({ name, delete_key: key }).select('id').single();
  button.disabled = false;
  if (error) return say(message, `Couldn't make the folder: ${error.message}`);

  myKeys[data.id] = key;
  saveKeys();
  folderName.value = '';
  say(message, `Folder "${name}" is up!`, true);
  announce();
  await load();
  openFolder(data.id);
});

function openFolder(id) {
  openFolderId = id;
  say(viewerMessage, '');
  renderViewer();
  if (!viewer.open) viewer.showModal();
}

function renderViewer() {
  const f = folders.find(x => x.id === openFolderId);
  if (!f) { viewer.close(); return; }
  viewerTitle.textContent = f.name;
  ownerActions.hidden = !myKeys[f.id];

  postersEl.replaceChildren();
  if (!f.posters.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = myKeys[f.id] ? 'Empty. Add your first poster!' : 'Nothing pinned here yet.';
    return postersEl.append(p);
  }
  for (const p of f.posters) {
    const a = document.createElement('a');
    a.href = publicUrl(p.path);
    a.target = '_blank';
    a.rel = 'noopener';
    const img = document.createElement('img');
    img.src = a.href;
    img.alt = `Poster in ${f.name}`;
    img.loading = 'lazy';
    a.append(img);
    postersEl.append(a);
  }
}

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  fileInput.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) return say(viewerMessage, 'Posters must be images (PNG, JPG, WebP, GIF).');
  if (file.size > MAX_BYTES) return say(viewerMessage, 'That image is over 5 MB. Export it smaller from Figma.');

  say(viewerMessage, 'Pinning…', true);
  const ext = file.name.split('.').pop().toLowerCase();
  const path = `${openFolderId}/${crypto.randomUUID()}.${ext}`;

  const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
  if (up.error) return say(viewerMessage, `Upload failed: ${up.error.message}`);

  const { error } = await supabase.from('posters').insert({ folder_id: openFolderId, path });
  if (error) return say(viewerMessage, `Saved the image but not the pin: ${error.message}`);

  say(viewerMessage, 'Pinned! Everyone can see it now.', true);
  announce();
  load();
});

document.getElementById('deleteFolder').addEventListener('click', async () => {
  const f = folders.find(x => x.id === openFolderId);
  if (!f || !confirm(`Delete "${f.name}" and all its posters? This can't be undone.`)) return;

  const { data: paths, error } = await supabase.rpc('delete_folder', { folder: f.id, key: myKeys[f.id] });
  if (error) return say(viewerMessage, `Couldn't delete: ${error.message}`);
  if (paths?.length) await supabase.storage.from(BUCKET).remove(paths);

  delete myKeys[f.id];
  saveKeys();
  viewer.close();
  say(message, `Deleted "${f.name}".`, true);
  announce();
  load();
});

document.getElementById('closeViewer').addEventListener('click', () => viewer.close());
viewer.addEventListener('close', () => { openFolderId = null; });

load();
