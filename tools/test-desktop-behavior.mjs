import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
const core=read('src/core/flowlens-core.js');
const span=(a,b)=>{const start=core.indexOf(a),end=core.indexOf(b,start);assert(start>=0&&end>start,a);return core.slice(start,end);};
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
const original=EventTarget.prototype.addEventListener;const ec={window:{addEventListener(){}},document:{getElementById(){return null;},addEventListener(){},documentElement:{}},EventTarget,MutationObserver:class{observe(){}},setTimeout};vm.runInNewContext(read('src/patches/visible-sequence-safe.js'),ec);vm.runInNewContext(read('src/patches/lightbox-event-guard.js'),ec);assert.equal(EventTarget.prototype.addEventListener,original);let calls=0;const target=new EventTarget();function onKeydown(){calls++;}target.addEventListener('keydown',onKeydown);target.removeEventListener('keydown',onKeydown);target.dispatchEvent(new Event('keydown'));assert.equal(calls,0);
console.log('PASS native event registration/removal stays intact');
let values={overflow:'hidden',pointerEvents:'none'};const style={getPropertyValue:k=>values[k]||'',getPropertyPriority:()=>'',setProperty:(k,v)=>values[k]=v,removeProperty:k=>delete values[k]};const lock={state:{pageLock:null,active:false},document:{documentElement:{style},body:null}};vm.createContext(lock);vm.runInContext(span('  function acquirePageLock()', '  async function openViewer()'),lock);lock.restorePageLock();assert.equal(values.overflow,'hidden');lock.acquirePageLock();lock.restorePageLock();assert.equal(values.overflow,'hidden');assert.equal(values.pointerEvents,'none');values.overflow='scroll';lock.acquirePageLock();lock.restorePageLock();assert.equal(values.overflow,'scroll');
console.log('PASS host styles and scroll lock restore correctly');
const frameContext={JSON};vm.createContext(frameContext);vm.runInContext(span('  function safeScriptJson(', '  function rememberVideoTime('),frameContext);
const frameHtml=frameContext.videoFrameSrcDoc('https://media.test/movie.mp4',0);
const frameScript=frameHtml.match(/<script>([\s\S]*?)<\/script>/)[1];
const mediaEvents={},messages=[];let framePlays=0;
const frameVideo={muted:false,volume:1,currentTime:0,duration:5,ended:false,dataset:{},addEventListener:(k,v)=>{const old=mediaEvents[k];mediaEvents[k]=()=>{old?.();v();};},play(){framePlays++;if(!this.muted)return Promise.reject(new DOMException('blocked','NotAllowedError'));mediaEvents.playing?.();return Promise.resolve();}};
vm.runInNewContext(frameScript,{document:{getElementById:()=>frameVideo},parent:{postMessage:m=>messages.push(m)},window:{addEventListener(){}},setInterval(){},DOMException,Number});mediaEvents.loadedmetadata();await new Promise(r=>setImmediate(r));assert.equal(framePlays,2);assert.equal(frameVideo.muted,true);assert.equal(frameVideo.dataset.played,'true');mediaEvents.canplay();await new Promise(r=>setImmediate(r));assert.equal(framePlays,2);
console.log('PASS iframe autoplay fallback without repeated play calls');

{
let now=0,nextTimer=1,index=0;const timers=new Map(),listeners={};
const style={removeProperty(){},setProperty(){}};
const image={src:'https://media.test/0.jpg',style,dataset:{},tagName:'IMG'};
let button=null;
const box={dataset:{active:'true'},querySelector(selector){if(selector==='.xiv-lightbox-slideshow')return button;if(selector==='video'||selector.includes('iframe')&&!selector.includes('img'))return null;if(selector.includes('img'))return image;return null;},insertBefore(btn){button=btn;},appendChild(btn){button=btn;},scrollTo(){}};
const root={querySelector:()=>box};
const doc={documentElement:{appendChild(){}},getElementById:id=>id==='xiv-root'?root:null,createElement:()=>({dataset:{},style,setAttribute(){},remove(){button=null;}}),addEventListener:(type,fn)=>{(listeners[type]||=[]).push(fn);},dispatchEvent(){}};
const slide={window:{__flowLensControl:{showAdjacent(){index++;image.src='https://media.test/'+index+'.jpg';return true;}},setTimeout:(fn,wait=0)=>{const id=nextTimer++;timers.set(id,{fn,at:now+wait});return id;},addEventListener(){},dispatchEvent(){}},document:doc,localStorage:{getItem:()=>JSON.stringify({lightboxAutoDelay:800})},MutationObserver:class{observe(){}},clearTimeout:id=>timers.delete(id),CustomEvent:class{},requestAnimationFrame:fn=>fn(),Date:class extends Date{static now(){return now;}}};
vm.runInNewContext(read('src/patches/lightbox-enhance.js'),slide);
function advance(ms){const end=now+ms;let runs=0;while(true){const first=[...timers.entries()].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!first)break;assert(++runs<1000,'timer feedback loop');now=first[1].at;timers.delete(first[0]);first[1].fn();}now=end;}
advance(0);const event={target:{closest:selector=>selector==='.xiv-lightbox-slideshow'?button:null},preventDefault(){},stopPropagation(){},stopImmediatePropagation(){}};
listeners.pointerdown.forEach(fn=>fn(event));listeners.click.forEach(fn=>fn(event));assert.equal(button.dataset.active,'true');advance(2100);assert(index>=3);listeners.click.forEach(fn=>fn(event));assert.equal(button.dataset.active,'false');const pausedIndex=index;advance(3000);assert.equal(index,pausedIndex);
console.log('PASS slideshow pointer/click starts once, advances repeatedly and pauses');

}
