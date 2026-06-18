// ==UserScript==
// @name         瀑光 FlowLens 手机体验增强补丁
// @namespace    local.flowlens.mobile.polish
// @version      1.3.8
// @description  恢复顶部信息、压缩顶部空隙、大图自动切换按钮、1:1 居中优化、图片/视频缩略图兜底加载。
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  if (window.__flowLensMobilePolish) return;
  window.__flowLensMobilePolish = true;

  let autoTimer = 0;
  let autoPlaying = false;
  let applyTimer = 0;
  const imageRetryMap = new WeakMap();
  const videoRetryMap = new WeakMap();

  const css = `
    html.xiv-active #xiv-root #xiv-topbar {
      min-height: 46px !important;
      padding-top: calc(4px + env(safe-area-inset-top, 0px)) !important;
      padding-right: max(6px, env(safe-area-inset-right, 0px)) !important;
      padding-bottom: 4px !important;
      padding-left: max(6px, env(safe-area-inset-left, 0px)) !important;
      gap: 6px !important;
      align-items: center !important;
      justify-content: space-between !important;
      background: linear-gradient(to bottom, rgba(0,0,0,.82), rgba(0,0,0,.22), rgba(0,0,0,0)) !important;
    }
    html.xiv-active #xiv-root[data-theme="light"] #xiv-topbar {
      background: linear-gradient(to bottom, rgba(244,244,241,.9), rgba(244,244,241,.35), rgba(244,244,241,0)) !important;
    }
    html.xiv-active #xiv-root #xiv-topbar .xiv-pill {
      display: inline-flex !important;
      visibility: visible !important;
      opacity: 1 !important;
      min-width: 0 !important;
      max-width: 45vw !important;
      height: 34px !important;
      min-height: 34px !important;
      padding: 0 9px !important;
      gap: 6px !important;
      flex: 1 1 auto !important;
      overflow: hidden !important;
      white-space: nowrap !important;
      font-size: 12px !important;
      line-height: 1 !important;
    }
    html.xiv-active #xiv-root #xiv-counter,
    html.xiv-active #xiv-root #xiv-status {
      display: inline-block !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
    }
    html.xiv-active #xiv-root #xiv-status { max-width: 20vw !important; opacity: .82 !important; }
    html.xiv-active #xiv-root #xiv-topbar .xiv-actions {
      display: inline-flex !important;
      flex: 0 0 auto !important;
      gap: 5px !important;
      flex-wrap: nowrap !important;
      align-items: center !important;
    }
    html.xiv-active #xiv-root #xiv-topbar .xiv-btn {
      width: 36px !important;
      min-width: 36px !important;
      height: 36px !important;
    }
    html.xiv-active #xiv-root #xiv-stage {
      padding-top: calc(46px + env(safe-area-inset-top, 0px)) !important;
      padding-right: max(4px, env(safe-area-inset-right, 0px)) !important;
      padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px)) !important;
      padding-left: max(4px, env(safe-area-inset-left, 0px)) !important;
    }
    #xiv-lightbox[data-zoom="actual"] {
      scroll-behavior: auto !important;
      overscroll-behavior: contain !important;
    }
    #xiv-lightbox[data-zoom="actual"] > img {
      max-width: none !important;
      max-height: none !important;
      margin: 0 auto !important;
      opacity: 1 !important;
    }
    #xiv-lightbox[data-fl-centering="true"] > img {
      opacity: 0 !important;
    }
    .xiv-lightbox-auto-next {
      position: fixed;
      right: 118px;
      top: max(18px, calc(12px + env(safe-area-inset-top, 0px)));
      z-index: 7;
      width: 42px;
      height: 42px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,.26);
      background: radial-gradient(circle at 32% 24%, rgba(255,255,255,.22), rgba(18,18,20,.72));
      color: #fff;
      display: grid;
      place-items: center;
      pointer-events: auto;
      cursor: pointer;
      padding: 0;
      box-shadow: 0 12px 30px rgba(0,0,0,.36), inset 0 1px 0 rgba(255,255,255,.18);
      backdrop-filter: blur(12px);
      font: 900 16px/1 system-ui, sans-serif;
    }
    .xiv-lightbox-auto-next::before { content: "▶"; margin-left: 2px; }
    .xiv-lightbox-auto-next[data-playing="true"] {
      background: radial-gradient(circle at 32% 24%, rgba(95,156,255,.42), rgba(18,74,180,.78));
      border-color: rgba(116,173,255,.7);
    }
    .xiv-lightbox-auto-next[data-playing="true"]::before { content: "Ⅱ"; margin-left: 0; letter-spacing: -2px; }
    .xiv-tile[data-fl-video-placeholder="true"]::before {
      content: "";
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at 50% 38%, rgba(255,255,255,.18), rgba(255,255,255,0) 34%), linear-gradient(135deg, #1b1d25, #07080b);
      z-index: 0;
      pointer-events: none;
    }
    .xiv-tile[data-fl-video-placeholder="true"] .xiv-video-mark { z-index: 2; }
    @media (max-width: 380px) {
      html.xiv-active #xiv-root #xiv-topbar .xiv-pill { max-width: 42vw !important; }
      html.xiv-active #xiv-root #xiv-status { display: none !important; }
      .xiv-lightbox-auto-next { right: 112px; width: 40px; height: 40px; }
    }
  `;

  function injectStyle() {
    if (document.getElementById("xiv-mobile-polish-style")) return;
    const style = document.createElement("style");
    style.id = "xiv-mobile-polish-style";
    style.textContent = css;
    document.documentElement.appendChild(style);
  }

  function root() { return document.getElementById("xiv-root"); }
  function lightbox() { const lb = document.getElementById("xiv-lightbox"); return lb?.dataset.active === "true" ? lb : null; }
  function currentImg() { return lightbox()?.querySelector?.("img") || null; }

  function imageCandidates(url) {
    const out = [];
    const add = (value) => { if (value && !out.includes(value)) out.push(value); };
    add(url);
    try {
      const parsed = new URL(url, location.href);
      const noQuery = `${parsed.origin}${parsed.pathname}`;
      if (parsed.hostname.includes("zhimg.com")) {
        add(noQuery.replace(/_(?:\d+w|r|b|hd)(?=\.)/i, "_r"));
        add(noQuery.replace(/_(?:\d+w|r|b|hd)(?=\.)/i, "_b"));
        add(noQuery.replace(/_(?:\d+w|r|b|hd)(?=\.)/i, ""));
      }
      if (parsed.hostname.includes("pbs.twimg.com")) {
        const format = parsed.searchParams.get("format") || parsed.pathname.match(/\.([a-z0-9]+)$/i)?.[1] || "jpg";
        parsed.search = `?format=${format}&name=orig`;
        add(parsed.href);
        parsed.search = `?format=${format}&name=large`;
        add(parsed.href);
      }
      add(noQuery);
      if (parsed.protocol === "https:") add(`http://${parsed.host}${parsed.pathname}${parsed.search}`);
      if (parsed.protocol === "http:") add(`https://${parsed.host}${parsed.pathname}${parsed.search}`);
    } catch { /* ignore */ }
    return out;
  }

  function improveImage(img) {
    if (!img || img.dataset.flPolishBound === "true") return;
    img.dataset.flPolishBound = "true";
    img.decoding = "async";
    img.loading = img.closest("#xiv-lightbox") ? "eager" : (img.loading || "lazy");
    img.removeAttribute("srcset");
    img.addEventListener("error", () => {
      const tries = imageRetryMap.get(img) || { urls: imageCandidates(img.currentSrc || img.src || img.dataset.src || ""), index: 0, policy: 0 };
      tries.index += 1;
      const next = tries.urls[tries.index];
      imageRetryMap.set(img, tries);
      if (next) {
        img.referrerPolicy = tries.policy % 2 === 0 ? "no-referrer-when-downgrade" : "origin";
        tries.policy += 1;
        img.src = next;
      }
    });
  }

  function improveVideo(video) {
    if (!video || video.dataset.flPolishVideoBound === "true") return;
    video.dataset.flPolishVideoBound = "true";
    video.preload = "metadata";
    video.playsInline = true;
    video.muted = true;
    const tile = video.closest?.(".xiv-tile");
    const markPlaceholder = () => {
      if (tile && (!video.videoWidth || !video.videoHeight)) tile.dataset.flVideoPlaceholder = "true";
    };
    video.addEventListener("loadedmetadata", () => {
      tile?.removeAttribute("data-fl-video-placeholder");
      try {
        const duration = Number(video.duration || 0);
        if (Number.isFinite(duration) && duration > 1 && video.currentTime < 0.2) video.currentTime = Math.min(0.8, duration / 3);
      } catch { /* ignore */ }
    });
    video.addEventListener("loadeddata", () => tile?.removeAttribute("data-fl-video-placeholder"));
    video.addEventListener("error", () => {
      const tries = videoRetryMap.get(video) || 0;
      videoRetryMap.set(video, tries + 1);
      if (tries < 1) {
        const src = video.currentSrc || video.src || video.dataset.sourceUrl || video.dataset.previewUrl || "";
        if (src) {
          video.removeAttribute("src");
          video.src = src;
          try { video.load(); } catch { /* ignore */ }
          return;
        }
      }
      markPlaceholder();
    });
    setTimeout(markPlaceholder, 1800);
  }

  function centerActualImage(force = false) {
    const lb = lightbox();
    const img = currentImg();
    if (!lb || !img || lb.dataset.zoom !== "actual") return;
    if (lb.dataset.dragging === "true") return;
    if (!img.complete || !img.naturalWidth || !img.naturalHeight) {
      img.addEventListener("load", () => centerActualImage(true), { once: true });
      return;
    }
    const token = [img.currentSrc || img.src, lb.clientWidth, lb.clientHeight, img.naturalWidth, img.naturalHeight].join("|");
    if (!force && lb.dataset.flPolishCentered === token) return;
    lb.dataset.flCentering = "true";
    lb.dataset.flPolishCentered = token;
    const run = () => {
      if (lb.dataset.active !== "true" || lb.dataset.zoom !== "actual") return;
      const left = Math.max(0, Math.round((lb.scrollWidth - lb.clientWidth) / 2));
      const top = Math.max(0, Math.round((lb.scrollHeight - lb.clientHeight) / 2));
      lb.scrollLeft = left;
      lb.scrollTop = top;
      requestAnimationFrame(() => { if (lb.dataset.zoom === "actual") delete lb.dataset.flCentering; });
    };
    requestAnimationFrame(run);
    setTimeout(run, 80);
  }

  function clickNext() {
    const arrow = lightbox()?.querySelector?.('.xiv-lightbox-arrow[data-side="right"]');
    if (arrow) arrow.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  }

  function syncAutoButton() {
    const lb = lightbox();
    if (!lb) {
      stopAuto();
      return;
    }
    let button = lb.querySelector(".xiv-lightbox-auto-next");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "xiv-lightbox-auto-next";
      button.title = "自动切换大图";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        toggleAuto();
      });
      lb.appendChild(button);
    }
    button.dataset.playing = autoPlaying ? "true" : "false";
  }

  function toggleAuto() {
    if (autoPlaying) {
      stopAuto();
      return;
    }
    autoPlaying = true;
    clearInterval(autoTimer);
    autoTimer = setInterval(clickNext, 1500);
    syncAutoButton();
  }

  function stopAuto() {
    autoPlaying = false;
    clearInterval(autoTimer);
    autoTimer = 0;
    const button = document.querySelector(".xiv-lightbox-auto-next");
    if (button) button.dataset.playing = "false";
  }

  function apply() {
    injectStyle();
    document.querySelectorAll("#xiv-root img").forEach(improveImage);
    document.querySelectorAll("#xiv-root video").forEach(improveVideo);
    syncAutoButton();
    if (lightbox()?.dataset.zoom === "actual") centerActualImage(false);
  }

  function scheduleApply() {
    clearTimeout(applyTimer);
    applyTimer = setTimeout(apply, 80);
  }

  document.addEventListener("keydown", (event) => {
    if (event.key?.toLowerCase() === "p" && lightbox()) {
      event.preventDefault();
      event.stopPropagation();
      toggleAuto();
    }
    if (event.key === "Escape") stopAuto();
  }, true);

  new MutationObserver((mutations) => {
    let zoomChanged = false;
    for (const mutation of mutations) {
      if (mutation.target?.id === "xiv-lightbox" && (mutation.attributeName === "data-zoom" || mutation.attributeName === "data-active")) zoomChanged = true;
      if (mutation.target?.tagName === "IMG" || mutation.target?.tagName === "VIDEO") zoomChanged = true;
    }
    scheduleApply();
    if (zoomChanged) setTimeout(() => centerActualImage(true), 0);
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-active", "data-zoom", "src", "poster", "class"]
  });

  window.addEventListener("resize", () => setTimeout(() => centerActualImage(true), 120), { passive: true });
  window.addEventListener("orientationchange", () => setTimeout(() => centerActualImage(true), 260), { passive: true });

  injectStyle();
  scheduleApply();
})();
