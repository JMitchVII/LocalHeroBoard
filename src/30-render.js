// Canvas drawing. drawItem() is shared by the screen and the PNG/print export.

const canvas = $('#board');
const ctx = canvas.getContext('2d', { alpha: false });
const stage = $('#stage');

let needsFrame = false;
function invalidate() {
  if (needsFrame) return;
  needsFrame = true;
  requestAnimationFrame(render);
}

const toScreen = p => ({ x: (p.x - view.x) * view.z, y: (p.y - view.y) * view.z });
const toWorld = p => ({ x: p.x / view.z + view.x, y: p.y / view.z + view.y });
const screenRect = r => ({ ...toScreen(r), w: r.w * view.z, h: r.h * view.z });

function worldViewport() {
  return { x: view.x, y: view.y, w: stage.clientWidth / view.z, h: stage.clientHeight / view.z };
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(stage.clientWidth * dpr);
  canvas.height = Math.round(stage.clientHeight * dpr);
  invalidate();
}

// ---- Images ---------------------------------------------------------------

const imageCache = new Map();
function imageFor(assetId) {
  let img = imageCache.get(assetId);
  if (!img && doc.assets.has(assetId)) {
    img = new Image();
    img.onload = invalidate;
    img.src = doc.assets.get(assetId);
    imageCache.set(assetId, img);
  }
  return img;
}

// ---- Items ----------------------------------------------------------------

function tracePolygon(c, item, poly) {
  poly.forEach(([u, v], i) => {
    const x = item.x + u * item.w, y = item.y + v * item.h;
    if (i) c.lineTo(x, y); else c.moveTo(x, y);
  });
  c.closePath();
}

function traceShape(c, item) {
  c.beginPath();
  const poly = POLYGONS[item.shape];
  if (poly) tracePolygon(c, item, poly);
  else if (item.shape === 'ellipse') c.ellipse(item.x + item.w / 2, item.y + item.h / 2, item.w / 2, item.h / 2, 0, 0, Math.PI * 2);
  else if (item.shape === 'round') c.roundRect(item.x, item.y, item.w, item.h, Math.min(item.w, item.h) * 0.16);
  else c.rect(item.x, item.y, item.w, item.h);
}

function drawLayout(c, item, color, zoom) {
  const L = layoutOf(item);
  if (!L.lines.length || L.size * zoom < 2.2) return;
  c.save();
  if (item.type !== 'text') {
    c.beginPath();
    c.rect(item.x, item.y, item.w, item.h);
    c.clip();
  }
  c.font = fontOf(L.size, item.bold);
  c.fillStyle = color;
  c.textBaseline = 'alphabetic';
  c.textAlign = item.align === 'left' ? 'left' : item.align === 'right' ? 'right' : 'center';
  const x = item.align === 'left' ? L.box.x : item.align === 'right' ? L.box.x + L.box.w : L.box.x + L.box.w / 2;
  const offset = baselineRatio(item.bold) * L.size;
  L.lines.forEach((line, i) => c.fillText(line, x, L.top + i * L.lineH + offset));
  c.restore();
}

function drawSticky(c, item, opts) {
  if (opts.shadows) {
    c.save();
    c.shadowColor = 'rgba(31,41,51,.22)';
    c.shadowBlur = 9 * opts.zoom;
    c.shadowOffsetY = 3 * opts.zoom;
    c.fillStyle = item.color;
    c.fillRect(item.x, item.y, item.w, item.h);
    c.restore();
  } else {
    c.fillStyle = item.color;
    c.fillRect(item.x, item.y, item.w, item.h);
  }
  if (item.color === '#ffffff') {
    c.strokeStyle = 'rgba(31,41,51,.14)';
    c.lineWidth = 1 / opts.zoom;
    c.strokeRect(item.x, item.y, item.w, item.h);
  }
  if (opts.skipTextOf !== item.id) drawLayout(c, item, textOn(item.color), opts.zoom);
}

function drawShape(c, item, opts) {
  traceShape(c, item);
  if (item.fill !== 'transparent') { c.fillStyle = item.fill; c.fill(); }
  if (item.strokeWidth > 0) {
    c.strokeStyle = item.stroke;
    c.lineWidth = item.strokeWidth;
    c.lineJoin = 'round';
    c.setLineDash(item.dash ? [item.strokeWidth * 4, item.strokeWidth * 3] : []);
    c.stroke();
    c.setLineDash([]);
  }
  if (opts.skipTextOf !== item.id) drawLayout(c, item, item.color, opts.zoom);
}

function arrowHead(c, tip, from, size, color) {
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(tip.x, tip.y);
  c.lineTo(tip.x - Math.cos(angle - 0.42) * size, tip.y - Math.sin(angle - 0.42) * size);
  c.lineTo(tip.x - Math.cos(angle + 0.42) * size, tip.y - Math.sin(angle + 0.42) * size);
  c.closePath();
  c.fill();
}

function drawLine(c, item, opts) {
  const pts = linePath(item);
  c.strokeStyle = item.color;
  c.lineWidth = item.width;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.setLineDash(item.dash ? [item.width * 4, item.width * 3] : []);
  c.beginPath();
  c.moveTo(pts[0].x, pts[0].y);
  if (item.kind === 'elbow') {
    for (let i = 1; i < pts.length - 1; i++) c.arcTo(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, 10);
    c.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  } else {
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
  }
  c.stroke();
  c.setLineDash([]);
  const head = 8 + item.width * 2.6;
  const n = pts.length;
  if (item.endCap === 'arrow') arrowHead(c, pts[n - 1], pts[Math.max(0, n - 2)], head, item.color);
  if (item.startCap === 'arrow') arrowHead(c, pts[0], pts[1], head, item.color);
  if (item.text && opts.skipTextOf !== item.id) {
    const mid = pathMidpoint(pts);
    c.font = fontOf(15, false);
    const w = c.measureText(item.text).width + 12;
    c.fillStyle = opts.background;
    c.fillRect(mid.x - w / 2, mid.y - 12, w, 24);
    c.fillStyle = item.color;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(item.text, mid.x, mid.y);
  }
}

function drawPen(c, item) {
  const sx = item.w / item.ow, sy = item.h / item.oh;
  const pts = item.pts;
  c.save();
  c.globalAlpha = item.alpha;
  c.strokeStyle = item.color;
  c.fillStyle = item.color;
  c.lineWidth = item.width;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  const X = i => item.x + pts[i] * sx;
  const Y = i => item.y + pts[i + 1] * sy;
  if (pts.length <= 2) {
    c.beginPath();
    c.arc(X(0), Y(0), item.width / 2, 0, Math.PI * 2);
    c.fill();
  } else {
    c.beginPath();
    c.moveTo(X(0), Y(0));
    for (let i = 2; i < pts.length - 2; i += 2) {
      c.quadraticCurveTo(X(i), Y(i), (X(i) + X(i + 2)) / 2, (Y(i) + Y(i + 2)) / 2);
    }
    c.lineTo(X(pts.length - 2), Y(pts.length - 2));
    c.stroke();
  }
  c.restore();
}

function drawFrame(c, item, opts) {
  if (item.fill !== 'transparent') {
    c.fillStyle = item.fill;
    c.fillRect(item.x, item.y, item.w, item.h);
  }
  c.strokeStyle = 'rgba(31,41,51,.28)';
  c.lineWidth = 1 / opts.zoom;
  c.strokeRect(item.x, item.y, item.w, item.h);
  if (opts.skipTextOf !== item.id && !opts.hideFrameTitles) {
    const size = 13 / opts.zoom;
    c.font = fontOf(size, true);
    c.fillStyle = '#5f6b7a';
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    c.fillText(item.title || 'Frame', item.x + 1 / opts.zoom, item.y - size * 0.55, item.w);
  }
}

function drawImage(c, item) {
  const img = imageFor(item.asset);
  if (img && img.complete && img.naturalWidth) c.drawImage(img, item.x, item.y, item.w, item.h);
  else {
    c.fillStyle = '#e4e0d6';
    c.fillRect(item.x, item.y, item.w, item.h);
  }
}

function drawItem(c, item, opts) {
  switch (item.type) {
    case 'sticky': drawSticky(c, item, opts); break;
    case 'text': if (opts.skipTextOf !== item.id) drawLayout(c, item, item.color, opts.zoom); break;
    case 'shape': drawShape(c, item, opts); break;
    case 'line': drawLine(c, item, opts); break;
    case 'pen': drawPen(c, item); break;
    case 'frame': drawFrame(c, item, opts); break;
    case 'image': drawImage(c, item); break;
  }
}

// ---- Screen ---------------------------------------------------------------

const PAPER = '#f6f4ee';

function drawGrid(c, w, hgt) {
  let step = 24;
  while (step * view.z < 18) step *= 4;
  const gap = step * view.z;
  const ox = -((view.x * view.z) % gap);
  const oy = -((view.y * view.z) % gap);
  c.fillStyle = '#d4cfc2';
  for (let x = ox; x < w; x += gap) for (let y = oy; y < hgt; y += gap) c.fillRect(x, y, 1.5, 1.5);
}

function render() {
  needsFrame = false;
  const dpr = window.devicePixelRatio || 1;
  const w = stage.clientWidth, hgt = stage.clientHeight;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = present.on ? '#14181d' : PAPER;
  ctx.fillRect(0, 0, w, hgt);
  if (!present.on) drawGrid(ctx, w, hgt);

  ctx.setTransform(dpr * view.z, 0, 0, dpr * view.z, -view.x * view.z * dpr, -view.y * view.z * dpr);
  const vp = worldViewport();
  const items = paintOrder();
  const visible = items.filter(item => rectsTouch(padRect(bounds(item), 30), vp));
  const opts = {
    zoom: view.z,
    skipTextOf: editing ? editing.id : null,
    shadows: visible.length < 400 && view.z > 0.15,
    background: PAPER,
    hideFrameTitles: present.on,
  };
  for (const item of visible) drawItem(ctx, item, opts);
  drawLivePreviews();

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (present.on) drawPresentMask(w, hgt);
  else drawOverlay();

  syncZoomLabel();
  positionEditor();
  positionContextBar();
  drawMinimap();
}

const padRect = (r, p) => ({ x: r.x - p, y: r.y - p, w: r.w + p * 2, h: r.h + p * 2 });

function drawLivePreviews() {
  if (mode?.type === 'pen') drawPen(ctx, mode.preview());
  if (tool === 'sticky' && pointer.inside && !mode) {
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = memory.stickyColor;
    ctx.fillRect(pointer.world.x - 100, pointer.world.y - 100, 200, 200);
    ctx.restore();
  }
  if (mode?.type === 'line' || mode?.type === 'quick') drawLine(ctx, mode.preview(), { zoom: view.z, background: PAPER });
}

function drawPresentMask(w, hgt) {
  const frame = framesInOrder()[present.index];
  if (!frame) return;
  const r = screenRect(frame);
  ctx.fillStyle = '#14181d';
  ctx.fillRect(0, 0, w, r.y);
  ctx.fillRect(0, r.y + r.h, w, hgt - r.y - r.h);
  ctx.fillRect(0, r.y, r.x, r.h);
  ctx.fillRect(r.x + r.w, r.y, w - r.x - r.w, r.h);
}

function outlineItem(item) {
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 1.5;
  if (item.type === 'line') {
    const pts = linePath(item).map(toScreen);
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
    return;
  }
  const r = screenRect(bounds(item));
  ctx.strokeRect(r.x, r.y, r.w, r.h);
}

function drawHandle(p, shape = 'square') {
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (shape === 'square') ctx.roundRect(p.x - 5, p.y - 5, 10, 10, 2);
  else ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawAnchors(item, active) {
  for (const side of Object.keys(SIDES)) {
    const p = toScreen(anchorPoint(item, side));
    ctx.beginPath();
    ctx.arc(p.x, p.y, side === active ? 7 : 4.5, 0, Math.PI * 2);
    ctx.fillStyle = side === active ? ACCENT : '#fff';
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
  }
}

function drawOverlay() {
  const moving = mode?.type === 'move' && mode.started;

  if (hover && !sel.has(hover.id) && !mode && doc.items.has(hover.id)) {
    ctx.globalAlpha = 0.55;
    outlineItem(doc.items.get(hover.id));
    ctx.globalAlpha = 1;
  }

  const items = selectedItems();
  if (items.length > 1) items.forEach(outlineItem);
  if (items.length && !editing) {
    if (items.length === 1) outlineItem(items[0]);
    else {
      const r = screenRect(unionBounds(items));
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.setLineDash([]);
    }
    if (items.some(i => i.locked) && !moving) {
      const r = screenRect(unionBounds(items));
      ctx.font = fontOf(12, true);
      ctx.fillStyle = ACCENT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('Locked', r.x, r.y - 6);
    }
    if (!moving) {
      for (const hd of selectionHandles()) drawHandle(hd, hd.end ? 'round' : 'square');
      for (const dot of quickDots()) drawQuickDot(dot);
    }
  }

  if (connectHint) {
    const item = doc.items.get(connectHint.id);
    if (item) drawAnchors(item, connectHint.side);
  }

  if (mode?.type === 'marquee' && mode.rect) {
    const r = screenRect(mode.rect);
    ctx.fillStyle = 'rgba(14,124,102,.10)';
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
  }

  if (mode?.type === 'draw' && mode.rect) {
    const r = screenRect(mode.rect);
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.setLineDash([]);
  }

  if (mode?.guides) {
    ctx.strokeStyle = '#d6336c';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const g of mode.guides) {
      const a = toScreen(g.a), b = toScreen(g.b);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  }

  if (find.matches.length) {
    ctx.lineWidth = 2;
    find.matches.forEach((id, i) => {
      const item = doc.items.get(id);
      if (!item) return;
      const r = screenRect(padRect(bounds(item), 4 / view.z));
      ctx.strokeStyle = i === find.index ? '#d6336c' : 'rgba(214,51,108,.4)';
      ctx.strokeRect(r.x, r.y, r.w, r.h);
    });
  }
}

function drawQuickDot(dot) {
  ctx.beginPath();
  ctx.arc(dot.x, dot.y, 8, 0, Math.PI * 2);
  ctx.fillStyle = ACCENT;
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(dot.x - 3.5, dot.y);
  ctx.lineTo(dot.x + 3.5, dot.y);
  ctx.moveTo(dot.x, dot.y - 3.5);
  ctx.lineTo(dot.x, dot.y + 3.5);
  ctx.stroke();
}

// ---- Minimap --------------------------------------------------------------

const minimap = $('#minimap');
const miniCtx = minimap.getContext('2d');

function minimapFrame() {
  const items = [...doc.items.values()];
  const vp = worldViewport();
  const all = items.length ? padRect(unionBounds(items), 200) : vp;
  const l = Math.min(all.x, vp.x), t = Math.min(all.y, vp.y);
  const r = Math.max(all.x + all.w, vp.x + vp.w), b = Math.max(all.y + all.h, vp.y + vp.h);
  const scale = Math.min(minimap.width / (r - l), minimap.height / (b - t));
  const ox = (minimap.width - (r - l) * scale) / 2 - l * scale;
  const oy = (minimap.height - (b - t) * scale) / 2 - t * scale;
  return { scale, ox, oy, vp };
}

function drawMinimap() {
  if (minimap.hidden) return;
  const m = miniCtx;
  const { scale, ox, oy, vp } = minimapFrame();
  m.fillStyle = '#fff';
  m.fillRect(0, 0, minimap.width, minimap.height);
  for (const item of paintOrder()) {
    const b = bounds(item);
    m.fillStyle = item.type === 'sticky' ? item.color : item.type === 'frame' ? '#efece3' : item.type === 'shape' && item.fill !== 'transparent' ? item.fill : '#aeb4bd';
    m.fillRect(b.x * scale + ox, b.y * scale + oy, Math.max(b.w * scale, 1.5), Math.max(b.h * scale, 1.5));
  }
  m.strokeStyle = ACCENT;
  m.lineWidth = 1.5;
  m.strokeRect(vp.x * scale + ox, vp.y * scale + oy, vp.w * scale, vp.h * scale);
}
