// ==UserScript==
// @name         瀑光 FlowLens 电脑油猴版
// @namespace    local.flowlens.desktop
// @version      1.6.5
// @description  同步版：收藏自动同步，收藏打开优先在当前图片流内无缝切换。
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      *
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/page-bookmarks.js
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/454158f8e196ac28c0416d06a8dec51a635d4c5a/flowlens-desktop.user.js
// @downloadURL  https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-desktop.user.js
// @updateURL    https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-desktop.user.js
// ==/UserScript==

(() => {
  if (window.__flowLensRelease165Patch) return;
  window.__flowLensRelease165Patch = true;
  const VERSION = "1.6.5";
  const AUTO_KEY = "flowlens-gallery-queue-auto-open";
  const BOOKMARK_AUTO_KEY = "flowlens-bookmark-auto-open";
  const HINT_ID = "flowlens-direct-bookmark-queue-hint";

  function normalizeUrl(url = location.href) {
    try { const parsed = new URL(url, location.href); parsed.hash = ""; return parsed.href; }
    catch { return String(url || "").split("#")[0]; }
  }
  function sameUrl(a, b) { return normalizeUrl(a).toLowerCase() === normalizeUrl(b).toLowerCase(); }
  function x810114Slug(url) {
    try {
      const parsed = new URL(url, location.href);
      const parts = parsed.pathname.split("/").filter(Boolean);
      return /^x\.810114\.xyz$/i.test(parsed.hostname) && parts.length === 1 && /^[A-Za-z0-9_]{2,64}$/.test(parts[0]) ? parts[0] : "";
    } catch { return ""; }
  }
  function wait(ms) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }
  function status(text) { const node = document.getElementById("xiv-status"); if (node) node.textContent = text; }

  function setVersion() {
    const prev = window.__FlowLensVersion || {};
    window.__FlowLensVersion = {
      ...prev,
      version: VERSION,
      channel: "stable",
      features: Array.from(new Set([...(prev.features || []), "page-bookmarks-auto-sync", "bookmark-target-inflow-switch"]))
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

  function ensureQueueHint(target) {
    const slug = x810114Slug(target);
    let box = document.getElementById(HINT_ID);
    if (!box) {
      box = document.createElement("div");
      box.id = HINT_ID;
      box.style.cssText = "position:absolute!important;left:-99999px!important;top:-99999px!important;width:1px!important;height:1px!important;overflow:hidden!important;opacity:0!important;pointer-events:none!important;";
      document.body?.insertBefore(box, document.body.firstChild || null);
    }
    const current = normalizeUrl(location.href);
    box.innerHTML = `
      <a href="${current}" data-user="current" data-username="current">@current</a>
      <a href="${target}" data-user="${slug}" data-username="${slug}" title="@${slug}">@${slug}</a>
    `;
    box.setAttribute("data-flowlens-direct-target", target);
  }

  async function clickQueueButtonUntilTarget(target) {
    const root = document.getElementById("xiv-root");
    if (!root) return false;
    if (root.dataset.active !== "true") {
      document.getElementById("xiv-launch")?.click?.();
      await wait(400);
    }
    if (sameUrl(location.href, target)) return true;
    ensureQueueHint(target);
    document.documentElement.dispatchEvent(new Event("input", { bubbles: true }));
    await wait(350);
    const buttons = [
      root.querySelector('[data-xiv="next-set"]'),
      root.querySelector('[data-xiv="prev-set"]')
    ].filter(Boolean);
    for (const button of buttons) {
      for (let i = 0; i < 4; i += 1) {
        if (sameUrl(location.href, target)) return true;
        try {
          button.disabled = false;
          button.dataset.enabled = "true";
          button.click();
        } catch {}
        for (let j = 0; j < 10; j += 1) {
          await wait(120);
          if (sameUrl(location.href, target)) return true;
        }
      }
    }
    return sameUrl(location.href, target);
  }

  async function openTargetPageInFlow(url) {
    const target = normalizeUrl(url);
    if (!x810114Slug(target)) return false;
    try {
      sessionStorage.setItem(AUTO_KEY, target);
      sessionStorage.setItem(BOOKMARK_AUTO_KEY, target);
    } catch {}
    status("正在图片流内切换收藏");
    const switched = await clickQueueButtonUntilTarget(target);
    if (switched) {
      status("已在图片流内切换收藏");
      return true;
    }
    status("未能在当前图片流内切换，已保留当前页面");
    return false;
  }

  function patchControlApi() {
    const api = window.__flowLensControl;
    if (!api || typeof api.loadSavedPage !== "function" || api.__flowLensBookmarkOpen165) return;
    const original = api.loadSavedPage.bind(api);
    api.loadSavedPage = async (url) => {
      if (x810114Slug(url)) {
        const ok = await openTargetPageInFlow(url);
        if (ok) return true;
      }
      return original(url);
    };
    api.__flowLensBookmarkOpen165 = true;
  }

  function autoOpenAfterNavigation() {
    let target = "";
    try { target = sessionStorage.getItem(BOOKMARK_AUTO_KEY) || sessionStorage.getItem(AUTO_KEY) || ""; } catch {}
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
