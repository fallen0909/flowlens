import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const core = fs.readFileSync(new URL('../src/core/flowlens-core.js', import.meta.url), 'utf8');
const functions = ['createTileMediaPlaceholder', 'setTileMediaMounted', 'scheduleTileMediaReconcile', 'reconcileTileMedia', 'resumeTileMedia', 'stopTileMediaObserver', 'onScroll'];
const source = functions.map(name => {
  const found = core.match(new RegExp(`  function ${name}\\([^]*?\\n  \\}`));
  assert(found, name); return found[0];
}).join('\n');
let reads = 0, scroll = 6200, id = 0;
const timers = new Map(), created = [];
function media(tagName = 'DIV') {
  return { tagName, style: {}, removeAttribute() {}, getBoundingClientRect: () => ({width:600,height:400}) };
}
function tile(index, row) {
  let child = media();
  const t = {
    isConnected: true, hidden: false, style: {contentVisibility:'auto'},
    dataset: {index:String(index),url:`https://media.test/photo-${index}.jpg`,mediaMounted:'false',selected:'true'},
    getBoundingClientRect() { reads++; return {top:row*400-scroll,bottom:row*400+400-scroll,width:600,height:400}; },
    querySelector(selector) {
      if (selector === ':scope > .xiv-media-placeholder') return child.tagName === 'DIV' ? child : null;
      if (selector === ':scope > img') return child.tagName === 'IMG' ? child : null;
      return child;
    },
    get child() { return child; }
  };
  const replace = node => { child=node; child.replaceWith=replace; };
  child.replaceWith=replace;
  return t;
}
const columns = Array.from({length:3},(_,column)=>({isConnected:true,children:Array.from({length:1000},(_,row)=>tile(column*1000+row,row))}));
const state = {
  active:true, lightbox:{dataset:{active:'false'}}, tileMediaReconcileTimer:0, masonryColumns:columns,
  stage:{scrollTop:scroll,clientHeight:900,scrollHeight:400000,getBoundingClientRect:()=>({top:0,bottom:900})},
  grid:{querySelectorAll:()=>[]},nearMediaTiles:new Set()
};
const c = {
  state, document:{visibilityState:'visible',createElement:()=>media()},Date,
  setTimeout(fn) { timers.set(++id,fn); return id; },clearTimeout:id=>timers.delete(id),
  initialMediaRatio:()=>0.72,isVideoUrl:()=>false,pumpVideoPreviewQueue(){},cancelVideoPreview(){},
  createTileMedia(url,index) { created.push(index); const img=media('IMG'); img.loading='lazy'; return img; },
  scheduleViewerPositionSave(){},fetchRemainingPages(){}
};
vm.createContext(c);vm.runInContext(source,c);
function flush() { for (const [key,fn] of [...timers]) { timers.delete(key); fn(); } }

// No IntersectionObserver callback arrives for the visible #20 card.
c.onScroll(); c.onScroll(); c.onScroll();
assert.equal(timers.size,1); flush();
const twentieth=columns[0].children[19];
assert.equal(twentieth.dataset.mediaMounted,'true');
assert.equal(twentieth.child.tagName,'IMG');
assert.equal(twentieth.child.loading,'eager');
assert.equal(twentieth.style.contentVisibility,'visible');
assert.equal(twentieth.dataset.selected,'true');
assert(created.length>0 && created.length<35);
assert(reads<100,`measured ${reads} cards in a 3000-card gallery`);
console.log('PASS missing observer delivery still restores visible #20; eager images paint without a click');
console.log('PASS 3000-card gallery measures fewer than 100 cards and mounts only the nearby range');

const count=created.length;c.reconcileTileMedia();assert.equal(created.length,count);
twentieth.child.loading='lazy';c.reconcileTileMedia();assert.equal(twentieth.child.loading,'eager');
console.log('PASS reconciliation keeps mounted sources and reuses the existing image');

scroll=10200;state.stage.scrollTop=scroll;c.onScroll();flush();
assert.equal(twentieth.dataset.mediaMounted,'false');
assert.equal(twentieth.style.contentVisibility,'auto');
assert.equal(state.nearMediaTiles.has(twentieth),false);
scroll=6200;state.stage.scrollTop=scroll;c.onScroll();flush();
assert.equal(twentieth.dataset.mediaMounted,'true');
assert.equal(twentieth.dataset.index,'19');assert.equal(twentieth.dataset.selected,'true');
console.log('PASS scrolling away releases media; returning restores the same card and selection');

scroll=16200;state.lightbox.dataset.active='true';c.onScroll();flush();
const paused=created.length;c.reconcileTileMedia();assert.equal(created.length,paused);
state.lightbox.dataset.active='false';c.resumeTileMedia();assert(created.length>paused);
console.log('PASS work pauses behind the lightbox and resumes from current geometry after closing');

const beforeHidden=created.length;c.document.visibilityState='hidden';scroll=20200;c.reconcileTileMedia();assert.equal(created.length,beforeHidden);
c.document.visibilityState='visible';c.scheduleTileMediaReconcile();flush();assert(created.length>beforeHidden);
c.scheduleTileMediaReconcile();c.stopTileMediaObserver();assert.equal(timers.size,0);
state.active=false;c.scheduleTileMediaReconcile();assert.equal(timers.size,0);
console.log('PASS hidden tabs pause recovery; closing the viewer cancels pending recovery');
