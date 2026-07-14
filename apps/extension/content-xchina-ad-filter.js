(() => {
  if (window.__flowLensXchinaAdFilter) return;
  window.__flowLensXchinaAdFilter = true;

  const BLOCKED_NAMES = ["6a38baf0e4f9b.webp", "6914a1e352a47.webp"];

  function isXchinaPhotoPage() {
    try {
      const parsed = new URL(location.href);
      return /(^|\.)xchina\.co$/i.test(parsed.hostname) && /^\/photo\/id-/i.test(parsed.pathname);
    } catch {
      return false;
    }
  }

  function normalized(value) {
    return String(value || "").replaceAll("\\/", "/").replace(/\\u002f/gi, "/").replaceAll("&amp;", "&").toLowerCase();
  }

  function isBlockedValue(value) {
    const text = normalized(value);
    return !!text && BLOCKED_NAMES.some((name) => text.includes(name));
  }

  function nodeHasBlockedMedia(node) {
    if (!node?.getAttribute) return false;
    const attrs = ["src", "href", "poster", "file", "zoomfile", "data-file", "data-zoomfile", "data-src", "data-original", "data-lazy-src", "data-url", "data-full", "data-large", "srcset", "data-srcset", "style"];
    return attrs.some((attr) => isBlockedValue(node.getAttribute(attr)));
  }

  function removeBlockedNodes(root = document) {
    if (!isXchinaPhotoPage()) return;
    const scope = root?.querySelectorAll ? root : document;
    scope.querySelectorAll("img, source, picture, a, iframe, [style], [srcset], [data-srcset], [data-src], [data-original], [data-url], [data-full], [data-large]").forEach((node) => {
      if (!nodeHasBlockedMedia(node)) return;
      const container = node.closest?.("a, picture, figure, iframe") || node;
      container.remove?.();
    });
  }

  window.__flowLensIsBlockedXchinaMedia = isBlockedValue;
  window.__flowLensCleanXchinaText = (text) => {
    let next = String(text || "");
    for (const name of BLOCKED_NAMES) {
      next = next.replace(new RegExp(`https?:[^\"'()<>\\s]+${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "gi"), "");
      next = next.replaceAll(name, "");
    }
    return next;
  };

  removeBlockedNodes(document);
  const observer = new MutationObserver(() => removeBlockedNodes(document));
  if (document.documentElement) {
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "srcset", "href", "style", "data-src", "data-original", "data-url", "data-full", "data-large"] });
  }
})();
