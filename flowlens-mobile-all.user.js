// ==UserScript==
// @name         瀑光 FlowLens 手机整合版
// @namespace    local.flowlens.mobile.all
// @version      1.4.46
// @description  手机 Edge / Tampermonkey 整合版：运行时强制拉取最新核心文件，绕过 @require 外部资源缓存。
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      *
// @downloadURL  https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-mobile-all.user.js
// @updateURL    https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-mobile-all.user.js
// ==/UserScript==

(() => {
  if (window.__flowLensRuntimeLoaderV146) return;
  window.__flowLensRuntimeLoaderV146 = true;

  const VERSION = "1.4.46";
  const BASES = [
    "https://raw.githubusercontent.com/fallen0909/flowlens/master/",
    "https://cdn.jsdelivr.net/gh/fallen0909/flowlens@master/"
  ];
  const FILES = [
    "src/core/version.js",
    "src/core/global-settings.js",
    "src/core/flowlens-core.js",
    "src/core/optimizer.js",
    "src/patches/fixes.js",
    "src/patches/product.js",
    "src/patches/ui-cleanup.js",
    "src/patches/lightbox-stable.js",
    "src/patches/settings-compact.js",
    "src/patches/zhihu.js",
    "src/patches/topfix.js",
    "src/patches/media-sync.js",
    "src/patches/slideshow-native.js",
    "src/patches/video-cover-strategy.js",
    "src/patches/video-preview-card.js",
    "src/patches/page-bookmarks.js",
    "src/patches/version-display.js",
    "src/patches/diagnostics-log.js",
    "src/mobile/mobile-center.js"
  ];

  function requestText(url) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== "function") {
        fetch(url, { cache: "no-store", credentials: "omit" })
          .then((res) => res.ok ? res.text() : Promise.reject(new Error(`HTTP ${res.status}`)))
          .then(resolve, reject);
        return;
      }
      try {
        GM_xmlhttpRequest({
          method: "GET",
          url,
          responseType: "text",
          headers: { "Cache-Control": "no-cache" },
          timeout: 45000,
          onload: (response) => {
            const status = Number(response.status || 0);
            if (status >= 200 && status < 300 && response.responseText) resolve(response.responseText);
            else reject(new Error(`HTTP ${status || "unknown"}`));
          },
          onerror: (error) => reject(new Error(String(error?.error || error?.message || "request failed"))),
          ontimeout: () => reject(new Error("request timeout"))
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async function loadFile(path) {
    const bust = `fl=${VERSION}&t=${Date.now()}`;
    let lastError = null;
    for (const base of BASES) {
      const url = `${base}${path}?${bust}`;
      try {
        const code = await requestText(url);
        if (!code || code.length < 20) throw new Error("empty script");
        (0, eval)(`${code}\n//# sourceURL=${url}`);
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error(`${path}: ${lastError?.message || lastError || "load failed"}`);
  }

  function showLoaderError(error) {
    const message = `瀑光加载失败：${error?.message || error}`;
    console.error("[FlowLens]", message, error);
    const node = document.createElement("div");
    node.textContent = message;
    node.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483647;background:#b91c1c;color:#fff;padding:12px 14px;border-radius:12px;font:800 13px/1.4 system-ui,sans-serif;box-shadow:0 12px 38px rgba(0,0,0,.28);";
    document.documentElement.appendChild(node);
    setTimeout(() => node.remove(), 8000);
  }

  (async () => {
    try {
      for (const file of FILES) await loadFile(file);
    } catch (error) {
      showLoaderError(error);
    }
  })();
})();
