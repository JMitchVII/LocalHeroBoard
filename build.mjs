// Builds dist/MirCore.html: one self-contained file with a hash-pinned CSP.
// Uses only Node's standard library, so there is no dependency tree to vet.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Script } from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, 'src');
const read = name => readFileSync(join(src, name), 'utf8').replace(/\r\n/g, '\n');
const sha = (text, encoding) => createHash('sha256').update(text, 'utf8').digest(encoding);

const modules = readdirSync(src).filter(f => f.endsWith('.js')).sort();
const js = `(() => {\n'use strict';\n${modules.map(read).join('\n')}\n})();\n`;
const css = read('styles.css');

new Script(js, { filename: 'MirCore.js' }); // a syntax error must fail the build, not the page

if (/<\/script/i.test(js) || /<\/style/i.test(css)) throw new Error('Closing tag inside inline content');

// Forbidden in shipped code. This is a second check on top of the CSP.
const banned = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|RTCPeerConnection|importScripts|localStorage|sessionStorage|indexedDB|eval|Function)\s*[(.]|new\s+(Worker|SharedWorker)\b|https?:\/\/(?!www\.w3\.org)/;
const hit = js.match(banned) || css.match(banned);
if (hit) throw new Error(`Banned API or URL in source: ${hit[0]}`);

const csp = [
  "default-src 'none'",
  `script-src 'sha256-${sha(js, 'base64')}'`,
  `style-src 'sha256-${sha(css, 'base64')}'`,
  'img-src data: blob:',
  "connect-src 'none'",
  "font-src 'none'",
  "media-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "manifest-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const html = read('index.template.html')
  .replace('__CSP__', () => csp)
  .replace('__CSS__', () => css)
  .replace('__JS__', () => js);

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'MirCore.html'), html);
const digest = sha(html, 'hex');
writeFileSync(join(root, 'dist', 'MirCore.html.sha256'), `${digest}  MirCore.html\n`);
console.log(`dist/MirCore.html  ${(html.length / 1024).toFixed(0)} KB  sha256 ${digest}`);
