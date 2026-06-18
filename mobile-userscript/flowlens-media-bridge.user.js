// ==UserScript==
// @name         瀑光 FlowLens 通用媒体桥接补丁
// @namespace    local.flowlens.media.bridge
// @version      1.4.0
// @description  适配懒加载、背景图、脚本内图片地址，把隐藏媒体桥接给 FlowLens 抓取。
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  if (window.__flowLensMediaBridge) return;
  window.__flowLensMediaBridge = true;

  const BRIDGE_ID = "xiv-media-bridge";
  const IMAGE_RE = /\.(?:avif|gif|jpe?g|png|webp)(?:[?#]|$)/i;
  const BAD_RE = /(logo|favicon|icon|sprite|avatar|banner|advert|ads?|blank|placeholder|button|badge|social|profile)/i;
  let timer = 0;

  function decodeText(text) {
    return String(text || "")
      .replace(/\\\//g, "/")
      .replace(/&amp;/g, "&")
      .replace(/&#038;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'");
  }

  function absolute(raw, base = location.href) {
    const text = decodeText(raw).trim();
    if (!text || /^(data:|blob:|javascript:|mailto:)/i.test(text)) return "";
    try { return new URL(text, base).href; } catch { return ""; }
  }

  function addUrl(set, raw, base = location.href) {
    const url = absolute(raw, base);
    if (!url || !IMAGE_RE.test(url) || BAD_RE.test(url)) return;
    set.add(url);
    try {
      const parsed = new URL(url);
      const noSize = parsed.href.replace(/-\d{2,5}x\d{2,5}(?=\.(?:avif|gif|jpe?g|png|webp)(?:[?#]|$))/i, "");
      if (noSize && noSize !== parsed.href && IMAGE_RE.test(noSize)) set.add(noSize);
    } catch { /* ignore */ }
  }

  function addSrcset(set, raw, base = location.href) {
    decodeText(raw).split(",").forEach((part) => {
      addUrl(set, part.trim().split(/\s+/)[0], base);
    });
  }

  function collectUrls() {
    const urls = new Set();
    const attrNames = ["src", "data-src", "data-lazy-src", "data-original", "data-full", "data-full-src", "data-large", "data-large_image", "data-image", "data-url", "data-thumb", "poster", "href", "content"];

    document.querySelectorAll("img, source, video, a, meta, link").forEach((node) => {
      for (const attr of attrNames) addUrl(urls, node.getAttribute?.(attr));
      addSrcset(urls, node.getAttribute?.("srcset") || node.getAttribute?.("data-srcset") || "");
    });

    document.querySelectorAll("[style]").forEach((node) => {
      const style = decodeText(node.getAttribute("style") || "");
      const re = /url\((['"]?)(.*?)\1\)/gi;
      let match;
      while ((match = re.exec(style))) addUrl(urls, match[2]);
    });

    const html = decodeText(document.documentElement?.innerHTML || "");
    const re = /https?:\\?\/\\?\/[^\s"'<>]+?\.(?:avif|gif|jpe?g|png|webp)(?:\?[^\s"'<>]*)?/gi;
    let match;
    while ((match = re.exec(html))) addUrl(urls, match[0]);

    return [...urls]
      .filter((url) => {
        try {
          const path = new URL(url).pathname.toLowerCase();
          return IMAGE_RE.test(url) && !BAD_RE.test(path) && !/\/(?:thumb|thumbnail|small|mini)\//i.test(path);
        } catch { return false; }
      })
      .slice(0, 260);
  }

  function ensureBridge() {
    let bridge = document.getElementById(BRIDGE_ID);
    if (!bridge) {
      bridge = document.createElement("div");
      bridge.id = BRIDGE_ID;
      bridge.setAttribute("aria-hidden", "true");
      bridge.style.cssText = "position:absolute;left:-120vw;top:0;width:420px;min-height:420px;opacity:.01;pointer-events:none;overflow:hidden;z-index:-1";
      document.body?.appendChild(bridge);
    }
    return bridge;
  }

  function renderBridge() {
    if (!document.body) return;
    const urls = collectUrls();
    if (!urls.length) return;
    const bridge = ensureBridge();
    const key = urls.join("|");
    if (bridge.dataset.key === key) return;
    bridge.dataset.key = key;
    bridge.replaceChildren();
    urls.forEach((url, index) => {
      const a = document.createElement("a");
      a.href = url;
      a.dataset.flowlensBridge = "media";
      const img = document.createElement("img");
      img.src = url;
      img.loading = index < 24 ? "eager" : "lazy";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer-when-downgrade";
      img.alt = `FlowLens source ${index + 1}`;
      img.style.cssText = "display:block;width:320px;height:480px;object-fit:contain;background:#111;margin:0 0 8px 0";
      a.appendChild(img);
      bridge.appendChild(a);
    });
  }

  function scheduleRender() {
    clearTimeout(timer);
    timer = window.setTimeout(renderBridge, 180);
  }

  scheduleRender();
  new MutationObserver(scheduleRender).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src", "srcset", "data-src", "data-lazy-src", "data-original", "style", "href", "content"]
  });
  window.addEventListener("load", () => setTimeout(renderBridge, 600), { once: true });
})();
