// ==UserScript==
// @name         瀑光 FlowLens 手机布局与手势修复
// @namespace    local.flowlens.layout
// @version      1.2.13
// @description  手机端安全版：修复顶部边缘、计数显示、大图点击原图、捏合缩放和视频区域滑动，移除高频扫描避免卡死。
// @match        *://*/*
// @run-at       document-start
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  if (window.__flowLensMobileSafeFix) return;
  window.__flowLensMobileSafeFix = true;

  const css = `
    html.xiv-active, html.xiv-active body { background:#050505!important; }
    #xiv-root[data-active="true"] { position:fixed!important; top:-6px!important; right:-6px!important; bottom:-6px!important; left:-6px!important; width:calc(100vw + 12px)!important; height:calc(100dvh + 12px)!important; max-height:none!important; background:#050505!important; border:0!important; outline:0!important; box-shadow:none!important; overflow:hidden!important; }
    #xiv-root[data-active="true"][data-theme="light"] { background:#f4f4f1!important; }
    #xiv-root[data-active="true"] #xiv-stage { padding-top:max(18px, calc(env(safe-area-inset-top, 0px) + 18px))!important; padding-left:calc(max(6px, env(safe-area-inset-left, 0px)) + 6px)!important; padding-right:calc(max(6px, env(safe-area-inset-right, 0px)) + 6px)!important; background:transparent!important; }
    #xiv-root[data-active="true"] #xiv-grid { margin-top:0!important; padding-top:0!important; background:transparent!important; }
    #xiv-root[data-active="true"] #xiv-topbar { top:0!important; margin:0!important; padding-top:calc(18px + env(safe-area-inset-top, 0px))!important; padding-left:calc(max(8px, env(safe-area-inset-left, 0px)) + 6px)!important; padding-right:calc(max(8px, env(safe-area-inset-right, 0px)) + 6px)!important; background:transparent!important; pointer-events:none!important; box-shadow:none!important; border:0!important; justify-content:space-between!important; }
    #xiv-root[data-active="true"] #xiv-topbar .xiv-actions, #xiv-root[data-active="true"] #xiv-topbar .xiv-btn, #xiv-root[data-active="true"] #xiv-topbar .xiv-select, #xiv-root[data-active="true"] #xiv-topbar .xiv-pill:has(#xiv-counter) { pointer-events:auto!important; }
    #xiv-root[data-active="true"] #xiv-topbar .xiv-pill:has(#xiv-counter) { display:inline-flex!important; visibility:visible!important; opacity:1!important; min-height:34px!important; padding:0 10px!important; background:rgba(18,18,20,.72)!important; color:#fff!important; border:1px solid rgba(255,255,255,.16)!important; backdrop-filter:blur(12px); }
    #xiv-root[data-active="true"][data-theme="light"] #xiv-topbar .xiv-pill:has(#xiv-counter) { background:rgba(255,255,255,.78)!important; color:#151515!important; border-color:rgba(0,0,0,.12)!important; }
    #xiv-root[data-active="true"] .xiv-video-mark { display:none!important; opacity:0!important; visibility:hidden!important; pointer-events:none!important; }
    #xiv-root[data-active="true"] #xiv-lightbox[data-active="true"] { touch-action:none!important; overscroll-behavior:contain!important; }
    #xiv-root[data-active="true"] #xiv-lightbox[data-active="true"] img, #xiv-root[data-active="true"] #xiv-lightbox[data-active="true"] video { transform:scale(var(--fl-mobile-scale,1)); transform-origin:center center; transition:transform .12s ease; touch-action:none!important; }
    #xiv-root[data-active="true"] #xiv-lightbox[data-active="true"][data-fl-pinching="true"] img, #xiv-root[data-active="true"] #xiv-lightbox[data-active="true"][data-fl-pinching="true"] video { transition:none!important; }
    #xiv-fl-edge-cover { position:fixed!important; left:0!important; right:0!important; top:-6px!important; height:12px!important; background:#050505!important; z-index:2147483647!important; pointer-events:none!important; display:none; }
    html.xiv-active #xiv-fl-edge-cover { display:block!important; }
  `;

  function installStyle() {
    let style = document.getElementById('xiv-fl-mobile-safe-fix-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'xiv-fl-mobile-safe-fix-style';
      (document.head || document.documentElement).appendChild(style);
    }
    if (style.textContent !== css) style.textContent = css;
    if (!document.getElementById('xiv-fl-edge-cover') && document.body) {
      const cover = document.createElement('div');
      cover.id = 'xiv-fl-edge-cover';
      document.body.appendChild(cover);
    }
  }

  const points = new Map();
  let pinch = null;
  let swipe = null;
  let suppressClickUntil = 0;

  function lightbox() {
    const box = document.getElementById('xiv-lightbox');
    return box && box.dataset.active === 'true' ? box : null;
  }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function scaleOf(box) {
    const value = Number(getComputedStyle(box).getPropertyValue('--fl-mobile-scale') || 1);
    return Number.isFinite(value) && value > 0 ? value : 1;
  }
  function setScale(box, value) {
    const scale = Math.max(1, Math.min(4, value));
    box.style.setProperty('--fl-mobile-scale', String(scale));
    if (scale > 1.04) box.dataset.zoom = 'actual';
  }
  function toggleZoom(box) {
    const actual = box.dataset.zoom === 'actual' || scaleOf(box) > 1.04;
    if (actual) {
      box.dataset.zoom = 'fit';
      box.style.setProperty('--fl-mobile-scale', '1');
      box.scrollTo?.({ top:0, left:0, behavior:'auto' });
    } else {
      box.dataset.zoom = 'actual';
      box.style.setProperty('--fl-mobile-scale', '1');
    }
    suppressClickUntil = Date.now() + 350;
  }
  function switchItem(next) {
    const side = next ? 'right' : 'left';
    const arrow = document.querySelector(`#xiv-lightbox .xiv-lightbox-arrow[data-side="${side}"]`);
    arrow?.dispatchEvent(new MouseEvent('click', { bubbles:true, cancelable:true, button:0 }));
  }
  function isControl(target) {
    return target?.closest?.('.xiv-lightbox-fav, .xiv-lightbox-close, .xiv-lightbox-arrow');
  }

  document.addEventListener('pointerdown', (event) => {
    const box = lightbox();
    if (!box || !box.contains(event.target) || isControl(event.target)) return;
    points.set(event.pointerId, { x:event.clientX, y:event.clientY, target:event.target, t:Date.now() });
    if (points.size === 1) swipe = { id:event.pointerId, x:event.clientX, y:event.clientY, target:event.target, t:Date.now() };
    if (points.size === 2) {
      const pair = Array.from(points.values()).slice(0, 2);
      pinch = { distance:dist(pair[0], pair[1]), scale:scaleOf(box) };
      box.dataset.flPinching = 'true';
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  document.addEventListener('pointermove', (event) => {
    const box = lightbox();
    if (!box || !points.has(event.pointerId)) return;
    const old = points.get(event.pointerId);
    points.set(event.pointerId, { ...old, x:event.clientX, y:event.clientY });
    if (pinch && points.size >= 2) {
      const pair = Array.from(points.values()).slice(0, 2);
      setScale(box, pinch.scale * dist(pair[0], pair[1]) / Math.max(1, pinch.distance));
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (swipe && swipe.id === event.pointerId && Math.hypot(event.clientX - swipe.x, event.clientY - swipe.y) > 24) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  document.addEventListener('pointerup', (event) => {
    const box = lightbox();
    const start = points.get(event.pointerId);
    points.delete(event.pointerId);
    if (!box || !start) return;
    if (pinch) {
      if (points.size < 2) {
        delete box.dataset.flPinching;
        pinch = null;
      }
      event.preventDefault();
      event.stopPropagation();
      suppressClickUntil = Date.now() + 350;
      return;
    }
    if (!swipe || swipe.id !== event.pointerId) return;
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const dt = Date.now() - swipe.t;
    const target = swipe.target;
    swipe = null;
    if (Math.max(ax, ay) > Math.max(42, Math.min(innerWidth, innerHeight) * 0.09)) {
      event.preventDefault();
      event.stopPropagation();
      suppressClickUntil = Date.now() + 420;
      switchItem(ax >= ay ? dx < 0 : dy < 0);
      return;
    }
    if (ax < 12 && ay < 12 && dt < 650 && target?.matches?.('#xiv-lightbox img')) {
      event.preventDefault();
      event.stopPropagation();
      toggleZoom(box);
    }
  }, true);

  document.addEventListener('pointercancel', (event) => {
    points.delete(event.pointerId);
    const box = lightbox();
    if (box && points.size < 2) delete box.dataset.flPinching;
    if (!points.size) {
      pinch = null;
      swipe = null;
    }
  }, true);

  document.addEventListener('click', (event) => {
    if (Date.now() < suppressClickUntil && event.target?.closest?.('#xiv-lightbox')) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  installStyle();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installStyle, { once:true });
})();
