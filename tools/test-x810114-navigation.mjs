import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const {parseHTML}=await import(process.env.FLOWLENS_TEST_DOM||'linkedom');
const core=fs.readFileSync(new URL('../src/core/flowlens-core.js',import.meta.url),'utf8');
const extract=name=>{const match=core.match(new RegExp(`  (?:async )?function ${name}\\([^]*?\\n  \\}`));assert(match,name);return match[0];};
const install=(c,names)=>{vm.createContext(c);vm.runInContext(names.map(extract).join('\n'),c);return c;};
const base='https://x.810114.xyz/';
const sidebar=['huanguoai','JaimeM0220','SLZJTT','zhaozhaoQwQo','beautypyt','rabbit111520','jasperimage1'].map(name=>base+name);
const stale=[...sidebar.slice(0,3),base+'UnavailableOldUser',...sidebar.slice(4),base+'OldOtherUser'];
const normalizedPageUrl=url=>new URL(url,base).href;
const profile=(name,count)=>({username:name,account_info:{nick:name},total_urls:count,timeline:Array.from({length:count},(_,i)=>({type:i%3?'photo':'video',url:i%3?`https://pbs.twimg.com/media/${name}-${i}?format=jpg&name=orig`:`https://video.twimg.com/videos/${name}-${i}.mp4`}))});
{
  const state={galleryQueueCurrentUrl:base+'SLZJTT',galleryQueue:stale,x810114ActiveSidebarQueue:sidebar};
  const c=install({state,document:{},location:{href:base+'SLZJTT'},normalizedPageUrl,isGenericX810114Page:()=>true,isQueueCandidateUrl:()=>true,
    samePageUrl:(a,b)=>a===b,readStoredGalleryQueue:()=>stale},['activeGalleryQueueUrl','galleryQueueIndexForUrl','x810114QueueTarget']);
  assert.equal(c.x810114QueueTarget(1),base+'zhaozhaoQwQo');assert.equal(c.x810114QueueTarget(-1),base+'JaimeM0220');
  state.galleryQueueCursorUrl=base+'zhaozhaoQwQo';assert.equal(c.x810114QueueTarget(1),base+'beautypyt');
  state.pendingGalleryUrl=base+'beautypyt';assert.equal(c.x810114QueueTarget(1),base+'rabbit111520');
  console.log('PASS SLZJTT uses visible sidebar order instead of a longer stale queue, including previous and rapid-next targets');
}

{
  const doc={documentElement:{dataset:{xivBase:base+'SLZJTT'}}};
  const state={galleryQueueCurrentUrl:base+'SLZJTT'};
  const c=install({state,document:doc,location:{href:base+'SLZJTT'},normalizedPageUrl,samePageUrl:(a,b)=>a===b,sameGalleryPage:()=>false,
    rememberGalleryQueueTitles(){},readStoredGalleryQueue:()=>stale,collectGalleryQueueFromDocument:()=>sidebar,collectX810114SidebarProfileQueue:()=>sidebar,
    isX810114Url:()=>true,isQueueCandidateUrl:()=>true,isPornpicsLanguageMirror:()=>false,galleryQueueDedupeKey:url=>url.toLowerCase(),writeStoredGalleryQueue(){},syncGalleryQueueButtons(){}
  },['activeGalleryQueueUrl','galleryQueueIndexForUrl','refreshGalleryQueue']);
  c.refreshGalleryQueue(doc,base+'SLZJTT');assert.deepEqual(Array.from(state.galleryQueue),sidebar);assert.equal(state.galleryQueueIndex,2);
  console.log('PASS live sidebar refresh replaces obsolete cached entries and keeps SLZJTT at the correct index');
}

function apiContext(overrides={}){
  return install({URL,Date,AbortController,DOMException,setTimeout,clearTimeout,encodeURIComponent,
    x810114ProfileName:url=>new URL(url).pathname.slice(1),fetchTextViaBackground:async()=>({ok:false,error:'background unavailable'}),...overrides
  },['waitWithSignal','fetchX810114ProfileData']);
}
{
  const calls=[];
  const c=apiContext({fetch:async url=>{calls.push(url);return{ok:true,json:async()=>profile('zhaozhaoQwQo',45)};}});
  const d=await c.fetchX810114ProfileData(base+'zhaozhaoQwQo',new AbortController().signal);assert.equal(d.timeline.length,45);assert.equal(calls.length,1);assert.match(calls[0],/\/v2\/users\/zhaozhaoQwQo\/timeline/);
  const fallback=apiContext({fetch:async url=>url.includes('/v2/')?{ok:false,status:404}:{ok:true,json:async()=>profile('SLZJTT',180)}});
  assert.equal((await fallback.fetchX810114ProfileData(base+'SLZJTT')).timeline.length,180);
  const bridge=apiContext({fetch:async()=>{throw TypeError('Failed to fetch');},fetchTextViaBackground:async()=>({ok:true,text:JSON.stringify(profile('zhaozhaoQwQo',45))})});
  assert.equal((await bridge.fetchX810114ProfileData(base+'zhaozhaoQwQo')).timeline.length,45);
  const mismatch=apiContext({fetch:async()=>({ok:true,json:async()=>profile('OtherUser',1)})});
  await assert.rejects(mismatch.fetchX810114ProfileData(base+'SLZJTT'),/其他分组|备用/);
  console.log('PASS V2 and legacy schemas, cross-origin background recovery and response identity checks');
}
{
  const controller=new AbortController();let calls=0;
  const c=apiContext({fetch:async(_,options)=>{calls++;return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('abort','AbortError'))));}});
  const pending=c.fetchX810114ProfileData(base+'SLZJTT',controller.signal);controller.abort();await assert.rejects(pending,error=>error.name==='AbortError');assert.equal(calls,1);
  const timers=new Map();let timerId=0;
  const timed=apiContext({setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),fetch:async(url,options)=>{
    if(!url.includes('/v2/'))return{ok:true,json:async()=>profile('SLZJTT',180)};
    return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('timeout','AbortError'))));
  }});
  const bounded=timed.fetchX810114ProfileData(base+'SLZJTT');[...timers.values()][0]();assert.equal((await bounded).timeline.length,180);assert.equal(timers.size,0);
  console.log('PASS cancelled requests stop fallback work; a timed-out V2 request can recover through legacy without leaving timers');
}

{
  const {document}=parseHTML('<html><body></body></html>');
  const state={active:true,navigationGeneration:0,gallerySwitchGeneration:0,galleryQueueCurrentUrl:base+'SLZJTT',galleryQueue:sidebar,x810114ActiveSidebarQueue:sidebar,images:['old'],root:{dataset:{}},fetchedPages:new Set(),pageUrls:new Set(),settings:{autoFullscreen:false}};
  let failNext=false;const calls=[],location={href:base+'SLZJTT',origin:'https://x.810114.xyz'};
  const c=install({state,document,location,URL,Date,AbortController,DOMException,setTimeout,clearTimeout,encodeURIComponent,normalizedPageUrl,
    samePageUrl:(a,b)=>a===b,isQueueCandidateUrl:()=>true,isSelfieGalleryQueueUrl:()=>false,GENERIC_X810114_RE:/^https:\/\/x\.810114\.xyz/,isGenericX810114Page:()=>true,
    x810114ProfileName:url=>new URL(url).pathname.slice(1),isBlockedPromoItem:()=>false,MEDIA_EXT:/(?:\.mp4(?:[?#]|$)|format=jpg)/,
    normalizeX810114VideoUrl:url=>url,x810114PosterUrl:()=>'',addImage(url){state.images.push(url);return true;},renderImages(){},updateStatus(text){state.statusText=text;},
    fetch:async url=>{calls.push(url);if(failNext)throw Error('offline');const name=decodeURIComponent(url.match(/\/users\/([^/]+)\/timeline/)[1]);return{ok:true,json:async()=>profile(name,name==='zhaozhaoQwQo'?45:247)};},
    fetchTextViaBackground:async()=>({ok:false,error:'offline'}),fetchHtml(){throw Error('React HTML shell must not be used as the group data');},
    DOMParser:class{parseFromString(html){return parseHTML(html).document;}},history:{pushState(_,__,url){location.href=url;}},
    saveViewerPosition(){},closeLightbox(){},stopGenericObserver(){},resetCollection(){state.images=[];},collectFromDocument(){throw Error('Old document reused');},refreshGalleryQueue(){},applyMediaFilter(){},updateCounter(){},
    rememberX810114QueueVisit(){},sessionStorage:{removeItem(){},setItem(){}},CustomEvent:class{},window:{dispatchEvent(){}}
  },['activeGalleryQueueUrl','galleryQueueIndexForUrl','x810114MediaUrl','waitWithSignal','fetchX810114ProfileData','applyX810114ProfileData','beginGalleryNavigation','switchGalleryTarget','loadGalleryQueueTargetInPlace']);
  assert.equal(await c.switchGalleryTarget(base+'zhaozhaoQwQo'),true);assert.equal(state.images.length,45);assert.equal(state.galleryQueueCurrentUrl,base+'zhaozhaoQwQo');
  failNext=true;assert.equal(await c.switchGalleryTarget(base+'beautypyt'),false);assert.equal(state.images.length,45);assert.equal(state.galleryQueueCursorUrl,base+'beautypyt');
  failNext=false;assert.equal(await c.switchGalleryTarget(base+'rabbit111520'),true);assert.equal(state.galleryQueueCursorUrl,'');assert.equal(state.images.length,247);
  assert.match(calls[0],/\/users\/zhaozhaoQwQo\/timeline/);assert(!state.images.some(url=>url.includes('SLZJTT')));
  console.log('PASS API-only in-place SLZJTT→next group, failure preserves current media and advances cursor, later success clears cursor without reusing the old page');
}

{
  const background=fs.readFileSync(new URL('../apps/extension/background.js',import.meta.url),'utf8');
  const code=background.slice(background.indexOf('async function fetchText('),background.indexOf('async function fetchImage('));
  const c={TextDecoder,MAX_TEXT_BYTES:8*1024*1024,requestContext:()=>({target:{href:'https://api.test/'}}),fetchLimited:async(url,options,limit,accept)=>{
    assert(accept('application/json'));assert(accept('application/json; charset=utf-8'));assert(accept('application/problem+json'));assert(!accept('video/mp4'));
    assert.equal(limit,8*1024*1024);return{contentType:'application/json',buffer:new TextEncoder().encode('{"timeline":[]}')};
  }};
  vm.createContext(c);vm.runInContext(code,c);assert.equal((await c.fetchText('https://api.test/')).text,'{"timeline":[]}');
  console.log('PASS extension text bridge accepts bounded JSON API responses while excluding media');
}
