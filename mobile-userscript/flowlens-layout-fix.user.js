// ==UserScript==
// @name         瀑光 FlowLens 手机布局与手势修复
// @namespace    local.flowlens.layout
// @version      1.2.21
// @description  手机端安全版：移除捏合缩放，恢复 1:1 原图单指拖动，1:1 模式禁用滑动切图。
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
    #xiv-root[data-active="true"] #xiv-lightbox[data-active="true"] img, #xiv-root[data-active="true"] #xiv-lightbox[data-active="true"] video { touch-action:none!important; transform:none!important; transition:none!important; }
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

  let pan = null;
  let suppressClickUntil = 0;
  let lastTouchTime = 0;

  function lightbox() {
    const box = document.getElementById('xiv-lightbox');
    return box && box.dataset.active === 'true' ? box : null;
  }

  function isActualMode(box) {
    return box && box.dataset.zoom === 'actual';
  }

  function isControl(target) {
    return target?.closest?.('.xiv-lightbox-fav, .xiv-lightbox-close, .xiv-lightbox-arrow');
  }

  function isImgTarget(target) {
    return target?.matches?.('#xiv-lightbox img');
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
    if (isActualMode(box)) {
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

  function startPan(box, target, x, y) {
    pan = { x, y, left:box.scrollLeft, top:box.scrollTop, target, moved:false, time:Date.now() };
    box.dataset.flPanning = 'true';
  }

  function movePan(box, x, y) {
    if (!pan) return;
    const dx = x - pan.x;
    const dy = y - pan.y;
    pan.moved = pan.moved || Math.hypot(dx, dy) > 1;
    box.scrollLeft = pan.left - dx;
    box.scrollTop = pan.top - dy;
    box.dataset.flPanning = 'true';
  }

  function endPan(box) {
    if (!pan) return null;
    const done = pan;
    pan = null;
    delete box.dataset.flPanning;
    return done;
  }

  document.addEventListener('touchstart', (event) => {
    const box = lightbox();
    if (!box || isControl(event.target)) return;
    lastTouchTime = Date.now();

    if (isActualMode(box)) {
      if (event.touches.length === 1 && isImgTarget(event.target)) {
        const t = event.touches[0];
        startPan(box, event.target, t.clientX, t.clientY);
      }
      stop(event);
    }
  }, true);

  document.addEventListener('touchmove', (event) => {
    const box = lightbox();
    if (!box || !isActualMode(box)) return;
    if (pan && event.touches.length === 1) {
      const t = event.touches[0];
      movePan(box, t.clientX, t.clientY);
    }
    stop(event);
  }, true);

  document.addEventListener('touchend', (event) => {
    const box = lightbox();
    if (!box || !isActualMode(box)) return;
    const done = endPan(box);
    stop(event);
    suppressClickUntil = Date.now() + 350;
    if (done && !done.moved && Date.now() - done.time < 650 && isImgTarget(done.target)) toggleZoom(box);
  }, true);

  document.addEventListener('pointerdown', (event) => {
    if (Date.now() - lastTouchTime < 700) return;
    const box = lightbox();
    if (!box || !box.contains(event.target) || isControl(event.target)) return;
    if (isActualMode(box)) {
      if (isImgTarget(event.target)) startPan(box, event.target, event.clientX, event.clientY);
      stop(event);
    } else if (isImgTarget(event.target)) {
      pan = { x:event.clientX, y:event.clientY, target:event.target, moved:false, time:Date.now(), fitMode:true };
    }
  }, true);

  document.addEventListener('pointermove', (event) => {
    if (Date.now() - lastTouchTime < 700) return;
    const box = lightbox();
    if (!box || !box.contains(event.target)) return;
    if (isActualMode(box)) {
      if (pan) movePan(box, event.clientX, event.clientY);
      stop(event);
      return;
    }
    if (pan?.fitMode) {
      pan.moved = pan.moved || Math.hypot(event.clientX - pan.x, event.clientY - pan.y) > 12;
      if (pan.moved) {
        const dx = event.clientX - pan.x;
        const dy = event.clientY - pan.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) > Math.max(42, Math.min(innerWidth, innerHeight) * 0.09)) {
          stop(event);
        }
      }
    }
  }, true);

  document.addEventListener('pointerup', (event) => {
    if (Date.now() - lastTouchTime < 700) return;
    const box = lightbox();
    if (!box || !pan) return;
    const done = endPan(box) || pan;
    const dx = event.clientX - done.x;
    const dy = event.clientY - done.y;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const dt = Date.now() - done.time;

    if (isActualMode(box)) {
      stop(event);
      suppressClickUntil = Date.now() + 350;
      if (!done.moved && ax < 12 && ay < 12 && dt < 650 && isImgTarget(done.target)) toggleZoom(box);
      return;
    }

    pan = null;
    if (done.fitMode && Math.max(ax, ay) > Math.max(42, Math.min(innerWidth, innerHeight) * 0.09)) {
      stop(event);
      suppressClickUntil = Date.now() + 420;
      switchItem(ax >= ay ? dx < 0 : dy < 0);
      return;
    }
    if (done.fitMode && ax < 12 && ay < 12 && dt < 650 && isImgTarget(done.target)) {
      stop(event);
      toggleZoom(box);
    }
  }, true);

  document.addEventListener('pointercancel', () => {
    const box = lightbox();
    if (box) delete box.dataset.flPanning;
    pan = null;
  }, true);

  document.addEventListener('click', (event) => {
    if (Date.now() < suppressClickUntil && event.target?.closest?.('#xiv-lightbox')) stop(event);
  }, true);

  installStyle();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installStyle, { once:true });
})();
