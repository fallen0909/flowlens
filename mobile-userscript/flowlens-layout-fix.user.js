// ==UserScript==
// @name         瀑光 FlowLens 手机布局与手势修复
// @namespace    local.flowlens.layout
// @version      1.2.18
// @description  手机端安全版：1:1原图模式只拖动图片，强拦截原滑动切图，保留轻点还原、捏合缩放、视频区域滑动。
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
    #xiv-root[data-active="true"] #xiv-lightbox[data-active="true"][data-zoom="actual"] { overflow:auto!important; -webkit-overflow-scrolling:auto!important; }
    #xiv-root[data-active="true"] #xiv-lightbox[data-active="true"] img, #xiv-root[data-active="true"] #xiv-lightbox[data-active="true"] video { transform:scale(var(--fl-mobile-scale,1)); transform-origin:center center; transition:transform .12s ease; touch-action:none!important; }
    #xiv-root[data-active="true"] #xiv-lightbox[data-active="true"][data-fl-pinching="true"] img, #xiv-root[data-active="true"] #xiv-lightbox[data-active="true"][data-fl-pinching="true"] video { transition:none!important; }
    #xiv-root[data-active="true"] #xiv-lightbox[data-active="true"][data-zoom="actual"] img { max-width:none!important; max-height:none!important; width:auto; height:auto; cursor:grab!important; -webkit-user-select:none!important; user-select:none!important; -webkit-user-drag:none!important; }
    #xiv-root[data-active="true"] #xiv-lightbox[data-active="true"][data-fl-panning="true"] img { cursor:grabbing!important; }
    #xiv-root[data-active="true"] #xiv-lightbox[data-active="true"][data-zoom="fit"] img { max-width:100vw!important; max-height:100vh!important; width:auto!important; height:auto!important; }
    #xiv-fl-edge-cover { position:fixed!important; left:0!important; right:0!important; top:-6px!important; height:12px!important; background:#050505!important; z-index:2147483647!important; pointer-events:none!important; display:none; }
    html.xiv-active #xiv-fl-edge-cover { display:block!important; }
  `;

  function stop(event) {
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }
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
  let touchPan = null;
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
  function isActualMode(box) {
    return box && (box.dataset.zoom === 'actual' || scaleOf(box) > 1.04);
  }
  function setScale(box, value) {
    const scale = Math.max(1, Math.min(4, value));
    box.style.setProperty('--fl-mobile-scale', String(scale));
    if (scale > 1.04) box.dataset.zoom = 'actual';
  }
  function clearActualImageStyle(box) {
    const img = box.querySelector('img');
    if (!img) return;
    img.style.removeProperty('width');
    img.style.removeProperty('height');
    img.style.removeProperty('max-width');
    img.style.removeProperty('max-height');
  }
  function applyActualImageStyle(box) {
    const img = box.querySelector('img');
    if (!img) return;
    const apply = () => {
      const w = img.naturalWidth || 0;
      const h = img.naturalHeight || 0;
      img.style.setProperty('max-width', 'none', 'important');
      img.style.setProperty('max-height', 'none', 'important');
      img.style.setProperty('width', w > 0 ? `${w}px` : 'auto', 'important');
      img.style.setProperty('height', h > 0 ? `${h}px` : 'auto', 'important');
      requestAnimationFrame(() => {
        box.scrollLeft = Math.max(0, (box.scrollWidth - box.clientWidth) / 2);
        box.scrollTop = Math.max(0, (box.scrollHeight - box.clientHeight) / 2);
      });
    };
    if (img.complete) apply();
    else img.addEventListener('load', apply, { once:true });
  }
  function toggleZoom(box) {
    const actual = isActualMode(box);
    box.style.setProperty('--fl-mobile-scale', '1');
    if (actual) {
      box.dataset.zoom = 'fit';
      clearActualImageStyle(box);
      box.scrollTo?.({ top:0, left:0, behavior:'auto' });
    } else {
      box.dataset.zoom = 'actual';
      applyActualImageStyle(box);
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
  function isImgTarget(target) {
    return target?.matches?.('#xiv-lightbox img');
  }
  function wantsPan(box, target) {
    return isImgTarget(target) && isActualMode(box);
  }

  document.addEventListener('pointerdown', (event) => {
    const box = lightbox();
    if (!box || !box.contains(event.target) || isControl(event.target)) return;
    points.set(event.pointerId, { x:event.clientX, y:event.clientY, target:event.target, t:Date.now() });
    if (points.size === 1) {
      swipe = { id:event.pointerId, x:event.clientX, y:event.clientY, target:event.target, t:Date.now(), left:box.scrollLeft, top:box.scrollTop, panned:false };
      if (wantsPan(box, event.target)) {
        box.dataset.flPanning = 'true';
        stop(event);
      }
    }
    if (points.size === 2) {
      const pair = Array.from(points.values()).slice(0, 2);
      pinch = { distance:dist(pair[0], pair[1]), scale:scaleOf(box) };
      box.dataset.flPinching = 'true';
      stop(event);
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
      stop(event);
      return;
    }
    if (swipe && swipe.id === event.pointerId) {
      const dx = event.clientX - swipe.x;
      const dy = event.clientY - swipe.y;
      if (wantsPan(box, swipe.target)) {
        swipe.panned = true;
        box.dataset.flPanning = 'true';
        box.scrollLeft = swipe.left - dx;
        box.scrollTop = swipe.top - dy;
        stop(event);
        return;
      }
      if (isActualMode(box)) {
        stop(event);
        return;
      }
      if (Math.hypot(dx, dy) > 24) {
        event.preventDefault();
        event.stopPropagation();
      }
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
      stop(event);
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
    const panned = swipe.panned;
    swipe = null;
    delete box.dataset.flPanning;

    if (isActualMode(box)) {
      stop(event);
      suppressClickUntil = Date.now() + 350;
      if (!panned && ax < 12 && ay < 12 && dt < 650 && isImgTarget(target)) toggleZoom(box);
      return;
    }

    if (Math.max(ax, ay) > Math.max(42, Math.min(innerWidth, innerHeight) * 0.09)) {
      event.preventDefault();
      event.stopPropagation();
      suppressClickUntil = Date.now() + 420;
      switchItem(ax >= ay ? dx < 0 : dy < 0);
      return;
    }
    if (ax < 12 && ay < 12 && dt < 650 && isImgTarget(target)) {
      stop(event);
      toggleZoom(box);
    }
  }, true);

  document.addEventListener('pointercancel', (event) => {
    points.delete(event.pointerId);
    const box = lightbox();
    if (box) {
      if (points.size < 2) delete box.dataset.flPinching;
      delete box.dataset.flPanning;
    }
    if (!points.size) {
      pinch = null;
      swipe = null;
    }
  }, true);

  document.addEventListener('touchstart', (event) => {
    const box = lightbox();
    if (!box || event.touches.length !== 1 || isControl(event.target) || !wantsPan(box, event.target)) return;
    const t = event.touches[0];
    touchPan = { x:t.clientX, y:t.clientY, left:box.scrollLeft, top:box.scrollTop, target:event.target, moved:false, time:Date.now() };
    box.dataset.flPanning = 'true';
    stop(event);
  }, true);

  document.addEventListener('touchmove', (event) => {
    const box = lightbox();
    if (!box || !isActualMode(box)) return;
    if (touchPan && event.touches.length === 1) {
      const t = event.touches[0];
      const dx = t.clientX - touchPan.x;
      const dy = t.clientY - touchPan.y;
      touchPan.moved = Math.hypot(dx, dy) > 1;
      box.scrollLeft = touchPan.left - dx;
      box.scrollTop = touchPan.top - dy;
      box.dataset.flPanning = 'true';
    }
    stop(event);
  }, true);

  document.addEventListener('touchend', (event) => {
    const box = lightbox();
    if (!box || !isActualMode(box) || !touchPan) return;
    const pan = touchPan;
    touchPan = null;
    delete box.dataset.flPanning;
    stop(event);
    suppressClickUntil = Date.now() + 350;
    if (!pan.moved && Date.now() - pan.time < 650 && isImgTarget(pan.target)) toggleZoom(box);
  }, true);

  document.addEventListener('click', (event) => {
    if (Date.now() < suppressClickUntil && event.target?.closest?.('#xiv-lightbox')) stop(event);
  }, true);

  installStyle();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installStyle, { once:true });
})();
