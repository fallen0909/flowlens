// ==UserScript==
// @name         瀑光 FlowLens 通用媒体桥接补丁 V3
// @namespace    local.flowlens.media.bridge.v3
// @version      1.4.2
// @description  从懒加载属性、computed background、performance 资源和同页 HTML 中提取媒体地址。
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  if (window.__flowLensMediaBridgeV3) return;
  window.__flowLensMediaBridgeV3 = true;

  const BRIDGE_ID = "xiv-media-bridge-v3";
  const IMG_RE = /\.(?:avif|gif|jpe?g|png|webp)(?:[?#]|$)/i;
  const BAD_RE = /(logo|favicon|icon|sprite|avatar|banner|advert|ads?|blank|placeholder|button|badge|social|rating)/i;
  const fetchedTexts = [];
  let timer = 0;

  function decode(text) {
    return String(text || "")
      .replace(/\\\//g, "/")
      .replace(/\\u0026/g, "&")
      .replace(/&amp;/g, "&")
      .replace(/&#038;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'");
  }

  function absolute(raw, base = location.href) {
    const text = decode(raw).trim();
    if (!text || /^(data:|blob:|javascript:|mailto:|#)/i.test(text)) return "";
    try { return new URL(text, base).href; } catch { return ""; }
  }

  function remember(set, raw, base = location.href) {
    const url = absolute(raw, base);
    if (!url || !IMG_RE.test(url)) return;
    try {
      const parsed = new URL(url);
      const path = parsed.pathname.toLowerCase();
      if (BAD_RE.test(path)) return;
      set.add(parsed.href);
      const noSize = parsed.href.replace(/-\d{2,5}x\d{2,5}(?=\.(?:avif|gif|jpe?g|png|webp)(?:[?#]|$))/i, "");
      if (noSize !== parsed.href) set.add(noSize);
      const noWebp = parsed.href.replace(/\.webp([?#]|$)/i, ".jpg$1");
      if (noWebp !== parsed.href) set.add(noWebp);
    } catch { /* ignore */ }
  }

  function rememberSrcset(set, raw, base = location.href) {
    decode(raw).split(",").forEach((part) => remember(set, part.trim().split(/\s+/)[0], base));
  }

  function scanText(set, raw, base = location.href) {
    const text = decode(raw);
    const re = /(?:https?:)?\\?\/\\?\/[^\s"'<>]+?\.(?:avif|gif|jpe?g|png|webp)(?:\?[^\s"'<>]*)?|[A-Za-z0-9_./-]+\.(?:avif|gif|jpe?g|png|webp)(?:\?[^\s"'<>]*)?/gi;
    let m;
    while ((m = re.exec(text))) {
      let value = m[0];
      if (value.startsWith("//")) value = location.protocol + value;
      remember(set, value, base);
    }
  }

  function collect() {
    const set = new Set();
    const attrs = [
      "src", "href", "content", "poster", "data-src", "data-lazy-src", "data-original",
      "data-full", "data-full-src", "data-large", "data-large_image", "data-image", "data-url",
      "data-thumb", "data-bg", "data-background", "data-bgset", "data-srcset", "data-hires",
      "data-download", "data-file", "data-zoomfile", "data-media", "data-gallery"
    ];

    document.querySelectorAll("*").forEach((node) => {
      for (const attr of attrs) remember(set, node.getAttribute?.(attr));
      rememberSrcset(set, node.getAttribute?.("srcset") || node.getAttribute?.("data-srcset") || node.getAttribute?.("data-bgset") || "");
      scanText(set, node.getAttribute?.("style") || "");
      try {
        const bg = getComputedStyle(node).backgroundImage;
        if (bg && bg !== "none") scanText(set, bg);
      } catch { /* ignore */ }
    });

    try {
      performance.getEntriesByType("resource").forEach((entry) => remember(set, entry.name));
    } catch { /* ignore */ }

    [document.documentElement?.innerHTML || "", ...fetchedTexts].forEach((block) => scanText(set, block));
    return [...set].slice(0, 600);
  }

  function ensureBridge() {
    let bridge = document.getElementById(BRIDGE_ID);
    if (!bridge) {
      bridge = document.createElement("div");
      bridge.id = BRIDGE_ID;
      bridge.setAttribute("aria-hidden", "true");
      bridge.style.cssText = "position:fixed;left:0;top:0;width:360px;min-height:520px;opacity:.01;pointer-events:none;overflow:hidden;z-index:0;transform:translateX(-120vw);visibility:visible;display:block";
      document.body?.appendChild(bridge);
    }
    return bridge;
  }

  function render() {
    if (!document.body) return;
    const urls = collect();
    const bridge = ensureBridge();
    const key = urls.join("|");
    if (bridge.dataset.key === key) return;
    bridge.dataset.key = key;
    bridge.replaceChildren();
    urls.forEach((url, index) => {
      const a = document.createElement("a");
      a.href = url;
      a.dataset.flowlensBridge = "v3";
      const img = document.createElement("img");
      img.src = url;
      img.loading = index < 48 ? "eager" : "lazy";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer-when-downgrade";
      img.alt = `FlowLens ${index + 1}`;
      img.style.cssText = "display:block;width:340px;height:500px;object-fit:contain;background:#111;margin:0 0 8px 0;visibility:visible;opacity:1";
      a.appendChild(img);
      bridge.appendChild(a);
    });
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(render, 120);
  }

  try {
    fetch(location.href, { credentials: "include", cache: "no-store" })
      .then((res) => res.ok ? res.text() : "")
      .then((text) => { if (text) fetchedTexts.push(text); render(); })
      .catch(() => {});
  } catch { /* ignore */ }

  schedule();
  [400, 900, 1800, 3600, 6500].forEach((delay) => setTimeout(render, delay));
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src", "srcset", "data-src", "data-lazy-src", "data-original", "data-bg", "data-bgset", "style", "href", "content"]
  });
})();
