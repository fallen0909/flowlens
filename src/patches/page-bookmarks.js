(() => {
  if (window.__flowLensPageBookmarksPatch) return;
  window.__flowLensPageBookmarksPatch = true;

  const KEY = "flowlens-page-bookmarks-v1";
  const MAX_ITEMS = 300;
  let cache = [];
  let loaded = false;
  let timer = 0;

  function root() { return document.getElementById("xiv-root"); }
  function topbarActions() { return document.querySelector("#xiv-root #xiv-topbar .xiv-actions"); }
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

  function titleOfCurrentPage() {
    const title = (document.title || "").replace(/\s+/g, " ").trim();
    return title || hostOf(location.href) || "未命名页面";
  }

  function coverOfCurrentPage() {
    const selectors = [
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
      '#xiv-root .xiv-tile img[src]',
      'img[src]'
    ];
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      const raw = node?.getAttribute?.("content") || node?.getAttribute?.("src") || "";
      try {
        if (raw) return new URL(raw, location.href).href;
      } catch {}
    }
    return "";
  }

  function mediaCountOfCurrentPage() {
    return document.querySelectorAll("#xiv-root .xiv-tile").length || 0;
  }

  function safeJson(text, fallback) {
    try { return JSON.parse(text || "") || fallback; } catch { return fallback; }
  }

  function gmGet(key, fallback) {
    try {
      if (typeof GM_getValue === "function") return GM_getValue(key, fallback);
    } catch {}
    return fallback;
  }

  function gmSet(key, value) {
    try {
      if (typeof GM_setValue === "function") {
        GM_setValue(key, value);
        return true;
      }
    } catch {}
    return false;
  }

  function chromeStorageGet(key) {
    return new Promise((resolve) => {
      try {
        if (typeof chrome === "undefined" || !chrome.storage?.local?.get) {
          resolve(null);
          return;
        }
        chrome.storage.local.get(key, (result) => resolve(result?.[key] ?? null));
      } catch {
        resolve(null);
      }
    });
  }

  function chromeStorageSet(key, value) {
    return new Promise((resolve) => {
      try {
        if (typeof chrome === "undefined" || !chrome.storage?.local?.set) {
          resolve(false);
          return;
        }
        chrome.storage.local.set({ [key]: value }, () => resolve(true));
      } catch {
        resolve(false);
      }
    });
  }

  async function readBookmarks() {
    const gmRaw = gmGet(KEY, null);
    if (gmRaw) return safeJson(gmRaw, []);
    const chromeRaw = await chromeStorageGet(KEY);
    if (chromeRaw) return typeof chromeRaw === "string" ? safeJson(chromeRaw, []) : chromeRaw;
    try { return safeJson(localStorage.getItem(KEY), []); } catch { return []; }
  }

  async function writeBookmarks(items) {
    const clean = items.slice(0, MAX_ITEMS);
    cache = clean;
    const text = JSON.stringify(clean);
    const usedGm = gmSet(KEY, text);
    await chromeStorageSet(KEY, clean);
    if (!usedGm) {
      try { localStorage.setItem(KEY, text); } catch {}
    }
    renderPanel();
    syncButtonState();
  }

  async function ensureLoaded() {
    if (loaded) return;
    cache = (await readBookmarks())
      .filter((item) => item?.url)
      .map((item) => ({
        url: normalizeUrl(item.url),
        title: item.title || item.url,
        host: item.host || hostOf(item.url),
        cover: item.cover || "",
        mediaCount: Number(item.mediaCount || 0),
        createdAt: item.createdAt || item.updatedAt || new Date().toISOString(),
        updatedAt: item.updatedAt || item.createdAt || new Date().toISOString()
      }));
    loaded = true;
    syncButtonState();
  }

  function currentBookmark() {
    const url = normalizeUrl();
    return cache.find((item) => normalizeUrl(item.url) === url) || null;
  }

  async function toggleCurrentBookmark() {
    await ensureLoaded();
    const url = normalizeUrl();
    const exists = currentBookmark();
    if (exists) {
      await writeBookmarks(cache.filter((item) => normalizeUrl(item.url) !== url));
      status("已取消收藏当前页面");
      return;
    }
    const now = new Date().toISOString();
    await writeBookmarks([
      {
        url,
        title: titleOfCurrentPage(),
        host: hostOf(url),
        cover: coverOfCurrentPage(),
        mediaCount: mediaCountOfCurrentPage(),
        createdAt: now,
        updatedAt: now
      },
      ...cache
    ]);
    status("已收藏当前页面");
  }

  async function removeBookmark(url) {
    await ensureLoaded();
    const target = normalizeUrl(url);
    await writeBookmarks(cache.filter((item) => normalizeUrl(item.url) !== target));
    status("已删除收藏");
  }

  async function openBookmarkInFlow(url) {
    const target = normalizeUrl(url);
    if (!target) return;
    const api = window.__flowLensControl;
    if (typeof api?.loadSavedPage !== "function") {
      status("图片流尚未准备好");
      return;
    }
    togglePanel(false);
    status("正在打开收藏页面");
    const opened = await api.loadSavedPage(target);
    if (opened) {
      const item = cache.find((entry) => normalizeUrl(entry.url) === target);
      if (item) {
        item.updatedAt = new Date().toISOString();
        await writeBookmarks([...cache]);
      }
    }
  }

  function openBookmarkInNewTab(url) {
    const target = normalizeUrl(url);
    if (target) window.open(target, "_blank", "noopener");
  }

  function injectStyle() {
    if (document.getElementById("fl-page-bookmarks-style")) return;
    const style = document.createElement("style");
    style.id = "fl-page-bookmarks-style";
    style.textContent = `
      #xiv-root .fl-bookmarks-btn[data-saved="true"] {
        background: rgba(255,190,80,.22) !important;
        color: #ffb648 !important;
      }
      #xiv-root .fl-bookmarks-panel {
        position: fixed !important;
        right: max(18px, env(safe-area-inset-right, 0px) + 12px) !important;
        top: max(72px, env(safe-area-inset-top, 0px) + 64px) !important;
        width: min(460px, calc(100vw - 24px)) !important;
        max-height: min(74vh, 680px) !important;
        z-index: 2147483647 !important;
        display: none !important;
        overflow: hidden !important;
        border-radius: 22px !important;
        background: rgba(248,249,251,.96) !important;
        color: #111 !important;
        border: 1px solid rgba(0,0,0,.08) !important;
        box-shadow: 0 28px 88px rgba(0,0,0,.34) !important;
        backdrop-filter: blur(18px) !important;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      }
      #xiv-root[data-theme="dark"] .fl-bookmarks-panel {
        background: rgba(18,19,23,.96) !important;
        color: #f5f5f5 !important;
        border-color: rgba(255,255,255,.12) !important;
      }
      #xiv-root .fl-bookmarks-panel[data-open="true"] { display: flex !important; flex-direction: column !important; }
      #xiv-root .fl-bookmarks-head {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        gap: 12px !important;
        padding: 16px !important;
        border-bottom: 1px solid rgba(0,0,0,.08) !important;
      }
      #xiv-root[data-theme="dark"] .fl-bookmarks-head { border-bottom-color: rgba(255,255,255,.1) !important; }
      #xiv-root .fl-bookmarks-head h3 { margin: 0 !important; font-size: 20px !important; line-height: 1.2 !important; font-weight: 950 !important; }
      #xiv-root .fl-bookmarks-close,
      #xiv-root .fl-bookmarks-primary,
      #xiv-root .fl-bookmarks-item button {
        border: 0 !important;
        border-radius: 999px !important;
        cursor: pointer !important;
        font-weight: 900 !important;
        font-family: inherit !important;
      }
      #xiv-root .fl-bookmarks-close { width: 36px !important; height: 36px !important; background: rgba(0,0,0,.08) !important; color: inherit !important; font-size: 20px !important; }
      #xiv-root[data-theme="dark"] .fl-bookmarks-close { background: rgba(255,255,255,.1) !important; }
      #xiv-root .fl-bookmarks-tools { display: flex !important; gap: 10px !important; padding: 12px 16px !important; }
      #xiv-root .fl-bookmarks-primary { flex: 1 1 auto !important; height: 42px !important; background: linear-gradient(135deg,#3b82f6,#6366f1) !important; color: #fff !important; font-size: 14px !important; }
      #xiv-root .fl-bookmarks-primary[data-saved="true"] { background: rgba(0,0,0,.1) !important; color: inherit !important; }
      #xiv-root[data-theme="dark"] .fl-bookmarks-primary[data-saved="true"] { background: rgba(255,255,255,.12) !important; }
      #xiv-root .fl-bookmarks-list { overflow: auto !important; padding: 4px 12px 14px !important; }
      #xiv-root .fl-bookmarks-empty { padding: 24px 16px !important; opacity: .66 !important; text-align: center !important; font-weight: 800 !important; }
      #xiv-root .fl-bookmarks-item {
        display: grid !important;
        grid-template-columns: auto minmax(0,1fr) auto !important;
        gap: 10px !important;
        align-items: center !important;
        padding: 12px !important;
        margin: 8px 0 !important;
        border-radius: 16px !important;
        background: rgba(0,0,0,.045) !important;
      }
      #xiv-root .fl-bookmarks-cover {
        width: 54px !important;
        height: 54px !important;
        border-radius: 12px !important;
        object-fit: cover !important;
        background: linear-gradient(135deg, #64748b, #334155) !important;
      }
      #xiv-root .fl-bookmarks-info { min-width: 0 !important; cursor: pointer !important; }
      #xiv-root[data-theme="dark"] .fl-bookmarks-item { background: rgba(255,255,255,.07) !important; }
      #xiv-root .fl-bookmarks-title { font-size: 14px !important; line-height: 1.35 !important; font-weight: 920 !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; }
      #xiv-root .fl-bookmarks-host { margin-top: 4px !important; font-size: 12px !important; color: #667085 !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; }
      #xiv-root[data-theme="dark"] .fl-bookmarks-host { color: #a7b0c0 !important; }
      #xiv-root .fl-bookmarks-actions { display: flex !important; gap: 6px !important; }
      #xiv-root .fl-bookmarks-item button { height: 34px !important; padding: 0 12px !important; background: rgba(255,255,255,.9) !important; color: #111 !important; }
      #xiv-root[data-theme="dark"] .fl-bookmarks-item button { background: rgba(255,255,255,.12) !important; color: #fff !important; }
      @media (max-width: 560px) {
        #xiv-root .fl-bookmarks-panel { left: 8px !important; right: 8px !important; width: auto !important; max-height: min(72vh, calc(100vh - 88px)) !important; }
        #xiv-root .fl-bookmarks-item { grid-template-columns: auto minmax(0,1fr) !important; }
        #xiv-root .fl-bookmarks-actions { grid-column: 1 / -1 !important; }
      }
    `;
    document.documentElement.appendChild(style);
  }

  function buttonIcon() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.2 14.8 9l6.4.9-4.6 4.5 1.1 6.4L12 17.8 6.3 20.8l1.1-6.4L2.8 9l6.4-.9L12 3.2Z"/></svg>`;
  }

  function ensureButton() {
    const actions = topbarActions();
    if (!actions || actions.querySelector(".fl-bookmarks-btn")) return;
    const btn = document.createElement("button");
    btn.className = "xiv-btn fl-bookmarks-btn";
    btn.type = "button";
    btn.title = "页面收藏";
    btn.innerHTML = `${buttonIcon()}<span>收藏页</span>`;
    btn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await ensureLoaded();
      togglePanel();
    });
    const settings = actions.querySelector('[data-xiv="settings"]');
    if (settings) settings.before(btn);
    else actions.appendChild(btn);
  }

  function ensurePanel() {
    const r = root();
    if (!r) return null;
    let panel = r.querySelector(".fl-bookmarks-panel");
    if (panel) return panel;
    panel = document.createElement("div");
    panel.className = "fl-bookmarks-panel";
    panel.innerHTML = `
      <div class="fl-bookmarks-head"><h3>页面收藏</h3><button class="fl-bookmarks-close" type="button">×</button></div>
      <div class="fl-bookmarks-tools"><button class="fl-bookmarks-primary" type="button"></button></div>
      <div class="fl-bookmarks-list"></div>`;
    panel.querySelector(".fl-bookmarks-close").addEventListener("click", () => togglePanel(false));
    panel.querySelector(".fl-bookmarks-primary").addEventListener("click", toggleCurrentBookmark);
    r.appendChild(panel);
    return panel;
  }

  function renderPanel() {
    const panel = ensurePanel();
    if (!panel) return;
    const current = currentBookmark();
    const primary = panel.querySelector(".fl-bookmarks-primary");
    primary.dataset.saved = current ? "true" : "false";
    primary.textContent = current ? "取消收藏当前页面" : "收藏当前页面";

    const list = panel.querySelector(".fl-bookmarks-list");
    list.innerHTML = "";
    if (!cache.length) {
      const empty = document.createElement("div");
      empty.className = "fl-bookmarks-empty";
      empty.textContent = "还没有收藏页面";
      list.appendChild(empty);
      return;
    }

    cache.forEach((item) => {
      const row = document.createElement("div");
      row.className = "fl-bookmarks-item";
      row.innerHTML = `
        <img class="fl-bookmarks-cover" alt="" />
        <div class="fl-bookmarks-info">
          <div class="fl-bookmarks-title"></div>
          <div class="fl-bookmarks-host"></div>
        </div>
        <div class="fl-bookmarks-actions">
          <button type="button" data-action="open">打开</button>
          <button type="button" data-action="newtab">新页</button>
          <button type="button" data-action="delete">删除</button>
        </div>`;
      row.querySelector(".fl-bookmarks-title").textContent = item.title || item.url;
      row.querySelector(".fl-bookmarks-host").textContent = `${item.host || hostOf(item.url)}${item.mediaCount ? ` · ${item.mediaCount} 项` : ""}`;
      const cover = row.querySelector(".fl-bookmarks-cover");
      if (item.cover) cover.src = item.cover;
      else cover.style.visibility = "hidden";
      row.querySelector('[data-action="open"]').addEventListener("click", () => openBookmarkInFlow(item.url));
      row.querySelector('[data-action="newtab"]').addEventListener("click", () => openBookmarkInNewTab(item.url));
      row.querySelector('[data-action="delete"]').addEventListener("click", () => removeBookmark(item.url));
      row.querySelector(".fl-bookmarks-info").addEventListener("click", () => openBookmarkInFlow(item.url));
      list.appendChild(row);
    });
  }

  function syncButtonState() {
    const btn = document.querySelector("#xiv-root .fl-bookmarks-btn");
    if (!btn) return;
    btn.dataset.saved = currentBookmark() ? "true" : "false";
    btn.title = currentBookmark() ? "当前页面已收藏，点击打开收藏列表" : "页面收藏";
  }

  function togglePanel(force) {
    const panel = ensurePanel();
    if (!panel) return;
    const open = force ?? panel.dataset.open !== "true";
    panel.dataset.open = open ? "true" : "false";
    if (open) renderPanel();
  }

  async function apply() {
    injectStyle();
    ensureButton();
    ensurePanel();
    await ensureLoaded();
    renderPanel();
    syncButtonState();
  }

  function schedule() {
    clearTimeout(timer);
    timer = window.setTimeout(apply, 100);
  }

  injectStyle();
  schedule();
  document.addEventListener("click", (event) => {
    const panel = document.querySelector("#xiv-root .fl-bookmarks-panel");
    if (!panel || panel.dataset.open !== "true") return;
    if (event.target?.closest?.(".fl-bookmarks-panel, .fl-bookmarks-btn")) return;
    togglePanel(false);
  }, true);
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-active", "class"]
  });
})();
