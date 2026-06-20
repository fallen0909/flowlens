// ==UserScript==
// @name         瀑光 FlowLens 手机整合版
// @namespace    local.flowlens.mobile.all
// @version      1.5.5
// @description  稳定版：沉浸式网页图片与视频瀑布流，收藏入口改为顶部图标。
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      *
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/5cc49acf9f9281da94d0a06084d892ab4cd04e75/flowlens-mobile-all.user.js
// @downloadURL  https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-mobile-all.user.js
// @updateURL    https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-mobile-all.user.js
// ==/UserScript==

(() => {
  if (window.__flowLensBookmarkTopbarFix155) return;
  window.__flowLensBookmarkTopbarFix155 = true;

  const KEY = "flowlens-page-bookmarks-v1";
  const LIMIT = 300;

  function injectStyle() {
    if (document.getElementById("flowlens-bookmark-topbar-fix-155")) return;
    const style = document.createElement("style");
    style.id = "flowlens-bookmark-topbar-fix-155";
    style.textContent = `
      #xiv-root #xiv-page-bookmarks-controls {
        top: max(8px, env(safe-area-inset-top, 0px) + 8px) !important;
        right: max(106px, env(safe-area-inset-right, 0px) + 106px) !important;
        display: flex !important;
        flex-direction: row !important;
        gap: 7px !important;
        z-index: 2147483647 !important;
      }
      #xiv-root[data-lightbox-active="true"] #xiv-page-bookmarks-controls { display: none !important; }
      #xiv-root #xiv-page-bookmarks-controls button {
        width: 38px !important;
        min-width: 38px !important;
        height: 38px !important;
        padding: 0 !important;
        font-size: 0 !important;
        display: grid !important;
        place-items: center !important;
      }
      #xiv-root #xiv-page-bookmarks-controls button::before {
        font-size: 20px !important;
        line-height: 1 !important;
        font-weight: 900 !important;
      }
      #xiv-root #xiv-page-bookmarks-controls [data-xiv="page-bookmark-toggle"]::before { content: "☆"; }
      #xiv-root #xiv-page-bookmarks-controls [data-xiv="page-bookmark-toggle"][data-saved="true"]::before { content: "★"; color: #ffb648; }
      #xiv-root #xiv-page-bookmarks-controls [data-xiv="page-bookmark-list"]::before { content: "☰"; }
    `;
    document.documentElement.appendChild(style);
  }

  function normalizeUrl(url = location.href) {
    try {
      const parsed = new URL(url, location.href);
      parsed.hash = "";
      return parsed.href;
    } catch {
      return String(url || "").split("#")[0];
    }
  }

  function isX810114Profile(url) {
    try {
      const parsed = new URL(url, location.href);
      const parts = parsed.pathname.split("/").filter(Boolean);
      return /^x\.810114\.xyz$/i.test(parsed.hostname) && parts.length === 1 && /^[A-Za-z0-9_]{2,64}$/.test(parts[0]);
    } catch {
      return false;
    }
  }

  function currentBookmarkUrl() {
    const candidates = [
      location.href,
      document.querySelector('link[rel="canonical"]')?.href || "",
      document.querySelector('meta[property="og:url"], meta[name="og:url"]')?.getAttribute?.("content") || ""
    ].filter(Boolean).map(normalizeUrl);
    return candidates.find(isX810114Profile) || candidates[0] || normalizeUrl();
  }

  function json(text, fallback) { try { return JSON.parse(text || "") || fallback; } catch { return fallback; } }
  async function readBookmarks() {
    try { if (typeof GM_getValue === "function") return json(await Promise.resolve(GM_getValue(KEY, "[]")), []); } catch {}
    try { return json(localStorage.getItem(KEY), []); } catch { return []; }
  }
  async function writeBookmarks(items) {
    const clean = items.slice(0, LIMIT);
    const text = JSON.stringify(clean);
    let saved = false;
    try { if (typeof GM_setValue === "function") { await Promise.resolve(GM_setValue(KEY, text)); saved = true; } } catch {}
    if (!saved) { try { localStorage.setItem(KEY, text); } catch {} }
    window.dispatchEvent(new CustomEvent("flowlens:bookmarks-changed", { detail: { items: clean } }));
  }
  function hostOf(url) { try { return new URL(url, location.href).hostname; } catch { return ""; } }
  function status(text) { const node = document.getElementById("xiv-status"); if (node) node.textContent = text; }
  function cover() {
    const node = document.querySelector('meta[property="og:image"], meta[name="twitter:image"], #xiv-root .xiv-tile img[src], img[src]');
    const raw = node?.getAttribute?.("content") || node?.getAttribute?.("src") || "";
    try { return raw ? new URL(raw, location.href).href : ""; } catch { return ""; }
  }
  async function syncButton() {
    const button = document.querySelector('#xiv-root #xiv-page-bookmarks-controls [data-xiv="page-bookmark-toggle"]');
    if (!button) return;
    const url = currentBookmarkUrl();
    const saved = (await readBookmarks()).some((item) => normalizeUrl(item.url) === url);
    button.dataset.saved = saved ? "true" : "false";
    button.title = saved ? "已收藏本页" : "收藏本页";
  }
  async function toggleBookmark(event) {
    const button = event.target?.closest?.('#xiv-root #xiv-page-bookmarks-controls [data-xiv="page-bookmark-toggle"]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    const url = currentBookmarkUrl();
    const list = await readBookmarks();
    const exists = list.some((item) => normalizeUrl(item.url) === url);
    if (exists) {
      await writeBookmarks(list.filter((item) => normalizeUrl(item.url) !== url));
      status("已取消收藏当前页面");
    } else {
      const now = new Date().toISOString();
      await writeBookmarks([{ url, title: (document.title || hostOf(url) || "未命名页面").replace(/\s+/g, " ").trim(), host: hostOf(url), cover: cover(), mediaCount: document.querySelectorAll("#xiv-root .xiv-tile").length || 0, createdAt: now, updatedAt: now }, ...list]);
      status("已收藏当前页面");
    }
    syncButton();
  }

  injectStyle();
  document.addEventListener("click", toggleBookmark, true);
  setInterval(() => { injectStyle(); syncButton(); }, 1000);
  window.addEventListener("flowlens:bookmarks-changed", syncButton);
})();
