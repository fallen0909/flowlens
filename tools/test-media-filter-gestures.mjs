import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const {parseHTML} = await import(process.env.FLOWLENS_TEST_DOM || 'linkedom');
const core = fs.readFileSync(new URL('../src/core/flowlens-core.js', import.meta.url), 'utf8');
const extract = name => {
  const match = core.match(new RegExp(`  (?:async )?function ${name}\\([^]*?\\n  \\}`));
  assert(match, name);return match[0];
};
const install = (context, names) => {vm.createContext(context);vm.runInContext(names.map(extract).join('\n'),context);return context;};

{
  const {document} = parseHTML('<html><body><div id="xiv-grid"><div class="xiv-masonry-column"></div><div class="xiv-masonry-column"></div><div class="xiv-masonry-column"></div></div></body></html>');
  const grid = document.getElementById('xiv-grid'), columns=[...grid.children];
  const urls=['a.jpg','b.mp4','c.jpg','d.mp4','e.jpg','f.mp4','g.jpg','h.mp4'];
  const tiles=urls.map((url,i)=>{
    const t=document.createElement('div');t.className='xiv-tile';t.dataset.index=String(i);t.dataset.url=url;t.dataset.mediaMounted='true';
    columns[i%3].appendChild(t);return t;
  });
  const released=[];
  const c=install({state:{grid,columns:3,masonryColumns:columns,masonryColumnHeights:[3,3,2],mediaFilter:'all'},window:{},
    isVideoUrl:url=>url.endsWith('.mp4'),
    setTileMediaMounted(tile,mounted){if(!mounted){tile.dataset.mediaMounted='false';released.push(tile.dataset.url);}},
    estimatedTileHeight:()=>100,masonryGap:()=>10,scheduleTileMediaReconcile(){},
  },['allTiles','mediaMatchesFilter','applyMediaFilter','compactFilteredMasonry','ensureMasonryColumns','appendTilesToMasonry','shortestColumnIndex']);
  c.state.mediaFilter='image';c.applyMediaFilter();
  assert.deepEqual(tiles.filter(t=>!t.hidden).map(t=>t.dataset.url),['a.jpg','c.jpg','e.jpg','g.jpg']);
  assert.deepEqual(released,['b.mp4','d.mp4','f.mp4','h.mp4']);
  assert.deepEqual(columns.map(col=>[...col.children].filter(t=>!t.hidden).length),[2,1,1]);
  c.state.mediaFilter='video';c.applyMediaFilter();
  assert.deepEqual(tiles.filter(t=>!t.hidden).map(t=>t.dataset.url),['b.mp4','d.mp4','f.mp4','h.mp4']);
  assert.deepEqual(columns.map(col=>[...col.children].filter(t=>!t.hidden).length),[2,1,1]);
  c.state.mediaFilter='all';c.applyMediaFilter();assert.equal(tiles.filter(t=>!t.hidden).length,8);
  assert(tiles.every(t=>grid.contains(t)));assert.equal(new Set(tiles).size,8);
  // Author display:block overrides the browser's [hidden] rule unless explicitly fixed.
  assert.match(core,/#xiv-root #xiv-grid \.xiv-tile\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  console.log('PASS image/video filtering excludes mismatched cards, releases sources, compacts remaining cards, and restores all without losing identities');
}

class Emitter {
  constructor(){this.listeners=new Map();}
  addEventListener(name,fn){const list=this.listeners.get(name)||[];list.push(fn);this.listeners.set(name,list);}
  removeEventListener(name,fn){this.listeners.set(name,(this.listeners.get(name)||[]).filter(item=>item!==fn));}
  emit(name,props={}){
    const e={pointerType:'touch',pointerId:1,isPrimary:true,button:0,clientX:100,clientY:100,claimed:false,
      preventDefault(){this.claimed=true;},stopPropagation(){},stopImmediatePropagation(){},...props};
    for(const fn of [...(this.listeners.get(name)||[])])fn(e);return e;
  }
}
function fixture(frame=false){
  let now=10000,id=0;const timers=new Map(),hints=[];
  const view=new Emitter();view.setTimeout=(fn,delay)=>{timers.set(++id,{fn,at:now+delay});return id;};
  const doc=new Emitter();doc.defaultView=view;doc.visibilityState='visible';
  const parent={appendChild(node){hints.push(node);}};
  doc.body=parent;doc.createElement=()=>({style:{},setAttribute(){},remove(){this.removed=true;}});
  const video=new Emitter();Object.assign(video,{ownerDocument:doc,dataset:{sourceAttempt:'1'},isConnected:true,style:{touchAction:'auto'},playbackRate:1.25,paused:false,ended:false,duration:600,currentTime:100,seekable:{length:1,start:()=>0,end:()=>600},getBoundingClientRect:()=>({width:400,height:300,bottom:300}),setPointerCapture(){},releasePointerCapture(){},closest:()=>frame?null:parent});
  const c=install({state:{lightbox:{dataset:{active:'true'}}},Date:class extends Date{static now(){return now;}},clearTimeout:id=>timers.delete(id)},['videoGestureSeekTime','installVideoGestures']);
  c.installVideoGestures(video);
  const advance=ms=>{now+=ms;for(const [key,t]of [...timers])if(t.at<=now){timers.delete(key);t.fn();}};
  return{video,doc,view,c,hints,timers,advance};
}
for(const frame of [false,true]){
  const f=fixture(frame),{video,advance,view,doc,c}=f;
  video.emit('pointerdown');advance(449);assert.equal(video.playbackRate,1.25);
  advance(1);assert.equal(video.playbackRate,2);assert.match(f.hints.at(-1).textContent,/2×/);
  assert(video.emit('pointerup').claimed);assert.equal(video.playbackRate,1.25);assert(video.emit('click').claimed);
  advance(800);video.currentTime=100;
  video.emit('pointerdown');video.emit('pointermove',{clientX:300});assert.equal(video.currentTime,100,'dragging should not start a network seek for every pixel');
  video.emit('pointerup',{clientX:300});assert.equal(video.currentTime,160);assert.equal(video.playbackRate,1.25);
  advance(800);video.emit('pointerdown',{clientX:300});video.emit('pointermove',{clientX:100});video.emit('pointerup',{clientX:100});assert.equal(video.currentTime,100);
  advance(800);video.currentTime=590;video.emit('pointerdown');video.emit('pointermove',{clientX:1500});video.emit('pointerup',{clientX:1500});assert(video.currentTime<600&&video.currentTime>599);
  advance(800);video.currentTime=5;video.emit('pointerdown',{clientX:300});video.emit('pointermove',{clientX:-1000});video.emit('pointerup',{clientX:-1000});assert.equal(video.currentTime,0);
  advance(800);video.emit('pointerdown');advance(450);view.emit('pointerup');assert.equal(video.playbackRate,1.25);
  advance(800);video.emit('pointerdown');advance(450);video.emit('pointercancel');assert.equal(video.playbackRate,1.25);
  advance(800);video.emit('pointerdown');advance(450);doc.visibilityState='hidden';doc.emit('visibilitychange');assert.equal(video.playbackRate,1.25);doc.visibilityState='visible';
  advance(800);video.emit('pointerdown');advance(450);view.emit('blur');assert.equal(video.playbackRate,1.25);
  advance(800);video.emit('pointerdown');video.emit('pointerdown',{pointerId:2,isPrimary:false});advance(600);assert.equal(video.playbackRate,1.25);
  advance(800);video.emit('pointerdown');video.emit('pointermove',{clientY:200});advance(500);assert.equal(video.playbackRate,1.25);assert(!video.emit('pointerup').claimed);
  advance(800);assert(!video.emit('pointerdown',{clientY:280}).claimed);advance(500);assert.equal(video.playbackRate,1.25);assert(!video.emit('pointerup',{clientY:280}).claimed);
  advance(800);video.paused=true;video.emit('pointerdown');advance(500);assert.equal(video.playbackRate,1.25);video.emit('pointerup');video.paused=false;
  advance(800);video.emit('pointerdown');advance(450);video.emit('pause');assert.equal(video.playbackRate,1.25);
  advance(800);video.emit('pointerdown');video.emit('pointermove',{clientX:300});const before=video.currentTime;video.dataset.sourceAttempt='2';video.emit('pointerup');assert.equal(video.currentTime,before);
  video.emit('pointerdown');video.__flowLensGestureCleanup();advance(500);assert.equal(video.playbackRate,1.25);assert.equal(video.style.touchAction,'auto');assert(f.hints.every(h=>h.removed));assert([...view.listeners.values()].every(list=>!list.length));
  assert.equal(c.videoGestureSeekTime({duration:Infinity},10),null);
  assert.equal(c.videoGestureSeekTime({duration:600,seekable:{length:2,start:i=>i===0?0:200,end:i=>i===0?100:300}},180),200);
  console.log(`PASS ${frame?'protected-frame':'direct'} player: 450 ms hold, restore rate, bidirectional seek on release, boundaries, native controls, multitouch, cancel, hidden/blur, source changes and teardown`);
}

{
  const timers=new Map();let id=0,plays=0;
  const context={state:{lightbox:{contains:()=>false},preferredVideoHost:''},window:{innerWidth:390,setTimeout(fn,delay){timers.set(++id,{fn,delay});return id;}},clearTimeout:id=>timers.delete(id),location:{href:'https://site.test'},URL,WeakMap,requestVideoPlayback(){plays++;},updateStatus(){}};
  vm.createContext(context);
  const source=core.slice(core.indexOf('  const videoSourceRequests'),core.indexOf('  const videoPlayRequests'));
  vm.runInContext(extract('videoSourceCandidates')+'\n'+source,context);
  const video={dataset:{allowFallback:'true'},isConnected:true,readyState:0,load(){}};
  context.setVideoSourceWithFallback(video,'https://twimg.moonchan.xyz/path/clip.mp4?token=keep',true);
  let timer=[...timers.values()].at(-1);assert.equal(timer.delay,2500);timer.fn();assert.match(video.src,/video-cf\.twimg\.com/);assert.match(video.src,/token=keep/);
  context.state.preferredVideoHost='twimg.moonchan.xyz';assert.match(context.videoSourceCandidates('https://video.twimg.com/path/clip.mp4')[0],/twimg\.moonchan\.xyz/);
  const second={dataset:{allowFallback:'true'},isConnected:true,readyState:0,load(){}};
  context.setVideoSourceWithFallback(second,'https://video.twimg.com/path/clip.mp4',true);second.readyState=1;
  timer=[...timers.values()].at(-1);const url=second.src;timer.fn();assert.equal(second.src,url);assert.equal([...timers.values()].at(-1).delay,3500);
  second.readyState=2;[...timers.values()].at(-1).fn();assert.equal(second.src,url);
  console.log('PASS mobile no-response fallback starts at 2.5s, active metadata gets a grace period, successful host is preferred and URL tokens remain intact');
}
