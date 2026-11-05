// Text layout, bounds, connector routing and hit testing.

// ---- Text -----------------------------------------------------------------

const LINE_HEIGHT = 1.3;
const measureCtx = document.createElement('canvas').getContext('2d');
const fontOf = (size, bold) => `${bold ? 600 : 400} ${size}px ${FONT_STACK}`;

// Widths are measured once at 100px and scaled, so fitting a sticky's text
// never has to re-measure at each candidate size.
const widthCache = new Map();
function unitWidth(text, bold) {
  const key = (bold ? 'b' : 'n') + text;
  let w = widthCache.get(key);
  if (w === undefined) {
    if (widthCache.size > 50000) widthCache.clear();
    measureCtx.font = fontOf(100, bold);
    w = measureCtx.measureText(text).width / 100;
    widthCache.set(key, w);
  }
  return w;
}

const baselineCache = {};
function baselineRatio(bold) {
  const key = bold ? 'b' : 'n';
  if (!baselineCache[key]) {
    measureCtx.font = fontOf(100, bold);
    const m = measureCtx.measureText('Hg');
    const asc = (m.fontBoundingBoxAscent ?? 92) / 100;
    const desc = (m.fontBoundingBoxDescent ?? 24) / 100;
    baselineCache[key] = (LINE_HEIGHT - (asc + desc)) / 2 + asc;
  }
  return baselineCache[key];
}

function wrapText(text, size, bold, maxWidth) {
  const lines = [];
  for (const para of text.split('\n')) {
    let line = '';
    let lineW = 0;
    for (const token of para.split(/(\s+)/)) {
      if (!token) continue;
      const w = unitWidth(token, bold) * size;
      if (lineW + w <= maxWidth) { line += token; lineW += w; continue; }
      if (/^\s+$/.test(token)) { lines.push(line); line = ''; lineW = 0; continue; }
      if (line) { lines.push(line.trimEnd()); line = ''; lineW = 0; }
      if (w <= maxWidth) { line = token; lineW = w; continue; }
      for (const ch of token) { // a single word wider than the box: break it
        const cw = unitWidth(ch, bold) * size;
        if (lineW + cw > maxWidth && line) { lines.push(line); line = ''; lineW = 0; }
        line += ch;
        lineW += cw;
      }
    }
    lines.push(line);
  }
  return lines;
}

function fitText(text, boxW, boxH, maxSize, bold) {
  const fits = s => wrapText(text, s, bold, boxW).length * s * LINE_HEIGHT <= boxH;
  if (fits(maxSize)) return maxSize;
  let lo = Math.min(4, maxSize);
  let hi = maxSize;
  for (let i = 0; i < 9; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid; else hi = mid;
  }
  return lo;
}

const SHAPE_INSETS = {
  rect: [0.06, 0.06, 0.06, 0.06], round: [0.08, 0.08, 0.08, 0.08], ellipse: [0.16, 0.16, 0.16, 0.16],
  diamond: [0.25, 0.25, 0.25, 0.25], triangle: [0.26, 0.42, 0.26, 0.06], parallelogram: [0.2, 0.08, 0.2, 0.08],
  hexagon: [0.2, 0.1, 0.2, 0.1], star: [0.32, 0.36, 0.32, 0.22],
};

function textBox(item) {
  if (item.type === 'sticky') {
    const pad = item.w * 0.08;
    return { x: item.x + pad, y: item.y + pad, w: item.w - pad * 2, h: item.h - pad * 2 };
  }
  if (item.type === 'shape') {
    const [l, t, r, b] = SHAPE_INSETS[item.shape] || SHAPE_INSETS.rect;
    return { x: item.x + item.w * l, y: item.y + item.h * t, w: item.w * (1 - l - r), h: item.h * (1 - t - b) };
  }
  return { x: item.x, y: item.y, w: item.w, h: item.h };
}

const layoutCache = new WeakMap();
function layoutOf(item) {
  let layout = layoutCache.get(item);
  if (layout) return layout;
  const box = textBox(item);
  const text = item.text || '';
  let size;
  if (item.type === 'text') size = item.fontSize;
  else {
    const maxSize = item.fontSize || item.w * 0.16;
    size = text ? fitText(text, box.w, box.h, maxSize, item.bold) : maxSize;
  }
  const lines = wrapText(text, size, item.bold, box.w);
  const lineH = size * LINE_HEIGHT;
  const totalH = lines.length * lineH;
  layout = { box, size, lines, lineH, totalH, top: item.type === 'text' ? box.y : box.y + (box.h - totalH) / 2 };
  layoutCache.set(item, layout);
  return layout;
}

function withTextHeight(item) {
  return item.type === 'text' ? { ...item, h: Math.max(layoutOf({ ...item }).totalH, item.fontSize * LINE_HEIGHT) } : item;
}

// ---- Bounds ---------------------------------------------------------------

const center = r => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const rectsTouch = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const rectHas = (r, p) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const rectInside = (inner, outer) => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

function bounds(item) {
  if (item.type !== 'line') return { x: item.x, y: item.y, w: item.w, h: item.h };
  const pts = linePath(item);
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  for (const p of pts) {
    l = Math.min(l, p.x); t = Math.min(t, p.y);
    r = Math.max(r, p.x); b = Math.max(b, p.y);
  }
  return { x: l, y: t, w: r - l, h: b - t };
}

function unionBounds(items) {
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  for (const item of items) {
    const box = bounds(item);
    l = Math.min(l, box.x); t = Math.min(t, box.y);
    r = Math.max(r, box.x + box.w); b = Math.max(b, box.y + box.h);
  }
  return l === Infinity ? null : { x: l, y: t, w: r - l, h: b - t };
}

const selectedItems = () => [...sel].map(id => doc.items.get(id)).filter(Boolean);

// ---- Shapes ---------------------------------------------------------------

const POLYGONS = {
  diamond: [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]],
  triangle: [[0.5, 0], [1, 1], [0, 1]],
  parallelogram: [[0.2, 0], [1, 0], [0.8, 1], [0, 1]],
  hexagon: [[0.22, 0], [0.78, 0], [1, 0.5], [0.78, 1], [0.22, 1], [0, 0.5]],
  star: (() => {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.2 : 0.5;
      const a = -Math.PI / 2 + i * Math.PI / 5;
      pts.push([0.5 + Math.cos(a) * r, 0.53 + Math.sin(a) * r]);
    }
    return pts;
  })(),
};

function pointInPolygon(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointInShape(item, p) {
  const u = (p.x - item.x) / item.w;
  const v = (p.y - item.y) / item.h;
  if (item.shape === 'ellipse') return (u - 0.5) ** 2 + (v - 0.5) ** 2 <= 0.25;
  const poly = POLYGONS[item.shape];
  return poly ? pointInPolygon(poly, u, v) : u >= 0 && u <= 1 && v >= 0 && v <= 1;
}

// ---- Connectors -----------------------------------------------------------

const SIDES = {
  t: { dx: 0, dy: -1, opposite: 'b' },
  r: { dx: 1, dy: 0, opposite: 'l' },
  b: { dx: 0, dy: 1, opposite: 't' },
  l: { dx: -1, dy: 0, opposite: 'r' },
};

// Where a ray from the box centre towards `side` meets the item's outline, so
// connectors land on a triangle's slope rather than its bounding box.
function anchorPoint(item, side) {
  const { dx, dy } = SIDES[side];
  const c = center(item);
  const edge = { x: c.x + dx * item.w / 2, y: c.y + dy * item.h / 2 };
  const poly = item.type === 'shape' ? POLYGONS[item.shape] : null;
  if (!poly) return edge;
  let best = null;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % poly.length];
    const px = item.x + ax * item.w, py = item.y + ay * item.h;
    const ex = item.x + bx * item.w - px, ey = item.y + by * item.h - py;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((px - c.x) * ey - (py - c.y) * ex) / den;
    const u = ((px - c.x) * dy - (py - c.y) * dx) / den;
    if (t >= 0 && u >= 0 && u <= 1 && (best === null || t > best)) best = t;
  }
  return best === null ? edge : { x: c.x + dx * best, y: c.y + dy * best };
}

function facingSide(box, target) {
  const c = center(box);
  const dx = (target.x - c.x) / Math.max(box.w, 1);
  const dy = (target.y - c.y) / Math.max(box.h, 1);
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'r' : 'l';
  return dy > 0 ? 'b' : 't';
}

function lineEnds(line) {
  const ia = line.a.id ? doc.items.get(line.a.id) : null;
  const ib = line.b.id ? doc.items.get(line.b.id) : null;
  const ca = ia ? center(ia) : line.a;
  const cb = ib ? center(ib) : line.b;
  const resolve = (end, item, towards) => {
    if (!item) return { x: end.x, y: end.y, dir: null };
    const side = end.side && end.side !== 'auto' ? end.side : facingSide(item, towards);
    return { ...anchorPoint(item, side), dir: SIDES[side] };
  };
  return { a: resolve(line.a, ia, cb), b: resolve(line.b, ib, ca) };
}

function freeDir(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? SIDES.r : SIDES.l;
  return dy >= 0 ? SIDES.b : SIDES.t;
}

function linePath(line) {
  const { a, b } = lineEnds(line);
  if (line.kind === 'straight') return [a, b];
  const da = a.dir || freeDir(a, b);
  const db = b.dir || freeDir(b, a);
  if (line.kind === 'elbow') return elbowPath(a, b, da, db);
  const reach = Math.max(36, Math.hypot(b.x - a.x, b.y - a.y) * 0.42);
  const c1 = { x: a.x + da.dx * reach, y: a.y + da.dy * reach };
  const c2 = { x: b.x + db.dx * reach, y: b.y + db.dy * reach };
  const pts = [];
  for (let i = 0; i <= 28; i++) {
    const t = i / 28, u = 1 - t;
    pts.push({
      x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
      y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
    });
  }
  return pts;
}

function elbowPath(a, b, da, db) {
  const stub = 24;
  const s = { x: a.x + da.dx * stub, y: a.y + da.dy * stub };
  const e = { x: b.x + db.dx * stub, y: b.y + db.dy * stub };
  const horizontalA = da.dx !== 0;
  const horizontalB = db.dx !== 0;
  let mid;
  if (horizontalA && horizontalB) {
    const mx = (s.x + e.x) / 2;
    mid = [{ x: mx, y: s.y }, { x: mx, y: e.y }];
  } else if (!horizontalA && !horizontalB) {
    const my = (s.y + e.y) / 2;
    mid = [{ x: s.x, y: my }, { x: e.x, y: my }];
  } else {
    mid = [horizontalA ? { x: e.x, y: s.y } : { x: s.x, y: e.y }];
  }
  const pts = [a, s, ...mid, e, b];
  return pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) > 0.01);
}

function pathMidpoint(pts) {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  let left = total / 2;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (seg >= left && seg > 0) {
      const t = left / seg;
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t };
    }
    left -= seg;
  }
  return pts[0];
}

// ---- Hit testing ----------------------------------------------------------

function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len, 0, 1) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

function penHit(item, p, tol) {
  const sx = item.w / item.ow, sy = item.h / item.oh;
  const reach = tol + item.width / 2;
  if (!rectHas({ x: item.x - reach, y: item.y - reach, w: item.w + reach * 2, h: item.h + reach * 2 }, p)) return false;
  const pts = item.pts;
  if (pts.length === 2) return Math.hypot(item.x + pts[0] * sx - p.x, item.y + pts[1] * sy - p.y) <= reach;
  for (let i = 2; i < pts.length; i += 2) {
    const a = { x: item.x + pts[i - 2] * sx, y: item.y + pts[i - 1] * sy };
    const b = { x: item.x + pts[i] * sx, y: item.y + pts[i + 1] * sy };
    if (distToSegment(p, a, b) <= reach) return true;
  }
  return false;
}

function frameLabelRect(frame) {
  const size = 13 / view.z;
  measureCtx.font = fontOf(13, true);
  const width = Math.min(measureCtx.measureText(frame.title || ' ').width + 12, frame.w * view.z);
  return { x: frame.x, y: frame.y - size * 1.7, w: Math.max(width, 40) / view.z, h: size * 1.6 };
}

function itemHit(item, p, tol) {
  switch (item.type) {
    case 'line': {
      const pts = linePath(item);
      for (let i = 1; i < pts.length; i++) if (distToSegment(p, pts[i - 1], pts[i]) <= tol + item.width / 2) return true;
      return false;
    }
    case 'pen': return penHit(item, p, tol);
    case 'shape': return pointInShape(item, p);
    case 'frame': {
      if (rectHas(frameLabelRect(item), p)) return true;
      const outer = { x: item.x - tol, y: item.y - tol, w: item.w + tol * 2, h: item.h + tol * 2 };
      const inner = { x: item.x + tol, y: item.y + tol, w: item.w - tol * 2, h: item.h - tol * 2 };
      return rectHas(outer, p) && !rectHas(inner, p);
    }
    default: return rectHas(item, p);
  }
}

function hitTest(p) {
  const tol = 5 / view.z;
  const items = paintOrder();
  for (let i = items.length - 1; i >= 0; i--) if (itemHit(items[i], p, tol)) return items[i];
  return null;
}

// A connector end dropped here attaches to this item: on a specific side when
// close to one of its anchors, otherwise on whichever side faces the far end.
function connectTarget(p, excludeId) {
  const margin = 12 / view.z;
  const items = paintOrder();
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (!CONNECTABLE.has(item.type) || item.id === excludeId) continue;
    const zone = { x: item.x - margin, y: item.y - margin, w: item.w + margin * 2, h: item.h + margin * 2 };
    if (!rectHas(zone, p)) continue;
    for (const side of Object.keys(SIDES)) {
      const a = anchorPoint(item, side);
      if (Math.hypot(a.x - p.x, a.y - p.y) <= 16 / view.z) return { id: item.id, side };
    }
    return { id: item.id, side: 'auto' };
  }
  return null;
}
