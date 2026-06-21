(() => {
  if (window.__flowLensZhihuCollector) return;
  window.__flowLensZhihuCollector = true;

  function isZhihuPage() {
    try {
      return /(^|\.)zhihu\.com$/i.test(location.hostname);
    } catch {
      return false;
    }
  }

  if (!isZhihuPage()) return;

  const CONTAINER_ID = "xiv-zhihu-precollector";
  const ZHIMG_RE = /https?:\/\/pic\d?\.zhimg\.com\/(?:\d+\/)?v2-[^"'<>\s\\)]+?\.(?:webp|jpe?g|png)(?:\?[^"'<>\s\\)]*)?/gi;
  const LOAD_BUTTON_RE = /(展开阅读全文|阅读全文|查看全部|显示全部|更多回答|加载更多|继续浏览内容|查看剩余|展开更多)/;
  const MAX_AUTOLOAD_TIME = 90000;
  let scheduled = 0;
  let loaderRunning = false;
  let loaderStartedAt = 0;
  let originalScrollY = 0;
  let originalHtmlOverflow = "";
  let originalBodyOverflow = "";
  let lastHeight = 0;
  let lastCount = 0;
  let idleTicks = 0;

  function cleanupUrl(raw) {
    let value = String(raw || "")
      .replace(/\\\//g, "/")
      .replace(/\\u002f/gi, "/")
      .replace(/&amp;/g, "&")
      .replace(/\\u0026/gi, "&")
      .trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      // Keep undecoded values when URL contains incomplete escape sequences.
    }
    const match = value.match(ZHIMG_RE);
    return match ? match[0].replace(/&amp;/g, "&") : "";
  }

  function zhimgKey(url) {
    const text = String(url || "");
    const match = text.match(/\/(?:\d+\/)?(v2-[A-Za-z0-9]+)(?:[_-][^/.]+)?\.(?:webp|jpe?g|png)/i);
    return match ? match[1].toLowerCase() : text.replace(/[?#].*$/, "");
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
      [
        node.currentSrc,
        node.src,
        node.srcset,
        node.getAttribute?.("src"),
        node.getAttribute?.("srcset"),
        node.getAttribute?.("data-src"),
        node.getAttribute?.("data-srcset"),
        node.getAttribute?.("data-original"),
        node.getAttribute?.("data-actualsrc"),
        node.getAttribute?.("data-lazy-src"),
        node.getAttribute?.("data-thumbnail")
      ].forEach((value) => {
        if (!value) return;
        String(value).split(",").forEach((part) => rememberUrl(result, part.trim().split(/\s+/)[0]));
      });
    });

    const html = document.documentElement?.innerHTML || "";
    (html.match(ZHIMG_RE) || []).forEach((url) => rememberUrl(result, url));
    return [...result.values()];
  }

  function ensureContainer() {
    let container = document.getElementById(CONTAINER_ID);
    if (container) return container;
    container = document.createElement("div");
    container.id = CONTAINER_ID;
    container.setAttribute("aria-hidden", "true");
    container.style.cssText = [
      "position:absolute",
      "left:-10000px",
      "top:0",
      "width:360px",
      "min-height:240px",
      "overflow:visible",
      "opacity:.01",
      "pointer-events:none",
      "z-index:0",
      "contain:content"
    ].join(";");
    document.body?.insertBefore(container, document.body.firstChild);
    return container;
  }

  function syncPrecollector() {
    if (!document.body) return 0;
    const urls = collectZhimgUrls();
    if (!urls.length) return 0;
    const container = ensureContainer();
    const existingByKey = new Map([...container.querySelectorAll("img[data-xiv-zhimg]")].map((img) => [zhimgKey(img.src), img]));
    let added = 0;
    urls.forEach((url, index) => {
      const key = zhimgKey(url);
      const existing = existingByKey.get(key);
      if (existing) {
        if (qualityScore(url) > qualityScore(existing.src)) existing.src = url;
        return;
      }
      const img = document.createElement("img");
      img.dataset.xivZhimg = "true";
      img.dataset.xivZhimgKey = key;
      img.alt = `知乎图片 ${index + 1}`;
      img.loading = index < 24 ? "eager" : "lazy";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.src = url;
      img.style.cssText = "display:block;width:360px;height:240px;object-fit:cover;margin:0 0 2px 0;content-visibility:auto;contain-intrinsic-size:360px 240px;";
      container.appendChild(img);
      existingByKey.set(key, img);
      added += 1;
    });
    return added;
  }

  function scheduleSync() {
    clearTimeout(scheduled);
    scheduled = window.setTimeout(() => {
      syncPrecollector();
      maybeStartAnswerAutoload();
    }, 180);
  }

  function viewerActive() {
    return document.getElementById("xiv-root")?.dataset.active === "true";
  }

  function setStatus(text) {
    const status = document.getElementById("xiv-status");
    if (status) status.textContent = text;
  }

  function isVisibleElement(el) {
    const rect = el?.getBoundingClientRect?.();
    return !!(rect && rect.width > 0 && rect.height > 0);
  }

  function clickLoadButtons() {
    let clicked = 0;
    document.querySelectorAll("button, a, [role='button']").forEach((el) => {
      if (clicked >= 3) return;
      if (!isVisibleElement(el)) return;
      const text = (el.textContent || el.getAttribute("aria-label") || el.getAttribute("title") || "").replace(/\s+/g, "");
      if (!text || text.length > 28 || !LOAD_BUTTON_RE.test(text)) return;
      try {
        el.click();
        clicked += 1;
      } catch {
        // Ignore click failures.
      }
    });
    return clicked;
  }

  function pageHeight() {
    const doc = document.documentElement;
    const body = document.body;
    return Math.max(doc?.scrollHeight || 0, body?.scrollHeight || 0);
  }

  function currentImageCount() {
    return document.querySelectorAll(`#${CONTAINER_ID} img[data-xiv-zhimg]`).length;
  }

  function safeOriginalOverflow(value) {
    return value === "hidden" && viewerActive() ? "" : value;
  }

  function restoreOriginalPagePosition() {
    try {
      document.documentElement.classList.remove("xiv-active");
      document.documentElement.style.overflow = safeOriginalOverflow(originalHtmlOverflow);
      if (document.body) {
        document.body.style.overflow = safeOriginalOverflow(originalBodyOverflow);
        if (document.body.style.pointerEvents === "none") document.body.style.pointerEvents = "";
      }
      window.scrollTo({ top: originalScrollY, behavior: "auto" });
    } catch {
      // Keep current position if restoring is blocked.
    }
  }

  function stopAnswerAutoload(reason = "就绪") {
    if (!loaderRunning) return;
    loaderRunning = false;
    syncPrecollector();
    restoreOriginalPagePosition();
    setStatus(reason);
  }

  function answerAutoloadTick() {
    if (!loaderRunning) return;
    if (!viewerActive()) {
      stopAnswerAutoload("就绪");
      return;
    }
    if (Date.now() - loaderStartedAt > MAX_AUTOLOAD_TIME) {
      stopAnswerAutoload("知乎加载完成");
      return;
    }

    try {
      document.documentElement.style.overflow = "auto";
      if (document.body) document.body.style.overflow = "auto";
    } catch {
      // Ignore style restrictions.
    }

    clickLoadButtons();
    const added = syncPrecollector();
    const beforeHeight = pageHeight();
    const step = Math.max(900, Math.round(window.innerHeight * 0.9));
    const nextTop = Math.min(beforeHeight, window.scrollY + step);
    window.scrollTo({ top: nextTop, behavior: "auto" });

    window.setTimeout(() => {
      const height = pageHeight();
      const count = currentImageCount();
      const progressed = height > lastHeight + 80 || count > lastCount || added > 0;
      if (progressed) {
        idleTicks = 0;
        lastHeight = height;
        lastCount = count;
        setStatus(`知乎加载中 ${count} 张`);
      } else {
        idleTicks += 1;
      }
      const nearBottom = window.scrollY + window.innerHeight >= height - 360;
      if (nearBottom && idleTicks >= 8) {
        stopAnswerAutoload("知乎加载完成");
        return;
      }
      answerAutoloadTick();
    }, 650);
  }

  function maybeStartAnswerAutoload() {
    if (loaderRunning || !viewerActive()) return;
    if (!/\/question\//i.test(location.pathname)) return;
    loaderRunning = true;
    loaderStartedAt = Date.now();
    originalScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    originalHtmlOverflow = safeOriginalOverflow(document.documentElement.style.overflow || "");
    originalBodyOverflow = safeOriginalOverflow(document.body?.style?.overflow || "");
    lastHeight = pageHeight();
    lastCount = currentImageCount();
    idleTicks = 0;
    setStatus("知乎加载更多答案");
    answerAutoloadTick();
  }

  syncPrecollector();
  window.addEventListener("load", scheduleSync, { once: true });
  window.addEventListener("scroll", scheduleSync, { passive: true });
  window.addEventListener("keydown", () => setTimeout(maybeStartAnswerAutoload, 200), true);
  window.addEventListener("click", () => setTimeout(maybeStartAnswerAutoload, 200), true);
  window.setInterval(() => {
    if (loaderRunning && !viewerActive()) stopAnswerAutoload("就绪");
    else maybeStartAnswerAutoload();
  }, 1200);
  new MutationObserver(scheduleSync).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src", "srcset", "data-src", "data-srcset", "data-original", "data-actualsrc"]
  });
})();
