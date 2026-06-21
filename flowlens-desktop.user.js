// ==UserScript==
// @name         瀑光 FlowLens 电脑油猴版
// @namespace    local.flowlens.desktop
// @version      1.6.8
// @description  xchina 加速版：提升多图页面加载速度，降低大量图片/视频卡顿，收藏同步低频防限流。
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      *
// @connect      api.github.com
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/page-bookmarks.js?fl=1.6.8
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/454158f8e196ac28c0416d06a8dec51a635d4c5a/flowlens-desktop.user.js
// @downloadURL  https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-desktop.user.js
// @updateURL    https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-desktop.user.js
// ==/UserScript==

(() => {
  if (window.__flowLensRelease168Patch) return;
  window.__flowLensRelease168Patch = true;
  const VERSION = "1.6.8";
  const AUTO_KEY = "flowlens-gallery-queue-auto-open";
  const BOOKMARK_AUTO_KEY = "flowlens-bookmark-auto-open";
  const hintedHosts = new Set();

  function normalizeUrl(url = location.href) {
    try { const parsed = new URL(url, location.href); parsed.hash = ""; return parsed.href; }
    catch { return String(url || "").split("#")[0]; }
  }
  function sameUrl(a, b) { return normalizeUrl(a).toLowerCase() === normalizeUrl(b).toLowerCase(); }
  function x810114Slug(url) {
    try {
      const parsed = new URL(url, location.href);
      const parts = parsed.pathname.split("/").filter(Boolean);
      return /^x\.810114\.xyz$/i.test(parsed.hostname) && parts.length === 1 && /^[A-Za-z0-9_]{2,64}$/.test(parts[0]) ? parts[0] : "";
    } catch { return ""; }
  }
  function isFastPhotoSite() {
    try {
      const u = new URL(location.href);
      return /(^|\.)xchina\.co$/i.test(u.hostname) && /^\/photo\/id-[^/]+\/\d+\.html$/i.test(u.pathname);
    } catch { return false; }
  }
  function status(text) { const node = document.getElementById("xiv-status"); if (node) node.textContent = text; }

  function setVersion() {
    const prev = window.__FlowLensVersion || {};
    window.__FlowLensVersion = {
      ...prev,
      version: VERSION,
      channel: "stable",
      features: Array.from(new Set([...(prev.features || []), "page-bookmarks-auto-sync-throttled", "large-gallery-performance-mode", "fast-photo-site-mode"]))
    };
    window.__FLOWLENS_VERSION__ = VERSION;
    window.__flowLensGetVersion = () => window.__FlowLensVersion;
    document.querySelectorAll('#xiv-root .xiv-setting-row, #xiv-root label, #xiv-root div').forEach((row) => {
      if (/瀑光版本|FlowLens\s*版本|版本/.test(row.textContent || "") && /v?\d+\.\d+\.\d+/.test(row.textContent || "")) {
        const target = row.querySelector?.(".fl-version-value,strong,b,em,code") || row.children?.[row.children.length - 1] || row;
        if (target) target.textContent = `v${VERSION}`;
      }
    });
  }

  function openTargetPageInFlow(url) {
    const target = normalizeUrl(url);
    if (!x810114Slug(target)) return false;
    try { sessionStorage.setItem(AUTO_KEY, target); sessionStorage.setItem(BOOKMARK_AUTO_KEY, target); } catch {}
    status("正在打开收藏页面");
    if (!sameUrl(target, location.href)) location.assign(target);
    else window.setTimeout(() => document.getElementById("xiv-launch")?.click?.(), 250);
    return true;
  }
  function patchControlApi() {
    const api = window.__flowLensControl;
    if (!api || typeof api.loadSavedPage !== "function" || api.__flowLensBookmarkOpen168) return;
    const original = api.loadSavedPage.bind(api);
    api.loadSavedPage = (url) => openTargetPageInFlow(url) ? Promise.resolve(true) : original(url);
    api.__flowLensBookmarkOpen168 = true;
  }
  function autoOpenAfterNavigation() {
    let target = "";
    try { target = sessionStorage.getItem(BOOKMARK_AUTO_KEY) || sessionStorage.getItem(AUTO_KEY) || ""; } catch {}
    if (!target || !sameUrl(target, location.href)) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      const root = document.getElementById("xiv-root");
      if (root?.dataset.active === "true") {
        window.clearInterval(timer);
        try { sessionStorage.removeItem(BOOKMARK_AUTO_KEY); } catch {}
        return;
      }
      document.getElementById("xiv-launch")?.click?.();
      if (tries > 12) window.clearInterval(timer);
    }, 500);
  }

  function injectPerformanceStyle() {
    if (document.getElementById("flowlens-performance-168")) return;
    const style = document.createElement("style");
    style.id = "flowlens-performance-168";
    style.textContent = `
      #xiv-root[data-perf-mode="true"] .xiv-tile,
      #xiv-root[data-perf-mode="true"] .xiv-card,
      #xiv-root[data-perf-mode="true"] [data-xiv-media] {
        content-visibility: auto !important;
        contain-intrinsic-size: 360px 520px !important;
      }
      #xiv-root[data-perf-mode="true"] img,
      #xiv-root[data-perf-mode="true"] video { backface-visibility: hidden !important; }
    `;
    document.documentElement.appendChild(style);
  }
  function addHostHint(url) {
    try {
      const origin = new URL(url, location.href).origin;
      if (hintedHosts.has(origin)) return;
      hintedHosts.add(origin);
      const a = document.createElement("link");
      a.rel = "preconnect";
      a.href = origin;
      a.crossOrigin = "anonymous";
      const b = document.createElement("link");
      b.rel = "dns-prefetch";
      b.href = origin;
      document.head?.append(a, b);
    } catch {}
  }
  function nearViewport(el, margin = 1400) {
    try { const r = el.getBoundingClientRect(); return r.bottom > -margin && r.top < window.innerHeight + margin; }
    catch { return true; }
  }
  function warmImage(img) {
    try {
      const src = img.currentSrc || img.src || img.getAttribute("data-src") || img.getAttribute("data-original") || "";
      if (!src) return;
      addHostHint(src);
      const probe = new Image();
      probe.decoding = "async";
      probe.src = src;
    } catch {}
  }
  function optimizeHeavyMedia() {
    const root = document.getElementById("xiv-root");
    if (!root) return;
    injectPerformanceStyle();
    const fastSite = isFastPhotoSite();
    const imgs = root.querySelectorAll("img");
    const videos = root.querySelectorAll("video");
    const mediaCount = imgs.length + videos.length;
    root.dataset.perfMode = mediaCount > 120 || fastSite ? "true" : "false";
    const eagerLimit = fastSite ? 140 : 36;
    const highPriorityLimit = fastSite ? 60 : 12;
    imgs.forEach((img, index) => {
      try {
        const near = nearViewport(img, fastSite ? 2400 : 1400);
        if (index < eagerLimit || near) {
          img.loading = "eager";
          img.fetchPriority = index < highPriorityLimit ? "high" : "auto";
          if (fastSite && index < 100) warmImage(img);
        } else {
          img.loading = "lazy";
          img.fetchPriority = "low";
        }
        img.decoding = "async";
      } catch {}
    });
    videos.forEach((video) => {
      try {
        const near = nearViewport(video);
        video.preload = near ? "metadata" : "none";
        video.disablePictureInPicture = true;
        if (!near && !video.paused) video.pause();
      } catch {}
    });
  }
  function startPerformancePatch() {
    let timer = 0;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(optimizeHeavyMedia, 160);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    setInterval(optimizeHeavyMedia, 1600);
  }

  setVersion();
  patchControlApi();
  autoOpenAfterNavigation();
  startPerformancePatch();
  setInterval(() => { setVersion(); patchControlApi(); }, 1000);
})();
