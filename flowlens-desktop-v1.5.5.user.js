// ==UserScript==
// @name         瀑光 FlowLens 电脑油猴版 v1.5.5
// @namespace    local.flowlens.desktop.v155
// @version      1.5.5
// @description  FlowLens v1.5.5：收藏入口改为顶部图标，并修复 x.810114 个人主页收藏地址。
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      *
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-desktop.user.js
// @downloadURL  https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-desktop-v1.5.5.user.js
// @updateURL    https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-desktop-v1.5.5.user.js
// ==/UserScript==

(() => {
  if (window.__flowLens155PageBookmarkPatch) return;
  window.__flowLens155PageBookmarkPatch = true;

  const KEY = "flowlens-page-bookmarks-v1";
  const MAX_ITEMS = 300;
  const iconSave = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4.5h12a1 1 0 0 1 1 1v15l-7-4-7 4v-15a1 1 0 0 1 1-1Z"/></svg>';
  const iconList = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h11M8 12h11M8 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/></svg>';

  function injectStyle() {
    if (document.getElementById("flowlens-v155-bookmark-style")) return;
    const style = document.createElement("style");
    style.id = "flowlens-v155-bookmark-style";
    style.textContent = `
      #xiv-root #xiv-page-bookmarks-controls { display: none !important; }
      #xiv-root .fl-bookmarks-tools { display: none !important; }
      #xiv-root .fl155-page-bookmark[data-saved="true"] {
        color: #ffb648 !important;
        border-color: rgba(255,190,80,.56) !important;
        background: rgba(255,190,80,.22) !important;
      }
      #xiv-root .fl155-page-bookmark[data-saved="true"] svg { fill: currentColor !important; }
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

  function isX810114ProfileUrl(url) {
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
      window.__flowLensControl?.currentPageBookmarkUrl?.(),
      location.href,
      document.querySelector('link[rel="canonical"]')?.href || "",
      document.querySelector('meta[property="og:url"], meta[name="og:url"]')?.getAttribute?.("content") || "",
      ...Array.from(document.querySelectorAll('a[href^="https://x.810114.xyz/"], a[href^="/"')).slice(0, 120).map((a) => a.href || a.getAttribute("href") || "")
    ].filter(Boolean).map(normalizeUrl);
    return candidates.find(isX810114ProfileUrl) || candidates[0] || normalizeUrl();
  }

  function hostOf(url) { try { return new URL(url, location.href).hostname; } catch { return ""; } }
  function safeJson(text, fallback) { try { return JSON.parse(text || "") || fallback; } catch { return fallback; } }
  async function readBookmarks() {
    try { if (typeof GM_getValue === "function") return safeJson(await Promise.resolve(GM_getValue(KEY, "[]")), []); } catch {}
    try { return safeJson(localStorage.getItem(KEY), []); } catch { return []; }
  }
  async function writeBookmarks(items) {
    const clean = items.slice(0, MAX_ITEMS);
    const text = JSON.stringify(clean);
    let usedGm = false;
    try { if (typeof GM_setValue === "function") { await Promise.resolve(GM_setValue(KEY, text)); usedGm = true; } } catch {}
    if (!usedGm) { try { localStorage.setItem(KEY, text); } catch {} }
    window.dispatchEvent(new CustomEvent("flowlens:bookmarks-changed", { detail: { items: clean } }));
  }
  function coverOfCurrentPage() {
    const node = document.querySelector('meta[property="og:image"], meta[name="twitter:image"], #xiv-root .xiv-tile img[src], img[src]');
    const raw = node?.getAttribute?.("content") || node?.getAttribute?.("src") || "";
    try { return raw ? new URL(raw, location.href).href : ""; } catch { return ""; }
  }
  function setStatus(text) { const node = document.getElementById("xiv-status"); if (node) node.textContent = text; }
  function setButtonLabel(button, label) { button.title = label; button.setAttribute("aria-label", label); const span = button.querySelector("span"); if (span) span.textContent = label; }

  async function syncButton() {
    const btn = document.querySelector('#xiv-root .fl155-page-bookmark[data-fl155="toggle"]');
    if (!btn) return;
    const current = currentBookmarkUrl();
    const saved = (await readBookmarks()).some((item) => normalizeUrl(item.url) === current);
    btn.dataset.saved = saved ? "true" : "false";
    setButtonLabel(btn, saved ? "已收藏本页" : "收藏本页");
  }

  async function toggleBookmark() {
    const url = currentBookmarkUrl();
    const list = await readBookmarks();
    const exists = list.some((item) => normalizeUrl(item.url) === url);
    if (exists) {
      await writeBookmarks(list.filter((item) => normalizeUrl(item.url) !== url));
      setStatus("已取消收藏当前页面");
    } else {
      const now = new Date().toISOString();
      await writeBookmarks([{ url, title: (document.title || hostOf(url) || "未命名页面").replace(/\s+/g, " ").trim(), host: hostOf(url), cover: coverOfCurrentPage(), mediaCount: document.querySelectorAll("#xiv-root .xiv-tile").length || 0, createdAt: now, updatedAt: now }, ...list]);
      setStatus("已收藏当前页面");
    }
    syncButton();
  }

  function ensureToolbarButtons() {
    injectStyle();
    const root = document.getElementById("xiv-root");
    const actions = root?.querySelector("#xiv-topbar .xiv-actions");
    if (!actions) return;
    if (!actions.querySelector('[data-fl155="toggle"]')) {
      const toggle = document.createElement("button");
      toggle.className = "xiv-btn fl155-page-bookmark";
      toggle.type = "button";
      toggle.dataset.fl155 = "toggle";
      toggle.innerHTML = `${iconSave}<span>收藏本页</span>`;
      toggle.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); toggleBookmark(); });
      const links = actions.querySelector('[data-xiv="links"]');
      if (links) links.before(toggle); else actions.appendChild(toggle);
    }
    if (!actions.querySelector('[data-fl155="list"]')) {
      const list = document.createElement("button");
      list.className = "xiv-btn fl155-page-bookmark-list";
      list.type = "button";
      list.dataset.fl155 = "list";
      list.title = "收藏列表";
      list.setAttribute("aria-label", "收藏列表");
      list.innerHTML = `${iconList}<span>收藏列表</span>`;
      list.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); window.dispatchEvent(new CustomEvent("flowlens:bookmark-list")); });
      const links = actions.querySelector('[data-xiv="links"]');
      if (links) links.before(list); else actions.appendChild(list);
    }
    syncButton();
  }

  ensureToolbarButtons();
  setInterval(ensureToolbarButtons, 800);
  new MutationObserver(ensureToolbarButtons).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-active", "class"] });
})();
