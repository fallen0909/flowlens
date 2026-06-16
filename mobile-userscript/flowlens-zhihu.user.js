// ==UserScript==
// @name         瀑光 FlowLens 知乎图片预采集
// @namespace    local.flowlens.zhihu
// @version      1.2.4
// @description  补充知乎页面 pic*.zhimg.com 图片采集，避免首图、懒加载大图漏抓。
// @match        *://*.zhihu.com/*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  if (window.__flowLensZhihuCollector) return;
  window.__flowLensZhihuCollector = true;

  const CONTAINER_ID = "xiv-zhihu-precollector";
  const ZHIMG_RE = /https?:\/\/pic\d?\.zhimg\.com\/(?:\d+\/)?v2-[^"'<>\s\\)]+?\.(?:webp|jpe?g|png)(?:\?[^"'<>\s\\)]*)?/gi;
  let scheduled = 0;

  function cleanupUrl(raw) {
    let value = String(raw || "")
      .replace(/\\\//g, "/")
      .replace(/\\u002f/gi, "/")
      .replace(/&amp;/g, "&")
      .replace(/\\u0026/gi, "&")
      .trim();
    try { value = decodeURIComponent(value); } catch { /* ignore */ }
    const match = value.match(ZHIMG_RE);
    return match ? match[0].replace(/&amp;/g, "&") : "";
  }

  function zhimgKey(url) {
    const match = String(url || "").match(/\/v2-([A-Za-z0-9]+)[_-]/i);
    return match ? match[1] : url.replace(/\?.*$/, "");
  }

  function qualityScore(url) {
    const width = Number(String(url || "").match(/_(\d+)w\./i)?.[1] || 0);
    if (width) return width;
    if (/_r\./i.test(url)) return 1200;
    if (/_b\./i.test(url)) return 1000;
    return 1;
  }

  function rememberUrl(map, raw) {
    const url = cleanupUrl(raw);
    if (!url) return;
    const key = zhimgKey(url);
    const current = map.get(key);
    if (!current || qualityScore(url) > qualityScore(current)) map.set(key, url);
  }

  function collectZhimgUrls() {
    const result = new Map();
    document.querySelectorAll("img, source").forEach((node) => {
      [node.currentSrc, node.src, node.srcset, node.getAttribute?.("src"), node.getAttribute?.("srcset"), node.getAttribute?.("data-src"), node.getAttribute?.("data-srcset"), node.getAttribute?.("data-original"), node.getAttribute?.("data-actualsrc"), node.getAttribute?.("data-lazy-src"), node.getAttribute?.("data-thumbnail")]
        .forEach((value) => {
          if (!value) return;
          String(value).split(",").forEach((part) => rememberUrl(result, part.trim().split(/\s+/)[0]));
        });
    });
    (document.documentElement?.innerHTML.match(ZHIMG_RE) || []).forEach((url) => rememberUrl(result, url));
    return [...result.values()];
  }

  function ensureContainer() {
    let container = document.getElementById(CONTAINER_ID);
    if (container) return container;
    container = document.createElement("div");
    container.id = CONTAINER_ID;
    container.setAttribute("aria-hidden", "true");
    container.style.cssText = "position:absolute;left:-10000px;top:0;width:360px;min-height:240px;overflow:visible;opacity:.01;pointer-events:none;z-index:0";
    document.body?.insertBefore(container, document.body.firstChild);
    return container;
  }

  function syncPrecollector() {
    if (!document.body) return;
    const urls = collectZhimgUrls();
    if (!urls.length) return;
    const container = ensureContainer();
    const existing = new Set(Array.from(container.querySelectorAll("img[data-xiv-zhimg]")).map((img) => img.src));
    urls.forEach((url, index) => {
      if (existing.has(url)) return;
      const img = document.createElement("img");
      img.dataset.xivZhimg = "true";
      img.alt = `知乎图片 ${index + 1}`;
      img.loading = "eager";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.src = url;
      img.style.cssText = "display:block;width:360px;height:240px;object-fit:cover;margin:0 0 2px 0;";
      container.appendChild(img);
    });
  }

  function scheduleSync() {
    clearTimeout(scheduled);
    scheduled = window.setTimeout(syncPrecollector, 120);
  }

  syncPrecollector();
  window.addEventListener("load", scheduleSync, { once: true });
  window.addEventListener("scroll", scheduleSync, { passive: true });
  new MutationObserver(scheduleSync).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src", "srcset", "data-src", "data-srcset", "data-original", "data-actualsrc"]
  });
})();
