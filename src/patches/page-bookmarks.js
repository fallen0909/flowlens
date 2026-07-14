(() => {
  if (window.__flowLensPageBookmarksPatch) return;
  window.__flowLensPageBookmarksPatch = true;

  const KEY = "flowlens-page-bookmarks-v2";
  const MAX_ITEMS = 300;
  const extensionStorage = typeof chrome !== "undefined" ? chrome.storage?.local || null : null;
  let extensionItems = [];
  const SAVE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4.5h12a1 1 0 0 1 1 1v15l-7-4-7 4v-15a1 1 0 0 1 1-1Z"/></svg>';
  const LIST_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h11M8 12h11M8 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/></svg>';

  const root = () => document.getElementById("xiv-root");
  const settingsPanel = () => root()?.querySelector('[data-panel="settings"]') || null;

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

  function currentUrl() {
    return normalizeUrl(window.__flowLensControl?.currentPageBookmarkUrl?.() || location.href);
  }

  function currentTitle(url = currentUrl()) {
    const title = window.__flowLensControl?.currentPageBookmarkTitle?.()
      || document.querySelector('meta[property="og:title"], meta[name="twitter:title"]')?.getAttribute?.("content")
      || document.querySelector("h1")?.textContent
      || document.title
      || "";
    return String(title || hostOf(url) || url)
      .replace(/\s+/g, " ")
      .replace(/\s*[-_|–—]+\s*(?:xChina|PornPics|FlowLens|瀑光).*$/i, "")
      .trim();
  }

  function status(text) {
    const node = document.getElementById("xiv-status");
    if (node) node.textContent = text;
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  }

  function readItems() {
    if (extensionStorage) return extensionItems.slice(0, MAX_ITEMS);
    try {
      const items = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(items) ? items.filter((item) => item?.url).slice(0, MAX_ITEMS) : [];
    } catch {
      return [];
    }
  }

  function writeItems(items) {
    const seen = new Set();
    const clean = [];
    for (const item of items) {
      const url = normalizeUrl(item?.url || "");
      if (!url || seen.has(url)) continue;
      seen.add(url);
      clean.push({
        url,
        title: item.title || hostOf(url) || url,
        host: item.host || hostOf(url),
        cover: item.cover || "",
        mediaCount: Number(item.mediaCount || 0),
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || item.createdAt || new Date().toISOString()
      });
    }
    const result = clean.slice(0, MAX_ITEMS);
    if (extensionStorage) {
      extensionItems = result;
      extensionStorage.set({ [KEY]: result });
    } else {
      localStorage.setItem(KEY, JSON.stringify(result));
    }
    return result;
  }

  async function loadExtensionItems() {
    if (!extensionStorage) return;
    try {
      const result = await extensionStorage.get(KEY);
      extensionItems = Array.isArray(result?.[KEY]) ? result[KEY].filter((item) => item?.url).slice(0, MAX_ITEMS) : [];
    } catch {
      extensionItems = [];
    }
    syncButton();
    renderPanel();
  }

  function coverOfCurrentPage() {
    const node = document.querySelector('#xiv-root .xiv-tile img[src], meta[property="og:image"], meta[name="twitter:image"], img[src]');
    const raw = node?.getAttribute?.("content") || node?.currentSrc || node?.getAttribute?.("src") || "";
    try { return raw ? new URL(raw, location.href).href : ""; } catch { return ""; }
  }

  function injectStyle() {
    if (document.getElementById("fl-page-bookmarks-style")) return;
    const style = document.createElement("style");
    style.id = "fl-page-bookmarks-style";
    style.textContent = `
      #xiv-root .fl-page-bookmark-btn svg { width: 20px !important; height: 20px !important; display: block !important; }
      #xiv-root #xiv-page-bookmarks-controls { display: none !important; visibility: hidden !important; pointer-events: none !important; }
      #xiv-root #xiv-topbar .fl-page-bookmark-btn { display: none !important; }
      #xiv-root .fl-page-bookmark-settings {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: 8px !important;
        margin: 10px 0 2px !important;
        padding: 10px !important;
        border-radius: 14px !important;
        background: rgba(92,104,132,.07) !important;
        border: 1px solid rgba(127,127,127,.12) !important;
      }
      #xiv-root[data-theme="dark"] .fl-page-bookmark-settings { background: rgba(255,255,255,.06) !important; }
      #xiv-root .fl-page-bookmark-settings-title {
        grid-column: 1 / -1 !important;
        color: #6d7482 !important;
        font-size: 11px !important;
        font-weight: 900 !important;
        letter-spacing: .08em !important;
      }
      #xiv-root[data-theme="dark"] .fl-page-bookmark-settings-title { color: #b7bdc9 !important; }
      #xiv-root .fl-page-bookmark-settings-btn {
        min-width: 0 !important;
        height: 40px !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 8px !important;
        padding: 0 12px !important;
        border: 1px solid rgba(127,127,127,.18) !important;
        border-radius: 12px !important;
        background: rgba(255,255,255,.78) !important;
        color: inherit !important;
        font-size: 13px !important;
        font-weight: 850 !important;
        cursor: pointer !important;
      }
      #xiv-root[data-theme="dark"] .fl-page-bookmark-settings-btn { background: rgba(255,255,255,.08) !important; }
      #xiv-root .fl-page-bookmark-btn[data-saved="true"] { color: #ffb648 !important; border-color: rgba(255,190,80,.56) !important; background: rgba(255,190,80,.22) !important; }
      #xiv-root .fl-page-bookmark-btn[data-saved="true"] svg { fill: currentColor !important; }
      #xiv-root .fl-page-bookmark-panel {
        position: fixed !important;
        right: max(12px, env(safe-area-inset-right, 0px) + 8px) !important;
        top: max(62px, env(safe-area-inset-top, 0px) + 58px) !important;
        z-index: 2147483647 !important;
        width: min(420px, calc(100vw - 18px)) !important;
        max-height: min(78vh, 650px) !important;
        display: none !important;
        flex-direction: column !important;
        overflow: hidden !important;
        border-radius: 14px !important;
        background: rgba(248,249,251,.97) !important;
        color: #111 !important;
        border: 1px solid rgba(0,0,0,.1) !important;
        box-shadow: 0 24px 72px rgba(0,0,0,.3) !important;
        backdrop-filter: blur(18px) !important;
        font-family: system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif !important;
      }
      #xiv-root[data-theme="dark"] .fl-page-bookmark-panel { background: rgba(18,19,23,.97) !important; color: #f5f5f5 !important; border-color: rgba(255,255,255,.12) !important; }
      #xiv-root .fl-page-bookmark-panel[data-open="true"] { display: flex !important; }
      #xiv-root .fl-page-bookmark-head { display: flex !important; align-items: center !important; justify-content: space-between !important; gap: 10px !important; padding: 11px 12px !important; border-bottom: 1px solid rgba(0,0,0,.08) !important; }
      #xiv-root .fl-page-bookmark-head strong { font-size: 17px !important; font-weight: 950 !important; }
      #xiv-root .fl-page-bookmark-close { width: 32px !important; height: 32px !important; border: 0 !important; border-radius: 999px !important; background: rgba(0,0,0,.08) !important; color: inherit !important; cursor: pointer !important; font-size: 18px !important; }
      #xiv-root .fl-page-bookmark-list { overflow: auto !important; padding: 6px 8px 10px !important; }
      #xiv-root .fl-page-bookmark-empty { padding: 22px !important; text-align: center !important; font-weight: 850 !important; opacity: .65 !important; }
      #xiv-root .fl-page-bookmark-item { display: grid !important; grid-template-columns: 46px minmax(0, 1fr) auto !important; align-items: center !important; gap: 9px !important; padding: 8px !important; margin: 5px 0 !important; border-radius: 12px !important; background: rgba(0,0,0,.045) !important; }
      #xiv-root[data-theme="dark"] .fl-page-bookmark-item { background: rgba(255,255,255,.08) !important; }
      #xiv-root .fl-page-bookmark-cover { width: 46px !important; height: 46px !important; border-radius: 10px !important; object-fit: cover !important; background: rgba(0,0,0,.1) !important; }
      #xiv-root .fl-page-bookmark-title { font-size: 13px !important; line-height: 1.25 !important; font-weight: 900 !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; }
      #xiv-root .fl-page-bookmark-url { margin-top: 2px !important; font-size: 11px !important; color: #61708a !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; direction: ltr !important; }
      #xiv-root .fl-page-bookmark-actions { display: flex !important; gap: 4px !important; }
      #xiv-root .fl-page-bookmark-actions button { height: 30px !important; padding: 0 10px !important; border: 0 !important; border-radius: 999px !important; background: rgba(255,255,255,.86) !important; color: inherit !important; cursor: pointer !important; font-size: 13px !important; font-weight: 900 !important; }
      #xiv-root .fl-page-bookmark-actions [data-action="remove"] { color: #c2410c !important; }
      @media (max-width: 560px) { #xiv-root .fl-page-bookmark-panel { left: 6px !important; right: 6px !important; width: auto !important; } }
    `;
    document.documentElement.appendChild(style);
  }

  function removeLegacyControls() {
    document.querySelectorAll("#xiv-root #xiv-page-bookmarks-controls").forEach((node) => node.remove());
  }

  function ensurePanel() {
    const app = root();
    if (!app) return null;
    removeLegacyControls();
    let panel = app.querySelector(".fl-page-bookmark-panel");
    if (panel) return panel;
    panel = document.createElement("section");
    panel.className = "fl-page-bookmark-panel";
    panel.innerHTML = '<div class="fl-page-bookmark-head"><strong>收藏页面</strong><button type="button" class="fl-page-bookmark-close" title="关闭">×</button></div><div class="fl-page-bookmark-list"></div>';
    app.appendChild(panel);
    panel.querySelector(".fl-page-bookmark-close")?.addEventListener("click", () => { panel.dataset.open = "false"; });
    return panel;
  }

  function renderPanel() {
    const panel = ensurePanel();
    if (!panel) return;
    const list = panel.querySelector(".fl-page-bookmark-list");
    const items = readItems();
    if (!items.length) {
      list.innerHTML = '<div class="fl-page-bookmark-empty">还没有收藏页面</div>';
      return;
    }
    list.innerHTML = items.map((item, index) => `
      <article class="fl-page-bookmark-item" data-index="${index}">
        ${item.cover ? `<img class="fl-page-bookmark-cover" loading="lazy" decoding="async" src="${escapeHtml(item.cover)}" alt="">` : '<div class="fl-page-bookmark-cover"></div>'}
        <div class="fl-page-bookmark-info" title="${escapeHtml(item.url)}">
          <div class="fl-page-bookmark-title">${escapeHtml(item.title || item.url)}</div>
          <div class="fl-page-bookmark-url">${escapeHtml(item.url)}${item.mediaCount ? ` · ${item.mediaCount} 项` : ""}</div>
        </div>
        <div class="fl-page-bookmark-actions">
          <button type="button" data-action="open">打开</button>
          <button type="button" data-action="remove">删除</button>
        </div>
      </article>
    `).join("");
  }

  function syncButton() {
    const button = root()?.querySelector('[data-fl-page-bookmark="save"]');
    if (!button) return;
    const url = currentUrl();
    const saved = readItems().some((item) => normalizeUrl(item.url) === url);
    button.dataset.saved = saved ? "true" : "false";
    button.dataset.url = url;
    button.title = saved ? "取消收藏本页" : "收藏本页";
  }

  function toggleCurrentPage() {
    syncButton();
    const url = currentUrl();
    const items = readItems();
    const existing = items.findIndex((item) => normalizeUrl(item.url) === url);
    if (existing >= 0) {
      items.splice(existing, 1);
      writeItems(items);
      status("已取消收藏本页");
    } else {
      const now = new Date().toISOString();
      writeItems([{
        url,
        title: currentTitle(url),
        host: hostOf(url),
        cover: coverOfCurrentPage(),
        mediaCount: document.querySelectorAll("#xiv-root .xiv-tile").length || 0,
        createdAt: now,
        updatedAt: now
      }, ...items]);
      status("已收藏本页");
    }
    renderPanel();
    syncButton();
  }

  async function openItem(index) {
    const item = readItems()[index];
    if (!item?.url) return;
    const panel = root()?.querySelector(".fl-page-bookmark-panel");
    if (panel) panel.dataset.open = "false";
    try {
      const ok = await window.__flowLensControl?.loadSavedPage?.(item.url);
      if (ok) {
        status("已打开收藏页面");
        return;
      }
    } catch {}
    location.href = item.url;
  }

  function removeItem(index) {
    const items = readItems();
    items.splice(index, 1);
    writeItems(items);
    renderPanel();
    syncButton();
    status("已删除收藏");
  }

  function makeButton(kind, icon, title) {
    const button = document.createElement("button");
    button.className = "fl-page-bookmark-settings-btn fl-page-bookmark-btn";
    button.type = "button";
    button.dataset.flPageBookmark = kind;
    button.title = title;
    button.innerHTML = `${icon}<span>${title}</span>`;
    return button;
  }

  function installButtons() {
    injectStyle();
    removeLegacyControls();
    ensurePanel();
    root()?.querySelectorAll('#xiv-topbar .fl-page-bookmark-btn').forEach((button) => button.remove());
    const panel = settingsPanel();
    if (!panel) return;
    let section = panel.querySelector(".fl-page-bookmark-settings");
    if (!section) {
      section = document.createElement("section");
      section.className = "fl-page-bookmark-settings";
      section.innerHTML = '<div class="fl-page-bookmark-settings-title">页面收藏</div>';
      panel.appendChild(section);
      const save = makeButton("save", SAVE_ICON, "收藏本页");
      section.appendChild(save);
      save.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleCurrentPage();
      });
      const list = makeButton("list", LIST_ICON, "收藏列表");
      section.appendChild(list);
      list.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const panel = ensurePanel();
        if (!panel) return;
        panel.dataset.open = panel.dataset.open === "true" ? "false" : "true";
        renderPanel();
      });
    }
    syncButton();
  }

  document.addEventListener("click", (event) => {
    const row = event.target?.closest?.("#xiv-root .fl-page-bookmark-item");
    if (!row) return;
    const index = Number(row.dataset.index || -1);
    if (event.target.closest("[data-action='remove']")) {
      event.preventDefault();
      event.stopPropagation();
      removeItem(index);
      return;
    }
    if (event.target.closest("[data-action='open'], .fl-page-bookmark-info")) {
      event.preventDefault();
      event.stopPropagation();
      openItem(index);
    }
  }, true);

  window.addEventListener("flowlens:page-url-changed", () => {
    window.setTimeout(() => {
      syncButton();
      renderPanel();
    }, 30);
  });
  window.addEventListener("popstate", () => window.setTimeout(syncButton, 30));
  window.addEventListener("storage", (event) => {
    if (!event.key || event.key === KEY) syncButton();
  });
  if (typeof chrome !== "undefined") {
    chrome.storage?.onChanged?.addListener?.((changes, areaName) => {
      if (areaName !== "local" || !changes[KEY]) return;
      extensionItems = Array.isArray(changes[KEY].newValue) ? changes[KEY].newValue.slice(0, MAX_ITEMS) : [];
      syncButton();
      renderPanel();
    });
  }

  let timer = 0;
  function scheduleInstall() {
    clearTimeout(timer);
    timer = window.setTimeout(installButtons, 80);
  }

  new MutationObserver(scheduleInstall).observe(document.documentElement, { childList: true, subtree: true });
  loadExtensionItems();
  installButtons();
})();
