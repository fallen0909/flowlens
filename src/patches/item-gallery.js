(() => {
  if (window.__flowLensItemGalleryPatch) return;
  window.__flowLensItemGalleryPatch = true;

  const VERSION = window.__FLOWLENS_VERSION__ || "1.7.3";
  const HOST_RE = /(^|\.)meitulu\.(?:me|cc|com|net|org)$/i;
  const ITEM_RE = /^\/item\/(\d+)(?:_(\d+))?\.html$/i;
  const IMAGE_RE = /\.(?:avif|gif|jpe?g|png|webp)(?:[?#]|$)/i;
  const BAD_URL_RE = /(?:^|[/?#&_.-])(?:logo|icon|favicon|sprite|button|btn|banner|ad|ads|advert|avatar|qrcode|weixin|wechat|loading|placeholder)(?:[/?#&_.=-]|$)/i;
  const BAD_CONTAINER_RE = /(?:recommend|related|rel-|sidebar|side-bar|footer|header|nav|menu|pager|pagebar|pagination|comment|share|tag|tags|广告|推薦|推荐|相關|相关|热门)/i;
  const MAX_PAGES = 120;
  const FETCH_CONCURRENCY = 2;
  const INJECT_ID = "flowlens-item-gallery-preload";

  const state = {
    started: false,
    done: false,
    pages: new Set(),
    images: new Set(),
    failures: 0
  };

  function isTargetUrl(url = location.href) {
    try {
      const parsed = new URL(url, location.href);
      return HOST_RE.test(parsed.hostname) && ITEM_RE.test(parsed.pathname);
    } catch {
      return false;
    }
  }

  function pageInfo(url = location.href) {
    try {
      const parsed = new URL(url, location.href);
      const match = parsed.pathname.match(ITEM_RE);
      if (!match || !HOST_RE.test(parsed.hostname)) return null;
      return {
        origin: parsed.origin,
        host: parsed.hostname,
        id: match[1],
        page: Number(match[2] || 1)
      };
    } catch {
      return null;
    }
  }

  function pageUrl(info, page) {
    if (!info || !page || page < 1) return "";
    return `${info.origin}/item/${info.id}${page === 1 ? "" : `_${page}`}.html`;
  }

  function pageNumberFromUrl(raw, info = pageInfo()) {
    try {
      const parsed = new URL(raw, location.href);
      const match = parsed.pathname.match(ITEM_RE);
      if (!match || !HOST_RE.test(parsed.hostname)) return 0;
      if (info?.id && match[1] !== info.id) return 0;
      return Number(match[2] || 1);
    } catch {
      return 0;
    }
  }

  function absoluteUrl(raw, base = location.href) {
    const text = String(raw || "").trim();
    if (!text || /^javascript:|^data:/i.test(text)) return "";
    try {
      return new URL(cleanUrlText(text), base).href;
    } catch {
      return "";
    }
  }

  function cleanUrlText(text) {
    return String(text || "")
      .replace(/&amp;/g, "&")
      .replace(/\\\//g, "/")
      .replace(/\\u002f/gi, "/")
      .replace(/\\u0026/gi, "&")
      .replace(/^['\"]|['\"]$/g, "")
      .trim();
  }

  function isImageUrl(url) {
    if (!url || !IMAGE_RE.test(url)) return false;
    if (BAD_URL_RE.test(url)) return false;
    try {
      const parsed = new URL(url, location.href);
      if (!/^https?:$/i.test(parsed.protocol)) return false;
      return true;
    } catch {
      return false;
    }
  }

  function isBlockedNode(node) {
    if (!node?.closest) return false;
    if (node.closest("script, style, noscript, iframe, header, footer, nav, aside")) return true;
    let current = node;
    for (let depth = 0; current && depth < 7; depth += 1) {
      const marker = [
        current.id,
        typeof current.className === "string" ? current.className : "",
        current.getAttribute?.("role"),
        current.getAttribute?.("aria-label"),
        current.getAttribute?.("title")
      ].join(" ");
      if (BAD_CONTAINER_RE.test(marker)) return true;
      current = current.parentElement;
    }
    return false;
  }

  function candidateFromImg(img, base) {
    const attrs = [
      "file",
      "zoomfile",
      "data-file",
      "data-zoomfile",
      "data-original",
      "data-src",
      "data-lazy-src",
      "data-url",
      "data-full",
      "data-large",
      "data-zoom",
      "currentSrc",
      "src"
    ];
    for (const attr of attrs) {
      const raw = attr === "currentSrc" ? img.currentSrc : img.getAttribute?.(attr);
      const url = absoluteUrl(raw, base);
      if (isImageUrl(url)) return url;
    }
    const srcset = img.getAttribute?.("srcset") || img.getAttribute?.("data-srcset") || "";
    if (srcset) {
      const last = srcset.split(",").map((item) => item.trim().split(/\s+/)[0]).filter(Boolean).pop();
      const url = absoluteUrl(last, base);
      if (isImageUrl(url)) return url;
    }
    return "";
  }

  function mainRoots(doc) {
    const selectors = [
      "article",
      "main",
      "#content",
      ".content",
      ".article",
      ".article-content",
      ".entry-content",
      ".post-content",
      ".photo",
      ".photos",
      ".picture",
      ".gallery",
      ".show",
      ".tuji",
      ".item",
      ".post",
      ".entry",
      ".box"
    ].join(",");
    const roots = Array.from(doc.querySelectorAll(selectors))
      .filter((node) => !isBlockedNode(node));
    return roots.length ? roots : [doc.body || doc.documentElement];
  }

  function addImage(url, list) {
    const clean = absoluteUrl(url, location.href);
    if (!isImageUrl(clean)) return;
    const key = clean.replace(/[#].*$/, "");
    if (state.images.has(key)) return;
    state.images.add(key);
    list.push(clean);
  }

  function extractImageUrls(doc, base) {
    const urls = [];
    const roots = mainRoots(doc);
    for (const root of roots) {
      root.querySelectorAll?.("img").forEach((img) => {
        if (isBlockedNode(img)) return;
        addImage(candidateFromImg(img, base), urls);
      });
      root.querySelectorAll?.("source[src], a[href], link[href]").forEach((node) => {
        if (isBlockedNode(node)) return;
        const raw = node.getAttribute("src") || node.getAttribute("href") || "";
        addImage(absoluteUrl(raw, base), urls);
      });
    }

    if (!urls.length) {
      const html = doc.documentElement?.innerHTML || "";
      const attrRe = /(?:src|href|file|zoomfile|data-file|data-zoomfile|data-original|data-src|data-lazy-src|data-url|data-full|data-large|data-zoom)=['\"]([^'\"]+\.(?:avif|gif|jpe?g|png|webp)(?:[^'\"]*)?)['\"]/gi;
      for (const match of html.matchAll(attrRe)) addImage(absoluteUrl(match[1], base), urls);
      const fullRe = /https?:\\?\/\\?\/[^'\"<>\s)]+\.(?:avif|gif|jpe?g|png|webp)(?:\?[^'\"<>\s)]*)?/gi;
      for (const match of html.matchAll(fullRe)) addImage(absoluteUrl(match[0], base), urls);
    }
    return urls;
  }

  function discoverPageNumbers(doc, base) {
    const info = pageInfo(base);
    if (!info) return [];
    const nums = new Set([info.page || 1]);
    doc.querySelectorAll("a[href]").forEach((link) => {
      const num = pageNumberFromUrl(absoluteUrl(link.getAttribute("href"), base), info);
      if (num > 0 && num <= MAX_PAGES) nums.add(num);
    });

    const text = (doc.body?.textContent || "").replace(/\s+/g, " ");
    for (const match of text.matchAll(/(?:^|\D)(\d{1,3})(?=\s*(?:下一页|尾页|末页|下页|>>|»|$))/g)) {
      const value = Number(match[1]);
      if (value > 1 && value <= MAX_PAGES) nums.add(value);
    }
    const max = Math.max(...nums);
    if (max > 1) {
      for (let i = 1; i <= max; i += 1) nums.add(i);
    }
    return Array.from(nums).sort((a, b) => a - b);
  }

  function ensureInjectContainer() {
    let container = document.getElementById(INJECT_ID);
    if (container) return container;
    container = document.createElement("div");
    container.id = INJECT_ID;
    container.setAttribute("aria-hidden", "true");
    container.style.cssText = "position:absolute!important;left:-99999px!important;top:0!important;width:360px!important;min-height:1px!important;opacity:.01!important;pointer-events:none!important;overflow:hidden!important;z-index:-1!important;";
    (document.body || document.documentElement).appendChild(container);
    return container;
  }

  function injectUrls(urls) {
    if (!urls.length) return 0;
    const container = ensureInjectContainer();
    let added = 0;
    for (const url of urls) {
      const key = url.replace(/[#].*$/, "");
      if (document.querySelector(`#${INJECT_ID} img[data-fl-key="${cssEscape(key)}"]`)) continue;
      const link = document.createElement("a");
      link.href = url;
      link.dataset.flItemGallery = "true";
      link.style.cssText = "display:block!important;width:320px!important;min-height:420px!important;margin:0!important;padding:0!important;";
      const img = document.createElement("img");
      img.src = url;
      img.dataset.original = url;
      img.dataset.flKey = key;
      img.loading = "eager";
      img.decoding = "async";
      img.alt = "FlowLens gallery image";
      img.style.cssText = "display:block!important;width:320px!important;height:480px!important;object-fit:contain!important;";
      link.appendChild(img);
      container.appendChild(link);
      added += 1;
    }
    if (added) {
      document.dispatchEvent(new CustomEvent("flowlens:item-gallery:ready", { detail: { added, total: state.images.size } }));
      const status = document.getElementById("xiv-status");
      if (status) status.textContent = `已补齐分页图片 ${state.images.size} 张`;
    }
    return added;
  }

  function cssEscape(value) {
    if (window.CSS?.escape) return CSS.escape(value);
    return String(value).replace(/["\\]/g, "\\$&");
  }

  function gmFetchText(url) {
    const gmRequest = typeof GM_xmlhttpRequest === "function"
      ? GM_xmlhttpRequest
      : (typeof GM !== "undefined" && typeof GM.xmlHttpRequest === "function" ? GM.xmlHttpRequest.bind(GM) : null);
    if (!gmRequest) return Promise.reject(new Error("GM_xmlhttpRequest unavailable"));
    return new Promise((resolve, reject) => {
      gmRequest({
        method: "GET",
        url,
        timeout: 30000,
        headers: { Accept: "text/html,application/xhtml+xml" },
        onload: (response) => {
          const status = Number(response.status || 0);
          if (status >= 200 && status < 300) resolve(response.responseText || "");
          else reject(new Error(`HTTP ${status || 0}`));
        },
        onerror: () => reject(new Error("request failed")),
        ontimeout: () => reject(new Error("request timeout"))
      });
    });
  }

  async function fetchHtml(url) {
    try {
      const res = await fetch(url, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (error) {
      return gmFetchText(url);
    }
  }

  async function run() {
    if (state.started || !isTargetUrl()) return;
    state.started = true;
    const info = pageInfo();
    if (!info) return;

    try {
      const currentUrls = extractImageUrls(document, location.href);
      injectUrls(currentUrls);
      const pageNumbers = discoverPageNumbers(document, location.href);
      const urls = pageNumbers
        .map((num) => pageUrl(info, num))
        .filter(Boolean)
        .filter((url, index, array) => array.indexOf(url) === index)
        .slice(0, MAX_PAGES);

      urls.forEach((url) => state.pages.add(url));
      let cursor = 0;
      const worker = async () => {
        while (cursor < urls.length) {
          const url = urls[cursor++];
          if (!url || url === location.href) continue;
          try {
            const html = await fetchHtml(url);
            if (/正在进行安全验证|cloudflare|cf-browser-verification|Just a moment/i.test(html)) {
              state.failures += 1;
              continue;
            }
            const doc = new DOMParser().parseFromString(html, "text/html");
            const found = extractImageUrls(doc, url);
            injectUrls(found);
          } catch {
            state.failures += 1;
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, Math.max(1, urls.length)) }, worker));
    } finally {
      state.done = true;
      window.__FlowLensItemGallery = {
        version: VERSION,
        pages: state.pages.size,
        images: state.images.size,
        failures: state.failures,
        done: state.done
      };
    }
  }

  function scheduleRun(delay = 300) {
    window.setTimeout(run, delay);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => scheduleRun(500), { once: true });
  } else {
    scheduleRun(500);
  }
  document.addEventListener("click", (event) => {
    if (event.target?.closest?.("#xiv-launch")) scheduleRun(0);
  }, true);
})();
