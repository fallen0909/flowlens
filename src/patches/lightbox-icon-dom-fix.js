(() => {
  if (window.__flowLensRecommendationPrunePatch) return;
  window.__flowLensRecommendationPrunePatch = true;

  const STYLE_ID = "flowlens-recommendation-prune-style";
  const MARK = "data-flowlens-recommendation-pruned";
  const MEDIA_SELECTOR = "img, picture, video, source[src], a[href*='.jpg' i], a[href*='.jpeg' i], a[href*='.png' i], a[href*='.webp' i], a[href*='.avif' i], a[href*='.gif' i], a[href*='.mp4' i], a[href*='.webm' i]";
  const HEADING_SELECTOR = "h1,h2,h3,h4,h5,h6,p,div,span,strong,b,legend,dt,li";
  const RELATED_TEXT_RE = /(?:推荐您看|推薦您看|相关推荐|相關推薦|相关套图|相關套圖|相关图集|相關圖集|相关图片|相關圖片|猜你喜欢|猜你喜歡|你可能喜欢|你可能喜歡|为你推荐|為你推薦|推荐阅读|推薦閱讀|大家都在看|看了又看|看过还看|热门推荐|熱門推薦|更多推荐|更多推薦|更多美图|更多套图|相似图集|同类推荐|Related\s*(?:Posts?|Galleries?|Images?)|Recommended|You\s+may\s+also\s+like|More\s+like\s+this|More\s+galleries|Similar\s+galleries)/i;
  const RELATED_MARKER_RE = /(?:recommend|recommended|related|similar|guess|you-may|also-like|more-like|hot|popular|rank|ranking|sidebar|footer|推荐|推薦|相关|相關|猜你喜欢|猜你喜歡|热门|熱門|排行|更多美图|更多套图|相似|同类)/i;
  const MAIN_MARKER_RE = /(?:article|main|content|entry|post|photo|photos|picture|gallery|album|item|正文|内容|內容|图集|圖集|相册|相冊)/i;

  function installStyle(doc = document) {
    if (!doc?.documentElement || doc.getElementById?.(STYLE_ID)) return;
    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `[${MARK}="true"]{display:none!important;visibility:hidden!important;pointer-events:none!important;}`;
    doc.documentElement.appendChild(style);
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

  function markerOf(node) {
    if (!node?.getAttribute) return "";
    return [
      node.id,
      typeof node.className === "string" ? node.className : "",
      node.getAttribute("role"),
      node.getAttribute("aria-label"),
      node.getAttribute("title")
    ].filter(Boolean).join(" ");
  }

  function skipNode(node) {
    return !node?.closest || !!node.closest("#xiv-root, #xiv-launch, script, style, noscript, template");
  }

  function isBodyLevel(node) {
    return !node || node.nodeType !== 1 || /^(HTML|BODY)$/i.test(node.tagName || "");
  }

  function mediaCount(node) {
    if (!node?.querySelectorAll) return node?.matches?.(MEDIA_SELECTOR) ? 1 : 0;
    return node.querySelectorAll(MEDIA_SELECTOR).length + (node.matches?.(MEDIA_SELECTOR) ? 1 : 0);
  }

  function looksLikeMainContent(node) {
    const marker = markerOf(node);
    if (!MAIN_MARKER_RE.test(marker)) return false;
    if (RELATED_MARKER_RE.test(marker)) return false;
    return !RELATED_TEXT_RE.test(compactText(node, 160));
  }

  function removeOrHide(node, doc, reason = "recommendation") {
    if (!node || skipNode(node) || isBodyLevel(node)) return;
    if (doc !== document) {
      node.remove();
      return;
    }
    node.setAttribute(MARK, "true");
    node.setAttribute("data-flowlens-prune-reason", reason);
    node.style?.setProperty?.("display", "none", "important");
    node.style?.setProperty?.("visibility", "hidden", "important");
  }

  function bestSectionForHeading(heading) {
    let current = heading;
    let best = null;
    for (let depth = 0; current && depth < 6; depth += 1) {
      if (skipNode(current) || isBodyLevel(current)) break;
      const count = mediaCount(current);
      const text = compactText(current, 220);
      const marker = markerOf(current);
      if (count >= 2 && count <= 80 && (RELATED_TEXT_RE.test(text) || RELATED_MARKER_RE.test(marker)) && !looksLikeMainContent(current)) best = current;
      current = current.parentElement;
    }
    return best;
  }

  function topChildUnder(node, parent) {
    let current = node;
    while (current?.parentElement && current.parentElement !== parent) current = current.parentElement;
    return current || node;
  }

  function pruneFromHeading(heading, doc) {
    const section = bestSectionForHeading(heading);
    if (section) {
      removeOrHide(section, doc, "heading-section");
      return;
    }
    const parent = heading.parentElement;
    if (!parent || skipNode(parent) || isBodyLevel(parent)) return;
    let current = topChildUnder(heading, parent);
    let seenMedia = 0;
    for (let i = 0; current && i < 90; i += 1) {
      const next = current.nextElementSibling;
      const count = mediaCount(current);
      const text = compactText(current, 180);
      const marker = markerOf(current);
      const hit = i === 0 || count > 0 || RELATED_TEXT_RE.test(text) || RELATED_MARKER_RE.test(marker);
      if (!hit) break;
      removeOrHide(current, doc, i === 0 ? "heading" : "heading-following");
      seenMedia += count;
      if (seenMedia > 80) break;
      current = next;
    }
  }

  function pruneDocument(doc = document) {
    if (!doc?.querySelectorAll) return;
    installStyle(doc);
    try {
      doc.querySelectorAll(HEADING_SELECTOR).forEach((node) => {
        if (skipNode(node)) return;
        const text = compactText(node, 160);
        if (!text || text.length > 160 || !RELATED_TEXT_RE.test(text)) return;
        pruneFromHeading(node, doc);
      });
      doc.querySelectorAll("[id],[class]").forEach((node) => {
        if (skipNode(node) || isBodyLevel(node)) return;
        const marker = markerOf(node);
        if (!RELATED_MARKER_RE.test(marker) || looksLikeMainContent(node)) return;
        const count = mediaCount(node);
        if (count >= 2 && count <= 80) removeOrHide(node, doc, "related-marker");
      });
    } catch {}
  }

  function patchDomParser() {
    const Parser = window.DOMParser;
    if (!Parser || Parser.prototype.__flowLensRecommendationPrunePatched) return;
    const original = Parser.prototype.parseFromString;
    Parser.prototype.parseFromString = function flowLensParseFromString(...args) {
      const doc = original.apply(this, args);
      try { pruneDocument(doc); } catch {}
      return doc;
    };
    Parser.prototype.__flowLensRecommendationPrunePatched = true;
  }

  patchDomParser();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => pruneDocument(document), { once: true });
  else pruneDocument(document);
  window.addEventListener("load", () => pruneDocument(document), { once: true });
  window.setTimeout(() => pruneDocument(document), 500);
})();