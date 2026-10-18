// DOM dependency: npm install --prefix tools --no-save --package-lock=false linkedom
// Then run: node tools/test-xchina-gallery.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
const { parseHTML } = await import(process.env.FLOWLENS_TEST_DOM || 'linkedom');
const root = new URL('../', import.meta.url);
const core = fs.readFileSync(new URL('src/core/flowlens-core.js', root), 'utf8');
const fixture = fs.readFileSync(new URL('tools/fixtures/xchina-gallery.html', root), 'utf8');
const base = 'https://xchina.co/photo/6a180f8c1ac36';
const htmlFor = page => fixture.replaceAll('{{FIRST}}', String(page * 2 - 1).padStart(4, '0')).replaceAll('{{SECOND}}', String(page * 2).padStart(4, '0'));
const docFor = (html = htmlFor(1)) => parseHTML(html).document;
const names = [
  'absoluteUrl', 'normalizedPageUrl', 'samePageUrl', 'xchinaPhotoInfo', 'isXchinaPhotoUrl',
  'isQueueCandidateUrl', 'xchinaAdjacentLinksFromDocument', 'isPhotoGalleryPage', 'isKnownGalleryUrl',
  'siteAlbumIdFromUrl', 'siteAlbumPageNumberFromUrl', 'siteAlbumOriginalImageUrl',
  'siteAlbumImageUrlFromRaw', 'siteAlbumDirectImageCandidates', 'xchinaMainContainers',
  'isKnownXchinaPromoImage', 'closestText', 'unescapeEmbeddedUrl',
  'collectXchinaPhotoUrls', 'collectFromDocument', 'collectFallbackImageUrls', 'rememberExpectedImageCount',
  'discoverXchinaPageLinks', 'discoverPageLinksFromDocument', 'discoverNearbyPages',
  'sameGalleryPage', 'galleryPrefixFromUrl', 'pageNumberFromUrl', 'sortedPageUrls',
  'galleryPageUrlFromPrefix', 'galleryFetchLimit', 'fetchRemainingPages', 'invalidateCollectionRequests'
];
const extract = name => {
  const match = core.match(new RegExp(`  (?:async )?function ${name}\\([^]*?\\n  \\}`));
  assert(match, `missing ${name}`);
  return match[0];
};
function context() {
  const timers = new Map(); let timerId = 0, now = 10000;
  const state = { pageUrls: new Set([base]), fetchedPages: new Set([base]), pendingPages: new Set(), failedPages: new Map(), images: [], expectedImages: 0, collectionGeneration: 1, collectionController: new AbortController(), active: true, stage: {scrollTop:0,clientHeight:800,scrollHeight:1000}, fetching:false, lastGalleryFetchAt:0 };
  const c = {
    state, URL, AbortController, DOMException, console, location: new URL(base), document: docFor(), window: {},
    Date: class extends Date { static now() { return now; } },
    setTimeout(fn, ms) { timers.set(++timerId, {fn, at:now+ms}); return timerId; },
    clearTimeout(id) { timers.delete(id); }, sleep: async () => {},
    DOMParser: class { parseFromString(html) { return docFor(html); } },
    activeGalleryQueueUrl: () => base, isZttaotuUrl: () => false,
    isPornpicsGalleryPage: () => false, isCloudDriveFilesPage: () => false, isBuonduaPage: () => false,
    collectVideoPosters() {}, refreshGalleryQueue() {}, renderImages() {}, applyMediaFilter() {}, updateStatus() {}, debugLog() {},
    isAdMedia: () => false,
    isMediaUrl: url => /\.(?:jpg|webp|png)(?:[?#]|$)/i.test(url), isVideoUrl: () => false,
    isFavoriteImageUrl: url => /\.(?:jpg|webp|png)(?:[?#]|$)/i.test(url), backgroundImageUrls: () => [],
    addImage(url) { if (state.images.includes(url)) return false; state.images.push(url); return true; },
    fetchSameOriginDocumentViaFrame: async () => { throw new Error('frame unavailable'); }
  };
  for (const name of ['BAD_IMAGE_RE','BLOCKED_PROMO_TEXT_RE','GALLERY_FETCH_BATCH','SITE_ALBUM_FETCH_BATCH','PAGE_RE','GALLERY_ROOT_RE','ZTTAOTU_PAGE_RE','SELFIE_GALLERY_PATH_RE','STATIC_ASSET_RE']) {
    const match = core.match(new RegExp(`  const ${name} = ([^]*?);`));
    c[name] = vm.runInNewContext(match[1]);
  }
  vm.createContext(c);
  vm.runInContext(names.map(extract).join('\n'), c);
  c.tick = async () => {
    const entry = [...timers].sort((a,b) => a[1].at-b[1].at)[0];
    if (!entry) return false;
    timers.delete(entry[0]); now = entry[1].at;
    await entry[1].fn(); await nextTurn();
    return true;
  };
  c.timers = timers;
  return c;
}

{
  const c = context();
  for (const url of [base, base+'?page=2', base+'/3', 'https://xchina.co/photo/id-6a180f8c1ac36.html', 'https://xchina.co/photo/id-6a180f8c1ac36/2.html']) {
    assert(c.isXchinaPhotoUrl(url)); assert(c.isPhotoGalleryPage(url)); assert.equal(c.siteAlbumIdFromUrl(url), '6a180f8c1ac36');
  }
  assert(!c.isXchinaPhotoUrl('https://xchina.co.evil.test/photo/6a180f8c1ac36'));
  assert(!c.isQueueCandidateUrl(base+'?page=2'));
  assert(c.isQueueCandidateUrl(base));
  c.collectFromDocument(c.document, base);
  assert.equal(c.state.images.length, 2);
  assert(c.state.images.every(url => url.includes('/6a180f8c1ac36/') && url.endsWith('.jpg') && !url.includes('_600')));
  assert.equal(c.state.expectedImages, 32);
  assert.equal(c.state.pageUrls.size, 16);
  c.discoverNearbyPages(); assert.equal(c.state.pageUrls.size, 16);
  c.collectFromDocument(c.document, base); assert.equal(c.state.images.length, 2);
  c.collectFallbackImageUrls(c.document, base); assert.equal(c.state.images.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(c.xchinaAdjacentLinksFromDocument(c.document, base))), {previous:'',next:''});
  console.log('PASS new/legacy URLs, sidebar/HTML fallback exclusion, lazy image URLs, 16 bounded pages, no duplicate refresh');
}

for (const kind of ['path', 'query-p', 'legacy']) {
  const c = context();
  const start = kind === 'legacy' ? 'https://xchina.co/photo/id-6a180f8c1ac36.html' : base;
  const href = page => kind === 'legacy' ? `/photo/id-6a180f8c1ac36/${page}.html` : kind === 'path' ? `${base}/${page}` : `?p=${page}`;
  const doc = docFor(`<nav aria-label="分页"><a href="${href(2)}">2</a> / 16<input max="16"></nav><aside>910P</aside>`);
  c.state.pageUrls = new Set([start]);
  c.discoverPageLinksFromDocument(doc, start);
  assert.equal(c.state.pageUrls.size,16);
  assert.equal(c.pageNumberFromUrl(c.sortedPageUrls().at(-1)),16);
  if (kind === 'query-p') assert([...c.state.pageUrls].every(url => !url.includes('page=')));
  console.log(`PASS pagination follows observed ${kind} links and fills omitted pages`);
}

{
  const c = context(); c.collectFromDocument(c.document,base);
  const calls = []; let failedOnce = false, concurrent = 0, peak = 0;
  c.fetch = async url => {
    const page = c.pageNumberFromUrl(url); calls.push(page); concurrent++; peak=Math.max(peak,concurrent);
    assert(page >= 2 && page <= 16);
    await Promise.resolve(); concurrent--;
    if (page===9 && !failedOnce) { failedOnce=true; return {ok:false,status:503}; }
    return {ok:true,text:async()=>htmlFor(page)};
  };
  await c.fetchRemainingPages(6,true);
  assert.equal(c.state.fetchedPages.size,7);
  for (let i=0; i<10 && await c.tick(); i++) {}
  assert.equal(c.state.fetchedPages.size,16); assert.equal(c.state.failedPages.size,0);
  assert.equal(c.state.images.length,32); assert.equal(peak,1);
  assert.equal(calls.filter(n=>n===9).length,2);
  assert.equal(calls.length,16);
  console.log('PASS all 16 pages continue without extra scroll, transient failure retries, Cloudflare analytics accepted, serial fetches');
}

for (const html of ['<html><head><title>Just a moment...</title></head><body>challenge</body></html>', '<html><body><aside><img src="https://img.xchina.io/photos/6a180f8c99991/0001.jpg"></aside></body></html>']) {
  const c=context(); c.state.pageUrls.add(base+'?page=2');
  c.fetch=async()=>({ok:true,text:async()=>html});
  c.fetchSameOriginDocumentViaFrame=async()=>docFor(html);
  await c.fetchRemainingPages(1,true);
  assert.equal(c.state.fetchedPages.size,1); assert.equal(c.state.failedPages.size,1);
  console.log('PASS challenge/empty album page stays retryable, including iframe fallback');
}

{
  const c=context(); c.collectFromDocument(c.document,base);
  c.fetch=async url=>({ok:true,text:async()=>htmlFor(c.pageNumberFromUrl(url))});
  await c.fetchRemainingPages(1,true); assert(c.timers.size);
  c.invalidateCollectionRequests(); assert.equal(c.timers.size,0);
  console.log('PASS closing/switching galleries cancels scheduled continuation');
}
