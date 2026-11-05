// Saving, opening and exporting. Board content only ever goes to a file the
// user picked. Nothing is written to localStorage or IndexedDB, so no copy
// lingers in the browser profile.

const file = {
  handle: null,  // FileSystemFileHandle when the browser supports direct writes
  name: null,
  dirty: false,
  generation: 0,
  saving: false,
  failed: false,
  timer: 0,
};
const AUTOSAVE_DELAY = 1200;

// Managed browsers can disable file dialogs. Chrome then rejects with the same
// AbortError as a user pressing Cancel, only instantly, so speed tells them
// apart. Without this, Save would silently do nothing on those machines.
const HUMAN_CANCEL_MS = 300;

async function pick(picker, options) {
  if (typeof picker !== 'function') return { blocked: true };
  const started = performance.now();
  try {
    return { result: await picker.call(window, options) };
  } catch (err) {
    if (err.name === 'AbortError' && performance.now() - started >= HUMAN_CANCEL_MS) return { cancelled: true };
    return { blocked: true };
  }
}
function serialize() {
  const items = doc.order.map(id => doc.items.get(id));
  const used = new Set(items.filter(i => i.type === 'image').map(i => i.asset));
  const assets = {};
  // Deleted images must not survive in the file, so only referenced ones are written.
  for (const id of used) if (doc.assets.has(id)) assets[id] = doc.assets.get(id);
  return JSON.stringify({
    format: FORMAT,
    version: FORMAT_VERSION,
    title: doc.title,
    view: { x: view.x, y: view.y, z: view.z },
    items,
    assets,
  });
}

// ---- Loading untrusted files ----------------------------------------------
// A board may come from anyone, so every field is rebuilt from a whitelist.
// Remote image URLs are dropped here and blocked again by the page's CSP.

const num = (v, fallback = 0) => (Number.isFinite(v) ? clamp(v, -1e7, 1e7) : fallback);
const str = (v, max = 20000) => (typeof v === 'string' ? v.slice(0, max) : '');
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);
const bool = v => v === true;
const colorOf = (v, fallback) => (typeof v === 'string' && (/^#[0-9a-f]{6}$/i.test(v) || v === 'transparent') ? v : fallback);
const size = (v, fallback) => { const n = num(v, fallback); return n >= 1 ? n : fallback; };
const ID_RE = /^[a-z0-9_-]{1,40}$/i;
const idOf = v => (typeof v === 'string' && ID_RE.test(v) ? v : null);

function cleanEnd(end) {
  if (!end || typeof end !== 'object') return { x: 0, y: 0 };
  if (idOf(end.id)) return { id: end.id, side: oneOf(end.side, ['t', 'r', 'b', 'l', 'auto'], 'auto') };
  return { x: num(end.x), y: num(end.y) };
}

function cleanItem(raw) {
  if (!raw || typeof raw !== 'object' || !ITEM_TYPES.includes(raw.type) || !idOf(raw.id)) return null;
  const common = { id: raw.id, type: raw.type, locked: bool(raw.locked), group: idOf(raw.group) };
  const box = { x: num(raw.x), y: num(raw.y), w: size(raw.w, 100), h: size(raw.h, 100) };
  const prose = { text: str(raw.text), bold: bool(raw.bold), align: oneOf(raw.align, ['left', 'center', 'right'], 'center') };
  switch (raw.type) {
    case 'sticky':
      return { ...common, ...box, ...prose, color: colorOf(raw.color, STICKY_COLORS[0]), fontSize: clamp(num(raw.fontSize), 0, 400) };
    case 'text':
      return { ...common, ...box, ...prose, color: colorOf(raw.color, INK), fontSize: clamp(size(raw.fontSize, 24), 6, 400) };
    case 'shape':
      return {
        ...common, ...box, ...prose, shape: oneOf(raw.shape, SHAPE_NAMES, 'rect'), fill: colorOf(raw.fill, '#ffffff'), stroke: colorOf(raw.stroke, INK),
        strokeWidth: clamp(num(raw.strokeWidth, 2), 0, 40), dash: bool(raw.dash), fontSize: clamp(size(raw.fontSize, 18), 6, 400), color: colorOf(raw.color, INK),
      };
    case 'line':
      return {
        ...common, a: cleanEnd(raw.a), b: cleanEnd(raw.b), kind: oneOf(raw.kind, ['straight', 'elbow', 'curve'], 'curve'), color: colorOf(raw.color, INK),
        width: clamp(num(raw.width, 2), 0.5, 40), dash: bool(raw.dash), startCap: oneOf(raw.startCap, ['none', 'arrow'], 'none'), endCap: oneOf(raw.endCap, ['none', 'arrow'], 'arrow'), text: str(raw.text, 500),
      };
    case 'pen': {
      const pts = Array.isArray(raw.pts) ? raw.pts.filter(Number.isFinite).slice(0, 400000) : [];
      if (pts.length < 2) return null;
      if (pts.length % 2) pts.pop();
      return { ...common, ...box, ow: size(raw.ow, 1), oh: size(raw.oh, 1), pts, color: colorOf(raw.color, INK), width: clamp(num(raw.width, 3), 0.5, 80), alpha: clamp(num(raw.alpha, 1), 0.05, 1) };
    }
    case 'frame':
      return { ...common, ...box, title: str(raw.title, 200), fill: colorOf(raw.fill, '#ffffff'), seq: num(raw.seq) };
    case 'image':
      return idOf(raw.asset) ? { ...common, ...box, asset: raw.asset } : null;
  }
  return null;
}

function parseBoard(text) {
  const raw = JSON.parse(text);
  if (raw?.format !== FORMAT) throw new Error('This is not a MirCore board.');
  if (!Number.isInteger(raw.version) || raw.version > FORMAT_VERSION) throw new Error('This board was made by a newer version of MirCore.');
  const assets = new Map();
  for (const [id, url] of Object.entries(raw.assets && typeof raw.assets === 'object' ? raw.assets : {})) {
    if (idOf(id) && typeof url === 'string' && IMAGE_TYPES.test(url)) assets.set(id, url);
  }
  const items = new Map();
  for (const entry of Array.isArray(raw.items) ? raw.items.slice(0, 200000) : []) {
    const item = cleanItem(entry);
    if (item && !items.has(item.id) && (item.type !== 'image' || assets.has(item.asset))) items.set(item.id, item);
  }
  for (const item of items.values()) {
    if (item.type !== 'line') continue;
    const detach = end => (end.id && (!items.has(end.id) || !CONNECTABLE.has(items.get(end.id).type)) ? { x: 0, y: 0 } : end);
    items.set(item.id, { ...item, a: detach(item.a), b: detach(item.b) });
  }
  const v = raw.view || {};
  return {
    title: str(raw.title, 120) || 'Untitled board',
    items, assets,
    view: Number.isFinite(v.z) ? { x: num(v.x), y: num(v.y), z: clamp(v.z, MIN_ZOOM, MAX_ZOOM) } : null,
  };
}

function loadBoard(board, handle, name) {
  commitEditSilently();
  doc.title = board.title;
  doc.items = board.items;
  doc.order = [...board.items.keys()];
  doc.assets = board.assets;
  imageCache.clear();
  sel.clear();
  find.matches = [];
  clip = null;
  file.handle = handle;
  file.name = name;
  file.dirty = false;
  file.failed = false;
  clearTimeout(file.timer);
  resetHistory();
  $('#title').value = doc.title;
  syncStatus();
  syncEmptyState();
  refreshFramesPanel();
  selectionChanged();
  if (board.view) Object.assign(view, board.view);
  else if (doc.items.size) Object.assign(view, viewFor(unionBounds(doc.items.values()), 90));
  else Object.assign(view, { x: -stage.clientWidth / 2, y: -stage.clientHeight / 2, z: 1 });
  invalidate();
}

function commitEditSilently() {
  if (editing) cancelEdit();
}

// ---- Save -----------------------------------------------------------------

function markDirty() {
  file.dirty = true;
  file.generation += 1;
  syncStatus();
  if (file.handle && !file.failed) {
    clearTimeout(file.timer);
    file.timer = setTimeout(writeToHandle, AUTOSAVE_DELAY);
  }
}

function markClean() {
  file.dirty = false;
  file.failed = false;
  syncStatus();
}

async function writeToHandle() {
  if (!file.handle) return false;
  if (file.saving) return false;
  file.saving = true;
  clearTimeout(file.timer);
  syncStatus();
  const generation = file.generation;
  let ok = true;
  try {
    const stream = await file.handle.createWritable();
    await stream.write(serialize());
    await stream.close();
    file.failed = false;
  } catch (err) {
    ok = false;
    file.failed = true;
    toast(`Could not save to ${file.name}: ${err.message}. Use Save As to choose another location.`, true);
  }
  file.saving = false;
  if (ok && generation === file.generation) markClean();
  else if (ok) file.timer = setTimeout(writeToHandle, AUTOSAVE_DELAY);
  syncStatus();
  return ok;
}

const fileName = () => `${doc.title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'board'}${FILE_EXT}`;
const BOARD_TYPES = [{ description: 'MirCore board', accept: { 'application/json': [FILE_EXT] } }];

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function saveFile() {
  commitEdit();
  if (file.handle) return writeToHandle();
  return saveFileAs();
}

async function saveFileAs() {
  commitEdit();
  const picked = await pick(window.showSaveFilePicker, { suggestedName: fileName(), types: BOARD_TYPES });
  if (picked.cancelled) return false;
  if (picked.result) {
    file.handle = picked.result;
    file.name = file.handle.name;
    file.failed = false;
    return writeToHandle();
  }
  // No direct file access here: a normal download, which also means no autosave.
  toast('Saved through the browser’s downloads. Autosave is off, so press Ctrl+S to save again.');
  file.handle = null;
  file.name = fileName();
  downloadBlob(new Blob([serialize()], { type: 'application/json' }), file.name);
  markClean();
  return true;
}

// ---- Open -----------------------------------------------------------------

async function confirmDiscard() {
  if (!file.dirty) return true;
  const choice = await ask('Save changes first?', `"${doc.title}" has changes that are not saved to a file.`, [
    { label: 'Cancel', value: 'cancel', kind: 'secondary' },
    { label: 'Discard', value: 'discard', kind: 'destructive' },
    { label: 'Save', value: 'save', kind: 'primary' },
  ]);
  if (choice === 'save') return saveFile();
  return choice === 'discard';
}

function loadText(text, handle, name) {
  try {
    loadBoard(parseBoard(text), handle, name);
    toast(`Opened ${name}`);
  } catch (err) {
    toast(err instanceof SyntaxError ? `${name} is not a valid board file` : err.message, true);
  }
}

async function openFile() {
  if (!await confirmDiscard()) return;
  const picked = await pick(window.showOpenFilePicker, { types: BOARD_TYPES });
  if (picked.cancelled) return;
  if (picked.blocked) { $('#fileInput').click(); return; }
  const [handle] = picked.result;
  const chosen = await handle.getFile();
  loadText(await chosen.text(), handle, chosen.name);
}

async function openDroppedFile(dropped) {
  if (!await confirmDiscard()) return;
  loadText(await dropped.text(), null, dropped.name);
}

async function newBoard() {
  if (!await confirmDiscard()) return;
  loadBoard({ title: 'Untitled board', items: new Map(), assets: new Map(), view: null }, null, null);
}

// ---- Export ---------------------------------------------------------------

async function decodeImages(items) {
  await Promise.all(items.filter(i => i.type === 'image').map(i => imageFor(i.asset)?.decode().catch(() => {})));
}

function renderRegion(box, scale, items) {
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(box.w * scale));
  out.height = Math.max(1, Math.round(box.h * scale));
  const c = out.getContext('2d');
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, out.width, out.height);
  c.setTransform(scale, 0, 0, scale, -box.x * scale, -box.y * scale);
  const opts = { zoom: scale, shadows: true, background: '#ffffff', hideFrameTitles: false, skipTextOf: null };
  for (const item of items) drawItem(c, item, opts);
  return out;
}

const exportScale = box => Math.min(2, 8000 / Math.max(box.w, box.h, 1));
const toPngBlob = region => new Promise(resolve => region.toBlob(resolve, 'image/png'));

async function exportPng() {
  commitEdit();
  const chosen = selectedItems();
  const source = chosen.length ? chosen : paintOrder();
  if (!source.length) { toast('The board is empty'); return; }
  const box = padRect(unionBounds(source), 40);
  const all = paintOrder();
  await decodeImages(all);
  const blob = await toPngBlob(renderRegion(box, exportScale(box), all));
  const name = fileName().replace(FILE_EXT, '.png');
  const picked = await pick(window.showSaveFilePicker, { suggestedName: name, types: [{ description: 'PNG image', accept: { 'image/png': ['.png'] } }] });
  if (picked.cancelled) return;
  if (picked.blocked) { downloadBlob(blob, name); return; }
  try {
    const stream = await picked.result.createWritable();
    await stream.write(blob);
    await stream.close();
    toast(`Exported ${picked.result.name}`);
  } catch (err) {
    toast(`Could not export: ${err.message}`, true);
  }
}

// Uses the browser's own print dialog, whose "Save as PDF" stays on this machine.
async function printBoard() {
  commitEdit();
  const all = paintOrder();
  if (!all.length) { toast('The board is empty'); return; }
  await decodeImages(all);
  const frames = framesInOrder();
  const regions = frames.length ? frames : [padRect(unionBounds(all), 40)];
  const holder = $('#print');
  const urls = [];
  for (const region of regions) {
    const box = { x: region.x, y: region.y, w: region.w, h: region.h };
    const url = URL.createObjectURL(await toPngBlob(renderRegion(box, Math.min(2, 3000 / Math.max(box.w, box.h)), all)));
    urls.push(url);
    const img = h('img', { src: url, alt: region.title || 'Board' });
    holder.append(img);
    await img.decode();
  }
  window.addEventListener('afterprint', () => {
    holder.replaceChildren();
    urls.forEach(u => URL.revokeObjectURL(u));
  }, { once: true });
  window.print();
}

function bindFiles() {
  $('#fileInput').addEventListener('change', async e => {
    const picked = e.target.files[0];
    e.target.value = '';
    if (picked) loadText(await picked.text(), null, picked.name);
  });
  $('#imageInput').addEventListener('change', e => {
    addImageFiles([...e.target.files], toWorld(stageCenter()));
    e.target.value = '';
  });
  window.addEventListener('beforeunload', e => {
    if (file.dirty) e.preventDefault();
  });
}
