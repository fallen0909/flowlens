(() => {
  if (window.__flowLensPageBookmarksPatch) return;
  window.__flowLensPageBookmarksPatch = true;

  const KEY = "flowlens-page-bookmarks-v1";
  const SYNC_KEY = "flowlens-page-bookmarks-sync-v1";
  const REMOTE_FILE = "flowlens-bookmarks.json";
  const MAX_ITEMS = 300;
  const MIN_PULL_MS = 120000;
  const AUTO_PULL_MS = 600000;
  const MIN_PUSH_MS = 120000;
  const PUSH_DEBOUNCE_MS = 10000;
  const RATE_BACKOFF_MS = 3600000;
  const SAVE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4.5h12a1 1 0 0 1 1 1v15l-7-4-7 4v-15a1 1 0 0 1 1-1Z"/></svg>';
  const LIST_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h11M8 12h11M8 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/></svg>';

  let cache = null;
  let syncConfig = null;
  let syncBusy = false;
  let syncTimer = 0;
  let pushTimer = 0;
  let lastPullAt = 0;
  let lastPushAt = 0;
  let lastSyncError = "";
  let rateLimitedUntil = 0;

  const root = () => document.getElementById("xiv-root");
  const actions = () => root()?.querySelector("#xiv-topbar .xiv-actions") || null;
  const safeJson = (text, fallback) => { try { return JSON.parse(text || "") || fallback; } catch { return fallback; } };
  function status(text) {
    const node = document.getElementById("xiv-status");
    if (node) node.textContent = text;
    const syncStatus = root()?.querySelector(".fl-safe-sync-status");
    if (syncStatus && text) syncStatus.textContent = text;
  }
  function normalizeUrl(url = location.href) {
    try { const u = new URL(url, location.href); u.hash = ""; return u.href; }
    catch { return String(url || "").split("#")[0]; }
  }
  const hostOf = (url) => { try { return new URL(url, location.href).hostname; } catch { return ""; } };
  function slugOfX810114(url) {
    try { const u = new URL(url, location.href); const p = u.pathname.split("/").filter(Boolean); return /^x\.810114\.xyz$/i.test(u.hostname) && p.length === 1 && /^[A-Za-z0-9_]{2,64}$/.test(p[0]) ? p[0] : ""; }
    catch { return ""; }
  }
  function currentUrl() {
    const apiUrl = window.__flowLensControl?.currentPageBookmarkUrl?.();
    const current = normalizeUrl(apiUrl || location.href);
    if (slugOfX810114(current)) return current;
    const canonical = document.querySelector('link[rel="canonical"]')?.href || "";
    const og = document.querySelector('meta[property="og:url"],meta[name="og:url"]')?.getAttribute?.("content") || "";
    return [canonical, og, current].filter(Boolean).map(normalizeUrl).find(slugOfX810114) || current;
  }
  const titleForUrl = (url) => slugOfX810114(url) ? `@${slugOfX810114(url)}` : ((document.title || hostOf(url) || "未命名页面").replace(/\s+/g, " ").trim());
  function coverOfCurrentPage() {
    const node = document.querySelector('meta[property="og:image"],meta[name="twitter:image"],#xiv-root .xiv-tile img[src],img[src]');
    const raw = node?.getAttribute?.("content") || node?.getAttribute?.("src") || node?.currentSrc || "";
    try { return raw ? new URL(raw, location.href).href : ""; } catch { return ""; }
  }
  function storageGet(key, fallback = "") {
    try { if (typeof GM_getValue === "function") return GM_getValue(key, fallback); } catch {}
    try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
  }
  function storageSet(key, value) {
    let ok = false;
    try { if (typeof GM_setValue === "function") { GM_setValue(key, value); ok = true; } } catch {}
    if (!ok) { try { localStorage.setItem(key, value); } catch {} }
  }
  function normalizeItems(items) {
    const map = new Map();
    for (const raw of Array.isArray(items) ? items : []) {
      if (!raw?.url) continue;
      const url = normalizeUrl(raw.url);
      const item = {
        url,
        title: raw.title || titleForUrl(url),
        host: raw.host || hostOf(url),
        cover: raw.cover || "",
        mediaCount: Number(raw.mediaCount || 0),
        createdAt: raw.createdAt || raw.updatedAt || new Date().toISOString(),
        updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString()
      };
      const prev = map.get(url);
      if (!prev || String(item.updatedAt) > String(prev.updatedAt)) map.set(url, item);
    }
    return Array.from(map.values()).sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""))).slice(0, MAX_ITEMS);
  }
  const mergeItems = (a, b) => normalizeItems([...(a || []), ...(b || [])]);
  const escapeHtml = (value) => String(value || "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  function displayTitle(item) {
    const slug = slugOfX810114(item?.url || "");
    const title = String(item?.title || "").trim();
    if (slug && (!title || title === "推图 - 推特看图纯享版" || title === item.host)) return `@${slug}`;
    return title || (slug ? `@${slug}` : item?.url || "未命名页面");
  }

  async function readBookmarks() {
    if (cache) return cache;
    cache = normalizeItems(safeJson(await Promise.resolve(storageGet(KEY, "[]")), []));
    return cache;
  }
  async function writeBookmarks(items, options = {}) {
    cache = normalizeItems(items);
    storageSet(KEY, JSON.stringify(cache));
    if (!options.silent) window.dispatchEvent(new CustomEvent("flowlens:bookmarks-changed", { detail: { items: cache } }));
    if (options.push !== false) schedulePush();
    return cache;
  }

  function b64urlEncode(text) { return btoa(unescape(encodeURIComponent(text))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
  function b64urlDecode(text) {
    const clean = String(text || "").replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
    const pad = clean.length % 4 ? "=".repeat(4 - (clean.length % 4)) : "";
    return decodeURIComponent(escape(atob(clean + pad)));
  }
  const normalizeSyncCode = (code) => decodeURIComponent(String(code || "")).replace(/\s+/g, "").trim();
  function loadSyncConfig() {
    if (syncConfig !== null) return syncConfig;
    syncConfig = safeJson(storageGet(SYNC_KEY, "null"), null);
    return syncConfig;
  }
  function saveSyncConfig(config) {
    syncConfig = config || null;
    storageSet(SYNC_KEY, JSON.stringify(syncConfig));
    if (syncConfig) startAutoSync();
    else if (syncTimer) { clearInterval(syncTimer); syncTimer = 0; }
    updateSyncUi();
  }
  const encodeSyncCode = (config) => `FLGIST2.${b64urlEncode(JSON.stringify({ g: config.gistId }))}`;
  function decodeSyncCode(code) {
    const raw = normalizeSyncCode(code);
    if (!raw || !raw.startsWith("FLGIST2.")) return null;
    const body = raw.slice("FLGIST2.".length);
    const parsed = safeJson(b64urlDecode(body), null);
    return parsed?.g ? { provider: "gist", gistId: parsed.g } : null;
  }
  function promptForToken() {
    const token = window.prompt("请输入 GitHub Token（需要 gist 权限）。Token 只保存在当前设备，绝不会写入同步码。", "");
    return String(token || "").trim();
  }
  function isBackoffActive() {
    if (Date.now() < rateLimitedUntil) {
      const mins = Math.max(1, Math.ceil((rateLimitedUntil - Date.now()) / 60000));
      updateSyncUi(`GitHub 限流，暂停同步约 ${mins} 分钟`);
      return true;
    }
    return false;
  }
  function handleSyncError(error, fallback) {
    const msg = String(error?.message || lastSyncError || fallback || "同步失败");
    lastSyncError = msg;
    if (/HTTP\s*403|rate limit|API rate limit/i.test(msg)) rateLimitedUntil = Date.now() + RATE_BACKOFF_MS;
    return msg;
  }
  function requestJson(method, url, body = null, token = "") {
    const headers = { Accept: "application/vnd.github+json", "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    lastSyncError = "";
    return new Promise((resolve, reject) => {
      const fail = (message) => { lastSyncError = message; reject(new Error(message)); };
      const handle = (statusCode, text) => {
        const ok = Number(statusCode || 0) >= 200 && Number(statusCode || 0) < 300;
        const data = safeJson(text || "", null);
        ok ? resolve(data) : fail(`HTTP ${statusCode || 0}${text ? `：${String(text).slice(0, 160)}` : ""}`);
      };
      const gmRequest = typeof GM_xmlhttpRequest === "function" ? GM_xmlhttpRequest : (typeof GM !== "undefined" && typeof GM.xmlHttpRequest === "function" ? GM.xmlHttpRequest.bind(GM) : null);
      if (gmRequest) {
        gmRequest({ method, url, headers, data: body ? JSON.stringify(body) : undefined, timeout: 30000, onload: (res) => handle(res.status, res.responseText || ""), onerror: () => fail("网络错误：无法连接 GitHub Gist"), ontimeout: () => fail("网络超时：无法连接 GitHub Gist") });
        return;
      }
      fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined }).then(async (res) => handle(res.status, await res.text())).catch((error) => fail(error?.message || "网络错误"));
    });
  }
  async function fetchRemote(config = loadSyncConfig()) {
    if (!config?.gistId || !config?.token || isBackoffActive()) return { items: [] };
    const gist = await requestJson("GET", `https://api.github.com/gists/${encodeURIComponent(config.gistId)}`, null, config.token);
    return safeJson(gist?.files?.[REMOTE_FILE]?.content || "", { items: [] });
  }
  async function patchRemote(items, config = loadSyncConfig()) {
    if (!config?.gistId || !config?.token || isBackoffActive()) return false;
    const payload = { version: 1, updatedAt: new Date().toISOString(), items: normalizeItems(items) };
    await requestJson("PATCH", `https://api.github.com/gists/${encodeURIComponent(config.gistId)}`, { files: { [REMOTE_FILE]: { content: JSON.stringify(payload, null, 2) } } }, config.token);
    lastPushAt = Date.now();
    return true;
  }
  async function createRemote(token) {
    const local = await readBookmarks();
    const payload = { version: 1, updatedAt: new Date().toISOString(), items: local };
    const gist = await requestJson("POST", "https://api.github.com/gists", { description: "FlowLens bookmarks sync", public: false, files: { [REMOTE_FILE]: { content: JSON.stringify(payload, null, 2) } } }, token);
    if (!gist?.id) throw new Error("Gist 创建失败");
    return { provider: "gist", gistId: gist.id, token };
  }
  async function pullSync(options = {}) {
    const config = loadSyncConfig();
    if (!config?.gistId || !config?.token || syncBusy || isBackoffActive()) return false;
    syncBusy = true;
    try {
      if (!options.silent) status("正在同步收藏");
      const remote = await fetchRemote(config);
      const local = await readBookmarks();
      const merged = mergeItems(local, remote.items || []);
      if (JSON.stringify(merged) !== JSON.stringify(local)) await writeBookmarks(merged, { push: false, silent: true });
      lastPullAt = Date.now();
      renderPanel(); syncButton(); updateSyncUi("已同步");
      return true;
    } catch (error) {
      const msg = handleSyncError(error, "同步失败");
      if (!options.silent) status(`同步失败：${msg}`);
      updateSyncUi(/rate limit|限流|HTTP\s*403/i.test(msg) ? "GitHub 限流，已暂停自动同步" : `同步失败：${msg}`);
      return false;
    } finally { syncBusy = false; }
  }
  async function pushSync() {
    const config = loadSyncConfig();
    if (!config?.gistId || !config?.token || syncBusy || isBackoffActive()) return false;
    if (Date.now() - lastPushAt < MIN_PUSH_MS) return false;
    syncBusy = true;
    try {
      status("正在上传收藏");
      const remote = await fetchRemote(config).catch(() => ({ items: [] }));
      const local = await readBookmarks();
      const merged = await writeBookmarks(mergeItems(local, remote.items || []), { push: false, silent: true });
      await patchRemote(merged, config);
      lastPullAt = Date.now();
      renderPanel(); syncButton(); updateSyncUi("已同步");
      return true;
    } catch (error) {
      const msg = handleSyncError(error, "上传失败");
      updateSyncUi(/rate limit|限流|HTTP\s*403/i.test(msg) ? "GitHub 限流，已暂停自动同步" : `上传失败：${msg}`);
      return false;
    } finally { syncBusy = false; }
  }
  function schedulePush() {
    if (!loadSyncConfig() || isBackoffActive()) return;
    clearTimeout(pushTimer);
    pushTimer = window.setTimeout(() => pushSync(), Math.max(PUSH_DEBOUNCE_MS, MIN_PUSH_MS - (Date.now() - lastPushAt)));
  }
  function startAutoSync() {
    if (!loadSyncConfig() || syncTimer) return;
    syncTimer = window.setInterval(() => {
      if (loadSyncConfig() && Date.now() - lastPullAt > AUTO_PULL_MS) pullSync({ silent: true });
    }, 60000);
  }
  async function configureSync() {
    const current = loadSyncConfig();
    if (current?.gistId && current?.token) {
      const input = window.prompt("已开启自动同步。复制下面同步码到另一台设备；输入 clear 可关闭同步；输入新的同步码可切换。", encodeSyncCode(current));
      if (input === null) return;
      if (String(input).trim().toLowerCase() === "clear") { saveSyncConfig(null); updateSyncUi("未同步"); status("已关闭收藏同步"); window.alert?.("已关闭收藏同步"); return; }
      const next = decodeSyncCode(input);
      if (!next) { status("同步码格式不正确"); window.alert?.("同步码格式不正确，请完整复制 FLGIST2 开头的同步码"); return; }
      const token = promptForToken();
      if (!token) return;
      const config = { ...next, token };
      saveSyncConfig(config); updateSyncUi("正在验证同步码");
      const pulled = await pullSync({ silent: false });
      const pushed = pulled ? await patchRemote(await readBookmarks(), config).then(() => true).catch((e) => { handleSyncError(e, "上传失败"); return false; }) : false;
      window.alert?.(pulled && pushed ? "同步码已生效，收藏夹会自动同步。" : `同步失败：${lastSyncError || "请检查同步码、Token 权限和网络"}`);
      return;
    }
    const code = window.prompt("粘贴另一台设备的同步码；没有同步码就留空并点确定，创建新的自动同步空间。", "");
    if (code === null) return;
    const trimmed = normalizeSyncCode(code);
    if (trimmed) {
      const parsed = decodeSyncCode(trimmed);
      if (!parsed) { status("同步码格式不正确"); window.alert?.("同步码格式不正确，请完整复制 FLGIST2 开头的同步码"); return; }
      const token = promptForToken();
      if (!token) return;
      const config = { ...parsed, token };
      saveSyncConfig(config); updateSyncUi("正在验证同步码");
      const pulled = await pullSync({ silent: false });
      const pushed = pulled ? await patchRemote(await readBookmarks(), config).then(() => true).catch((e) => { handleSyncError(e, "上传失败"); return false; }) : false;
      window.alert?.(pulled && pushed ? "同步码已生效，收藏夹会自动同步。" : `同步失败：${lastSyncError || "请检查同步码、Token 权限和网络"}`);
      return;
    }
    const token = promptForToken();
    if (!token) return;
    try { status("正在创建同步空间"); const config = await createRemote(token); saveSyncConfig(config); await patchRemote(await readBookmarks(), config); window.prompt("同步已开启。复制此同步码到另一台设备；新设备需单独输入自己的 GitHub Token。", encodeSyncCode(config)); }
    catch (error) { const msg = handleSyncError(error, "同步空间创建失败"); status(`同步空间创建失败：${msg}`); window.alert?.(`同步空间创建失败：${msg}`); }
  }
  function updateSyncUi(text = "") {
    const config = loadSyncConfig();
    const button = root()?.querySelector(".fl-safe-sync");
    if (button) button.textContent = "同步";
    const node = root()?.querySelector(".fl-safe-sync-status");
    if (!node) return;
    if (Date.now() < rateLimitedUntil) { const mins = Math.max(1, Math.ceil((rateLimitedUntil - Date.now()) / 60000)); node.textContent = `GitHub 限流，暂停同步约 ${mins} 分钟`; return; }
    node.textContent = text || (config ? "自动同步已开启（低频防限流）" : "未开启同步");
  }

  function injectStyle() {
    if (document.getElementById("fl-bookmarks-safe-style")) return;
    const style = document.createElement("style");
    style.id = "fl-bookmarks-safe-style";
    style.textContent = `
      #xiv-root #xiv-page-bookmarks-controls,#xiv-root .fl-bookmarks-tools{display:none!important}
      #xiv-root .fl-safe-bookmark-btn span{display:none!important}
      #xiv-root .fl-safe-bookmark-btn svg{width:21px!important;height:21px!important}
      #xiv-root .fl-safe-bookmark-btn[data-saved="true"]{color:#ffb648!important;border-color:rgba(255,190,80,.56)!important;background:rgba(255,190,80,.22)!important}
      #xiv-root .fl-safe-bookmark-btn[data-saved="true"] svg{fill:currentColor!important}
      #xiv-root .fl-safe-panel{position:fixed!important;right:max(12px,env(safe-area-inset-right,0px) + 8px)!important;top:max(62px,env(safe-area-inset-top,0px) + 58px)!important;width:min(420px,calc(100vw - 18px))!important;max-height:min(78vh,650px)!important;z-index:2147483647!important;display:none!important;overflow:hidden!important;border-radius:16px!important;background:rgba(248,249,251,.96)!important;color:#111!important;border:1px solid rgba(0,0,0,.08)!important;box-shadow:0 24px 72px rgba(0,0,0,.3)!important;backdrop-filter:blur(18px)!important;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important}
      #xiv-root[data-theme="dark"] .fl-safe-panel{background:rgba(18,19,23,.96)!important;color:#f5f5f5!important;border-color:rgba(255,255,255,.12)!important}
      #xiv-root .fl-safe-panel[data-open="true"]{display:flex!important;flex-direction:column!important}
      #xiv-root .fl-safe-head{display:grid!important;grid-template-columns:1fr auto!important;gap:8px!important;align-items:center!important;padding:10px 12px!important;border-bottom:1px solid rgba(0,0,0,.08)!important}
      #xiv-root .fl-safe-head h3{margin:0!important;font-size:18px!important;font-weight:950!important;line-height:1.1!important}
      #xiv-root .fl-safe-head-actions{display:flex!important;align-items:center!important;gap:6px!important}
      #xiv-root .fl-safe-sync,#xiv-root .fl-safe-close{height:32px!important;border:0!important;border-radius:999px!important;font-size:13px!important;font-weight:900!important;background:rgba(0,0,0,.08)!important;color:inherit!important;cursor:pointer!important;padding:0 12px!important}
      #xiv-root .fl-safe-close{width:32px!important;padding:0!important;font-size:18px!important}
      #xiv-root .fl-safe-sync-status{grid-column:1/-1!important;font-size:11px!important;color:#61708a!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
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
    const r = root(); if (!r) return null;
    let panel = r.querySelector(".fl-safe-panel"); if (panel) return panel;
    panel = document.createElement("section");
    panel.className = "fl-safe-panel";
    panel.innerHTML = '<div class="fl-safe-head"><h3>页面收藏</h3><div class="fl-safe-head-actions"><button type="button" class="fl-safe-sync">同步</button><button type="button" class="fl-safe-close">×</button></div><div class="fl-safe-sync-status">未开启同步</div></div><div class="fl-safe-list"></div>';
    r.appendChild(panel);
    panel.querySelector(".fl-safe-close")?.addEventListener("click", () => { panel.dataset.open = "false"; });
    panel.querySelector(".fl-safe-sync")?.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); configureSync(); });
    updateSyncUi();
    return panel;
  }
  async function renderPanel() {
    const panel = ensurePanel(); if (!panel) return;
    const listEl = panel.querySelector(".fl-safe-list");
    const items = await readBookmarks();
    if (!items.length) { listEl.innerHTML = '<div style="padding:20px;text-align:center;font-weight:800;opacity:.65">还没有页面收藏</div>'; updateSyncUi(); return; }
    listEl.innerHTML = items.map((item, index) => {
      const url = normalizeUrl(item.url); const count = Number(item.mediaCount || 0);
      return `<article class="fl-safe-item" data-index="${index}">${item.cover ? `<img class="fl-safe-cover" loading="lazy" decoding="async" src="${escapeHtml(item.cover)}" alt="">` : '<div class="fl-safe-cover"></div>'}<div class="fl-safe-info" title="${escapeHtml(url)}"><div class="fl-safe-title">${escapeHtml(displayTitle(item))}</div><div class="fl-safe-url">${escapeHtml(url)}${count ? ` · ${count} 项` : ""}</div></div><div class="fl-safe-actions"><button type="button" data-action="open">打开</button><button type="button" data-action="remove">删除</button></div></article>`;
    }).join("");
    updateSyncUi();
  }
  async function syncButton() {
    const btn = root()?.querySelector('[data-fl-bookmark-safe="toggle"]'); if (!btn) return;
    const url = currentUrl(); const saved = (await readBookmarks()).some((item) => normalizeUrl(item.url) === url);
    btn.dataset.saved = saved ? "true" : "false"; btn.title = saved ? "已收藏本页" : "收藏本页";
  }
  async function toggleBookmark() {
    const url = currentUrl(); const items = await readBookmarks(); const exists = items.some((item) => normalizeUrl(item.url) === url);
    if (exists) { await writeBookmarks(items.filter((item) => normalizeUrl(item.url) !== url)); status("已取消收藏当前页面"); }
    else { const now = new Date().toISOString(); await writeBookmarks([{ url, title: titleForUrl(url), host: hostOf(url), cover: coverOfCurrentPage(), mediaCount: document.querySelectorAll("#xiv-root .xiv-tile").length || 0, createdAt: now, updatedAt: now }, ...items]); status("已收藏当前页面"); }
    await renderPanel(); await syncButton();
  }
  async function openBookmark(index) {
    const item = (await readBookmarks())[index]; if (!item?.url) return;
    const panel = root()?.querySelector(".fl-safe-panel"); if (panel) panel.dataset.open = "false";
    const api = window.__flowLensControl;
    if (api?.loadSavedPage) { const ok = await api.loadSavedPage(item.url); if (ok) return; }
    status("收藏页无法在图片流内打开");
  }
  async function removeBookmark(index) {
    const items = await readBookmarks(); items.splice(index, 1);
    await writeBookmarks(items); await renderPanel(); await syncButton(); status("已删除收藏");
  }
  function makeButton(kind, icon, title) {
    const btn = document.createElement("button"); btn.className = "xiv-btn fl-safe-bookmark-btn"; btn.type = "button"; btn.dataset.flBookmarkSafe = kind; btn.title = title; btn.innerHTML = `${icon}<span>${title}</span>`; return btn;
  }
  function installButtons() {
    injectStyle(); ensurePanel(); startAutoSync(); const bar = actions(); if (!bar) return;
    if (!bar.querySelector('[data-fl-bookmark-safe="toggle"]')) { const btn = makeButton("toggle", SAVE_ICON, "收藏本页"); bar.insertBefore(btn, bar.firstElementChild || null); btn.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); toggleBookmark(); }); }
    if (!bar.querySelector('[data-fl-bookmark-safe="list"]')) { const btn = makeButton("list", LIST_ICON, "收藏列表"); const toggle = bar.querySelector('[data-fl-bookmark-safe="toggle"]'); bar.insertBefore(btn, toggle?.nextSibling || bar.firstElementChild || null); btn.addEventListener("click", async (event) => { event.preventDefault(); event.stopPropagation(); const panel = ensurePanel(); const willOpen = panel.dataset.open !== "true"; panel.dataset.open = willOpen ? "true" : "false"; if (willOpen && loadSyncConfig() && Date.now() - lastPullAt > MIN_PULL_MS) await pullSync({ silent: true }); await renderPanel(); }); }
    syncButton(); updateSyncUi();
  }
  document.addEventListener("click", (event) => {
    const row = event.target?.closest?.("#xiv-root .fl-safe-item"); if (!row) return;
    const index = Number(row.dataset.index || -1);
    if (event.target.closest("[data-action='remove']")) { event.preventDefault(); event.stopPropagation(); removeBookmark(index); return; }
    if (event.target.closest("[data-action='open'],.fl-safe-info")) { event.preventDefault(); event.stopPropagation(); openBookmark(index); }
  }, true);
  window.addEventListener("flowlens:bookmarks-changed", () => { cache = null; renderPanel(); syncButton(); });
  let installTimer = 0;
  const scheduleInstall = () => {
    clearTimeout(installTimer);
    installTimer = window.setTimeout(installButtons, 80);
  };
  new MutationObserver(() => {
    const bar = actions();
    if (bar && (!bar.querySelector('[data-fl-bookmark-safe="toggle"]') || !bar.querySelector('[data-fl-bookmark-safe="list"]'))) scheduleInstall();
  }).observe(document.documentElement, { childList: true, subtree: true });
  installButtons();
})();
