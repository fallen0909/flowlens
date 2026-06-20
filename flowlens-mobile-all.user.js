// ==UserScript==
// @name         瀑光 FlowLens 手机整合版
// @namespace    local.flowlens.mobile.all
// @version      1.5.8
// @description  稳定版：收藏入口在顶部最左侧，收藏列表打开保持在图片流内。
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
  if (window.__flowLensBookmarkTopbarLeftFix158) return;
  window.__flowLensBookmarkTopbarLeftFix158 = true;

  const KEY = "flowlens-page-bookmarks-v1";
  const LIMIT = 300;
  const SAVE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4.5h12a1 1 0 0 1 1 1v15l-7-4-7 4v-15a1 1 0 0 1 1-1Z"/></svg>';
  const LIST_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6h11M8 12h11M8 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/></svg>';

  function root() { return document.getElementById("xiv-root"); }
  function actions() { return root()?.querySelector("#xiv-topbar .xiv-actions") || null; }

  function injectStyle() {
    if (document.getElementById("flowlens-bookmark-topbar-left-fix-158")) return;
    const style = document.createElement("style");
    style.id = "flowlens-bookmark-topbar-left-fix-158";
    style.textContent = `
      #xiv-root #xiv-page-bookmarks-controls { display: none !important; }
      #xiv-root .fl-bookmarks-tools { display: none !important; }
      #xiv-root .fl158-bookmark-btn span { display: none !important; }
      #xiv-root .fl158-bookmark-btn svg { width: 21px !important; height: 21px !important; }
      #xiv-root .fl158-bookmark-btn[data-saved="true"] {
        color: #ffb648 !important;
        border-color: rgba(255,190,80,.56) !important;
        background: rgba(255,190,80,.22) !important;
      }
      #xiv-root .fl158-bookmark-btn[data-saved="true"] svg { fill: currentColor !important; }
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

  function x810114SlugFromUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (!/^x\.810114\.xyz$/i.test(parsed.hostname)) return "";
      if (parts.length !== 1) return "";
      return /^[A-Za-z0-9_]{2,64}$/.test(parts[0]) ? parts[0] : "";
    } catch {
      return "";
    }
  }

  function currentBookmarkUrl() {
    const direct = normalizeUrl(location.href);
    if (x810114SlugFromUrl(direct)) return direct;
    const candidates = [
      document.querySelector('link[rel="canonical"]')?.href || "",
      document.querySelector('meta[property="og:url"], meta[name="og:url"]')?.getAttribute?.("content") || "",
      direct
    ].filter(Boolean).map(normalizeUrl);
    return candidates.find((url) => x810114SlugFromUrl(url)) || candidates[0] || direct;
  }

  function safeJson(text, fallback) { try { return JSON.parse(text || "") || fallback; } catch { return fallback; } }
  async function readBookmarks() {
    try { if (typeof GM_getValue === "function") return safeJson(await Promise.resolve(GM_getValue(KEY, "[]")), []); } catch {}
    try { return safeJson(localStorage.getItem(KEY), []); } catch { return []; }
  }
  async function writeBookmarks(items) {
    const clean = items.slice(0, LIMIT);
    const text = JSON.stringify(clean);
    let gmSaved = false;
    try { if (typeof GM_setValue === "function") { await Promise.resolve(GM_setValue(KEY, text)); gmSaved = true; } } catch {}
    if (!gmSaved) { try { localStorage.setItem(KEY, text); } catch {} }
    window.dispatchEvent(new CustomEvent("flowlens:bookmarks-changed", { detail: { items: clean } }));
  }
  function hostOf(url) { try { return new URL(url, location.href).hostname; } catch { return ""; } }
  function status(text) { const node = document.getElementById("xiv-status"); if (node) node.textContent = text; }

  function absoluteUrl(raw) {
    try { return raw ? new URL(raw, location.href).href : ""; } catch { return ""; }
  }

  function findProfileElement(slug) {
    if (!slug) return null;
    const needle = `@${slug}`.toLowerCase();
    const nodes = Array.from(document.querySelectorAll("body *"));
    return nodes.find((el) => {
      const text = (el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      return text.includes(needle) && text.length < 240;
    }) || null;
  }

  function profileMeta(url) {
    const slug = x810114SlugFromUrl(url);
    const meta = { title: "", avatar: "" };
    if (!slug) return meta;
    const hit = findProfileElement(slug);
    if (hit) {
      const parts = (hit.textContent || "")
        .split(/\n|\r|\t| {2,}/)
        .map((part) => part.replace(/\s+/g, " ").trim())
        .filter(Boolean);
      const atIndex = parts.findIndex((part) => part.toLowerCase().includes(`@${slug}`.toLowerCase()));
      const title = atIndex > 0 ? parts[atIndex - 1] : parts.find((part) => !part.startsWith("@") && !part.includes("@"));
      if (title) meta.title = title;
      let box = hit;
      for (let i = 0; i < 5 && box; i += 1, box = box.parentElement) {
        const img = box.querySelector?.("img[src]");
        const src = absoluteUrl(img?.getAttribute?.("src") || img?.currentSrc || "");
        if (src) { meta.avatar = src; break; }
      }
    }
    if (!meta.title) {
      const title = (document.title || "").replace(/\s+/g, " ").trim();
      meta.title = title && !/^x\.810114/i.test(title) ? title : slug;
    }
    if (!meta.avatar) {
      const img = document.querySelector('meta[property="og:image"], meta[name="twitter:image"], img[src]');
      meta.avatar = absoluteUrl(img?.getAttribute?.("content") || img?.getAttribute?.("src") || img?.currentSrc || "");
    }
    return meta;
  }

  function fallbackCover() {
    const node = document.querySelector('meta[property="og:image"], meta[name="twitter:image"], #xiv-root .xiv-tile img[src], img[src]');
    return absoluteUrl(node?.getAttribute?.("content") || node?.getAttribute?.("src") || node?.currentSrc || "");
  }

  async function syncButton() {
    const button = root()?.querySelector('[data-fl158="bookmark-toggle"]');
    if (!button) return;
    const url = currentBookmarkUrl();
    const saved = (await readBookmarks()).some((item) => normalizeUrl(item.url) === url);
    button.dataset.saved = saved ? "true" : "false";
    button.title = saved ? "已收藏本页" : "收藏本页";
    button.setAttribute("aria-label", button.title);
  }

  async function toggleBookmark(event) {
    const button = event.target?.closest?.('[data-fl158="bookmark-toggle"]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    const url = currentBookmarkUrl();
    const meta = profileMeta(url);
    const list = await readBookmarks();
    const exists = list.some((item) => normalizeUrl(item.url) === url);
    if (exists) {
      await writeBookmarks(list.filter((item) => normalizeUrl(item.url) !== url));
      status("已取消收藏当前页面");
    } else {
      const now = new Date().toISOString();
      await writeBookmarks([{ url, title: meta.title || hostOf(url) || url, host: hostOf(url), cover: meta.avatar || fallbackCover(), mediaCount: document.querySelectorAll("#xiv-root .xiv-tile").length || 0, createdAt: now, updatedAt: now }, ...list]);
      status("已收藏当前页面");
    }
    syncButton();
  }

  function showBookmarkList(event) {
    const button = event.target?.closest?.('[data-fl158="bookmark-list"]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    window.dispatchEvent(new CustomEvent("flowlens:bookmark-list"));
  }

  function wrapSavedPageLoader() { }

  function makeButton(type, icon, title) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "xiv-btn fl158-bookmark-btn";
    button.dataset.fl158 = type;
    button.title = title;
    button.setAttribute("aria-label", title);
    button.innerHTML = `${icon}<span>${title}</span>`;
    return button;
  }

  function ensureButtons() {
    injectStyle();
    const bar = actions();
    if (!bar) return;
    if (!bar.querySelector('[data-fl158="bookmark-toggle"]')) {
      const toggle = makeButton("bookmark-toggle", SAVE_ICON, "收藏本页");
      bar.insertBefore(toggle, bar.firstElementChild || null);
    }
    if (!bar.querySelector('[data-fl158="bookmark-list"]')) {
      const list = makeButton("bookmark-list", LIST_ICON, "收藏列表");
      const toggle = bar.querySelector('[data-fl158="bookmark-toggle"]');
      if (toggle?.nextSibling) bar.insertBefore(list, toggle.nextSibling);
      else bar.insertBefore(list, bar.firstElementChild || null);
    }
    syncButton();
  }

  document.addEventListener("click", toggleBookmark, true);
  document.addEventListener("click", showBookmarkList, true);
  ensureButtons();
  setInterval(ensureButtons, 800);
  new MutationObserver(ensureButtons).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-active", "class"] });
})();
