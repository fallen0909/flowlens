// ==UserScript==
// @name         瀑光 FlowLens 手机整合版
// @namespace    local.flowlens.mobile.all
// @version      1.6.4
// @description  同步版：收藏自动同步，收藏打开进入目标页图片流。
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      *
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/page-bookmarks.js
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/454158f8e196ac28c0416d06a8dec51a635d4c5a/flowlens-mobile-all.user.js
// @downloadURL  https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-mobile-all.user.js
// @updateURL    https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-mobile-all.user.js
// ==/UserScript==

(() => {
  if (window.__flowLensRelease164Patch) return;
  window.__flowLensRelease164Patch = true;
  const VERSION = "1.6.4";
  const AUTO_KEY = "flowlens-gallery-queue-auto-open";
  const BOOKMARK_AUTO_KEY = "flowlens-bookmark-auto-open";

  function normalizeUrl(url = location.href) {
    try {
      const parsed = new URL(url, location.href);
      parsed.hash = "";
      return parsed.href;
    } catch {
      return String(url || "").split("#")[0];
    }
  }
  function sameUrl(a, b) {
    return normalizeUrl(a).toLowerCase() === normalizeUrl(b).toLowerCase();
  }
  function x810114Slug(url) {
    try {
      const parsed = new URL(url, location.href);
      const parts = parsed.pathname.split("/").filter(Boolean);
      return /^x\.810114\.xyz$/i.test(parsed.hostname) && parts.length === 1 && /^[A-Za-z0-9_]{2,64}$/.test(parts[0]) ? parts[0] : "";
    } catch {
      return "";
    }
  }
  function setVersion() {
    const prev = window.__FlowLensVersion || {};
    window.__FlowLensVersion = {
      ...prev,
      version: VERSION,
      channel: "stable",
      features: Array.from(new Set([...(prev.features || []), "page-bookmarks-auto-sync", "bookmark-target-auto-open"]))
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
  function status(text) {
    const node = document.getElementById("xiv-status");
    if (node) node.textContent = text;
  }
  function openTargetPageInFlow(url) {
    const target = normalizeUrl(url);
    if (!x810114Slug(target)) return false;
    try {
      sessionStorage.setItem(AUTO_KEY, target);
      sessionStorage.setItem(BOOKMARK_AUTO_KEY, target);
    } catch {}
    status("正在打开收藏页面");
    if (!sameUrl(target, location.href)) location.assign(target);
    else window.setTimeout(() => document.getElementById("xiv-launch")?.click?.(), 250);
    return true;
  }
  function patchControlApi() {
    const api = window.__flowLensControl;
    if (!api || typeof api.loadSavedPage !== "function" || api.__flowLensBookmarkOpen164) return;
    const original = api.loadSavedPage.bind(api);
    api.loadSavedPage = (url) => {
      if (openTargetPageInFlow(url)) return Promise.resolve(true);
      return original(url);
    };
    api.__flowLensBookmarkOpen164 = true;
  }
  function autoOpenAfterNavigation() {
    let target = "";
    try {
      target = sessionStorage.getItem(BOOKMARK_AUTO_KEY) || sessionStorage.getItem(AUTO_KEY) || "";
    } catch {}
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
  setVersion();
  patchControlApi();
  autoOpenAfterNavigation();
  setInterval(() => { setVersion(); patchControlApi(); }, 800);
})();
