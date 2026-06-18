// ==UserScript==
// @name         瀑光 FlowLens 通用媒体桥接补丁 V4
// @namespace    local.flowlens.media.bridge.v4
// @version      1.4.3
// @description  进一步抓取无扩展名图片、懒加载、背景图、performance 资源和页面 HTML 媒体地址。
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  if (window.__flowLensMediaBridgeV4) return;
  window.__flowLensMediaBridgeV4 = true;

  const BRIDGE_ID = "xiv-media-bridge-v4";
  const EXT_RE = /\.(?:avif|gif|jpe?g|png|webp)(?:[?#]|$)/i;
  const VIDEO_RE = /\.(?:mp4|webm|mov|m4v)(?:[?#]|$)/i;
  const BAD_RE = /(logo|favicon|icon|sprite|avatar|banner|advert|ads?|blank|placeholder|button|badge|social|rating)/i;
  const LIKELY_RE = /(wp-content|uploads?|media|photos?|gallery|image|img|picture|pic|cdn|content|files?)/i;
  const fetchedTexts = [];
  let timer = 0;

  function decode(text) {
    return String(text || "").replace(/\\\//g, "/").replace(/\\u0026/g, "&").replace(/&amp;/g, "&").replace(/&#038;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'");
  }
  function absolute(raw, base = location.href) {
    const text = decode(raw).trim();
    if (!text || /^(data:|blob:|javascript:|mailto:|#)/i.test(text)) return "";
    try { return new URL(text, base).href; } catch { return ""; }
  }
  function bridgeUrl(url) {
    if (EXT_RE.test(url) || VIDEO_RE.test(url)) return url;
    return `${url}${url.includes("#") ? "&" : "#"}flowlens.jpg`;
  }
  function remember(set, raw, base = location.href, loose = false) {
    const url = absolute(raw, base);
    if (!url) return;
    try {
      const parsed = new URL(url);
      const hay = `${parsed.hostname}${parsed.pathname}${parsed.search}`;
      if (BAD_RE.test(hay)) return;
      if (!EXT_RE.test(url) && !VIDEO_RE.test(url) && !(loose || LIKELY_RE.test(hay))) return;
      const href = parsed.href;
      set.add(bridgeUrl(href));
      const noSize = href.replace(/-\d{2,5}x\d{2,5}(?=\.(?:avif|gif|jpe?g|png|webp)(?:[?#]|$))/i, "");
      if (noSize !== href) set.add(bridgeUrl(noSize));
      const noWebp = href.replace(/\.webp([?#]|$)/i, ".jpg$1");
      if (noWebp !== href) set.add(bridgeUrl(noWebp));
    } catch { /* ignore */ }
  }
  function rememberSrcset(set, raw, base = location.href) {
    decode(raw).split(",").forEach((part) => remember(set, part.trim().split(/\s+/)[0], base));
  }
  function scanText(set, raw, base = location.href) {
    const text = decode(raw);
    const re = /(?:https?:)?\\?\/\\?\/[^\s"'<>]+?(?:\.(?:avif|gif|jpe?g|png|webp|mp4|webm|mov|m4v)(?:\?[^\s"'<>]*)?|(?:\/|=)(?:image|photo|media|file|content|download)[^\s"'<>]*)|[A-Za-z0-9_./-]+\.(?:avif|gif|jpe?g|png|webp|mp4|webm|mov|m4v)(?:\?[^\s"'<>]*)?/gi;
    let m;
    while ((m = re.exec(text))) {
      let value = m[0];
      if (value.startsWith("//")) value = location.protocol + value;
      remember(set, value, base, true);
    }
  }
  function collect() {
    const set = new Set();
    const attrs = ["src", "href", "content", "poster", "data-src", "data-lazy-src", "data-original", "data-full", "data-full-src", "data-large", "data-large_image", "data-image", "data-url", "data-thumb", "data-bg", "data-background", "data-bgset", "data-srcset", "data-hires", "data-download", "data-file", "data-zoomfile", "data-media", "data-gallery"];
    document.querySelectorAll("*").forEach((node) => {
      const isImg = node.tagName === "IMG" || node.tagName === "SOURCE" || node.tagName === "VIDEO";
      for (const attr of attrs) remember(set, node.getAttribute?.(attr), location.href, isImg);
      rememberSrcset(set, node.getAttribute?.("srcset") || node.getAttribute?.("data-srcset") || node.getAttribute?.("data-bgset") || "");
      scanText(set, node.getAttribute?.("style") || "");
      try { const bg = getComputedStyle(node).backgroundImage; if (bg && bg !== "none") scanText(set, bg); } catch {}
    });
    try { performance.getEntriesByType("resource").forEach((entry) => remember(set, entry.name, location.href, true)); } catch {}
    [document.documentElement?.innerHTML || "", ...fetchedTexts].forEach((block) => scanText(set, block));
    return [...set].slice(0, 800);
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
      a.dataset.flowlensBridge = "v4";
      const img = document.createElement("img");
      img.src = url;
      img.loading = index < 56 ? "eager" : "lazy";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer-when-downgrade";
      img.alt = `FlowLens ${index + 1}`;
      img.style.cssText = "display:block;width:340px;height:500px;object-fit:contain;background:#111;margin:0 0 8px 0;visibility:visible;opacity:1";
      a.appendChild(img);
      bridge.appendChild(a);
    });
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(render, 120); }
  try { fetch(location.href, { credentials: "include", cache: "no-store" }).then((res) => res.ok ? res.text() : "").then((text) => { if (text) fetchedTexts.push(text); render(); }).catch(() => {}); } catch {}
  schedule();
  [300, 800, 1600, 3200, 6500, 10000].forEach((delay) => setTimeout(render, delay));
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "srcset", "data-src", "data-lazy-src", "data-original", "data-bg", "data-bgset", "style", "href", "content"] });
})();
