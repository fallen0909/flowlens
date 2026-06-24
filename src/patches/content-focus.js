(() => {
  if (window.__flowLensContentFocusPatch) return;
  window.__flowLensContentFocusPatch = true;

  const BLOCK_CLASS = "flowlens-recommend-block";
  const RELATED_CLASS = "flowlens-related-block";
  const STYLE_ID = "flowlens-content-focus-style";
  const MEDIA_SELECTOR = [
    "img",
    "picture",
    "video",
    "iframe",
    "object",
    "embed",
    "source[src]",
    "a[href*='.jpg' i]",
    "a[href*='.jpeg' i]",
    "a[href*='.png' i]",
    "a[href*='.webp' i]",
    "a[href*='.avif' i]",
    "a[href*='.gif' i]",
    "a[href*='.mp4' i]",
    "a[href*='.webm' i]"
  ].join(",");

  const REC_TEXT_RE = /(?:推荐您看|推薦您看|相关推荐|相關推薦|相关图集|相關圖集|相关图片|相關圖片|猜你喜欢|猜你喜歡|你可能喜欢|你可能喜歡|为你推荐|為你推薦|推荐阅读|推薦閱讀|大家都在看|看了又看|看过还看|热门推荐|熱門推薦|更多推荐|更多推薦|更多美图|更多套图|相似图集|同类推荐|Related\s*(?:Posts?|Galleries?|Images?)|Recommended|You\s+may\s+also\s+like|More\s+like\s+this|More\s+from\s+this\s+site)/i;
  const REC_MARKER_RE = /(?:recommend|recommended|related|rel-|suggest|similar|guess|you-may|more-like|also-like|sidebar|side-bar|aside|footer|bottom|hot|popular|rank|ranking|猜你喜欢|猜你喜歡|推荐|推薦|相关|相關|热门|熱門|排行|更多美图|更多套图)/i;
  const AD_MARKER_RE = /(?:\bad\b|\bads\b|advert|advertise|advertisement|banner|sponsor|sponsored|promo|promotion|popunder|popup|affiliate|tracking|doubleclick|googlesyndication|adservice|adserver|广告|廣告|赞助|贊助|推广|推廣|扫码|掃碼|二维码|二維碼|直播间|直播間|立即访问|立即訪問|app下载|下载.*app)/i;
  const SAFE_ROOT_RE = /(?:article|main|content|entry|post|photo|photos|picture|gallery|album|item|tuji|正文|内容|內容|图集|圖集|相册|相冊)/i;
  const HARD_BLOCK_SELECTOR = [
    "aside",
    "footer",
    "iframe",
    "ins",
    "[id*='recommend' i]",
    "[class*='recommend' i]",
    "[id*='related' i]",
    "[class*='related' i]",
    "[id*='sidebar' i]",
    "[class*='sidebar' i]",
    "[id*='advert' i]",
    "[class*='advert' i]",
    "[id*='banner' i]",
    "[class*='banner' i]",
    "[id*='sponsor' i]",
    "[class*='sponsor' i]"
  ].join(",");

  let scanTimer = 0;
  let observer = null;

  function installStyle(doc = document) {
    if (!doc?.documentElement || doc.getElementById?.(STYLE_ID)) return;
    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .${BLOCK_CLASS}, .${RELATED_CLASS}, [data-flowlens-ignore-media="true"] {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `;
    doc.documentElement.appendChild(style);
  }

  function markerOf(node) {
    if (!node?.getAttribute) return "";
    return [
      node.id,
      typeof node.className === "string" ? node.className : "",
      node.getAttribute("role"),
      node.getAttribute("aria-label"),
      node.getAttribute("title"),
      node.getAttribute("alt"),
      node.getAttribute("data-ad"),
      node.getAttribute("data-ad-slot"),
      node.getAttribute("data-google-query-id"),
      node.getAttribute("href"),
      node.getAttribute("src")
    ].filter(Boolean).join(" ");
  }

  function directText(node) {
    if (!node?.childNodes) return "";
    return Array.from(node.childNodes)
      .filter((child) => child.nodeType === 3)
      .map((child) => child.nodeValue || "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function compactText(node, limit = 180) {
    return String(directText(node) || node?.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, limit);
  }

  function skipNode(node) {
    return !node?.closest || !!node.closest("#xiv-root, #xiv-launch, #flowlens-item-gallery-preload, script, style, noscript, template");
  }

  function hasMedia(node) {
    return !!node?.querySelector?.(MEDIA_SELECTOR) || node?.matches?.(MEDIA_SELECTOR);
  }

  function mediaCount(node) {
    if (!node?.querySelectorAll) return node?.matches?.(MEDIA_SELECTOR) ? 1 : 0;
    return node.querySelectorAll(MEDIA_SELECTOR).length + (node.matches?.(MEDIA_SELECTOR) ? 1 : 0);
  }

  function looksLikeMainRoot(node) {
    const marker = markerOf(node);
    if (!SAFE_ROOT_RE.test(marker)) return false;
    if (REC_MARKER_RE.test(marker) || AD_MARKER_RE.test(marker)) return false;
    const text = compactText(node, 140);
    return !REC_TEXT_RE.test(text);
  }

  function markBlocked(node, reason = "recommend") {
    if (!node || skipNode(node) || node.nodeType !== 1) return;
    node.dataset.flowlensIgnoreMedia = "true";
    node.dataset.flowlensIgnoreReason = reason;
    node.classList?.add(BLOCK_CLASS, RELATED_CLASS);
    node.style?.setProperty?.("display", "none", "important");
    node.style?.setProperty?.("visibility", "hidden", "important");
  }

  function isLikelyBlockedContainer(node) {
    if (!node || skipNode(node) || !hasMedia(node)) return false;
    const marker = markerOf(node);
    if (AD_MARKER_RE.test(marker)) return true;
    if (REC_MARKER_RE.test(marker) && !looksLikeMainRoot(node)) return true;
    const text = compactText(node, 120);
    return REC_TEXT_RE.test(text) && mediaCount(node) <= 40 && !looksLikeMainRoot(node);
  }

  function bestSectionForHeading(heading) {
    let current = heading;
    for (let depth = 0; current && depth < 5; depth += 1) {
      if (skipNode(current)) return null;
      if (current !== heading && hasMedia(current)) {
        const marker = markerOf(current);
        const leadText = compactText(current, 140);
        const markerHit = REC_MARKER_RE.test(marker) || AD_MARKER_RE.test(marker);
        const textHit = REC_TEXT_RE.test(leadText);
        if ((markerHit || textHit) && !looksLikeMainRoot(current)) return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  function topChildUnderParent(node, parent) {
    let current = node;
    while (current?.parentElement && current.parentElement !== parent) current = current.parentElement;
    return current || node;
  }

  function markTrailingRecommendation(heading) {
    const section = bestSectionForHeading(heading);
    if (section) {
      markBlocked(section, "recommend-section");
      return;
    }

    const parent = heading.parentElement;
    if (!parent || skipNode(parent)) return;
    const start = topChildUnderParent(heading, parent);
    let current = start;
    let marked = 0;
    while (current && marked < 80) {
      const text = compactText(current, 120);
      const marker = markerOf(current);
      const containsMedia = hasMedia(current);
      const isHeading = current === start || REC_TEXT_RE.test(text) || REC_MARKER_RE.test(marker);
      if (isHeading || containsMedia || REC_MARKER_RE.test(marker) || AD_MARKER_RE.test(marker)) {
        markBlocked(current, current === start ? "recommend-heading" : "recommend-following");
      }
      if (containsMedia) marked += 1;
      current = current.nextElementSibling;
    }
  }

  function markContainers(doc = document) {
    installStyle(doc);
    try {
      doc.querySelectorAll?.(HARD_BLOCK_SELECTOR).forEach((node) => {
        if (isLikelyBlockedContainer(node)) markBlocked(node, AD_MARKER_RE.test(markerOf(node)) ? "ad-container" : "related-container");
      });
      doc.querySelectorAll?.("h1,h2,h3,h4,h5,h6,p,div,span,strong,b,legend,dt,li").forEach((node) => {
        if (skipNode(node)) return;
        const text = compactText(node, 140);
        if (!text || text.length > 140 || !REC_TEXT_RE.test(text)) return;
        markTrailingRecommendation(node);
      });
      doc.querySelectorAll?.(MEDIA_SELECTOR).forEach((node) => {
        if (skipNode(node)) return;
        let current = node;
        for (let depth = 0; current && depth < 6; depth += 1) {
          if (isLikelyBlockedContainer(current)) {
            markBlocked(current, AD_MARKER_RE.test(markerOf(current)) ? "ad-media" : "related-media");
            break;
          }
          current = current.parentElement;
        }
      });
    } catch {
      // Keep FlowLens usable on pages with unusual DOM restrictions.
    }
  }

  function scheduleScan(delay = 120) {
    clearTimeout(scanTimer);
    scanTimer = window.setTimeout(() => markContainers(document), delay);
  }

  function patchDomParser() {
    const OriginalDOMParser = window.DOMParser;
    if (!OriginalDOMParser || OriginalDOMParser.prototype.__flowLensContentFocusPatched) return;
    const original = OriginalDOMParser.prototype.parseFromString;
    OriginalDOMParser.prototype.parseFromString = function patchedParseFromString(...args) {
      const doc = original.apply(this, args);
      try { markContainers(doc); } catch {}
      return doc;
    };
    OriginalDOMParser.prototype.__flowLensContentFocusPatched = true;
  }

  function startObserver() {
    if (observer || !document.documentElement) return;
    observer = new MutationObserver(() => scheduleScan(180));
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "id", "style", "src", "href", "data-src", "data-original"] });
  }

  patchDomParser();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { markContainers(document); startObserver(); }, { once: true });
  } else {
    markContainers(document);
    startObserver();
  }
  window.addEventListener("load", () => scheduleScan(0), { once: true });
})();