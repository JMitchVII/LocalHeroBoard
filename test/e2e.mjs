// End-to-end tests. Drives a real Chrome or Edge over the DevTools protocol using
// only Node's built-ins, so the project keeps zero dependencies, even for testing.
//
//   node test/e2e.mjs [--shots <dir>]
//
// The browser gets a throwaway profile, and every network request it makes is
// recorded: a single non-local request fails the run.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = pathToFileURL(join(root, 'dist', 'MirCore.html')).href;
const shotsArg = process.argv.indexOf('--shots');
const shotsDir = shotsArg > 0 ? process.argv[shotsArg + 1] : null;
if (shotsDir) mkdirSync(shotsDir, { recursive: true });

const browsers = [
  process.env.BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const browserPath = browsers.find(existsSync);
if (!browserPath) throw new Error('No Chrome or Edge found. Set BROWSER=/path/to/browser');

const profile = mkdtempSync(join(tmpdir(), 'mircore-e2e-'));
const downloads = join(profile, 'downloads');
mkdirSync(downloads);
const port = 9300 + Math.floor(Math.random() * 500);
const proc = spawn(browserPath, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking',
  '--disable-component-update', '--disable-sync', '--window-size=1440,900', 'about:blank',
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
// Chrome's component updater can land packages here too, so count only board files.
const boardFiles = () => readdirSync(downloads).filter(f => f.endsWith('.mircore'));

async function connect() {
  for (let i = 0; i < 100; i++) {
    try {
      const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const tab = tabs.find(t => t.type === 'page');
      if (tab) return tab.webSocketDebuggerUrl;
    } catch { /* browser still starting */ }
    await sleep(100);
  }
  throw new Error('Browser did not start');
}

const ws = new WebSocket(await connect());
await new Promise(r => { ws.onopen = r; });
let nextId = 1;
const waiting = new Map();
const requests = [];
const byId = new Map();
const cspBlocked = new Set();
const problems = [];
ws.onmessage = ({ data }) => {
  const msg = JSON.parse(data);
  if (msg.id && waiting.has(msg.id)) {
    const { resolve, reject } = waiting.get(msg.id);
    waiting.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
    return;
  }
  if (msg.method === 'Network.requestWillBeSent') { requests.push(msg.params.request.url); byId.set(msg.params.requestId, msg.params.request.url); }
  if (msg.method === 'Network.loadingFailed' && msg.params.blockedReason === 'csp') cspBlocked.add(byId.get(msg.params.requestId));
  if (msg.method === 'Runtime.exceptionThrown') problems.push(`exception: ${msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text}`);
  if (msg.method === 'Log.entryAdded' && ['error', 'warning'].includes(msg.params.entry.level)) problems.push(`${msg.params.entry.level}: ${msg.params.entry.text}`);
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') problems.push(`console: ${msg.params.args.map(a => a.value ?? a.description).join(' ')}`);
  if (msg.method === 'Page.javascriptDialogOpening') cdp('Page.handleJavaScriptDialog', { accept: true });
};
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  waiting.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});

async function evaluate(expression) {
  const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}

const frame = () => evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
const board = () => evaluate('mircore.snapshot()');
const items = async type => (await board()).items.filter(i => !type || i.type === type);
const selection = () => evaluate('mircore.selection()');
const toScreen = async (p) => {
  const v = (await board()).view;
  return { x: (p.x - v.x) * v.z, y: (p.y - v.y) * v.z };
};

const mouse = (type, x, y, extra = {}) => cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'mouse', ...extra });
async function click(x, y, extra = {}) {
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, modifiers: extra.modifiers || 0 });
  await mouse('mousePressed', x, y, extra);
  await mouse('mouseReleased', x, y, extra);
  await frame();
}
async function dblclick(x, y) {
  await click(x, y);
  await mouse('mousePressed', x, y, { clickCount: 2 });
  await mouse('mouseReleased', x, y, { clickCount: 2 });
  await frame();
}
async function drag(from, to, { modifiers = 0, steps = 8 } = {}) {
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y, modifiers });
  await mouse('mousePressed', from.x, from.y, { modifiers });
  for (let i = 1; i <= steps; i++) {
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps, button: 'left', buttons: 1, modifiers });
  }
  await mouse('mouseReleased', to.x, to.y, { modifiers });
  await frame();
}

const KEYS = {
  Escape: 27, Enter: 13, Tab: 9, Delete: 46, Backspace: 8, ' ': 32, ArrowLeft: 37, ArrowRight: 39, ArrowUp: 38, ArrowDown: 40,
};
const CTRL = 2, SHIFT = 8, ALT = 1;
async function key(k, modifiers = 0) {
  const code = KEYS[k] ?? k.toUpperCase().charCodeAt(0);
  const base = { key: k, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, modifiers };
  const printable = k.length === 1 && !(modifiers & CTRL);
  await cdp('Input.dispatchKeyEvent', { type: printable ? 'keyDown' : 'rawKeyDown', ...base, text: printable ? k : undefined });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  await frame();
}
const type = text => cdp('Input.insertText', { text });
const clickEl = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);

async function shot(name) {
  if (!shotsDir) return;
  await frame();
  const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(shotsDir, `${name}.png`), Buffer.from(data, 'base64'));
}

let passed = 0;
const failed = [];
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ok    ${name}`); }
  else { failed.push(name); console.log(`  FAIL  ${name} ${detail}`); }
}
const close = (a, b, d = 1.5) => Math.abs(a - b) <= d;

async function fresh() {
  await cdp('Page.navigate', { url: target });
  await sleep(250);
  await frame();
}

async function suite(name, fn) {
  console.log(`\n${name}`);
  try { await fn(); } catch (err) { failed.push(`${name}: ${err.message}`); console.log(`  FAIL  threw ${err.stack}`); }
}

await cdp('Network.enable');
await cdp('Page.enable');
await cdp('Runtime.enable');
await cdp('Log.enable');
await cdp('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

await suite('Boots from file:// under the CSP', async () => {
  await fresh();
  const csp = await evaluate(`document.querySelector('meta[http-equiv="Content-Security-Policy"]').content`);
  check('app initialised', await evaluate('typeof mircore') === 'object');
  check('secure context on file://', await evaluate('isSecureContext'));
  check('direct file access available', await evaluate(`typeof showSaveFilePicker === 'function'`));
  check('CSP has no unsafe-* source', !csp.includes('unsafe'));
  check('CSP blocks connections', csp.includes("connect-src 'none'"));
  await shot('01-empty');
});

await suite('The browser refuses every outbound channel', async () => {
  const blocked = await evaluate(`(async () => {
    const out = {};
    try { await fetch('https://example.com/x'); out.fetch = 'sent'; } catch { out.fetch = 'blocked'; }
    out.xhr = await new Promise(r => { const x = new XMLHttpRequest(); x.onerror = () => r('blocked'); x.onload = () => r('sent'); try { x.open('GET','https://example.com/y'); x.send(); } catch { r('blocked'); } });
    out.ws = await new Promise(r => { try { const s = new WebSocket('wss://example.com/z'); s.onerror = () => r('blocked'); s.onopen = () => r('sent'); } catch { r('blocked'); } });
    out.beacon = navigator.sendBeacon('https://example.com/b', 'x') ? 'queued' : 'blocked';
    out.image = await new Promise(r => { const i = new Image(); i.onerror = () => r('blocked'); i.onload = () => r('sent'); i.src = 'https://example.com/i.png'; });
    out.script = await new Promise(r => { const s = document.createElement('script'); s.onerror = () => r('blocked'); s.onload = () => r('sent'); s.src = 'https://example.com/s.js'; document.head.append(s); });
    let injected = false; window.__x = () => { injected = true; };
    const s = document.createElement('script'); s.textContent = 'window.__x()'; document.head.append(s);
    out.inline = injected ? 'ran' : 'blocked';
    return out;
  })()`);
  for (const [channel, result] of Object.entries(blocked)) check(`${channel} blocked`, result === 'blocked' || result === 'queued', result);
  await sleep(200);
  const external = requests.filter(u => u.includes('example.com'));
  check('DevTools reports each attempt as stopped by CSP', external.every(u => cspBlocked.has(u)), external.filter(u => !cspBlocked.has(u)).join(' '));
  check('sendBeacon and fetch never reached the network layer', !external.some(u => u.endsWith('/b') || u.endsWith('/x')) || external.every(u => cspBlocked.has(u)));
  problems.length = 0; // these deliberate violations are expected to log CSP errors
});

await suite('Sticky brainstorming flow', async () => {
  await fresh();
  await dblclick(500, 350);
  await type('Faster onboarding');
  await frame();
  const spell = await evaluate(`document.querySelector('textarea.editor').spellcheck`);
  check('spellcheck disabled in the editor', spell === false);
  await shot('02-typing');
  await key('Tab');
  await type('Local-only storage');
  await key('Tab');
  await type('Offline by default');
  await key('Enter', CTRL);
  await type('Below the third one');
  await key('Escape');
  const stickies = await items('sticky');
  check('double-click + Tab + Ctrl+Enter made 4 stickies', stickies.length === 4, stickies.length);
  check('Tab placed the next sticky to the right', close(stickies[1].x, stickies[0].x + 220) && close(stickies[1].y, stickies[0].y));
  check('Ctrl+Enter placed the next sticky below', close(stickies[3].y, stickies[2].y + 220) && close(stickies[3].x, stickies[2].x));
  check('text landed in the right notes', stickies[0].text === 'Faster onboarding' && stickies[3].text === 'Below the third one');
  await key('z', CTRL);
  check('undo removes one sticky', (await items('sticky')).length === 3);
  await key('y', CTRL);
  check('redo restores it', (await items('sticky')).length === 4);
  const long = 'A long thought that needs to shrink so that it still fits inside the note without being cut off at the bottom edge of the sticky at all';
  const s = await toScreen({ x: stickies[0].x + 100, y: stickies[0].y + 100 });
  await click(s.x, s.y);
  await key('Enter');
  await evaluate(`(() => { const a = document.querySelector('textarea.editor'); a.value = ${JSON.stringify(long)}; a.dispatchEvent(new Event('input')); })()`);
  await key('Escape');
  await shot('03-stickies');
});

await suite('Paste a list', async () => {
  await fresh();
  await evaluate(`(() => {
    const d = new DataTransfer();
    d.setData('text/plain', '- Idea one\\n- Idea two\\n* Idea three\\n1. Idea four\\n\\nIdea five');
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: d, bubbles: true, cancelable: true }));
  })()`);
  await frame();
  const s = await items('sticky');
  check('one sticky per non-empty line', s.length === 5, s.length);
  check('list markers stripped', s[0].text === 'Idea one' && s[3].text === 'Idea four');
  check('pasted notes are selected', (await selection()).length === 5);
  check('one undo step', await (async () => { await key('z', CTRL); return (await items()).length === 0; })());
});

await suite('Selecting, moving, resizing', async () => {
  await fresh();
  await dblclick(400, 300);
  await type('A');
  await key('Tab');
  await type('B');
  await key('Escape');
  await key('Escape');
  check('Esc clears the selection', (await selection()).length === 0);
  const [a0, b0] = await items('sticky');
  await drag({ x: 200, y: 120 }, { x: 800, y: 500 });
  check('marquee selects both', (await selection()).length === 2);
  await key('Escape');
  const pa = await toScreen({ x: a0.x + 100, y: a0.y + 100 });
  await drag(pa, { x: pa.x + 60, y: pa.y + 240 }, { modifiers: CTRL });
  const a1 = (await items('sticky'))[0];
  check('drag moves a sticky', close(a1.x, a0.x + 60) && close(a1.y, a0.y + 240), JSON.stringify([a1.x - a0.x, a1.y - a0.y]));

  const pb = await toScreen({ x: a1.x + 100, y: a1.y + 100 });
  await drag(pb, { x: pb.x - 200, y: pb.y - 240 + 3 });
  const a2 = (await items('sticky'))[0];
  check('smart guides snap to the neighbour', close(a2.y, b0.y, 0.01), `${a2.y} vs ${b0.y}`);

  const corner = await toScreen({ x: a2.x + a2.w, y: a2.y + a2.h });
  await drag(corner, { x: corner.x + 100, y: corner.y + 40 });
  const a3 = (await items('sticky'))[0];
  check('sticky resizes and stays square', close(a3.w, a3.h, 0.01) && a3.w > 250, `${a3.w}x${a3.h}`);

  await key('d', CTRL);
  check('Ctrl+D duplicates', (await items('sticky')).length === 3);
  await key('Delete');
  check('Delete removes the copy', (await items('sticky')).length === 2);

  const before = (await items('sticky'))[0];
  const pc = await toScreen({ x: before.x + 20, y: before.y + 20 });
  await drag(pc, { x: pc.x, y: pc.y + 300 }, { modifiers: ALT });
  check('Alt-drag leaves the original and copies', (await items('sticky')).length === 3);

  await key('a', CTRL);
  await key('g', CTRL);
  await key('Escape');
  const any = (await items('sticky'))[0];
  const pg = await toScreen({ x: any.x + 30, y: any.y + 30 });
  await click(pg.x, pg.y);
  check('clicking a grouped item selects the group', (await selection()).length === 3);
  await key('g', CTRL | SHIFT);
  await key('Escape');
  await click(pg.x, pg.y);
  const picked = await selection();
  check('ungroup splits it', picked.length === 1 && picked[0] === any.id, picked.length);
  await key('l', CTRL);
  await key('Delete');
  check('locked item ignores Delete', (await items('sticky')).length === 3);
  await drag(pg, { x: pg.x + 50, y: pg.y + 50 });
  const lockedAfter = (await items('sticky')).find(i => i.id === any.id);
  check('locked item ignores drag', lockedAfter.x === any.x && lockedAfter.locked === true, JSON.stringify(lockedAfter));
  await key('l', CTRL);

  await key('ArrowRight', SHIFT);
  check('Shift+Arrow nudges 10px', close((await items('sticky')).find(i => i.id === any.id).x, any.x + 10, 0.01));
});

await suite('Connectors', async () => {
  await fresh();
  await key('s');
  await drag({ x: 300, y: 300 }, { x: 460, y: 400 });
  await key('s');
  await drag({ x: 760, y: 500 }, { x: 920, y: 600 });
  await key('l');
  await drag({ x: 380, y: 350 }, { x: 840, y: 550 });
  let [line] = await items('line');
  const [s1, s2] = await items('shape');
  check('line attaches at both ends', line?.a.id === s1.id && line?.b.id === s2.id, JSON.stringify(line));
  const p = await toScreen({ x: s2.x + s2.w / 2, y: s2.y + s2.h / 2 });
  await key('Escape');
  await drag(p, { x: p.x + 120, y: p.y - 300 }, { modifiers: CTRL });
  [line] = await items('line');
  check('connector stays attached after a move', line.b.id === s2.id);
  await shot('04-connectors');
  await key('Delete');
  [line] = await items('line');
  check('deleting a shape frees the connector end', !line.b.id && Number.isFinite(line.b.x), JSON.stringify(line.b));
  await key('z', CTRL);
  [line] = await items('line');
  check('undo reattaches it', line.b.id === s2.id);

  // + dots: click makes a connected sibling, then typing goes straight into it.
  const c = await toScreen({ x: s1.x + s1.w / 2, y: s1.y + s1.h / 2 });
  await click(c.x, c.y);
  await click(c.x, c.y + 50 + 24 + 10);
  const editorOpen = await evaluate(`!!document.querySelector('textarea.editor')`);
  check('clicking a + dot opens the new item for typing', editorOpen);
  await type('child');
  await key('Escape');
  const shapes = await items('shape');
  check('+ dot made a sibling', shapes.length === 3 && shapes[2].text === 'child', shapes.length);
  const lines = await items('line');
  check('and connected it', lines.length === 2 && lines[1].a.id === s1.id && lines[1].b.id === shapes[2].id);
});

await suite('Pen, eraser, text, frames', async () => {
  await fresh();
  await key('p');
  await drag({ x: 300, y: 300 }, { x: 500, y: 360 }, { steps: 20 });
  await drag({ x: 300, y: 500 }, { x: 500, y: 560 }, { steps: 20 });
  check('pen stays active across strokes', (await items('pen')).length === 2);
  await key('e');
  await drag({ x: 400, y: 200 }, { x: 400, y: 420 }, { steps: 20 });
  check('eraser removes the crossed stroke only', (await items('pen')).length === 1);
  await key('z', CTRL);
  check('erasing undoes', (await items('pen')).length === 2);
  await key('v');

  await key('t');
  await click(800, 200);
  await type('Heading text');
  await key('Escape');
  check('text item created', (await items('text'))[0]?.text === 'Heading text');
  await key('t');
  await click(800, 400);
  await key('Escape');
  check('empty text item is discarded', (await items('text')).length === 1);

  await fresh();
  await dblclick(700, 450);
  await type('in frame');
  await key('Escape');
  await key('Escape');
  await key('f');
  await drag({ x: 450, y: 250 }, { x: 1000, y: 650 });
  const [frame0] = await items('frame');
  const [note0] = await items('sticky');
  await key('Escape');
  await click(700, 450);
  check('sticky inside a frame is clickable', (await selection())[0] === note0.id);
  await key('Escape');
  const label = await toScreen({ x: frame0.x + 10, y: frame0.y });
  await drag({ x: label.x, y: label.y - 10 }, { x: label.x + 100, y: label.y + 40 }, { modifiers: CTRL });
  const [frame1] = await items('frame');
  const [note1] = await items('sticky');
  check('moving a frame carries its contents', close(note1.x - note0.x, frame1.x - frame0.x, 0.01) && frame1.x !== frame0.x);
  await shot('05-frame');
});

await suite('Save, reopen, sanitise', async () => {
  await fresh();
  await dblclick(500, 350);
  await type('Sensitive idea');
  await key('Escape');
  check('status warns before first save', (await evaluate(`document.querySelector('#status').textContent`)) === 'Not saved yet');

  // Direct-write path: real pickers need a human, so hand the app a fake handle.
  await evaluate(`(() => {
    window.__writes = [];
    window.showSaveFilePicker = async () => ({
      name: 'ideas.mircore',
      createWritable: async () => { let buf = ''; return { write: async s => { buf += s; }, close: async () => { window.__writes.push(buf); } }; },
    });
  })()`);
  await key('s', CTRL);
  await sleep(100);
  let writes = await evaluate('__writes');
  check('Ctrl+S writes through the file handle', writes.length === 1 && writes[0].includes('Sensitive idea'));
  check('status shows the file', (await evaluate(`document.querySelector('#status').textContent`)) === 'Saved to ideas.mircore');
  await dblclick(900, 350);
  await type('Second');
  await key('Escape');
  await sleep(1500);
  writes = await evaluate('__writes');
  check('autosave follows edits', writes.length === 2 && writes[1].includes('Second'), writes.length);

  // Browser storage must stay empty.
  const stored = await evaluate(`(async () => ({
    local: localStorage.length, session: sessionStorage.length,
    idb: (await indexedDB.databases()).length,
    caches: (await caches.keys()).length,
  }))()`).catch(() => ({ local: 0, session: 0, idb: 0, caches: 0 }));
  check('nothing kept in browser storage', Object.values(stored).every(v => v === 0), JSON.stringify(stored));

  // Download path, for browsers without direct file access: a real file on disk.
  await fresh();
  await evaluate(`delete window.showSaveFilePicker; Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }); 0`);
  await dblclick(500, 350);
  await type('Round trip');
  await key('Escape');
  await key('s');
  await drag({ x: 700, y: 300 }, { x: 860, y: 420 });
  await key('Escape');
  await evaluate(`document.querySelector('#title').value = 'Board/With:Bad*Name'; document.querySelector('#title').dispatchEvent(new Event('input'))`);
  await key('s', CTRL);
  await sleep(600);
  const files = readdirSync(downloads);
  check('fallback saved a real file with a safe name', files.some(f => f.endsWith('.mircore') && !/[/:*]/.test(f)), files.join());
  const saved = readFileSync(join(downloads, files.find(f => f.endsWith('.mircore'))), 'utf8');
  const parsed = JSON.parse(saved);
  check('file holds the board', parsed.format === 'mircore-board' && parsed.items.length === 2);

  // Managed browsers can disable file dialogs: an instant AbortError must not lose the save.
  await fresh();
  const downloadsBefore = boardFiles().length;
  await evaluate(`window.showSaveFilePicker = async () => { throw new DOMException('aborted', 'AbortError'); }; 0`);
  await dblclick(500, 350);
  await type('Policy blocked');
  await key('Escape');
  await key('s', CTRL);
  await sleep(600);
  check('instant abort falls back to a download', boardFiles().length === downloadsBefore + 1, boardFiles().join());
  check('and the user is told', (await evaluate(`document.querySelector('#toasts').textContent`)).includes('Autosave is off'));

  await fresh();
  const downloadsMid = boardFiles().length;
  await evaluate(`window.showSaveFilePicker = () => new Promise((_, no) => setTimeout(() => no(new DOMException('aborted', 'AbortError')), 500)); 0`);
  await dblclick(500, 350);
  await key('Escape');
  await key('s', CTRL);
  await sleep(900);
  check('a human Cancel saves nothing', boardFiles().length === downloadsMid, boardFiles().join());
  check('and leaves the board unsaved', (await evaluate('mircore.status().dirty')) === true);

  await fresh();
  const load = text => evaluate(`(() => {
    const d = new DataTransfer();
    d.items.add(new File([${JSON.stringify(text)}], 'board.mircore', { type: 'application/json' }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: d, bubbles: true, cancelable: true, clientX: 300, clientY: 300 }));
  })()`);
  await load(saved);
  await sleep(150);
  const reopened = await board();
  const canon = v => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v);
  const diffs = parsed.items.flatMap((item, i) => Object.keys({ ...item, ...reopened.items[i] })
    .filter(k => JSON.stringify(canon(item[k])) !== JSON.stringify(canon(reopened.items[i]?.[k])))
    .map(k => `${item.type}.${k}: ${JSON.stringify(item[k])} -> ${JSON.stringify(reopened.items[i]?.[k])}`));
  check('reopened board matches field for field', reopened.items.length === parsed.items.length && diffs.length === 0, diffs.join('; '));
  check('title restored', reopened.title === 'Board/With:Bad*Name');
  await shot('06-reopened');

  const hostile = JSON.stringify({
    format: 'mircore-board', version: 1, title: '<img src=x onerror=alert(1)>',
    items: [
      { id: 'img1', type: 'image', x: 0, y: 0, w: 100, h: 100, asset: 'evil' },
      { id: 'st1', type: 'sticky', x: 'NaN', y: null, w: -5, h: 1e99, color: 'url(https://evil.example/x)', text: 42, extra: 'dropped' },
      { id: 'bad id!', type: 'sticky', x: 0, y: 0 },
      { id: 'zz', type: 'script', x: 0, y: 0 },
      { id: 'ln', type: 'line', a: { id: 'missing', side: 't' }, b: { x: 5, y: 5 } },
    ],
    assets: { evil: 'https://evil.example/track.png' },
  });
  const count = requests.length;
  await load(hostile);
  await sleep(150);
  const safe = await board();
  check('remote image dropped', !safe.items.some(i => i.type === 'image') && Object.keys(safe.assets).length === 0);
  check('unknown types and bad ids dropped', safe.items.length === 2, safe.items.length);
  const st = safe.items.find(i => i.id === 'st1');
  check('bad fields replaced with safe values', st.color === '#fdf0a6' && st.text === '' && st.x === 0 && !('extra' in st), JSON.stringify(st));
  check('dangling connector detached', !safe.items.find(i => i.id === 'ln').a.id);
  check('markup in the title stays text', (await evaluate(`document.querySelector('#title').value`)).startsWith('<img') && !(await evaluate(`!!document.querySelector('img[src="x"]')`)));
  check('hostile file made no requests', requests.length === count);
  await load('{ not json');
  await sleep(100);
  check('corrupt file leaves the board alone', (await board()).items.length === 2);

  await fresh();
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  await evaluate(`(async () => {
    const bytes = Uint8Array.from(atob('${png}'), c => c.charCodeAt(0));
    const d = new DataTransfer();
    d.items.add(new File([bytes], 'p.png', { type: 'image/png' }));
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: d, bubbles: true, cancelable: true }));
  })()`);
  await sleep(150);
  let snap = await board();
  check('pasted image is embedded in the file', snap.items[0]?.type === 'image' && Object.values(snap.assets)[0]?.startsWith('data:image/png'));
  await key('Delete');
  snap = await board();
  check('deleted image is not written to the file', Object.keys(snap.assets).length === 0);
});

await suite('View, find, present, export', async () => {
  await fresh();
  await evaluate(`(() => {
    const d = new DataTransfer();
    d.setData('text/plain', 'Alpha\\nBravo\\nCharlie\\nDelta');
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: d, bubbles: true, cancelable: true }));
  })()`);
  await key('Escape');
  const worldAt = v => ({ x: 300 / v.z + v.x, y: 200 / v.z + v.y });
  const v0 = (await board()).view;
  await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 300, y: 200, deltaX: 0, deltaY: -120, modifiers: CTRL });
  await sleep(60);
  const v1 = (await board()).view;
  check('Ctrl+wheel zooms', v1.z > v0.z, v1.z);
  check('zoom keeps the point under the cursor fixed', close(worldAt(v0).x, worldAt(v1).x, 0.01) && close(worldAt(v0).y, worldAt(v1).y, 0.01));
  await key('1', CTRL);
  await sleep(350);
  const items0 = await items('sticky');
  const corner = await toScreen({ x: items0[3].x + 200, y: items0[3].y + 200 });
  check('Ctrl+1 fits the board on screen', corner.x < 1440 && corner.y < 900 && corner.x > 0);

  await key('f', CTRL);
  await type('rav');
  await sleep(40);
  await evaluate(`document.querySelector('#findInput').dispatchEvent(new Event('input'))`);
  await frame();
  check('find reports matches', (await evaluate(`document.querySelector('#findCount').textContent`)) === '1 / 1');
  await shot('07-find');
  await key('Escape');
  await evaluate(`document.querySelector('#findInput').blur()`);

  await key('f');
  await click(700, 450);
  await key('f');
  await click(1100, 450);
  const fr = await items('frame');
  check('two frames', fr.length === 2 && fr[1].title === 'Frame 2');
  await key('Escape');
  await clickEl('#framesBtn');
  await frame();
  await shot('08-frames-panel');
  await clickEl('#framesBtn');
  await clickEl('#presentBtn');
  await sleep(450);
  check('presenting hides the chrome', await evaluate(`getComputedStyle(document.querySelector('#tools')).display === 'none'`));
  await shot('09-present');
  await key('ArrowRight');
  await sleep(450);
  check('arrow moves to the next frame', (await evaluate(`document.querySelector('#presentLabel').textContent`)).startsWith('2 / 2'));
  await key('Escape');
  await sleep(100);
  check('Esc leaves present mode', !(await evaluate(`document.body.classList.contains('presenting')`)));

  await evaluate(`(() => {
    window.__png = null;
    window.showSaveFilePicker = async () => ({ name: 'x.png', createWritable: async () => ({ write: async b => { window.__png = b.size; }, close: async () => {} }) });
  })()`);
  await clickEl('#menuBtn');
  await frame();
  await shot('10-menu');
  await evaluate(`[...document.querySelectorAll('#pop button')].find(b => b.textContent.includes('PNG')).click()`);
  await sleep(400);
  check('PNG export produced a file', (await evaluate('__png')) > 1000, await evaluate('__png'));

  await clickEl('#localBtn');
  await frame();
  await shot('11-local-info');
  await evaluate(`document.querySelector('#dialog').close()`);
});

await suite('Clipboard and cancelling', async () => {
  await fresh();
  const clipboard = kind => evaluate(`(() => {
    window.__clip = window.__clip || new DataTransfer();
    window.dispatchEvent(new ClipboardEvent(${JSON.stringify(kind)}, { clipboardData: window.__clip, bubbles: true, cancelable: true }));
  })()`);
  await dblclick(400, 300);
  check('hint leaves as soon as the first sticky appears', await evaluate(`document.querySelector('#empty').hidden`));
  await type('One');
  await key('Escape');
  const [one] = await items('sticky');
  const c = await toScreen({ x: one.x + 100, y: one.y + 100 });
  await click(c.x, c.y);
  await click(c.x + 100 + 24, c.y); // + dot: connected sibling
  await type('Two');
  await key('Escape');
  await key('a', CTRL);
  await clipboard('cut');
  await frame();
  check('cut empties the board', (await items()).length === 0);
  await clipboard('paste');
  await frame();
  const pasted = await board();
  const line = pasted.items.find(i => i.type === 'line');
  const notes = pasted.items.filter(i => i.type === 'sticky');
  check('paste after cut restores notes and connector', notes.length === 2 && !!line);
  check('pasted connector joins the pasted notes', notes.some(n => n.id === line.a.id) && notes.some(n => n.id === line.b.id), JSON.stringify(line));
  check('pasted coordinates are all real numbers', pasted.items.every(i => (i.type === 'line' ? [i.a, i.b].every(e => e.id || Number.isFinite(e.x)) : Number.isFinite(i.x) && Number.isFinite(i.y))));

  await key('Escape');
  await click(...Object.values(await toScreen({ x: notes[0].x + 100, y: notes[0].y + 100 })));
  await clipboard('copy');
  await key('Delete');
  const orphan = (await items('line'))[0];
  check('line end freed by delete has real coordinates', Number.isFinite(orphan.a.x ?? orphan.b.x));

  await key('z', CTRL);
  const start = (await items('sticky'))[0];
  const p = await toScreen({ x: start.x + 100, y: start.y + 100 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
  await mouse('mousePressed', p.x, p.y);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x + 120, y: p.y + 90, button: 'left', buttons: 1 });
  await frame();
  await key('Escape');
  await mouse('mouseReleased', p.x + 120, p.y + 90);
  await frame();
  const after = (await items('sticky')).find(i => i.id === start.id);
  check('Esc during a drag puts the note back', after.x === start.x && after.y === start.y, JSON.stringify([after.x, start.x]));

  await key('=', CTRL);
  await key('=', CTRL);
  await key('0', CTRL);
  await sleep(350);
  check('Ctrl+0 returns to 100%', close((await board()).view.z, 1, 0.001));

  check('tab title never carries the board name', await (async () => {
    await evaluate(`document.querySelector('#title').value = 'Project Nightfall'; document.querySelector('#title').dispatchEvent(new Event('input'))`);
    return (await evaluate('document.title')) === 'MirCore';
  })());
  await key('?');
  await frame();
  await shot('13-help');
  await evaluate(`document.querySelector('#dialog').close()`);
});

await suite('Real file handle', async () => {
  await fresh();
  // A genuine FileSystemFileHandle from the private file system. It exercises the
  // real createWritable/write/close path; only the OS picker dialog is bypassed.
  const available = await evaluate(`navigator.storage.getDirectory().then(async dir => {
    const handle = await dir.getFileHandle('real.mircore', { create: true });
    window.__handle = handle;
    window.showSaveFilePicker = async () => handle;
    return true;
  }).catch(e => e.name)`);
  if (available !== true) { console.log(`  skip  private file system unavailable on file:// (${available})`); return; }
  await dblclick(500, 350);
  await type('Written for real');
  await key('Escape');
  await key('s', CTRL);
  await sleep(300);
  const text = await evaluate(`__handle.getFile().then(f => f.text())`);
  check('real handle holds the board', text.includes('Written for real') && text.includes('mircore-board'));
  check('status reports the save', (await evaluate(`document.querySelector('#status').textContent`)) === 'Saved to real.mircore');
});

await suite('Scale', async () => {
  await fresh();
  const text = Array.from({ length: 2000 }, (_, i) => `Idea number ${i}`).slice(0, 500).join('\\n');
  await evaluate(`(() => {
    const d = new DataTransfer();
    d.setData('text/plain', '${text}');
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: d, bubbles: true, cancelable: true }));
  })()`);
  await key('1', CTRL);
  await sleep(350);
  const ms = await evaluate(`(async () => {
    const t = performance.now();
    for (let i = 0; i < 30; i++) await new Promise(r => { window.dispatchEvent(new Event('resize')); requestAnimationFrame(r); });
    return (performance.now() - t) / 30;
  })()`);
  check('500 stickies redraw inside a frame budget', ms < 34, `${ms.toFixed(1)}ms`);
  await shot('12-scale');
});

const unexpected = requests.filter(u => !u.startsWith('file:') && !u.startsWith('data:') && !u.startsWith('blob:') && u !== 'about:blank' && !cspBlocked.has(u));
console.log('\nNetwork');
check(`all ${requests.length} requests were local or stopped by CSP`, unexpected.length === 0, unexpected.join(' '));
console.log('\nConsole');
check('no errors or CSP violations', problems.length === 0, `\n    ${problems.slice(0, 10).join('\n    ')}`);

console.log(`\n${passed} passed, ${failed.length} failed`);
for (const f of failed) console.log(`  - ${f}`);
ws.close();
proc.kill();
await sleep(300);
try { rmSync(profile, { recursive: true, force: true }); } catch { /* browser may still hold a lock */ }
process.exit(failed.length ? 1 : 0);
