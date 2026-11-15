import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const {parseHTML}=await import(process.env.FLOWLENS_TEST_DOM||'linkedom');
const core=fs.readFileSync(new URL('../src/core/flowlens-core.js',import.meta.url),'utf8');
const extract=name=>{const match=core.match(new RegExp(`  (?:async )?function ${name}\\([^]*?\\n  \\}`));assert(match,name);return match[0];};
const install=(c,names)=>{vm.createContext(c);vm.runInContext(names.map(extract).join('\n'),c);return c;};
const base='https://x.810114.xyz/';
const sidebar=['huangguoai','JaimeM0220','SLZJTT','zhaozhaoQwQo','beautypyt','rabbit111520','jasperimage1'].map(name=>base+name);
const stale=[...sidebar.slice(0,3),base+'UnavailableOldUser',...sidebar.slice(4),base+'OldOtherUser'];
const normalizedPageUrl=url=>new URL(url,base).href;
const profile=(name,count)=>({username:name,account_info:{nick:name},total_urls:count,timeline:Array.from({length:count},(_,i)=>({type:i%3?'photo':'video',url:i%3?`https://pbs.twimg.com/media/${name}-${i}?format=jpg&name=orig`:`https://video.twimg.com/videos/${name}-${i}.mp4`}))});
let renderedSidebar;
{
  // The live React bundle uses children: ["@", username, mediaCount]. Keep
  // these as separate Text nodes and provide NodeFilter so the old browser
  // TreeWalker path runs, rather than linkedom's accidental catch fallback.
  const {document}=parseHTML('<html><body><div id="xiv-root"><div>@PluginOnly</div><div>@WrongQueue</div></div><aside class="bg-white border-l"></aside><footer>DMCA@moonchan.xyz</footer></body></html>');
  const rail=document.querySelector('aside');
  sidebar.forEach((url,i)=>{
    const card=document.createElement('div');card.className='flex items-center bg-gray-100 rounded-lg cursor-pointer';
    const nick=document.createElement('span');nick.textContent=['黄果短剧','甜甜','少萝之家','昭昭','美縫有約','今天也紫薇了','JASPERIMAGE'][i];
    const handle=document.createElement('span');
    handle.append(document.createTextNode('@'),document.createTextNode(new URL(url).pathname.slice(1)));
    if(i<4)handle.append(document.createTextNode(' · '+[332,9,180,45][i]+' 媒体'));
    card.append(nick,handle);rail.append(card);
  });
  const c=install({document,window:{NodeFilter:{SHOW_TEXT:4},innerWidth:1400}},['collectX810114SidebarProfileQueue']);
  renderedSidebar=Array.from(c.collectX810114SidebarProfileQueue());assert.deepEqual(renderedSidebar,sidebar);
  assert.deepEqual(Array.from(c.collectX810114SidebarProfileQueue(document)),sidebar);
  // Single loaded card also replaces a polluted historical queue.
  [...rail.children].slice(1).forEach(el=>el.remove());
  assert.deepEqual(Array.from(c.collectX810114SidebarProfileQueue()),[sidebar[0]]);
  console.log('PASS real React split handle nodes, unloaded Latin-name cards, plugin/footer exclusion and single-card fallback');
}
{
  const state={galleryQueueCurrentUrl:base+'SLZJTT',galleryQueue:stale,x810114ActiveSidebarQueue:renderedSidebar};
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
    fetchTextViaBackground:async()=>({ok:false,error:'background unavailable'}),...overrides
  },['x810114ProfileName','waitWithSignal','fetchX810114ProfileData']);
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
  let liveFetch=globalThis.fetch;
  const live=process.env.FLOWLENS_LIVE_X810114==='1';
  // Optional CLI transport for machines where Python honours the network proxy
  // but Node's fetch does not. Requests still hit the actual public endpoints.
  if(live&&process.env.FLOWLENS_LIVE_PYTHON==='1'){
    const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');
    const run=promisify(execFile);
    liveFetch=async(url,options)=>{
      const code='import urllib.request,urllib.error,json,sys\ntry:\n r=urllib.request.urlopen(urllib.request.Request(sys.argv[1],headers={"User-Agent":"Mozilla/5.0","Accept":"application/json"}),timeout=7)\nexcept urllib.error.HTTPError as e:\n r=e\nprint(json.dumps({"status":r.status,"body":r.read().decode("utf-8")}))';
      const {stdout}=await run('python',['-c',code,url],{signal:options.signal,maxBuffer:8*1024*1024});
      const result=JSON.parse(stdout);return{ok:result.status>=200&&result.status<300,status:result.status,json:async()=>JSON.parse(result.body)};
    };
  }
  const c=install({state,document,location,URL,Date,AbortController,DOMException,setTimeout,clearTimeout,encodeURIComponent,normalizedPageUrl,readStoredGalleryQueue:()=>stale,
    samePageUrl:(a,b)=>a===b,isQueueCandidateUrl:()=>true,isSelfieGalleryQueueUrl:()=>false,GENERIC_X810114_RE:/^https:\/\/x\.810114\.xyz/,isGenericX810114Page:()=>true,
    BLOCKED_PROMO_TEXT_RE:vm.runInNewContext(core.match(/  const BLOCKED_PROMO_TEXT_RE = ([^\n]+);/)[1]),MEDIA_EXT:vm.runInNewContext(core.match(/  const MEDIA_EXT = ([^\n]+);/)[1]),
    normalizeX810114VideoUrl:url=>url,x810114PosterUrl:()=>'',addImage(url){state.images.push(url);return true;},renderImages(){},updateStatus(text){state.statusText=text;},
    fetch:async(url,options)=>{calls.push(url);if(failNext)throw Error('offline');if(live)return liveFetch(url,options);const name=decodeURIComponent(url.match(/\/users\/([^/]+)\/timeline/)[1]);return{ok:true,json:async()=>profile(name,name==='zhaozhaoQwQo'?45:247)};},
    fetchTextViaBackground:async()=>({ok:false,error:'offline'}),fetchHtml(){throw Error('React HTML shell must not be used as the group data');},
    DOMParser:class{parseFromString(html){return parseHTML(html).document;}},history:{pushState(_,__,url){location.href=url;}},
    saveViewerPosition(){},closeLightbox(){},stopGenericObserver(){},resetCollection(){state.images=[];},collectFromDocument(){throw Error('Old document reused');},refreshGalleryQueue(){},applyMediaFilter(){},updateCounter(){},
    rememberX810114QueueVisit(){},sessionStorage:{removeItem(){},setItem(){}},CustomEvent:class{},window:{dispatchEvent(){}}
  },['activeGalleryQueueUrl','galleryQueueIndexForUrl','x810114QueueTarget','x810114ProfileName','isBlockedPromoItem','x810114MediaUrl','waitWithSignal','fetchX810114ProfileData','applyX810114ProfileData','beginGalleryNavigation','switchGalleryTarget','loadGalleryQueueTargetInPlace']);
  if(live){
    // Drive next/previous using the queue produced by the real DOM collector.
    state.x810114ActiveSidebarQueue=renderedSidebar;
    assert.equal(await c.switchGalleryTarget(sidebar[0]),true);
    for(const url of [...sidebar.slice(1),sidebar[0]]){
      assert.equal(c.x810114QueueTarget(1),url);assert.equal(await c.switchGalleryTarget(url),true,state.statusText);
      assert(state.images.length>0);console.log('LIVE NEXT',new URL(url).pathname,state.images.length);
    }
    assert.equal(c.x810114QueueTarget(-1),sidebar.at(-1));
    assert.equal(await c.switchGalleryTarget(c.x810114QueueTarget(-1)),true);console.log('LIVE PREVIOUS',new URL(location.href).pathname,state.images.length);
    calls.length=0;
  }
  assert.equal(await c.switchGalleryTarget(base+'zhaozhaoQwQo'),true);assert(state.images.length>0);if(!live)assert.equal(state.images.length,45);assert.equal(state.galleryQueueCurrentUrl,base+'zhaozhaoQwQo');
  const retainedImages=[...state.images];
  failNext=true;assert.equal(await c.switchGalleryTarget(base+'beautypyt'),false);assert.deepEqual(state.images,retainedImages);assert.equal(state.galleryQueueCursorUrl,base+'beautypyt');
  failNext=false;assert.equal(await c.switchGalleryTarget(base+'rabbit111520'),true);assert.equal(state.galleryQueueCursorUrl,'');assert(state.images.length>0);if(!live)assert.equal(state.images.length,247);
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
