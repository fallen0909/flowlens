import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
const core = fs.readFileSync(new URL('../src/core/flowlens-core.js', import.meta.url), 'utf8');
const extract = name => core.match(new RegExp(`  (?:async )?function ${name}\\([^]*?\\n  \\}`))[0];
{
  let keyReads = 0, indexSyncs = 0, scans = 0;
  const state = { grid: { querySelector() { return null; } }, images: [], imageKeys: new Set(), renderedKeys: new Set(), renderQueue: [], mediaFilter: 'all', counter: { textContent: '' }, rejectedCount: 0 };
  const c = { state, CSS: { escape: value => value }, keyForUrl(value) { keyReads++; return value; },
    scheduleRenderQueue() {}, syncTileIndexes() { indexSyncs++; }, scheduleRestoreViewerPosition() {}, layoutMasonry() {},
    filteredImages() { scans++; return state.images; }, isPornpicsGalleryPage: () => false };
  vm.createContext(c); vm.runInContext(['renderImages','rejectImage','updateCounter'].map(extract).join('\n'), c);
  for (let i = 0; i < 150; i++) {
    state.images.push(...Array.from({length: 20}, (_, j) => `photo-${i*20+j}`)); c.renderImages();
  }
  assert.equal(keyReads, 3000); assert.equal(indexSyncs, 0); assert.equal(scans, 0);
  assert.equal(state.renderQueue.length, 3000);
  c.renderImages(); assert.equal(keyReads, 3000);
  c.rejectImage('photo-1');
  assert.equal(state.renderQueue.length, 2999); assert.equal(indexSyncs, 1);
  assert(state.renderQueue.every(item => state.images[item.index] === item.url));
  c.renderImages(); assert.equal(state.renderQueue.length, 2999);
  state.mediaFilter = 'image'; c.updateCounter(); assert.equal(scans, 1);
  console.log('PASS 150 appends inspect 3,000 new URLs, no append index rescan or all-mode filter scan; pending-card rejection preserves identity');
}
{
  const { document } = parseHTML('<html><body><div id="grid"></div></body></html>');
  const grid = document.getElementById('grid');
  let gridScans = 0, observed = 0, images = 0;
  const query = grid.querySelectorAll.bind(grid);
  grid.querySelectorAll = (...args) => { gridScans++; return query(...args); };
  const c = { state: { grid, tileMediaObserver: { observe() { observed++; } }, imageLoadObserver: { observe() { images++; } } }, ensureTileMediaObserver() {}, ensureImageLoadObserver() {}, scheduleTileMediaReconcile() {} };
  vm.createContext(c); vm.runInContext(['observeTileMedia','observeDeferredImages'].map(extract).join('\n'), c);
  for (let batch = 0; batch < 150; batch++) {
    const tiles = Array.from({ length: 20 }, () => {
      const tile = document.createElement('div'); tile.className = 'xiv-tile';
      tile.innerHTML = '<img data-xiv-deferred-image="true">'; grid.append(tile); return tile;
    });
    c.observeTileMedia(tiles); c.observeDeferredImages(tiles);
    c.observeTileMedia(tiles); // Re-delivery must not register a second time.
  }
  assert.equal(gridScans, 0); assert.equal(observed, 3000); assert.equal(images, 3000);
  console.log('PASS 3,000 cards / 150 batches: zero full-grid observer scans; exactly one tile registration per card');
}
{
  const { document, window } = parseHTML('<html><body><video></video></body></html>');
  const frames = new Map(); let id = 0, reads = 0;
  window.innerWidth = 390;
  window.requestAnimationFrame = fn => { frames.set(++id, fn); return id; };
  window.cancelAnimationFrame = key => frames.delete(key);
  const video = document.querySelector('video');
  video.getBoundingClientRect = () => { reads++; return { left: 0, top: 0, width: 390, height: 300 }; };
  const c = { window }; vm.createContext(c); vm.runInContext(extract('createVideoGestureSurface'), c);
  const surface = c.createVideoGestureSurface(video);
  assert.equal(reads, 1);
  for (let i = 0; i < 100; i++) document.dispatchEvent(new window.Event('scroll'));
  assert.equal(reads, 1); assert.equal(frames.size, 1);
  for (const [key, fn] of frames) { frames.delete(key); fn(); }
  assert.equal(reads, 2);
  document.dispatchEvent(new window.Event('scroll')); surface.cleanup();
  assert.equal(frames.size, 0); assert(!surface.element.isConnected);
  document.dispatchEvent(new window.Event('scroll')); assert.equal(frames.size, 0);
  console.log('PASS 100 scroll events: one scheduled geometry read; cleanup cancels pending work and removes listeners');
}
{
  let frames = 0;
  const c = { state: { renderQueue: [1], renderFrame: 0 }, document: { visibilityState: 'hidden' }, requestAnimationFrame() { frames++; return 1; }, processRenderQueue() {} };
  vm.createContext(c); vm.runInContext(extract('scheduleRenderQueue'), c);
  c.scheduleRenderQueue(); assert.equal(frames, 0);
  c.document.visibilityState = 'visible'; c.scheduleRenderQueue(); c.scheduleRenderQueue(); assert.equal(frames, 1);
  console.log('PASS hidden tabs schedule no rendering; visibility recovery schedules once');
}
