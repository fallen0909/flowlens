(() => {
  if (window.__flowLensPageBookmarksPatch) return;
  window.__flowLensPageBookmarksPatch = true;

  const KEY = "flowlens-page-bookmarks-v1";
  const MAX_ITEMS = 300;
  const SAVE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4.5h12a1 1 0 0 1 1 1v15l-7-4-7 4v-15a1 1 0 0 1 1-1Z"/></svg>';
  const LIST_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h11M8 12h11M8 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/></svg>';

  let cache = null;
  let installed = false;

  function root() { return document.getElementById("xiv-root"); }
  function actions() { return root()?.querySelector("#xiv-topbar .xiv-actions") || null; }
  function status(text) {
    const node = document.getElementById("xiv-status");
    if (node) node.textContent = text;
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
  function hostOf(url) {
    try { return new URL(url, location.href).hostname; } catch { return ""; }
  }
  function slugOfX810114(url) {
    try {
      const parsed = new URL(url, location.href);
      const parts = parsed.pathname.split("/").filter(Boolean);
      return /^x\.810114\.xyz$/i.test(parsed.hostname) && parts.length === 1 && /^[A-Za-z0-9_]{2,64}$/.test(parts[0]) ? parts[0] : "";
    } catch {
      return "";
    }
  }
  function currentUrl() {
    const current = normalizeUrl(location.href);
    if (slugOfX810114(current)) return current;
    const canonical = document.querySelector('link[rel="canonical"]')?.href || "";
    const og = document.querySelector('meta[property="og:url"],meta[name="og:url"]')?.getAttribute?.("content") || "";
    return [canonical, og, current].filter(Boolean).map(normalizeUrl).find(slugOfX810114) || current;
  }
  function titleForUrl(url) {
    const slug = slugOfX810114(url);
    if (slug) return `@${slug}`;
    return (document.title || hostOf(url) || "未命名页面").replace(/\s+/g, " ").trim();
  }
  function coverOfCurrentPage() {
    const node = document.querySelector('meta[property="og:image"],meta[name="twitter:image"],#xiv-root .xiv-tile img[src],img[src]');
    const raw = node?.getAttribute?.("content") || node?.getAttribute?.("src") || node?.currentSrc || "";
    try { return raw ? new URL(raw, location.href).href : ""; } catch { return ""; }
  }
  function safeJson(text, fallback) {
    try { return JSON.parse(text || "") || fallback; } catch { return fallback; }
  }
  async function readBookmarks() {
    if (cache) return cache;
    try {
      if (typeof GM_getValue === "function") {
        cache = safeJson(await Promise.resolve(GM_getValue(KEY, "[]")), []);
        return cache;
      }
    } catch {}
    try { cache = safeJson(localStorage.getItem(KEY), []); } catch { cache = []; }
    return cache;
  }
  async function writeBookmarks(items) {
    cache = items.filter((item) => item?.url).slice(0, MAX_ITEMS);
    const text = JSON.stringify(cache);
    let saved = false;
    try {
      if (typeof GM_setValue === "function") {
        await Promise.resolve(GM_setValue(KEY, text));
        saved = true;
      }
    } catch {}
    if (!saved) {
      try { localStorage.setItem(KEY, text); } catch {}
    }
    window.dispatchEvent(new CustomEvent("flowlens:bookmarks-changed", { detail: { items: cache } }));
  }
  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  }
  function displayTitle(item) {
    const slug = slugOfX810114(item?.url || "");
    const title = String(item?.title || "").trim();
    if (slug && (!title || title === "推图 - 推特看图纯享版" || title === item.host)) return `@${slug}`;
    return title || (slug ? `@${slug}` : item?.url || "未命名页面");
  }

  function injectStyle() {
    if (document.getElementById("fl-bookmarks-safe-style")) return;
    const style = document.createElement("style");
    style.id = "fl-bookmarks-safe-style";
    style.textContent = `
      #xiv-root #xiv-page-bookmarks-controls{display:none!important}
      #xiv-root .fl-bookmarks-tools{display:none!important}
      #xiv-root .fl-safe-bookmark-btn span{display:none!important}
      #xiv-root .fl-safe-bookmark-btn svg{width:21px!important;height:21px!important}
      #xiv-root .fl-safe-bookmark-btn[data-saved="true"]{color:#ffb648!important;border-color:rgba(255,190,80,.56)!important;background:rgba(255,190,80,.22)!important}
      #xiv-root .fl-safe-bookmark-btn[data-saved="true"] svg{fill:currentColor!important}
      #xiv-root .fl-safe-panel{position:fixed!important;right:max(12px,env(safe-area-inset-right,0px) + 8px)!important;top:max(62px,env(safe-area-inset-top,0px) + 58px)!important;width:min(390px,calc(100vw - 18px))!important;max-height:min(78vh,620px)!important;z-index:2147483647!important;display:none!important;overflow:hidden!important;border-radius:16px!important;background:rgba(248,249,251,.96)!important;color:#111!important;border:1px solid rgba(0,0,0,.08)!important;box-shadow:0 24px 72px rgba(0,0,0,.3)!important;backdrop-filter:blur(18px)!important;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important}
      #xiv-root[data-theme="dark"] .fl-safe-panel{background:rgba(18,19,23,.96)!important;color:#f5f5f5!important;border-color:rgba(255,255,255,.12)!important}
      #xiv-root .fl-safe-panel[data-open="true"]{display:flex!important;flex-direction:column!important}
      #xiv-root .fl-safe-head{display:flex!important;align-items:center!important;justify-content:space-between!important;padding:10px 12px!important;border-bottom:1px solid rgba(0,0,0,.08)!important}
      #xiv-root .fl-safe-head h3{margin:0!important;font-size:18px!important;font-weight:950!important}
      #xiv-root .fl-safe-close{width:32px!important;height:32px!important;border:0!important;border-radius:999px!important;font-size:18px!important;font-weight:900!important;background:rgba(0,0,0,.08)!important;color:inherit!important;cursor:pointer!important}
      #xiv-root .fl-safe-list{overflow:auto!important;padding:4px 8px 10px!important}
      #xiv-root .fl-safe-item{display:grid!important;grid-template-columns:44px minmax(0,1fr) auto!important;gap:8px!important;align-items:center!important;padding:8px!important;margin:5px 0!important;border-radius:12px!important;background:rgba(0,0,0,.045)!important}
      #xiv-root[data-theme="dark"] .fl-safe-item{background:rgba(255,255,255,.08)!important}
      #xiv-root .fl-safe-cover{width:44px!important;height:44px!important;border-radius:10px!important;object-fit:cover!important;background:rgba(0,0,0,.1)!important}
      #xiv-root .fl-safe-title{font-size:13px!important;font-weight:900!important;line-height:1.25!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
      #xiv-root .fl-safe-url{margin-top:2px!important;font-size:11px!important;color:#61708a!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;direction:ltr!important}
      #xiv-root .fl-safe-actions{display:flex!important;gap:4px!important;align-items:center!important}
      #xiv-root .fl-safe-actions button{height:30px!important;padding:0 10px!important;border:0!important;border-radius:999px!important;background:rgba(255,255,255,.86)!important;color:inherit!important;font-size:13px!important;font-weight:900!important;cursor:pointer!important}
      #xiv-root .fl-safe-actions [data-action="remove"]{color:#c2410c!important}
      @media(max-width:560px){#xiv-root .fl-safe-panel{left:6px!important;right:6px!important;width:auto!important}#xiv-root .fl-safe-item{grid-template-columns:42px minmax(0,1fr) auto!important}#xiv-root .fl-safe-actions button{padding:0 8px!important}}
    `;
    document.documentElement.appendChild(style);
  }
  function ensurePanel() {
    const r = root();
    if (!r) return null;
    let panel = r.querySelector(".fl-safe-panel");
    if (panel) return panel;
    panel = document.createElement("section");
    panel.className = "fl-safe-panel";
    panel.innerHTML = '<div class="fl-safe-head"><h3>页面收藏</h3><button type="button" class="fl-safe-close">×</button></div><div class="fl-safe-list"></div>';
    r.appendChild(panel);
    panel.querySelector(".fl-safe-close")?.addEventListener("click", () => { panel.dataset.open = "false"; });
    return panel;
  }
  async function renderPanel() {
    const panel = ensurePanel();
    if (!panel) return;
    const listEl = panel.querySelector(".fl-safe-list");
    const items = await readBookmarks();
    if (!items.length) {
      listEl.innerHTML = '<div style="padding:20px;text-align:center;font-weight:800;opacity:.65">还没有页面收藏</div>';
      return;
    }
    listEl.innerHTML = items.map((item, index) => {
      const url = normalizeUrl(item.url);
      const count = Number(item.mediaCount || 0);
      return `<article class="fl-safe-item" data-index="${index}">${item.cover ? `<img class="fl-safe-cover" src="${escapeHtml(item.cover)}" alt="">` : '<div class="fl-safe-cover"></div>'}<div class="fl-safe-info" title="${escapeHtml(url)}"><div class="fl-safe-title">${escapeHtml(displayTitle(item))}</div><div class="fl-safe-url">${escapeHtml(url)}${count ? ` · ${count} 项` : ""}</div></div><div class="fl-safe-actions"><button type="button" data-action="open">打开</button><button type="button" data-action="remove">删除</button></div></article>`;
    }).join("");
  }
  async function syncButton() {
    const btn = root()?.querySelector('[data-fl-bookmark-safe="toggle"]');
    if (!btn) return;
    const url = currentUrl();
    const saved = (await readBookmarks()).some((item) => normalizeUrl(item.url) === url);
    btn.dataset.saved = saved ? "true" : "false";
    btn.title = saved ? "已收藏本页" : "收藏本页";
  }
  async function toggleBookmark() {
    const url = currentUrl();
    const items = await readBookmarks();
    const exists = items.some((item) => normalizeUrl(item.url) === url);
    if (exists) {
      await writeBookmarks(items.filter((item) => normalizeUrl(item.url) !== url));
      status("已取消收藏当前页面");
    } else {
      const now = new Date().toISOString();
      await writeBookmarks([{ url, title: titleForUrl(url), host: hostOf(url), cover: coverOfCurrentPage(), mediaCount: document.querySelectorAll("#xiv-root .xiv-tile").length || 0, createdAt: now, updatedAt: now }, ...items]);
      status("已收藏当前页面");
    }
    await renderPanel();
    await syncButton();
  }
  async function openBookmark(index) {
    const item = (await readBookmarks())[index];
    if (!item?.url) return;
    const panel = root()?.querySelector(".fl-safe-panel");
    if (panel) panel.dataset.open = "false";
    const api = window.__flowLensControl;
    if (api?.loadSavedPage) {
      const ok = await api.loadSavedPage(item.url);
      if (ok) return;
    }
    status("收藏页无法在图片流内打开");
  }
  async function removeBookmark(index) {
    const items = await readBookmarks();
    items.splice(index, 1);
    await writeBookmarks(items);
    await renderPanel();
    await syncButton();
    status("已删除收藏");
  }
  function makeButton(kind, icon, title) {
    const btn = document.createElement("button");
    btn.className = "xiv-btn fl-safe-bookmark-btn";
    btn.type = "button";
    btn.dataset.flBookmarkSafe = kind;
    btn.title = title;
    btn.innerHTML = `${icon}<span>${title}</span>`;
    return btn;
  }
  function installButtons() {
    injectStyle();
    ensurePanel();
    const bar = actions();
    if (!bar) return;
    if (!bar.querySelector('[data-fl-bookmark-safe="toggle"]')) {
      const btn = makeButton("toggle", SAVE_ICON, "收藏本页");
      bar.insertBefore(btn, bar.firstElementChild || null);
      btn.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); toggleBookmark(); });
    }
    if (!bar.querySelector('[data-fl-bookmark-safe="list"]')) {
      const btn = makeButton("list", LIST_ICON, "收藏列表");
      const toggle = bar.querySelector('[data-fl-bookmark-safe="toggle"]');
      bar.insertBefore(btn, toggle?.nextSibling || bar.firstElementChild || null);
      btn.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const panel = ensurePanel();
        panel.dataset.open = panel.dataset.open === "true" ? "false" : "true";
        await renderPanel();
      });
    }
    syncButton();
  }

  document.addEventListener("click", (event) => {
    const row = event.target?.closest?.("#xiv-root .fl-safe-item");
    if (!row) return;
    const index = Number(row.dataset.index || -1);
    if (event.target.closest("[data-action='remove']")) {
      event.preventDefault();
      event.stopPropagation();
      removeBookmark(index);
      return;
    }
    if (event.target.closest("[data-action='open'],.fl-safe-info")) {
      event.preventDefault();
      event.stopPropagation();
      openBookmark(index);
    }
  }, true);

  window.addEventListener("flowlens:bookmarks-changed", () => { cache = null; renderPanel(); syncButton(); });
  setInterval(installButtons, 1200);
  installButtons();
})();
