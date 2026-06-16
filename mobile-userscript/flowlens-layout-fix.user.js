// ==UserScript==
// @name         瀑光 FlowLens 手机布局与交互修复
// @namespace    local.flowlens.layout
// @version      1.2.12
// @description  手机端布局、计数、视频遮挡和大图手势修复。
// @match        *://*/*
// @run-at       document-start
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  if (window.__flowLensMobileLayoutFix) return;
  window.__flowLensMobileLayoutFix = true;

  const css = `
    html.xiv-active, html.xiv-active body { background:#050505!important; }
    #xiv-root[data-active="true"] { position:fixed!important; top:-8px!important; right:-8px!important; bottom:-8px!important; left:-8px!important; width:calc(100vw + 16px)!important; height:calc(100dvh + 16px)!important; max-height:none!important; background:#050505!important; border:0!important; outline:0!important; box-shadow:none!important; overflow:hidden!important; }
    #xiv-root[data-active="true"][data-theme="light"] { background:#f4f4f1!important; }
    #xiv-root[data-active="true"]::before, #xiv-root[data-active="true"]::after { content:none!important; display:none!important; }
    #xiv-root[data-active="true"] #xiv-stage { padding-top:max(18px, calc(env(safe-area-inset-top, 0px) + 18px))!important; padding-left:calc(max(6px, env(safe-area-inset-left, 0px)) + 8px)!important; padding-right:calc(max(6px, env(safe-area-inset-right, 0px)) + 8px)!important; padding-bottom:calc(12px + env(safe-area-inset-bottom, 0px) + 8px)!important; background:transparent!important; border:0!important; outline:0!important; box-shadow:none!important; }
    #xiv-root[data-active="true"] #xiv-grid { margin-top:0!important; padding-top:0!important; background:transparent!important; border-top:0!important; box-shadow:none!important; }
    #xiv-root[data-active="true"] #xiv-topbar { top:0!important; margin:0!important; padding-top:calc(18px + env(safe-area-inset-top, 0px))!important; padding-left:calc(max(8px, env(safe-area-inset-left, 0px)) + 8px)!important; padding-right:calc(max(8px, env(safe-area-inset-right, 0px)) + 8px)!important; background:transparent!important; pointer-events:none!important; box-shadow:none!important; border:0!important; outline:0!important; justify-content:space-between!important; }
    #xiv-root[data-active="true"] #xiv-topbar .xiv-actions, #xiv-root[data-active="true"] #xiv-topbar .xiv-btn, #xiv-root[data-active="true"] #xiv-topbar .xiv-select, #xiv-root[data-active="true"] #xiv-topbar .xiv-fl-counter-pill { pointer-events:auto!important; }
    #xiv-root[data-active="true"] #xiv-topbar .xiv-fl-counter-pill { display:inline-flex!important; visibility:visible!important; opacity:1!important; position:relative!important; z-index:8!important; min-height:34px!important; padding:0 10px!important; background:rgba(18,18,20,.72)!important; color:#fff!important; border:1px solid rgba(255,255,255,.16)!important; backdrop-filter:blur(12px); }
    #xiv-root[data-active="true"][data-theme="light"] #xiv-topbar .xiv-fl-counter-pill { background:rgba(255,255,255,.78)!important; color:#151515!important; border-color:rgba(0,0,0,.12)!important; }
    #xiv-root[data-active="true"] .xiv-tile video { display:block!important; width:100%!important; min-height:96px!important; background:#111!important; object-fit:cover!important; }
    #xiv-root[data-active="true"] .xiv-tile video:not([data-fl-preview-ready="true"]) { background:linear-gradient(135deg,#181818,#050505)!important; }
    #xiv-root[data-active="true"] #xiv-lightbox[data-active="true"] { touch-action:none!important; overscroll-behavior:contain!important; }
    #xiv-root[data-active="true"] #xiv-lightbox[data-active="true"] img, #xiv-root[data-active="true"] #xiv-lightbox[data-active="true"] video { transform:scale(var(--fl-mobile-scale,1)); transform-origin:center center; transition:transform .12s ease; touch-action:none!important; }
    #xiv-root[data-active="true"] #xiv-lightbox[data-active="true"][data-fl-pinching="true"] img, #xiv-root[data-active="true"] #xiv-lightbox[data-active="true"][data-fl-pinching="true"] video { transition:none!important; }
    #xiv-root[data-active="true"] .xiv-video-frame::before, #xiv-root[data-active="true"] .xiv-video-frame::after, #xiv-root[data-active="true"] .xiv-video-mark, #xiv-root[data-active="true"] .xiv-play, #xiv-root[data-active="true"] .xiv-play-button, #xiv-root[data-active="true"] [class*="play"], #xiv-root[data-active="true"] [class*="Play"] { display:none!important; opacity:0!important; visibility:hidden!important; pointer-events:none!important; }
    #xiv-fl-edge-cover { position:fixed!important; left:0!important; right:0!important; top:-8px!important; height:16px!important; background:#050505!important; z-index:2147483647!important; pointer-events:none!important; display:none; }
    html.xiv-active #xiv-fl-edge-cover { display:block!important; }
  `;

  let videoTimer = 0;
  let bound = false;
  const points = new Map();
  let pinch = null;
  let swipe = null;
  let suppressClickUntil = 0;

  function inject() {
    let style = document.getElementById('xiv-fl-mobile-layout-fix-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'xiv-fl-mobile-layout-fix-style';
      (document.head || document.documentElement).appendChild(style);
    }
    if (style.textContent !== css) style.textContent = css;
    if (!document.getElementById('xiv-fl-edge-cover')) {
      const cover = document.createElement('div');
      cover.id = 'xiv-fl-edge-cover';
      (document.body || document.documentElement).appendChild(cover);
    }
  }

  function root() {
    const el = document.getElementById('xiv-root');
    return el && el.dataset.active === 'true' ? el : null;
  }
  function lb() {
    const el = document.getElementById('xiv-lightbox');
    return el && el.dataset.active === 'true' ? el : null;
  }
  function repaint() {
    const r = root();
    if (!r) return;
    const color = r.dataset.theme === 'light' ? '#f4f4f1' : '#050505';
    r.style.setProperty('top', '-8px', 'important');
    r.style.setProperty('right', '-8px', 'important');
    r.style.setProperty('bottom', '-8px', 'important');
    r.style.setProperty('left', '-8px', 'important');
    r.style.setProperty('width', 'calc(100vw + 16px)', 'important');
    r.style.setProperty('height', 'calc(100dvh + 16px)', 'important');
    r.style.setProperty('background', color, 'important');
    const cover = document.getElementById('xiv-fl-edge-cover');
    if (cover) cover.style.setProperty('background', color, 'important');
    const stage = document.getElementById('xiv-stage');
    if (stage) stage.style.setProperty('padding-top', 'max(18px, calc(env(safe-area-inset-top, 0px) + 18px))', 'important');
  }
  function restoreCounter() {
    const counter = document.getElementById('xiv-counter');
    const pill = counter && counter.closest ? counter.closest('.xiv-pill') : null;
    if (pill) pill.classList.add('xiv-fl-counter-pill');
  }
  function preview(video) {
    if (!video || !video.isConnected || video.dataset.flPreviewForced === 'true') return;
    video.dataset.flPreviewForced = 'true';
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.controls = false;
    const url = video.dataset.previewUrl || video.dataset.sourceUrl || video.currentSrc || video.src || '';
    if (url && !video.currentSrc && !video.src) {
      video.src = url;
      try { video.load(); } catch (e) {}
    }
    const ready = () => {
      video.dataset.flPreviewReady = 'true';
      try { video.pause(); } catch (e) {}
    };
    video.addEventListener('loadeddata', ready, { once: true });
    video.addEventListener('canplay', ready, { once: true });
    video.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(video.duration) && video.duration > 1) {
        try { video.currentTime = Math.min(0.6, video.duration - 0.2); } catch (e) {}
      }
    }, { once: true });
  }
  function refreshVideos() {
    clearTimeout(videoTimer);
    videoTimer = setTimeout(() => {
      document.querySelectorAll("#xiv-root[data-active='true'] .xiv-tile video").forEach(preview);
    }, 120);
  }

  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function scaleOf(box) {
    const n = Number(getComputedStyle(box).getPropertyValue('--fl-mobile-scale') || 1);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }
  function setScale(box, n) {
    const v = Math.max(1, Math.min(4, n));
    box.style.setProperty('--fl-mobile-scale', String(v));
    if (v > 1.04) box.dataset.zoom = 'actual';
  }
  function resetScale(box) {
    box.style.setProperty('--fl-mobile-scale', '1');
    delete box.dataset.flPinching;
  }
  function toggleZoom(box) {
    const actual = box.dataset.zoom === 'actual' || scaleOf(box) > 1.04;
    if (actual) {
      box.dataset.zoom = 'fit';
      resetScale(box);
    } else {
      box.dataset.zoom = 'actual';
      setScale(box, 1);
    }
    suppressClickUntil = Date.now() + 420;
  }
  function arrow(next) {
    const el = document.querySelector(`#xiv-lightbox .xiv-lightbox-arrow[data-side="${next ? 'right' : 'left'}"]`);
    if (el) el.click();
  }
  function isControl(target) {
    return target && target.closest && target.closest('.xiv-lightbox-fav, .xiv-lightbox-close, .xiv-lightbox-arrow');
  }

  function bind() {
    if (bound) return;
    bound = true;
    document.addEventListener('pointerdown', (e) => {
      const box = lb();
      if (!box || !box.contains(e.target) || isControl(e.target)) return;
      points.set(e.pointerId, { x: e.clientX, y: e.clientY, target: e.target, t: Date.now() });
      if (points.size === 1) swipe = { id: e.pointerId, x: e.clientX, y: e.clientY, target: e.target, t: Date.now() };
      if (points.size === 2) {
        const p = Array.from(points.values()).slice(0, 2);
        pinch = { d: dist(p[0], p[1]), s: scaleOf(box) };
        box.dataset.flPinching = 'true';
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
    document.addEventListener('pointermove', (e) => {
      const box = lb();
      if (!box || !points.has(e.pointerId)) return;
      const old = points.get(e.pointerId);
      points.set(e.pointerId, { ...old, x: e.clientX, y: e.clientY });
      if (pinch && points.size >= 2) {
        const p = Array.from(points.values()).slice(0, 2);
        setScale(box, pinch.s * dist(p[0], p[1]) / Math.max(1, pinch.d));
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (swipe && swipe.id === e.pointerId && Math.hypot(e.clientX - swipe.x, e.clientY - swipe.y) > 22) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
    document.addEventListener('pointerup', (e) => {
      const box = lb();
      const st = points.get(e.pointerId);
      points.delete(e.pointerId);
      if (!box || !st) return;
      if (pinch) {
        if (points.size < 2) {
          delete box.dataset.flPinching;
          pinch = null;
        }
        e.preventDefault();
        e.stopPropagation();
        suppressClickUntil = Date.now() + 420;
        return;
      }
      if (!swipe || swipe.id !== e.pointerId) return;
      const dx = e.clientX - swipe.x;
      const dy = e.clientY - swipe.y;
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      const dt = Date.now() - swipe.t;
      const target = swipe.target;
      swipe = null;
      if (Math.max(ax, ay) > Math.max(42, Math.min(innerWidth, innerHeight) * 0.09)) {
        e.preventDefault();
        e.stopPropagation();
        suppressClickUntil = Date.now() + 480;
        arrow(ax >= ay ? dx < 0 : dy < 0);
        return;
      }
      if (ax < 12 && ay < 12 && dt < 650 && target && target.matches && target.matches('#xiv-lightbox img')) {
        e.preventDefault();
        e.stopPropagation();
        toggleZoom(box);
      }
    }, true);
    document.addEventListener('pointercancel', (e) => {
      points.delete(e.pointerId);
      const box = lb();
      if (box && points.size < 2) delete box.dataset.flPinching;
      if (!points.size) {
        pinch = null;
        swipe = null;
      }
    }, true);
    document.addEventListener('click', (e) => {
      if (Date.now() < suppressClickUntil && e.target && e.target.closest && e.target.closest('#xiv-lightbox')) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
  }

  function sync() {
    inject();
    repaint();
    restoreCounter();
    bind();
    refreshVideos();
  }
  sync();
  new MutationObserver(sync).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-active', 'data-theme', 'style', 'class', 'src'] });
  setInterval(sync, 900);
})();
