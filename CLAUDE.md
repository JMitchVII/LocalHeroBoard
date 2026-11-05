# MirCore

Local-only whiteboard for an organization with sensitive-data and data-sovereignty rules. It ships as one self-contained HTML file. `README.md` covers features, the security model and its limits.

## Commands

```
node build.mjs                  build dist/MirCore.html and its .sha256
node test/e2e.mjs               run tests in real Chrome
node test/e2e.mjs --shots DIR   also save screenshots (review them: tests miss visual bugs)
BROWSER="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" node test/e2e.mjs
```

Always rebuild and run the tests after a change. The tests run against `dist/`, not `src/`. Expect one `skip` line in "Real file handle": the private file system is unavailable on `file://`.

## Hard rules

- **No network, ever.** No fetch, sockets, external fonts, images or links. No integrations.
- **No browser storage of board content.** Boards go only to files the user picks.
- **No dependencies**, including for build and test. Use Node's standard library only. The tests speak the DevTools protocol directly for this reason.
- **Clean room.** Do not copy Miro's code, styles, icons or colours.
- **Do not open `Claude Baude - Miro.html` in a browser.** Its trackers would phone home. It also holds account-specific config, so never print its embedded config or keys. It is gitignored.
- **Keep the Local only panel honest** (`showLocalInfo` in `src/70-ui.js`). Claim only what is tested, and update the README's limits to match.

## Architecture

`build.mjs` concatenates `src/*.js` in filename order into one IIFE, then pins the script and CSS by SHA-256 in the page's CSP.

| File | Contents |
| --- | --- |
| `10-core.js` | Constants, `h()` DOM helper, document model, history |
| `20-geometry.js` | Text layout, bounds, connector routing, hit testing |
| `30-render.js` | Canvas drawing; `drawItem()` is shared with export |
| `40-actions.js` | Selection operations, clipboard, viewport, find, present |
| `50-interact.js` | Pointer modes, keyboard, text editor overlay |
| `60-file.js` | Save, open, loader sanitising, export |
| `70-ui.js` | Toolbars, menus, panels, dialogs, icons |
| `90-main.js` | Startup, and the read-only `window.mircore` test hook |

## Conventions that bite

- **Items are immutable.** Change them through `patch()`, never in place. Undo snapshots and the text layout cache (a WeakMap keyed by item) both depend on this.
- **Call `commit()` once per user action.** It creates the undo step, marks the board dirty and schedules autosave. Mid-drag updates use `patch()` alone.
- **All modules share one scope.** A duplicate top-level name is a syntax error, and a name can quietly shadow a browser global (`history`, `find`).
- **The CSP blocks inline styles.** Never use `style="..."` in HTML or `innerHTML`. Setting `el.style.x` from script is fine.
- **The build rejects** syntax errors, network and storage API names, and any `http(s)://` URL, even in comments.
- **New item fields need adding to `cleanItem()`** in `60-file.js`, or they are dropped on load. Treat every loaded file as hostile: whitelist fields and validate values.
- **New text inputs** need `spellcheck="false"`, because enhanced spellcheck can upload typed text.
- **Keep board names out of `document.title`,** which would put them in browser history.

## Testing gotchas

- Clicking an already-selected item enters edit mode, so a test that re-clicks it sends the next keys to the editor.
- Overlapping items make clicks land on the top one. Keep test items apart, or a check can pass without proving anything.
- Chrome logs a request before CSP blocks it. Check for `blockedReason: csp`, not just the absence of a request.
- Chrome's component updater can drop CRX files in the test download folder, so count only `.mircore` files.
- The e2e suite stubs the file pickers. After changing `src/60-file.js`, re-test real Save and Open by hand. For automation:
  - Run a visible browser with `--disable-features=CalculateNativeWinOcclusion`, or Chrome aborts the picker instantly.
  - Save somewhere outside `AppData`, because Chrome refuses those paths.
  - Windows dialogs run in a utility process, so search the whole process tree for the window.
- An instant `AbortError` from a picker means dialogs are blocked, not that the user cancelled. See `pick()` in `60-file.js`.
