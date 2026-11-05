// Constants, helpers and the document model.
//
// Items are immutable: every change replaces the object in `doc.items`. That
// makes undo a cheap reference snapshot and lets text layout be cached per
// item in a WeakMap.

const FORMAT = 'mircore-board';
const FORMAT_VERSION = 1;
const FILE_EXT = '.mircore';
const FONT_STACK = '"Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,Roboto,"Helvetica Neue",Arial,sans-serif';
const ACCENT = '#0e7c66';
const INK = '#1f2933';

const STICKY_COLORS = ['#fdf0a6', '#ffd9a8', '#ffc2b3', '#f9c6dc', '#dcc9f7', '#bfdcfa', '#b9ebe0', '#cdeab0', '#e9e3d3', '#ffffff', '#c9ced6', '#3b4252'];
const INK_COLORS = ['#1f2933', '#5f6b7a', '#b42318', '#c2570c', '#a16207', '#15803d', '#0e7c66', '#1d5fd1', '#6d3fd1', '#be2d86', '#c9ced6', '#ffffff'];
const FILL_COLORS = ['transparent', '#ffffff', '#fdf0a6', '#ffd9a8', '#ffc2b3', '#f9c6dc', '#dcc9f7', '#bfdcfa', '#b9ebe0', '#cdeab0', '#e9e3d3', '#1f2933'];
const SHAPE_NAMES = ['rect', 'round', 'ellipse', 'diamond', 'triangle', 'parallelogram', 'hexagon', 'star'];
const ITEM_TYPES = ['sticky', 'text', 'shape', 'line', 'pen', 'frame', 'image'];
const CONNECTABLE = new Set(['sticky', 'text', 'shape', 'image']);
const TEXTUAL = new Set(['sticky', 'text', 'shape']);
const MIN_SIZE = 16;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 4;

const $ = (selector, root = document) => root.querySelector(selector);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) node.addEventListener(ev, fn);
    else if (k === 'role' || k.startsWith('aria-') || k.startsWith('data-')) node.setAttribute(k, v);
    else node[k] = v;
  }
  node.append(...children.filter(c => c !== null && c !== undefined));
  return node;
}

function uid() {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return Array.from(bytes, b => (b % 36).toString(36)).join('');
}

function isDarkColor(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return false;
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) < 128;
}
const textOn = fill => (isDarkColor(fill) ? '#ffffff' : INK);

// ---- Document -------------------------------------------------------------

const doc = {
  title: 'Untitled board',
  items: new Map(),
  order: [],
  assets: new Map(), // id -> data URL. Only assets still referenced get saved.
};

const view = { x: 0, y: 0, z: 1 };
const sel = new Set();

const memory = {
  stickyColor: STICKY_COLORS[0],
  shape: 'rect',
  lineKind: 'curve',
  penColor: INK_COLORS[0],
  penWidth: 3,
  penAlpha: 1,
};

const DEFAULTS = {
  sticky: () => ({ x: 0, y: 0, w: 200, h: 200, color: memory.stickyColor, text: '', fontSize: 0, bold: false, align: 'center' }),
  text: () => ({ x: 0, y: 0, w: 320, h: 40, text: '', fontSize: 24, color: INK, bold: false, align: 'left' }),
  shape: () => ({ x: 0, y: 0, w: 180, h: 120, shape: memory.shape, fill: '#ffffff', stroke: INK, strokeWidth: 2, dash: false, text: '', fontSize: 18, color: INK, bold: false, align: 'center' }),
  line: () => ({ a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, kind: memory.lineKind, color: INK, width: 2, dash: false, startCap: 'none', endCap: 'arrow', text: '' }),
  pen: () => ({ x: 0, y: 0, w: 1, h: 1, ow: 1, oh: 1, pts: [], color: memory.penColor, width: memory.penWidth, alpha: memory.penAlpha }),
  frame: () => ({ x: 0, y: 0, w: 960, h: 540, title: 'Frame', fill: '#ffffff', seq: 0 }),
  image: () => ({ x: 0, y: 0, w: 100, h: 100, asset: '' }),
};

function makeItem(type, props = {}) {
  return { id: uid(), type, locked: false, group: null, ...DEFAULTS[type](), ...props };
}

function addItem(item) {
  doc.items.set(item.id, item);
  doc.order.push(item.id);
  syncEmptyState();
  return item;
}

function patch(id, changes) {
  const item = doc.items.get(id);
  if (!item) return null;
  const next = { ...item, ...changes };
  doc.items.set(id, next);
  return next;
}

function framesInOrder() {
  return doc.order.map(id => doc.items.get(id)).filter(i => i.type === 'frame').sort((a, b) => a.seq - b.seq);
}

// Frames always sit behind everything else, so the paint order is two passes.
function paintOrder() {
  const frames = [];
  const rest = [];
  for (const id of doc.order) {
    const item = doc.items.get(id);
    (item.type === 'frame' ? frames : rest).push(item);
  }
  return frames.concat(rest);
}

// ---- History --------------------------------------------------------------

const HISTORY_LIMIT = 200;
const history = { past: [], future: [], base: null };

const snapshot = () => ({ items: new Map(doc.items), order: doc.order.slice() });

function sameAsBase() {
  const b = history.base;
  if (doc.order.length !== b.order.length || doc.items.size !== b.items.size) return false;
  for (let i = 0; i < doc.order.length; i++) if (doc.order[i] !== b.order[i]) return false;
  for (const [id, item] of doc.items) if (b.items.get(id) !== item) return false;
  return true;
}

function resetHistory() {
  history.past = [];
  history.future = [];
  history.base = snapshot();
  syncHistoryButtons();
}

// Call once per user-visible action. No-ops when nothing actually changed.
function commit() {
  if (sameAsBase()) { invalidate(); return false; }
  history.past.push(history.base);
  if (history.past.length > HISTORY_LIMIT) history.past.shift();
  history.future = [];
  history.base = snapshot();
  afterChange();
  return true;
}

function restore(snap) {
  doc.items = new Map(snap.items);
  doc.order = snap.order.slice();
  for (const id of [...sel]) if (!doc.items.has(id)) sel.delete(id);
  afterChange();
  selectionChanged();
}

function undo() {
  if (!history.past.length) return;
  history.future.push(history.base);
  history.base = history.past.pop();
  restore(history.base);
}

function redo() {
  if (!history.future.length) return;
  history.past.push(history.base);
  history.base = history.future.pop();
  restore(history.base);
}

function afterChange() {
  markDirty();
  syncHistoryButtons();
  syncEmptyState();
  refreshFramesPanel();
  invalidate();
}
