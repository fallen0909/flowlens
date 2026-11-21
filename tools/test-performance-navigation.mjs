// Set FLOWLENS_TEST_DOM to an installed linkedom module URL, or install it in tools.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const { parseHTML } = await import(process.env.FLOWLENS_TEST_DOM || 'linkedom');
const core = fs.readFileSync(new URL('../src/core/flowlens-core.js', import.meta.url), 'utf8');
const extract = name => {
  const match = core.match(new RegExp(`  (?:async )?function ${name}\\([^]*?\\n  \\}`));
  assert(match, name); return match[0];
};
const install = (context, names) => { vm.createContext(context); vm.runInContext(names.map(extract).join('\n'), context); return context; };
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise, resolve, reject}; };
const nextTurn = () => new Promise(resolve => setImmediate(resolve));

{
  const {document} = parseHTML('<html><head></head><body><div id="xiv-grid"></div></body></html>');
  const grid = document.getElementById('xiv-grid');
  const storage = new Map(); let reads=0, geometry=0, candidates=0, callback, timer=0;
  const timers = new Map();
  const c = install({document, URL, location:new URL('https://gallery.test/'),
    localStorage:{getItem(key){reads++;return storage.get(key)||null;},setItem:(key,value)=>storage.set(key,value)},
    MutationObserver:class{constructor(fn){callback=fn;}observe(){}},
    setTimeout(fn){timers.set(++timer,fn);return timer;},clearTimeout:id=>timers.delete(id),
    CustomEvent:class{},window:{dispatchEvent(){},addEventListener(){}},
    state:{grid},mediaMatchesFilter:()=>true,layoutMasonry(){}
  }, ['allTiles','applyMediaFilter']);
  c.window.__flowLensControl={refreshMediaFilter(tiles){candidates+=tiles.length;c.applyMediaFilter(tiles);}};
  const tile = i => {
    const node=document.createElement('div');node.className='xiv-tile';node.dataset.index=String(i);node.dataset.url=`https://media.test/${i}.jpg`;
    node.getBoundingClientRect=()=>{geometry++;return {width:300,height:400};};grid.appendChild(node);return node;
  };
  for(let i=0;i<3000;i++)tile(i);
  vm.runInContext(fs.readFileSync(new URL('../src/patches/media-filter-center.js',import.meta.url),'utf8'),c);
  const flush=()=>{for(const [id,fn] of [...timers]){timers.delete(id);fn();}};
  flush();
  assert.equal(reads,1);assert.equal(geometry,0);assert.equal(candidates,3000);
  const added=tile(3000);candidates=0;
  callback([{addedNodes:[added]}]);flush();
  assert.equal(candidates,1);assert.equal(reads,1);assert.equal(geometry,0);
  c.window.__flowLensMediaFilter.writeConfig({terms:'/3000.jpg'});flush();assert(added.hidden);
  c.window.__flowLensMediaFilter.writeConfig({enabled:false});flush();assert(!added.hidden);
  console.log('PASS 3000 cards: one configuration read, zero layout reads; an added card filters only itself; rule changes and disabling restore visibility');
}

{
  const nodes=new Set();
  const c=install({state:{mediaPreloadCache:new Map()},Date,
    Image:class {constructor(){this.tagName='IMG';nodes.add(this);}removeAttribute(){nodes.delete(this);}},
    keyForUrl:url=>url,isVideoUrl:url=>url.endsWith('.mp4'),shouldKeepReferrer:()=>false
  },['clearOldMediaPreloads','preloadLightboxImage']);
  for(let i=0;i<1000;i++)c.preloadLightboxImage(`https://media.test/${i}.jpg`);
  c.preloadLightboxImage('https://media.test/next.mp4');
  assert(c.state.mediaPreloadCache.size<=16);assert(nodes.size<=16);
  assert(!c.state.mediaPreloadCache.has('https://media.test/next.mp4'));
  c.clearOldMediaPreloads(true);assert.equal(nodes.size,0);assert.equal(c.state.mediaPreloadCache.size,0);
  assert(!fs.readFileSync(new URL('../src/patches/lightbox-ios-smooth.js',import.meta.url),'utf8').includes('new Map('));
  console.log('PASS nearby image preloads are capped, never start competing video loads, and release on teardown');
}

{
  const warmed=[];let callback;
  const c=install({state:{images:['0.jpg','1.mp4','2.jpg','3.mp4','4.jpg','5.mp4','6.jpg','7.mp4'],index:0,lightbox:{dataset:{active:'true'}}},
    setTimeout(fn){callback=fn;return 1;},clearTimeout(){},keyForUrl:url=>url,mediaMatchesFilter:url=>url.endsWith('.jpg'),preloadLightboxImage(url){warmed.push(url);}
  },['scheduleLightboxMediaPreload']);
  c.scheduleLightboxMediaPreload(3);callback();assert.deepEqual(warmed,['4.jpg','6.jpg','2.jpg']);
  console.log('PASS filtered preloading chooses the next two eligible items and previous item without skipping odd/even positions');
}

function navigationContext() {
  const {document}=parseHTML('<html><body><img src="https://media.test/old.jpg"></body></html>');
  const pending=new Map(), messages=[], history=[];
  const state={active:true,navigationGeneration:0,gallerySwitchGeneration:0,pendingGalleryUrl:'',galleryQueueCurrentUrl:'https://gallery.test/a',galleryQueue:['https://gallery.test/a','https://gallery.test/b','https://gallery.test/c'],galleryQueueIndex:0,images:['old.jpg'],root:{dataset:{}},fetchedPages:new Set(),pageUrls:new Set(),settings:{autoFullscreen:false},galleryDocument:document,galleryDocumentUrl:'https://gallery.test/a'};
  const c=install({state,document,URL,Date,AbortController,DOMException,
    location:{href:'https://gallery.test/a',origin:'https://gallery.test'},history:{pushState(_,__,url){history.push(url);}},
    normalizedPageUrl:url=>url,samePageUrl:(a,b)=>a===b,isQueueCandidateUrl:()=>true,isKnownGalleryUrl:()=>false,
    isSelfieGalleryQueueUrl:()=>false,GENERIC_X810114_RE:/never/,isGenericX810114Page:()=>false,
    isXchinaPhotoUrl:()=>false,isPornpicsGalleryPage:()=>false,isPhotoGalleryPage:()=>false,
    absoluteUrl:(url,base)=>url?new URL(url,base).href:'',imageCandidateFromImg:node=>node.getAttribute('src'),mediaCandidateFromVideo:node=>node.getAttribute('src'),
    isGoodImage:url=>!!url&&url.endsWith('.jpg'),backgroundImageUrls:()=>[],
    DOMParser:class{parseFromString(html){return parseHTML(html).document;}},
    fetchHtml(url){const request=deferred();pending.set(url,request);return request.promise;},
    saveViewerPosition(){},closeLightbox(){},stopGenericObserver(){},resetCollection(){state.images=[];},
    collectFromDocument(doc,base){state.images=[...doc.querySelectorAll('img')].map(n=>n.getAttribute('src'));state.galleryDocument=doc;state.galleryDocumentUrl=base;},
    refreshGalleryQueue(){},rebuildGalleryQueueFromVisiblePage(){},x810114QueueTarget:()=>'',renderImages(){},applyMediaFilter(){},updateCounter(){},
    pageTitleFromDocument:()=>'',updateStatus:message=>messages.push(message),rememberX810114QueueVisit(){},
    sessionStorage:{removeItem(){},setItem(){}},CustomEvent:class{},window:{dispatchEvent(){}}
  },['beginGalleryNavigation','galleryDocumentHasMedia','switchGalleryTarget','loadGalleryQueueTargetInPlace','galleryQueueIndexForUrl','activeGalleryQueueUrl','galleryQueueTarget','navigateGalleryQueue']);
  return {c,state,pending,messages,history,document};
}
{
  const {c,state,pending,history}=navigationContext();
  const first=c.navigateGalleryQueue(1);const oldSignal=state.navigationController.signal;
  const second=c.navigateGalleryQueue(1);
  assert(oldSignal.aborted);assert.equal(state.pendingGalleryUrl,'https://gallery.test/c');
  pending.get('https://gallery.test/c').resolve('<html><body><img src="https://media.test/c.jpg"></body></html>');assert.equal(await second,true);
  pending.get('https://gallery.test/b').reject(new Error('late old request'));assert.equal(await first,false);
  assert.equal(state.galleryQueueCurrentUrl,'https://gallery.test/c');assert.deepEqual(state.images,['https://media.test/c.jpg']);assert.deepEqual(history,['https://gallery.test/c']);
  assert.equal(c.location.href,'https://gallery.test/a');assert.equal(state.pendingGalleryUrl,'');
  const empty=c.switchGalleryTarget('https://gallery.test/b');pending.get('https://gallery.test/b').resolve('<html><body>empty or challenge page</body></html>');assert.equal(await empty,false);
  assert.deepEqual(state.images,['https://media.test/c.jpg']);assert.equal(history.length,1);
  const closed=c.switchGalleryTarget('https://gallery.test/b');state.active=false;state.navigationGeneration++;state.navigationController.abort();
  pending.get('https://gallery.test/b').resolve('<html><body><img src="https://media.test/b.jpg"></body></html>');assert.equal(await closed,false);assert.equal(history.length,1);
  console.log('PASS rapid A→B→C commits only C; late B failure cannot navigate; empty pages and close-during-load retain the current group');
}

{
  const oldDoc={id:'old'},currentDoc={id:'current'},seen=[];
  const state={galleryDocument:currentDoc,galleryDocumentUrl:'https://gallery.test/b',galleryQueueCurrentUrl:'https://gallery.test/b'};
  const c=install({state,document:oldDoc,location:{href:'https://gallery.test/a'},normalizedPageUrl:url=>url,samePageUrl:(a,b)=>a===b,sameGalleryPage:()=>false,
    rememberGalleryQueueTitles(doc){seen.push(doc);},readStoredGalleryQueue:()=>[],collectGalleryQueueFromDocument:(doc,base)=>{assert.equal(doc,currentDoc);assert.equal(base,state.galleryDocumentUrl);return [];},
    isX810114Url:()=>false,isXchinaPhotoUrl:()=>false,isQueueCandidateUrl:()=>true,isPornpicsLanguageMirror:()=>false,galleryQueueDedupeKey:url=>url,
    genericAdjacentLinksFromDocument:doc=>{assert.equal(doc,currentDoc);return {previous:'https://gallery.test/a',next:'https://gallery.test/c'};},writeStoredGalleryQueue(){},syncGalleryQueueButtons(){}
  },['activeGalleryQueueUrl','galleryQueueIndexForUrl','refreshGalleryQueue']);
  c.refreshGalleryQueue();assert.deepEqual(Array.from(state.galleryQueue),['https://gallery.test/a','https://gallery.test/b','https://gallery.test/c']);assert.equal(state.galleryQueueIndex,1);
  console.log('PASS queue refresh reads the active group document instead of the old host page');
}

{
  const c=install({URL,location:new URL('https://gallery.test/gallery/a.html'),SELFIE_GALLERY_PATH_RE:/never/},['isQueueCandidateUrl']);
  for(const url of ['https://gallery.test/media/001.jpg','https://gallery.test/photo/002.webp?quality=90','https://gallery.test/videos/clip.mp4']) assert.equal(c.isQueueCandidateUrl(url),false);
  assert(c.isQueueCandidateUrl('https://gallery.test/gallery/b.html'));
  console.log('PASS direct images and videos cannot enter the gallery navigation queue');
}

{
  const source={name:'current C document'},host={name:'old A document',documentElement:{classList:{add(){}}}};
  const state={galleryDocument:source,galleryDocumentUrl:'https://gallery.test/c',viewerClosedAtUrl:'https://gallery.test/c',galleryQueueCurrentUrl:'',navigationGeneration:0,images:[],root:{dataset:{}},fetchedPages:new Set(),pageUrls:new Set(),settings:{autoFullscreen:false}};
  const c=install({state,document:host,location:{href:'https://gallery.test/c'},Date,
    ensureUi(){},isSupportedPage:()=>true,resetCollection(){state.images=[];},normalizedPageUrl:url=>url,pageTitleFromDocument:()=>'',startViewerPositionRestore(){},closeHostPhotoViewer(){},startHostOverlayGuard(){},isGenericX810114Page:()=>false,acquirePageLock(){},isPhotoGalleryPage:()=>false,
    collectFromDocument(doc,url){assert.equal(doc,source);assert.equal(url,'https://gallery.test/c');state.images=['C.jpg'];},startGenericObserver(){throw Error('must not observe old host document');}
  },['openViewer']);
  await c.openViewer();assert.equal(state.galleryQueueCurrentUrl,'https://gallery.test/c');assert.deepEqual(state.images,['C.jpg']);
  console.log('PASS closing and reopening an in-place gallery uses its retained document, not the original host page');
}

{
  let requestCount=0;const request=deferred();
  const state={highResByImage:new Map(),highResPending:new Map(),photoShowByImage:new Map(),detailByImage:new Map([['thumb','detail']]),collectionGeneration:1,collectionController:new AbortController()};
  const c=install({state,keyForUrl:url=>url,siteAlbumOriginalImageUrl:url=>url,siteAlbumDerivedImageCandidates:()=>[],isFavoriteImageUrl:()=>true,isDetailPhotoPage:()=>false,
    activeGalleryQueueUrl:()=> 'https://gallery.test/a',updateStatus(){},fetchHtml(){requestCount++;return request.promise;},
    DOMParser:class{parseFromString(){return {}; }},isPhotoShowPage:()=>false,findPhotoShowUrl:()=>'',detailImageCandidates:()=>['full.jpg'],chooseLargestImage:async()=> 'full.jpg'
  },['resolveHighResUrl','resolveHighResUncached']);
  const a=c.resolveHighResUrl('thumb'),b=c.resolveHighResUrl('thumb');assert.equal(requestCount,1);
  state.collectionGeneration++;state.collectionController.abort();state.highResPending.clear();request.resolve('<html></html>');
  await Promise.all([a,b]);assert.equal(state.highResByImage.size,0);
  console.log('PASS identical high-resolution requests share one fetch; old-group results cannot populate the new cache');
}

{
  let yields=0;
  const c=install({TextEncoder,Uint8Array,Blob,Date,sleep:async()=>{yields++;await nextTurn();}},['crc32','crc32Async','writeU16','writeU32','dosTimeDate','makeZip']);
  const bytes=new Uint8Array(8*1024*1024);for(let i=0;i<bytes.length;i+=97)bytes[i]=i%251;
  const zip=await c.makeZip([{name:'image.jpg',data:bytes}]);
  const data=new Uint8Array(await zip.arrayBuffer()),view=new DataView(data.buffer);
  assert(yields>=8);assert.equal(view.getUint32(0,true),0x04034b50);assert.equal(view.getUint32(14,true),c.crc32(bytes));
  const offset=30+view.getUint16(26,true);assert.deepEqual(data.slice(offset,offset+bytes.length),bytes);
  const controller=new AbortController();c.sleep=async()=>controller.abort();
  await assert.rejects(c.makeZip([{name:'image.jpg',data:bytes}],controller.signal),error=>error.name==='AbortError');
  console.log('PASS ZIP remains byte-correct while yielding every MiB; cancellation interrupts packing');
}

{
  const saved=[],failures=[],requests=[];
  const state={active:true,collectionGeneration:1,downloadFailures:[],downloadPanel:null};
  const c=install({state,AbortController,DOMException,Date,Blob,
    waitForGalleryFetch:async()=>{},urlsForScope:()=>['a','b','bad','c'],resolveHighResUrl:async url=>url,
    fetchImageBytes:async url=>{requests.push(url);if(url==='bad')throw Error('HTTP 500');return {bytes:{length:33*1024*1024},contentType:'image/jpeg'};},
    extensionFromUrl:()=> 'jpg',makeZip:async files=>{saved.push(files.map(f=>f.name));return new Blob();},saveDownloadBlob:async()=>{},
    updateStatus(){},showDownloadTask(text){failures.push(text);}
  },['waitWithSignal','downloadZip']);
  await c.downloadZip();assert.equal(saved.length,3);assert.equal(state.downloadFailures.length,1);assert.equal(state.downloadFailures[0].url,'bad');
  requests.length=0;await c.downloadZip('retry');assert.deepEqual(requests,['bad']);assert.equal(state.downloading,false);
  console.log('PASS downloads split before the 64 MiB threshold and retry only failed URLs');
}

{
  const state={active:true,collectionGeneration:1,downloadFailures:[],downloadPanel:null};
  const pending=deferred();let requests=0,packed=0;
  const c=install({state,AbortController,DOMException,Date,Blob,
    waitForGalleryFetch:async()=>{},urlsForScope:()=>['a','b'],resolveHighResUrl:async url=>url,
    fetchImageBytes:async()=>{requests++;return pending.promise;},extensionFromUrl:()=> 'jpg',makeZip:async()=>{packed++;},saveDownloadBlob:async()=>{},updateStatus(){},showDownloadTask(){}
  },['waitWithSignal','downloadZip']);
  const running=c.downloadZip();await nextTurn();state.downloadController.abort();pending.resolve({bytes:new Uint8Array(4)});await running;
  assert.equal(requests,1);assert.equal(packed,0);assert.equal(state.downloading,false);
  console.log('PASS cancelling an in-flight download prevents further downloads and packing');
}
