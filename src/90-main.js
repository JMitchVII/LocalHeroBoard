// Startup.

function init() {
  buildToolbar();
  bindUI();
  bindInput();
  bindMinimap();
  bindFiles();
  resizeCanvas();
  view.x = -stage.clientWidth / 2;
  view.y = -stage.clientHeight / 2;
  $('#title').value = doc.title;
  resetHistory();
  syncToolbar();
  syncStatus();
  syncEmptyState();
  syncCursor();
  // Read-only view of the board for the end-to-end tests in test/e2e.mjs.
  window.mircore = Object.freeze({ snapshot: () => JSON.parse(serialize()), selection: () => [...sel], status: () => ({ ...file, handle: !!file.handle }) });
  invalidate();
}

init();
