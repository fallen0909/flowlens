import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
const core=read('src/core/flowlens-core.js');
const span=(a,b)=>{const start=core.indexOf(a),end=core.indexOf(b,start);assert(start>=0&&end>start,a);return core.slice(start,end);};
{
  const url='https://media.test/clip.mp4',poster='https://media.test/missing.jpg';let videoCreates=0,replacement=null;
  const ctx={state:{posterByImage:new Map([[url,poster]]),previewPosterCache:new Map(),mediaRatioByImage:new Map(),settings:{videoPreview:false}},keyForUrl:u=>u,isCloudDriveMediaUrl:()=>false,isKnownGalleryUrl:()=>false,videoSourceCandidates:u=>[u],videoSizeFromUrl:()=>null,applyInitialAspectRatio(){},shouldKeepReferrer:()=>false,scheduleMasonryLayout(){},alternateImageUrl:()=>'',Event:class{},document:{createElement(){return {dataset:{},style:{},events:{},addEventListener(k,fn){this.events[k]=fn;},dispatchEvent(){this.events.error();},replaceWith(node){replacement=node;}};}},createVideoElement(){videoCreates++;return {dataset:{},style:{}};}};
  vm.createContext(ctx);vm.runInContext(span('  function createVideoPreviewElement(', '  function createVideoPreviewFrame('),ctx);const img=ctx.createVideoPreviewElement(url,0);img.events.error();assert.equal(videoCreates,1);assert(replacement);assert.equal(ctx.state.posterByImage.has(url),false);
  console.log('PASS a broken poster falls back once without reloading the same failed image');
}
{
  let loads=0,captures=0,unloads=0;const scheduled=new Map();let timer=0;
  const videos=Array.from({length:4},()=>({isConnected:true,dataset:{previewUrl:'https://media.test/clip.mp4'},events:{},addEventListener(k,fn){this.events[k]=fn;},removeEventListener(k,fn){if(this.events[k]===fn)delete this.events[k];}}));
  const preview={state:{active:true,lightbox:{dataset:{active:'false'}},videoPreviewQueue:videos.slice(),videoPreviewLoading:0},document:{visibilityState:'visible'},VIDEO_PREVIEW_CONCURRENCY:3,videoPreviewDistance:()=>0,window:{setTimeout(fn){scheduled.set(++timer,fn);return timer;}},clearTimeout:id=>scheduled.delete(id),setVideoSourceWithFallback(){loads++;},captureVideoPreviewFrame(){captures++;},unloadVideoElement(){unloads++;}};
  vm.createContext(preview);vm.runInContext(span('  function pumpVideoPreviewQueue(', '  function videoPreviewDistance(')+span('  function finishVideoPreviewLoad(', '  function captureVideoPreviewFrame('),preview);
  preview.pumpVideoPreviewQueue();assert.equal(loads,3);assert.equal(preview.state.videoPreviewLoading,3);
  videos[0].events.loadeddata();assert.equal(loads,4);assert.equal(captures,1);assert.equal(preview.state.videoPreviewLoading,3);
  preview.cancelVideoPreview(videos[1]);assert.equal(preview.state.videoPreviewLoading,2);assert.equal(unloads,1);assert.equal(videos[1].events.loadeddata,undefined);
  videos[2].events.loadeddata();videos[3].events.loadeddata();assert.equal(preview.state.videoPreviewLoading,0);assert.equal(scheduled.size,0);
  console.log('PASS first decoded frame releases preview slots; cancellation removes listeners and timers');
}
{
  let current={tagName:'IMG',getBoundingClientRect:()=>({width:600,height:400}),removeAttribute(){},replaceWith(node){current=node;}};
  const tile={isConnected:true,hidden:false,dataset:{url:'https://media.test/1.jpg',index:'34',mediaMounted:'true',selected:'true'},querySelector(){return current;}};
  const ctx={state:{},initialMediaRatio:()=>0.72,isVideoUrl:()=>false,document:{createElement(){return {style:{},replaceWith(node){current=node;}};}},createTileMedia:(url,index)=>({url,index,tagName:'IMG'})};
  vm.createContext(ctx);vm.runInContext(span('  function createTileMediaPlaceholder(', '  function ensureTileMediaObserver('),ctx);
  ctx.setTileMediaMounted(tile,false);assert.equal(tile.dataset.mediaMounted,'false');assert(current.style.cssText.includes('aspect-ratio:1.5'));
  ctx.setTileMediaMounted(tile,true);assert.equal(current.url,tile.dataset.url);assert.equal(current.index,34);assert.equal(tile.dataset.selected,'true');
  tile.hidden=true;current.replaceWith=node=>{current=node;};current.getBoundingClientRect=()=>({width:0,height:0});current.removeAttribute=()=>{};ctx.setTileMediaMounted(tile,false);assert.equal(tile.dataset.mediaMounted,'false');
  console.log('PASS offscreen media releases sources, keeps dimensions and selection, and restores the same item');
}
{
  const layout={state:{grid:{clientWidth:1000,querySelectorAll:()=>[],replaceChildren(){throw Error('stable cards were detached');}},lastMasonryWidth:1000,columns:3,masonryColumns:Array.from({length:3},()=>({isConnected:true}))},useSimpleGridLayout:()=>false,columnHeight:()=>800};
  vm.createContext(layout);vm.runInContext(span('  function layoutMasonry(', '  function withStageScrollPreserved('),layout);layout.layoutMasonry();assert.deepEqual(Array.from(layout.state.masonryColumnHeights),[800,800,800]);
  console.log('PASS media loads retain masonry cards and do not reload preview frames');
}
const shared=new Map([['flowlens-global-settings-v2',JSON.stringify({columns:3})]]);
function site(){const local=new Map(), handlers={};const c={window:{dispatchEvent(){},addEventListener(){}},document:{documentElement:{classList:{toggle(){}}},addEventListener:(k,v)=>handlers[k]=v,visibilityState:'visible'},localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v)},GM_getValue:(k,d)=>shared.get(k)||d,GM_setValue:(k,v)=>shared.set(k,v),CustomEvent:class{},Object};vm.runInNewContext(read('src/core/global-settings.js'),c);return {c,local,handlers};}
const a=site(),b=site();b.c.window.__flowLensSyncGlobalSettings({columns:5});a.c.document.visibilityState='hidden';a.handlers.visibilitychange();assert.equal(JSON.parse(shared.get('flowlens-global-settings-v2')).columns,5);a.c.document.visibilityState='visible';a.handlers.visibilitychange();assert.equal(JSON.parse(a.local.get('flowlens-settings-v2')).columns,5);
console.log('PASS shared settings preserve newer values');
const state={fetching:false,lastGalleryFetchAt:0,collectionGeneration:0,collectionController:new AbortController(),pendingPages:new Set(),failedPages:new Map(),fetchedPages:new Set(),pageUrls:new Set(['https://site.test/a','https://site.test/a/2']),images:[],galleryFailureCount:0,active:true};
let active='https://site.test/a',requests=0;
const c={state,activeGalleryQueueUrl:()=>active,isPhotoGalleryPage:()=>true,isKnownGalleryUrl:()=>false,isZttaotuUrl:()=>false,GALLERY_FETCH_BATCH:3,SITE_ALBUM_FETCH_BATCH:6,sortedPageUrls:()=>[...state.pageUrls],samePageUrl:(x,y)=>x===y,updateStatus(){},debugLog(){},sleep:async()=>{},fetch:async()=>{requests++;return {ok:false,status:500};},collectFromDocument:(doc,url)=>state.images.push(url),AbortController,DOMException,setTimeout,clearTimeout,DOMParser:class{parseFromString(){return {documentElement:{dataset:{}}};}}};
vm.createContext(c);vm.runInContext(span('  async function fetchRemainingPages(', '  function clampLaunchPosition(')+span('  function invalidateCollectionRequests()', '  function resetCollection()'),c);
await c.fetchRemainingPages(1,true);await c.fetchRemainingPages(1,true);assert.equal(requests,2);assert.equal(state.fetchedPages.size,0);assert.equal(state.failedPages.get('https://site.test/a/2').attempts,2);
console.log('PASS failed pages retry without being marked complete');
let resolve;c.fetch=()=>new Promise(r=>resolve=r);state.failedPages.clear();const pending=c.fetchRemainingPages(1,true);c.invalidateCollectionRequests();active='https://site.test/b';state.pageUrls=new Set([active]);state.fetchedPages=new Set([active]);state.images=['new-gallery'];resolve({ok:true,text:async()=>'<html></html>'});await pending;assert.deepEqual(state.images,['new-gallery']);assert.equal(state.fetching,false);
console.log('PASS late response cannot pollute a new gallery');
{
  let finishNavigation;
  const navState={active:true,navigationGeneration:0,galleryQueueCurrentUrl:'https://site.test/a'};
  const nav={state:navState,normalizedPageUrl:url=>url,HTTP_PAGE_RE:/^https?:/,isQueueCandidateUrl:()=>true,isSelfieGalleryQueueUrl:()=>false,GENERIC_X810114_RE:/never/,location:{href:'https://site.test/a',origin:'https://site.test'},URL,updateStatus(){},fetchHtml:()=>new Promise(resolve=>finishNavigation=resolve),fetchSelfieGalleryDocument:()=>new Promise(resolve=>finishNavigation=resolve),DOMParser:class{parseFromString(){return {documentElement:{dataset:{}}};}}};
  vm.createContext(nav);
  vm.runInContext(span('  async function loadGalleryQueueTargetInPlace(', '  function isSelfieGalleryDocument('),nav);
  for (const name of ['loadGalleryQueueTargetInPlace','loadSavedPageInPlace','loadSelfieGalleryQueueTargetInPlace']) {
    const pending=nav[name]('https://site.test/b');
    navState.navigationGeneration++;
    finishNavigation(name==='loadSelfieGalleryQueueTargetInPlace'?{documentElement:{dataset:{}}}:'<html></html>');
    assert.equal(await pending,false);
    assert.equal(navState.galleryQueueCurrentUrl,'https://site.test/a');
  }
  console.log('PASS late gallery and saved-page navigation cannot replace newer state');
}
{
  let finishApi;
  const apiState={collectionGeneration:0,collectionController:new AbortController(),images:['new-gallery']};
  const api={state:apiState,x810114ProfileName:()=> 'example',updateStatus(){},fetch:async()=>({ok:true,json:()=>new Promise(resolve=>finishApi=resolve)}),Date,encodeURIComponent};
  vm.createContext(api);
  vm.runInContext(span('  async function collectX810114ProfileFromApi()', '  async function prepareGenericX810114Page()'),api);
  const pending=api.collectX810114ProfileFromApi();
  await new Promise(resolve=>setImmediate(resolve));
  apiState.collectionGeneration++;
  apiState.collectionController.abort();
  finishApi({timeline:[{}]});
  assert.equal(await pending,false);
  assert.deepEqual(apiState.images,['new-gallery']);
  console.log('PASS stale profile API response cannot overwrite the current collection');
}
const p={state:{lightbox:{contains:()=>false}},updateStatus(){},Promise,WeakMap};vm.createContext(p);vm.runInContext(span('  const videoPlayRequests', '  function createVideoElement('),p);
let plays=0;const video={isConnected:true,ended:false,muted:false,volume:1,dataset:{},play(){plays++;return this.muted?Promise.resolve():Promise.reject(new DOMException('blocked','NotAllowedError'));}};assert.equal(await p.requestVideoPlayback(video),true);assert.equal(video.muted,true);assert.equal(plays,2);video.dataset.played='true';await p.requestVideoPlayback(video);assert.equal(plays,2);video.ended=true;await p.requestVideoPlayback(video,true);assert.equal(plays,2);
console.log('PASS autoplay muted fallback, no resume after user pause, no ended restart');
{
  const timers=new Map();let timerId=0;
  const v={isConnected:true,readyState:0,currentTime:0,dataset:{allowFallback:'true'},load(){}};
  const sources={state:{lightbox:{contains:()=>false}},location:{href:'https://site.test/'},URL,WeakMap,Number,clearTimeout:id=>timers.delete(id),window:{setTimeout:fn=>{const id=++timerId;timers.set(id,fn);return id;}},requestVideoPlayback(){}};
  vm.createContext(sources);
  vm.runInContext(span('  function videoSourceCandidates(', '  function alternateImageUrl(')+span('  const videoSourceRequests', '  const videoPlayRequests'),sources);
  sources.setVideoSourceWithFallback(v,'https://twimg.moonchan.xyz/amplify_video/example.mp4?tag=29',false);
  assert.match(v.src,/video\.twimg\.com/);
  assert.equal(sources.advanceVideoSource(v),true);assert.match(v.src,/video-cf\.twimg\.com/);
  assert.equal(sources.advanceVideoSource(v),true);assert.match(v.src,/twimg\.moonchan\.xyz/);
  assert.equal(sources.advanceVideoSource(v),false);assert.equal(v.dataset.flSourceFailed,'true');
  assert.equal(sources.advanceVideoSource(v),false);
  console.log('PASS bounded source fallback preserves the path and skips a failed proxy');
}
{
  let rejectOld;
  const old={isConnected:true,ended:false,muted:false,volume:1,dataset:{sourceAttempt:'1'},play:()=>new Promise((_,reject)=>rejectOld=reject)};
  const pending=p.requestVideoPlayback(old);
  old.dataset.sourceAttempt='2';old.play=()=>Promise.resolve();
  assert.equal(await p.requestVideoPlayback(old),true);
  rejectOld(new DOMException('old source blocked','NotAllowedError'));
  assert.equal(await pending,false);assert.equal(old.muted,false);assert.equal(old.dataset.flPlaybackBlocked,undefined);
  console.log('PASS an old play request cannot mute or block a replacement source');
}
{
  const ctx={};vm.createContext(ctx);vm.runInContext(span('  function isMediaCollectionMutation(', '  function stopGenericObserver('),ctx);
  assert.equal(ctx.isMediaCollectionMutation({type:'childList',target:{tagName:'PRE'},addedNodes:[{nodeType:3}]}),false);
  assert.equal(ctx.isMediaCollectionMutation({type:'childList',target:{tagName:'DIV'},addedNodes:[{nodeType:1,matches:()=>true}]}),true);
  assert.equal(ctx.isMediaCollectionMutation({type:'attributes',attributeName:'style',target:{getAttribute:()=> 'color:red'}}),false);
  assert.equal(ctx.isMediaCollectionMutation({type:'attributes',attributeName:'style',target:{getAttribute:()=> 'background:url(a.jpg)'}}),true);
  console.log('PASS text and cosmetic changes do not trigger media recollection');
}
{
  const queue={};vm.createContext(queue);vm.runInContext(span('  function isGalleryQueueMutation(', '  function stopGenericObserver('),queue);
  assert.equal(queue.isGalleryQueueMutation({type:'childList',target:{},addedNodes:[{nodeType:3}]}),false);
  assert.equal(queue.isGalleryQueueMutation({type:'characterData',target:{closest:()=>({})},addedNodes:[]}),true);
  assert.equal(queue.isGalleryQueueMutation({type:'childList',target:{},addedNodes:[{nodeType:1,matches:()=>true}]}),true);
  console.log('PASS unrelated text updates leave gallery queues idle, new links still refresh');
}
{
  let loads=0;const pending={isConnected:true,dataset:{}};
  const preview={state:{active:true,lightbox:{dataset:{active:'true'}},videoPreviewQueue:[pending],videoPreviewLoading:0},document:{visibilityState:'visible'},VIDEO_PREVIEW_CONCURRENCY:2,videoPreviewDistance:()=>0,startVideoPreviewLoad(){loads++;}};
  vm.createContext(preview);vm.runInContext(span('  function pumpVideoPreviewQueue(', '  function videoPreviewDistance('),preview);
  preview.pumpVideoPreviewQueue();assert.equal(loads,0);assert.equal(preview.state.videoPreviewQueue.length,1);
  preview.state.lightbox.dataset.active='false';preview.document.visibilityState='hidden';preview.pumpVideoPreviewQueue();assert.equal(loads,0);
  preview.document.visibilityState='visible';preview.pumpVideoPreviewQueue();assert.equal(loads,1);assert.equal(preview.state.videoPreviewQueue.length,0);
  console.log('PASS preview work waits behind the lightbox and hidden tabs, then resumes');
}
{
  let captures=0;const native={state:{lightbox:{dataset:{active:'true'},contains:()=>true}},claimEvent(){throw new Error('native controls intercepted');}};
  vm.createContext(native);vm.runInContext(span('  function onLightboxClick(', '  function onLightboxPointerMove('),native);
  const event={button:0,target:{closest:selector=>selector==='#xiv-lightbox video'?{}:null,setPointerCapture(){captures++;}}};
  native.onLightboxClick(event);native.onLightboxPointerDown(event);assert.equal(captures,0);assert.equal(native.state.lightboxSwipe,undefined);
  console.log('PASS native video play and seek controls keep their pointer events');
}
const original=EventTarget.prototype.addEventListener;const ec={window:{addEventListener(){}},document:{getElementById(){return null;},addEventListener(){},documentElement:{}},EventTarget,MutationObserver:class{observe(){}},setTimeout};vm.runInNewContext(read('src/patches/visible-sequence-safe.js'),ec);vm.runInNewContext(read('src/patches/lightbox-event-guard.js'),ec);assert.equal(EventTarget.prototype.addEventListener,original);let calls=0;const target=new EventTarget();function onKeydown(){calls++;}target.addEventListener('keydown',onKeydown);target.removeEventListener('keydown',onKeydown);target.dispatchEvent(new Event('keydown'));assert.equal(calls,0);
console.log('PASS native event registration/removal stays intact');
let values={overflow:'hidden',pointerEvents:'none'};const style={getPropertyValue:k=>values[k]||'',getPropertyPriority:()=>'',setProperty:(k,v)=>values[k]=v,removeProperty:k=>delete values[k]};const lock={state:{pageLock:null,active:false},document:{documentElement:{style},body:null}};vm.createContext(lock);vm.runInContext(span('  function acquirePageLock()', '  async function openViewer()'),lock);lock.restorePageLock();assert.equal(values.overflow,'hidden');lock.acquirePageLock();lock.restorePageLock();assert.equal(values.overflow,'hidden');assert.equal(values.pointerEvents,'none');values.overflow='scroll';lock.acquirePageLock();lock.restorePageLock();assert.equal(values.overflow,'scroll');
console.log('PASS host styles and scroll lock restore correctly');
{
  const frameContext={};vm.createContext(frameContext);vm.runInContext(span('  function videoFrameSrcDoc(', '  function rememberVideoTime('),frameContext);
  const frameHtml=frameContext.videoFrameSrcDoc();
  assert(frameHtml.includes('content="no-referrer"'));
  assert(!frameHtml.includes('<script>'));
  console.log('PASS protected frame contains a referrer policy without inline playback scripts');
}

{
let now=0,nextTimer=1,index=0;const timers=new Map(),listeners={};
const style={removeProperty(){},setProperty(){}};
const image={src:'https://media.test/0.jpg',style,dataset:{},tagName:'IMG'};
let button=null;
const box={dataset:{active:'true'},querySelector(selector){if(selector==='.xiv-lightbox-slideshow')return button;if(selector==='video'||selector.includes('iframe')&&!selector.includes('img'))return null;if(selector.includes('img'))return image;return null;},insertBefore(btn){button=btn;},appendChild(btn){button=btn;},scrollTo(){}};
const root={querySelector:()=>box};
const doc={documentElement:{appendChild(){}},getElementById:id=>id==='xiv-root'?root:null,createElement:()=>({dataset:{},style,attributes:{},getAttribute(k){return this.attributes[k];},setAttribute(k,v){this.attributes[k]=v;},remove(){button=null;}}),addEventListener:(type,fn)=>{(listeners[type]||=[]).push(fn);},dispatchEvent(){}};
let zoomObserver;
const slide={window:{__flowLensControl:{showAdjacent(){index++;image.src='https://media.test/'+index+'.jpg';return true;}},setTimeout:(fn,wait=0)=>{const id=nextTimer++;timers.set(id,{fn,at:now+wait});return id;},addEventListener(){},dispatchEvent(){}},document:doc,localStorage:{getItem:()=>JSON.stringify({lightboxAutoDelay:800})},MutationObserver:class{constructor(fn){this.fn=fn;}observe(target){if(target===box)zoomObserver=this.fn;}},clearTimeout:id=>timers.delete(id),CustomEvent:class{},requestAnimationFrame:fn=>fn(),Date:class extends Date{static now(){return now;}}};
vm.runInNewContext(read('src/patches/lightbox-enhance.js'),slide);
function advance(ms){const end=now+ms;let runs=0;while(true){const first=[...timers.entries()].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!first)break;assert(++runs<1000,'timer feedback loop');now=first[1].at;timers.delete(first[0]);first[1].fn();}now=end;}
advance(0);const event={target:{closest:selector=>selector==='.xiv-lightbox-slideshow'?button:null},preventDefault(){},stopPropagation(){},stopImmediatePropagation(){}};
listeners.pointerdown.forEach(fn=>fn(event));listeners.click.forEach(fn=>fn(event));assert.equal(button.dataset.active,'true');advance(2100);assert(index>=3);listeners.click.forEach(fn=>fn(event));assert.equal(button.dataset.active,'false');const pausedIndex=index;advance(3000);assert.equal(index,pausedIndex);
console.log('PASS slideshow pointer/click starts once, advances repeatedly and pauses');
listeners.click.forEach(fn=>fn(event));box.dataset.zoom='actual';zoomObserver();const zoomIndex=index;advance(4000);assert.equal(index,zoomIndex);assert.equal(box.dataset.flSlideshowPaused,'zoom');
box.dataset.zoom='fit';zoomObserver();advance(700);assert.equal(index,zoomIndex);advance(200);assert(index>zoomIndex);
box.dataset.flShortcutZoom='true';zoomObserver();const shortcutIndex=index;advance(3000);assert.equal(index,shortcutIndex);
listeners.click.forEach(fn=>fn(event));delete box.dataset.flShortcutZoom;zoomObserver();advance(3000);assert.equal(index,shortcutIndex);
console.log('PASS zoom suspends slideshow, fit resumes after a full delay, manual stop stays stopped');

}
