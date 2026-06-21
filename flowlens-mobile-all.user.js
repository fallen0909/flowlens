// ==UserScript==
// @name         瀑光 FlowLens 手机整合版
// @namespace    local.flowlens.mobile.all
// @version      1.6.6
// @description  同步修复版：收藏自动同步，手机同步码粘贴后有明确反馈。
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      *
// @connect      api.github.com
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/page-bookmarks.js?fl=1.6.6
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/454158f8e196ac28c0416d06a8dec51a635d4c5a/flowlens-mobile-all.user.js
// @downloadURL  https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-mobile-all.user.js
// @updateURL    https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-mobile-all.user.js
// ==/UserScript==

(() => {
  if (window.__flowLensRelease166Patch) return;
  window.__flowLensRelease166Patch = true;
  const VERSION = "1.6.6";
  const BOOKMARK_KEY = "flowlens-page-bookmarks-v1";
  const SYNC_KEY = "flowlens-page-bookmarks-sync-v1";
  const REMOTE_FILE = "flowlens-bookmarks.json";
  const AUTO_KEY = "flowlens-gallery-queue-auto-open";
  const BOOKMARK_AUTO_KEY = "flowlens-bookmark-auto-open";
  let lastSyncError = "";
  let syncBusy = false;
  let pushTimer = 0;
  let lastPullAt = 0;

  const safeJson = (text, fallback) => { try { return JSON.parse(text || "") || fallback; } catch { return fallback; } };
  const normalizeUrl = (url = location.href) => { try { const u = new URL(url, location.href); u.hash = ""; return u.href; } catch { return String(url || "").split("#")[0]; } };
  const sameUrl = (a, b) => normalizeUrl(a).toLowerCase() === normalizeUrl(b).toLowerCase();
  const hostOf = (url) => { try { return new URL(url, location.href).hostname; } catch { return ""; } };
  function x810114Slug(url) { try { const u = new URL(url, location.href); const p = u.pathname.split("/").filter(Boolean); return /^x\.810114\.xyz$/i.test(u.hostname) && p.length === 1 && /^[A-Za-z0-9_]{2,64}$/.test(p[0]) ? p[0] : ""; } catch { return ""; } }
  function storageGet(key, fallback = "") { try { if (typeof GM_getValue === "function") return GM_getValue(key, fallback); } catch {} try { return localStorage.getItem(key) || fallback; } catch { return fallback; } }
  function storageSet(key, value) { let ok = false; try { if (typeof GM_setValue === "function") { GM_setValue(key, value); ok = true; } } catch {} if (!ok) { try { localStorage.setItem(key, value); } catch {} } }
  const status = (text) => { const n = document.getElementById("xiv-status"); if (n) n.textContent = text; const s = document.querySelector("#xiv-root .fl-safe-sync-status"); if (s) s.textContent = text; };

  function setVersion() {
    const prev = window.__FlowLensVersion || {};
    window.__FlowLensVersion = { ...prev, version: VERSION, channel: "stable", features: Array.from(new Set([...(prev.features || []), "page-bookmarks-auto-sync", "mobile-sync-code-hotfix"])) };
    window.__FLOWLENS_VERSION__ = VERSION;
    window.__flowLensGetVersion = () => window.__FlowLensVersion;
    document.querySelectorAll('#xiv-root .xiv-setting-row, #xiv-root label, #xiv-root div').forEach((row) => {
      if (/瀑光版本|FlowLens\s*版本|版本/.test(row.textContent || "") && /v?\d+\.\d+\.\d+/.test(row.textContent || "")) {
        const target = row.querySelector?.(".fl-version-value,strong,b,em,code") || row.children?.[row.children.length - 1] || row;
        if (target) target.textContent = `v${VERSION}`;
      }
    });
  }

  function b64urlEncode(text) { return btoa(unescape(encodeURIComponent(text))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
  function b64urlDecode(text) { const clean = String(text || "").replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/"); const pad = clean.length % 4 ? "=".repeat(4 - (clean.length % 4)) : ""; return decodeURIComponent(escape(atob(clean + pad))); }
  function encodeSyncCode(config) { return `FLGIST1.${b64urlEncode(JSON.stringify({ g: config.gistId, t: config.token }))}`; }
  function decodeSyncCode(code) {
    const raw = decodeURIComponent(String(code || "")).replace(/\s+/g, "").trim();
    if (!raw) return null;
    if (raw.startsWith("{")) {
      const j = safeJson(raw, null);
      if (j?.g && j?.t) return { provider: "gist", gistId: j.g, token: j.t };
      if (j?.gistId && j?.token) return { provider: "gist", gistId: j.gistId, token: j.token };
    }
    const body = raw.startsWith("FLGIST1.") ? raw.slice("FLGIST1.".length) : raw;
    const parsed = safeJson(b64urlDecode(body), null);
    return parsed?.g && parsed?.t ? { provider: "gist", gistId: parsed.g, token: parsed.t } : null;
  }
  const loadConfig = () => safeJson(storageGet(SYNC_KEY, "null"), null);
  const saveConfig = (config) => storageSet(SYNC_KEY, JSON.stringify(config || null));
  async function readBookmarks() { return safeJson(await Promise.resolve(storageGet(BOOKMARK_KEY, "[]")), []); }
  function normalizeItems(items) {
    const map = new Map();
    for (const raw of Array.isArray(items) ? items : []) {
      if (!raw?.url) continue;
      const url = normalizeUrl(raw.url);
      const item = { url, title: raw.title || (x810114Slug(url) ? `@${x810114Slug(url)}` : url), host: raw.host || hostOf(url), cover: raw.cover || "", mediaCount: Number(raw.mediaCount || 0), createdAt: raw.createdAt || raw.updatedAt || new Date().toISOString(), updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString() };
      const old = map.get(url);
      if (!old || String(item.updatedAt) > String(old.updatedAt)) map.set(url, item);
    }
    return Array.from(map.values()).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))).slice(0, 300);
  }
  async function writeBookmarks(items, push = true) { const list = normalizeItems(items); storageSet(BOOKMARK_KEY, JSON.stringify(list)); window.dispatchEvent(new CustomEvent("flowlens:bookmarks-changed", { detail: { items: list } })); if (push) schedulePush(); return list; }
  function requestJson(method, url, body, token) {
    const headers = { Accept: "application/vnd.github+json", "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    lastSyncError = "";
    return new Promise((resolve, reject) => {
      const fail = (msg) => { lastSyncError = msg; reject(new Error(msg)); };
      const done = (statusCode, text) => { const ok = Number(statusCode) >= 200 && Number(statusCode) < 300; const data = safeJson(text || "", null); ok ? resolve(data) : fail(`HTTP ${statusCode || 0}${text ? `：${String(text).slice(0, 120)}` : ""}`); };
      const gm = typeof GM_xmlhttpRequest === "function" ? GM_xmlhttpRequest : (typeof GM !== "undefined" && typeof GM.xmlHttpRequest === "function" ? GM.xmlHttpRequest.bind(GM) : null);
      if (gm) { gm({ method, url, headers, data: body ? JSON.stringify(body) : undefined, timeout: 30000, onload: (r) => done(r.status, r.responseText || ""), onerror: () => fail("网络错误：手机端无法连接 GitHub Gist"), ontimeout: () => fail("网络超时：手机端无法连接 GitHub Gist") }); return; }
      fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined }).then(async (r) => done(r.status, await r.text())).catch((e) => fail(e?.message || "网络错误"));
    });
  }
  async function fetchRemote(config) { const gist = await requestJson("GET", `https://api.github.com/gists/${encodeURIComponent(config.gistId)}`, null, config.token); return safeJson(gist?.files?.[REMOTE_FILE]?.content || "", { items: [] }); }
  async function patchRemote(items, config) { const payload = { version: 1, updatedAt: new Date().toISOString(), items: normalizeItems(items) }; await requestJson("PATCH", `https://api.github.com/gists/${encodeURIComponent(config.gistId)}`, { files: { [REMOTE_FILE]: { content: JSON.stringify(payload, null, 2) } } }, config.token); }
  async function createRemote(token) { const local = await readBookmarks(); const payload = { version: 1, updatedAt: new Date().toISOString(), items: normalizeItems(local) }; const gist = await requestJson("POST", "https://api.github.com/gists", { description: "FlowLens bookmarks sync", public: false, files: { [REMOTE_FILE]: { content: JSON.stringify(payload, null, 2) } } }, token); if (!gist?.id) throw new Error("Gist 创建失败"); return { provider: "gist", gistId: gist.id, token }; }
  async function pullSync(silent = false) {
    const config = loadConfig(); if (!config?.gistId || !config?.token || syncBusy) return false; syncBusy = true;
    try { if (!silent) status("正在同步收藏"); const remote = await fetchRemote(config); const local = await readBookmarks(); await writeBookmarks([...local, ...(remote.items || [])], false); lastPullAt = Date.now(); status("已同步"); return true; }
    catch (e) { lastSyncError = e?.message || lastSyncError || "同步失败"; status(`同步失败：${lastSyncError}`); return false; }
    finally { syncBusy = false; }
  }
  async function pushSync() {
    const config = loadConfig(); if (!config?.gistId || !config?.token || syncBusy) return false; syncBusy = true;
    try { status("正在上传收藏"); const remote = await fetchRemote(config).catch(() => ({ items: [] })); const local = await readBookmarks(); const merged = await writeBookmarks([...local, ...(remote.items || [])], false); await patchRemote(merged, config); lastPullAt = Date.now(); status("已同步"); return true; }
    catch (e) { lastSyncError = e?.message || lastSyncError || "上传失败"; status(`上传失败：${lastSyncError}`); return false; }
    finally { syncBusy = false; }
  }
  function schedulePush() { if (!loadConfig()) return; clearTimeout(pushTimer); pushTimer = setTimeout(pushSync, 1600); }
  async function configureSyncHotfix() {
    const current = loadConfig();
    if (current?.gistId && current?.token) {
      const input = window.prompt("已开启自动同步。复制下面同步码到另一台设备；输入 clear 可关闭同步；输入新的同步码可切换。", encodeSyncCode(current));
      if (input === null) return;
      if (String(input).trim().toLowerCase() === "clear") { saveConfig(null); status("已关闭收藏同步"); alert("已关闭收藏同步"); return; }
      const next = decodeSyncCode(input); if (!next) { status("同步码格式不正确"); alert("同步码格式不正确，请完整复制 FLGIST1 开头的同步码"); return; }
      saveConfig(next); status("正在验证同步码"); const ok = await pullSync(false); const pushed = ok ? await pushSync() : false; alert(ok && pushed ? "同步码已生效，收藏夹会自动同步。" : `同步失败：${lastSyncError || "请检查同步码、Token 权限和网络"}`); return;
    }
    const code = window.prompt("粘贴另一台设备的同步码；没有同步码就留空并点确定，创建新的自动同步空间。", "");
    if (code === null) return;
    if (String(code).trim()) { const parsed = decodeSyncCode(code); if (!parsed) { status("同步码格式不正确"); alert("同步码格式不正确，请完整复制 FLGIST1 开头的同步码"); return; } saveConfig(parsed); status("正在验证同步码"); const ok = await pullSync(false); const pushed = ok ? await pushSync() : false; alert(ok && pushed ? "同步码已生效，收藏夹会自动同步。" : `同步失败：${lastSyncError || "请检查同步码、Token 权限和网络"}`); return; }
    const token = window.prompt("请输入 GitHub Token（需要 gist 权限）。只保存在本机，用来创建私有 Gist 同步收藏。", "");
    if (!token) return;
    try { status("正在创建同步空间"); const config = await createRemote(token.trim()); saveConfig(config); await pushSync(); window.prompt("同步已开启。复制这个同步码到手机或另一台电脑即可自动同步。", encodeSyncCode(config)); } catch (e) { lastSyncError = e?.message || lastSyncError || "同步空间创建失败"; status(`同步空间创建失败：${lastSyncError}`); alert(`同步空间创建失败：${lastSyncError}`); }
  }
  function patchSyncButton() {
    document.addEventListener("click", (event) => {
      const btn = event.target?.closest?.("#xiv-root .fl-safe-sync");
      if (!btn) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); configureSyncHotfix();
    }, true);
    window.addEventListener("flowlens:bookmarks-changed", schedulePush);
    setInterval(() => { if (loadConfig() && Date.now() - lastPullAt > 45000) pullSync(true); }, 15000);
  }
  function openTargetPageInFlow(url) { const target = normalizeUrl(url); if (!x810114Slug(target)) return false; try { sessionStorage.setItem(AUTO_KEY, target); sessionStorage.setItem(BOOKMARK_AUTO_KEY, target); } catch {} status("正在打开收藏页面"); if (!sameUrl(target, location.href)) location.assign(target); else setTimeout(() => document.getElementById("xiv-launch")?.click?.(), 250); return true; }
  function patchControlApi() { const api = window.__flowLensControl; if (!api || typeof api.loadSavedPage !== "function" || api.__flowLensBookmarkOpen166) return; const original = api.loadSavedPage.bind(api); api.loadSavedPage = (url) => openTargetPageInFlow(url) ? Promise.resolve(true) : original(url); api.__flowLensBookmarkOpen166 = true; }
  function autoOpenAfterNavigation() { let target = ""; try { target = sessionStorage.getItem(BOOKMARK_AUTO_KEY) || sessionStorage.getItem(AUTO_KEY) || ""; } catch {} if (!target || !sameUrl(target, location.href)) return; let tries = 0; const timer = setInterval(() => { tries += 1; const r = document.getElementById("xiv-root"); if (r?.dataset.active === "true") { clearInterval(timer); try { sessionStorage.removeItem(BOOKMARK_AUTO_KEY); } catch {} return; } document.getElementById("xiv-launch")?.click?.(); if (tries > 12) clearInterval(timer); }, 500); }
  setVersion(); patchSyncButton(); patchControlApi(); autoOpenAfterNavigation(); setInterval(() => { setVersion(); patchControlApi(); }, 800);
})();
