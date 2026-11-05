// Pointer and keyboard input, and the in-place text editor.

let tool = 'select';
let mode = null;
let hover = null;
let connectHint = null;
let spaceDown = false;
const pointer = { x: 0, y: 0, world: { x: 0, y: 0 }, inside: false };

function setTool(next) {
  tool = next;
  mode = null;
  if (next !== 'select') setSelection([]);
  syncToolbar();
  syncCursor();
  invalidate();
}

function syncCursor(cursor) {
  if (cursor) { canvas.style.cursor = cursor; return; }
  if (spaceDown || tool === 'hand') canvas.style.cursor = mode?.type === 'pan' ? 'grabbing' : 'grab';
  else if (tool === 'select') canvas.style.cursor = 'default';
  else canvas.style.cursor = 'crosshair';
}

function trackPointer(e) {
  const r = stage.getBoundingClientRect();
  pointer.x = e.clientX - r.left;
  pointer.y = e.clientY - r.top;
  pointer.world = toWorld(pointer);
}

// ---- Handles --------------------------------------------------------------

function selectionHandles() {
  const items = selectedItems();
  if (!items.length || items.some(i => i.locked)) return [];
  if (items.length === 1 && items[0].type === 'line') {
    const ends = lineEnds(items[0]);
    return [{ ...toScreen(ends.a), end: 'a' }, { ...toScreen(ends.b), end: 'b' }];
  }
  if (items.every(i => i.type === 'line')) return [];
  const r = screenRect(unionBounds(items));
  const mx = r.x + r.w / 2, my = r.y + r.h / 2, R = r.x + r.w, B = r.y + r.h;
  const handles = [
    { x: r.x, y: r.y, pos: 'nw' }, { x: R, y: r.y, pos: 'ne' },
    { x: r.x, y: B, pos: 'sw' }, { x: R, y: B, pos: 'se' },
  ];
  const single = items.length === 1 ? items[0] : null;
  if (single && (single.type === 'shape' || single.type === 'frame')) {
    handles.push({ x: mx, y: r.y, pos: 'n' }, { x: mx, y: B, pos: 's' });
  }
  if (single && (single.type === 'shape' || single.type === 'frame' || single.type === 'text')) {
    handles.push({ x: r.x, y: my, pos: 'w' }, { x: R, y: my, pos: 'e' });
  }
  return handles;
}

function quickDots() {
  if (sel.size !== 1 || mode) return [];
  const item = selectedItems()[0];
  if (!item || item.locked || (item.type !== 'sticky' && item.type !== 'shape')) return [];
  const r = screenRect(item);
  const gap = 24;
  return [
    { side: 't', x: r.x + r.w / 2, y: r.y - gap }, { side: 'r', x: r.x + r.w + gap, y: r.y + r.h / 2 },
    { side: 'b', x: r.x + r.w / 2, y: r.y + r.h + gap }, { side: 'l', x: r.x - gap, y: r.y + r.h / 2 },
  ];
}

const HANDLE_CURSORS = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };
const near = (a, b, d) => Math.hypot(a.x - b.x, a.y - b.y) <= d;

// ---- Pointer down ---------------------------------------------------------

function onPointerDown(e) {
  closePopover();
  if (editing) commitEdit();
  document.activeElement?.blur?.();
  trackPointer(e);
  canvas.setPointerCapture(e.pointerId);

  if (present.on) {
    if (e.button === 0) showFrame(present.index + 1);
    return;
  }
  if (e.button === 1 || e.button === 2 || (e.button === 0 && (spaceDown || tool === 'hand'))) {
    mode = { type: 'pan', sx: pointer.x, sy: pointer.y, vx: view.x, vy: view.y, moved: false, button: e.button };
    syncCursor();
    return;
  }
  if (e.button !== 0) return;

  switch (tool) {
    case 'select': return selectDown(e);
    case 'sticky': {
      const item = createStickyAt(pointer.world);
      setTool('select');
      setSelection([item.id]);
      return;
    }
    case 'pen': return penDown();
    case 'eraser': mode = { type: 'erase' }; eraseAt(pointer.world); return;
    case 'line': return lineDown();
    case 'text': case 'shape': case 'frame':
      mode = { type: 'draw', kind: tool, start: { ...pointer.world }, rect: null };
      return;
  }
}

function selectDown(e) {
  const hit = selectionHandles().find(hd => near(hd, pointer, 9));
  if (hit) {
    if (hit.end) startEndpointDrag(hit.end);
    else startResize(hit.pos);
    return;
  }
  const dot = quickDots().find(d => near(d, pointer, 11));
  if (dot) {
    const fromId = selectedItems()[0].id;
    mode = {
      type: 'quick', fromId, side: dot.side, moved: false, origin: { x: pointer.x, y: pointer.y },
      preview() {
        return makeItem('line', { a: { id: fromId, side: dot.side }, b: connectHint || { ...pointer.world } });
      },
    };
    return;
  }

  const item = hitTest(pointer.world);
  if (!item) {
    if (!e.shiftKey) setSelection([]);
    mode = { type: 'marquee', start: { ...pointer.world }, base: e.shiftKey ? [...sel] : [], rect: null };
    return;
  }
  const soleBefore = sel.size === 1 && sel.has(item.id);
  const ids = withGroup(item);
  if (e.shiftKey) {
    const removing = sel.has(item.id);
    const next = new Set(sel);
    for (const id of ids) { if (removing) next.delete(id); else next.add(id); }
    setSelection(next);
    if (removing) return;
  } else if (!sel.has(item.id)) {
    setSelection(ids);
  }
  mode = { type: 'move', started: false, start: { ...pointer.world }, alt: e.altKey, clickedId: item.id, soleBefore };
}

function moveTargets() {
  const ids = new Set();
  for (const item of selectedItems()) {
    if (item.locked) continue;
    ids.add(item.id);
    if (item.type !== 'frame') continue;
    for (const other of doc.items.values()) {
      if (other.type !== 'frame' && !other.locked && rectHas(item, center(bounds(other)))) ids.add(other.id);
    }
  }
  return ids;
}

function startMove() {
  if (mode.alt) {
    const made = cloneItems(detachOutside(selectedItems()), 0, 0);
    setSelection(made.map(i => i.id));
  }
  mode.started = true;
  mode.targets = moveTargets();
  mode.orig = new Map([...mode.targets].map(id => [id, doc.items.get(id)]));
  mode.box = unionBounds(selectedItems());
  mode.snapLines = snapCandidates(mode.targets);
  refreshContextBar();
}

// ---- Snapping -------------------------------------------------------------

function snapCandidates(exclude) {
  const vp = padRect(worldViewport(), 200);
  const xs = [], ys = [];
  for (const item of doc.items.values()) {
    if (exclude.has(item.id) || item.type === 'line' || item.type === 'pen') continue;
    const b = bounds(item);
    if (!rectsTouch(b, vp)) continue;
    xs.push({ v: b.x, b }, { v: b.x + b.w / 2, b }, { v: b.x + b.w, b });
    ys.push({ v: b.y, b }, { v: b.y + b.h / 2, b }, { v: b.y + b.h, b });
  }
  return { xs, ys };
}

function snap(box, candidates) {
  const reach = 6 / view.z;
  let dx = 0, dy = 0, bestX = reach, bestY = reach, gx = null, gy = null;
  for (const edge of [box.x, box.x + box.w / 2, box.x + box.w]) {
    for (const c of candidates.xs) {
      const d = Math.abs(c.v - edge);
      if (d < bestX) { bestX = d; dx = c.v - edge; gx = c; }
    }
  }
  for (const edge of [box.y, box.y + box.h / 2, box.y + box.h]) {
    for (const c of candidates.ys) {
      const d = Math.abs(c.v - edge);
      if (d < bestY) { bestY = d; dy = c.v - edge; gy = c; }
    }
  }
  const guides = [];
  if (gx) guides.push({ a: { x: gx.v, y: Math.min(box.y + dy, gx.b.y) }, b: { x: gx.v, y: Math.max(box.y + box.h + dy, gx.b.y + gx.b.h) } });
  if (gy) guides.push({ a: { x: Math.min(box.x + dx, gy.b.x), y: gy.v }, b: { x: Math.max(box.x + box.w + dx, gy.b.x + gy.b.w), y: gy.v } });
  return { dx, dy, guides };
}

// ---- Resize ---------------------------------------------------------------

function startResize(pos) {
  const items = selectedItems();
  mode = { type: 'resize', pos, box: unionBounds(items), orig: new Map(items.map(i => [i.id, i])), single: items.length === 1 ? items[0] : null };
}

function resizedBox(o, pos, p, keep) {
  let l = o.x, t = o.y, r = o.x + o.w, b = o.y + o.h;
  if (pos.includes('w')) l = Math.min(p.x, r - MIN_SIZE);
  if (pos.includes('e')) r = Math.max(p.x, l + MIN_SIZE);
  if (pos.includes('n')) t = Math.min(p.y, b - MIN_SIZE);
  if (pos.includes('s')) b = Math.max(p.y, t + MIN_SIZE);
  if (keep && pos.length === 2) {
    const s = Math.max((r - l) / o.w, (b - t) / o.h);
    const w = o.w * s, hh = o.h * s;
    if (pos.includes('w')) l = r - w; else r = l + w;
    if (pos.includes('n')) t = b - hh; else b = t + hh;
  }
  return { x: l, y: t, w: r - l, h: b - t };
}

function scaledItem(item, from, to) {
  const sx = to.w / from.w, sy = to.h / from.h;
  const mapX = x => to.x + (x - from.x) * sx;
  const mapY = y => to.y + (y - from.y) * sy;
  if (item.type === 'line') {
    const mapEnd = end => (end.id ? end : { x: mapX(end.x), y: mapY(end.y) });
    return { a: mapEnd(item.a), b: mapEnd(item.b) };
  }
  const changes = { x: mapX(item.x), y: mapY(item.y), w: item.w * sx, h: item.h * sy };
  if (item.fontSize && Math.abs(sx - sy) < 1e-6) changes.fontSize = Math.max(6, item.fontSize * sx);
  return changes;
}

function applyResize(e) {
  const { pos, box, orig, single } = mode;
  const isType = t => single?.type === t;
  const keepAlways = !single || isType('sticky') || isType('pen') || isType('text');
  const keep = keepAlways || (isType('image') ? !e.shiftKey : e.shiftKey);
  const next = resizedBox(box, pos, pointer.world, keep);

  if (isType('text') && pos.length === 1) {
    doc.items.set(single.id, withTextHeight({ ...single, x: next.x, w: next.w }));
  } else if (single && (isType('shape') || isType('frame') || isType('image'))) {
    patch(single.id, { x: next.x, y: next.y, w: next.w, h: next.h });
  } else {
    for (const [id, item] of orig) {
      const updated = patch(id, scaledItem(item, box, next));
      if (updated.type === 'text') doc.items.set(id, withTextHeight(updated));
    }
  }
}

// ---- Connectors -----------------------------------------------------------

function lineDown() {
  const start = connectTarget(pointer.world) || { ...pointer.world };
  mode = {
    type: 'line', start, origin: { ...pointer.world },
    preview() {
      return makeItem('line', { a: start, b: connectHint || { ...pointer.world } });
    },
  };
}

function startEndpointDrag(which) {
  const line = selectedItems()[0];
  mode = { type: 'endpoint', which, id: line.id };
}

function finishLine() {
  const { start, origin } = mode;
  const end = connectTarget(pointer.world, start.id) || { ...pointer.world };
  const tiny = !start.id && !end.id && near(origin, pointer.world, 8 / view.z);
  const b = tiny ? { x: origin.x + 200, y: origin.y } : end;
  const item = addItem(makeItem('line', { a: start, b }));
  mode = null;
  setTool('select');
  setSelection([item.id]);
  commit();
}

function finishQuick() {
  const { fromId, side, moved } = mode;
  mode = null;
  if (!moved) { quickCreate(fromId, side); return; }
  const target = connectTarget(pointer.world, fromId);
  if (target) {
    const line = connect(fromId, side, target);
    setSelection([line.id]);
    commit();
    return;
  }
  quickCreate(fromId, side, { ...pointer.world });
}

// ---- Freehand -------------------------------------------------------------

function penDown() {
  const start = { ...pointer.world };
  const points = [start.x, start.y];
  mode = {
    type: 'pen', points,
    preview() { return strokeFrom(points); },
  };
}

function strokeFrom(points) {
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    l = Math.min(l, points[i]); r = Math.max(r, points[i]);
    t = Math.min(t, points[i + 1]); b = Math.max(b, points[i + 1]);
  }
  const w = Math.max(r - l, 1), hh = Math.max(b - t, 1);
  const pts = points.map((v, i) => Math.round((v - (i % 2 ? t : l)) * 100) / 100);
  return makeItem('pen', { x: l, y: t, w, h: hh, ow: w, oh: hh, pts });
}

function eraseAt(p) {
  const tol = 6 / view.z;
  for (const item of doc.items.values()) {
    if (item.type === 'pen' && !item.locked && penHit(item, p, tol)) removeItems([item.id]);
  }
  invalidate();
}

// ---- Pointer move / up ----------------------------------------------------

function onPointerMove(e) {
  trackPointer(e);
  pointer.inside = true;

  if (!mode) {
    updateHover();
    if (tool === 'sticky') invalidate();
    return;
  }
  switch (mode.type) {
    case 'pan':
      if (!mode.moved && Math.hypot(pointer.x - mode.sx, pointer.y - mode.sy) < 4) return;
      mode.moved = true;
      view.x = mode.vx - (pointer.x - mode.sx) / view.z;
      view.y = mode.vy - (pointer.y - mode.sy) / view.z;
      break;
    case 'marquee': {
      const s = mode.start, p = pointer.world;
      mode.rect = { x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) };
      const picked = new Set(mode.base);
      for (const item of doc.items.values()) {
        const b = bounds(item);
        const inside = item.type === 'frame' ? rectInside(b, mode.rect) : rectsTouch(b, mode.rect);
        if (inside && !item.locked) for (const id of withGroup(item)) picked.add(id);
      }
      sel.clear();
      for (const id of picked) sel.add(id);
      break;
    }
    case 'move': {
      if (!mode.started) {
        if (near(mode.start, pointer.world, 3 / view.z)) return;
        startMove();
      }
      let dx = pointer.world.x - mode.start.x;
      let dy = pointer.world.y - mode.start.y;
      mode.guides = null;
      if (!e.ctrlKey && !e.metaKey && mode.box) {
        const s = snap({ ...mode.box, x: mode.box.x + dx, y: mode.box.y + dy }, mode.snapLines);
        dx += s.dx;
        dy += s.dy;
        mode.guides = s.guides;
      }
      for (const [id, item] of mode.orig) patch(id, moveItem(item, dx, dy));
      break;
    }
    case 'resize': applyResize(e); break;
    case 'draw': {
      const s = mode.start, p = pointer.world;
      if (!near(s, p, 4 / view.z)) {
        mode.rect = { x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) };
      }
      break;
    }
    case 'pen': {
      const pts = mode.points;
      const lx = pts[pts.length - 2], ly = pts[pts.length - 1];
      if (Math.hypot(pointer.world.x - lx, pointer.world.y - ly) >= 1.5 / view.z) pts.push(pointer.world.x, pointer.world.y);
      break;
    }
    case 'erase': eraseAt(pointer.world); break;
    case 'line': connectHint = connectTarget(pointer.world, mode.start.id); break;
    case 'quick':
      if (near(pointer, mode.origin, 6)) return;
      mode.moved = true;
      connectHint = connectTarget(pointer.world, mode.fromId);
      break;
    case 'endpoint': {
      const line = doc.items.get(mode.id);
      const other = mode.which === 'a' ? line.b : line.a;
      connectHint = connectTarget(pointer.world, other.id);
      patch(mode.id, { [mode.which]: connectHint || { ...pointer.world } });
      break;
    }
  }
  invalidate();
}

function updateHover() {
  if (tool === 'line') {
    connectHint = connectTarget(pointer.world);
    invalidate();
    return;
  }
  if (connectHint) { connectHint = null; invalidate(); }
  if (tool !== 'select' || spaceDown) { if (hover) { hover = null; invalidate(); } return; }

  const handle = selectionHandles().find(hd => near(hd, pointer, 9));
  if (handle) { syncCursor(handle.end ? 'move' : HANDLE_CURSORS[handle.pos]); return; }
  if (quickDots().some(d => near(d, pointer, 11))) { syncCursor('pointer'); return; }

  const item = hitTest(pointer.world);
  if ((item?.id ?? null) !== (hover?.id ?? null)) { hover = item; invalidate(); }
  syncCursor(item ? 'move' : 'default');
}

function onPointerUp(e) {
  trackPointer(e);
  if (!mode) return;
  const m = mode;
  switch (m.type) {
    case 'pan':
      mode = null;
      syncCursor();
      if (m.button === 2 && !m.moved) showContextMenu(e.clientX, e.clientY);
      break;
    case 'marquee':
      mode = null;
      selectionChanged();
      break;
    case 'move':
      mode = null;
      if (m.started) { commit(); refreshContextBar(); }
      else if (m.soleBefore && !e.shiftKey && editableText(doc.items.get(m.clickedId))) startEdit(m.clickedId);
      break;
    case 'resize':
    case 'erase':
      mode = null;
      commit();
      break;
    case 'endpoint':
      mode = null;
      connectHint = null;
      commit();
      break;
    case 'draw': finishDraw(); break;
    case 'pen': {
      const item = strokeFrom(m.points);
      mode = null;
      addItem(item);
      commit();
      break;
    }
    case 'line': finishLine(); connectHint = null; break;
    case 'quick': connectHint = null; finishQuick(); break;
  }
  invalidate();
}

const editableText = item => item && !item.locked && (TEXTUAL.has(item.type) || item.type === 'line' || item.type === 'frame');

function finishDraw() {
  const { kind, rect, start } = mode;
  mode = null;
  if (kind === 'text') {
    const item = addItem(makeItem('text', rect && rect.w > 40 ? { x: rect.x, y: rect.y, w: rect.w } : { x: start.x, y: start.y - 16 }));
    setTool('select');
    setSelection([item.id]);
    startEdit(item.id);
  } else if (kind === 'shape') {
    const r = rect && rect.w > 8 && rect.h > 8 ? rect : { x: start.x - 90, y: start.y - 60, w: 180, h: 120 };
    const item = addItem(makeItem('shape', r));
    setTool('select');
    setSelection([item.id]);
    commit();
  } else {
    const r = rect && rect.w > 40 && rect.h > 40 ? rect : { x: start.x - 480, y: start.y - 270, w: 960, h: 540 };
    const seq = nextFrameSeq();
    const item = addItem(makeItem('frame', { ...r, title: `Frame ${framesInOrder().length + 1}`, seq }));
    setTool('select');
    setSelection([item.id]);
    commit();
  }
}

function onDoubleClick() {
  if (present.on || tool !== 'select' || editing) return;
  const item = hitTest(pointer.world);
  if (!item) {
    const made = createStickyAt(pointer.world);
    return made;
  }
  if (editableText(item)) startEdit(item.id);
}

function onWheel(e) {
  if (e.target.closest && e.target.closest('#framesPanel, #pop')) return;
  e.preventDefault();
  if (present.on) return;
  const r = stage.getBoundingClientRect();
  const at = { x: e.clientX - r.left, y: e.clientY - r.top };
  const unit = e.deltaMode === 1 ? 16 : 1;
  // Notched mouse wheels send whole-number steps with no sideways motion;
  // precision touchpads do not. Wheels zoom, touchpads pan, pinch zooms.
  const notched = Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50 && e.deltaX === 0 && !e.shiftKey;
  if (e.ctrlKey || e.metaKey || notched) {
    const speed = e.ctrlKey && !notched ? 0.01 : 0.0016;
    zoomAt(at, view.z * Math.exp(-e.deltaY * unit * speed));
  } else {
    view.x += (e.shiftKey ? e.deltaY : e.deltaX) * unit / view.z;
    view.y += (e.shiftKey ? 0 : e.deltaY) * unit / view.z;
    invalidate();
  }
}

// ---- Text editor ----------------------------------------------------------

let editing = null;

function editableValue(item) {
  return item.type === 'frame' ? item.title : item.text;
}

function startEdit(id) {
  if (editing) commitEdit();
  const item = doc.items.get(id);
  if (!item) return;
  const single = item.type === 'frame' || item.type === 'line';
  const area = h('textarea', {
    className: `editor${single ? ' boxed' : ''}`,
    value: editableValue(item) || '',
    // Browser-level spellcheck can upload typed text to a cloud service, and
    // the data-* opt-outs cover common grammar extensions.
    spellcheck: false, autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off',
    'aria-label': 'Edit text', 'data-gramm': 'false', 'data-gramm_editor': 'false', 'data-enable-grammarly': 'false', 'data-lt-active': 'false',
  });
  area.setAttribute('spellcheck', 'false');
  area.setAttribute('autocorrect', 'off');
  stage.append(area);
  editing = { id, area, single };
  area.addEventListener('input', () => { positionEditor(); });
  area.addEventListener('keydown', onEditorKey);
  area.addEventListener('blur', () => { if (editing?.area === area) commitEdit(); });
  $('#hint').hidden = item.type !== 'sticky';
  $('#hint').replaceChildren(h('b', {}, 'Tab'), ' next  ·  ', h('b', {}, 'Ctrl+Enter'), ' below  ·  ', h('b', {}, 'Esc'), ' done');
  refreshContextBar();
  positionEditor();
  area.focus();
  area.setSelectionRange(area.value.length, area.value.length);
  invalidate();
}

function draftOf(item, text) {
  return { ...item, text };
}

function positionEditor() {
  if (!editing) return;
  const item = doc.items.get(editing.id);
  if (!item) { cancelEdit(); return; }
  const area = editing.area;
  const z = view.z;
  const css = area.style;
  if (item.type === 'frame') {
    const p = toScreen(item);
    css.left = `${p.x}px`; css.top = `${p.y - 28}px`; css.width = '240px'; css.height = '24px';
    css.fontSize = '13px'; css.lineHeight = '24px'; css.fontWeight = '600'; css.color = INK; css.paddingTop = '0';
    return;
  }
  if (item.type === 'line') {
    const p = toScreen(pathMidpoint(linePath(item)));
    css.left = `${p.x - 90}px`; css.top = `${p.y - 14}px`; css.width = '180px'; css.height = '28px';
    css.fontSize = '15px'; css.lineHeight = '28px'; css.textAlign = 'center'; css.color = item.color; css.paddingTop = '0';
    return;
  }
  const L = layoutOf(draftOf(item, area.value));
  const box = screenRect(L.box);
  css.left = `${box.x}px`;
  css.top = `${box.y}px`;
  css.width = `${box.w}px`;
  css.fontSize = `${L.size * z}px`;
  css.lineHeight = `${L.lineH * z}px`;
  css.fontWeight = item.bold ? '600' : '400';
  css.textAlign = item.align;
  css.color = item.type === 'sticky' ? textOn(item.color) : item.color;
  if (item.type === 'text') {
    css.height = `${Math.max(L.totalH, L.lineH) * z + 4}px`;
    css.paddingTop = '0';
  } else {
    css.height = `${box.h}px`;
    css.paddingTop = `${Math.max(0, (L.top - L.box.y) * z)}px`;
  }
}

function onEditorKey(e) {
  e.stopPropagation();
  const item = doc.items.get(editing.id);
  if (e.key === 'Escape') { e.preventDefault(); commitEdit(); return; }
  if (editing.single && e.key === 'Enter') { e.preventDefault(); commitEdit(); return; }
  if (e.key === 'Tab' && item.type === 'sticky') {
    e.preventDefault();
    commitEdit();
    nextSticky(doc.items.get(item.id), 'right');
    return;
  }
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && item.type === 'sticky') {
    e.preventDefault();
    commitEdit();
    nextSticky(doc.items.get(item.id), 'down');
  }
}

function closeEditor() {
  const { area } = editing;
  editing = null;
  area.remove();
  $('#hint').hidden = true;
  canvas.focus({ preventScroll: true });
}

function commitEdit() {
  if (!editing) return;
  const { id, area } = editing;
  const value = area.value;
  closeEditor();
  const item = doc.items.get(id);
  if (item) {
    if (item.type === 'frame') patch(id, { title: value.trim() || item.title });
    else if (item.type === 'text' && !value.trim()) { removeItems([id]); sel.delete(id); }
    else {
      const next = patch(id, { text: value });
      if (next.type === 'text') doc.items.set(id, withTextHeight(next));
    }
  }
  commit();
  selectionChanged();
}

function cancelEdit() {
  if (editing) closeEditor();
}

// ---- Keyboard -------------------------------------------------------------

const TOOL_KEYS = { v: 'select', h: 'hand', n: 'sticky', t: 'text', s: 'shape', l: 'line', p: 'pen', e: 'eraser', f: 'frame' };

function typingInField(target) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

function onKeyDown(e) {
  if ($('#dialog').open) return;
  const ctrl = e.ctrlKey || e.metaKey;

  if (ctrl && e.key.toLowerCase() === 's') { e.preventDefault(); (e.shiftKey ? saveFileAs() : saveFile()); return; }
  if (ctrl && e.key.toLowerCase() === 'o') { e.preventDefault(); openFile(); return; }
  if (ctrl && e.key.toLowerCase() === 'f') { e.preventDefault(); openFind(); return; }
  if (typingInField(e.target)) return;

  if (present.on) {
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); showFrame(present.index + 1); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); showFrame(present.index - 1); }
    else if (e.key === 'Escape') endPresenting();
    return;
  }

  if (e.key === ' ') {
    e.preventDefault();
    if (!spaceDown) { spaceDown = true; syncCursor(); }
    return;
  }

  if (ctrl) {
    const key = e.key.toLowerCase();
    const actions = {
      z: () => (e.shiftKey ? redo() : undo()),
      y: redo,
      a: () => setSelection(doc.order.filter(id => !doc.items.get(id).locked)),
      d: duplicateSelection,
      g: () => (e.shiftKey ? ungroupSelection() : groupSelection()),
      l: toggleLock,
      '=': () => zoomAt(stageCenter(), view.z * 1.25),
      '+': () => zoomAt(stageCenter(), view.z * 1.25),
      '-': () => zoomAt(stageCenter(), view.z / 1.25),
      0: zoomToActualSize,
      1: fitBoard,
      2: zoomToSelection,
      ']': () => reorder(true),
      '[': () => reorder(false),
    };
    if (actions[key]) { e.preventDefault(); actions[key](); }
    return;
  }
  if (e.altKey) return;

  switch (e.key) {
    case 'Escape':
      closePopover();
      if (mode) {
        mode = null;
        connectHint = null;
        doc.items = new Map(history.base.items);
        doc.order = history.base.order.slice();
        selectionChanged();
        return;
      }
      if (tool !== 'select') setTool('select');
      else if (find.matches.length) closeFind();
      else setSelection([]);
      return;
    case 'Delete':
    case 'Backspace':
      e.preventDefault();
      deleteSelection();
      return;
    case 'Enter': {
      const item = sel.size === 1 ? selectedItems()[0] : null;
      if (editableText(item)) { e.preventDefault(); startEdit(item.id); }
      return;
    }
    case 'Tab': {
      const item = sel.size === 1 ? selectedItems()[0] : null;
      if (item?.type === 'sticky') { e.preventDefault(); nextSticky(item, 'right'); }
      return;
    }
    case 'PageUp': e.preventDefault(); reorder(true); return;
    case 'PageDown': e.preventDefault(); reorder(false); return;
    case '?': showHelp(); return;
    case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown': {
      if (!sel.size) return;
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      for (const id of moveTargets()) patch(id, moveItem(doc.items.get(id), dx, dy));
      commit();
      return;
    }
  }

  const key = e.key.toLowerCase();
  if (key === 'm') { toggleMinimap(); return; }
  if (key === 'i') { $('#imageInput').click(); return; }
  if (TOOL_KEYS[key]) setTool(TOOL_KEYS[key]);
}

function onKeyUp(e) {
  if (e.key === ' ') {
    spaceDown = false;
    syncCursor();
  }
}

function onPaste(e) {
  if (typingInField(e.target) || present.on) return;
  const files = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
  const spot = pointer.inside ? pointer.world : toWorld(stageCenter());
  if (files.length) { e.preventDefault(); addImageFiles(files, spot); return; }
  const text = e.clipboardData?.getData('text/plain') ?? '';
  e.preventDefault();
  if (clip && text === clip.text) pasteClip();
  else pasteLines(text);
}

function onCopy(e) {
  if (!typingInField(e.target)) copySelection(e);
}

function onCut(e) {
  if (!typingInField(e.target) && copySelection(e)) deleteSelection();
}

function onDrop(e) {
  e.preventDefault();
  const files = [...(e.dataTransfer?.files || [])];
  if (!files.length) return;
  trackPointer(e);
  const board = files.find(f => /\.(mircore|json)$/i.test(f.name));
  if (board) { openDroppedFile(board); return; }
  addImageFiles(files.filter(f => f.type.startsWith('image/')), pointer.world);
}

function bindInput() {
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('mousedown', e => e.preventDefault()); // otherwise the canvas steals focus from a new editor
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', () => { mode = null; commit(); });
  canvas.addEventListener('pointerleave', () => { pointer.inside = false; invalidate(); });
  canvas.addEventListener('dblclick', onDoubleClick);
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  stage.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => { spaceDown = false; syncCursor(); });
  window.addEventListener('paste', onPaste);
  window.addEventListener('copy', onCopy);
  window.addEventListener('cut', onCut);
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', onDrop);
  window.addEventListener('resize', () => {
    resizeCanvas();
    if (present.on) showFrame(present.index);
  });
}
