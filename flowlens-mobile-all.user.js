// ==UserScript==
// @name         瀑光 FlowLens 手机整合版
// @namespace    local.flowlens.mobile.all
// @version      1.7.0
// @description  去重修复版：知乎图片流自动隐藏重复图片，保留全屏、xchina 加速和同步防限流。
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      *
// @connect      api.github.com
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/page-bookmarks.js?fl=1.7.0
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/454158f8e196ac28c0416d06a8dec51a635d4c5a/flowlens-mobile-all.user.js
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/871f2e8ee650bd31c995ef08439773528bf0d95a/flowlens-mobile-all.user.js
// @downloadURL  https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-mobile-all.user.js
// @updateURL    https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-mobile-all.user.js
// ==/UserScript==

(() => {
  if (window.__flowLensRelease170Patch) return;
  window.__flowLensRelease170Patch = true;
  const VERSION = "1.7.0";

  function setVersion() {
    const prev = window.__FlowLensVersion || {};
    window.__FlowLensVersion = {
      ...prev,
      version: VERSION,
      channel: "stable",
      features: Array.from(new Set([...(prev.features || []), "zhihu-media-dedupe", "topbar-fullscreen-button", "fast-photo-site-mode"]))
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

  function normalizeMediaKey(raw) {
    if (!raw) return "";
    try {
      const url = new URL(String(raw).replace(/&amp;/g, "&"), location.href);
      const host = url.hostname.replace(/^i\d+\./i, "").toLowerCase();
      const path = decodeURIComponent(url.pathname || "").toLowerCase();
      const zh = path.match(/(?:^|\/)(v2-[a-f0-9]{16,})(?:_[^/.]+)?\.(?:jpe?g|png|webp|gif)/i);
      if (zh) return `zhimg:${zh[1].toLowerCase()}`;
      const generic = path.replace(/([_-])(?:small|middle|large|hd|origin|thumb|thumbnail|720w|1080w|1200w)(?=\.)/gi, "");
      return `${host}${generic}`;
    } catch {
      return String(raw).split(/[?#]/)[0].toLowerCase();
    }
  }
  function mediaCandidateUrl(node) {
    if (!node) return "";
    if (node.tagName === "IMG") {
      return node.currentSrc || node.src || node.getAttribute("data-original") || node.getAttribute("data-src") || node.getAttribute("src") || "";
    }
    if (node.tagName === "VIDEO") {
      return node.currentSrc || node.src || node.poster || node.querySelector?.("source[src]")?.src || "";
    }
    return mediaCandidateUrl(node.querySelector?.("img,video"));
  }
  function dedupeVisibleMedia() {
    const root = document.getElementById("xiv-root");
    if (!root) return;
    const isZhihuPage = /(^|\.)zhihu\.com$/i.test(location.hostname) || root.querySelector('img[src*="zhimg.com"],img[src*="zhihu.com"]');
    if (!isZhihuPage) return;
    if (!document.getElementById("flowlens-dedupe-170")) {
      const style = document.createElement("style");
      style.id = "flowlens-dedupe-170";
      style.textContent = '#xiv-root .fl-dup-hidden{display:none!important}';
      document.documentElement.appendChild(style);
    }
    const seen = new Map();
    let hidden = 0;
    const tiles = Array.from(root.querySelectorAll(".xiv-tile,.xiv-card,[data-xiv-media]")).filter((tile) => tile.querySelector("img,video"));
    for (const tile of tiles) {
      const key = normalizeMediaKey(mediaCandidateUrl(tile));
      if (!key) continue;
      if (seen.has(key)) {
        tile.classList.add("fl-dup-hidden");
        tile.dataset.flDuplicateOf = key;
        hidden += 1;
      } else {
        seen.set(key, tile);
        tile.classList.remove("fl-dup-hidden");
        delete tile.dataset.flDuplicateOf;
      }
    }
    if (hidden) root.dataset.zhihuDedupeHidden = String(hidden);
  }
  function startDedupePatch() {
    let timer = 0;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { setVersion(); dedupeVisibleMedia(); }, 220);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    setInterval(schedule, 1800);
  }

  setVersion();
  startDedupePatch();
})();
