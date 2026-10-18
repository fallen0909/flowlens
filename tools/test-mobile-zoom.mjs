import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const core = fs.readFileSync(process.env.FLOWLENS_ZOOM_CORE_SOURCE || new URL('../src/core/flowlens-core.js', import.meta.url), 'utf8');
const mobile = fs.readFileSync(process.env.FLOWLENS_MOBILE_CENTER_SOURCE || new URL('../src/mobile/mobile-center.js', import.meta.url), 'utf8');
const names = ['actualZoomCssSize','prepareActualZoomMedia','centerActualLightboxMedia','toggleLightboxZoom','syncLightboxZoomButton','onLightboxClick'];
const coreFunctions = names.map(name => {
  const found = core.match(new RegExp(`  function ${name}\\([^]*?\\n  \\}`));
  assert(found,name); return found[0];
}).join('\n');
function setup({width=900,height=1200,dpr=3,loaded=true}={}) {
  let now=0,id=0,observer;
  const timers=new Map(),windowEvents={},events={},positionWrites=[];
  const style=()=>{
    const props=new Map();
    return {setProperty:(k,v)=>props.set(k,v),getPropertyValue:k=>props.get(k)||'',removeProperty:k=>props.delete(k)};
  };
  const img={tagName:'IMG',isConnected:true,complete:loaded,naturalWidth:width,naturalHeight:height,
    src:'https://media.test/one.jpg',currentSrc:'https://media.test/one.jpg',dataset:{sourceUrl:'https://media.test/one.jpg'},style:style(),
    addEventListener(type,fn,options){(events[type]||=[]).push({fn,once:options?.once});},
    getBoundingClientRect(){return {width:400,height:533};},closest:()=>lb};
  let currentImage=img;
  const button={dataset:{},setAttribute(){},innerHTML:'',title:''};
  button.closest=selector=>selector==='.xiv-lightbox-zoom'?button:null;
  const lb={id:'xiv-lightbox',isConnected:true,dataset:{active:'true',zoom:'fit',openToken:'open-1'},clientWidth:400,clientHeight:600,scrollLeft:0,scrollTop:0,
    querySelector(selector){return selector==='.xiv-lightbox-zoom'?button:currentImage;},
    contains:target=>target===button||target===img,
    get scrollWidth(){return Math.max(400,parseFloat(currentImage.style.getPropertyValue('--xiv-actual-width'))||400);},
    get scrollHeight(){return Math.max(600,(parseFloat(currentImage.style.getPropertyValue('--xiv-actual-height'))||533)+56);},
    scrollTo({left=0,top=0}){positionWrites.push({left,top,at:now});this.scrollLeft=left;this.scrollTop=top;}};
  const state={lightbox:lb};
  const c={state,window:{devicePixelRatio:dpr,addEventListener(type,fn){windowEvents[type]=fn;}},
    document:{documentElement:{appendChild(){}},getElementById:id=>id==='xiv-lightbox'?lb:id==='xiv-mobile-center-style'?{}:null,addEventListener(){},createElement:()=>({style:style()})},
    MutationObserver:class{constructor(fn){observer=fn;}observe(){}},
    setTimeout(fn,delay=0){timers.set(++id,{fn,at:now+delay});return id;},clearTimeout:id=>timers.delete(id),
    requestAnimationFrame(fn){timers.set(++id,{fn,at:now+16});return id;},
    cancelAnimationFrame:id=>timers.delete(id),
    claimEvent(){},zoomInIcon:()=>'+',zoomOutIcon:()=>'-',waitForVideoActualZoom(){throw Error('unexpected video');}};
  c.window.setTimeout=c.setTimeout;
  vm.createContext(c);vm.runInContext(coreFunctions+'\n'+mobile,c);
  const mutate=(target=lb,attributeName='data-zoom')=>observer([{target,attributeName,addedNodes:[]}]);
  const tick=ms=>{
    const end=now+ms;let runs=0;
    while(true){const first=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!first)break;assert(++runs<100);now=first[1].at;timers.delete(first[0]);first[1].fn();}now=end;
  };
  const load=()=>{
    img.complete=true;
    const callbacks=events.load||[];events.load=callbacks.filter(e=>!e.once);callbacks.forEach(e=>e.fn());
  };
  return {c,img,lb,button,mutate,tick,load,windowEvents,timers,positionWrites,replaceImage(other){currentImage=other;}};
}

{
  const t=setup();const source=t.img.src;
  t.c.onLightboxClick({target:t.button});t.mutate();t.tick(100);
  assert.equal(t.positionWrites.length,1,'first-tap centering must not be repeated by core and mobile callbacks');
  assert.equal(t.positionWrites[0].at,0,'zoom must be centered before the next paint');
  t.lb.scrollLeft=37;t.lb.scrollTop=51;t.tick(400);
  assert.equal(t.lb.scrollLeft,37,'a delayed settling pass must not move the already visible zoom');
  assert.equal(t.lb.scrollTop,51);assert.equal(t.img.src,source);
  console.log('PASS one first-tap position update before paint, no delayed jump or source replacement');
}

{
  const t=setup();t.c.toggleLightboxZoom();t.mutate();t.tick(400);
  t.lb.clientWidth=500;
  t.windowEvents.resize();t.windowEvents.resize();t.windowEvents.orientationchange();
  assert.equal(t.timers.size,1,'viewport events must share one pre-paint update');
  t.tick(16);assert.equal(t.lb.scrollLeft,50);
  const writes=t.positionWrites.length;t.tick(400);
  assert.equal(t.positionWrites.length,writes,'rotation must not schedule a later settling jump');
  console.log('PASS resize and rotation share one frame without delayed settling writes');
}

{
  const t=setup();const tap=()=>t.c.onLightboxClick({target:t.button});tap();
  assert.equal(t.img.style.getPropertyValue('--xiv-actual-width'),'600px');
  t.mutate();t.tick(400);
  assert.equal(t.img.style.getPropertyValue('--xiv-actual-width'),'600px','mobile centering must preserve the first-click 1.5x zoom');
  assert.equal(t.img.style.getPropertyValue('--xiv-actual-height'),'800px');
  assert.equal(t.lb.dataset.zoom,'actual');assert.equal(t.button.dataset.active,'true');
  assert.equal(t.lb.scrollLeft,100);
  assert.equal(t.lb.scrollTop,128);
  tap();t.mutate();t.tick(400);
  assert.equal(t.lb.dataset.zoom,'fit');assert.equal(t.button.dataset.active,'false');
  tap();t.mutate();t.tick(400);
  assert.equal(t.img.style.getPropertyValue('--xiv-actual-width'),'600px');
  console.log('PASS DPR 3 first tap keeps 1.5x enlargement; second tap returns to fit; re-entry stays centered');
}

{
  const t=setup({width:2400,height:3200});t.c.toggleLightboxZoom();t.mutate();t.tick(400);
  assert.equal(t.img.style.getPropertyValue('--xiv-actual-width'),'800px');
  assert.equal(t.img.style.getPropertyValue('--xiv-actual-height'),'1067px');
  t.img.style.setProperty('--xiv-actual-width','1000px');t.img.style.setProperty('--xiv-actual-height','1334px');t.lb.dataset.wheelZoom='2.5';
  t.windowEvents.resize();t.tick(400);
  assert.equal(t.img.style.getPropertyValue('--xiv-actual-width'),'1000px');
  t.windowEvents.orientationchange();t.tick(500);
  assert.equal(t.img.style.getPropertyValue('--xiv-actual-height'),'1334px');
  console.log('PASS natural-size zoom and subsequent custom zoom survive centering, resize and rotation');
}

{
  const t=setup({loaded:false});t.c.toggleLightboxZoom();t.mutate();t.tick(100);t.load();t.tick(400);
  assert.equal(t.img.style.getPropertyValue('--xiv-actual-width'),'600px');assert.equal(t.lb.scrollLeft,100);
  t.img.complete=false;t.mutate(t.img,'src');t.tick(100);
  t.lb.dataset.zoom='fit';t.lb.dataset.active='false';t.mutate(t.lb,'data-active');t.load();t.tick(400);
  assert.equal(t.lb.dataset.zoom,'fit');
  console.log('PASS late image loading preserves requested enlargement and cannot reopen a closed lightbox');
}

{
  const t=setup();t.c.toggleLightboxZoom();t.mutate();t.tick(100);
  t.lb.dataset.dragging='true';t.lb.scrollLeft=17;t.lb.scrollTop=29;t.tick(400);
  assert.equal(t.lb.scrollLeft,17);assert.equal(t.lb.scrollTop,29);
  t.lb.dataset.dragging='false';
  t.img.complete=false;t.mutate(t.img,'src');t.tick(100);
  t.lb.dataset.openToken='open-2';t.img.dataset.sourceUrl='https://media.test/two.jpg';t.img.src=t.img.dataset.sourceUrl;
  t.lb.scrollLeft=13;t.lb.scrollTop=19;t.load();t.tick(400);
  assert.equal(t.lb.scrollLeft,13);assert.equal(t.lb.scrollTop,19);
  console.log('PASS centering does not interrupt dragging or act on a newly opened image');
}
