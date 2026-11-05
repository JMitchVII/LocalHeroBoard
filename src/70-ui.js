// Toolbars, menus, panels and dialogs.

const ICONS = {
  select: '<path d="M5 3.5l14 8-6.2 1.4L9.6 19z"/>',
  hand: '<path d="M8 12V6a1.5 1.5 0 013 0v5m0-1V4.5a1.5 1.5 0 013 0V11m0-4.5a1.5 1.5 0 013 0V12m0-3a1.5 1.5 0 013 0v5c0 4-2.6 7-6.5 7-3 0-4.6-1.2-6-3.4L4.2 14a1.6 1.6 0 012.6-1.8L8 13.5"/>',
  sticky: '<path d="M4 4h16v11l-5 5H4z"/><path d="M15 20v-5h5"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  shape: '<rect x="3.5" y="9.5" width="11" height="11" rx="1.5"/><circle cx="15.5" cy="8.5" r="5"/>',
  line: '<path d="M4 20C10 20 8 5 18 5"/><path d="M14.5 3.5L19 5l-2 4.2"/>',
  pen: '<path d="M4 20l1-4.5L16 4.5a2.1 2.1 0 013 3L8 18.5z"/><path d="M14 6.5l3.5 3.5"/>',
  eraser: '<path d="M9 20l-5-5a2 2 0 010-2.8l8-8a2 2 0 012.8 0l5.2 5.2a2 2 0 010 2.8L13 20z"/><path d="M8.5 8.5l7 7M9 20h11"/>',
  frame: '<path d="M7 3v18M17 3v18M3 7h18M3 17h18"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.7"/><path d="M4 17l5-4 3.5 3 3-2.5L20 17"/>',
  undo: '<path d="M8 5L4 9l4 4"/><path d="M4 9h10a6 6 0 010 12h-3"/>',
  redo: '<path d="M16 5l4 4-4 4"/><path d="M20 9H10a6 6 0 000 12h3"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  frames: '<rect x="3.5" y="4.5" width="17" height="6" rx="1"/><rect x="3.5" y="13.5" width="17" height="6" rx="1"/>',
  help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.6a2.5 2.5 0 114 2c-1 .7-1.6 1.2-1.6 2.4"/><path d="M12 17v.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  map: '<path d="M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2zM9 4v14M15 6v14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  shield: '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8-7.5 9.5-4.3-1.5-7.5-4.9-7.5-9.5V6z"/><path d="M8.8 12l2.3 2.3 4.2-4.6"/>',
  more: '<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  left: '<path d="M15 6l-6 6 6 6"/>',
  right: '<path d="M9 6l6 6-6 6"/>',
  lock: '<rect x="5" y="11" width="14" height="9.5" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  unlock: '<rect x="5" y="11" width="14" height="9.5" rx="2"/><path d="M8 11V8a4 4 0 017.6-1.7"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5V5a1.5 1.5 0 00-1.5-1.5H5A1.5 1.5 0 003.5 5v9A1.5 1.5 0 005 15.5h3.5"/>',
  alignL: '<path d="M4 4v16M8 8h12M8 16h7"/>',
  alignC: '<path d="M5 7h14M8 12h8M5 17h14"/>',
  alignR: '<path d="M20 4v16M4 8h12M9 16h7"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1"/>',
  arrange: '<path d="M4 5h16M4 19h16"/><rect x="7" y="9" width="10" height="6" rx="1"/>',
  straight: '<path d="M4 20L20 4"/>',
  elbow: '<path d="M4 20h8V4h8"/>',
  curve: '<path d="M4 20C12 20 12 4 20 4"/>',
  dash: '<path d="M3 12h4M10 12h4M17 12h4"/>',
  arrowEnd: '<path d="M3 12h17M15 7l5 5-5 5"/>',
  arrowStart: '<path d="M21 12H4M9 7l-5 5 5 5"/>',
};

const SHAPE_ICONS = {
  rect: '<rect x="4" y="6" width="16" height="12"/>',
  round: '<rect x="4" y="6" width="16" height="12" rx="3.5"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="8.5" ry="6.5"/>',
  diamond: '<path d="M12 3.5L20.5 12 12 20.5 3.5 12z"/>',
  triangle: '<path d="M12 4.5l8.5 15h-17z"/>',
  parallelogram: '<path d="M7.5 6H21l-4.5 12H3z"/>',
  hexagon: '<path d="M7.5 5h9l4.5 7-4.5 7h-9L3 12z"/>',
  star: '<path d="M12 3.5l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 17l-5.3 2.9 1.2-6L3.4 9.8l6-.7z"/>',
};

const svg = inner => `<svg viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;

function setIcon(node, name) {
  node.innerHTML = svg(ICONS[name]);
}

function iconButton(name, label, onClick, options = {}) {
  const b = h('button', { className: 'btn', title: label, type: 'button', 'aria-label': label, on: { click: onClick } });
  b.innerHTML = svg(options.raw || ICONS[name]);
  if (options.pressed !== undefined) b.setAttribute('aria-pressed', String(!!options.pressed));
  return b;
}

// ---- Left toolbar ---------------------------------------------------------

const TOOLS = [
  ['select', 'select', 'Select', 'V'], ['hand', 'hand', 'Pan', 'H'], ['sticky', 'sticky', 'Sticky note', 'N'],
  ['text', 'text', 'Text', 'T'], ['shape', 'shape', 'Shapes', 'S'], ['line', 'line', 'Connector', 'L'],
  ['pen', 'pen', 'Pen', 'P'], ['eraser', 'eraser', 'Eraser', 'E'], ['frame', 'frame', 'Frame', 'F'],
];

function buildToolbar() {
  const list = $('#toolList');
  for (const [id, icon, label, key] of TOOLS) {
    const b = iconButton(icon, `${label} (${key})`, () => setTool(id));
    b.dataset.tool = id;
    b.append(h('span', { className: 'key' }, key));
    list.append(b);
  }
  list.append(iconButton('image', 'Add image from file (I)', () => $('#imageInput').click()));
}

function syncToolbar() {
  for (const b of document.querySelectorAll('#toolList [data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === tool));
  const fly = $('#flyout');
  fly.replaceChildren();
  fly.hidden = !['sticky', 'shape', 'pen'].includes(tool);
  if (fly.hidden) return;
  if (tool === 'sticky') {
    fly.append(h('div', { className: 'title' }, 'Sticky colour'), swatchGrid(STICKY_COLORS, memory.stickyColor, c => { memory.stickyColor = c; syncToolbar(); }));
  } else if (tool === 'shape') {
    const grid = h('div', { className: 'grid4' });
    for (const name of SHAPE_NAMES) {
      grid.append(iconButton(null, name, () => { memory.shape = name; syncToolbar(); }, { raw: SHAPE_ICONS[name], pressed: memory.shape === name }));
    }
    fly.append(h('div', { className: 'title' }, 'Drag on the board'), grid);
  } else {
    const marker = memory.penAlpha < 1;
    const kinds = h('div', { className: 'row' },
      textButton('Pen', !marker, () => { Object.assign(memory, { penAlpha: 1, penWidth: 3 }); syncToolbar(); }),
      textButton('Marker', marker, () => { Object.assign(memory, { penAlpha: 0.35, penWidth: 20 }); syncToolbar(); }));
    fly.append(kinds, swatchGrid(INK_COLORS, memory.penColor, c => { memory.penColor = c; syncToolbar(); }, true));
  }
  const anchor = document.querySelector(`#toolList [data-tool="${tool}"]`).getBoundingClientRect();
  fly.style.top = `${anchor.top - 6}px`;
}

function textButton(label, pressed, onClick, title = label) {
  const b = h('button', { className: 'btn txt', type: 'button', title, 'aria-label': title, on: { click: onClick } }, label);
  if (pressed !== undefined) b.setAttribute('aria-pressed', String(!!pressed));
  return b;
}

function swatchGrid(colors, current, pick, round = false) {
  const grid = h('div', { className: 'grid6' });
  for (const color of colors) {
    const b = h('button', {
      type: 'button', className: `swatch${round ? ' round' : ''}${color === 'transparent' ? ' none' : ''}`,
      title: color === 'transparent' ? 'No fill' : color, 'aria-label': color === 'transparent' ? 'No fill' : `Colour ${color}`,
      'aria-pressed': String(color === current), on: { click: () => pick(color) },
    });
    b.style.background = color;
    grid.append(b);
  }
  return grid;
}

function syncHistoryButtons() {
  $('#undoBtn').disabled = !history.past.length;
  $('#redoBtn').disabled = !history.future.length;
}

function syncEmptyState() {
  $('#empty').hidden = doc.items.size > 0;
}

function syncZoomLabel() {
  const label = `${Math.round(view.z * 100)}%`;
  const node = $('#zoomLabel');
  if (node.textContent !== label) node.textContent = label;
}

function syncStatus() {
  const node = $('#status');
  node.className = 'status';
  let text;
  if (file.failed) { text = 'Save failed'; node.classList.add('err'); }
  else if (file.saving) text = 'Saving…';
  else if (!file.name) {
    text = doc.items.size ? 'Not saved yet' : 'New board';
    if (doc.items.size) node.classList.add('warn');
  } else if (file.dirty) {
    text = file.handle ? 'Saving soon…' : `${file.name}: unsaved changes`;
    if (!file.handle) node.classList.add('warn');
  } else text = `Saved to ${file.name}`;
  node.textContent = text;
}

// ---- Popovers and menus ---------------------------------------------------

const pop = $('#pop');

function closePopover() {
  pop.hidden = true;
  pop.replaceChildren();
}

function openPopover(content, x, y) {
  pop.replaceChildren(content);
  pop.hidden = false;
  const r = pop.getBoundingClientRect();
  pop.style.left = `${clamp(x, 8, window.innerWidth - r.width - 8)}px`;
  pop.style.top = `${clamp(y, 8, window.innerHeight - r.height - 8)}px`;
}

function popoverBelow(anchor, content) {
  const r = anchor.getBoundingClientRect();
  openPopover(content, r.left, r.bottom + 8);
}

function menu(entries) {
  const root = h('div', { className: 'menu', role: 'menu' });
  for (const entry of entries) {
    if (!entry) { root.append(h('hr')); continue; }
    const b = h('button', {
      type: 'button', role: 'menuitem', disabled: !!entry.disabled, className: entry.danger ? 'danger' : '',
      on: { click: () => { closePopover(); entry.run(); } },
    }, h('span', {}, entry.label), entry.key ? h('kbd', {}, entry.key) : null);
    root.append(b);
  }
  return root;
}

function fileMenuEntries() {
  return [
    { label: 'New board', run: newBoard },
    { label: 'Open…', key: 'Ctrl+O', run: openFile },
    null,
    { label: 'Save', key: 'Ctrl+S', run: saveFile },
    { label: 'Save as…', key: 'Ctrl+Shift+S', run: saveFileAs },
    null,
    { label: sel.size ? 'Export selection as PNG…' : 'Export board as PNG…', run: exportPng },
    { label: 'Print or save as PDF…', run: printBoard },
  ];
}

function arrangeEntries() {
  const items = selectedItems();
  const grouped = items.some(i => i.group);
  const locked = items.length && items.every(i => i.locked);
  return [
    { label: 'Duplicate', key: 'Ctrl+D', run: duplicateSelection, disabled: !items.length },
    { label: 'Bring to front', key: 'Ctrl+]', run: () => reorder(true), disabled: !items.length },
    { label: 'Send to back', key: 'Ctrl+[', run: () => reorder(false), disabled: !items.length },
    null,
    { label: grouped ? 'Ungroup' : 'Group', key: grouped ? 'Ctrl+Shift+G' : 'Ctrl+G', run: grouped ? ungroupSelection : groupSelection, disabled: items.length < 2 && !grouped },
    { label: locked ? 'Unlock' : 'Lock', key: 'Ctrl+L', run: toggleLock, disabled: !items.length },
    null,
    { label: 'Delete', key: 'Del', run: deleteSelection, disabled: !items.length, danger: true },
  ];
}

function showContextMenu(x, y) {
  if (present.on) return;
  const item = hitTest(pointer.world);
  if (item && !sel.has(item.id)) setSelection(withGroup(item));
  const entries = sel.size ? arrangeEntries() : [
    { label: 'Add sticky here', run: () => createStickyAt(pointer.world) },
    { label: 'Select all', key: 'Ctrl+A', run: () => setSelection(doc.order.filter(id => !doc.items.get(id).locked)), disabled: !doc.order.length },
    { label: 'Fit board to screen', key: 'Ctrl+1', run: fitBoard },
  ];
  openPopover(menu(entries), x, y);
}

// ---- Selection toolbar ----------------------------------------------------

function colorControl(label, current, palette, apply, round) {
  const b = h('button', {
    type: 'button', className: `swatch btnlike${round ? ' round' : ''}${current === 'transparent' ? ' none' : ''}`, title: label, 'aria-label': label,
    on: { click: () => popoverBelow(b, swatchGrid(palette, current, c => { closePopover(); apply(c); }, round)) },
  });
  b.style.background = current;
  b.style.margin = '0 3px';
  return b;
}

function refreshContextBar() {
  const bar = $('#ctx');
  bar.replaceChildren();
  const items = selectedItems();
  if (!items.length || editing || present.on || (mode && mode.type !== 'marquee')) { bar.hidden = true; return; }
  if (mode?.type === 'marquee') { bar.hidden = true; return; }
  const types = new Set(items.map(i => i.type));
  const first = items[0];
  const sep = () => h('span', { className: 'sep' });
  const has = (...t) => t.some(x => types.has(x));
  const allLocked = items.every(i => i.locked);

  if (allLocked) {
    bar.append(iconButton('unlock', 'Unlock (Ctrl+L)', toggleLock));
    bar.hidden = false;
    return;
  }

  if (has('sticky')) {
    const s = items.find(i => i.type === 'sticky');
    bar.append(colorControl('Sticky colour', s.color, STICKY_COLORS, c => {
      memory.stickyColor = c;
      changeSelection(i => (i.type === 'sticky' ? { color: c } : null));
    }));
  }
  if (has('shape')) {
    const s = items.find(i => i.type === 'shape');
    bar.append(
      colorControl('Fill', s.fill, FILL_COLORS, c => changeSelection(i => (i.type === 'shape' ? { fill: c } : null))),
      colorControl('Border', s.stroke, INK_COLORS, c => changeSelection(i => (i.type === 'shape' ? { stroke: c } : null)), true));
    if (items.length === 1) {
      const shapeBtn = iconButton(null, 'Change shape', () => {
        const grid = h('div', { className: 'grid4' });
        for (const name of SHAPE_NAMES) {
          grid.append(iconButton(null, name, () => { closePopover(); memory.shape = name; changeSelection(() => ({ shape: name })); }, { raw: SHAPE_ICONS[name], pressed: s.shape === name }));
        }
        popoverBelow(shapeBtn, grid);
      }, { raw: SHAPE_ICONS[s.shape] });
      bar.append(shapeBtn);
    }
  }
  if (has('frame')) {
    const f = items.find(i => i.type === 'frame');
    bar.append(colorControl('Background', f.fill, FILL_COLORS, c => changeSelection(i => (i.type === 'frame' ? { fill: c } : null))));
  }
  if (has('text')) {
    const t = items.find(i => i.type === 'text');
    bar.append(colorControl('Text colour', t.color, INK_COLORS, c => changeSelection(i => (i.type === 'text' ? { color: c } : null)), true));
  }
  if (has('line', 'pen')) {
    const l = items.find(i => i.type === 'line' || i.type === 'pen');
    bar.append(colorControl('Colour', l.color, INK_COLORS, c => changeSelection(i => (i.type === 'line' || i.type === 'pen' ? { color: c } : null)), true));
  }
  if (has('line')) {
    const l = items.find(i => i.type === 'line');
    bar.append(sep());
    for (const kind of ['curve', 'elbow', 'straight']) {
      bar.append(iconButton(kind, `${kind[0].toUpperCase()}${kind.slice(1)} line`, () => {
        memory.lineKind = kind;
        changeSelection(i => (i.type === 'line' ? { kind } : null));
      }, { pressed: l.kind === kind }));
    }
    bar.append(sep(),
      iconButton('arrowStart', 'Arrow at start', () => changeSelection(i => (i.type === 'line' ? { startCap: i.startCap === 'arrow' ? 'none' : 'arrow' } : null)), { pressed: l.startCap === 'arrow' }),
      iconButton('arrowEnd', 'Arrow at end', () => changeSelection(i => (i.type === 'line' ? { endCap: i.endCap === 'arrow' ? 'none' : 'arrow' } : null)), { pressed: l.endCap === 'arrow' }));
  }
  if (has('line', 'shape')) {
    const l = items.find(i => i.type === 'line' || i.type === 'shape');
    bar.append(iconButton('dash', 'Dashed', () => changeSelection(i => (i.type === 'line' || i.type === 'shape' ? { dash: !l.dash } : null)), { pressed: l.dash }));
  }
  if (has('line', 'pen', 'shape')) {
    const l = items.find(i => ['line', 'pen', 'shape'].includes(i.type));
    const current = l.type === 'shape' ? l.strokeWidth : l.width;
    const weight = textButton(`${Math.round(current)}px`, undefined, () => {
      popoverBelow(weight, menu([1, 2, 3, 5, 8, 12].map(w => ({
        label: `${w}px`,
        run: () => changeSelection(i => (i.type === 'shape' ? { strokeWidth: w } : ['line', 'pen'].includes(i.type) ? { width: w } : null)),
      }))));
    }, 'Line thickness');
    bar.append(weight);
  }

  if (has('sticky', 'text', 'shape')) {
    const t = items.find(i => TEXTUAL.has(i.type));
    bar.append(sep());
    const sizeBtn = textButton(t.fontSize ? `${Math.round(t.fontSize)}` : 'Auto', undefined, () => {
      const sizes = [12, 14, 18, 24, 32, 48, 64, 96];
      const entries = sizes.map(s => ({ label: String(s), run: () => changeSelection(i => (TEXTUAL.has(i.type) ? { fontSize: s } : null)) }));
      if (has('sticky')) entries.unshift({ label: 'Auto (fit to note)', run: () => changeSelection(i => (i.type === 'sticky' ? { fontSize: 0 } : null)) });
      popoverBelow(sizeBtn, menu(entries));
    }, 'Font size');
    bar.append(sizeBtn);
    bar.append(textButton('B', t.bold, () => changeSelection(i => (TEXTUAL.has(i.type) ? { bold: !t.bold } : null)), 'Bold'));
    const next = { left: 'center', center: 'right', right: 'left' }[t.align];
    bar.append(iconButton({ left: 'alignL', center: 'alignC', right: 'alignR' }[t.align], `Text alignment: ${t.align}`, () => changeSelection(i => (TEXTUAL.has(i.type) ? { align: next } : null))));
  }

  if (items.length > 1) {
    bar.append(sep());
    const alignBtn = iconButton('arrange', 'Align and distribute', () => {
      popoverBelow(alignBtn, menu([
        { label: 'Align left', run: () => alignSelection('left') },
        { label: 'Align centre', run: () => alignSelection('hcenter') },
        { label: 'Align right', run: () => alignSelection('right') },
        null,
        { label: 'Align top', run: () => alignSelection('top') },
        { label: 'Align middle', run: () => alignSelection('vcenter') },
        { label: 'Align bottom', run: () => alignSelection('bottom') },
        null,
        { label: 'Distribute horizontally', run: () => distributeSelection('x'), disabled: items.length < 3 },
        { label: 'Distribute vertically', run: () => distributeSelection('y'), disabled: items.length < 3 },
      ]));
    });
    bar.append(alignBtn, iconButton('grid', 'Tidy into a grid', tidySelection));
  }

  bar.append(sep());
  const moreBtn = iconButton('more', 'More', () => popoverBelow(moreBtn, menu(arrangeEntries())));
  bar.append(moreBtn);
  if (first) bar.hidden = false;
}

function positionContextBar() {
  const bar = $('#ctx');
  if (bar.hidden) return;
  const items = selectedItems();
  if (!items.length) return;
  const r = screenRect(unionBounds(items));
  const w = bar.offsetWidth, hh = bar.offsetHeight;
  const dots = quickDots().length ? 36 : 14;
  let y = r.y - hh - dots;
  if (y < 62) y = Math.min(r.y + r.h + dots, stage.clientHeight - hh - 62);
  const x = clamp(r.x + r.w / 2 - w / 2, 72, Math.max(72, stage.clientWidth - w - 12));
  bar.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}

// ---- Frames panel ---------------------------------------------------------

function refreshFramesPanel() {
  const panel = $('#framesPanel');
  if (panel.hidden) return;
  const frames = framesInOrder();
  panel.replaceChildren(h('h2', {}, 'Frames'));
  if (!frames.length) {
    panel.append(h('p', { className: 'none' }, 'Press F and click the board. Frames become slides when you present.'));
    return;
  }
  frames.forEach((frame, i) => {
    const swap = other => {
      patch(frame.id, { seq: other.seq });
      patch(other.id, { seq: frame.seq });
      commit();
    };
    panel.append(h('div', { className: 'frameRow' },
      h('button', {
        className: 'name', type: 'button', title: frame.title,
        on: { click: () => { setSelection([frame.id]); animateView(viewFor(frame, 110)); } },
      }, `${i + 1}. ${frame.title || 'Frame'}`),
      iconButton('up', 'Move earlier', () => frames[i - 1] && swap(frames[i - 1])),
      iconButton('down', 'Move later', () => frames[i + 1] && swap(frames[i + 1]))));
  });
}

function toggleFramesPanel() {
  const panel = $('#framesPanel');
  panel.hidden = !panel.hidden;
  $('#framesBtn').setAttribute('aria-pressed', String(!panel.hidden));
  refreshFramesPanel();
}

function toggleMinimap() {
  const map = $('#minimap');
  map.hidden = !map.hidden;
  $('#mapBtn').setAttribute('aria-pressed', String(!map.hidden));
  invalidate();
}

function bindMinimap() {
  const jump = e => {
    const { scale, ox, oy, vp } = minimapFrame();
    const r = minimap.getBoundingClientRect();
    const wx = ((e.clientX - r.left) * (minimap.width / r.width) - ox) / scale;
    const wy = ((e.clientY - r.top) * (minimap.height / r.height) - oy) / scale;
    view.x = wx - vp.w / 2;
    view.y = wy - vp.h / 2;
    invalidate();
  };
  minimap.addEventListener('pointerdown', e => { minimap.setPointerCapture(e.pointerId); jump(e); });
  minimap.addEventListener('pointermove', e => { if (e.buttons) jump(e); });
}

// ---- Find -----------------------------------------------------------------

function openFind() {
  $('#findBox').hidden = false;
  $('#findInput').focus();
  $('#findInput').select();
}

function closeFind() {
  $('#findBox').hidden = true;
  $('#findInput').value = '';
  find.matches = [];
  invalidate();
}

function syncFindCount() {
  const input = $('#findInput').value;
  $('#findCount').textContent = !input ? '' : find.matches.length ? `${find.index + 1} / ${find.matches.length}` : 'None';
}

// ---- Dialogs and toasts ---------------------------------------------------

function toast(message, isError = false) {
  const node = h('div', { className: `toast${isError ? ' err' : ''}` }, message);
  $('#toasts').append(node);
  setTimeout(() => node.remove(), isError ? 7000 : 2600);
}

function ask(title, message, buttons) {
  const dialog = $('#dialog');
  return new Promise(resolve => {
    const actions = h('div', { className: 'actions' });
    for (const b of buttons) {
      actions.append(h('button', { type: 'button', className: b.kind, on: { click: () => { dialog.close(); resolve(b.value); } } }, b.label));
    }
    dialog.replaceChildren(h('h2', {}, title), h('p', {}, message), actions);
    dialog.oncancel = () => resolve('cancel');
    dialog.showModal();
  });
}

function showDialog(...content) {
  const dialog = $('#dialog');
  const done = h('button', { type: 'button', className: 'primary', on: { click: () => dialog.close() } }, 'Close');
  dialog.oncancel = null;
  dialog.replaceChildren(...content, h('div', { className: 'actions' }, done));
  dialog.showModal();
}

function showLocalInfo() {
  const policy = $('meta[http-equiv="Content-Security-Policy"]').content;
  const code = text => h('code', {}, text);
  showDialog(
    h('h2', {}, 'This board stays on your machine'),
    h('ul', {},
      h('li', {}, 'MirCore is one HTML file with no server, no account, no analytics and no external resources.'),
      h('li', {}, 'The browser enforces this: the page’s Content Security Policy blocks every network connection, and the script is pinned by hash.'),
      h('li', {}, 'Boards are written only to files you pick. Board content is not kept in browser storage, and the board name is left out of the tab title so it stays out of browser history.'),
      h('li', {}, 'Browser spellcheck is switched off while you type, because enhanced spellcheck services can send text to the cloud.'),
      h('li', {}, 'Links are not clickable and images are stored inside the board file, so opening a board cannot reach out.')),
    h('p', {}, 'Not covered: browser extensions can read any page, so use a browser profile without extensions for sensitive boards. The operating system still controls the saved files, the clipboard and the printer you choose.'),
    h('p', {}, 'Active policy: ', code(policy)));
}

function showHelp() {
  const section = (title, rows) => [h('h3', {}, title), ...rows.map(([label, key]) => h('div', {}, h('span', {}, label), h('kbd', {}, key)))];
  showDialog(
    h('h2', {}, 'Keyboard shortcuts'),
    h('div', { className: 'keys' },
      ...section('Brainstorm', [
        ['New sticky', 'Double-click or N'], ['Next sticky to the right', 'Tab'], ['Next sticky below', 'Ctrl+Enter'], ['Finish typing', 'Esc'],
        ['Edit selected', 'Enter'], ['Connected idea', 'Drag a + dot'], ['Sticky per line', 'Paste a list'], ['Copy while dragging', 'Alt+drag'],
      ]),
      ...section('Tools', [
        ['Select', 'V'], ['Pan', 'H or Space+drag'], ['Text', 'T'], ['Shape', 'S'], ['Connector', 'L'], ['Pen', 'P'], ['Eraser', 'E'], ['Frame', 'F'], ['Image', 'I'], ['Minimap', 'M'],
      ]),
      ...section('Edit', [
        ['Undo', 'Ctrl+Z'], ['Redo', 'Ctrl+Y'], ['Duplicate', 'Ctrl+D'], ['Select all', 'Ctrl+A'], ['Group', 'Ctrl+G'], ['Ungroup', 'Ctrl+Shift+G'], ['Lock', 'Ctrl+L'],
        ['Front / back', 'Ctrl+] / Ctrl+['], ['Nudge', 'Arrows'], ['Skip snapping', 'Hold Ctrl'],
      ]),
      ...section('View and file', [
        ['Zoom', 'Ctrl+wheel'], ['Pan', 'Right-drag'], ['100%', 'Ctrl+0'], ['Fit board', 'Ctrl+1'], ['Zoom to selection', 'Ctrl+2'], ['Find', 'Ctrl+F'], ['Save', 'Ctrl+S'], ['Open', 'Ctrl+O'],
      ])));
}

// ---- Wiring ---------------------------------------------------------------

function bindUI() {
  setIcon($('#menuBtn'), 'menu');
  setIcon($('#findBtn'), 'search');
  setIcon($('#framesBtn'), 'frames');
  setIcon($('#helpBtn'), 'help');
  setIcon($('#undoBtn'), 'undo');
  setIcon($('#redoBtn'), 'redo');
  setIcon($('#zoomIn'), 'plus');
  setIcon($('#zoomOut'), 'minus');
  setIcon($('#mapBtn'), 'map');
  setIcon($('#findClose'), 'close');
  setIcon($('#prevFrame'), 'left');
  setIcon($('#nextFrame'), 'right');
  $('#localBtn').innerHTML = `${svg(ICONS.shield)}<span>Local only</span>`;

  $('#menuBtn').addEventListener('click', e => { e.stopPropagation(); popoverBelow($('#menuBtn'), menu(fileMenuEntries())); });
  $('#status').addEventListener('click', saveFile);
  $('#localBtn').addEventListener('click', showLocalInfo);
  $('#findBtn').addEventListener('click', openFind);
  $('#framesBtn').addEventListener('click', toggleFramesPanel);
  $('#helpBtn').addEventListener('click', showHelp);
  $('#presentBtn').addEventListener('click', startPresenting);
  $('#undoBtn').addEventListener('click', undo);
  $('#redoBtn').addEventListener('click', redo);
  $('#zoomIn').addEventListener('click', () => zoomAt(stageCenter(), view.z * 1.25));
  $('#zoomOut').addEventListener('click', () => zoomAt(stageCenter(), view.z / 1.25));
  $('#zoomLabel').addEventListener('click', fitBoard);
  $('#mapBtn').addEventListener('click', toggleMinimap);
  $('#prevFrame').addEventListener('click', () => showFrame(present.index - 1));
  $('#nextFrame').addEventListener('click', () => showFrame(present.index + 1));
  $('#endPresent').addEventListener('click', endPresenting);
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) endPresenting(); });

  $('#title').addEventListener('input', e => { doc.title = e.target.value || 'Untitled board'; markDirty(); });
  $('#title').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Escape') e.target.blur(); });

  $('#findInput').addEventListener('input', e => runFind(e.target.value));
  $('#findInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); stepFind(e.shiftKey ? -1 : 1); }
    if (e.key === 'Escape') closeFind();
  });
  $('#findClose').addEventListener('click', closeFind);

  document.addEventListener('click', e => {
    if (e.detail > 0 && e.target.closest?.('button')) document.activeElement?.blur?.();
  });
  document.addEventListener('pointerdown', e => {
    if (!pop.hidden && !pop.contains(e.target) && e.target !== canvas) closePopover();
  });
}
