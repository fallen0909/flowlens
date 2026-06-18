// ==UserScript==
// @name         瀑光 FlowLens 通用媒体桥接补丁 V2
// @namespace    local.flowlens.media.bridge.v2
// @version      1.4.1
// @description  更强的懒加载、srcset、data-bg、noscript、脚本图片地址桥接。
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  if (window.__flowLensMediaBridgeV2) return;
  window.__flowLensMediaBridgeV2 = true;

  const BRIDGE_ID = "xiv-media-bridge-v2";
  const IMG_RE = /\.(?:avif|gif|jpe?g|png|webp)(?:[?#]|$)/i;
  const BAD_RE = /(logo|favicon|icon|sprite|avatar|banner|advert|ads?|blank|placeholder|button|badge|social|profile|rating)/i;
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
      if (parsed.protocol === "https:") set.add(`http://${parsed.host}${parsed.pathname}${parsed.search}`);
      if (parsed.protocol === "http:") set.add(`https://${parsed.host}${parsed.pathname}${parsed.search}`);
    } catch { /* ignore */ }
  }

  function rememberSrcset(set, raw, base = location.href) {
    decode(raw).split(",").forEach((part) => remember(set, part.trim().split(/\s+/)[0], base));
  }

  function collect() {
    const set = new Set();
    const attrs = [
      "src", "href", "content", "poster", "data-src", "data-lazy-src", "data-original",
      "data-full", "data-full-src", "data-large", "data-large_image", "data-image",
      "data-url", "data-thumb", "data-bg", "data-background", "data-bgset", "data-srcset",
      "data-hires", "data-download", "data-file", "data-zoomfile"
    ];

    document.querySelectorAll("*").forEach((node) => {
      for (const attr of attrs) remember(set, node.getAttribute?.(attr));
      rememberSrcset(set, node.getAttribute?.("srcset") || node.getAttribute?.("data-srcset") || node.getAttribute?.("data-bgset") || "");
      const style = decode(node.getAttribute?.("style") || "");
      const bg = /url\((['"]?)(.*?)\1\)/gi;
      let m;
      while ((m = bg.exec(style))) remember(set, m[2]);
    });

    const blocks = [document.documentElement?.innerHTML || "", ...Array.from(document.querySelectorAll("noscript, script[type='application/ld+json']")).map((n) => n.textContent || "")];
    const re = /(?:https?:)?\\?\/\\?\/[^\s"'<>]+?\.(?:avif|gif|jpe?g|png|webp)(?:\?[^\s"'<>]*)?/gi;
    blocks.forEach((block) => {
      let m;
      const text = decode(block);
      while ((m = re.exec(text))) remember(set, m[0].startsWith("//") ? location.protocol + m[0] : m[0]);
    });

    return [...set].slice(0, 400);
  }

  function ensureBridge() {
    let bridge = document.getElementById(BRIDGE_ID);
    if (!bridge) {
      bridge = document.createElement("div");
      bridge.id = BRIDGE_ID;
      bridge.setAttribute("aria-hidden", "true");
      bridge.style.cssText = "position:absolute;left:0;top:0;width:360px;min-height:520px;opacity:.02;pointer-events:none;overflow:hidden;z-index:0;transform:translateX(-110vw)";
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
      a.dataset.flowlensBridge = "v2";
      const img = document.createElement("img");
      img.src = url;
      img.loading = index < 36 ? "eager" : "lazy";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer-when-downgrade";
      img.alt = `FlowLens ${index + 1}`;
      img.style.cssText = "display:block;width:340px;height:500px;object-fit:contain;background:#111;margin:0 0 8px 0";
      a.appendChild(img);
      bridge.appendChild(a);
    });
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(render, 160);
  }

  schedule();
  [500, 1200, 2500, 5000].forEach((delay) => setTimeout(render, delay));
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src", "srcset", "data-src", "data-lazy-src", "data-original", "data-bg", "data-bgset", "style", "href", "content"]
  });
})();
