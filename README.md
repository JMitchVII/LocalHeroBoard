# MirCore

A local-only whiteboard for brainstorming. It is one HTML file with no server, no account and no network access. Boards are saved only to files you choose.

## Use it

Open `dist/MirCore.html` in Chrome or Edge. There is nothing to install.

- **Double-click** the board for a sticky. **Tab** makes the next one, **Ctrl+Enter** makes one below, **Esc** finishes.
- **Paste a list** to get one sticky per line.
- Select a sticky or shape and **click or drag a + dot** to grow a connected idea.
- **Ctrl+S** picks a file once. After that the board autosaves to it.
- Press **?** for every shortcut.

Boards are `.mircore` files: plain JSON, with images embedded. Copy, back up and classify them like any other document.

## What it includes

Infinite canvas, stickies with auto-fitting text, text, 8 shapes, connectors that stay attached (curved, elbow, straight), pen and marker, eraser, frames, images, multi-select, smart guides, group, lock, align, distribute, tidy to grid, undo and redo, find, minimap, present mode, PNG export, and print or save as PDF.

Left out on purpose: real-time collaboration, comments, templates, voting and timers, and AI features. Collaboration would need a network. Rotation and touch gestures are not built yet, and the canvas has no screen-reader outline.

## Security model

| Control | How it is enforced |
| --- | --- |
| No network | The page's Content Security Policy sets `default-src 'none'` and `connect-src 'none'`. The browser refuses the connection, whatever the code does. |
| No injected code | `script-src` and `style-src` allow only the SHA-256 of the shipped code. Editing the file stops it running until it is rebuilt. |
| No external content | Fonts are system fonts and icons are inline. Remote images are dropped on load and blocked again by CSP. |
| No browser storage | Nothing uses localStorage, IndexedDB or cookies, so board content stays out of the browser profile. |
| No cloud spellcheck | Spellcheck is off in the editor, because enhanced spellcheck services can upload typed text. Common grammar extensions are opted out too. |
| No history leak | The tab title stays `MirCore`, so board names do not enter browser history. |
| Untrusted board files | Every field is rebuilt from a whitelist on load. Text is drawn on a canvas, so it cannot run as markup. |
| Deleted images | Only images still on the board are written to the file. |
| Supply chain | Zero dependencies at runtime, build and test. Only Node's standard library is used. |

### What this does not cover

- **Browser extensions** can read any page. Use a browser profile without extensions for sensitive boards.
- **The browser itself** still makes its own connections, such as updates. CSP confines this page, not the browser. Control that with your managed browser policy, or run offline.
- **Saved files are not encrypted.** Keep them on storage that meets your handling rules. Encryption at rest comes from BitLocker or your equivalent.
- **The operating system** still handles the clipboard, printing and swap memory. Chrome's "Save as PDF" stays local, but a network printer does not.

### Verify it yourself

```
certutil -hashfile dist\MirCore.html SHA256     (compare with dist\MirCore.html.sha256)
```

Open DevTools, go to the Network tab, and use the app. The Local only button at the top right shows the live policy.

## Managed browsers

Chrome blocks saving into system folders such as `AppData` and asks you to pick somewhere else.

If policy disables file dialogs, or the browser has no direct file access (Firefox, Safari), Save falls back to a normal download. The app tells you when this happens. In that mode autosave is off, so press Ctrl+S to save.

## Develop

```
node build.mjs        builds dist/MirCore.html and its checksum
node test/e2e.mjs     runs the tests in real Chrome (set BROWSER= for Edge)
```

Source is in `src/`. The build fails if the code contains a syntax error, a network or storage API, or a URL.

The tests drive a real browser over the DevTools protocol. They try every outbound channel, feed the loader hostile files, and fail on any network request that was not stopped, or on any console error. They replace the operating system's file dialogs with stubs, so check real Save and Open by hand after changing `src/60-file.js`.

## Origin

This is a clean-room build. The saved Miro page was used only as a map of the interface: which tools exist and where they sit. No Miro code, styles, icons or colours are included, and the saved page's canvas engine was not in the bundle.

The folder `Claude Baude - Miro_files` and its HTML hold Miro's tracking scripts and account-specific configuration. Do not open that page in a browser, because it will contact those services, and do not redistribute it. MirCore does not need it, so it can be deleted.
