// Operations on the selection and the viewport, shared by keyboard, menus and toolbars.

function selectionChanged() {
  refreshContextBar();
  invalidate();
}

function setSelection(ids) {
  sel.clear();
  for (const id of ids) if (doc.items.has(id)) sel.add(id);
  selectionChanged();
}

function withGroup(item) {
  if (!item.group) return [item.id];
  return doc.order.filter(id => doc.items.get(id).group === item.group);
}

// ---- Viewport -------------------------------------------------------------

function zoomAt(screenPoint, nextZ) {
  const z = clamp(nextZ, MIN_ZOOM, MAX_ZOOM);
  const world = toWorld(screenPoint);
  view.z = z;
  view.x = world.x - screenPoint.x / z;
  view.y = world.y - screenPoint.y / z;
  invalidate();
}

const stageCenter = () => ({ x: stage.clientWidth / 2, y: stage.clientHeight / 2 });

let viewAnimation = 0;
function animateView(target, ms = 260) {
  const from = { ...view };
  const started = performance.now();
  const token = ++viewAnimation;
  const step = now => {
    if (token !== viewAnimation) return;
    const t = clamp((now - started) / ms, 0, 1);
    const e = 1 - (1 - t) ** 3;
    // Interpolating the screen centre (not the corner) keeps the motion straight when zoom changes.
    const w = stage.clientWidth / 2, hh = stage.clientHeight / 2;
    const z = from.z * (target.z / from.z) ** e;
    const cx = (from.x + w / from.z) + ((target.x + w / target.z) - (from.x + w / from.z)) * e;
    const cy = (from.y + hh / from.z) + ((target.y + hh / target.z) - (from.y + hh / from.z)) * e;
    view.z = z;
    view.x = cx - w / z;
    view.y = cy - hh / z;
    invalidate();
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function viewFor(box, pad) {
  const w = stage.clientWidth, hh = stage.clientHeight;
  const z = clamp(Math.min((w - pad * 2) / Math.max(box.w, 1), (hh - pad * 2) / Math.max(box.h, 1)), MIN_ZOOM, MAX_ZOOM);
  return { z, x: box.x + box.w / 2 - w / 2 / z, y: box.y + box.h / 2 - hh / 2 / z };
}

function zoomToActualSize() {
  const c = center(worldViewport());
  animateView({ z: 1, x: c.x - stage.clientWidth / 2, y: c.y - stage.clientHeight / 2 });
}

function fitBoard() {
  const box = unionBounds(doc.items.values());
  if (box) animateView(viewFor(box, 90));
  else animateView({ x: -stage.clientWidth / 2, y: -stage.clientHeight / 2, z: 1 });
}

function zoomToSelection() {
  const box = unionBounds(selectedItems());
  if (box) animateView(viewFor(box, 140));
}

function keepOnScreen(item) {
  const vp = worldViewport();
  const margin = 90 / view.z;
  const inner = padRect(vp, -margin);
  if (rectInside(bounds(item), inner)) return;
  const c = center(bounds(item));
  animateView({ z: view.z, x: c.x - vp.w / 2, y: c.y - vp.h / 2 }, 200);
}

// ---- Clone / delete -------------------------------------------------------

// Connectors stay attached inside the copied set; ends pointing outside it
// become free points so a copy never silently rewires the original.
function detachOutside(items) {
  const inside = new Set(items.map(i => i.id));
  return items.map(item => {
    if (item.type !== 'line') return item;
    const ends = lineEnds(item);
    const keep = (end, at) => (!end.id || inside.has(end.id) ? end : { x: at.x, y: at.y });
    return { ...item, a: keep(item.a, ends.a), b: keep(item.b, ends.b) };
  });
}

function cloneItems(items, dx, dy) {
  const idMap = new Map(items.map(i => [i.id, uid()]));
  const groupMap = new Map();
  const made = [];
  for (const item of items) {
    const next = { ...item, id: idMap.get(item.id) };
    if (item.group) {
      if (!groupMap.has(item.group)) groupMap.set(item.group, uid());
      next.group = groupMap.get(item.group);
    }
    if (item.type === 'line') {
      const mapEnd = end => (end.id ? { id: idMap.get(end.id), side: end.side } : { x: end.x + dx, y: end.y + dy });
      next.a = mapEnd(item.a);
      next.b = mapEnd(item.b);
    } else {
      next.x += dx;
      next.y += dy;
    }
    if (item.type === 'frame') next.seq = nextFrameSeq() + made.length;
    made.push(addItem(next));
  }
  return made;
}

const nextFrameSeq = () => framesInOrder().reduce((m, f) => Math.max(m, f.seq + 1), 0);

function duplicateSelection() {
  const items = selectedItems();
  if (!items.length) return;
  const made = cloneItems(detachOutside(items), 24, 24);
  setSelection(made.map(i => i.id));
  commit();
}

function removeItems(ids) {
  const gone = new Set(ids);
  for (const item of doc.items.values()) {
    if (item.type !== 'line' || gone.has(item.id)) continue;
    const ends = lineEnds(item);
    const changes = {};
    if (gone.has(item.a.id)) changes.a = { x: ends.a.x, y: ends.a.y };
    if (gone.has(item.b.id)) changes.b = { x: ends.b.x, y: ends.b.y };
    if (changes.a || changes.b) patch(item.id, changes);
  }
  for (const id of gone) doc.items.delete(id);
  doc.order = doc.order.filter(id => !gone.has(id));
}

function deleteSelection() {
  const ids = selectedItems().filter(i => !i.locked).map(i => i.id);
  if (!ids.length) return;
  removeItems(ids);
  setSelection([]);
  commit();
}

// ---- Clipboard ------------------------------------------------------------

let clip = null;

function copySelection(e) {
  const items = selectedItems();
  if (!items.length) return false;
  const text = items.map(i => (i.type === 'frame' ? i.title : i.text)).filter(Boolean).join('\n');
  clip = { items: detachOutside(items), text };
  e.clipboardData.setData('text/plain', text);
  e.preventDefault();
  return true;
}

function pasteClip() {
  const box = unionBounds(clip.items.filter(i => i.type !== 'line')) || { x: 0, y: 0, w: 0, h: 0 };
  const spot = pointer.inside ? pointer.world : toWorld(stageCenter());
  const made = cloneItems(clip.items, spot.x - box.x - box.w / 2, spot.y - box.y - box.h / 2);
  setSelection(made.map(i => i.id));
  commit();
}

// One sticky per line, the quickest route from a list of ideas onto the board.
function pasteLines(text) {
  const lines = text.split(/\r?\n/).map(l => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim()).filter(Boolean).slice(0, 500);
  if (!lines.length) return;
  const spot = pointer.inside ? pointer.world : toWorld(stageCenter());
  const cols = Math.ceil(Math.sqrt(lines.length));
  const cell = 220;
  const rows = Math.ceil(lines.length / cols);
  const made = lines.map((line, i) => addItem(makeItem('sticky', {
    x: spot.x - (cols * cell - 20) / 2 + (i % cols) * cell,
    y: spot.y - (rows * cell - 20) / 2 + Math.floor(i / cols) * cell,
    text: line,
  })));
  setSelection(made.map(i => i.id));
  commit();
  if (made.length > 1) toast(`Added ${made.length} stickies`);
}

// ---- Arrangement ----------------------------------------------------------

function reorder(toFront) {
  const ids = doc.order.filter(id => sel.has(id));
  if (!ids.length) return;
  const rest = doc.order.filter(id => !sel.has(id));
  doc.order = toFront ? rest.concat(ids) : ids.concat(rest);
  commit();
}

function toggleLock() {
  const items = selectedItems();
  const lock = items.some(i => !i.locked);
  for (const item of items) patch(item.id, { locked: lock });
  commit();
  refreshContextBar();
}

function groupSelection() {
  const items = selectedItems();
  if (items.length < 2) return;
  const gid = uid();
  for (const item of items) patch(item.id, { group: gid });
  commit();
  refreshContextBar();
}

function ungroupSelection() {
  for (const item of selectedItems()) patch(item.id, { group: null });
  commit();
  refreshContextBar();
}

function moveItem(item, dx, dy) {
  if (item.type === 'line') {
    return {
      a: item.a.id ? item.a : { x: item.a.x + dx, y: item.a.y + dy },
      b: item.b.id ? item.b : { x: item.b.x + dx, y: item.b.y + dy },
    };
  }
  return { x: item.x + dx, y: item.y + dy };
}

function alignSelection(edge) {
  const items = selectedItems().filter(i => !i.locked && i.type !== 'line');
  const box = unionBounds(items);
  if (items.length < 2) return;
  for (const item of items) {
    const b = bounds(item);
    const dx = edge === 'left' ? box.x - b.x : edge === 'right' ? box.x + box.w - b.x - b.w : edge === 'hcenter' ? box.x + (box.w - b.w) / 2 - b.x : 0;
    const dy = edge === 'top' ? box.y - b.y : edge === 'bottom' ? box.y + box.h - b.y - b.h : edge === 'vcenter' ? box.y + (box.h - b.h) / 2 - b.y : 0;
    patch(item.id, moveItem(item, dx, dy));
  }
  commit();
}

function distributeSelection(axis) {
  const items = selectedItems().filter(i => !i.locked && i.type !== 'line');
  if (items.length < 3) return;
  const pos = axis === 'x' ? 'x' : 'y';
  const size = axis === 'x' ? 'w' : 'h';
  const sorted = items.slice().sort((a, b) => a[pos] - b[pos]);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const used = sorted.reduce((sum, i) => sum + i[size], 0);
  const gap = (last[pos] + last[size] - first[pos] - used) / (sorted.length - 1);
  let at = first[pos];
  for (const item of sorted) {
    patch(item.id, { [pos]: at });
    at += item[size] + gap;
  }
  commit();
}

// Lays the selection out in a tidy grid, keeping rough reading order.
function tidySelection() {
  const items = selectedItems().filter(i => !i.locked && i.type !== 'line' && i.type !== 'frame');
  if (items.length < 2) return;
  const box = unionBounds(items);
  const cellW = Math.max(...items.map(i => i.w)) + 20;
  const cellH = Math.max(...items.map(i => i.h)) + 20;
  const cols = clamp(Math.round(box.w / cellW) || 1, 1, Math.ceil(Math.sqrt(items.length) * 1.5));
  const rowOf = i => Math.round((i.y - box.y) / cellH);
  const sorted = items.slice().sort((a, b) => rowOf(a) - rowOf(b) || a.x - b.x);
  sorted.forEach((item, i) => patch(item.id, {
    x: box.x + (i % cols) * cellW + (cellW - 20 - item.w) / 2,
    y: box.y + Math.floor(i / cols) * cellH + (cellH - 20 - item.h) / 2,
  }));
  commit();
}

function changeSelection(fn) {
  for (const item of selectedItems()) {
    if (item.locked) continue;
    const changes = fn(item);
    if (!changes) continue;
    const next = patch(item.id, changes);
    if (next.type === 'text') doc.items.set(next.id, withTextHeight(next));
  }
  commit();
  refreshContextBar();
}

// ---- Creation -------------------------------------------------------------

function overlapsAny(box, ignoreId) {
  for (const item of doc.items.values()) {
    if (item.id === ignoreId || item.type === 'line' || item.type === 'frame' || item.type === 'pen') continue;
    if (rectsTouch(box, item)) return true;
  }
  return false;
}

function createStickyAt(world) {
  const item = addItem(makeItem('sticky', { x: world.x - 100, y: world.y - 100 }));
  setSelection([item.id]);
  startEdit(item.id);
  return item;
}

function nextSticky(from, direction) {
  const gap = 20;
  const box = { x: from.x, y: from.y, w: from.w, h: from.h };
  const stepX = direction === 'right' ? from.w + gap : 0;
  const stepY = direction === 'down' ? from.h + gap : 0;
  do {
    box.x += stepX;
    box.y += stepY;
  } while (overlapsAny(box));
  const item = addItem(makeItem('sticky', { ...box, color: from.color }));
  setSelection([item.id]);
  keepOnScreen(item);
  startEdit(item.id);
}

function sibling(src, side, at) {
  const box = bounds(src);
  const { dx, dy } = SIDES[side];
  const gap = 90;
  const spot = at
    ? { x: at.x - box.w / 2, y: at.y - box.h / 2, w: box.w, h: box.h }
    : { x: box.x + dx * (box.w + gap), y: box.y + dy * (box.h + gap), w: box.w, h: box.h };
  if (!at) {
    while (overlapsAny(spot, src.id)) {
      spot.x += dy ? box.w + 24 : 0;
      spot.y += dx ? box.h + 24 : 0;
    }
  }
  const { id: _id, text: _text, locked: _locked, group: _group, ...style } = src;
  return addItem({ ...style, ...spot, id: uid(), text: '', locked: false, group: null });
}

function connect(fromId, fromSide, toEnd) {
  return addItem(makeItem('line', { a: { id: fromId, side: fromSide }, b: toEnd }));
}

function quickCreate(fromId, side, at) {
  const src = doc.items.get(fromId);
  const made = sibling(src, side, at);
  const toSide = at ? 'auto' : SIDES[side].opposite;
  connect(fromId, at ? 'auto' : side, { id: made.id, side: toSide });
  setSelection([made.id]);
  keepOnScreen(made);
  startEdit(made.id);
}

// ---- Images ---------------------------------------------------------------

const IMAGE_TYPES = /^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i;

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function addImageFile(file, world) {
  const url = await readAsDataURL(file);
  if (!IMAGE_TYPES.test(url)) { toast('Only PNG, JPEG, GIF and WebP images can be added', true); return null; }
  const img = new Image();
  img.src = url;
  await img.decode();
  const scale = Math.min(1, 640 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = img.naturalWidth * scale, hh = img.naturalHeight * scale;
  const asset = uid();
  doc.assets.set(asset, url);
  return addItem(makeItem('image', { x: world.x - w / 2, y: world.y - hh / 2, w, h: hh, asset }));
}

async function addImageFiles(files, world) {
  const made = [];
  let at = { ...world };
  for (const file of files) {
    try {
      const item = await addImageFile(file, at);
      if (item) { made.push(item.id); at = { x: at.x + 40, y: at.y + 40 }; }
    } catch { toast(`Could not read ${file.name || 'image'}`, true); }
  }
  if (made.length) { setSelection(made); commit(); }
}

// ---- Find -----------------------------------------------------------------

const find = { matches: [], index: 0 };

function runFind(query) {
  const q = query.trim().toLowerCase();
  find.matches = !q ? [] : paintOrder()
    .filter(i => ((i.type === 'frame' ? i.title : i.text) || '').toLowerCase().includes(q))
    .map(i => i.id);
  find.index = 0;
  syncFindCount();
  if (find.matches.length) goToMatch();
  invalidate();
}

function goToMatch() {
  const item = doc.items.get(find.matches[find.index]);
  if (!item) return;
  const vp = worldViewport();
  const box = bounds(item);
  if (!rectInside(box, padRect(vp, -80 / view.z))) {
    const c = center(box);
    animateView({ z: view.z, x: c.x - vp.w / 2, y: c.y - vp.h / 2 });
  }
}

function stepFind(delta) {
  if (!find.matches.length) return;
  find.index = (find.index + delta + find.matches.length) % find.matches.length;
  syncFindCount();
  goToMatch();
  invalidate();
}

// ---- Present --------------------------------------------------------------

const present = { on: false, index: 0 };

function startPresenting() {
  if (!framesInOrder().length) { toast('Add a frame first (press F): each frame becomes a slide'); return; }
  commitEdit();
  setSelection([]);
  present.on = true;
  document.body.classList.add('presenting');
  $('#presentBar').hidden = false;
  document.documentElement.requestFullscreen?.().catch(() => {});
  showFrame(0);
}

function showFrame(index) {
  const frames = framesInOrder();
  if (!frames.length) { endPresenting(); return; }
  present.index = clamp(index, 0, frames.length - 1);
  const frame = frames[present.index];
  $('#presentLabel').textContent = `${present.index + 1} / ${frames.length}  ${frame.title || 'Frame'}`;
  animateView(viewFor(frame, 0), 320);
  invalidate();
}

function endPresenting() {
  if (!present.on) return;
  present.on = false;
  document.body.classList.remove('presenting');
  $('#presentBar').hidden = true;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  invalidate();
}
