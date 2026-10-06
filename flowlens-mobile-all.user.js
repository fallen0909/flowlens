// ==UserScript==
// @name         FlowLens mobile
// @namespace    local.flowlens.mobile.all
// @version      2.0.5
// @description  FlowLens mobile release.
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_openInTab
// @connect      localhost
// @connect      127.0.0.1
// @connect      self
// @connect      video.twimg.com
// @connect      pbs.twimg.com
// @connect      twimg.moonchan.xyz
// @connect      x.moonchan.xyz
// @connect      img.xchina.io
// @connect      upload.xchina.io
// @downloadURL  https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-mobile-all.user.js
// @updateURL    https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-mobile-all.user.js
// ==/UserScript==

// FlowLens module: src/core/version.js
(() => {
  const VERSION = "2.0.5";
  window.__FlowLensVersion = Object.freeze({ name: "FlowLens", version: VERSION, channel: "stable", releaseDate: "2026-10-06", features: Object.freeze(["settings-modules", "reliable-slideshow", "video-auto-advance", "cd2-stream-local-playback", "gallery-locale-dedupe", "gallery-previews"]), source: "src/core/version.js" });
  window.__FLOWLENS_VERSION__ = VERSION;
  window.__flowLensGetVersion = () => window.__FlowLensVersion;
})();

// FlowLens module: src/core/global-settings.js
(() => {
  if (window.__flowLensGlobalSettings) return;
  window.__flowLensGlobalSettings = true;
  if (window.__flowLensSettingsStore || typeof GM_getValue !== "function") return;
  const SETTINGS_KEY = "flowlens-settings-v2";
  const GLOBAL_KEY = "flowlens-global-settings-v2";
  const SYNC_KEYS = ["launchHidden", "launchCompact", "autoFullscreen", "videoPreview", "theme", "columns", "autoScrollSpeed", "lightboxAutoDelay"];
  const parse = value => { try { return typeof value === "string" ? JSON.parse(value) || {} : value || {}; } catch { return {}; } };
  const pick = value => Object.fromEntries(SYNC_KEYS.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]));
  function readLocal() { try { return parse(localStorage.getItem(SETTINGS_KEY)); } catch { return {}; } }
  function readGlobal() { try { return pick(parse(GM_getValue(GLOBAL_KEY, "{}"))); } catch { return {}; } }
  function apply() {
    const settings = { ...readLocal(), ...readGlobal() };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
    document.documentElement.classList.toggle("xiv-fl-launch-hidden", settings.launchHidden === true);
    window.dispatchEvent(new CustomEvent("flowlens:settings-updated", { detail: settings }));
    return settings;
  }
  // Save only explicit changes; a background tab cannot overwrite newer values.
  function sync(patch = {}) {
    const changed = pick(patch);
    if (Object.keys(changed).length) {
      try { GM_setValue(GLOBAL_KEY, JSON.stringify({ ...readGlobal(), ...changed })); } catch {}
    }
    return apply();
  }
  window.__flowLensApplyGlobalSettings = apply;
  window.__flowLensSyncGlobalSettings = sync;
  apply();
  if (typeof GM_addValueChangeListener === "function") {
    GM_addValueChangeListener(GLOBAL_KEY, (_key, _old, _next, remote) => { if (remote) apply(); });
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") apply(); });
})();

// FlowLens module: src/patches/x810114-safe-start.js
(() => {
  if (window.__flowLensX810114SafeStartPatch) return;
  window.__flowLensX810114SafeStartPatch = true;

  function isTarget() {
    try {
      return /(^|\.)x\.810114\.xyz$/i.test(location.hostname);
    } catch {
      return false;
    }
  }

  if (!isTarget()) return;

  const AUTO_OPEN_KEY = "flowlens-gallery-queue-auto-open";

  function clearAutoOpen() {
    try { sessionStorage.removeItem(AUTO_OPEN_KEY); } catch {}
  }

  clearAutoOpen();
  window.addEventListener("pageshow", clearAutoOpen, true);
  window.addEventListener("beforeunload", clearAutoOpen, true);

  try {
    const originalGetItem = Storage.prototype.getItem;
    if (!Storage.prototype.__flowLensX810114SafeGetItem) {
      Object.defineProperty(Storage.prototype, "__flowLensX810114SafeGetItem", { value: true, configurable: true });
      Storage.prototype.getItem = function flowLensSafeGetItem(key) {
        if (this === sessionStorage && key === AUTO_OPEN_KEY && isTarget()) return "";
        return originalGetItem.call(this, key);
      };
    }
  } catch {
    // Storage can be locked down on some browsers; clearing the key above is enough for normal cases.
  }
})();

// FlowLens module: src/patches/item-gallery.js
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

// FlowLens module: src/patches/xchina-ad-filter.js
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

// FlowLens module: src/patches/media-filter-center.js
(() => {
  if (window.__flowLensMediaFilterCenter) return;
  window.__flowLensMediaFilterCenter = true;

  const STORE_KEY = "flowlens-media-filter-center-v1";
  const MAX_LOG = 80;
  const defaultConfig = {
    enabled: true,
    smart: true,
    diagnostics: true,
    showTileButton: true,
    hosts: "",
    terms: "6a38baf0e4f9b.webp\n6914a1e352a47.webp"
  };
  const logs = [];
  const adapters = [];
  let timer = 0;

  function readConfig() {
    try { return { ...defaultConfig, ...(JSON.parse(localStorage.getItem(STORE_KEY) || "{}") || {}) }; }
    catch { return { ...defaultConfig }; }
  }

  function writeConfig(next) {
    const config = { ...readConfig(), ...next };
    try { localStorage.setItem(STORE_KEY, JSON.stringify(config)); } catch {}
    refreshUi();
    scheduleApply(10);
    return config;
  }

  function splitLines(text) { return String(text || "").split(/[\n,;]/).map((item) => item.trim()).filter(Boolean); }
  function clean(value) { return String(value || "").replaceAll("\\/", "/").replace(/\\u002f/gi, "/").replaceAll("&amp;", "&"); }

  function urlInfo(value) {
    try {
      const parsed = new URL(clean(value), location.href);
      return { href: parsed.href, host: parsed.hostname.toLowerCase(), path: parsed.pathname.toLowerCase(), name: (parsed.pathname.split("/").pop() || "").toLowerCase() };
    } catch {
      const text = clean(value).toLowerCase();
      return { href: text, host: "", path: text, name: text.split(/[/?#]/)[0].split("/").pop() || text };
    }
  }

  function currentAdapter() {
    const url = location.href;
    return adapters.find((item) => { try { return item.match?.(url); } catch { return false; } }) || null;
  }

  function registerAdapter(adapter) {
    if (!adapter?.id || adapters.some((item) => item.id === adapter.id)) return;
    adapters.push(adapter);
  }

  function reasonFor(value, node = null) {
    const config = readConfig();
    if (!config.enabled || !value) return "";
    const info = urlInfo(value);
    const hay = `${info.href} ${info.name} ${node?.textContent || ""}`.toLowerCase();
    const term = splitLines(config.terms).find((item) => hay.includes(item.toLowerCase()));
    if (term) return `关键词：${term}`;
    const hostRule = splitLines(config.hosts).find((item) => info.host === item.toLowerCase() || info.host.endsWith(`.${item.toLowerCase()}`));
    if (hostRule) return `来源域名：${hostRule}`;
    const adapterReason = currentAdapter()?.reason?.(info, node, config);
    if (adapterReason) return adapterReason;
    if (config.smart && node) {
      const label = [node.getAttribute?.("alt"), node.getAttribute?.("title"), node.getAttribute?.("aria-label"), node.closest?.("a")?.textContent, node.textContent].join(" ");
      if (/广告|推广|下载|扫码|官方APP|APP下载|sponsor|promo|banner/i.test(label)) return "周边文字";
      const rect = node.getBoundingClientRect?.();
      if (rect?.width > 260 && rect?.height > 40 && rect.width / Math.max(1, rect.height) > 2.6) return "横幅比例";
    }
    return "";
  }

  function nodeReason(node) {
    if (!node?.getAttribute) return "";
    const attrs = ["src", "currentSrc", "href", "poster", "file", "zoomfile", "data-file", "data-zoomfile", "data-src", "data-original", "data-lazy-src", "data-url", "data-full", "data-large", "srcset", "data-srcset", "style"];
    for (const attr of attrs) {
      const value = attr === "currentSrc" ? node.currentSrc : node.getAttribute(attr);
      const reason = reasonFor(value, node);
      if (reason) return reason;
    }
    return "";
  }

  function logBlocked(url, reason) {
    if (!readConfig().diagnostics) return;
    const latest = logs[0];
    if (latest?.url === String(url || "").slice(0, 220) && latest?.reason === reason) return;
    logs.unshift({ url: String(url || "").slice(0, 220), reason, time: new Date().toLocaleTimeString() });
    logs.splice(MAX_LOG);
    refreshLog();
  }

  function hideTile(tile, reason) {
    const url = tile?.dataset?.url || tile?.querySelector?.("img,video")?.dataset?.sourceUrl || "";
    logBlocked(url, reason);
    tile.hidden = true;
    tile.dataset.flFilteredOut = "true";
    tile.dataset.flFilteredReason = reason;
  }

  function addTerm(value) {
    const info = urlInfo(value);
    const marker = info.name || info.href;
    if (!marker) return;
    const config = readConfig();
    const terms = splitLines(config.terms);
    if (!terms.some((item) => item.toLowerCase() === marker.toLowerCase())) terms.push(marker);
    writeConfig({ terms: terms.join("\n") });
  }

  function currentLightboxUrl() {
    const media = document.querySelector("#xiv-lightbox > img, #xiv-lightbox > video, #xiv-lightbox iframe");
    return media?.currentSrc || media?.src || media?.dataset?.sourceUrl || "";
  }

  function decorateTile(tile) {
    const config = readConfig();
    if (!config.showTileButton || tile.querySelector(".fl-mf-block")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "fl-mf-block";
    button.title = "拉黑这张图";
    button.textContent = "×";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const url = tile.dataset.url || tile.querySelector("img,video")?.src || "";
      addTerm(url);
      hideTile(tile, "手动拉黑");
      finishApply();
    }, true);
    tile.appendChild(button);
  }

  function finishApply() {
    window.__flowLensControl?.refreshMediaFilter?.();
    window.__flowLensControl?.compactVisibleLabels?.();
    window.dispatchEvent(new CustomEvent("flowlens:media-filter-applied"));
  }

  function applyFilters() {
    const config = readConfig();
    document.documentElement.dataset.flMediaFilter = config.enabled ? "true" : "false";
    document.querySelectorAll("#xiv-grid .xiv-tile").forEach((tile) => {
      decorateTile(tile);
      if (!config.enabled) {
        if (tile.dataset.flFilteredOut === "true") tile.hidden = false;
        delete tile.dataset.flFilteredOut;
        delete tile.dataset.flFilteredReason;
        return;
      }
      const reason = reasonFor(tile.dataset.url, tile) || nodeReason(tile);
      if (reason) hideTile(tile, reason);
      else if (tile.dataset.flFilteredOut === "true") {
        tile.hidden = false;
        delete tile.dataset.flFilteredOut;
        delete tile.dataset.flFilteredReason;
      }
    });
    const lb = document.querySelector("#xiv-lightbox[data-active='true']");
    const url = currentLightboxUrl();
    const reason = url ? reasonFor(url, lb) : "";
    if (reason && window.__flowLensControl?.showAdjacent) {
      logBlocked(url, reason);
      window.__flowLensControl.showAdjacent(1);
    }
    finishApply();
  }

  function scheduleApply(delay = 220) {
    clearTimeout(timer);
    timer = setTimeout(applyFilters, delay);
  }

  function installStyle() {
    if (document.getElementById("fl-media-filter-style")) return;
    const style = document.createElement("style");
    style.id = "fl-media-filter-style";
    style.textContent = `
      .fl-mf-section { margin-top: 12px; border-radius: 12px; background: rgba(255,255,255,.055); overflow: hidden; }
      #xiv-root[data-theme='light'] .fl-mf-section { background: rgba(0,0,0,.035); }
      .fl-mf-section summary { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 11px 12px; cursor: pointer; list-style: none; font: 850 12px/1.3 system-ui, sans-serif; }
      .fl-mf-section summary::-webkit-details-marker { display: none; }
      .fl-mf-section summary::after { content: '›'; transform: rotate(90deg); font-size: 18px; opacity: .55; transition: transform .18s ease; }
      .fl-mf-section details[open] summary::after { transform: rotate(-90deg); }
      .fl-mf-body { padding: 0 12px 12px; }
      .fl-mf-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 34px; margin: 2px 0; font-size: 12px; }
      .fl-mf-row input[type='checkbox'] { appearance: none; width: 36px; height: 20px; margin: 0; border: 1px solid rgba(127,127,127,.28); border-radius: 999px; background: radial-gradient(circle at 10px 50%, #fff 0 6px, transparent 6.5px), rgba(127,127,127,.3); cursor: pointer; }
      .fl-mf-row input[type='checkbox']:checked { border-color: #4f72ff; background: radial-gradient(circle at 25px 50%, #fff 0 6px, transparent 6.5px), #4f72ff; }
      .fl-mf-hint { margin: 8px 0 5px; color: rgba(255,255,255,.56); font-size: 11px; line-height: 1.35; }
      #xiv-root[data-theme='light'] .fl-mf-hint { color: rgba(0,0,0,.5); }
      .fl-mf-section textarea { width: 100%; min-height: 48px; max-height: 110px; resize: vertical; box-sizing: border-box; border-radius: 9px; border: 1px solid rgba(255,255,255,.14); background: rgba(0,0,0,.16); color: inherit; padding: 8px; font: 12px/1.4 ui-monospace, monospace; }
      .fl-mf-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
      .fl-mf-actions button { width: auto !important; min-width: 0 !important; height: 32px !important; border: 0; border-radius: 9px; padding: 0 10px !important; font-size: 11px !important; font-weight: 800; cursor: pointer; }
      .fl-mf-log { max-height: 120px; overflow: auto; margin-top: 8px; font-size: 11px; opacity: .86; white-space: pre-wrap; }
      .fl-mf-block { position: absolute; top: 7px; right: 7px; z-index: 5; width: 25px; height: 25px; border-radius: 999px; border: 0; background: rgba(0,0,0,.56); color: white; font: 900 18px/1 system-ui; opacity: 0; pointer-events: auto; }
      .xiv-tile:hover .fl-mf-block, .fl-mf-block:focus { opacity: 1; }
      #xiv-root[data-theme='light'] .fl-mf-section textarea { background: rgba(255,255,255,.88); color: #151515; border-color: rgba(0,0,0,.16); }
    `;
    document.documentElement.appendChild(style);
  }

  function ensureUi() {
    const panel = document.querySelector(".xiv-panel[data-panel='settings']");
    if (!panel || panel.querySelector(".fl-mf-section")) return;
    const section = document.createElement("section");
    section.className = "fl-mf-section";
    section.innerHTML = `
      <details>
        <summary>高级广告过滤</summary>
        <div class="fl-mf-body">
          <label class="fl-mf-row"><span>启用识别过滤</span><input type="checkbox" data-fl-mf="enabled"></label>
          <label class="fl-mf-row"><span>智能识别</span><input type="checkbox" data-fl-mf="smart"></label>
          <label class="fl-mf-row"><span>显示拉黑按钮</span><input type="checkbox" data-fl-mf="showTileButton"></label>
          <label class="fl-mf-row"><span>记录过滤原因</span><input type="checkbox" data-fl-mf="diagnostics"></label>
          <div class="fl-mf-hint">来源域名过滤（一行一个）</div>
          <textarea data-fl-mf="hosts" placeholder="例如：example.com"></textarea>
          <div class="fl-mf-hint">图片黑名单或关键词（一行一个）</div>
          <textarea data-fl-mf="terms"></textarea>
          <div class="fl-mf-actions"><button type="button" data-fl-mf-action="block-current">拉黑当前大图</button><button type="button" data-fl-mf-action="apply">重新过滤</button><button type="button" data-fl-mf-action="clear-log">清空日志</button></div>
          <div class="fl-mf-hint" data-fl-mf-adapter></div>
          <div class="fl-mf-log" data-fl-mf-log></div>
        </div>
      </details>
    `;
    panel.appendChild(section);
    section.addEventListener("change", onUiChange);
    section.addEventListener("click", onUiClick);
    refreshUi();
  }

  function onUiChange(event) {
    const key = event.target?.dataset?.flMf;
    if (!key) return;
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    writeConfig({ [key]: value });
  }

  function onUiClick(event) {
    const action = event.target?.dataset?.flMfAction;
    if (!action) return;
    if (action === "apply") applyFilters();
    if (action === "clear-log") { logs.length = 0; refreshLog(); }
    if (action === "block-current") {
      const url = currentLightboxUrl();
      if (url) addTerm(url);
      applyFilters();
    }
  }

  function refreshUi() {
    const section = document.querySelector(".fl-mf-section");
    if (!section) return;
    const config = readConfig();
    section.querySelectorAll("[data-fl-mf]").forEach((node) => {
      const key = node.dataset.flMf;
      if (node.type === "checkbox") node.checked = !!config[key];
      else node.value = String(config[key] || "");
    });
    const label = section.querySelector("[data-fl-mf-adapter]");
    const text = `当前站点适配器：${currentAdapter()?.name || "通用"}`;
    if (label && label.textContent !== text) label.textContent = text;
    refreshLog();
  }

  function refreshLog() {
    const log = document.querySelector("[data-fl-mf-log]");
    if (!log) return;
    const text = logs.length ? logs.map((item) => `${item.time}｜${item.reason}｜${item.url}`).join("\n") : "暂无过滤记录";
    if (log.textContent !== text) log.textContent = text;
  }

  registerAdapter({
    id: "xchina-photo",
    name: "xchina 图库",
    match: (url) => /xchina\.co\/photo\/id-/i.test(url),
    reason(info, node, config) {
      if (!config.smart) return "";
      const text = [node?.textContent, node?.getAttribute?.("alt"), node?.getAttribute?.("title")].join(" ");
      if (/galgameclub|姬游社|PC\+安卓|APP下载|删除被禁止|收录绝版/i.test(text)) return "xchina 推广图";
      return "";
    }
  });

  window.__flowLensMediaFilter = { readConfig, writeConfig, reasonFor, addTerm, registerAdapter, applyFilters };
  installStyle();
  const observer = new MutationObserver((records) => { if (records.some(record => [...record.addedNodes].some(node => node.nodeType === 1 && (node.id === "xiv-root" || node.matches?.(".xiv-tile") || node.querySelector?.(".xiv-tile"))))) { ensureUi(); scheduleApply(); } });
  if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("click", (event) => {
    if (event.target?.closest?.(".fl-mf-section, .fl-mf-block")) scheduleApply(80);
  }, true);
  ensureUi();
  scheduleApply(300);
})();

// FlowLens module: src/patches/site-adapter-center.js
(() => {
  if (window.__flowLensSiteAdapterCenter) return;
  window.__flowLensSiteAdapterCenter = true;

  let timer = 0;

  function root() { return document.getElementById("xiv-root"); }
  function panel() { return root()?.querySelector(".xiv-panel[data-panel='settings']"); }
  function status() {
    try { return window.__flowLensControl?.getAdapterStatus?.() || null; } catch { return null; }
  }
  function escapeHtml(text) {
    return String(text ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function installStyle() {
    if (document.getElementById("fl-site-adapter-style")) return;
    const style = document.createElement("style");
    style.id = "fl-site-adapter-style";
    style.textContent = `
      #xiv-root .fl-site-adapter-section {
        margin-top: 12px !important;
        padding-top: 12px !important;
        border-top: 1px solid rgba(255,255,255,.14) !important;
      }
      #xiv-root[data-theme="light"] .fl-site-adapter-section {
        border-top-color: rgba(0,0,0,.1) !important;
      }
      #xiv-root .fl-site-adapter-section h4 {
        margin: 0 0 9px !important;
        font-size: 14px !important;
      }
      #xiv-root .fl-site-adapter-grid {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: 7px !important;
      }
      #xiv-root .fl-site-adapter-card {
        min-width: 0 !important;
        padding: 9px !important;
        border-radius: 10px !important;
        background: rgba(255,255,255,.08) !important;
      }
      #xiv-root[data-theme="light"] .fl-site-adapter-card {
        background: rgba(0,0,0,.045) !important;
      }
      #xiv-root .fl-site-adapter-card b,
      #xiv-root .fl-site-adapter-card span {
        display: block !important;
        min-width: 0 !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
      }
      #xiv-root .fl-site-adapter-card b {
        font-size: 11px !important;
        opacity: .62 !important;
        margin-bottom: 4px !important;
      }
      #xiv-root .fl-site-adapter-card span {
        font-size: 13px !important;
        font-weight: 850 !important;
      }
      #xiv-root .fl-site-adapter-tags {
        display: flex !important;
        flex-wrap: wrap !important;
        gap: 6px !important;
        margin: 8px 0 !important;
      }
      #xiv-root .fl-site-adapter-tags span {
        max-width: 100% !important;
        padding: 5px 8px !important;
        border-radius: 999px !important;
        background: rgba(79,140,255,.18) !important;
        color: inherit !important;
        font-size: 12px !important;
        font-weight: 850 !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
      }
      @media (max-width: 560px) {
        #xiv-root .fl-site-adapter-grid { grid-template-columns: 1fr !important; }
      }
    `;
    document.documentElement.appendChild(style);
  }

  function render() {
    const target = panel();
    if (!target) return;
    installStyle();
    let section = target.querySelector(".fl-site-adapter-section");
    if (!section) {
      section = document.createElement("section");
      section.className = "fl-site-adapter-section";
      target.appendChild(section);
    }
    const data = status();
    if (!data) {
      const html = "<h4>站点适配中心</h4><small>等待 FlowLens 初始化。</small>";
      if (section.__flowLensHtml !== html) { section.__flowLensHtml = html; section.innerHTML = html; }
      return;
    }
    const media = data.media || {};
    const pages = data.pages || {};
    const queue = data.queue || {};
    const html = `
      <h4>站点适配中心</h4>
      <div class="fl-site-adapter-tags">${(data.adapters || []).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
      <div class="fl-site-adapter-grid">
        <div class="fl-site-adapter-card"><b>当前站点</b><span title="${escapeHtml(data.url)}">${escapeHtml(data.site)}</span></div>
        <div class="fl-site-adapter-card"><b>采集策略</b><span>${escapeHtml(data.strategy)}</span></div>
        <div class="fl-site-adapter-card"><b>媒体</b><span>${media.visible ?? 0}/${media.total ?? 0}${media.expected ? ` / 预估 ${media.expected}` : ""}</span></div>
        <div class="fl-site-adapter-card"><b>分页</b><span>${pages.fetched ?? 0}/${pages.known ?? 0}${pages.fetching ? " 采集中" : ""}${pages.failures ? `，失败 ${pages.failures}` : ""}</span></div>
        <div class="fl-site-adapter-card"><b>渲染</b><span>${media.rendered ?? 0}${media.queuedRender ? `，待渲染 ${media.queuedRender}` : ""}</span></div>
        <div class="fl-site-adapter-card"><b>组图队列</b><span>${queue.total ? `${Math.max(0, queue.index + 1)}/${queue.total}` : "未识别"}</span></div>
      </div>
      <button type="button" data-fl-retry-pages ${!pages.failures || pages.fetching ? "disabled" : ""}>重试失败分页</button>
    `;
    if (section.__flowLensHtml !== html) { section.__flowLensHtml = html; section.innerHTML = html; }
  }

  function scheduleRender() {
    clearTimeout(timer);
    timer = window.setTimeout(render, 120);
  }

  const observer = new MutationObserver(scheduleRender);
  if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-active", "data-open"] });
  window.addEventListener("flowlens:gallery-items-rendered", scheduleRender);
  window.addEventListener("flowlens:media-filter-applied", scheduleRender);
  document.addEventListener("click", (event) => {
    if (event.target?.closest?.("[data-fl-retry-pages]")) void window.__flowLensControl?.retryFailedPages?.();
    scheduleRender();
  }, true);
  scheduleRender();
})();

// FlowLens module: src/patches/pornpics-queue-hotfix.js
(() => {
  if (window.__flowLensPornpicsQueueHotfix) return;
  window.__flowLensPornpicsQueueHotfix = true;

  const ACTIVE_LIST_KEY = "flowlens-pornpics-active-list-v2";
  const CURRENT_GALLERY_KEY = "flowlens-pornpics-current-gallery-v2";
  const GLOBAL_QUEUE_KEY = "flowlens-pornpics-last-queue-v2";
  const AUTO_OPEN_KEY = "flowlens-gallery-queue-auto-open";
  const QUEUE_PREFIX = "flowlens-pornpics-list-queue-v2:";
  const GALLERY_PATH_RE = /^\/(?:[a-z]{2}\/)?galleries\/[^/?#]+-\d+\/?$/i;
  const PUBLIC_LIST_RE = /^\/(?:[a-z]{2}\/)?public\/?$/i;
  let syncTimer = 0;
  let referrerSeeded = false;

  function root() { return document.getElementById("xiv-root"); }
  function lightbox() { return document.getElementById("xiv-lightbox"); }
  function coreApi() { return window.__flowLensControl || null; }
  function viewerOpen() { return root()?.dataset.active === "true"; }

  function isHost(url = location.href) {
    try { return /(^|\.)pornpics\.com$/i.test(new URL(url, location.href).hostname); } catch { return false; }
  }

  function isGalleryUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      return isHost(parsed.href) && GALLERY_PATH_RE.test(parsed.pathname);
    } catch {
      return false;
    }
  }

  function normalizeUrl(raw, base = location.href) {
    try {
      const parsed = new URL(raw, base);
      parsed.hash = "";
      if (isGalleryUrl(parsed.href) && !parsed.pathname.endsWith("/")) parsed.pathname += "/";
      return parsed.href;
    } catch {
      return "";
    }
  }

  function listKey(url = location.href) {
    try {
      const parsed = new URL(url, location.href);
      parsed.hash = "";
      parsed.search = "";
      return `${QUEUE_PREFIX}${parsed.origin}${parsed.pathname}`;
    } catch {
      return "";
    }
  }

  function galleryInfo(url) {
    try {
      const parsed = new URL(url, location.href);
      const match = parsed.pathname.match(/^\/(?:([a-z]{2})\/)?galleries\/[^/?#]+-(\d+)\/?$/i);
      if (!isHost(parsed.href) || !match) return null;
      return { locale: (match[1] || "en").toLowerCase(), id: match[2] };
    } catch {
      return null;
    }
  }

  function isPublicListUrl(url = location.href) {
    try {
      const parsed = new URL(url, location.href);
      return isHost(parsed.href) && PUBLIC_LIST_RE.test(parsed.pathname);
    } catch {
      return false;
    }
  }

  function currentGalleryUrl() {
    const stored = normalizeUrl(sessionStorage.getItem(CURRENT_GALLERY_KEY) || "");
    if (isGalleryUrl(stored)) return stored;
    const current = normalizeUrl(location.href);
    return isGalleryUrl(current) ? current : "";
  }

  function unique(urls) {
    const seen = new Set();
    const clean = [];
    const current = galleryInfo(currentGalleryUrl() || location.href);
    urls.forEach((url) => {
      const normalized = normalizeUrl(url);
      if (!normalized || !isGalleryUrl(normalized)) return;
      const info = galleryInfo(normalized);
      if (current && info && current.locale !== info.locale) return;
      const key = info ? `pornpics:${info.id}` : normalized.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      clean.push(normalized);
    });
    return clean;
  }

  function collectQueueFromDocument(doc = document, base = location.href) {
    const found = [];
    const roots = doc.querySelectorAll?.("#tiles, main, #main, .main, .content, .container, body") || [];
    const scanRoots = roots.length ? Array.from(roots) : [doc.body || doc.documentElement];
    scanRoots.forEach((scanRoot) => {
      const links = isPublicListUrl(base)
        ? scanRoot?.querySelectorAll?.("a[href*='/galleries/']")
        : scanRoot?.querySelectorAll?.("a[href]");
      links?.forEach((link) => {
        const url = normalizeUrl(link.getAttribute("href") || "", base);
        if (isGalleryUrl(url)) found.push(url);
      });
    });
    return unique(found);
  }

  function storeQueueForList(listUrl, queue) {
    const clean = unique(queue);
    if (clean.length < 2) return clean;
    const key = listKey(listUrl);
    if (!key) return clean;
    try {
      sessionStorage.setItem(key, JSON.stringify(clean.slice(0, 500)));
      sessionStorage.setItem(ACTIVE_LIST_KEY, key);
      sessionStorage.setItem(GLOBAL_QUEUE_KEY, JSON.stringify(clean.slice(0, 500)));
    } catch {}
    return clean;
  }

  function rememberVisibleList() {
    if (!isHost() || isGalleryUrl(location.href)) return [];
    const queue = collectQueueFromDocument(document, location.href);
    if (isPublicListUrl(location.href)) {
      try { sessionStorage.setItem("flowlens-pornpics-public-list-url-v2", normalizeUrl(location.href)); } catch {}
    }
    return storeQueueForList(location.href, queue);
  }

  function readQueueByKey(key) {
    if (!key) return [];
    try {
      const data = JSON.parse(sessionStorage.getItem(key) || "[]");
      return Array.isArray(data) ? unique(data) : [];
    } catch {
      return [];
    }
  }

  function activeQueue() {
    const current = currentGalleryUrl();
    const activeKey = sessionStorage.getItem(ACTIVE_LIST_KEY) || "";
    const active = readQueueByKey(activeKey);
    if (active.length > 1 && (!current || active.some((url) => url.toLowerCase() === current.toLowerCase()))) return active;
    const global = readQueueByKey(GLOBAL_QUEUE_KEY);
    if (global.length > 1 && (!current || global.some((url) => url.toLowerCase() === current.toLowerCase()))) return global;
    const visible = rememberVisibleList();
    return visible.length > 1 ? visible : active.length > 1 ? active : global;
  }

  function queueTarget(delta) {
    const queue = activeQueue();
    if (queue.length < 2) return "";
    const current = currentGalleryUrl();
    let index = queue.findIndex((url) => url.toLowerCase() === current.toLowerCase());
    if (index < 0) index = 0;
    return queue[(index + delta + queue.length) % queue.length] || "";
  }

  function syncButtons() {
    if (!isHost()) return;
    const queue = activeQueue();
    if (queue.length < 2) return;
    const current = currentGalleryUrl();
    const index = Math.max(0, queue.findIndex((url) => url.toLowerCase() === current.toLowerCase()));
    document.querySelectorAll('#xiv-root [data-xiv="prev-set"], #xiv-root [data-xiv="next-set"]').forEach((button) => {
      const label = button.dataset.xiv === "prev-set" ? "上一组" : "下一组";
      button.disabled = false;
      button.dataset.enabled = "true";
      button.title = `${label}（${index + 1}/${queue.length}，←/→）`;
    });
  }

  function scheduleSync(delay = 120) {
    clearTimeout(syncTimer);
    syncTimer = window.setTimeout(syncButtons, delay);
  }

  async function openGallery(target) {
    if (!target || !isGalleryUrl(target)) return false;
    try {
      sessionStorage.setItem(CURRENT_GALLERY_KEY, target);
      sessionStorage.setItem(AUTO_OPEN_KEY, target);
    } catch {}

    if (viewerOpen() && typeof coreApi()?.loadSavedPage === "function") {
      const wasLightboxOpen = lightbox()?.dataset.active === "true";
      if (wasLightboxOpen) return false;
      const ok = await coreApi().loadSavedPage(target);
      if (ok) {
        try { history.replaceState({ flowlensPornpicsInPlace: true }, "", target); } catch {}
        window.dispatchEvent(new CustomEvent("flowlens:page-url-changed", { detail: { url: target } }));
        window.setTimeout(syncButtons, 120);
        return true;
      }
      return false;
    }

    location.href = target;
    return true;
  }

  function onListClick(event) {
    if (!isHost()) return;
    const link = event.target?.closest?.("a[href]");
    if (!link) return;
    const target = normalizeUrl(link.getAttribute("href") || "", location.href);
    if (!isGalleryUrl(target)) return;
    rememberVisibleList();
    try { sessionStorage.setItem(CURRENT_GALLERY_KEY, target); } catch {}
  }

  function onQueueButton(event) {
    if (!isHost()) return;
    const button = event.target?.closest?.('#xiv-root [data-xiv="prev-set"], #xiv-root [data-xiv="next-set"]');
    if (!button) return;
    const target = queueTarget(button.dataset.xiv === "next-set" ? 1 : -1);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    void openGallery(target);
  }

  function isTypingTarget(target) {
    return !!target?.matches?.("input, textarea, select, [contenteditable='true'], [contenteditable='']");
  }

  function onKeydown(event) {
    if (!isHost()) return;
    if (isTypingTarget(event.target) || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
    if (!viewerOpen() || lightbox()?.dataset.active === "true") return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const target = queueTarget(event.key === "ArrowRight" ? 1 : -1);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    void openGallery(target);
  }

  async function seedFromReferrer() {
    if (referrerSeeded || !isHost() || !isGalleryUrl(location.href)) return;
    referrerSeeded = true;
    let referrer = "";
    try { referrer = document.referrer || ""; } catch {}
    if (!referrer || !isHost(referrer) || isGalleryUrl(referrer)) return;
    try {
      const response = await fetch(referrer, { credentials: "include", cache: "force-cache" });
      if (!response.ok) return;
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const queue = collectQueueFromDocument(doc, referrer);
      storeQueueForList(referrer, queue);
      scheduleSync(30);
    } catch {}
  }

  document.addEventListener("click", onListClick, true);
  document.addEventListener("click", onQueueButton, true);
  window.addEventListener("keydown", onKeydown, true);
  const observer = new MutationObserver(() => {
    if (!isHost()) return;
    if (!isGalleryUrl(location.href)) rememberVisibleList();
    scheduleSync(120);
  });
  if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["href", "disabled", "data-enabled"] });
  [0, 300, 900, 1800, 3200].forEach((delay) => window.setTimeout(() => {
    if (!isGalleryUrl(location.href)) rememberVisibleList();
    scheduleSync(30);
  }, delay));
  void seedFromReferrer();
})();

// FlowLens module: src/patches/visible-sequence-safe.js
(() => {
  if (window.__flowLensVisibleSequenceSafe) return;
  window.__flowLensVisibleSequenceSafe = true;

  function box() {
    const node = document.getElementById("xiv-lightbox");
    return node?.dataset.active === "true" ? node : null;
  }

  function filter() {
    return window.__flowLensMediaFilter || null;
  }

  function reason(url, node = null) {
    try { return filter()?.reasonFor?.(url, node) || ""; } catch { return ""; }
  }

  function tiles() {
    return [...document.querySelectorAll("#xiv-grid .xiv-tile")]
      .filter((tile) => tile.isConnected)
      .sort((a, b) => Number(a.dataset.index || 0) - Number(b.dataset.index || 0));
  }

  function isVisibleTile(tile) {
    if (!tile || tile.hidden || tile.style.display === "none") return false;
    return !reason(tile.dataset.url || "", tile);
  }

  function visibleTiles() {
    return tiles().filter(isVisibleTile);
  }

  function currentIndex() {
    return Number(window.__flowLensControl?.getLightboxIndex?.());
  }

  function relTile(delta) {
    const list = visibleTiles();
    if (!list.length) return null;
    const current = currentIndex();
    let pos = list.findIndex((tile) => Number(tile.dataset.index || -1) === current);
    if (pos < 0) pos = delta >= 0 ? 0 : list.length - 1;
    return list[(pos + (delta >= 0 ? 1 : -1) + list.length) % list.length] || null;
  }

  function openTile(tile) {
    if (!tile) return false;
    return window.__flowLensControl?.openLightboxIndex?.(Number(tile.dataset.index)) === true;
  }

  function jump(delta) {
    return openTile(relTile(delta));
  }

  window.__flowLensVisibleSequenceJump = jump;

  function currentUrl() {
    const lb = box();
    if (!lb) return "";
    const media = lb.querySelector(":scope > img, :scope > video, :scope > iframe, :scope > .xiv-video-frame");
    return media?.currentSrc || media?.src || media?.dataset?.mediaUrl || media?.dataset?.sourceUrl || "";
  }

  function compactLabels() {
    const list = visibleTiles();
    list.forEach((tile, i) => {
      const nextIndex = String(i);
      if (tile.dataset.flVisibleIndex !== nextIndex) tile.dataset.flVisibleIndex = nextIndex;
      const label = [...tile.children].find((node) => node.tagName === "SPAN") || tile.querySelector("span");
      const nextText = String(i + 1).padStart(2, "0");
      if (label && label.textContent !== nextText) label.textContent = nextText;
    });
  }

  function patchControl() {
    const control = window.__flowLensControl;
    if (!control || control.__flVisibleSequenceSafe) return;
    control.compactVisibleLabels = compactLabels;
    control.__flVisibleSequenceSafe = true;
  }

  window.addEventListener("flowlens:media-filter-applied", compactLabels);
  window.addEventListener("flowlens:gallery-items-rendered", compactLabels);
  document.addEventListener("click", (event) => {
    if (event.target?.closest?.("#xiv-root [data-xiv='filter'], #xiv-root .fl-mf-section")) setTimeout(compactLabels, 80);
  }, true);
  const boot = new MutationObserver(() => patchControl());
  if (document.documentElement) boot.observe(document.documentElement, { childList: true, subtree: true });
  patchControl();
})();

// FlowLens module: src/patches/lightbox-event-guard.js
(() => {
  // Core handles its own controls without patching native event registration.
  window.__flowLensLightboxEventGuard = true;
})();

// FlowLens module: src/core/flowlens-core.js
(() => {
  if (window.__flowLensViewer) return;
  window.__flowLensViewer = true;

  const xivUserscriptMode = typeof GM_xmlhttpRequest === "function" || typeof GM_download === "function";

  function userscriptRequest(url, options = {}) {
    return new Promise((resolve) => {
      if (typeof GM_xmlhttpRequest !== "function") {
        resolve({ ok: false, error: "GM_xmlhttpRequest unavailable" });
        return;
      }

      GM_xmlhttpRequest({
        method: options.method || "GET",
        url,
        responseType: options.responseType || "text",
        headers: options.headers || {},
        timeout: options.timeout || 45000,
        anonymous: false,
        onload: (response) => {
          const status = Number(response.status || 0);
          if (status >= 200 && status < 300) {
            resolve({
              ok: true,
              status,
              contentType: response.responseHeaders?.match(/^content-type:\s*([^\r\n]+)/im)?.[1] || "",
              response: response.response,
              text: response.responseText || ""
            });
            return;
          }
          resolve({ ok: false, error: `HTTP ${status || "unknown"}` });
        },
        onerror: (error) => resolve({ ok: false, error: String(error?.error || error?.message || "request failed") }),
        onabort: () => resolve({ ok: false, error: "request aborted" }),
        ontimeout: () => resolve({ ok: false, error: "request timeout" })
      });
    });
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  const IMAGE_EXT = /(?:\.(avif|gif|jpe?g|png|webp)(?:\?|#|$)|[?&]format=(?:avif|gif|jpe?g|png|webp)\b)/i;
  const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(?:\?|#|$)/i;
  const MEDIA_EXT = /(?:\.(avif|gif|jpe?g|png|webp|mp4|webm|mov|m4v)(?:\?|#|$)|[?&]format=(?:avif|gif|jpe?g|png|webp)\b)/i;
  const PAGE_RE = /\/photo\/id-[^/]+\/(\d+)\.html(?:[?#].*)?$/i;
  const GALLERY_ROOT_RE = /\/photo\/id-[^/]+\.html(?:[?#].*)?$/i;
  const SELFIE_GALLERY_PATH_RE = /\/(?:top_\d+_)?content_\d+\.html$/i;
  const ZTTAOTU_PAGE_RE = /^\/zhuanti\/taotu\/\d+\/(\d+)(?:_(\d+))?\.html$/i;
  const GENERIC_X810114_RE = /^https?:\/\/x\.810114\.xyz(?:\/(?!photo(?:\/|$)).*)?$/i;
  const HTTP_PAGE_RE = /^https?:\/\//i;
  const BAD_IMAGE_RE = /(\/profile_images\/|avatar|favicon|icon|ico|logo|sprite|blank|loading|placeholder|banner|ads?|advert|button|btn|nav|menu|play|camera|heart|badge|brand|qrcode)[^/]*\.(gif|jpe?g|png|webp|avif)/i;
  const AVATAR_URL_RE = /\/profile_images\/|(?:^|[_-])normal\.(?:jpe?g|png|webp|gif)(?:[?#]|$)/i;
  const STATIC_ASSET_RE = /\/(static|assets?|scripts?|styles?|css|js|fonts?|plugins?|themes?|template|common|public|images?\/(?:logo|icon|ico|btn|button|banner|ads?))\//i;
  const AD_HOST_RE = /(^|\.)((jads|juicyads|exoclick|trafficjunky|adnium|popads|popcash|adskeeper|mgid|doubleclick|googlesyndication|adservice|adnxs|taboola|outbrain)\.|.*(adserver|adservice|adsystem|adnetwork|ad-delivery|adsterra|popunder).*)/i;
  const AD_PATH_RE = /(?:^|[/?#&_.-])(ad|ads|adv|advert|advertise|advertisement|banner|bnr|sponsor|sponsored|promo|promotion|campaign|popunder|tracking|affiliate|click)(?:[/?#&_.=-]|$)/i;
  const JAVBUS_AD_TEXT_RE = /(廣告|广告|adblock|block ads|ad[s]?|banner|sponsor|jads|poweredby|投放)/i;
  const BLOCKED_PROMO_TEXT_RE = /(仅供访问推特被屏蔽图片|不推荐其他一切用法|不要相信账号内容中的一切广告|推广|广告|直播间|播放视频|扫码|二维码|下载官方套图app|模糊处理|仅限手机|VLM翻译插件|AI帮忙看色图|eh镜像|ex\.810114|x\.810114\.xyz\[推图\]|7she\.tv|7she|妻社|换妻|绿帽献妻|出租妻子|出租妻|专注换妻|真实换妻平台|立即访问|AI脱衣|黑迹)/i;
  const PROMO_LINK_RE = /(?:7she\.tv|7shemale|妻社|换妻|出租妻|casino|bet|promo|ads?|advert|download.*app|appdownload|live|cam|chat|ai.*undress|tuiguang|推广|广告|播放视频|直播间|立即访问|真实换妻平台)/i;
  const GALLERY_TEXT_RE = /\bNo\.\s*\d+\b/i;
  const GALLERY_PAGE_WINDOW = 16;
  const GALLERY_FETCH_BATCH = 3;
  const SITE_ALBUM_FETCH_BATCH = 6;
  const VIDEO_PREVIEW_CONCURRENCY = 1;

  const state = {
    root: null,
    stage: null,
    grid: null,
    masonryColumns: [],
    masonryColumnHeights: [],
    lightbox: null,
    counter: null,
    status: null,
    launch: null,
    settingsPanel: null,
    diagnosticsPanel: null,
    images: [],
    detailByImage: new Map(),
    photoShowByImage: new Map(),
    highResByImage: new Map(),
    posterByImage: new Map(),
    mediaRatioByImage: new Map(),
    videoTimeByImage: new Map(),
    favoriteKeys: new Set(),
    savingFavorite: false,
    imageKeys: new Set(),
    renderedKeys: new Set(),
    pageUrls: new Set(),
    fetchedPages: new Set(),
    expectedImages: 0,
    fetching: false,
    collectionGeneration: 0,
    navigationGeneration: 0,
    collectionController: new AbortController(),
    pendingPages: new Set(),
    failedPages: new Map(),
    pageLock: null,
    downloading: false,
    autoScroll: false,
    autoScrollSpeed: 3,
    autoScrollFrame: 0,
    autoScrollLastTime: 0,
    autoScrollRemainder: 0,
    autoScrollPausedForLightbox: false,
    active: false,
    index: 0,
    columns: 3,
    mediaFilter: "all",
    theme: systemTheme(),
    themeManual: false,
    settings: null,
    launchDrag: null,
    observer: null,
    galleryQueueObserver: null,
    galleryQueueRefreshTimer: 0,
    videoPreviewObserver: null,
    imageLoadObserver: null,
    videoPreviewQueue: [],
    videoPreviewLoading: 0,
    hostOverlayObserver: null,
    hostOverlayTimer: 0,
    genericCollectTimer: 0,
    originalScrollTimer: 0,
    originalScrollY: 0,
    lastGalleryFetchAt: 0,
    suppressLightboxUntil: 0,
    lightboxGestureToken: 0,
    lightboxSwipe: null,
    viewerSwipe: null,
    lastLightboxWheelAt: 0,
    mediaPreloadTimer: 0,
    highResResolveTimer: 0,
    mediaPreloadCache: new Map(),
    lightboxDrag: null,
    lightboxSuppressClickUntil: 0,
    lastStageScrollAt: 0,
    masonryLayoutTimer: 0,
    restorePosition: null,
    restoreStartedAt: 0,
    restoreTimer: 0,
    restoringPosition: false,
    positionSaveTimer: 0,
    renderQueue: [],
    renderFrame: 0,
    renderBatchSize: 14,
    renderStartedAt: 0,
    galleryFailureCount: 0,
    rejectedCount: 0,
    collectedCount: 0,
    lastDownloadScope: "all",
    collectionBase: "",
    x810114ApiMode: false,
    galleryQueue: [],
    galleryQueueIndex: -1,
    galleryQueueCurrentUrl: "",
    galleryQueueCurrentTitle: "",
    galleryQueueTitles: new Map(),
    galleryQueueCovers: new Map(),
    galleryQueuePanel: null,
    linkGrabberPanel: null,
    grabbedDownloadLinks: [],
    x810114RecentQueue: [],
    x810114ActiveSidebarQueue: []
  };

  function systemTheme() {
    try {
      return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
    } catch {
      return "light";
    }
  }

  const DEFAULT_SETTINGS = {
    launchCompact: false,
    launchX: 0,
    launchY: 0,
    columns: 3,
    theme: "system",
    autoScrollSpeed: 3,
    autoFullscreen: true,
    videoPreview: true
  };

  function settingsStorageKey() {
    return "flowlens-settings-v2";
  }

  function chromeSettingsStorage() {
    try {
      return typeof chrome !== "undefined" ? chrome.storage?.sync || chrome.storage?.local || null : null;
    } catch {
      return null;
    }
  }

  function loadSettings() {
    const extensionSettings = window.__flowLensSettingsStore?.read?.();
    if (extensionSettings && typeof extensionSettings === "object") {
      state.settings = { ...DEFAULT_SETTINGS, ...extensionSettings };
    } else {
    try {
      const raw = localStorage.getItem(settingsStorageKey());
      const parsed = raw ? JSON.parse(raw) : {};
      state.settings = { ...DEFAULT_SETTINGS, ...parsed };
    } catch {
      state.settings = { ...DEFAULT_SETTINGS };
    }
    }
    state.columns = Math.max(2, Math.min(8, Number(state.settings.columns || DEFAULT_SETTINGS.columns)));
    state.autoScrollSpeed = Math.max(1, Math.min(10, Number(state.settings.autoScrollSpeed || DEFAULT_SETTINGS.autoScrollSpeed)));
    state.themeManual = state.settings.theme !== "system";
    state.theme = state.themeManual ? state.settings.theme : systemTheme();
  }

  function loadExtensionSettings() {
    const settingsStore = window.__flowLensSettingsStore;
    if (settingsStore?.read) {
      state.settings = { ...DEFAULT_SETTINGS, ...state.settings, ...settingsStore.read() };
      applySettings();
      settingsStore.load?.();
      return;
    }
    const storage = chromeSettingsStorage();
    if (!storage?.get) return;
    try {
      storage.get(settingsStorageKey(), (result) => {
        if (chrome.runtime?.lastError) return;
        const stored = result?.[settingsStorageKey()];
        if (!stored || typeof stored !== "object") return;
        state.settings = { ...DEFAULT_SETTINGS, ...state.settings, ...stored };
        applySettings();
      });
    } catch {
      // Keep the local fallback when extension storage is unavailable.
    }
  }

  function saveSettings(patch = {}) {
    state.settings = { ...(state.settings || DEFAULT_SETTINGS), ...patch };
    if (window.__flowLensSettingsStore?.write) {
      state.settings = { ...state.settings, ...window.__flowLensSettingsStore.write(patch) };
      return;
    }
    try {
      localStorage.setItem(settingsStorageKey(), JSON.stringify(state.settings));
      window.__flowLensSyncGlobalSettings?.(patch);
    } catch {
      // Storage can be blocked on restricted pages; settings remain active for this session.
    }
    const storage = chromeSettingsStorage();
    if (storage?.set) {
      try {
        storage.set({ [settingsStorageKey()]: state.settings });
      } catch {
        // Extension storage is best-effort in userscript or restricted contexts.
      }
    }
  }

  function setSetting(key, value) {
    saveSettings({ [key]: value });
    applySettings();
  }

  function applySettings() {
    if (!state.settings) loadSettings();
    state.columns = Math.max(2, Math.min(8, Number(state.settings.columns || DEFAULT_SETTINGS.columns)));
    state.autoScrollSpeed = Math.max(1, Math.min(10, Number(state.settings.autoScrollSpeed || DEFAULT_SETTINGS.autoScrollSpeed)));
    state.themeManual = state.settings.theme !== "system";
    state.theme = state.themeManual ? state.settings.theme : systemTheme();
    if (state.root) state.root.dataset.theme = state.theme;
    if (state.grid) {
      state.grid.style.setProperty("--xiv-columns", state.columns);
      rebuildMasonry();
    }
    applyLaunchSettings();
    syncSettingsPanel();
  }

  function applySyncedSettings(event) {
    const settings = event?.detail?.settings;
    if (!settings || typeof settings !== "object") return;
    state.settings = { ...(state.settings || DEFAULT_SETTINGS), ...settings };
    applySettings();
  }

  const css = `
    #xiv-launch {
      position: fixed; right: 18px; bottom: 92px; z-index: 2147483646;
      min-width: 102px; height: 42px; border: 1px solid rgba(255,255,255,.22); border-radius: 999px;
      background: linear-gradient(135deg, rgba(24,24,27,.9), rgba(48,48,54,.86));
      color: white; cursor: pointer;
      box-shadow: 0 14px 34px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.18);
      font: 850 14px/1 system-ui, sans-serif;
      backdrop-filter: blur(14px); display: inline-flex; align-items: center; justify-content: center;
      gap: 8px; padding: 0 14px 0 12px; letter-spacing: .2px;
      transition: transform .16s ease, box-shadow .16s ease, background .16s ease;
      touch-action: none; user-select: none;
    }
    #xiv-launch:hover {
      transform: translateY(-2px);
      background: linear-gradient(135deg, rgba(36,36,40,.96), rgba(66,66,72,.92));
      box-shadow: 0 18px 42px rgba(0,0,0,.34), inset 0 1px 0 rgba(255,255,255,.2);
    }
    #xiv-launch:active { transform: translateY(0) scale(.98); }
    #xiv-launch[data-dragging="true"] {
      cursor: grabbing; transition: none; transform: scale(.98);
    }
    #xiv-launch[data-pinned="true"] {
      right: auto; bottom: auto;
    }
    #xiv-launch[data-compact="true"] {
      min-width: 0; width: 48px; height: 48px; padding: 0; gap: 0;
      border-radius: 999px;
    }
    #xiv-launch[data-compact="true"] span { display: none; }
    #xiv-launch svg {
      width: 19px; height: 19px; padding: 5px; border-radius: 10px;
      background: rgba(255,255,255,.12);
    }
    #xiv-launch[data-compact="true"] svg {
      width: 21px; height: 21px; padding: 0; background: transparent;
    }
    #xiv-launch[data-site="x810114"] {
      right: 92px; bottom: 92px;
    }
    #xiv-root {
      position: fixed; inset: 0; z-index: 2147483647; display: none;
      background: #050505; color: #fff; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    #xiv-root[data-theme="light"] { background: #f4f4f1; color: #141414; }
    #xiv-root[data-active="true"] { display: block; }
    #xiv-root[data-active="true"]:not([data-theme="light"])::before {
      content: ""; position: fixed; left: 0; right: 0;
      top: calc(-1 * env(safe-area-inset-top, 0px));
      height: calc(env(safe-area-inset-top, 0px) + 2px);
      background: #050505; z-index: 2; pointer-events: none;
    }
    #xiv-stage {
      position: absolute; inset: 0; overflow-y: auto; overscroll-behavior: contain;
      overflow-anchor: none;
      scroll-behavior: auto; -webkit-overflow-scrolling: touch;
      scrollbar-width: thin; scrollbar-color: #777 #111; padding: 54px 12px 18px;
      box-sizing: border-box;
    }
    #xiv-grid {
      display: grid; grid-template-columns: repeat(var(--xiv-columns, 5), minmax(0, 1fr));
      gap: 10px; align-items: start;
    }
    .xiv-masonry-column {
      min-width: 0; display: flex; flex-direction: column; gap: 10px; overflow-anchor: none;
    }
    .xiv-tile {
      position: relative; display: block; width: 100%; margin: 0;
      border: 0; border-radius: 7px; overflow: hidden;
      background: #171717; padding: 0; cursor: zoom-in; box-shadow: 0 1px 0 rgba(255,255,255,.08);
      min-height: 96px; contain: layout paint style; content-visibility: auto; contain-intrinsic-size: 260px 360px;
    }
    #xiv-root[data-theme="light"] .xiv-tile {
      background: #fff; box-shadow: 0 1px 14px rgba(0,0,0,.13);
    }
    .xiv-tile img, .xiv-tile video {
      display: block !important; width: 100%; height: auto; min-height: 96px; max-height: 82vh; object-fit: contain; background: #111; pointer-events: none;
      overflow-anchor: none; transform: translateZ(0); backface-visibility: hidden;
    }
    .xiv-video-placeholder {
      display: grid; place-items: center; width: 100%; min-height: 132px;
      aspect-ratio: var(--xiv-video-ratio, 16 / 9); background: linear-gradient(145deg, #18181b, #0b0b0d);
      color: rgba(255,255,255,.72); pointer-events: none;
    }
    .xiv-video-placeholder::before {
      content: "视频"; padding: 6px 10px; border-radius: 999px; background: rgba(255,255,255,.1);
      font: 800 12px/1 system-ui, sans-serif; letter-spacing: 0;
    }
    .xiv-video-mark {
      position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
      width: 48px; height: 48px; border-radius: 999px; pointer-events: none;
      background: rgba(0,0,0,.42); border: 1px solid rgba(255,255,255,.3);
      display: grid; place-items: center; box-shadow: 0 8px 26px rgba(0,0,0,.35);
      backdrop-filter: blur(4px);
    }
    .xiv-video-mark::before {
      content: ""; display: block; margin-left: 4px;
      border-left: 15px solid rgba(255,255,255,.92);
      border-top: 10px solid transparent; border-bottom: 10px solid transparent;
    }
    .xiv-tile span {
      position: absolute; left: 0; right: 0; bottom: 0; box-sizing: border-box;
      padding: 18px 8px 7px; color: #fff; text-align: left; font: 600 11px/1.1 system-ui, sans-serif;
      background: linear-gradient(to top, rgba(0,0,0,.76), rgba(0,0,0,0)); opacity: .92;
    }
    #xiv-topbar {
      position: fixed; left: 0; right: 0; top: 0; z-index: 3;
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 9px 12px; box-sizing: border-box;
      background: linear-gradient(to bottom, rgba(0,0,0,.82), rgba(0,0,0,.22), rgba(0,0,0,0));
      pointer-events: none;
    }
    #xiv-root:not([data-theme="light"]) #xiv-topbar {
      background: linear-gradient(to bottom, #050505 0%, rgba(5,5,5,.96) 44px, rgba(5,5,5,.72) 68px, rgba(5,5,5,0) 100%);
      box-shadow: 0 -1px 0 #050505 inset;
    }
    .xiv-pill {
      pointer-events: auto; display: inline-flex; align-items: center; gap: 8px;
      min-height: 36px; border-radius: 0; padding: 0 4px;
      background: transparent; color: #fff; border: 0;
      backdrop-filter: none; font-size: 13px; white-space: nowrap;
      text-shadow: 0 1px 2px rgba(0,0,0,.72), 0 0 10px rgba(0,0,0,.46);
    }
    .xiv-actions {
      display: flex; gap: 8px; align-items: center; pointer-events: auto;
      max-width: calc(100vw - 132px); overflow-x: auto; scrollbar-width: none;
      padding-bottom: 2px;
    }
    .xiv-actions::-webkit-scrollbar { display: none; }
    .xiv-btn {
      min-width: 42px; width: 42px; height: 38px; border-radius: 999px; border: 1px solid rgba(255,255,255,.18);
      background: rgba(18,18,20,.76); color: #fff; cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      padding: 0; font: 800 13px/1 system-ui, sans-serif;
      backdrop-filter: blur(12px);
    }
    .xiv-btn svg, #xiv-launch svg { display: block; flex: 0 0 auto; }
    .xiv-btn svg { width: 18px; height: 18px; }
    .xiv-btn span { display: none; }
    .xiv-btn-icon { min-width: 38px; width: 38px; padding: 0; }
    #xiv-root[data-theme="light"] .xiv-pill {
      background: transparent; color: #fff; border-color: transparent;
    }
    #xiv-root[data-theme="light"] .xiv-btn {
      background: rgba(255,255,255,.78); color: #151515; border-color: rgba(0,0,0,.12);
    }
    .xiv-btn:hover, #xiv-launch:hover { background: rgba(42,42,46,.9); }
    .xiv-btn:disabled {
      opacity: .38; cursor: default; filter: grayscale(.35);
    }
    .xiv-btn:disabled:hover {
      background: rgba(18,18,20,.76);
    }
    #xiv-root[data-theme="light"] .xiv-btn:disabled:hover {
      background: rgba(255,255,255,.78);
    }
    .xiv-select {
      height: 38px; min-width: 84px; border-radius: 999px; border: 1px solid rgba(255,255,255,.18);
      background: rgba(18,18,20,.76); color: #fff; padding: 0 30px 0 12px;
      font: 800 13px/1 system-ui, sans-serif; backdrop-filter: blur(12px); cursor: pointer;
    }
    #xiv-root[data-lightbox-active="true"] #xiv-topbar {
      justify-content: flex-end; gap: 0; padding: 8px 10px;
      pointer-events: none;
    }
    #xiv-root[data-lightbox-active="true"] .xiv-pill {
      display: none !important;
    }
    #xiv-root[data-lightbox-active="true"] .xiv-actions {
      max-width: calc(100vw - 20px); gap: 7px; justify-content: flex-end;
      flex-wrap: nowrap; overflow: visible; padding-bottom: 0; pointer-events: auto;
    }
    #xiv-root[data-lightbox-active="true"] .xiv-btn {
      min-width: 38px; width: 38px; height: 38px; flex: 0 0 38px; padding: 0;
    }
    #xiv-root[data-lightbox-active="true"] .xiv-btn[data-xiv="prev-set"],
    #xiv-root[data-lightbox-active="true"] .xiv-btn[data-xiv="next-set"],
    #xiv-root[data-lightbox-active="true"] .xiv-btn[data-xiv="queue-list"],
    #xiv-root[data-lightbox-active="true"] .xiv-btn[data-xiv="top"] {
      display: none;
    }
    #xiv-page-bookmarks-controls {
      position: fixed; top: 66px; right: 14px; z-index: 2147483647;
      display: flex; flex-direction: column; gap: 8px; pointer-events: auto;
    }
    #xiv-page-bookmarks-controls button {
      height: 38px; padding: 0 14px; border: 0; border-radius: 999px;
      background: rgba(18,18,20,.9); color: #fff; box-shadow: 0 10px 28px rgba(0,0,0,.28);
      backdrop-filter: blur(14px); font: 900 13px/1 system-ui, sans-serif; cursor: pointer;
    }
    #xiv-root[data-theme="light"] #xiv-page-bookmarks-controls button { background: rgba(255,255,255,.92); color: #16181e; }
    #xiv-root[data-lightbox-active="true"] #xiv-page-bookmarks-controls { display: none !important; }
    #xiv-root[data-theme="light"] .xiv-select {
      background: rgba(255,255,255,.78); color: #151515; border-color: rgba(0,0,0,.12);
    }
    .xiv-panel {
      position: fixed; right: 12px; top: 58px; z-index: 6; width: min(360px, calc(100vw - 24px));
      display: none; border: 1px solid rgba(255,255,255,.16); border-radius: 12px;
      background: rgba(18,18,20,.9); color: #fff; box-shadow: 0 18px 54px rgba(0,0,0,.42);
      backdrop-filter: blur(18px); padding: 12px; box-sizing: border-box; pointer-events: auto;
    }
    #xiv-root[data-theme="light"] .xiv-panel {
      background: rgba(255,255,255,.94); color: #151515; border-color: rgba(0,0,0,.12);
      box-shadow: 0 18px 54px rgba(0,0,0,.18);
    }
    .xiv-panel[data-open="true"] { display: block; }
    .xiv-panel h3 {
      margin: 0 0 10px; font: 850 15px/1.2 system-ui, sans-serif;
    }
    .xiv-setting-row {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      min-height: 36px; padding: 7px 0; border-top: 1px solid rgba(255,255,255,.1);
      font: 650 13px/1.2 system-ui, sans-serif;
    }
    #xiv-root[data-theme="light"] .xiv-setting-row { border-top-color: rgba(0,0,0,.08); }
    .xiv-setting-row:first-of-type { border-top: 0; }
    .xiv-setting-row input[type="checkbox"] { width: 18px; height: 18px; accent-color: #fff; }
    #xiv-root[data-theme="light"] .xiv-setting-row input[type="checkbox"] { accent-color: #111; }
    .xiv-panel small {
      display: block; margin-top: 8px; color: rgba(255,255,255,.62); line-height: 1.45;
    }
    #xiv-root[data-theme="light"] .xiv-panel small { color: rgba(0,0,0,.58); }
    .xiv-queue-panel {
      width: min(390px, calc(100vw - 24px)); padding: 0; overflow: hidden;
      border-radius: 18px; background: rgba(16,17,20,.94); box-shadow: 0 24px 70px rgba(0,0,0,.46);
    }
    #xiv-root[data-theme="light"] .xiv-queue-panel { background: rgba(250,250,248,.96); }
    .xiv-queue-head {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 15px 16px 12px; border-bottom: 1px solid rgba(255,255,255,.1);
    }
    #xiv-root[data-theme="light"] .xiv-queue-head { border-bottom-color: rgba(0,0,0,.08); }
    .xiv-queue-head h3 { margin: 0; font-size: 16px; }
    .xiv-queue-count { color: rgba(255,255,255,.58); font: 750 12px/1 system-ui, sans-serif; }
    #xiv-root[data-theme="light"] .xiv-queue-count { color: rgba(0,0,0,.5); }
    .xiv-queue-list { max-height: min(62vh, 520px); overflow: auto; padding: 8px; overscroll-behavior: contain; }
    .xiv-queue-item {
      width: 100%; min-height: 66px; display: grid; grid-template-columns: 52px minmax(0,1fr) 18px;
      align-items: center; gap: 10px; padding: 8px 10px; border: 0; border-radius: 12px;
      background: transparent; color: inherit; text-align: left; cursor: pointer;
    }
    .xiv-queue-item:hover { background: rgba(255,255,255,.08); }
    #xiv-root[data-theme="light"] .xiv-queue-item:hover { background: rgba(0,0,0,.055); }
    .xiv-queue-item[data-current="true"] { background: rgba(89,126,255,.18); }
    #xiv-root[data-theme="light"] .xiv-queue-item[data-current="true"] { background: rgba(43,91,222,.1); }
    .xiv-queue-cover {
      position: relative; width: 52px; height: 52px; overflow: hidden; border-radius: 11px;
      background: linear-gradient(145deg, rgba(108,128,188,.28), rgba(255,255,255,.06));
    }
    #xiv-root[data-theme="light"] .xiv-queue-cover { background: linear-gradient(145deg, rgba(76,104,184,.14), rgba(0,0,0,.035)); }
    .xiv-queue-cover img { display: block; width: 100%; height: 100%; object-fit: cover; }
    .xiv-queue-number {
      position: absolute; left: 4px; bottom: 4px; min-width: 20px; height: 20px; display: grid; place-items: center;
      padding: 0 4px; border-radius: 7px; background: rgba(0,0,0,.66); color: #fff;
      box-shadow: 0 1px 4px rgba(0,0,0,.24); font: 850 10px/1 system-ui, sans-serif;
    }
    .xiv-queue-copy { min-width: 0; }
    .xiv-queue-title { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 800 13px/1.3 system-ui, sans-serif; }
    .xiv-queue-url { display: block; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: rgba(255,255,255,.5); font: 600 11px/1.2 system-ui, sans-serif; }
    #xiv-root[data-theme="light"] .xiv-queue-url { color: rgba(0,0,0,.46); }
    .xiv-queue-arrow { opacity: .5; font-size: 18px; }
    .xiv-queue-empty { padding: 28px 16px; color: rgba(255,255,255,.58); text-align: center; font: 700 13px/1.5 system-ui, sans-serif; }
    #xiv-root[data-theme="light"] .xiv-queue-empty { color: rgba(0,0,0,.5); }
    .xiv-link-panel { width: min(560px, calc(100vw - 24px)); padding: 0; overflow: hidden; border-radius: 18px; }
    .xiv-link-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 14px 15px 10px; border-bottom: 1px solid rgba(127,127,127,.18); }
    .xiv-link-head h3 { margin: 0; font-size: 16px; }
    .xiv-link-count { color: rgba(127,127,127,.76); font: 800 12px/1 system-ui, sans-serif; }
    .xiv-link-actions { display: flex; flex-wrap: wrap; gap: 7px; padding: 9px 10px; border-bottom: 1px solid rgba(127,127,127,.14); }
    .xiv-link-actions button, .xiv-link-row-actions button { border: 0; border-radius: 9px; background: rgba(127,127,127,.13); color: inherit; cursor: pointer; font: 800 11px/1 system-ui, sans-serif; }
    .xiv-link-actions button { min-height: 32px; padding: 0 11px; }
    .xiv-link-actions [data-link-action="save-all"] { background: #315bd8; color: #fff; }
    .xiv-link-bridge-status { padding: 0 12px 9px; border-bottom: 1px solid rgba(127,127,127,.14); color: rgba(127,127,127,.8); font: 700 11px/1.3 system-ui, sans-serif; }
    .xiv-link-bridge-status[data-ready="true"] { color: #2d9b67; }
    .xiv-link-bridge-status[data-error="true"] { color: #d45555; }
    .xiv-cd2-settings {
      margin-top: 12px; padding: 12px; border: 1px solid rgba(127,127,127,.2); border-radius: 14px;
      background: linear-gradient(145deg, rgba(49,91,216,.09), rgba(127,127,127,.04));
    }
    .xiv-cd2-settings-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
    .xiv-cd2-settings-head strong { font: 900 13px/1.2 system-ui, sans-serif; }
    .xiv-cd2-settings-head span { color: #6388ff; font: 850 10px/1 system-ui, sans-serif; letter-spacing: .04em; }
    #xiv-root[data-theme="light"] .xiv-cd2-settings-head span { color: #315bd8; }
    .xiv-cd2-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
    .xiv-cd2-field { display: grid; gap: 5px; min-width: 0; color: rgba(127,127,127,.92); font: 750 10px/1.2 system-ui, sans-serif; }
    .xiv-cd2-field[data-wide="true"] { grid-column: 1 / -1; }
    .xiv-cd2-field input {
      box-sizing: border-box; width: 100%; height: 36px; padding: 0 10px; border: 1px solid rgba(127,127,127,.24);
      border-radius: 9px; outline: none; background: rgba(15,16,19,.46); color: inherit; font: 700 11px/1 ui-monospace, Consolas, monospace;
    }
    #xiv-root[data-theme="light"] .xiv-cd2-field input { background: rgba(255,255,255,.82); }
    .xiv-cd2-field input:focus { border-color: #5275df; box-shadow: 0 0 0 3px rgba(49,91,216,.13); }
    .xiv-cd2-play-modes { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 2px 0 10px; }
    .xiv-cd2-play-mode { position: relative; min-width: 0; cursor: pointer; }
    .xiv-cd2-play-mode input { position: absolute; opacity: 0; pointer-events: none; }
    .xiv-cd2-play-mode-card { display: grid; grid-template-columns: 32px minmax(0,1fr); align-items: center; gap: 8px; min-height: 58px; padding: 8px 10px; border: 1px solid rgba(127,127,127,.22); border-radius: 11px; background: rgba(127,127,127,.06); }
    .xiv-cd2-play-mode input:checked + .xiv-cd2-play-mode-card { border-color: #315bd8; background: rgba(49,91,216,.1); box-shadow: inset 0 0 0 1px #315bd8; }
    .xiv-cd2-play-mode-icon { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 9px; background: rgba(49,91,216,.14); color: #6388ff; font-size: 14px; }
    .xiv-cd2-play-mode-copy strong, .xiv-cd2-play-mode-copy small { display: block; }
    .xiv-cd2-play-mode-copy strong { font: 850 11px/1.2 system-ui, sans-serif; }
    .xiv-cd2-play-mode-copy small { margin: 3px 0 0; color: rgba(127,127,127,.8); font: 650 9px/1.25 system-ui, sans-serif; }
    .xiv-cd2-field[data-cd2-local-row][hidden] { display: none !important; }
    .xiv-cd2-controls { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 10px; }
    .xiv-cd2-controls button { min-height: 32px; padding: 0 11px; border: 0; border-radius: 9px; background: rgba(127,127,127,.14); color: inherit; cursor: pointer; font: 850 11px/1 system-ui, sans-serif; }
    .xiv-cd2-controls [data-cd2-action="save"] { background: #315bd8; color: #fff; }
    .xiv-cd2-settings-status { min-height: 15px; margin-top: 8px; color: rgba(127,127,127,.78); font: 700 10px/1.45 system-ui, sans-serif; }
    .xiv-cd2-settings-status[data-state="ready"] { color: #2d9b67; }
    .xiv-cd2-settings-status[data-state="error"] { color: #d45555; }
    @media (max-width: 520px) { .xiv-cd2-grid { grid-template-columns: 1fr; } .xiv-cd2-field[data-wide="true"] { grid-column: auto; } .xiv-cd2-play-modes { grid-template-columns: 1fr; } }
    .xiv-link-list { max-height: min(58vh, 470px); overflow: auto; padding: 7px; overscroll-behavior: contain; }
    .xiv-link-row { display: grid; grid-template-columns: 48px minmax(0,1fr) auto; align-items: center; gap: 9px; min-height: 58px; padding: 7px 8px; border-radius: 11px; }
    .xiv-link-row:hover { background: rgba(127,127,127,.09); }
    .xiv-link-type { display: grid; place-items: center; min-height: 24px; border-radius: 7px; background: rgba(56,112,255,.14); color: #6388ff; font: 900 9px/1 system-ui, sans-serif; letter-spacing: .04em; }
    #xiv-root[data-theme="light"] .xiv-link-type { color: #315bd8; }
    .xiv-link-row-actions { display: flex; align-items: center; gap: 5px; }
    .xiv-link-row-actions button { min-width: 42px; height: 30px; padding: 0 8px; }
    .xiv-link-row-actions [data-link-row-action="play"] { background: rgba(49,91,216,.18); color: #6f91ff; }
    #xiv-root[data-theme="light"] .xiv-link-row-actions [data-link-row-action="play"] { color: #315bd8; }
    .xiv-link-row-actions button:hover, .xiv-link-actions button:hover { background: rgba(90,120,220,.2); }
    .xiv-link-copy-text { min-width: 0; }
    .xiv-link-name, .xiv-link-value { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .xiv-link-name { font: 800 12px/1.3 system-ui, sans-serif; }
    .xiv-link-value { margin-top: 4px; color: rgba(127,127,127,.76); font: 600 10px/1.2 ui-monospace, Consolas, monospace; }
    .xiv-diagnostics pre {
      max-height: 48vh; overflow: auto; margin: 8px 0 0; white-space: pre-wrap;
      font: 12px/1.45 ui-monospace, SFMono-Regular, Consolas, monospace;
    }
    #xiv-lightbox {
      position: fixed; inset: 0; z-index: 4; display: none; place-items: center;
      background: rgba(0,0,0,.94); cursor: zoom-out; overflow: auto;
      overscroll-behavior: contain;
    }
    #xiv-root[data-theme="light"] #xiv-lightbox { background: rgba(245,245,242,.96); }
    #xiv-lightbox[data-active="true"] { display: grid; }
    html.xiv-active body { pointer-events: none !important; }
    html.xiv-active #xiv-root,
    html.xiv-active #xiv-launch { pointer-events: auto !important; }
    html.xiv-active .PhotoView-Portal,
    html.xiv-active [class*="PhotoView" i],
    html.xiv-active [class*="photo-view" i],
    html.xiv-active [class*="ReactPhoto" i],
    html.xiv-active [class*="react-photo" i] {
      display: none !important; visibility: hidden !important; pointer-events: none !important;
    }
    #xiv-lightbox img, #xiv-lightbox video {
      display: block; width: auto; height: auto; max-width: 100vw; max-height: 100vh; object-fit: contain; cursor: default;
      user-select: none; -webkit-user-drag: none;
    }
    #xiv-lightbox img[data-xiv-can-zoom="true"],
    #xiv-lightbox video[data-xiv-can-zoom="true"] {
      cursor: zoom-in;
    }
    #xiv-lightbox img[data-xiv-can-zoom="false"],
    #xiv-lightbox video[data-xiv-can-zoom="false"] {
      cursor: default;
    }
    #xiv-lightbox[data-zoom="actual"] {
      display: block;
      scroll-behavior: auto;
    }
    #xiv-lightbox[data-zoom="actual"] img,
    #xiv-lightbox[data-zoom="actual"] video {
      width: var(--xiv-actual-width, auto) !important; height: var(--xiv-actual-height, auto) !important; max-width: none !important; max-height: none !important; margin: 28px auto; cursor: grab;
      touch-action: none;
    }
    #xiv-lightbox[data-zoom="actual"][data-dragging="true"] img,
    #xiv-lightbox[data-zoom="actual"][data-dragging="true"] video {
      cursor: grabbing;
    }
    #xiv-lightbox iframe {
      width: 100vw; height: 100vh; border: 0; background: transparent;
    }
    #xiv-lightbox .xiv-video-frame {
      width: min(96vw, calc((100vh - 92px) * var(--xiv-video-ratio, 1.7778)));
      height: min(calc(100vh - 92px), calc(96vw / var(--xiv-video-ratio, 1.7778)));
      max-width: 96vw; max-height: calc(100vh - 92px);
      border: 0; background: #000; border-radius: 7px;
      box-shadow: 0 16px 48px rgba(0,0,0,.42);
      align-self: center; justify-self: center;
    }
    .xiv-lightbox-arrow {
      position: fixed; top: 50%; transform: translateY(-50%); z-index: 5;
      width: 54px; height: 74px; border: 1px solid rgba(255,255,255,.18); border-radius: 999px;
      background: rgba(18,18,20,.34); color: #fff; display: grid; place-items: center;
      font: 700 38px/1 system-ui, sans-serif; pointer-events: auto; opacity: .72; cursor: pointer;
    }
    .xiv-lightbox-close {
      position: fixed; right: 18px; top: 18px; z-index: 6;
      width: 42px; height: 42px; border-radius: 999px; border: 1px solid rgba(255,255,255,.26);
      background: radial-gradient(circle at 32% 24%, rgba(255,255,255,.22), rgba(18,18,20,.72));
      color: #fff; display: grid; place-items: center;
      pointer-events: auto; cursor: pointer; padding: 0;
      box-shadow: 0 12px 30px rgba(0,0,0,.36), inset 0 1px 0 rgba(255,255,255,.18);
      backdrop-filter: blur(12px); transition: transform .14s ease, background .14s ease, border-color .14s ease, color .14s ease;
    }
    .xiv-lightbox-close:hover { transform: translateY(-1px) scale(1.04); background: radial-gradient(circle at 32% 24%, rgba(255,255,255,.28), rgba(42,42,46,.82)); }
    .xiv-lightbox-close:active { transform: scale(.96); }
    .xiv-lightbox-fav,
    .xiv-lightbox-zoom {
      position: fixed; right: 68px; top: 18px; z-index: 6;
      width: 42px; height: 42px; border-radius: 999px; border: 1px solid rgba(255,255,255,.26);
      background: radial-gradient(circle at 32% 24%, rgba(255,255,255,.22), rgba(18,18,20,.72));
      color: #fff; display: grid; place-items: center;
      pointer-events: auto; cursor: pointer; padding: 0;
      box-shadow: 0 12px 30px rgba(0,0,0,.36), inset 0 1px 0 rgba(255,255,255,.18);
      backdrop-filter: blur(12px); transition: transform .14s ease, background .14s ease, border-color .14s ease, color .14s ease;
    }
    .xiv-lightbox-zoom { right: 168px; }
    .xiv-lightbox-fav:hover,
    .xiv-lightbox-zoom:hover { transform: translateY(-1px) scale(1.04); background: radial-gradient(circle at 32% 24%, rgba(255,255,255,.28), rgba(42,42,46,.82)); }
    .xiv-lightbox-fav:active,
    .xiv-lightbox-zoom:active { transform: scale(.96); }
    .xiv-lightbox-fav svg,
    .xiv-lightbox-close svg,
    .xiv-lightbox-zoom svg { width: 21px; height: 21px; display: block; filter: drop-shadow(0 5px 10px rgba(0,0,0,.28)); }
    .xiv-lightbox-zoom[data-active="true"] { color: #315bd8; border-color: rgba(49,91,216,.34); background: rgba(255,255,255,.98); }
    .xiv-lightbox-fav[data-favorited="true"] {
      color: #ff3b6b; border-color: rgba(255,59,107,.68);
      background: radial-gradient(circle at 32% 24%, rgba(255,119,149,.36), rgba(82,10,28,.78));
    }
    .xiv-lightbox-fav[data-favorited="true"] svg { fill: currentColor; stroke: currentColor; }
    .xiv-lightbox-arrow[data-side="left"] { left: 18px; }
    .xiv-lightbox-arrow[data-side="right"] { right: 18px; }
    @media (max-width: 820px) {
      #xiv-stage { padding: 52px 4px 10px; }
      #xiv-grid { grid-template-columns: repeat(var(--xiv-columns, 3), minmax(0, 1fr)); gap: 4px; }
      .xiv-masonry-column { gap: 4px; }
      .xiv-tile { border-radius: 6px; }
      .xiv-pill { max-width: calc(100vw - 176px); overflow: hidden; text-overflow: ellipsis; }
      .xiv-actions { max-width: calc(100vw - 104px); }
      .xiv-btn { min-width: 36px; width: 36px; height: 36px; }
      #xiv-root[data-lightbox-active="true"] .xiv-btn {
        min-width: 34px; width: 34px; height: 34px; flex: 0 0 34px;
      }
    }
  `;

  const icons = {
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
    gridPlus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="6" height="6"/><rect x="3" y="15" width="6" height="6"/><rect x="15" y="3" width="6" height="6"/><path d="M18 14v7M14.5 17.5h7"/></svg>',
    gridMinus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="6" height="6"/><rect x="3" y="15" width="6" height="6"/><rect x="15" y="3" width="6" height="6"/><path d="M14.5 17.5h7"/></svg>',
    theme: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 9 9 6.5 6.5 0 0 1-9-9Z"/></svg>',
    fullscreen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M21 16v5h-5"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    prevSet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6 9 12l6 6"/><path d="M20 6 14 12l6 6"/><path d="M4 5v14"/></svg>',
    nextSet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/><path d="M4 6l6 6-6 6"/><path d="M20 5v14"/></svg>',
    queueList: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="14" height="12" rx="2"/><path d="m6 15 3.1-3.2a1.4 1.4 0 0 1 2 0L14 15"/><circle cx="13.5" cy="10" r="1"/><path d="M7 3h12a2 2 0 0 1 2 2v10"/></svg>',
    magnet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v8a6 6 0 0 0 12 0V4"/><path d="M6 8h4M14 8h4M6 4h4M14 4h4"/></svg>',
    slow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M8 8l-4 4 4 4"/></svg>',
    fast: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M16 8l4 4-4 4"/></svg>',
    top: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16M6 15l6-6 6 6M12 9v10"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.05.05a2.1 2.1 0 0 1-2.97 2.97l-.05-.05a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.1 1.66V21a2.1 2.1 0 0 1-4.2 0v-.07a1.8 1.8 0 0 0-1.1-1.66 1.8 1.8 0 0 0-1.98.36l-.05.05a2.1 2.1 0 0 1-2.97-2.97l.05-.05A1.8 1.8 0 0 0 3.6 15a1.8 1.8 0 0 0-1.66-1.1H1.9a2.1 2.1 0 0 1 0-4.2h.07A1.8 1.8 0 0 0 3.6 8a1.8 1.8 0 0 0-.36-1.98l-.05-.05A2.1 2.1 0 0 1 6.16 3l.05.05A1.8 1.8 0 0 0 8.2 3.4a1.8 1.8 0 0 0 1.1-1.66V1.7a2.1 2.1 0 0 1 4.2 0v.07a1.8 1.8 0 0 0 1.1 1.66 1.8 1.8 0 0 0 1.98-.36l.05-.05A2.1 2.1 0 0 1 19.6 6l-.05.05A1.8 1.8 0 0 0 19.2 8a1.8 1.8 0 0 0 1.66 1.1h.07a2.1 2.1 0 0 1 0 4.2h-.07A1.8 1.8 0 0 0 19.4 15Z"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 10v7M12 7h.01"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1 0l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>'
  };

  function absoluteUrl(value, base = location.href) {
    if (!value) return "";
    try {
      return new URL(value, base).href;
    } catch {
      return "";
    }
  }

  function normalizedPageUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      parsed.hash = "";
      return parsed.href.replace(/\/$/, "/");
    } catch {
      return "";
    }
  }

  function samePageUrl(a, b) {
    return normalizedPageUrl(a) === normalizedPageUrl(b);
  }

  function galleryQueueStorageKey(url = location.href) {
    try {
      const parsed = new URL(url, location.href);
      return `flowlens-gallery-queue:${parsed.origin}`;
    } catch {
      return "flowlens-gallery-queue";
    }
  }

  function galleryQueueAutoOpenKey() {
    return "flowlens-gallery-queue-auto-open";
  }

  function activeGalleryQueueUrl() {
    return normalizedPageUrl(state.galleryQueueCurrentUrl || location.href);
  }

  function galleryQueueIndexForUrl(queue, url) {
    const clean = normalizedPageUrl(url);
    if (!clean) return -1;
    const lower = clean.toLowerCase();
    return queue.findIndex((item) => {
      const candidate = normalizedPageUrl(item);
      return samePageUrl(candidate, clean) || candidate.toLowerCase() === lower;
    });
  }

  function cleanPageTitle(value, fallback = "") {
    const text = String(value || "")
      .replace(/\s+/g, " ")
      .replace(/\s*[-_|–—]+\s*(?:xChina|PornPics|FlowLens|瀑光).*$/i, "")
      .trim();
    return text || fallback || "";
  }

  function pageTitleFromDocument(doc = document, fallbackUrl = location.href) {
    const raw = doc.querySelector?.('meta[property="og:title"], meta[name="twitter:title"]')?.getAttribute?.("content")
      || doc.querySelector?.("h1")?.textContent
      || doc.title
      || "";
    return cleanPageTitle(raw, pageBookmarkHost(fallbackUrl) || fallbackUrl);
  }

  function isXchinaPhotoUrl(url = location.href) {
    try {
      const parsed = new URL(url, location.href);
      return /(^|\.)xchina\.co$/i.test(parsed.hostname) && /^\/photo\/id-[A-Za-z0-9_-]+\.html$/i.test(parsed.pathname);
    } catch {
      return false;
    }
  }

  function isX810114Url(url = location.href) {
    try {
      return new URL(url, location.href).hostname === "x.810114.xyz";
    } catch {
      return false;
    }
  }

  function isSelfieGalleryQueueUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      return parsed.origin === location.origin && SELFIE_GALLERY_PATH_RE.test(parsed.pathname);
    } catch {
      return false;
    }
  }

  function isQueueCandidateUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      const host = parsed.hostname;
      const path = parsed.pathname;
      const current = new URL(location.href);
      // 自拍图库 uses opaque internationalized hostnames, but its gallery pages
      // consistently use this path shape. Keep the rule same-origin so generic
      // article pages cannot pollute a gallery queue.
      if (parsed.origin === current.origin
        && SELFIE_GALLERY_PATH_RE.test(current.pathname)
        && SELFIE_GALLERY_PATH_RE.test(path)) {
        return true;
      }
      if (/^www\.pornpics\.com$/i.test(host) || /(^|\.)pornpics\.com$/i.test(host)) {
        return /\/(?:[a-z]{2}\/)?galleries\/[^/]+-\d+\/?$/i.test(path);
      }
      if (/(^|\.)xchina\.co$/i.test(host)) {
        return /\/(?:photo\/id-[A-Za-z0-9_-]+\.html|photos\/series-[A-Za-z0-9_-]+\/\d+\.html)$/i.test(path);
      }
      if (/(^|\.)buondua\.com$/i.test(host)) {
        return /^\/[^?#]+-\d+(?:\/)?$/i.test(path) && !/\/(?:tag|category|page|collection)\//i.test(path);
      }
      if (/^x\.810114\.xyz$/i.test(host)) {
        const parts = path.split("/").filter(Boolean);
        return parts.length === 1 && /^[A-Za-z0-9_]{2,64}$/.test(parts[0]);
      }
      if (parsed.origin === current.origin) {
        if (path === "/" || /\.(?:css|js|json|xml|svg|ico|woff2?|ttf|map)(?:$|[?#])/i.test(path)) return false;
        if (/\/(?:tag|tags|category|categories|search|login|register|about|contact|privacy|terms|page)(?:\/|$)/i.test(path)) return false;
        if (/\.(?:html?|php|aspx?)$/i.test(path) || /\/(?:post|posts|article|articles|photo|photos|gallery|galleries|image|images|video|videos|jav|movie|movies)\//i.test(path)) return true;
        const parts = path.split("/").filter(Boolean);
        return parts.length >= 1 && parts.length <= 4 && /[A-Za-z0-9\u4e00-\u9fff]{3,}/.test(parts.at(-1) || "");
      }
    } catch {
      return false;
    }
    return false;
  }

  function pornpicsGalleryInfo(url) {
    try {
      const parsed = new URL(url, location.href);
      if (!/(^|\.)pornpics\.com$/i.test(parsed.hostname)) return null;
      const match = parsed.pathname.match(/^\/(?:([a-z]{2})\/)?galleries\/([^/?#]+)-(\d+)\/?$/i);
      if (!match) return null;
      return { locale: (match[1] || "en").toLowerCase(), slug: match[2].toLowerCase(), id: match[3] };
    } catch {
      return null;
    }
  }

  function galleryQueueDedupeKey(url) {
    const pornpics = pornpicsGalleryInfo(url);
    return pornpics ? `pornpics:${pornpics.id}` : normalizedPageUrl(url).toLowerCase();
  }

  function isPornpicsLanguageMirror(url, base = location.href) {
    const target = pornpicsGalleryInfo(url);
    const source = pornpicsGalleryInfo(base);
    if (!target || !source) return false;
    if (target.id === source.id) return !samePageUrl(url, base);
    return target.locale !== source.locale;
  }

  function collectX810114SidebarProfileQueue(doc = document) {
    const found = [];
    const seen = new Set();
    const banned = /^(static|manifest|favicon|photo|api|tag|search|assets|img|images|css|js)$/i;

    function add(name) {
      if (!name || !/^[A-Za-z0-9_]{2,64}$/.test(name) || banned.test(name)) return;
      const key = name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      found.push(`https://x.810114.xyz/${name}`);
    }

    function namesFrom(text) {
      return [...String(text || "").matchAll(/@\s*([A-Za-z0-9_]{2,64})/g)].map((match) => match[1]);
    }

    function scan(root) {
      if (!root) return;
      try {
        const filter = doc.defaultView?.NodeFilter || window.NodeFilter;
        const walker = doc.createTreeWalker(root, filter.SHOW_TEXT);
        let node = null;
        while ((node = walker.nextNode())) namesFrom(node.nodeValue).forEach(add);
      } catch {
        namesFrom(root.textContent || "").forEach(add);
      }
    }

    const win = doc.defaultView || window;
    const viewportWidth = Number(win?.innerWidth || 0);
    const candidates = Array.from(doc.querySelectorAll?.("aside, section, div") || [])
      .map((el) => {
        const text = el.innerText || el.textContent || "";
        const names = namesFrom(text);
        if (names.length < 2) return null;
        const cls = String(el.className || "");
        let rect = { x: 0, y: 0, width: 0, height: 0 };
        try { rect = el.getBoundingClientRect?.() || rect; } catch {}
        const rightRail = viewportWidth ? rect.x > viewportWidth * 0.55 && rect.width > 120 : false;
        const railClass = /(?:\bw-1\/4\b|border-l|right-0|max-w-sm|overflow-auto|bg-white)/i.test(cls);
        const cardCount = Array.from(el.querySelectorAll?.("*") || [])
          .filter((node) => namesFrom(node.innerText || node.textContent || "").length === 1 && /(?:hover:cursor-pointer|cursor-pointer|rounded|shadow|items-center|bg-gray)/i.test(String(node.className || "")))
          .length;
        const score = names.length * 10 + cardCount * 40 + (rightRail ? 1000 : 0) + (railClass ? 300 : 0) - Math.max(0, el.children.length - 80);
        return { el, score, names };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);

    const best = candidates[0]?.el || null;
    if (best) scan(best);
    return found;
  }

  function collectGalleryQueueFromDocument(doc = document, base = location.href) {
    const queue = [];
    const seen = new Set();

    function remember(raw) {
      const url = normalizedPageUrl(absoluteUrl(raw, base));
      if (!url || !isQueueCandidateUrl(url)) return;
      if (isPornpicsLanguageMirror(url, base)) return;
      if (isPhotoGalleryPage(base) && sameGalleryPage(url, base)) return;
      const key = galleryQueueDedupeKey(url);
      if (seen.has(key)) return;
      seen.add(key);
      queue.push(url);
    }

    if (/^https?:\/\/x\.810114\.xyz(?:\/|$)/i.test(base)) {
      const sidebarQueue = collectX810114SidebarProfileQueue(doc);
      if (sidebarQueue.length) {
        sidebarQueue.forEach(remember);
        return queue;
      }
    }

    if (isPornpicsGalleryPage(base)) {
      doc.querySelectorAll("a[href*='/galleries/']").forEach((link) => {
        const image = link.querySelector("img")
          || link.parentElement?.querySelector?.("img")
          || link.closest("article, li, [class*='card' i], [class*='tile' i], [class*='item' i]")?.querySelector?.("img");
        if (image) remember(link.getAttribute("href"));
      });
      return queue;
    }

    doc.querySelectorAll("a[href]").forEach((link) => remember(link.getAttribute("href")));
    collectGalleryQueueUrlsFromHtml(doc, base).forEach(remember);
    if (/^https?:\/\/x\.810114\.xyz(?:\/|$)/i.test(base)) {
      collectX810114ProfileQueueFromText(doc).forEach(remember);
    }
    return queue;
  }

  function xchinaAdjacentLinksFromDocument(doc = document, base = location.href) {
    if (!isXchinaPhotoUrl(base)) return { previous: "", next: "" };
    const result = { previous: "", next: "" };
    doc.querySelectorAll?.("a[href]").forEach((link) => {
      const href = normalizedPageUrl(absoluteUrl(link.getAttribute("href"), base));
      if (!href || !isQueueCandidateUrl(href)) return;
      const text = [
        link.textContent,
        link.getAttribute("title"),
        link.getAttribute("aria-label"),
        link.getAttribute("rel"),
        link.className,
        link.id
      ].join(" ");
      if (!result.previous && /(?:上一|上组|prev|previous|left)/i.test(text)) result.previous = href;
      if (!result.next && /(?:下一|下组|next|right)/i.test(text)) result.next = href;
    });
    return result;
  }

  function genericAdjacentLinksFromDocument(doc = document, base = location.href) {
    const result = { previous: "", next: "" };
    try {
      const current = new URL(base, location.href);
      doc.querySelectorAll?.("a[href]").forEach((link) => {
        const href = normalizedPageUrl(absoluteUrl(link.getAttribute("href"), base));
        if (!href || !isQueueCandidateUrl(href) || samePageUrl(href, base)) return;
        const parsed = new URL(href, base);
        if (parsed.origin !== current.origin) return;
        const text = [
          link.textContent,
          link.getAttribute("title"),
          link.getAttribute("aria-label"),
          link.getAttribute("rel"),
          link.className,
          link.id
        ].join(" ").replace(/\s+/g, " ");
        if (!result.previous && /(?:上一|上组|上一篇|prev|previous|older|left|back)/i.test(text)) result.previous = href;
        if (!result.next && /(?:下一|下组|下一篇|next|newer|right|forward)/i.test(text)) result.next = href;
      });
    } catch {}
    return result;
  }

  function collectGalleryQueueUrlsFromHtml(doc = document, base = location.href) {
    const found = [];
    const seen = new Set();
    const html = doc.documentElement?.innerHTML || "";
    if (!html) return found;

    function remember(raw) {
      const url = normalizedPageUrl(absoluteUrl(raw, base));
      if (!url || !isQueueCandidateUrl(url)) return;
      if (isPornpicsLanguageMirror(url, base)) return;
      const key = galleryQueueDedupeKey(url);
      if (seen.has(key)) return;
      seen.add(key);
      found.push(url);
    }

    if (!isPornpicsGalleryPage(base)) {
      for (const match of html.matchAll(/https?:\/\/(?:www\.)?pornpics\.com\/(?:[a-z]{2}\/)?galleries\/[^"'<>\\\s]+?-\d+\/?/gi)) remember(match[0]);
      for (const match of html.matchAll(/["'](\/(?:[a-z]{2}\/)?galleries\/[^"'<>\\\s]+?-\d+\/?)["']/gi)) remember(match[1]);
    }
    for (const match of html.matchAll(/https?:\/\/(?:www\.)?xchina\.co\/(?:photo\/id-[A-Za-z0-9_-]+\.html|photos\/series-[A-Za-z0-9_-]+\/\d+\.html)/gi)) remember(match[0]);
    for (const match of html.matchAll(/["'](\/(?:photo\/id-[A-Za-z0-9_-]+\.html|photos\/series-[A-Za-z0-9_-]+\/\d+\.html))["']/gi)) remember(match[1]);
    for (const match of html.matchAll(/https?:\/\/(?:www\.)?buondua\.com\/[^"'<>\\\s]+?-\d+\/?/gi)) remember(match[0]);
    for (const match of html.matchAll(/https?:\/\/x\.810114\.xyz\/([A-Za-z0-9_]{2,64})(?:[/?#"'<>\\\s]|$)/g)) remember(`https://x.810114.xyz/${match[1]}`);
    if (SELFIE_GALLERY_PATH_RE.test(new URL(base, location.href).pathname)) {
      for (const match of html.matchAll(/(?:https?:\/\/[^"'<>\\\s]+)?\/?(?:top_\d+_)?content_\d+\.html(?:[?#][^"'<>\\\s]*)?/gi)) remember(match[0]);
    }
    return found;
  }

  function collectX810114ProfileQueueFromText(doc = document) {
    const found = [];
    const seen = new Set();
    const banned = /^(static|manifest|favicon|photo|api|tag|search|assets|img|images|css|js)$/i;
    function add(name) {
      if (!name || !/^[A-Za-z0-9_]{2,64}$/.test(name) || banned.test(name)) return;
      const key = name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      found.push(`https://x.810114.xyz/${name}`);
    }
    function scan(text) {
      const matches = String(text || "").matchAll(/@\s*([A-Za-z0-9_]{2,64})/g);
      for (const match of matches) {
        add(match[1]);
      }
    }

    function scanRoot(root) {
      if (!root) return;
      try {
        const filter = doc.defaultView?.NodeFilter || window.NodeFilter;
        const walker = doc.createTreeWalker(root, filter.SHOW_TEXT);
        let node = null;
        while ((node = walker.nextNode())) scan(node.nodeValue);
      } catch {
        scan(root.textContent || "");
      }
      root.querySelectorAll?.("[title], [aria-label], [data-username], [data-user], [data-name], [href]").forEach((el) => {
        scan([
          el.getAttribute("title"),
          el.getAttribute("aria-label"),
          el.getAttribute("data-username"),
          el.getAttribute("data-user"),
          el.getAttribute("data-name"),
          el.getAttribute("href"),
          el.textContent
        ].filter(Boolean).join(" "));
      });
      root.querySelectorAll?.("*").forEach((el) => {
        if (el.shadowRoot) scanRoot(el.shadowRoot);
        if (el.tagName === "IFRAME") {
          try { scanRoot(el.contentDocument); } catch { /* Cross-origin frames are inaccessible. */ }
        }
      });
    }

    scanRoot(doc.body || doc.documentElement);
    scan(doc.body?.innerText || "");
    scan(doc.body?.textContent || "");

    doc.querySelectorAll("[title], [aria-label], [data-username], [data-user], [data-name]").forEach((el) => {
      scan([
        el.getAttribute("title"),
        el.getAttribute("aria-label"),
        el.getAttribute("data-username"),
        el.getAttribute("data-user"),
        el.getAttribute("data-name")
      ].filter(Boolean).join(" "));
    });
    const html = doc.documentElement?.innerHTML || "";
    for (const match of html.matchAll(/https?:\/\/x\.810114\.xyz\/([A-Za-z0-9_]{2,64})(?:[/?#"'<>\\\s]|$)|["']\/([A-Za-z0-9_]{2,64})(?:[/?#"'<>\\\s]|$)/g)) {
      const name = match[1] || match[2] || "";
      add(name);
    }
    return found;
  }

  function readStoredGalleryQueue() {
    try {
      const raw = sessionStorage.getItem(galleryQueueStorageKey());
      const data = JSON.parse(raw || "[]");
      if (!Array.isArray(data)) return [];
      const base = activeGalleryQueueUrl();
      const seen = new Set();
      return data.map(normalizedPageUrl).filter((url) => {
        if (!isQueueCandidateUrl(url) || isPornpicsLanguageMirror(url, base)) return false;
        const key = galleryQueueDedupeKey(url);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    } catch {
      return [];
    }
  }

  function writeStoredGalleryQueue(queue) {
    try {
      sessionStorage.setItem(galleryQueueStorageKey(), JSON.stringify(queue.slice(0, 300)));
    } catch {
      // Queue persistence is best-effort.
    }
  }

  function refreshGalleryQueue(doc = document, base = location.href) {
    rememberGalleryQueueTitles(doc, base);
    const stored = readStoredGalleryQueue();
    const discovered = collectGalleryQueueFromDocument(doc, base);
    const current = isX810114Url(base) ? normalizedPageUrl(location.href) : activeGalleryQueueUrl();
    const merged = [];
    const seen = new Set();

    function remember(url) {
      const clean = normalizedPageUrl(url);
      if (!clean || !isQueueCandidateUrl(clean)) return;
      if (isPornpicsLanguageMirror(clean, current)) return;
      const key = galleryQueueDedupeKey(clean);
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(clean);
    }

    if (isX810114Url(base) || isX810114Url(current)) {
      const sidebar = collectX810114SidebarProfileQueue(doc).map(normalizedPageUrl).filter(isQueueCandidateUrl);
      const docBase = normalizedPageUrl(doc?.documentElement?.dataset?.xivBase || base);
      if (sidebar.length && samePageUrl(docBase, activeGalleryQueueUrl())) {
        state.x810114ActiveSidebarQueue = sidebar;
      }
      const primary = discovered.length > stored.length ? discovered : stored;
      const secondary = primary === discovered ? stored : discovered;
      primary.forEach(remember);
      secondary.forEach(remember);
      if (isQueueCandidateUrl(current)) remember(current);
      state.galleryQueue = merged;
      state.galleryQueueIndex = galleryQueueIndexForUrl(merged, current);
      if (merged.length > 1) writeStoredGalleryQueue(merged);
      syncGalleryQueueButtons();
      return;
    }

    const adjacent = isXchinaPhotoUrl(current)
      ? xchinaAdjacentLinksFromDocument(doc, base)
      : genericAdjacentLinksFromDocument(doc, base);
    if (adjacent.previous || adjacent.next) {
      if (adjacent.previous) remember(adjacent.previous);
      if (isQueueCandidateUrl(current)) remember(current);
      if (adjacent.next) remember(adjacent.next);
      discovered.forEach(remember);
      stored.forEach(remember);
    } else {
      stored.forEach(remember);
      discovered.forEach(remember);
      if (isQueueCandidateUrl(current)) remember(current);
    }
    state.galleryQueue = merged;
    state.galleryQueueIndex = galleryQueueIndexForUrl(merged, current);
    if (merged.length > 1) writeStoredGalleryQueue(merged);
    syncGalleryQueueButtons();
  }

  function rebuildGalleryQueueFromVisiblePage() {
    const visibleBase = state.collectionBase || location.href;
    rememberGalleryQueueTitles(document, visibleBase);
    const current = isX810114Url(visibleBase) ? normalizedPageUrl(location.href) : activeGalleryQueueUrl();
    const discovered = collectGalleryQueueFromDocument(document, visibleBase);
    const stored = readStoredGalleryQueue();
    const merged = [];
    const seen = new Set();

    function remember(url) {
      const clean = normalizedPageUrl(url);
      if (!clean || !isQueueCandidateUrl(clean)) return;
      if (isPornpicsLanguageMirror(clean, current)) return;
      const key = galleryQueueDedupeKey(clean);
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(clean);
    }

    if (isX810114Url(visibleBase) || isX810114Url(current)) {
      const sidebar = collectX810114SidebarProfileQueue(document).map(normalizedPageUrl).filter(isQueueCandidateUrl);
      const docBase = normalizedPageUrl(document.documentElement?.dataset?.xivBase || location.href);
      if (sidebar.length && samePageUrl(docBase, activeGalleryQueueUrl())) {
        state.x810114ActiveSidebarQueue = sidebar;
      }
      const primary = discovered.length > stored.length ? discovered : stored;
      const secondary = primary === discovered ? stored : discovered;
      primary.forEach(remember);
      secondary.forEach(remember);
      if (isQueueCandidateUrl(current)) remember(current);
      if (merged.length < 2) {
        window.setTimeout(() => refreshGalleryQueue(), 120);
        return false;
      }
      state.galleryQueue = merged;
      state.galleryQueueIndex = galleryQueueIndexForUrl(merged, current);
      writeStoredGalleryQueue(merged);
      syncGalleryQueueButtons();
      return true;
    }

    const adjacent = isXchinaPhotoUrl(current)
      ? xchinaAdjacentLinksFromDocument(document, visibleBase)
      : genericAdjacentLinksFromDocument(document, visibleBase);
    if (adjacent.previous || adjacent.next) {
      if (adjacent.previous) remember(adjacent.previous);
      if (isQueueCandidateUrl(current)) remember(current);
      if (adjacent.next) remember(adjacent.next);
      discovered.forEach(remember);
      stored.forEach(remember);
    } else {
      discovered.forEach(remember);
      stored.forEach(remember);
      if (isQueueCandidateUrl(current)) remember(current);
    }
    if (merged.length < 2) {
      // x.810114 renders the recommendation rail lazily. A second pass after
      // layout catches cards that appeared between the original refresh and tap.
      if (isGenericX810114Page()) {
        window.setTimeout(() => refreshGalleryQueue(), 120);
      }
      return false;
    }
    state.galleryQueue = merged;
    state.galleryQueueIndex = galleryQueueIndexForUrl(merged, current);
    writeStoredGalleryQueue(merged);
    syncGalleryQueueButtons();
    return true;
  }

  function scheduleGalleryQueueRefresh() {
    clearTimeout(state.galleryQueueRefreshTimer);
    state.galleryQueueRefreshTimer = window.setTimeout(() => refreshGalleryQueue(), 180);
  }

  function startGalleryQueueObserver() {
    if (state.galleryQueueObserver || !document.documentElement) return;
    state.galleryQueueObserver = new MutationObserver((mutations) => {
      if (mutations.every((mutation) => {
        const target = mutation.target;
        return state.root?.contains(target) || state.launch?.contains(target);
      })) return;
      scheduleGalleryQueueRefresh();
    });
    state.galleryQueueObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["href", "title", "aria-label", "data-username", "data-user", "data-name"]
    });
    [300, 900, 1800, 3200].forEach((delay) => window.setTimeout(() => refreshGalleryQueue(), delay));
  }

  function galleryQueueTarget(delta) {
    if (!state.galleryQueue.length) refreshGalleryQueue();
    if (state.galleryQueue.length < 2) rebuildGalleryQueueFromVisiblePage();
    const queue = state.galleryQueue;
    if (queue.length < 2) return "";
    const activeUrl = isGenericX810114Page() ? normalizedPageUrl(location.href) : activeGalleryQueueUrl();
    const computedIndex = galleryQueueIndexForUrl(queue, activeUrl);
    let index = computedIndex >= 0 ? computedIndex : state.galleryQueueIndex;
    if (computedIndex >= 0) state.galleryQueueIndex = computedIndex;
    if (index < 0 && isGenericX810114Page() && !isQueueCandidateUrl(activeUrl)) {
      return delta > 0 ? queue[0] : queue[queue.length - 1];
    }
    if (index < 0) index = 0;
    const next = (index + delta + queue.length) % queue.length;
    const url = queue[next];
    return samePageUrl(url, activeUrl) ? "" : url;
  }

  function x810114QueueTarget(delta) {
    if (!isGenericX810114Page()) return "";
    const sidebar = state.x810114ActiveSidebarQueue?.length
      ? state.x810114ActiveSidebarQueue
      : collectX810114SidebarProfileQueue(document);
    const stored = readStoredGalleryQueue();
    const queue = (sidebar.length ? sidebar : stored)
      .map(normalizedPageUrl)
      .filter(isQueueCandidateUrl);
    if (!queue.length) return "";
    const activeUrl = activeGalleryQueueUrl();
    let index = galleryQueueIndexForUrl(queue, activeUrl);
    const recent = new Set((state.x810114RecentQueue || []).map((url) => normalizedPageUrl(url).toLowerCase()).filter(Boolean));
    const direction = delta >= 0 ? 1 : -1;

    function usable(url) {
      return url && !samePageUrl(url, activeUrl);
    }

    if (index >= 0) {
      for (let step = 1; step <= queue.length; step += 1) {
        const candidate = queue[(index + step * direction + queue.length) % queue.length];
        if (usable(candidate) && !recent.has(candidate.toLowerCase())) return candidate;
      }
      for (let step = 1; step <= queue.length; step += 1) {
        const candidate = queue[(index + step * direction + queue.length) % queue.length];
        if (usable(candidate)) return candidate;
      }
      return "";
    }

    const ordered = direction > 0 ? queue : queue.slice().reverse();
    return ordered.find((candidate) => usable(candidate) && !recent.has(candidate.toLowerCase()))
      || ordered.find(usable)
      || "";
  }

  function rememberX810114QueueVisit(target) {
    if (!isGenericX810114Page()) return;
    const visits = [
      ...(state.x810114RecentQueue || []),
      activeGalleryQueueUrl(),
      normalizedPageUrl(target)
    ].filter(isQueueCandidateUrl);
    const deduped = [];
    const seen = new Set();
    for (let i = visits.length - 1; i >= 0; i -= 1) {
      const url = visits[i];
      const key = url.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.unshift(url);
    }
    state.x810114RecentQueue = deduped.slice(-12);
  }

  function syncGalleryQueueButtons() {
    const hasQueue = state.galleryQueue.length > 1;
    const allowRefreshClick = !hasQueue && isGenericX810114Page();
    const total = state.galleryQueue.length || 0;
    const index = state.galleryQueueIndex >= 0 ? state.galleryQueueIndex + 1 : 0;
    state.root?.querySelectorAll('[data-xiv="prev-set"], [data-xiv="next-set"]').forEach((button) => {
      const label = button.dataset.xiv === "prev-set" ? "上一组" : "下一组";
      button.disabled = !hasQueue && !allowRefreshClick;
      button.dataset.enabled = hasQueue ? "true" : "false";
      const shortcut = button.dataset.xiv === "prev-set" ? "," : ".";
      button.title = hasQueue && index ? `${label}（${index}/${total}，${shortcut}）` : `${label}（未识别到队列，${shortcut}）`;
    });
    const listButton = state.root?.querySelector('[data-xiv="queue-list"]');
    if (listButton) {
      listButton.disabled = !total && !allowRefreshClick;
      listButton.dataset.enabled = total ? "true" : "false";
      listButton.title = total ? `组列表（${index || 0}/${total}）` : "组列表（尚未识别到内容）";
    }
    renderGalleryQueuePanel();
  }

  function galleryQueueCoverFromImage(image, base = location.href) {
    if (!image) return "";
    const identity = [
      image.getAttribute?.("alt"),
      image.getAttribute?.("title"),
      image.getAttribute?.("class"),
      image.getAttribute?.("id")
    ].filter(Boolean).join(" ");
    if (/(?:logo|google|language|locale|flag|avatar|icon|sprite)/i.test(identity)) return "";
    const declaredWidth = Number.parseInt(image.getAttribute?.("width") || "0", 10);
    const declaredHeight = Number.parseInt(image.getAttribute?.("height") || "0", 10);
    if (declaredWidth > 0 && declaredHeight > 0 && Math.max(declaredWidth, declaredHeight) < 140) return "";
    const srcset = image.getAttribute?.("srcset") || image.getAttribute?.("data-srcset") || "";
    const srcsetUrl = srcset.split(",").map((part) => part.trim().split(/\s+/)[0]).filter(Boolean).at(-1) || "";
    const raw = image.currentSrc
      || image.getAttribute?.("src")
      || image.getAttribute?.("data-src")
      || image.getAttribute?.("data-original")
      || image.getAttribute?.("data-lazy-src")
      || srcsetUrl;
    const url = absoluteUrl(String(raw || "").split(/\s+/)[0], base);
    if (!url || !/^(?:https?:|data:|blob:)/i.test(url)) return "";
    if (/(?:logo|favicon|icon|sprite|avatar|google|flag|language)[._\/-]/i.test(url)) return "";
    return url;
  }

  function rememberGalleryQueueTitles(doc = document, base = location.href) {
    if (!doc?.querySelectorAll) return;
    doc.querySelectorAll("a[href]").forEach((anchor) => {
      const url = normalizedPageUrl(absoluteUrl(anchor.getAttribute("href"), base));
      if (!isQueueCandidateUrl(url)) return;
      if (isPornpicsLanguageMirror(url, base)) return;
      const raw = anchor.getAttribute("title") || anchor.getAttribute("aria-label") || anchor.textContent || "";
      const title = String(raw).replace(/\s+/g, " ").trim();
      if (!title || /^(上一组|下一组|上一页|下一页|previous|next)$/i.test(title)) return;
      const previous = state.galleryQueueTitles.get(url);
      if (!previous || title.length > previous.length) state.galleryQueueTitles.set(url, title.slice(0, 100));
      if (!state.galleryQueueCovers.has(url)) {
        const nearby = anchor.querySelector("img")
          || anchor.parentElement?.querySelector?.("img")
          || anchor.closest("article, li, [class*='card' i], [class*='item' i]")?.querySelector?.("img");
        const cover = galleryQueueCoverFromImage(nearby, base);
        if (cover) state.galleryQueueCovers.set(url, cover);
      }
    });
    const currentUrl = normalizedPageUrl(doc?.documentElement?.dataset?.xivBase || base);
    const currentTitle = pageTitleFromDocument(doc, currentUrl);
    if (isQueueCandidateUrl(currentUrl) && currentTitle) state.galleryQueueTitles.set(currentUrl, currentTitle.slice(0, 100));
    if (isQueueCandidateUrl(currentUrl) && !state.galleryQueueCovers.has(currentUrl)) {
      const selectorGroups = isPornpicsGalleryPage(currentUrl)
        ? ["#tiles img", "[class*='thumb' i] img", "[class*='gallery' i] img", "main img"]
        : ["main article img, main img, article img"];
      for (const selectors of selectorGroups) {
        for (const image of doc.querySelectorAll?.(selectors) || []) {
          const cover = galleryQueueCoverFromImage(image, currentUrl);
          if (!cover) continue;
          state.galleryQueueCovers.set(currentUrl, cover);
          break;
        }
        if (state.galleryQueueCovers.has(currentUrl)) break;
      }
    }
  }

  function galleryQueueDisplayTitle(url, index) {
    const stored = state.galleryQueueTitles.get(normalizedPageUrl(url));
    if (stored) return stored;
    try {
      const parsed = new URL(url, location.href);
      const tail = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "")
        .replace(/\.(?:html?|php)$/i, "")
        .replace(/[-_]+/g, " ")
        .trim();
      return tail || parsed.hostname || `第 ${index + 1} 组`;
    } catch {
      return `第 ${index + 1} 组`;
    }
  }

  function galleryQueueDisplayUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      return `${parsed.hostname}${decodeURIComponent(parsed.pathname)}`;
    } catch {
      return String(url || "");
    }
  }

  function renderGalleryQueuePanel() {
    const panel = state.galleryQueuePanel;
    if (!panel) return;
    const list = panel.querySelector(".xiv-queue-list");
    const count = panel.querySelector(".xiv-queue-count");
    if (!list || !count) return;
    const queue = state.galleryQueue;
    const activeUrl = activeGalleryQueueUrl();
    const activeIndex = galleryQueueIndexForUrl(queue, activeUrl) >= 0
      ? galleryQueueIndexForUrl(queue, activeUrl)
      : state.galleryQueueIndex;
    count.textContent = queue.length ? `${activeIndex >= 0 ? activeIndex + 1 : 0} / ${queue.length}` : "0 组";
    list.replaceChildren();
    if (!queue.length) {
      const empty = document.createElement("div");
      empty.className = "xiv-queue-empty";
      empty.textContent = "暂未识别到后续组，稍后打开列表会自动重试。";
      list.appendChild(empty);
      return;
    }
    queue.forEach((url, index) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "xiv-queue-item";
      item.dataset.queueIndex = String(index);
      item.dataset.current = index === activeIndex ? "true" : "false";
      item.title = galleryQueueDisplayTitle(url, index);

      const cover = document.createElement("span");
      cover.className = "xiv-queue-cover";
      const coverUrl = state.galleryQueueCovers.get(normalizedPageUrl(url));
      if (coverUrl) {
        const image = document.createElement("img");
        image.loading = "lazy";
        image.decoding = "async";
        image.referrerPolicy = "no-referrer";
        image.alt = "";
        image.src = coverUrl;
        image.addEventListener("error", () => image.remove(), { once: true });
        cover.appendChild(image);
      }
      const number = document.createElement("span");
      number.className = "xiv-queue-number";
      number.textContent = String(index + 1);
      cover.appendChild(number);
      const copy = document.createElement("span");
      copy.className = "xiv-queue-copy";
      const title = document.createElement("span");
      title.className = "xiv-queue-title";
      title.textContent = galleryQueueDisplayTitle(url, index);
      const path = document.createElement("span");
      path.className = "xiv-queue-url";
      path.textContent = galleryQueueDisplayUrl(url);
      const arrow = document.createElement("span");
      arrow.className = "xiv-queue-arrow";
      arrow.textContent = index === activeIndex ? "•" : "›";
      copy.append(title, path);
      item.append(cover, copy, arrow);
      list.appendChild(item);
    });
  }

  function toggleGalleryQueuePanel() {
    if (!state.galleryQueuePanel) return;
    const open = state.galleryQueuePanel.dataset.open === "true";
    if (open) {
      state.galleryQueuePanel.dataset.open = "false";
      return;
    }
    refreshGalleryQueue();
    rebuildGalleryQueueFromVisiblePage();
    closePanels("queue");
    renderGalleryQueuePanel();
    state.galleryQueuePanel.dataset.open = "true";
    requestAnimationFrame(() => {
      state.galleryQueuePanel?.querySelector('.xiv-queue-item[data-current="true"]')?.scrollIntoView?.({ block: "nearest" });
    });
  }

  async function jumpToGalleryQueueIndex(index) {
    const target = state.galleryQueue[Number(index)];
    if (!target) return;
    state.galleryQueuePanel.dataset.open = "false";
    if (samePageUrl(target, activeGalleryQueueUrl())) {
      updateStatus(`当前已是第 ${Number(index) + 1} 组`);
      return;
    }
    rememberX810114QueueVisit(target);
    const selfieTarget = isSelfieGalleryQueueUrl(target);
    if (!selfieTarget) {
      try { sessionStorage.setItem(galleryQueueAutoOpenKey(), target); } catch {}
    }
    if (state.settings?.autoFullscreen !== false && !document.fullscreenElement) {
      try { await state.root?.requestFullscreen?.(); } catch {}
    }
    updateStatus(`正在跳转到第 ${Number(index) + 1} 组`);
    try {
      if (await loadGalleryQueueTargetInPlace(target)) return;
    } catch {}
    if (selfieTarget) return;
    if (samePageUrl(target, location.href)) location.reload();
    else location.href = target;
  }

  function decodeCapturedLink(value) {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = String(value || "");
    return textarea.value.replace(/&amp;/gi, "&").trim();
  }

  function capturedLinkName(item) {
    try {
      if (item.type === "MAGNET") {
        const name = new URL(item.url).searchParams.get("dn");
        if (name) return decodeURIComponent(name.replace(/\+/g, " "));
        const hash = new URL(item.url).searchParams.get("xt") || "";
        return hash.replace(/^urn:btih:/i, "") || "磁力链接";
      }
      const parts = item.url.split("|");
      return decodeURIComponent(parts[2] || "ED2K 链接");
    } catch {
      return item.type === "MAGNET" ? "磁力链接" : "ED2K 链接";
    }
  }

  const CD2_CONFIG_KEY = "flowlens-cd2-direct-v1";
  const CD2_SERVICE = "clouddrive.CloudDriveFileSrv";
  const CD2_DEFAULT_CONFIG = Object.freeze({
    baseUrl: "http://localhost:19798",
    cloudPath: "/115/云下载/临时播放",
    apiToken: "",
    playMode: "stream",
    localMountPath: "E:\\云下载\\临时播放"
  });
  const cd2TextEncoder = new TextEncoder();
  const cd2TextDecoder = new TextDecoder();
  let cd2SessionConfig = { ...CD2_DEFAULT_CONFIG };

  function setCd2BridgeStatus(text, stateName = "") {
    const node = state.linkGrabberPanel?.querySelector?.(".xiv-link-bridge-status");
    if (!node) return;
    node.textContent = text;
    node.dataset.ready = stateName === "ready" ? "true" : "false";
    node.dataset.error = stateName === "error" ? "true" : "false";
  }

  function cd2Concat(...parts) {
    const length = parts.reduce((total, part) => total + part.length, 0);
    const output = new Uint8Array(length);
    let offset = 0;
    parts.forEach((part) => { output.set(part, offset); offset += part.length; });
    return output;
  }

  function cd2Varint(value) {
    let next = BigInt(value);
    const bytes = [];
    while (next >= 0x80n) {
      bytes.push(Number((next & 0x7fn) | 0x80n));
      next >>= 7n;
    }
    bytes.push(Number(next));
    return Uint8Array.from(bytes);
  }

  function cd2StringField(number, value) {
    const data = cd2TextEncoder.encode(String(value));
    return cd2Concat(cd2Varint((number << 3) | 2), cd2Varint(data.length), data);
  }

  function cd2VarintField(number, value) {
    return cd2Concat(cd2Varint(number << 3), cd2Varint(value));
  }

  function cd2Message(fields) {
    return cd2Concat(...fields.filter(Boolean));
  }

  function cd2ReadVarint(bytes, cursor) {
    let value = 0n;
    let shift = 0n;
    while (cursor.index < bytes.length) {
      const byte = bytes[cursor.index++];
      value |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return value;
      shift += 7n;
    }
    throw new Error("CloudDrive2 返回了损坏的数据。");
  }

  function cd2ParseProto(bytes) {
    const fields = new Map();
    const cursor = { index: 0 };
    const remember = (field, entry) => {
      if (!fields.has(field)) fields.set(field, []);
      fields.get(field).push(entry);
    };
    while (cursor.index < bytes.length) {
      const tag = Number(cd2ReadVarint(bytes, cursor));
      const field = tag >> 3;
      const wire = tag & 7;
      if (wire === 0) {
        remember(field, { wire, varint: cd2ReadVarint(bytes, cursor) });
      } else if (wire === 2) {
        const length = Number(cd2ReadVarint(bytes, cursor));
        const data = bytes.slice(cursor.index, cursor.index + length);
        cursor.index += length;
        remember(field, { wire, bytes: data, string: cd2TextDecoder.decode(data) });
      } else if (wire === 1) {
        cursor.index += 8;
      } else if (wire === 5) {
        cursor.index += 4;
      } else {
        throw new Error(`CloudDrive2 返回了不支持的字段类型 ${wire}。`);
      }
    }
    return fields;
  }

  function cd2ParseFrames(value) {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value || 0);
    const messages = [];
    const trailers = {};
    let offset = 0;
    while (offset + 5 <= bytes.length) {
      const flags = bytes[offset];
      const length = new DataView(bytes.buffer, bytes.byteOffset + offset + 1, 4).getUint32(0, false);
      const start = offset + 5;
      const end = start + length;
      if (end > bytes.length) break;
      const data = bytes.slice(start, end);
      if ((flags & 0x80) === 0x80) {
        cd2TextDecoder.decode(data).split(/\r?\n/).forEach((line) => {
          const index = line.indexOf(":");
          if (index < 1) return;
          const key = line.slice(0, index).toLowerCase();
          const raw = line.slice(index + 1).trim();
          try { trailers[key] = decodeURIComponent(raw); } catch { trailers[key] = raw; }
        });
      } else {
        messages.push(data);
      }
      offset = end;
    }
    return { messages, trailers };
  }

  function normalizeCd2Config(value = {}) {
    const baseUrl = String(value.baseUrl || CD2_DEFAULT_CONFIG.baseUrl).trim().replace(/\/+$/, "");
    const rawPath = String(value.cloudPath || CD2_DEFAULT_CONFIG.cloudPath).trim().replace(/\\/g, "/");
    const cloudPath = `${rawPath.startsWith("/") ? "" : "/"}${rawPath}`.replace(/\/+$/, "") || "/";
    return {
      baseUrl,
      cloudPath,
      apiToken: String(value.apiToken || "").trim().replace(/^Bearer\s+/i, ""),
      playMode: value.playMode === "local" ? "local" : "stream",
      localMountPath: String(value.localMountPath || CD2_DEFAULT_CONFIG.localMountPath).trim().replace(/[\\/]+$/, "")
    };
  }

  async function readCd2Config() {
    let stored = null;
    try {
      if (typeof GM_getValue === "function") stored = await GM_getValue(CD2_CONFIG_KEY, null);
    } catch {}
    if (!stored) {
      try {
        if (typeof chrome !== "undefined" && chrome.storage?.local) {
          const result = await chrome.storage.local.get(CD2_CONFIG_KEY);
          stored = result?.[CD2_CONFIG_KEY];
        }
      } catch {}
    }
    if (typeof stored === "string") {
      try { stored = JSON.parse(stored); } catch { stored = null; }
    }
    cd2SessionConfig = normalizeCd2Config(stored || cd2SessionConfig);
    return { ...cd2SessionConfig };
  }

  async function writeCd2Config(value) {
    cd2SessionConfig = normalizeCd2Config(value);
    let stored = false;
    try {
      if (typeof GM_setValue === "function") {
        await GM_setValue(CD2_CONFIG_KEY, JSON.stringify(cd2SessionConfig));
        stored = true;
      }
    } catch {}
    if (!stored) {
      try {
        if (typeof chrome !== "undefined" && chrome.storage?.local) {
          await chrome.storage.local.set({ [CD2_CONFIG_KEY]: cd2SessionConfig });
          stored = true;
        }
      } catch {}
    }
    return { ...cd2SessionConfig };
  }

  function cd2RequestArrayBuffer(url, headers, body) {
    if (typeof GM_xmlhttpRequest === "function") {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "POST",
          url,
          headers,
          data: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
          responseType: "arraybuffer",
          timeout: 30000,
          onload: (response) => resolve({
            status: response.status,
            body: response.response || new ArrayBuffer(0),
            responseHeaders: String(response.responseHeaders || "")
          }),
          ontimeout: () => reject(new Error("连接 CloudDrive2 超时。")),
          onerror: () => reject(new Error("无法连接 CloudDrive2，请确认服务已启动。"))
        });
      });
    }
    return fetch(url, { method: "POST", headers, body }).then(async (response) => {
      const responseHeaders = [...response.headers.entries()].map(([key, value]) => `${key}: ${value}`).join("\n");
      return { status: response.status, body: await response.arrayBuffer(), responseHeaders };
    });
  }

  function cd2ResponseHeader(headers, name) {
    const match = String(headers || "").match(new RegExp(`^${name}:\\s*(.+)$`, "im"));
    return match?.[1]?.trim() || "";
  }

  async function cd2Grpc(method, payload, config, { stream = false } = {}) {
    if (!/^https?:\/\//i.test(config.baseUrl)) throw new Error("CloudDrive2 地址必须以 http:// 或 https:// 开头。");
    if (!config.apiToken) throw new Error("请先在瀑光设置里填写 CloudDrive2 API Token。");
    const frame = new Uint8Array(payload.length + 5);
    new DataView(frame.buffer).setUint32(1, payload.length, false);
    frame.set(payload, 5);
    const headers = {
      "content-type": "application/grpc-web+proto",
      "x-grpc-web": "1",
      authorization: `Bearer ${config.apiToken}`
    };
    const response = await cd2RequestArrayBuffer(`${config.baseUrl}/${CD2_SERVICE}/${method}`, headers, frame);
    const parsed = cd2ParseFrames(response.body);
    const grpcStatus = parsed.trailers["grpc-status"] || cd2ResponseHeader(response.responseHeaders, "grpc-status");
    if (response.status < 200 || response.status >= 300 || (grpcStatus && grpcStatus !== "0")) {
      const rawMessage = parsed.trailers["grpc-message"] || cd2ResponseHeader(response.responseHeaders, "grpc-message");
      let message = rawMessage;
      try { message = decodeURIComponent(rawMessage); } catch {}
      message ||= `${method} 请求失败（HTTP ${response.status} / gRPC ${grpcStatus || "未知"}）`;
      if (grpcStatus === "16") throw new Error("CloudDrive2 API Token 无效或已过期。");
      throw new Error(message);
    }
    return stream ? parsed.messages : (parsed.messages[0] || new Uint8Array());
  }

  function parseCd2File(bytes) {
    const fields = cd2ParseProto(bytes);
    const text = (field) => fields.get(field)?.[0]?.string || "";
    const number = (field) => Number(fields.get(field)?.[0]?.varint || 0n);
    return {
      id: text(1),
      name: text(2),
      fullPathName: text(3),
      size: number(4),
      fileType: number(5),
      isDirectory: number(30) === 1 || number(5) === 0
    };
  }

  function parseCd2FileReplies(messages) {
    const files = [];
    messages.forEach((message) => {
      const fields = cd2ParseProto(message);
      (fields.get(1) || []).forEach((entry) => {
        if (entry.bytes) files.push(parseCd2File(entry.bytes));
      });
    });
    return files.filter((file) => file.fullPathName || file.name);
  }

  async function getCd2SubFiles(config, path, forceRefresh = false) {
    const payload = cd2Message([cd2StringField(1, path), forceRefresh ? cd2VarintField(2, 1) : null]);
    return parseCd2FileReplies(await cd2Grpc("GetSubFiles", payload, config, { stream: true }));
  }

  async function searchCd2Files(config, searchFor) {
    const payload = cd2Message([
      cd2StringField(1, config.cloudPath),
      cd2StringField(2, searchFor),
      cd2VarintField(4, 1)
    ]);
    return parseCd2FileReplies(await cd2Grpc("GetSearchResults", payload, config, { stream: true }));
  }

  function parseCd2FileOperation(bytes) {
    const fields = cd2ParseProto(bytes);
    return {
      success: Number(fields.get(1)?.[0]?.varint || 0n) === 1,
      error: fields.get(2)?.[0]?.string || ""
    };
  }

  function parseCd2Offline(bytes) {
    const fields = cd2ParseProto(bytes);
    const text = (field) => fields.get(field)?.[0]?.string || "";
    const number = (field) => Number(fields.get(field)?.[0]?.varint || 0n);
    return { name: text(1), size: number(2), url: text(3), status: number(4), infoHash: text(5), fileId: text(6), parentId: text(8) };
  }

  async function listCd2Offline(config) {
    const response = await cd2Grpc("ListOfflineFilesByPath", cd2StringField(1, config.cloudPath), config);
    const fields = cd2ParseProto(response);
    return (fields.get(1) || []).map((entry) => parseCd2Offline(entry.bytes)).filter(Boolean);
  }

  function downloadLinkHash(link) {
    if (/^magnet:/i.test(link)) {
      try { return new URL(link).searchParams.get("xt")?.replace(/^urn:btih:/i, "") || ""; } catch { return ""; }
    }
    return String(link).split("|")[4] || "";
  }

  function downloadLinkName(link) {
    if (/^magnet:/i.test(link)) {
      try { return new URL(link).searchParams.get("dn") || ""; } catch { return ""; }
    }
    const raw = String(link).split("|")[2] || "";
    try { return decodeURIComponent(raw); } catch { return raw; }
  }

  async function ensureCd2Folder(config) {
    const parts = config.cloudPath.split("/").filter(Boolean);
    if (parts.length < 2) return;
    let parent = `/${parts[0]}`;
    for (let index = 1; index < parts.length; index += 1) {
      const name = parts[index];
      try {
        await cd2Grpc("FindFileByPath", cd2Message([cd2StringField(1, parent), cd2StringField(2, name)]), config);
      } catch (error) {
        if (/token|鉴权|连接|超时/i.test(String(error?.message || error))) throw error;
        const result = await cd2Grpc("CreateFolder", cd2Message([cd2StringField(1, parent), cd2StringField(2, name)]), config);
        const outer = cd2ParseProto(result);
        const operation = outer.get(2)?.[0]?.bytes ? parseCd2FileOperation(outer.get(2)[0].bytes) : { success: true };
        if (!operation.success && !/exist|存在/i.test(operation.error)) throw new Error(operation.error || `无法创建 ${parent}/${name}`);
      }
      parent = `${parent}/${name}`;
    }
  }

  async function addCd2Offline(config, link) {
    const response = await cd2Grpc("AddOfflineFiles", cd2Message([
      cd2StringField(1, link),
      cd2StringField(2, config.cloudPath),
      cd2VarintField(3, 5)
    ]), config);
    const result = parseCd2FileOperation(response);
    if (!result.success && !/exist|duplicate|重复|已添加/i.test(result.error)) throw new Error(result.error || "CloudDrive2 添加离线任务失败。");
    return result;
  }

  function normalizeSearchText(value) {
    return String(value || "").toLowerCase().replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[^a-z0-9\u3400-\u9fff]+/g, "");
  }

  function videoFileScore(file, expectedName) {
    if (file.isDirectory || !/\.(?:mp4|mkv|webm|mov|m4v|avi|wmv|flv|ts|m2ts)$/i.test(file.name || file.fullPathName)) return -1;
    const expected = normalizeSearchText(expectedName);
    const actual = normalizeSearchText(file.name || file.fullPathName);
    const nameBonus = expected && (actual.includes(expected) || expected.includes(actual)) ? 1e15 : 0;
    return nameBonus + Math.max(0, Number(file.size) || 0);
  }

  async function expandCd2Directories(config, files, expectedName) {
    const output = [...files];
    const queue = files.filter((file) => file.isDirectory && file.fullPathName).slice(0, 12).map((file) => ({ path: file.fullPathName, depth: 0 }));
    const seen = new Set(queue.map((item) => item.path));
    while (queue.length && seen.size <= 80) {
      const current = queue.shift();
      let children = [];
      try { children = await getCd2SubFiles(config, current.path, false); } catch { continue; }
      output.push(...children);
      if (current.depth >= 4) continue;
      children.filter((file) => file.isDirectory && file.fullPathName).forEach((file) => {
        if (seen.has(file.fullPathName)) return;
        seen.add(file.fullPathName);
        queue.push({ path: file.fullPathName, depth: current.depth + 1 });
      });
      if (output.some((file) => videoFileScore(file, expectedName) >= 1e15)) break;
    }
    return output;
  }

  async function findCd2Playable(config, names) {
    const terms = [];
    names.filter(Boolean).forEach((name) => {
      const clean = String(name).replace(/\.[a-z0-9]{2,5}$/i, "").trim();
      const code = clean.match(/[a-z]{2,10}[-_ ]?\d{2,6}/i)?.[0];
      [code, clean.slice(0, 80)].filter((item) => item && item.length >= 3).forEach((item) => {
        if (!terms.includes(item)) terms.push(item);
      });
    });
    let candidates = [];
    for (const term of terms.slice(0, 4)) {
      try { candidates.push(...await searchCd2Files(config, term)); } catch {}
      if (candidates.some((file) => videoFileScore(file, names[0]) >= 0)) break;
    }
    if (!candidates.length) {
      try {
        const top = await getCd2SubFiles(config, config.cloudPath, true);
        const expected = names.map(normalizeSearchText).filter(Boolean);
        candidates = top.filter((file) => {
          const actual = normalizeSearchText(file.name);
          return expected.some((value) => actual.includes(value) || value.includes(actual));
        });
      } catch {}
    }
    candidates = await expandCd2Directories(config, candidates, names[0]);
    const videos = candidates.filter((file) => videoFileScore(file, names[0]) >= 0);
    return videos.sort((a, b) => videoFileScore(b, names[0]) - videoFileScore(a, names[0]))[0] || null;
  }

  async function getCd2PlaybackUrl(config, file) {
    const response = await cd2Grpc("GetDownloadUrlPath", cd2Message([
      cd2StringField(1, file.fullPathName),
      cd2VarintField(2, 1),
      cd2VarintField(3, 1)
    ]), config);
    const fields = cd2ParseProto(response);
    const directUrl = fields.get(3)?.[0]?.string || "";
    if (/^https?:\/\//i.test(directUrl)) return directUrl;
    const template = fields.get(1)?.[0]?.string || "";
    const base = new URL(config.baseUrl);
    if (template) {
      const path = template
        .replaceAll("{SCHEME}", base.protocol.replace(":", ""))
        .replaceAll("{HOST}", base.host)
        .replaceAll("{PREVIEW}", "true");
      return new URL(path, base.origin).href;
    }
    const encoded = encodeURIComponent(file.fullPathName.replace(/^\/+/, ""));
    return `${base.origin}/static/${base.protocol.replace(":", "")}/${base.host}/true/${encoded}`;
  }

  function getCd2LocalFilePath(config, file) {
    const remote = String(file?.fullPathName || "").replace(/\\/g, "/");
    const root = String(config.cloudPath || "").replace(/\\/g, "/").replace(/\/+$/, "");
    if (!remote || !root || !remote.toLowerCase().startsWith(`${root.toLowerCase()}/`)) {
      throw new Error("视频不在当前 115 转存目录下，无法映射本地文件。");
    }
    const relative = remote.slice(root.length).replace(/^\/+/, "").replace(/\//g, "\\");
    if (!config.localMountPath) throw new Error("请先在设置中填写 CloudDrive2 本地挂载目录。");
    return `${config.localMountPath}\\${relative}`;
  }

  function localFileUrl(path) {
    const normalized = String(path || "").replace(/\\/g, "/");
    const encoded = normalized.split("/").map((part, index) => index === 0 ? part : encodeURIComponent(part)).join("/");
    return `file:///${encoded}`;
  }

  async function resolveCd2PlaybackTarget(config, file) {
    if (config.playMode === "local") {
      const path = getCd2LocalFilePath(config, file);
      return { mode: "local", url: localFileUrl(path), path };
    }
    return { mode: "stream", url: await getCd2PlaybackUrl(config, file), path: file.fullPathName };
  }

  async function testCd2Direct(config = null) {
    const active = normalizeCd2Config(config || await readCd2Config());
    const files = await getCd2SubFiles(active, active.cloudPath, false);
    return { ok: true, count: files.length, config: active };
  }

  async function saveCd2Links(links, onProgress) {
    const config = await readCd2Config();
    await ensureCd2Folder(config);
    let successCount = 0;
    const results = [];
    for (let index = 0; index < links.length; index += 1) {
      onProgress?.(`正在提交 ${index + 1}/${links.length} 到 115…`);
      try {
        await addCd2Offline(config, links[index]);
        successCount += 1;
        results.push({ ok: true, link: links[index] });
      } catch (error) {
        results.push({ ok: false, link: links[index], error: String(error?.message || error) });
      }
    }
    if (!successCount) throw new Error(results[0]?.error || "没有任务提交成功。");
    return { ok: true, successCount, results };
  }

  async function playCd2Link(link, onProgress) {
    const config = await readCd2Config();
    await ensureCd2Folder(config);
    const hash = downloadLinkHash(link).toLowerCase();
    const linkName = downloadLinkName(link);
    onProgress?.("正在查找已有视频…");
    const cachedFile = await findCd2Playable(config, [linkName]);
    if (cachedFile) {
      return { ok: true, file: cachedFile, ...(await resolveCd2PlaybackTarget(config, cachedFile)) };
    }
    let offline = null;
    try {
      offline = (await listCd2Offline(config)).find((item) => hash && item.infoHash.toLowerCase() === hash) || null;
    } catch {}
    if (!offline) await addCd2Offline(config, link);
    // New offline tasks cannot be played before 115 exposes the resulting
    // file. Keep this internal; users only choose the playback target.
    const deadline = Date.now() + 30 * 60000;
    let lastSearch = 0;
    while (Date.now() < deadline) {
      let list = [];
      try { list = await listCd2Offline(config); } catch {}
      offline = list.find((item) => (hash && item.infoHash.toLowerCase() === hash) || item.url === link) || offline;
      if (offline?.status === 3) throw new Error(`115 离线任务失败：${offline.name || linkName || "未知任务"}`);
      const finished = offline?.status === 2;
      onProgress?.(finished ? "转存完成，正在定位视频文件…" : `115 正在离线下载${offline?.name ? `：${offline.name}` : "…"}`);
      if ((finished || !offline) && Date.now() - lastSearch > 4500) {
        lastSearch = Date.now();
        const file = await findCd2Playable(config, [offline?.name, linkName]);
        if (file) return { ok: true, file, ...(await resolveCd2PlaybackTarget(config, file)) };
      }
      await new Promise((resolve) => window.setTimeout(resolve, 2500));
    }
    throw new Error("115 尚未生成可播放文件，离线任务仍会继续执行。");
  }

  async function probeCd2Bridge() {
    const config = await readCd2Config();
    if (!config.apiToken) {
      setCd2BridgeStatus("CloudDrive2 直连：未配置 API Token · 请到瀑光设置中填写", "error");
      return { ok: false };
    }
    setCd2BridgeStatus("CloudDrive2 直连：检测中…");
    try {
      const response = await testCd2Direct(config);
      setCd2BridgeStatus(`CloudDrive2 已直连 · 目标 ${config.cloudPath} · ${response.count} 项`, "ready");
      return response;
    } catch (error) {
      setCd2BridgeStatus(String(error?.message || error), "error");
      return { ok: false, error: String(error?.message || error) };
    }
  }

  function prepareCd2PlaybackWindow() {
    const popup = window.open("about:blank", "_blank");
    if (!popup) return null;
    try {
      popup.document.title = "瀑光 · 正在打开";
      popup.document.body.innerHTML = '<main style="min-height:100vh;display:grid;place-items:center;background:#101114;color:#f5f5f4;font:700 16px/1.6 system-ui"><div><b style="display:block;font-size:22px">正在打开视频</b><span style="color:#a1a1aa">优先查找已有文件，新任务准备好后自动继续</span></div></main>';
    } catch {}
    return popup;
  }

  async function runCd2Action(action, links, button = null) {
    const clean = (links || []).filter((url) => /^(?:magnet:\?|ed2k:\/\/)/i.test(String(url || "")));
    if (!clean.length) return;
    const original = button?.textContent || "";
    const playbackWindow = action === "play-browser" ? prepareCd2PlaybackWindow() : null;
    if (button) {
      button.disabled = true;
      button.textContent = action === "play-browser" ? "启动中" : "保存中";
    }
    let response = null;
    try {
      if (action === "play-browser") {
        response = await playCd2Link(clean[0], (text) => setCd2BridgeStatus(text));
        if (response.mode === "local" && playbackWindow && !playbackWindow.closed) playbackWindow.close();
        if (response.mode !== "local" && playbackWindow && !playbackWindow.closed) playbackWindow.location.replace(response.url);
        else if (typeof GM_openInTab === "function") GM_openInTab(response.url, { active: true, insert: true });
        else window.open(response.url, "_blank", "noopener");
        setCd2BridgeStatus(`已打开${response.mode === "local" ? "本地文件" : "流媒体"}：${response.file.name}`, "ready");
        updateStatus(response.mode === "local" ? "已请求打开本地挂载文件" : "已打开 CloudDrive2 流媒体");
      } else {
        response = await saveCd2Links(clean, (text) => setCd2BridgeStatus(text));
        const successCount = Number(response.successCount || 0);
        setCd2BridgeStatus(`已提交 ${successCount}/${clean.length} 条到 ${cd2SessionConfig.cloudPath}`, "ready");
        updateStatus(`已提交 ${successCount} 条到 115`);
      }
    } catch (error) {
      const message = String(error?.message || error || "提交失败");
      response = { ok: false, error: message };
      if (playbackWindow && !playbackWindow.closed) playbackWindow.close();
      setCd2BridgeStatus(message, "error");
      updateStatus(message);
    }
    if (button) {
      button.disabled = false;
      button.textContent = response?.ok ? "已完成" : "重试";
      window.setTimeout(() => { if (button.isConnected) button.textContent = original; }, 1400);
    }
  }

  function collectPageDownloadLinks() {
    const found = new Map();
    const remember = (raw) => {
      const url = decodeCapturedLink(raw).replace(/[\u200b\u200c\u200d]/g, "");
      if (!/^(?:magnet:\?|ed2k:\/\/)/i.test(url)) return;
      const type = /^magnet:/i.test(url) ? "MAGNET" : "ED2K";
      const key = url.toLowerCase();
      if (!found.has(key)) found.set(key, { type, url });
    };

    document.querySelectorAll("a[href], [data-url], [data-href], [data-link]").forEach((node) => {
      ["href", "data-url", "data-href", "data-link"].forEach((attr) => remember(node.getAttribute?.(attr) || ""));
    });

    const source = `${document.documentElement?.innerHTML || ""}\n${document.body?.innerText || ""}`.slice(0, 12 * 1024 * 1024);
    for (const match of source.matchAll(/magnet:\?[^"'<>\\\s]+/gi)) remember(match[0]);
    for (const match of source.matchAll(/ed2k:\/\/\|(?:file|server)\|[^"'<>\\\s]+/gi)) remember(match[0]);
    return [...found.values()].slice(0, 1000);
  }

  async function copyCapturedText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;";
      document.documentElement.appendChild(textarea);
      textarea.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch {}
      textarea.remove();
      return ok;
    }
  }

  function renderLinkGrabberPanel() {
    const panel = state.linkGrabberPanel;
    if (!panel) return;
    const list = panel.querySelector(".xiv-link-list");
    const count = panel.querySelector(".xiv-link-count");
    if (!list || !count) return;
    const items = state.grabbedDownloadLinks;
    const magnets = items.filter((item) => item.type === "MAGNET").length;
    const ed2k = items.length - magnets;
    count.textContent = `${magnets} 磁力 · ${ed2k} ED2K`;
    list.replaceChildren();
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "xiv-queue-empty";
      empty.textContent = "当前页面没有识别到 magnet 或 ed2k 链接。";
      list.appendChild(empty);
      return;
    }
    items.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "xiv-link-row";
      const type = document.createElement("span");
      type.className = "xiv-link-type";
      type.textContent = item.type;
      const copy = document.createElement("span");
      copy.className = "xiv-link-copy-text";
      const name = document.createElement("span");
      name.className = "xiv-link-name";
      name.textContent = capturedLinkName(item);
      const value = document.createElement("span");
      value.className = "xiv-link-value";
      value.textContent = item.url;
      copy.append(name, value);
      const actions = document.createElement("span");
      actions.className = "xiv-link-row-actions";
      actions.innerHTML = `<button type="button" data-link-row-action="play" data-link-index="${index}">播放</button><button type="button" data-link-row-action="save" data-link-index="${index}">存115</button><button type="button" data-link-row-action="copy" data-link-index="${index}">复制</button>`;
      row.append(type, copy, actions);
      list.appendChild(row);
    });
  }

  function scanPageDownloadLinks() {
    state.grabbedDownloadLinks = collectPageDownloadLinks();
    renderLinkGrabberPanel();
    updateStatus(state.grabbedDownloadLinks.length
      ? `找到 ${state.grabbedDownloadLinks.length} 条下载链接`
      : "未找到磁力或 ED2K 链接");
  }

  function toggleLinkGrabberPanel() {
    if (!state.linkGrabberPanel) return;
    const open = state.linkGrabberPanel.dataset.open === "true";
    if (open) {
      state.linkGrabberPanel.dataset.open = "false";
      return;
    }
    closePanels("link-grabber");
    scanPageDownloadLinks();
    state.linkGrabberPanel.dataset.open = "true";
    void probeCd2Bridge();
  }

  function fetchSameOriginDocumentViaFrame(targetUrl, timeoutMs = 18000, signal = null) {
    return new Promise((resolve, reject) => {
      let done = false;
      const frame = document.createElement("iframe");
      frame.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;";

      function finish(error, doc = null) {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        signal?.removeEventListener("abort", onAbort);
        try { frame.remove(); } catch {}
        if (error) reject(error);
        else resolve(doc);
      }

      const timeout = window.setTimeout(() => finish(new Error("frame timeout")), timeoutMs);
      const onAbort = () => finish(new DOMException("Collection changed", "AbortError"));
      if (signal?.aborted) { onAbort(); return; }
      signal?.addEventListener("abort", onAbort, { once: true });
      frame.addEventListener("load", () => {
        window.setTimeout(() => {
          try {
            const doc = frame.contentDocument;
            if (!doc?.documentElement || !doc.body) {
              finish(new Error("frame returned an empty document"));
              return;
            }
            finish(null, doc);
          } catch (error) {
            finish(error);
          }
        }, 280);
      }, { once: true });
      frame.addEventListener("error", () => finish(new Error("frame failed")), { once: true });
      frame.src = targetUrl;
      document.documentElement.appendChild(frame);
    });
  }

  async function loadGalleryQueueTargetInPlace(target) {
    const targetUrl = normalizedPageUrl(target);
    if (!targetUrl || !isQueueCandidateUrl(targetUrl)) return false;
    try {
      const parsed = new URL(targetUrl, location.href);
      if (parsed.origin !== location.origin) return false;
    } catch {
      return false;
    }

    if (isSelfieGalleryQueueUrl(targetUrl)) {
      return loadSelfieGalleryQueueTargetInPlace(targetUrl);
    }

    const navigation = ++state.navigationGeneration;
    const isCurrent = () => state.active && navigation === state.navigationGeneration;
    const virtualSelfieNavigation = false;
    const previousQueueUrl = state.galleryQueueCurrentUrl;
    const genericTarget = GENERIC_X810114_RE.test(targetUrl);
    let targetDoc = null;
    let queueDoc = null;
    if (!genericTarget) {
      let html = "";
      try {
        html = await fetchHtml(targetUrl, previousQueueUrl || location.href);
        targetDoc = new DOMParser().parseFromString(html, "text/html");
      } catch {
        if (!isCurrent()) return false;
        if (!isKnownGalleryUrl(targetUrl)) return false;
        try {
          targetDoc = await fetchSameOriginDocumentViaFrame(targetUrl);
        } catch {
          return false;
        }
      }
      if (!targetDoc?.documentElement) return false;
      targetDoc.documentElement.dataset.xivBase = targetUrl;
      queueDoc = targetDoc;
    } else {
      try {
        const html = await fetchHtml(targetUrl, previousQueueUrl || location.href);
        queueDoc = new DOMParser().parseFromString(html, "text/html");
        queueDoc.documentElement.dataset.xivBase = targetUrl;
      } catch {
        queueDoc = null;
      }
    }
    if (!isCurrent()) return false;
    updateStatus("正在加载下一组");
    saveViewerPosition();
    closeLightbox(false);
    stopGenericObserver();
    resetCollection();
    if (virtualSelfieNavigation) {
      // Android Chromium exits Fullscreen when 自拍图库 changes history. Keep the
      // browser URL stable and switch the collected document in place instead.
      state.galleryQueueCurrentUrl = targetUrl;
    } else {
      try {
        history.pushState({ flowlensGalleryQueue: true }, "", targetUrl);
      } catch {
        return false;
      }
      state.galleryQueueCurrentUrl = targetUrl;
    }
    state.active = true;
    state.root.dataset.active = "true";
    state.root.dataset.theme = state.theme;
    document.documentElement.classList.add("xiv-active");
    state.suppressLightboxUntil = Date.now() + 600;
    state.fetchedPages.add(targetUrl);
    state.pageUrls.add(targetUrl);
    state.galleryQueueCurrentTitle = targetDoc ? pageTitleFromDocument(targetDoc, targetUrl) : "";

    if (genericTarget) {
      await prepareGenericX810114Page();
      if (!isCurrent()) return false;
      if (!state.x810114ApiMode) startGenericObserver();
    } else {
      collectFromDocument(targetDoc, targetUrl);
      if (isPhotoGalleryPage(targetUrl)) {
        discoverNearbyPages();
        fetchRemainingPages(galleryFetchLimit());
      } else if (!virtualSelfieNavigation && !isPornpicsGalleryPage(targetUrl)) {
        startGenericObserver();
      }
    }

    refreshGalleryQueue(queueDoc || targetDoc || document, targetUrl);
    renderImages();
    applyMediaFilter();
    updateCounter();
    updateStatus(`已切换到${state.galleryQueueIndex >= 0 ? `第 ${state.galleryQueueIndex + 1} 组` : "新套图"}`);
    window.dispatchEvent(new CustomEvent("flowlens:page-url-changed", { detail: { url: state.galleryQueueCurrentUrl } }));
    if (state.stage) state.stage.scrollTo({ top: 0, behavior: "auto" });
    return state.images.length > 0;
  }

  // Loads a saved page without navigating the browser. This is deliberately
  // separate from gallery-queue navigation: saved pages may belong to another
  // origin, and pushState cannot change origins while the viewer is open.
  async function loadSavedPageInPlace(target) {
    const targetUrl = normalizedPageUrl(target);
    if (!targetUrl || !HTTP_PAGE_RE.test(targetUrl)) return false;

    const navigation = ++state.navigationGeneration;
    const isCurrent = () => state.active && navigation === state.navigationGeneration;
    let html = "";
    let doc = null;
    try {
      updateStatus("正在读取收藏页面");
      html = await fetchHtml(targetUrl, state.galleryQueueCurrentUrl || location.href);
      doc = new DOMParser().parseFromString(html, "text/html");
    } catch {
      if (!isCurrent()) return false;
      if (isXchinaPhotoUrl(targetUrl)) {
        try {
          doc = await fetchSameOriginDocumentViaFrame(targetUrl);
        } catch {}
      }
      if (!isCurrent()) return false;
      if (!doc) {
      updateStatus("收藏页面读取失败，已保留当前图片流");
      return false;
      }
    }

    if (!isCurrent()) return false;
    if (!doc?.documentElement) {
      updateStatus("收藏页面无法解析，已保留当前图片流");
      return false;
    }

    const previousUrl = state.galleryQueueCurrentUrl || location.href;
    saveViewerPosition();
    closeLightbox(false);
    stopGenericObserver();
    resetCollection();
    state.galleryQueueCurrentUrl = targetUrl;
    state.active = true;
    state.root.dataset.active = "true";
    state.root.dataset.theme = state.theme;
    document.documentElement.classList.add("xiv-active");
    state.suppressLightboxUntil = Date.now() + 600;
    state.fetchedPages.add(targetUrl);
    state.pageUrls.add(targetUrl);
    state.galleryQueueCurrentTitle = pageTitleFromDocument(doc, targetUrl);
    doc.documentElement.dataset.xivBase = targetUrl;
    collectFromDocument(doc, targetUrl);
    refreshGalleryQueue(doc, targetUrl);

    if (!state.images.length) {
      resetCollection();
      state.galleryQueueCurrentUrl = previousUrl;
      collectFromDocument(document, location.href);
      refreshGalleryQueue(document, location.href);
      renderImages();
      applyMediaFilter();
      updateCounter();
      updateStatus("收藏页面没有可用媒体，已保留当前图片流");
      return false;
    }

    renderImages();
    applyMediaFilter();
    updateCounter();
    updateStatus(`已打开收藏页面，共 ${state.images.length} 项`);
    window.dispatchEvent(new CustomEvent("flowlens:page-url-changed", { detail: { url: state.galleryQueueCurrentUrl } }));
    state.stage?.scrollTo({ top: 0, behavior: "auto" });
    return true;
  }

  async function loadSelfieGalleryQueueTargetInPlace(targetUrl) {
    const navigation = ++state.navigationGeneration;
    const isCurrent = () => state.active && navigation === state.navigationGeneration;
    const previousQueueUrl = state.galleryQueueCurrentUrl || location.href;
    let doc = null;
    try {
      doc = await fetchSelfieGalleryDocument(targetUrl, previousQueueUrl);
    } catch {
      if (!isCurrent()) return false;
      updateStatus("下一组加载失败，已保留当前全屏");
      return false;
    }

    if (!isCurrent()) return false;
    doc.documentElement.dataset.xivBase = targetUrl;
    updateStatus("正在切换下一组");
    saveViewerPosition();
    closeLightbox(false);
    stopGenericObserver();
    resetCollection();
    state.galleryQueueCurrentUrl = targetUrl;
    state.active = true;
    state.root.dataset.active = "true";
    state.root.dataset.theme = state.theme;
    document.documentElement.classList.add("xiv-active");
    state.suppressLightboxUntil = Date.now() + 600;
    state.fetchedPages.add(targetUrl);
    state.pageUrls.add(targetUrl);
    state.galleryQueueCurrentTitle = pageTitleFromDocument(doc, targetUrl);
    collectFromDocument(doc, targetUrl);
    refreshGalleryQueue(doc, targetUrl);

    if (!state.images.length) {
      // Do not navigate the browser as a fallback: that would force Android to
      // leave Fullscreen. Restore the current document instead.
      state.galleryQueueCurrentUrl = previousQueueUrl;
      collectFromDocument(document, location.href);
      refreshGalleryQueue(document, location.href);
      renderImages();
      applyMediaFilter();
      updateCounter();
      updateStatus("下一组没有可用图片，已保留当前全屏");
      return false;
    }

    renderImages();
    applyMediaFilter();
    updateCounter();
    updateStatus(`已切换到${state.galleryQueueIndex >= 0 ? `第 ${state.galleryQueueIndex + 1} 组` : "新套图"}`);
    window.dispatchEvent(new CustomEvent("flowlens:page-url-changed", { detail: { url: state.galleryQueueCurrentUrl } }));
    if (state.stage) state.stage.scrollTo({ top: 0, behavior: "auto" });
    return true;
  }

  function isSelfieGalleryDocument(doc) {
    const text = (doc?.body?.innerText || doc?.body?.textContent || "").replace(/\s+/g, " ");
    const images = doc?.querySelectorAll?.("#imgviewer img, .imgviewer img, img")?.length || 0;
    return images > 0 && /(?:上一组|下一组)/.test(text);
  }

  async function fetchSelfieGalleryDocument(targetUrl, referrer) {
    // Some 自拍图库 routes return the home page to fetch/XHR. Prefer it when it
    // is a genuine detail document, then retry as a same-origin frame so the
    // request has browser-navigation semantics without changing the top page.
    try {
      const html = await fetchHtml(targetUrl, referrer);
      const doc = new DOMParser().parseFromString(html, "text/html");
      if (isSelfieGalleryDocument(doc)) return doc;
    } catch {
      // Continue with the Tampermonkey request and frame fallbacks.
    }

    try {
      const response = await fetchTextViaBackground(targetUrl, referrer);
      if (response?.ok) {
        const doc = new DOMParser().parseFromString(response.text || "", "text/html");
        if (isSelfieGalleryDocument(doc)) return doc;
      }
    } catch {
      // The frame attempt below is the navigation-context fallback.
    }

    return new Promise((resolve, reject) => {
      const frame = document.createElement("iframe");
      const timeout = window.setTimeout(() => finish(new Error("selfie gallery frame timeout")), 18000);
      let settled = false;
      function finish(error, doc = null) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        frame.remove();
        if (error) reject(error);
        else resolve(doc);
      }
      frame.setAttribute("aria-hidden", "true");
      frame.tabIndex = -1;
      frame.style.cssText = "position:fixed!important;width:1px!important;height:1px!important;left:-9999px!important;top:-9999px!important;opacity:0!important;pointer-events:none!important;border:0!important;";
      frame.addEventListener("load", () => {
        try {
          const frameDoc = frame.contentDocument;
          if (!isSelfieGalleryDocument(frameDoc)) {
            finish(new Error("selfie gallery frame returned a non-detail page"));
            return;
          }
          const copy = new DOMParser().parseFromString(frameDoc.documentElement.outerHTML, "text/html");
          finish(null, copy);
        } catch (error) {
          finish(error);
        }
      }, { once: true });
      frame.addEventListener("error", () => finish(new Error("selfie gallery frame failed")), { once: true });
      frame.src = targetUrl;
      document.documentElement.appendChild(frame);
    });
  }

  async function navigateGalleryQueue(delta) {
    refreshGalleryQueue();
    rebuildGalleryQueueFromVisiblePage();
    const target = x810114QueueTarget(delta) || galleryQueueTarget(delta);
    if (!target) {
      updateStatus("没有可切换的套图");
      return;
    }
    rememberX810114QueueVisit(target);
    const selfieTarget = isSelfieGalleryQueueUrl(target);
    if (!selfieTarget) {
      try {
        sessionStorage.setItem(galleryQueueAutoOpenKey(), target);
      } catch {
        // Auto-open is best-effort.
      }
    }
    if (state.settings?.autoFullscreen !== false && !document.fullscreenElement) {
      try {
        await state.root?.requestFullscreen?.();
      } catch {
        // Fullscreen must be requested from the user gesture; if blocked, auto-open still works.
      }
    }
    try {
      if (await loadGalleryQueueTargetInPlace(target)) return;
    } catch {
      // Fall back to page navigation when in-place loading is blocked.
    }
    if (selfieTarget) return;
    updateStatus(delta > 0 ? "打开下一组" : "打开上一组");
    if (samePageUrl(target, location.href)) location.reload();
    else location.href = target;
  }

  function maybeAutoOpenFromGalleryQueue() {
    let target = "";
    try {
      target = sessionStorage.getItem(galleryQueueAutoOpenKey()) || "";
      if (target && samePageUrl(target, location.href)) sessionStorage.removeItem(galleryQueueAutoOpenKey());
    } catch {
      return;
    }
    if (!target || !samePageUrl(target, location.href)) return;
    window.setTimeout(() => {
      refreshGalleryQueue();
      openViewer();
    }, 650);
  }

  function unescapeEmbeddedUrl(value) {
    return String(value || "")
      .replaceAll("\\/", "/")
      .replace(/\\u002f/gi, "/")
      .replaceAll("&amp;", "&")
      .replaceAll("\\u0026", "&")
      .replaceAll("\\x26", "&");
  }

  function detailUrlFromText(text, base = location.href) {
    const normalized = unescapeEmbeddedUrl(text);
    const match = normalized.match(/(?:https?:\/\/[^"'<>\\\s)]+)?\/?photoShow\.html\?id=[^"'<>\\\s)]+|(?:https?:\/\/[^"'<>\\\s)]+)?\/photo\/id-[^"'<>\\\s)]+\.html/i);
    if (!match) return "";
    const url = absoluteUrl(match[0], base);
    return isDetailPhotoPage(url) ? url : "";
  }

  function photoShowUrlFromText(text, base = location.href) {
    const normalized = unescapeEmbeddedUrl(text);
    const match = normalized.match(/(?:https?:\/\/[^"'<>\\\s)]+)?\/?photoShow\.html\?id=[^"'<>\\\s)]+/i);
    if (!match) return "";
    const url = absoluteUrl(match[0], base);
    return isPhotoShowPage(url) ? url : "";
  }

  function detailUrlFromElement(el, base = location.href) {
    if (!el?.getAttribute) return "";
    const attrs = [
      "href",
      "src",
      "data-href",
      "data-url",
      "data-link",
      "data-target",
      "data-src",
      "data-original",
      "onclick"
    ];
    for (const attr of attrs) {
      const url = detailUrlFromText(el.getAttribute(attr), base);
      if (url) return url;
    }
    return "";
  }

  function imageCandidateFromImg(img, base) {
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
      const raw = attr === "currentSrc" ? img.currentSrc : img.getAttribute(attr);
      const url = absoluteUrl(raw, base);
      if (url) return url;
    }
    const srcset = img.getAttribute("srcset") || img.getAttribute("data-srcset");
    if (srcset) {
      const last = srcset.split(",").map((item) => item.trim().split(/\s+/)[0]).filter(Boolean).pop();
      return absoluteUrl(last, base);
    }
    return "";
  }

  function mediaCandidateFromVideo(video, base) {
    const attrs = ["currentSrc", "src", "data-src", "data-url"];
    for (const attr of attrs) {
      const raw = attr === "currentSrc" ? video.currentSrc : video.getAttribute(attr);
      const url = absoluteUrl(raw, base);
      if (url) return url;
    }
    const source = video.querySelector?.("source[src]") || video;
    const sourceUrl = absoluteUrl(source?.getAttribute?.("src"), base);
    if (sourceUrl) return sourceUrl;
    return absoluteUrl(video.getAttribute?.("poster"), base);
  }

  function isVideoUrl(url) {
    return VIDEO_EXT.test(url);
  }

  function isGifUrl(url) {
    return /\.gif(?:[?#]|$)/i.test(url) || /[?&]format=gif\b/i.test(url);
  }

  function isDiscuzAttachmentUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      return /forum\.php$/i.test(parsed.pathname) && parsed.searchParams.get("mod") === "attachment";
    } catch {
      return false;
    }
  }

  function isMediaUrl(url) {
    return MEDIA_EXT.test(url) || isDiscuzAttachmentUrl(url);
  }

  function isFavoriteImageUrl(url) {
    if (!url || isVideoUrl(url) || isDetailPhotoPage(url)) return false;
    if (!isMediaUrl(url) || !IMAGE_EXT.test(url)) return false;
    try {
      const parsed = new URL(url, location.href);
      if (/\.html?$/i.test(parsed.pathname)) return false;
      return true;
    } catch {
      return false;
    }
  }

  function isMobilePointerEvent(event = null) {
    if (event?.pointerType && event.pointerType !== "mouse") return true;
    try {
      return window.matchMedia?.("(pointer: coarse)")?.matches || Math.min(window.innerWidth, window.innerHeight) <= 820;
    } catch {
      return Math.min(window.innerWidth, window.innerHeight) <= 820;
    }
  }

  function isFavoriteMediaUrl(url) {
    return isVideoUrl(url) || isFavoriteImageUrl(url);
  }

  function isSiteAlbumImageUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      return /(^|\.)img\.xchina\.io$/i.test(parsed.hostname) && isFavoriteImageUrl(parsed.href);
    } catch {
      return false;
    }
  }

  function closestText(node) {
    let current = node;
    let text = "";
    for (let depth = 0; current && depth < 8; depth += 1) {
      text = `${text} ${current.textContent || ""}`;
      current = current.parentElement;
    }
    return text.slice(0, 800);
  }

  function closestHref(node, base = location.href) {
    const directLink = node.closest?.("a[href]");
    const directHref = directLink?.getAttribute?.("href");
    if (directHref && isDetailPhotoPage(absoluteUrl(directHref, base))) return directHref;
    const directDetail = detailUrlFromElement(directLink, base) || detailUrlFromElement(node, base);
    if (directDetail) return directDetail;

    let current = node;
    for (let depth = 0; current && depth < 8; depth += 1) {
      const embeddedDetail = detailUrlFromElement(current, base);
      if (embeddedDetail) return embeddedDetail;
      const links = current.matches?.("a[href]")
        ? [current]
        : Array.from(current.querySelectorAll?.("a[href]") || []);
      const detail = links.find((link) => detailUrlFromElement(link, base) || isDetailPhotoPage(absoluteUrl(link.getAttribute("href"), base)));
      if (detail) return detailUrlFromElement(detail, base) || detail.getAttribute("href");
      const href = links[0]?.getAttribute?.("href");
      if (href) return href;
      current = current.parentElement;
    }
    return "";
  }

  function displayedLargeEnough(node) {
    if (!node || node.ownerDocument !== document) return null;
    const rect = node.getBoundingClientRect();
    const width = Math.max(rect.width, node.clientWidth || 0);
    const height = Math.max(rect.height, node.clientHeight || 0);
    if (!width || !height) return null;
    return width >= 180 && height >= 180;
  }

  function hasGalleryContext(url, node) {
    const text = closestText(node);
    const href = closestHref(node);
    return GALLERY_TEXT_RE.test(text) || /\/photo(?:Show)?/i.test(href) || /\/photo(?:Show)?/i.test(url);
  }

  function isX810114Avatar(url, node) {
    if (!isGenericX810114Page()) return false;
    if (AVATAR_URL_RE.test(url)) return true;
    const marker = [
      node?.className,
      node?.parentElement?.className,
      node?.closest?.("[class*='avatar' i], [class*='user' i], [class*='profile' i]")?.className
    ].join(" ");
    if (/(avatar|profile|user)/i.test(marker)) return true;
    const rect = node?.getBoundingClientRect?.();
    const text = node ? closestText(node) : "";
    return !!(rect && rect.width <= 150 && rect.height <= 150 && /@\w{2,}/.test(text));
  }

  function isJavbusPage(url = location.href) {
    try {
      const parsed = new URL(url, location.href);
      return /(^|\.)javbus\.(com|org)$/i.test(parsed.hostname);
    } catch {
      return false;
    }
  }

  function isAdMediaUrl(url) {
    if (!url) return false;
    try {
      const parsed = new URL(url, location.href);
      const haystack = `${parsed.hostname}${parsed.pathname}${parsed.search}`;
      if (AD_HOST_RE.test(parsed.hostname) || AD_PATH_RE.test(haystack)) return true;
      if (isJavbusPage() && /(?:kaiyun|kyty|odds?|worldcup|fifa|casino|bet|sport|sports|promo|cdn.*banner)/i.test(haystack)) return true;
      if (PROMO_LINK_RE.test(haystack)) return true;
    } catch {
      return AD_PATH_RE.test(url);
    }
    return false;
  }

  function hasExternalPromoLink(node) {
    const link = node?.closest?.("a[href]");
    if (!link) return false;
    const raw = link.getAttribute("href") || "";
    const text = `${raw} ${link.getAttribute("title") || ""} ${link.getAttribute("aria-label") || ""} ${link.textContent || ""}`;
    if (BLOCKED_PROMO_TEXT_RE.test(text) || PROMO_LINK_RE.test(text)) return true;
    try {
      const href = new URL(raw, location.href);
      if (href.origin !== location.origin && !isMediaUrl(href.href) && !isDetailPhotoPage(href.href) && !sameGalleryPage(href.href)) {
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }

  function hasAdContainer(node) {
    if (!node) return false;
    let current = node;
    for (let depth = 0; current && depth < 7; depth += 1) {
      const marker = [
        current.id,
        typeof current.className === "string" ? current.className : "",
        current.getAttribute?.("role"),
        current.getAttribute?.("aria-label"),
        current.getAttribute?.("href"),
        current.getAttribute?.("src"),
        current.getAttribute?.("data-src"),
        current.getAttribute?.("data-url"),
        current.getAttribute?.("alt"),
        current.getAttribute?.("title"),
        current.getAttribute?.("data-ad"),
        current.getAttribute?.("data-ad-slot"),
        current.getAttribute?.("data-google-query-id")
      ].join(" ");
      const text = `${marker} ${current.textContent || ""}`.slice(0, 1600);
      if (JAVBUS_AD_TEXT_RE.test(text) || BLOCKED_PROMO_TEXT_RE.test(text) || PROMO_LINK_RE.test(text)) return true;
      current = current.parentElement;
    }
    return hasExternalPromoLink(node);
  }

  function isHiddenOrBlocked(node) {
    if (!node || node.ownerDocument !== document) return false;
    let current = node;
    for (let depth = 0; current && depth < 7; depth += 1) {
      const style = getComputedStyle(current);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return true;
      const rect = current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return true;
      current = current.parentElement;
    }
    return false;
  }

  function isAdMedia(url, node = null) {
    return isAdMediaUrl(url) || hasAdContainer(node) || isHiddenOrBlocked(node);
  }

  function isPhotoGalleryPage(url = location.href) {
    return galleryPrefixFromUrl(url) !== "";
  }

  function isKnownGalleryUrl(url = location.href) {
    try {
      const parsed = new URL(url, location.href);
      return /(^|\.)xchina\.co$/i.test(parsed.hostname) && !!galleryPrefixFromUrl(parsed.href);
    } catch {
      return false;
    }
  }

  function isZttaotuUrl(url = location.href) {
    try {
      const parsed = new URL(url, location.href);
      return /(^|\.)zttaotu\.com$/i.test(parsed.hostname) && ZTTAOTU_PAGE_RE.test(parsed.pathname);
    } catch {
      return false;
    }
  }

  function isCloudDriveFilesPage(url = location.href) {
    try {
      const parsed = new URL(url, location.href);
      const localHost = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(parsed.hostname);
      return localHost && parsed.searchParams.get("page") === "files";
    } catch {
      return false;
    }
  }

  function isCloudDriveThumbUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      return /^thumb\.115\.com$/i.test(parsed.hostname) && /\/thumb\/.+_\d+$/i.test(parsed.pathname);
    } catch {
      return false;
    }
  }

  function isCloudDriveMediaUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      return /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(parsed.hostname)
        && /\/static\/http\/[^/]+\/false\//i.test(parsed.pathname);
    } catch {
      return false;
    }
  }

  function isCloudDriveVideoPath(path) {
    return /\.(?:mp4|m4v|mov|webm|mkv|avi|wmv|flv|ts)(?:[?#]|$)/i.test(String(path || ""));
  }

  function cloudDriveCloudNameFromPath(path) {
    const root = String(path || "").replace(/^\/+/, "").split("/")[0] || "";
    if (/^115$/i.test(root)) return "115open";
    return root;
  }

  function cloudDriveVideoUrlFromPath(path, base = location.href) {
    if (!isCloudDriveVideoPath(path)) return "";
    try {
      const parsed = new URL(base, location.href);
      const cleanPath = String(path).replace(/^\/+/, "");
      const url = new URL(`/static/http/${parsed.host}/false/${encodeURIComponent(cleanPath)}`, parsed.origin);
      const cloudName = cloudDriveCloudNameFromPath(cleanPath);
      if (cloudName) url.searchParams.set("cloudname", cloudName);
      if (cloudName === "115open") url.searchParams.set("membership", "年费VIP");
      return url.href;
    } catch {
      return "";
    }
  }

  function isCloudDriveVideoFolder(base = location.href) {
    try {
      const parsed = new URL(base, location.href);
      const path = parsed.searchParams.get("path") || "";
      return /(?:^|\/)(?:视频|video)(?:\/|$)/i.test(path);
    } catch {
      return false;
    }
  }

  function isBuonduaPage(url = location.href) {
    try {
      const parsed = new URL(url, location.href);
      return /(^|\.)buondua\.com$/i.test(parsed.hostname);
    } catch {
      return false;
    }
  }

  function isBuonduaImageUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      return /(^|\.)i\d*\.buondua\.us$/i.test(parsed.hostname)
        && /\/20\d{2}\/\d+\/.+\.(?:avif|jpe?g|png|webp)(?:$|[?#])/i.test(parsed.pathname);
    } catch {
      return false;
    }
  }

  function isBuonduaArticleImageNode(node) {
    if (!node) return true;
    if (node.closest?.("script, iframe, ins, [class*='ads' i], [id*='ads' i], [class*='sponsor' i], [id*='sponsor' i]")) return false;
    return !!node.closest?.(".article-fulltext, .article.content, article, [class*='article' i]");
  }

  function isKnownXchinaPromoImage(url, node = null, base = "") {
    const contextBase = base || node?.ownerDocument?.documentElement?.dataset?.xivBase || state.collectionBase || location.href;
    if (!/xchina\.co\/photo\/id-/i.test(contextBase || location.href)) return false;
    const text = node ? closestText(node) : "";
    if (text && BLOCKED_PROMO_TEXT_RE.test(text)) return true;
    try {
      const parsed = new URL(url, location.href);
      if (!/(^|\.)(?:img|upload)\.xchina\.io$/i.test(parsed.hostname)) return false;
      const directLink = node?.closest?.("a[href]");
      const linkedPage = directLink ? absoluteUrl(directLink.getAttribute("href"), contextBase) : "";
      if (linkedPage && isQueueCandidateUrl(linkedPage) && !samePageUrl(linkedPage, contextBase)) return true;
      const contextAlbum = siteAlbumIdFromUrl(contextBase);
      const imageAlbum = siteAlbumIdFromUrl(parsed.href);
      if (contextAlbum && imageAlbum && imageAlbum !== contextAlbum) return true;
      if (contextAlbum && /(^|\.)upload\.xchina\.io$/i.test(parsed.hostname) && !imageAlbum) return true;
      if (/^6914a1e352a47\.webp$/i.test(parsed.pathname.split("/").pop() || "")) return true;
      const imageNo = siteAlbumPageNumberFromUrl(parsed.href);
      if (/id-6a33a26d508f4/i.test(contextBase) && imageNo === 5) return true;
      const path = `${parsed.pathname} ${parsed.search}`;
      return /(?:7she|qishe|wife|promo|advert|ad-?banner)/i.test(path);
    } catch {
      return false;
    }
  }

  function isPornpicsGalleryPage(url = location.href) {
    try {
      const parsed = new URL(url, location.href);
      return /(^|\.)pornpics\.com$/i.test(parsed.hostname) && /\/galleries\/[^/]+-\d+\/?$/i.test(parsed.pathname);
    } catch {
      return false;
    }
  }

  function isPornpicsMainGalleryNode(node) {
    if (!node || !isPornpicsGalleryPage(node.ownerDocument?.documentElement?.dataset?.xivBase || location.href)) return false;
    const tileRoot = node.closest?.("#main #tiles, #tiles");
    if (!tileRoot) return false;
    if (node.closest?.("#rel-main, #main2, .gallery-info, .comments, header, footer, [class*='related' i], [class*='recommend' i], [class*='suggest' i]")) return false;
    return true;
  }

  function isGoodImage(url, node) {
    if (!url || BAD_IMAGE_RE.test(url)) return false;
    if (isBlockedZttaotuImage(url, node)) return false;
    if (isKnownXchinaPromoImage(url, node)) return false;
    if (isBuonduaPage(node?.ownerDocument?.documentElement?.dataset?.xivBase || location.href) && isBuonduaImageUrl(url) && isBuonduaArticleImageNode(node)) return true;
    if (isAdMedia(url, node)) return false;
    if (isCloudDriveFilesPage() && isCloudDriveThumbUrl(url)) return true;
    if (isPornpicsGalleryPage() && node && !isPornpicsMainGalleryNode(node)) return false;
    if (!isMediaUrl(url)) return false;
    if (isVideoUrl(url)) return true;
    if (isX810114Avatar(url, node)) return false;
    if (isGenericX810114Page() && /\/\/[^/]*twimg\.moonchan\.xyz\//i.test(url)) return true;
    const galleryContext = node ? hasGalleryContext(url, node) : /\/photo\//i.test(url);
    const displayOk = node ? displayedLargeEnough(node) : null;
    const bigNatural = !!(node && node.naturalWidth >= 480 && node.naturalHeight >= 480);
    const photoishName = /(?:\d{3,}|[_-]\d+)\.(?:avif|gif|jpe?g|png|webp)(?:[?#].*)?$/i.test(url);
    const photoishPath = /\/(upload|uploads|media|photos?|files?)\//i.test(url);
    const contextBase = node?.ownerDocument?.documentElement?.dataset?.xivBase || state.collectionBase || location.href;
    const genericPage = !isPhotoGalleryPage(contextBase);
    if (/\b(xchina|logo|icon|favicon|sprite|button|banner|advert|ads?)\b/i.test(new URL(url).pathname)) return false;
    if (genericPage) {
      if (node && node.naturalWidth && node.naturalHeight) {
        if (node.naturalWidth < 260 || node.naturalHeight < 260) return false;
      }
      return displayOk === true || bigNatural || photoishPath || photoishName;
    }
    if (STATIC_ASSET_RE.test(url) && !galleryContext) return false;
    if (displayOk === false && !galleryContext) return false;
    if (node && node.naturalWidth && node.naturalHeight) {
      if (node.naturalWidth < 220 || node.naturalHeight < 220) return false;
    }
    return galleryContext || photoishPath || photoishName || (displayOk === true && bigNatural);
  }

  function isBlockedZttaotuImage(url, node, base = "") {
    const contextBase = base || node?.ownerDocument?.documentElement?.dataset?.xivBase || state.collectionBase || location.href;
    if (!url || !isZttaotuUrl(contextBase)) return false;
    const text = node ? closestText(node) : "";
    if (BLOCKED_PROMO_TEXT_RE.test(text)) return true;
    try {
      const parsed = new URL(url, location.href);
      const page = pageNumberFromUrl(contextBase) || pageNumberFromUrl(location.href);
      const placeholderPath = /\/photo\/zwebp\//i.test(parsed.pathname)
        || /(?:qrcode|qr|warning|notice|blocked|placeholder|sensitive)/i.test(parsed.pathname);
      return page > 1 && placeholderPath;
    } catch {
      return false;
    }
  }

  function pornpicsKey(url) {
    try {
      const parsed = new URL(url, location.href);
      if (!/(^|\.)pornpics\.com$/i.test(parsed.hostname)) return "";
      const parts = parsed.pathname.split("/").filter(Boolean);
      const filename = parts.at(-1) || "";
      const galleryId = parts.at(-2) || "";
      if (!/^\d+$/.test(galleryId) || !/\.(?:jpe?g|png|webp|avif)$/i.test(filename)) return "";
      return `pornpics:${galleryId}:${filename.toLowerCase()}`;
    } catch {
      return "";
    }
  }

  function pornpicsQualityScore(url) {
    try {
      const parsed = new URL(url, location.href);
      if (!/(^|\.)pornpics\.com$/i.test(parsed.hostname)) return 0;
      const parts = parsed.pathname.split("/").filter(Boolean);
      const size = Number(parts[0] || 0);
      return Number.isFinite(size) ? size : 0;
    } catch {
      return 0;
    }
  }

  function mediaQualityScore(url) {
    return pornpicsQualityScore(url);
  }

  function keyForUrl(url) {
    return pornpicsKey(url) || url.replace(/#.*$/, "");
  }

  function rejectImage(url) {
    const key = keyForUrl(url);
    state.imageKeys.delete(key);
    const index = state.images.indexOf(url);
    if (index >= 0) state.images.splice(index, 1);
    state.rejectedCount += 1;
    state.grid?.querySelector(`[data-url-key="${CSS.escape(key)}"]`)?.remove();
    syncTileIndexes();
    layoutMasonry();
    updateCounter();
  }

  function isLoadedPhotoLike(img) {
    if (isGenericX810114Page()) return true;
    const url = img.currentSrc || img.src || "";
    if (isGifUrl(url)) return true;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return true;
    const ratio = w / h;
    if (w < 180 || h < 180) return false;
    if (ratio < 0.18 || ratio > 5.5) return false;
    if (Math.abs(ratio - 1) < 0.08 && Math.max(w, h) < 900) return false;
    return true;
  }

  function isPhotoShowPage(url) {
    if (!url) return false;
    try {
      const parsed = new URL(url, location.href);
      return parsed.origin === location.origin && /^\/photoShow\.html$/i.test(parsed.pathname) && parsed.searchParams.has("id");
    } catch {
      return false;
    }
  }

  function isDetailPhotoPage(url) {
    if (!url) return false;
    try {
      const parsed = new URL(url, location.href);
      return parsed.origin === location.origin && (/^\/photo\/id-[^/]+\.html$/i.test(parsed.pathname) || isPhotoShowPage(url));
    } catch {
      return false;
    }
  }

  function rememberDetailUrl(imageUrl, detailUrl) {
    if (!imageUrl || !isDetailPhotoPage(detailUrl)) return;
    const key = keyForUrl(imageUrl);
    const url = absoluteUrl(detailUrl);
    if (isPhotoShowPage(url)) state.photoShowByImage.set(key, url);
    const current = state.detailByImage.get(key);
    if (!current || isPhotoShowPage(url)) state.detailByImage.set(key, url);
  }

  function findPhotoShowUrl(doc, base) {
    const link = doc.querySelector('a[href*="photoShow.html?id="], iframe[src*="photoShow.html?id="]');
    const direct = absoluteUrl(link?.getAttribute("href") || link?.getAttribute("src"), base);
    if (isPhotoShowPage(direct)) return direct;

    const html = doc.documentElement?.innerHTML || "";
    return photoShowUrlFromText(html, base);
  }

  function rememberPosterUrl(imageUrl, posterUrl) {
    if (posterUrl && isMediaUrl(posterUrl) && !isVideoUrl(posterUrl)) {
      state.posterByImage.set(keyForUrl(imageUrl), posterUrl);
    }
  }

  function addImage(url, detailUrl = "", posterUrl = "") {
    url = normalizeMediaUrl(url);
    if (!url || isBlockedZttaotuImage(url, null, state.collectionBase) || isKnownXchinaPromoImage(url, null, state.collectionBase)) {
      state.rejectedCount += 1;
      return false;
    }
    const key = keyForUrl(url);
    if (state.imageKeys.has(key)) {
      state.rejectedCount += 1;
      const index = state.images.findIndex((imageUrl) => keyForUrl(imageUrl) === key);
      const currentUrl = index >= 0 ? state.images[index] : "";
      if (currentUrl && mediaQualityScore(url) > mediaQualityScore(currentUrl)) {
        state.images[index] = url;
        updateRenderedTileUrl(key, url);
      }
      rememberDetailUrl(url, detailUrl);
      rememberPosterUrl(url, posterUrl);
      return false;
    }
    state.imageKeys.add(key);
    state.images.push(url);
    state.collectedCount += 1;
    rememberDetailUrl(url, detailUrl);
    rememberPosterUrl(url, posterUrl);
    return true;
  }

  function updateRenderedTileUrl(key, url) {
    const tile = state.grid?.querySelector(`[data-url-key="${CSS.escape(key)}"]`);
    if (!tile) return;
    tile.dataset.url = url;
    const media = tile.querySelector("img, video");
    if (!media) return;
    if (media.tagName === "IMG") {
      media.dataset.fallbackTried = "";
      setImageSourceWithFallback(media, url);
    } else if (media.tagName === "VIDEO") {
      media.src = url;
      media.load();
    }
  }

  function collectCloudDriveMediaUrls(doc, base) {
    const imageUrls = new Set();
    const videoUrls = new Set();
    doc.querySelectorAll('img.wf-img[src], img[src*="thumb.115.com/thumb/"]').forEach((img) => {
      const url = absoluteUrl(img.currentSrc || img.getAttribute("src"), base);
      if (!isCloudDriveThumbUrl(url)) return;
      imageUrls.add(url);
      rememberMediaRatio(url, img.naturalWidth || 0, img.naturalHeight || 0);
    });
    doc.querySelectorAll("video[src], video source[src]").forEach((node) => {
      const ownerVideo = node.closest?.("video") || node;
      const raw = node.currentSrc || node.getAttribute("src") || ownerVideo.currentSrc || ownerVideo.getAttribute?.("src");
      const url = normalizeMediaUrl(absoluteUrl(raw, base));
      if (isVideoUrl(url)) videoUrls.add(url);
    });
    doc.querySelectorAll(".wf-item[data-path], [data-path]").forEach((item) => {
      const path = item.getAttribute("data-path") || "";
      if (!isCloudDriveVideoPath(path)) return;
      const existingVideo = item.querySelector?.("video[src], video source[src]");
      const existingUrl = existingVideo
        ? normalizeMediaUrl(absoluteUrl(existingVideo.currentSrc || existingVideo.getAttribute("src"), base))
        : "";
      const url = isVideoUrl(existingUrl) ? existingUrl : cloudDriveVideoUrlFromPath(path, base);
      if (!url) return;
      videoUrls.add(url);
      const rect = item.getBoundingClientRect?.();
      rememberMediaRatio(url, Math.round(rect?.width || 0), Math.round(rect?.height || 0));
    });
    let added = 0;
    for (const url of imageUrls) {
      if (addImage(url)) added += 1;
    }
    let addedVideos = 0;
    for (const url of videoUrls) {
      if (addImage(url)) {
        added += 1;
        addedVideos += 1;
      }
    }
    if (addedVideos && isCloudDriveVideoFolder(base)) {
      setMediaFilter("video");
    } else if (addedVideos && state.mediaFilter === "image" && !imageUrls.size) {
      setMediaFilter("video");
    }
    return added;
  }

  function collectPornpicsGalleryUrls(doc, base) {
    const urls = new Set();
    doc.querySelectorAll("#main #tiles a[href], #tiles a[href]").forEach((link) => {
      if (!isPornpicsMainGalleryNode(link)) return;
      const href = absoluteUrl(link.getAttribute("href"), base);
      if (href && isMediaUrl(href) && !isVideoUrl(href) && !BAD_IMAGE_RE.test(href)) urls.add(href);
      const img = link.querySelector("img");
      const thumb = img ? imageCandidateFromImg(img, base) : "";
      if (!href && thumb && isMediaUrl(thumb) && !BAD_IMAGE_RE.test(thumb)) urls.add(thumb);
    });
    doc.querySelectorAll("#main #tiles img, #tiles img").forEach((img) => {
      if (!isPornpicsMainGalleryNode(img)) return;
      const url = imageCandidateFromImg(img, base);
      if (url && isMediaUrl(url) && !BAD_IMAGE_RE.test(url)) urls.add(url);
    });
    let added = 0;
    for (const url of urls) {
      if (addImage(url)) added += 1;
    }
    state.expectedImages = state.images.length;
    return added;
  }

  function collectBuonduaArticleUrls(doc, base) {
    const urls = new Set();
    doc.querySelectorAll(".article-fulltext img, .article.content img, article img").forEach((img) => {
      const url = imageCandidateFromImg(img, base);
      if (url && isBuonduaImageUrl(url) && isBuonduaArticleImageNode(img)) urls.add(url);
    });
    doc.querySelectorAll(".article-fulltext source[src], .article-fulltext a[href], .article.content source[src], .article.content a[href]").forEach((node) => {
      const raw = node.getAttribute("src") || node.getAttribute("href") || "";
      const url = absoluteUrl(raw, base);
      if (url && isBuonduaImageUrl(url) && isBuonduaArticleImageNode(node)) urls.add(url);
    });
    let added = 0;
    for (const url of urls) {
      if (addImage(url)) added += 1;
    }
    return added;
  }

  function collectFromDocument(doc, base) {
    let added = 0;
    state.collectionBase = base;
    doc.documentElement.dataset.xivBase = base;
    refreshGalleryQueue(doc, base);
    rememberExpectedImageCount(doc);
    if (isCloudDriveFilesPage(base)) {
      added += collectCloudDriveMediaUrls(doc, base);
    }
    if (isBuonduaPage(base)) {
      added += collectBuonduaArticleUrls(doc, base);
    }
    if (isPornpicsGalleryPage(base)) {
      added += collectPornpicsGalleryUrls(doc, base);
      renderImages();
      applyMediaFilter();
      updateStatus(added ? `新增 ${added} 张` : "就绪");
      return;
    }
    if (isXchinaPhotoUrl(base)) {
      added += collectXchinaPhotoUrls(doc, base);
      if (!added) added += collectFallbackImageUrls(doc, base);
      renderImages();
      applyMediaFilter();
      updateStatus(added ? `新增 ${added} 张` : "就绪");
      return;
    }
    if (isPhotoGalleryPage(base)) discoverPageLinksFromDocument(doc, base);

    doc.querySelectorAll("img").forEach((img) => {
      const url = imageCandidateFromImg(img, base);
      const detailUrl = absoluteUrl(closestHref(img, base), base);
      if (isGoodImage(url, img) && addImage(url, detailUrl)) added += 1;
    });

    doc.querySelectorAll("video").forEach((video) => {
      const url = mediaCandidateFromVideo(video, base);
      const poster = absoluteUrl(video.getAttribute?.("poster"), base);
      if (isGoodImage(url, video) && addImage(url, "", poster)) added += 1;
    });

    doc.querySelectorAll("source[src]").forEach((source) => {
      const url = absoluteUrl(source.getAttribute("src"), base);
      if (isGoodImage(url, source.closest("video") || source) && addImage(url)) added += 1;
    });

    if (isZttaotuUrl(base)) {
      doc.querySelectorAll("link[href]").forEach((link) => {
        const rel = link.getAttribute("rel") || "";
        if (!/(prefetch|preload)/i.test(rel)) return;
        const url = absoluteUrl(link.getAttribute("href"), base);
        if (isGoodImage(url, link) && addImage(url)) added += 1;
      });
    }

    doc.querySelectorAll("a[href]").forEach((a) => {
      const href = absoluteUrl(a.getAttribute("href"), base);
      const img = a.querySelector("img");
      if (img && isDetailPhotoPage(href)) {
        const imgUrl = imageCandidateFromImg(img, base);
        if (isGoodImage(imgUrl, img) && addImage(imgUrl, href)) added += 1;
      }
      if (!isZttaotuUrl(base) && isGoodImage(href) && addImage(href)) added += 1;
      if (isPhotoGalleryPage(base) && sameGalleryPage(href, base)) state.pageUrls.add(href);
    });

    doc.querySelectorAll("[style]").forEach((el) => {
      for (const url of backgroundImageUrls(el.getAttribute("style"), base)) {
        if (isGoodImage(url, el) && addImage(url)) added += 1;
      }
    });

    added += collectArticleImageUrls(doc, base);

    if (isKnownGalleryUrl(base)) {
      added += collectFallbackImageUrls(doc, base);
    }

    if (!added) {
      added += collectFallbackImageUrls(doc, base);
    }

    if (!isPhotoGalleryPage(base) || !added) {
      added += collectVisibleLargeImages(doc, base);
    }

    renderImages();
    applyMediaFilter();
    updateStatus(added ? `新增 ${added} 张` : "就绪");
  }

  function isGenericX810114Page() {
    return GENERIC_X810114_RE.test(location.href);
  }

  function isX810114ProfilePage() {
    try {
      const parsed = new URL(location.href);
      return parsed.hostname === "x.810114.xyz" && parsed.pathname !== "/" && parsed.pathname.length > 1;
    } catch {
      return false;
    }
  }

  function isSupportedPage() {
    return HTTP_PAGE_RE.test(location.href);
  }

  function invalidateCollectionRequests() {
    state.collectionGeneration += 1;
    state.collectionController.abort();
    state.collectionController = new AbortController();
    state.pendingPages.clear();
    state.failedPages.clear();
    state.fetching = false;
    state.lastGalleryFetchAt = 0;
  }

  function resetCollection() {
    invalidateCollectionRequests();
    state.images = [];
    state.detailByImage.clear();
    state.photoShowByImage.clear();
    state.highResByImage.clear();
    state.posterByImage.clear();
    state.mediaRatioByImage.clear();
    state.videoTimeByImage.clear();
    state.videoPreviewObserver?.disconnect();
    state.videoPreviewObserver = null;
    state.videoPreviewQueue = [];
    state.videoPreviewLoading = 0;
    cancelAnimationFrame(state.renderFrame);
    state.renderFrame = 0;
    state.renderQueue = [];
    state.renderStartedAt = 0;
    state.imageKeys.clear();
    state.renderedKeys.clear();
    state.masonryColumns = [];
    state.pageUrls.clear();
    state.fetchedPages.clear();
    state.expectedImages = 0;
    state.galleryFailureCount = 0;
    state.rejectedCount = 0;
    state.collectedCount = 0;
    state.x810114ApiMode = false;
    state.grid?.replaceChildren();
    updateCounter();
  }

  function findButtonByText(pattern) {
    return Array.from(document.querySelectorAll("button, [role='button'], a"))
      .find((node) => pattern.test((node.textContent || "").replace(/\s+/g, "")));
  }

  function x810114ProfileName() {
    try {
      const parsed = new URL(location.href);
      if (parsed.hostname !== "x.810114.xyz") return "";
      const name = parsed.pathname.split("/").filter(Boolean)[0] || "";
      return /^[A-Za-z0-9_]{2,64}$/.test(name) ? name : "";
    } catch {
      return "";
    }
  }

  function x810114MediaUrl(item) {
    if (!item?.url) return "";
    if (item.type === "video" || item.type === "animated_gif") return normalizeX810114VideoUrl(item.url);
    return item.url.replace("https://pbs.twimg.com", "https://twimg.moonchan.xyz");
  }

  function normalizeX810114VideoUrl(url) {
    return url
      ? url
        .replace("https://video.twimg.com", "https://twimg.moonchan.xyz")
        .replace("https://video-cf.twimg.com", "https://twimg.moonchan.xyz")
      : "";
  }

  function normalizeMediaUrl(url) {
    if (isGenericX810114Page() && isVideoUrl(url)) return normalizeX810114VideoUrl(url);
    return url;
  }

  function siteAlbumOriginalImageUrl(url) {
    if (!url || isVideoUrl(url)) return url;
    try {
      const parsed = new URL(url, location.href);
      if (!/(^|\.)img\.xchina\.io$/i.test(parsed.hostname)) return url;
      if (!/^\/photos\d*\/.+\/[^/]+\.(?:avif|jpe?g|png|webp)$/i.test(parsed.pathname)) return url;
      const originalPath = parsed.pathname
        .replace(/([_-])\d+x\d+(?=\.[^/.]+$)/i, "")
        .replace(/\.(?:avif|jpe?g|png|webp)$/i, ".jpg");
      if (originalPath === parsed.pathname) return url;
      return `${parsed.origin}${originalPath}`;
    } catch {
      return url;
    }
  }

  function siteAlbumIdFromUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      const pathMatch = parsed.pathname.match(/\/(?:photo\/id-|photos\d*\/)([A-Za-z0-9_-]{8,})(?:\/|\.html|$)/i);
      if (pathMatch) return pathMatch[1].replace(/^id-/i, "");
      const queryId = parsed.searchParams.get("id") || "";
      const queryMatch = queryId.match(/([A-Za-z0-9_-]{8,})/);
      return queryMatch?.[1] || "";
    } catch {
      return "";
    }
  }

  function siteAlbumPageNumberFromUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      const imageMatch = parsed.pathname.match(/\/photos\d*\/[^/]+\/(\d+)(?:[_-]\d+x\d+)?\.(?:avif|jpe?g|png|webp)$/i);
      if (imageMatch) return Number(imageMatch[1]);
      return 0;
    } catch {
      return 0;
    }
  }

  function siteAlbumDerivedImageCandidates(url) {
    const albumId = siteAlbumIdFromUrl(url);
    const pageNumber = siteAlbumPageNumberFromUrl(url);
    if (!albumId || !pageNumber) return [];
    const filename = `${String(pageNumber).padStart(4, "0")}.jpg`;
    return [
      `https://img.xchina.io/photos2/${albumId}/${filename}`,
      `https://img.xchina.io/photos/${albumId}/${filename}`
    ];
  }

  function siteAlbumImageUrlFromRaw(raw, base = location.href) {
    const value = unescapeEmbeddedUrl(raw).replace(/\\/g, "");
    if (!value) return "";
    if (/^https?:\/\/img\.xchina\.io\/photos\d*\//i.test(value)) return siteAlbumOriginalImageUrl(value);
    if (/^\/\/img\.xchina\.io\/photos\d*\//i.test(value)) return siteAlbumOriginalImageUrl(`https:${value}`);
    if (/^\/photos\d*\/[A-Za-z0-9_-]+\/[^/?#]+\.(?:avif|jpe?g|png|webp)(?:[?#].*)?$/i.test(value)) {
      return siteAlbumOriginalImageUrl(`https://img.xchina.io${value}`);
    }
    const url = absoluteUrl(value, base);
    return /(^|\.)img\.xchina\.io\//i.test(url) ? siteAlbumOriginalImageUrl(url) : "";
  }

  function siteAlbumDirectImageCandidates(doc, base) {
    const albumId = siteAlbumIdFromUrl(base) || siteAlbumIdFromUrl(location.href);
    const candidates = [];
    const html = doc.documentElement?.innerHTML || "";
    const normalizedHtml = unescapeEmbeddedUrl(html)
      .replace(/\\\//g, "/")
      .replace(/\\/g, "");

    function remember(url) {
      const direct = siteAlbumImageUrlFromRaw(url, base);
      if (!direct || !isFavoriteImageUrl(direct)) return;
      if (albumId && siteAlbumIdFromUrl(direct) && siteAlbumIdFromUrl(direct) !== albumId) return;
      candidates.push(direct);
    }

    doc.querySelectorAll("img, source, a, meta, link, [style]").forEach((node) => {
      ["src", "currentSrc", "href", "content", "poster", "data-src", "data-original", "data-url", "data-full", "data-large", "style"].forEach((attr) => {
        const value = attr === "currentSrc" ? node.currentSrc : node.getAttribute?.(attr);
        if (value) remember(value);
      });
    });

    const directRe = /(?:https?:)?\/\/img\.xchina\.io\/photos\d*\/[A-Za-z0-9_-]+\/[^"'()<>\\\s]+\.(?:avif|jpe?g|png|webp)(?:\?[^"'()<>\\\s]*)?/gi;
    const pathRe = /\/photos\d*\/[A-Za-z0-9_-]+\/[^"'()<>\\\s]+\.(?:avif|jpe?g|png|webp)(?:\?[^"'()<>\\\s]*)?/gi;
    for (const re of [directRe, pathRe]) {
      let match;
      while ((match = re.exec(normalizedHtml))) remember(match[0]);
    }

    const noMatch = normalizedHtml.match(/\bNo\.\s*(\d{1,6})\b/i) || normalizedHtml.match(/(?:第|序号|编号)\s*(\d{1,6})\s*(?:张|图|P)?/i);
    const imageNo = Number(noMatch?.[1] || 0);
    if (albumId && imageNo > 0) {
      candidates.push(`https://img.xchina.io/photos2/${albumId}/${String(imageNo).padStart(4, "0")}.jpg`);
      candidates.push(`https://img.xchina.io/photos/${albumId}/${String(imageNo).padStart(4, "0")}.jpg`);
    }

    return [...new Set(candidates)];
  }

  function xchinaMainContainers(doc) {
    const selectors = [
      "#photo_body",
      "#photoBox",
      ".photoShow",
      ".photo-show",
      ".photo-content",
      ".photo-content-box",
      ".content_left",
      ".main-content",
      "article",
      "main",
      ".detail"
    ].join(",");
    const nodes = Array.from(doc.querySelectorAll?.(selectors) || [])
      .filter((node) => !node.closest?.("header, footer, nav, aside, [class*='related' i], [class*='recommend' i], [class*='popular' i], [class*='sidebar' i], [class*='list' i]"));
    return nodes.length ? nodes : [doc.body || doc.documentElement];
  }

  function collectXchinaPhotoUrls(doc, base) {
    const album = siteAlbumIdFromUrl(base);
    if (!album) return 0;
    const urls = new Set();

    function remember(raw, node = null) {
      const url = siteAlbumImageUrlFromRaw(raw, base);
      if (!url || !isMediaUrl(url) || isVideoUrl(url)) return;
      const imageAlbum = siteAlbumIdFromUrl(url);
      if (imageAlbum && imageAlbum !== album) return;
      const directLink = node?.closest?.("a[href]");
      const linkedPage = directLink ? absoluteUrl(directLink.getAttribute("href"), base) : "";
      if (linkedPage && isQueueCandidateUrl(linkedPage) && !samePageUrl(linkedPage, base)) return;
      if (BAD_IMAGE_RE.test(url) || isAdMedia(url, node) || isKnownXchinaPromoImage(url, node, base)) return;
      urls.add(url);
    }

    for (const url of siteAlbumDirectImageCandidates(doc, base)) remember(url);
    for (const container of xchinaMainContainers(doc)) {
      container.querySelectorAll?.("img, source, a, meta, link").forEach((node) => {
        ["src", "currentSrc", "href", "content", "poster", "data-src", "data-original", "data-url", "data-full", "data-large", "srcset", "data-srcset"].forEach((attr) => {
          const value = attr === "currentSrc" ? node.currentSrc : node.getAttribute?.(attr);
          if (!value) return;
          if (attr === "srcset" || attr === "data-srcset") {
            value.split(",").map((item) => item.trim().split(/\s+/)[0]).filter(Boolean).forEach((part) => remember(part, node));
          } else {
            remember(value, node);
          }
        });
      });
      container.querySelectorAll?.("[style]").forEach((node) => {
        backgroundImageUrls(node.getAttribute("style"), base).forEach((url) => remember(url, node));
      });
    }

    let added = 0;
    for (const url of urls) {
      if (addImage(url)) added += 1;
    }
    return added;
  }

  function normalizeX810114ImageUrl(url) {
    return url ? url.replace("https://pbs.twimg.com", "https://twimg.moonchan.xyz") : "";
  }

  function x810114ImageValues(item) {
    const keys = new Set([
      "poster",
      "thumbnail",
      "thumb",
      "preview",
      "preview_image_url",
      "media_url",
      "media_url_https",
      "image",
      "image_url",
      "cover",
      "cover_url"
    ]);
    const values = [];
    const seen = new Set();

    function visit(value, key = "") {
      if (!value || values.length >= 40) return;
      if (typeof value === "string") {
        if (keys.has(key) || IMAGE_EXT.test(value)) values.push(value);
        return;
      }
      if (typeof value !== "object" || seen.has(value)) return;
      seen.add(value);
      if (Array.isArray(value)) {
        value.forEach((entry) => visit(entry, key));
        return;
      }
      Object.entries(value).forEach(([entryKey, entryValue]) => visit(entryValue, entryKey));
    }

    visit(item);
    return values;
  }

  function x810114PosterUrl(item) {
    const raw = x810114ImageValues(item)
      .map((url) => normalizeX810114ImageUrl(url))
      .find((url) => url && isMediaUrl(url) && !isVideoUrl(url));
    return raw || "";
  }

  function isBlockedPromoItem(item) {
    const text = [
      item?.text,
      item?.full_text,
      item?.content,
      item?.title,
      item?.description,
      item?.url,
      item?.poster,
      item?.thumbnail
    ].filter(Boolean).join(" ");
    return BLOCKED_PROMO_TEXT_RE.test(text);
  }

  function alternateVideoUrl(url) {
    if (url.includes("https://twimg.moonchan.xyz")) return url.replace("https://twimg.moonchan.xyz", "https://video.twimg.com");
    if (url.includes("https://video.twimg.com")) return url.replace("https://video.twimg.com", "https://video-cf.twimg.com");
    if (url.includes("https://video-cf.twimg.com")) return url.replace("https://video-cf.twimg.com", "https://video.twimg.com");
    return "";
  }

  function alternateImageUrl(url) {
    if (/^https:\/\/twimg\.moonchan\.xyz\//i.test(url)) {
      return url.replace(/^https:\/\/twimg\.moonchan\.xyz\//i, "https://pbs.twimg.com/");
    }
    if (/^https:\/\/pbs\.twimg\.com\//i.test(url)) {
      return url.replace(/^https:\/\/pbs\.twimg\.com\//i, "https://twimg.moonchan.xyz/");
    }
    return "";
  }

  function setImageSourceWithFallback(img, url) {
    img.dataset.sourceUrl = url || "";
    img.referrerPolicy = shouldKeepReferrer(url) ? "no-referrer-when-downgrade" : "no-referrer";
    const previousSrc = img.currentSrc || img.src || "";
    img.dataset.fallbackTried = "";
    img.dataset.awaitingFallback = "";
    img.onload = () => {
      img.dataset.awaitingFallback = "";
    };
    img.onerror = () => {
      if (img.dataset.fallbackTried === "true") {
        img.dataset.awaitingFallback = "";
        return;
      }
      const fallback = alternateImageUrl(img.currentSrc || img.src || url) || (previousSrc && previousSrc !== url ? previousSrc : "");
      if (!fallback) {
        loadImageViaBlob(img, img.currentSrc || img.src || url);
        img.dataset.awaitingFallback = "";
        return;
      }
      img.dataset.fallbackTried = "true";
      img.dataset.awaitingFallback = "true";
      img.src = fallback;
    };
    img.src = url;
  }

  function loadImageViaBlob(img, url) {
    if (!img?.isConnected || !url || img.dataset.blobFallbackTried === "true") return;
    if (typeof GM_xmlhttpRequest !== "function") return;
    img.dataset.blobFallbackTried = "true";
    GM_xmlhttpRequest({
      method: "GET",
      url,
      responseType: "blob",
      headers: {
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
      },
      timeout: 30000,
      anonymous: false,
      onload: (response) => {
        if (!img.isConnected || response.status < 200 || response.status >= 300 || !response.response) return;
        const objectUrl = URL.createObjectURL(response.response);
        const previousObjectUrl = img.dataset.objectUrl || "";
        img.dataset.objectUrl = objectUrl;
        img.dataset.sourceUrl = url;
        img.dataset.awaitingFallback = "";
        img.src = objectUrl;
        if (previousObjectUrl) setTimeout(() => URL.revokeObjectURL(previousObjectUrl), 30000);
      },
      onerror: () => {},
      ontimeout: () => {}
    });
  }

  function shouldKeepReferrer(url) {
    try {
      const parsed = new URL(url, location.href);
      return /(^|\.)xchina\.co$/i.test(parsed.hostname)
        || /(^|\.)xchina\.co$/i.test(location.hostname)
        || /(^|\.)155picpic\.com$/i.test(parsed.hostname)
        || /(^|\.)155zy\.com$/i.test(location.hostname);
    } catch {
      return false;
    }
  }

  function sizeFromUrl(url) {
    const text = String(url || "");
    const match = text.match(/(?:^|[/_-])(\d{2,5})x(\d{2,5})(?=[/_.-]|\.[a-z0-9]+(?:[?#]|$))/i);
    if (!match) return null;
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
    return { width, height };
  }

  function rememberMediaRatio(url, width, height) {
    if (!url || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
    const ratio = width / height;
    if (ratio < 0.12 || ratio > 8) return;
    state.mediaRatioByImage.set(keyForUrl(url), ratio);
  }

  function initialMediaRatio(url, fallback = 0.72) {
    return state.mediaRatioByImage.get(keyForUrl(url))
      || ratioFromSize(sizeFromUrl(url))
      || fallback;
  }

  function applyInitialAspectRatio(media, url, fallback = 0.72) {
    const ratio = initialMediaRatio(url, fallback);
    if (!Number.isFinite(ratio) || ratio <= 0) return;
    media.style.aspectRatio = `${ratio} / 1`;
  }

  async function repairBrokenImage(url, img) {
    if (img.dataset.repairTried === "true") {
      rejectImage(url);
      return;
    }
    img.dataset.repairTried = "true";
    const highResUrl = await resolveHighResUrl(url);
    if (!highResUrl || highResUrl === url) {
      rejectImage(url);
      return;
    }
    setImageSourceWithFallback(img, highResUrl);
  }

  function createImageElement(url, index) {
    const img = document.createElement("img");
    const eagerLimit = isKnownGalleryUrl() ? 32 : 16;
    img.loading = index < eagerLimit ? "eager" : "lazy";
    if (index < Math.min(6, eagerLimit)) img.fetchPriority = "high";
    else if (index >= eagerLimit) img.dataset.xivDeferredImage = "true";
    img.decoding = "async";
    applyInitialAspectRatio(img, url);
    setImageSourceWithFallback(img, url);
    img.addEventListener("load", () => {
      if (!isLoadedPhotoLike(img)) rejectImage(url);
      const previousRatio = state.mediaRatioByImage.get(keyForUrl(url)) || 0;
      rememberMediaRatio(url, img.naturalWidth || 0, img.naturalHeight || 0);
      if (img.naturalWidth > 0 && img.naturalHeight > 0) img.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
      const tile = img.closest?.(".xiv-tile");
      if (tile) tile.dataset.estimatedHeight = "";
      const nextRatio = img.naturalWidth > 0 && img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 0;
      if (!previousRatio || (nextRatio && Math.abs(nextRatio - previousRatio) > 0.08)) scheduleMasonryLayout();
    }, { once: true });
    img.addEventListener("error", () => {
      setTimeout(() => {
        if (!img.isConnected || img.naturalWidth || img.naturalHeight) return;
        if (img.dataset.awaitingFallback === "true") return;
        repairBrokenImage(url, img);
      }, 350);
    });
    return img;
  }

  function createVideoPreviewElement(url, index) {
    const poster = state.posterByImage.get(keyForUrl(url));
    if (!poster) {
      if (isCloudDriveMediaUrl(url)) {
        const placeholder = document.createElement("div");
        placeholder.className = "xiv-video-placeholder";
        placeholder.dataset.sourceUrl = url;
        const ratio = state.mediaRatioByImage.get(keyForUrl(url)) || ratioFromSize(videoSizeFromUrl(url)) || 16 / 9;
        placeholder.style.setProperty("--xiv-video-ratio", String(ratio));
        return placeholder;
      }
      const video = createVideoElement(url, {
        autoplay: false,
        controls: false,
        preload: "none",
        keepFirstFrame: true,
        previewTime: 1,
        previewMode: isGenericX810114Page() || /\/\/twimg\.moonchan\.xyz\//i.test(url) ? "canvas" : /\/\/video(?:-cf)?\.twimg\.com\//i.test(url) ? "seek" : "canvas",
        deferSource: true
      });
      const size = videoSizeFromUrl(url);
      if (size) {
        video.style.aspectRatio = `${size.width} / ${size.height}`;
        rememberMediaRatio(url, size.width, size.height);
      }
      video.dataset.previewUrl = url;
      if (state.settings?.videoPreview !== false) observeVideoPreview(video);
      return video;
    }

    const img = document.createElement("img");
    const eagerLimit = isKnownGalleryUrl() ? 24 : 12;
    img.loading = index < eagerLimit ? "eager" : "lazy";
    if (index < Math.min(6, eagerLimit)) img.fetchPriority = "high";
    else if (index >= eagerLimit) img.dataset.xivDeferredImage = "true";
    img.decoding = "async";
    applyInitialAspectRatio(img, poster);
    img.referrerPolicy = shouldKeepReferrer(poster) ? "no-referrer-when-downgrade" : "no-referrer";
    img.src = poster;
    img.addEventListener("load", () => {
      rememberMediaRatio(url, img.naturalWidth || 0, img.naturalHeight || 0);
      if (img.naturalWidth > 0 && img.naturalHeight > 0) img.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
      const tile = img.closest?.(".xiv-tile");
      if (tile) tile.dataset.estimatedHeight = "";
      scheduleMasonryLayout();
    }, { once: true });
    img.addEventListener("error", () => {
      if (img.dataset.fallbackTried === "true") {
        const video = createVideoPreviewElement(url, index);
        img.replaceWith(video);
        scheduleMasonryLayout();
        return;
      }
      const fallback = alternateImageUrl(img.currentSrc || img.src || poster);
      if (!fallback) {
        img.dataset.fallbackTried = "true";
        img.dispatchEvent(new Event("error"));
        return;
      }
      img.dataset.fallbackTried = "true";
      img.src = fallback;
    });
    return img;
  }

  function videoSizeFromUrl(url) {
    return sizeFromUrl(url);
  }

  function ensureVideoPreviewObserver() {
    if (state.videoPreviewObserver) return state.videoPreviewObserver;
    state.videoPreviewObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const video = entry.target;
        state.videoPreviewObserver?.unobserve(video);
        queueVideoPreview(video);
      }
    }, { root: state.stage || null, rootMargin: "360px 0px", threshold: 0.01 });
    return state.videoPreviewObserver;
  }

  function observeVideoPreview(video) {
    if (!("IntersectionObserver" in window) || !state.stage) {
      queueVideoPreview(video);
      return;
    }
    ensureVideoPreviewObserver().observe(video);
  }

  function queueVideoPreview(video) {
    if (!video?.isConnected || video.dataset.previewLoaded === "true" || video.dataset.previewQueued === "true") return;
    video.dataset.previewQueued = "true";
    state.videoPreviewQueue.push(video);
    pumpVideoPreviewQueue();
  }

  function pumpVideoPreviewQueue() {
    state.videoPreviewQueue = state.videoPreviewQueue
      .filter((video) => video?.isConnected && video.dataset.previewLoaded !== "true")
      .sort((a, b) => videoPreviewDistance(a) - videoPreviewDistance(b));
    while (state.videoPreviewLoading < VIDEO_PREVIEW_CONCURRENCY && state.videoPreviewQueue.length) {
      const video = state.videoPreviewQueue.shift();
      if (!video?.isConnected || video.dataset.previewLoaded === "true") continue;
      startVideoPreviewLoad(video);
    }
  }

  function videoPreviewDistance(video) {
    const rect = video.getBoundingClientRect();
    const viewportCenter = window.innerHeight / 2;
    if (rect.top <= window.innerHeight && rect.bottom >= 0) return 0;
    return Math.min(Math.abs(rect.top - viewportCenter), Math.abs(rect.bottom - viewportCenter));
  }

  function finishVideoPreviewLoad(video, timer, ready = false) {
    clearTimeout(timer);
    if (video.dataset.previewLoading !== "true") return;
    video.dataset.previewLoading = "false";
    state.videoPreviewLoading = Math.max(0, state.videoPreviewLoading - 1);
    if (!ready && video.readyState < 2) {
      const retries = Number(video.dataset.previewRetries || 0);
      if (retries < 2 && video.isConnected) {
        video.dataset.previewRetries = String(retries + 1);
        video.dataset.previewLoaded = "false";
        video.dataset.previewQueued = "false";
        clearTimeout(Number(video.dataset.loadTimer || 0));
        video.removeAttribute("src");
        video.load();
        observeVideoPreview(video);
      } else {
        loadVideoPreviewViaBlob(video);
      }
    }
    pumpVideoPreviewQueue();
  }

  function loadVideoPreviewViaBlob(video) {
    const url = video?.dataset?.previewUrl || video?.dataset?.sourceUrl || "";
    if (!video?.isConnected || !url || video.dataset.previewBlobTried === "true") return;
    if (typeof GM_xmlhttpRequest !== "function") {
      video.dataset.previewLoaded = "false";
      video.dataset.previewLoading = "false";
      return;
    }
    video.dataset.previewBlobTried = "true";
    const failBlobFallback = () => {
      if (!video.isConnected) return;
      video.dataset.previewLoaded = "false";
      video.dataset.previewLoading = "false";
      video.dataset.previewQueued = "false";
      pumpVideoPreviewQueue();
    };
    GM_xmlhttpRequest({
      method: "GET",
      url,
      responseType: "blob",
      timeout: 30000,
      onload: (response) => {
        if (!video.isConnected) return;
        if (response.status < 200 || response.status >= 300 || !response.response) {
          failBlobFallback();
          return;
        }
        const objectUrl = URL.createObjectURL(response.response);
        let done = false;
        const cleanup = () => {
          video.removeEventListener("loadedmetadata", onReady);
          video.removeEventListener("loadeddata", onReady);
          video.removeEventListener("seeked", onSeeked);
          video.removeEventListener("error", onError);
        };
        const capture = () => {
          if (done || !video.isConnected) return;
          done = true;
          cleanup();
          video.dataset.previewLoaded = "true";
          video.dataset.previewLoading = "false";
          captureVideoPreviewFrame(video);
          pumpVideoPreviewQueue();
        };
        const onSeeked = () => capture();
        const onError = () => {
          if (done) return;
          done = true;
          cleanup();
          video.dataset.previewLoaded = "true";
          video.dataset.previewLoading = "false";
          pumpVideoPreviewQueue();
        };
        const onReady = () => {
          if (done || !video.isConnected) return;
          const duration = Number(video.duration || 0);
          const target = Number.isFinite(duration) && duration > 2.2 ? Math.min(duration - 0.2, 1.8) : 0;
          if (Math.abs((video.currentTime || 0) - target) > 0.15) {
            try {
              video.currentTime = target;
              return;
            } catch {
              // Some short blobs are not seekable before decode; capture current frame.
            }
          }
          capture();
        };
        video.addEventListener("loadedmetadata", onReady);
        video.addEventListener("loadeddata", onReady);
        video.addEventListener("seeked", onSeeked);
        video.addEventListener("error", onError);
        video.dataset.previewObjectUrl = objectUrl;
        video.dataset.previewMode = "canvas";
        video.dataset.previewLoaded = "false";
        video.dataset.previewLoading = "true";
        video.dataset.sourceUrl = url;
        video.preload = "auto";
        video.src = objectUrl;
        video.load();
        window.setTimeout(() => {
          if (!done && video.readyState >= 2) capture();
          else if (!done) onError();
        }, 9000);
      },
      onerror: failBlobFallback,
      ontimeout: failBlobFallback
    });
  }

  function startVideoPreviewLoad(video) {
    if (!video?.isConnected || video.dataset.previewLoaded === "true") return;
    const url = video.dataset.previewUrl || video.dataset.sourceUrl || "";
    if (!url) return;
    video.dataset.previewLoaded = "true";
    video.dataset.previewLoading = "true";
    state.videoPreviewLoading += 1;
    video.preload = "metadata";
    let timer = 0;
    const finishReady = () => finishVideoPreviewLoad(video, timer, true);
    const finishTimeout = () => finishVideoPreviewLoad(video, timer, false);
    timer = window.setTimeout(finishTimeout, 8000);
    video.addEventListener("seeked", finishReady, { once: true });
    if (video.dataset.previewMode !== "canvas") {
      video.addEventListener("loadeddata", finishReady, { once: true });
    }
    setVideoSourceWithFallback(video, url, false);
  }

  function captureVideoPreviewFrame(video) {
    if (!video?.isConnected || video.dataset.previewCaptured === "true") return;
    const width = video.videoWidth || 0;
    const height = video.videoHeight || 0;
    if (!width || !height) return;

    const maxSide = 900;
    const scale = Math.min(1, maxSide / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;

    try {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      if (isMostlyDarkFrame(context, canvas.width, canvas.height)) {
        const attempts = Number(video.dataset.previewCaptureAttempts || 0);
        const duration = Number(video.duration || 0);
        if (attempts < 2 && Number.isFinite(duration) && duration > 2.5) {
          video.dataset.previewCaptureAttempts = String(attempts + 1);
          const nextTime = Math.min(duration - 0.25, attempts === 0 ? 2.5 : 4);
          if (nextTime > video.currentTime + 0.2) {
            video.currentTime = nextTime;
            return;
          }
        }
      }

      const img = document.createElement("img");
      img.loading = "lazy";
      img.decoding = "async";
      img.alt = "";
      img.src = canvas.toDataURL("image/jpeg", 0.82);
      img.style.aspectRatio = `${width} / ${height}`;
      video.dataset.previewCaptured = "true";
      rememberMediaRatio(video.dataset.previewUrl || video.dataset.sourceUrl || "", width, height);
      clearTimeout(Number(video.dataset.loadTimer || 0));
      const objectUrl = video.dataset.previewObjectUrl || "";
      video.pause();
      video.removeAttribute("src");
      video.load();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      video.replaceWith(img);
      scheduleMasonryLayout();
    } catch {
      // If canvas capture is blocked, keep the video preview fallback.
      video.pause();
      scheduleMasonryLayout();
    }
  }

  function isMostlyDarkFrame(context, width, height) {
    const sampleWidth = Math.min(64, width);
    const sampleHeight = Math.min(64, height);
    const data = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
    let brightPixels = 0;
    let total = 0;
    for (let i = 0; i < data.length; i += 4) {
      const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      if (luma > 28) brightPixels += 1;
      total += 1;
    }
    return total > 0 && brightPixels / total < 0.04;
  }

  function setVideoSourceWithFallback(video, url, autoplay = false) {
    clearTimeout(Number(video.dataset.loadTimer || 0));
    video.dataset.sourceUrl = url;
    video.src = url;
    video.load();
    const tryFallback = () => {
      if (!video.isConnected) return;
      if (video.dataset.allowFallback === "false") return;
      if (video.readyState >= 1 || video.currentTime > 0 || !video.paused || video.dataset.played === "true") return;
      if (video.dataset.fallbackTried === "true") return;
      const fallback = alternateVideoUrl(video.currentSrc || video.src || video.dataset.sourceUrl || url);
      if (!fallback) return;
      video.dataset.fallbackTried = "true";
      video.dataset.sourceUrl = fallback;
      video.src = fallback;
      video.load();
      if (autoplay) requestVideoPlayback(video);
    };
    video.dataset.loadTimer = String(window.setTimeout(tryFallback, autoplay ? 4500 : 3200));
  }

  const videoPlayRequests = new WeakMap();
  function requestVideoPlayback(video, userInitiated = false) {
    if (!video || !video.isConnected || video.ended || (!userInitiated && video.dataset.played === "true")) return Promise.resolve(false);
    if (videoPlayRequests.has(video)) return videoPlayRequests.get(video);
    video.playsInline = true;
    if (userInitiated) { video.muted = false; video.volume = 1; }
    const play = async () => {
      try {
        await video.play();
        delete video.dataset.flPlaybackBlocked;
        return true;
      } catch (error) {
        if (!video.isConnected || video.ended) return false;
        if (error?.name === "NotAllowedError" && !video.muted) {
          video.muted = true;
          try { await video.play(); delete video.dataset.flPlaybackBlocked; return true; } catch (mutedError) { error = mutedError; }
        }
        if (error?.name !== "AbortError") {
          video.dataset.flPlaybackBlocked = "true";
          if (state.lightbox?.contains(video)) updateStatus("视频未能自动播放，请点击视频播放控件");
        }
        return false;
      }
    };
    const pending = play().finally(() => videoPlayRequests.delete(video));
    videoPlayRequests.set(video, pending);
    return pending;
  }

  function createVideoElement(url, options = {}) {
    const {
      autoplay = false,
      controls = false,
      preload = "auto",
      keepFirstFrame = false,
      allowFallback = true,
      muted = true,
      loop = true,
      startTime = 0,
      previewTime = 0,
      previewMode = "seek",
      deferSource = false
    } = typeof options === "boolean"
      ? { autoplay: options, controls: options, preload: options ? "auto" : "metadata", keepFirstFrame: !options }
      : options;
    const video = document.createElement("video");
    const poster = state.posterByImage.get(keyForUrl(url));
    if (poster) video.poster = poster;
    if (previewMode === "canvas") video.crossOrigin = "anonymous";
    video.muted = muted;
    video.defaultMuted = muted;
    video.volume = muted ? 0 : 1;
    video.loop = loop;
    video.autoplay = autoplay;
    video.playsInline = true;
    video.controls = controls;
    video.preload = preload;
    video.dataset.allowFallback = allowFallback ? "true" : "false";
    video.dataset.previewMode = previewMode;
    video.dataset.previewTime = String(previewTime || 0);
    video.referrerPolicy = shouldKeepReferrer(url) ? "no-referrer-when-downgrade" : "no-referrer";
    video.addEventListener("loadedmetadata", () => {
      if (startTime > 0 && Number.isFinite(video.duration) && startTime < video.duration - 0.5) {
        try {
          video.currentTime = startTime;
        } catch {
          // Some remote media sources reject seeking before enough data is buffered.
        }
      } else if (keepFirstFrame && (previewMode === "seek" || previewMode === "canvas") && previewTime > 0 && Number.isFinite(video.duration) && video.duration > 0.8) {
        try {
          video.currentTime = Math.min(previewTime, Math.max(0, video.duration - 0.25));
        } catch {
          // Keep the first decoded frame if the browser rejects preview seeking.
        }
      }
      scheduleMasonryLayout();
    }, { once: true });
    video.addEventListener("loadeddata", () => {
      clearTimeout(Number(video.dataset.loadTimer || 0));
      if (keepFirstFrame) {
        if (previewMode === "play" && previewTime > 0) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      }
      scheduleMasonryLayout();
    });
    video.addEventListener("timeupdate", () => {
      if (!keepFirstFrame || previewMode !== "play" || previewTime <= 0) return;
      if (video.currentTime < previewTime) return;
      video.pause();
      scheduleMasonryLayout();
    });
    video.addEventListener("seeked", () => {
      if (keepFirstFrame && previewMode === "canvas") {
        captureVideoPreviewFrame(video);
        return;
      }
      if (keepFirstFrame) video.pause();
      scheduleMasonryLayout();
    });
    video.addEventListener("canplay", () => {
      clearTimeout(Number(video.dataset.loadTimer || 0));
      if (autoplay) requestVideoPlayback(video);
    });
    video.addEventListener("playing", () => {
      video.dataset.played = "true";
      clearTimeout(Number(video.dataset.loadTimer || 0));
    });
    video.addEventListener("error", () => {
      if (video.currentTime > 0 || video.dataset.played === "true") return;
      if (video.dataset.allowFallback === "false") return;
      if (video.dataset.fallbackTried === "true") return;
      const fallback = alternateVideoUrl(video.currentSrc || video.src || video.dataset.sourceUrl || url);
      if (!fallback) return;
      video.dataset.fallbackTried = "true";
      setVideoSourceWithFallback(video, fallback, autoplay);
    });
    if (deferSource) {
      video.dataset.sourceUrl = url;
    } else {
      setVideoSourceWithFallback(video, url, autoplay);
    }
    return video;
  }

  async function collectX810114ProfileFromApi() {
    const generation = state.collectionGeneration;
    const signal = state.collectionController.signal;
    const name = x810114ProfileName();
    if (!name) return false;
    updateStatus("读取站点数据");
    const apiUrl = `https://x.moonchan.xyz/api/twitter/${encodeURIComponent(name)}.json.gz?t=${new Date().toISOString().slice(0, 10)}`;
    const res = await fetch(apiUrl, { credentials: "omit", cache: "no-store", signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (signal.aborted || generation !== state.collectionGeneration) return false;
    const timeline = Array.isArray(data.timeline) ? data.timeline : [];
    state.expectedImages = Number(data.total_urls || timeline.length || 0);
    let added = 0;
    for (const item of timeline) {
      if (isBlockedPromoItem(item)) continue;
      const url = x810114MediaUrl(item);
      if (url && MEDIA_EXT.test(url) && addImage(url, "", x810114PosterUrl(item))) added += 1;
    }
    state.x810114ApiMode = added > 0;
    renderImages();
    updateStatus(`已收集 ${state.images.length} 张`);
    return added > 0;
  }

  async function prepareGenericX810114Page() {
    const generation = state.collectionGeneration;
    const isCurrent = () => generation === state.collectionGeneration && !state.collectionController.signal.aborted;
    if (!isX810114ProfilePage()) {
      collectFromDocument(document, location.href);
      updateStatus(`已收集 ${state.images.length} 张`);
      return;
    }
    try {
      if (await collectX810114ProfileFromApi()) return;
    } catch {
      if (!isCurrent()) return;
      updateStatus("接口失败，改用页面收集");
    }
    if (!isCurrent()) return;
    const expand = findButtonByText(/展开全部/);
    if (expand) {
      updateStatus("正在展开全部");
      expand.click();
      await sleep(900);
    }
    if (!isCurrent()) return;
    collectFromDocument(document, location.href);
    updateStatus(`已收集 ${state.images.length} 张`);
  }

  function startGenericObserver() {
    if (!isSupportedPage() || isPhotoGalleryPage() || state.observer) return;
    if (isX810114ProfilePage() && state.x810114ApiMode) return;
    state.observer = new MutationObserver((mutations) => {
      if (mutations.every((mutation) => {
        const target = mutation.target;
        return state.root?.contains(target) || state.launch?.contains(target);
      })) return;
      clearTimeout(state.genericCollectTimer);
      state.genericCollectTimer = setTimeout(() => {
        const before = state.images.length;
        collectFromDocument(document, location.href);
        if (state.images.length > before) updateStatus(`新增 ${state.images.length - before} 张`);
      }, 160);
    });
    state.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "srcset", "data-src", "data-original", "style"]
    });
  }

  function stopGenericObserver() {
    state.observer?.disconnect();
    state.observer = null;
    clearTimeout(state.genericCollectTimer);
    state.genericCollectTimer = 0;
    clearInterval(state.originalScrollTimer);
    state.originalScrollTimer = 0;
  }

  function rememberExpectedImageCount(doc) {
    const base = doc.documentElement?.dataset?.xivBase || location.href;
    if (isPornpicsGalleryPage(base)) return;
    if (isKnownGalleryUrl(base)) {
      const pagerMax = maxPagerNumberFromDocument(doc);
      if (pagerMax > state.expectedImages) state.expectedImages = pagerMax;
      return;
    }
    const text = doc.body?.textContent || "";
    const match = text.match(/(?:^|\s)(\d{2,5})\s*P(?:\s|$)/i)
      || text.match(/\((\d{2,5})\s*photos?\)/i)
      || text.match(/\b(\d{2,5})\s*photos?\b/i)
      || text.match(/下载\s*(\d{2,5})/);
    const count = Number(match?.[1] || 0);
    if (count > state.expectedImages && count < 20000) state.expectedImages = count;
  }

  function backgroundImageUrls(styleText, base) {
    if (!styleText) return [];
    const urls = [];
    const re = /url\((['"]?)(.*?)\1\)/gi;
    let match;
    while ((match = re.exec(styleText))) {
      const url = absoluteUrl(match[2], base);
      if (url) urls.push(url);
    }
    return urls;
  }

  function collectFallbackImageUrls(doc, base) {
    const html = doc.documentElement?.innerHTML || "";
    const urls = new Set();
    const patterns = [
      /(?:src|href|poster|file|zoomfile|data-file|data-zoomfile|data-src|data-original|data-lazy-src|data-url|data-full|data-large)=["']([^"']+\.(?:gif|jpe?g|png|webp|avif|mp4|webm|mov|m4v)(?:[^"']*)?)["']/gi,
      /(?:src|href|file|zoomfile|data-file|data-zoomfile)=["']([^"']*forum\.php\?mod=attachment[^"']*)["']/gi,
      /url\((['"]?)([^'")]+\.(?:gif|jpe?g|png|webp|avif|mp4|webm|mov|m4v)(?:[^'")]*)?)\1\)/gi,
      /https?:\\?\/\\?\/[^"'()<>\\\s]+\.(?:gif|jpe?g|png|webp|avif|mp4|webm|mov|m4v)(?:\?[^"'()<>\\\s]*)?/gi
    ];

    for (const re of patterns) {
      let match;
      while ((match = re.exec(html))) {
        const raw = unescapeEmbeddedUrl(match[2] || match[1] || match[0]);
        const url = absoluteUrl(raw, base);
        if (!url) continue;
        if (BAD_IMAGE_RE.test(url) || isAdMedia(url) || isX810114Avatar(url) || isKnownXchinaPromoImage(url, null, base) || (STATIC_ASSET_RE.test(url) && !isDiscuzAttachmentUrl(url))) continue;
        if (isXchinaPhotoUrl(base)) {
          const album = siteAlbumIdFromUrl(base);
          const imageAlbum = siteAlbumIdFromUrl(url);
          if (album && imageAlbum && album !== imageAlbum) continue;
          let host = "";
          try { host = new URL(url, base).hostname; } catch {}
          if (album && /(^|\.)upload\.xchina\.io$/i.test(host) && !imageAlbum) continue;
        }
        if (!isPhotoGalleryPage(base) && !isGenericX810114Page()) {
          const genericLikelyPhoto = /\/(upload|uploads|media|photos?|files?)\//i.test(url)
            || /(?:\d{3,}|[_-]\d+)\.(?:avif|gif|jpe?g|png|webp)(?:[?#].*)?$/i.test(url)
            || isDiscuzAttachmentUrl(url);
          if (!genericLikelyPhoto) continue;
        }
        urls.add(url);
      }
    }

    let added = 0;
    for (const url of urls) {
      if (addImage(url)) added += 1;
    }
    return added;
  }

  function articleContainers(doc) {
    const selectors = [
      "article",
      "#read_tpc",
      "#content",
      "#article",
      ".article",
      ".content",
      ".detail",
      ".post",
      ".entry",
      ".main",
      "[class*='article' i]",
      "[class*='content' i]",
      "[class*='detail' i]",
      "[id*='article' i]",
      "[id*='content' i]"
    ].join(",");
    const nodes = Array.from(doc.querySelectorAll(selectors));
    return nodes.length ? nodes : [doc.body || doc.documentElement];
  }

  function collectArticleImageUrls(doc, base) {
    const urls = new Set();

    function remember(raw) {
      const url = absoluteUrl(unescapeEmbeddedUrl(raw), base);
      if (!url || (!MEDIA_EXT.test(url) && !isDiscuzAttachmentUrl(url))) return;
      if (BAD_IMAGE_RE.test(url) || isX810114Avatar(url)) return;
      const path = new URL(url).pathname;
      const likelyArticleMedia = /\/(upload|uploads|media|photos?|files?|art|attachment)\//i.test(path)
        || /(?:^|[/_-])\d{2,}(?:[/_-]\d{2,})*[/_-][A-Za-z0-9_-]{6,}\.(?:avif|gif|jpe?g|png|webp)(?:[?#].*)?$/i.test(url)
        || isDiscuzAttachmentUrl(url);
      if (!likelyArticleMedia) return;
      if (STATIC_ASSET_RE.test(url) && !/\/(upload|uploads|media|photos?|files?|art|attachment)\//i.test(path)) return;
      urls.add(url);
    }

    for (const container of articleContainers(doc)) {
      container.querySelectorAll?.("img, source, a, meta, link").forEach((node) => {
        ["src", "currentSrc", "href", "content", "poster", "file", "zoomfile", "data-file", "data-zoomfile", "data-src", "data-original", "data-lazy-src", "data-url", "data-full", "data-large"].forEach((attr) => {
          const value = attr === "currentSrc" ? node.currentSrc : node.getAttribute?.(attr);
          if (value) remember(value);
        });
        const srcset = node.getAttribute?.("srcset") || node.getAttribute?.("data-srcset");
        if (srcset) {
          srcset.split(",").map((item) => item.trim().split(/\s+/)[0]).filter(Boolean).forEach(remember);
        }
      });
      container.querySelectorAll?.("[style]").forEach((node) => {
        backgroundImageUrls(node.getAttribute("style"), base).forEach(remember);
      });
      const html = container.innerHTML || "";
      const re = /(?:https?:\\?\/\\?\/|\/\/|\/)[^"'()<>\\\s]+\.(?:gif|jpe?g|png|webp|avif|mp4|webm|mov|m4v)(?:\?[^"'()<>\\\s]*)?/gi;
      let match;
      while ((match = re.exec(html))) remember(match[0]);
    }

    let added = 0;
    for (const url of urls) {
      if (addImage(url)) added += 1;
    }
    return added;
  }

  function collectVisibleLargeImages(doc, base) {
    if (doc !== document) return 0;
    let added = 0;
    doc.querySelectorAll("img").forEach((img) => {
      const url = imageCandidateFromImg(img, base);
      if (!url || !isMediaUrl(url) || BAD_IMAGE_RE.test(url) || isAdMediaUrl(url)) return;
      if (STATIC_ASSET_RE.test(url) && !isDiscuzAttachmentUrl(url)) return;
      const rect = img.getBoundingClientRect();
      const displayLarge = rect.width >= 140 && rect.height >= 140;
      const naturalLarge = img.naturalWidth >= 180 && img.naturalHeight >= 140;
      if (!displayLarge && !naturalLarge) return;
      if (addImage(url, absoluteUrl(closestHref(img, base), base))) added += 1;
    });
    return added;
  }

  function discoverPageLinksFromDocument(doc, base) {
    const pageNums = new Set();
    let prefixUrl = "";
    const centerPage = pageNumberFromUrl(base) || pageNumberFromUrl(location.href) || 1;
    const discoveryWindow = galleryDiscoveryWindow(base);

    function rememberPage(url) {
      if (!sameGalleryPage(url, base)) return false;
      const parsed = new URL(url);
      const pageNumber = pageNumberFromUrl(parsed.href);
      if (pageNumber) pageNums.add(pageNumber);
      prefixUrl = galleryPrefixFromUrl(parsed.href) || prefixUrl;
      if (pageNumber && Math.abs(pageNumber - centerPage) <= discoveryWindow) {
        state.pageUrls.add(url);
      }
      return true;
    }

    rememberPage(base);

    doc.querySelectorAll("a[href]").forEach((a) => {
      const href = absoluteUrl(a.getAttribute("href"), base);
      const isPageLink = rememberPage(href);
      const label = (a.textContent || "").trim();
      if (isPageLink && /^\d{1,4}$/.test(label)) pageNums.add(Number(label));
    });

    doc.querySelectorAll("a, button, [role='button'], li, span").forEach((node) => {
      const pageNumber = pagerNumberFromNode(node);
      if (pageNumber) pageNums.add(pageNumber);
    });
    const pagerMax = maxPagerNumberFromDocument(doc);
    if (pagerMax) pageNums.add(pagerMax);

    const maxPage = Math.max(0, ...pageNums);
    if (!prefixUrl || maxPage < 2) return;
    if (isKnownGalleryUrl(base) && maxPage > state.expectedImages) state.expectedImages = maxPage;

    const startPage = Math.max(1, centerPage - discoveryWindow);
    const endPage = Math.min(maxPage, centerPage + discoveryWindow);
    for (let i = startPage; i <= endPage; i += 1) {
      if ([...state.pageUrls].some((url) => pageNumberFromUrl(url) === i)) continue;
      state.pageUrls.add(galleryPageUrlFromPrefix(prefixUrl, i));
    }
  }

  function galleryDiscoveryWindow(url = location.href) {
    if (isKnownGalleryUrl(url)) return 1000;
    return isZttaotuUrl(url) ? 120 : GALLERY_PAGE_WINDOW;
  }

  function galleryFetchLimit() {
    const current = activeGalleryQueueUrl();
    if (isKnownGalleryUrl(current)) return SITE_ALBUM_FETCH_BATCH;
    return isZttaotuUrl(current) ? Math.max(GALLERY_FETCH_BATCH, state.pageUrls.size) : GALLERY_FETCH_BATCH;
  }

  function pagerNumberFromNode(node) {
    const label = (node.textContent || "").trim();
    if (!/^\d{1,4}$/.test(label)) return 0;
    if (!hasPagerContext(node)) return 0;
    const value = Number(label);
    return value >= 1 && value <= 1000 ? value : 0;
  }

  function hasPagerContext(node) {
    let current = node;
    for (let depth = 0; current && depth < 5; depth += 1) {
      const marker = [
        current.id,
        current.className,
        current.getAttribute?.("role"),
        current.getAttribute?.("aria-label")
      ].join(" ");
      if (/(page|pager|pagination|laypage|paginator|分页|页码)/i.test(marker)) return true;
      current = current.parentElement;
    }
    const parentText = (node.parentElement?.textContent || "").replace(/\s+/g, " ").trim();
    return /1\s*2\s*3.*(\.\.\.|…).*?\d{1,4}/.test(parentText) || /上一页|下一页|首页|尾页/.test(parentText);
  }

  function maxPagerNumberFromDocument(doc) {
    let max = 0;
    if (isKnownGalleryUrl(doc.documentElement?.dataset?.xivBase || location.href)) {
      const text = (doc.body?.textContent || "").replace(/\s+/g, " ").trim();
      for (const match of text.matchAll(/\b\d{1,4}\s*\/\s*(\d{1,4})\b/g)) {
        const value = Number(match[1]);
        if (value > max && value <= 1000) max = value;
      }
    }
    doc.querySelectorAll("nav, [class*='page' i], [class*='pager' i], [class*='pagination' i], [class*='laypage' i], [role='navigation']").forEach((node) => {
      const text = (node.textContent || "").replace(/\s+/g, " ").trim();
      if (!/(\.\.\.|…)|上一页|下一页|首页|尾页/.test(text)) return;
      for (const match of text.matchAll(/\b(\d{1,5})\b/g)) {
        const value = Number(match[1]);
        if (value > max && value < 20000) max = value;
      }
    });
    return max;
  }

  function sameGalleryPage(url, base = activeGalleryQueueUrl()) {
    if (!url) return false;
    try {
      const currentPrefix = galleryPrefixFromUrl(base || location.href);
      const candidatePrefix = galleryPrefixFromUrl(url);
      return !!currentPrefix && currentPrefix === candidatePrefix && !!pageNumberFromUrl(url);
    } catch {
      return false;
    }
  }

  function galleryPrefixFromUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      if (/zttaotu\.com$/i.test(parsed.hostname) && ZTTAOTU_PAGE_RE.test(parsed.pathname)) {
        return new URL(parsed.pathname.replace(/(?:_\d+)?\.html$/i, ""), parsed.origin).href;
      }
      if (PAGE_RE.test(parsed.pathname)) {
        return new URL(parsed.pathname.replace(/\/\d+\.html$/i, "/"), parsed.origin).href;
      }
      if (GALLERY_ROOT_RE.test(parsed.pathname)) {
        return new URL(parsed.pathname.replace(/\.html$/i, "/"), parsed.origin).href;
      }
    } catch {
      return "";
    }
    return "";
  }

  function pageNumberFromUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      const zttaotuMatch = parsed.pathname.match(ZTTAOTU_PAGE_RE);
      if (zttaotuMatch) return Number(zttaotuMatch[2] || 1);
      const pageMatch = parsed.pathname.match(PAGE_RE);
      if (pageMatch) return Number(pageMatch[1]);
      return GALLERY_ROOT_RE.test(parsed.pathname) ? 1 : 0;
    } catch {
      return 0;
    }
  }

  function sortedPageUrls() {
    return [...state.pageUrls].sort((a, b) => {
      return pageNumberFromUrl(a) - pageNumberFromUrl(b);
    });
  }

  function galleryPageUrlFromPrefix(prefixUrl, pageNumber) {
    try {
      const parsed = new URL(prefixUrl, location.href);
      if (/zttaotu\.com$/i.test(parsed.hostname)) {
        return `${parsed.href}${pageNumber === 1 ? "" : `_${pageNumber}`}.html`;
      }
      return new URL(`${pageNumber}.html`, parsed.href).href;
    } catch {
      return "";
    }
  }

  async function fetchRemainingPages(limit = GALLERY_FETCH_BATCH, force = false) {
    const generation = state.collectionGeneration;
    const signal = state.collectionController.signal;
    const isCurrent = () => generation === state.collectionGeneration && !signal.aborted;
    const activeUrl = activeGalleryQueueUrl();
    if (!isPhotoGalleryPage(activeUrl)) {
      updateStatus("当前页模式");
      return;
    }
    if (state.fetching) return;
    const now = Date.now();
    if (!force && now - state.lastGalleryFetchAt < 900) return;
    state.lastGalleryFetchAt = now;
    const maxBatch = isKnownGalleryUrl(activeUrl)
      ? SITE_ALBUM_FETCH_BATCH
      : isZttaotuUrl(activeUrl) ? Math.max(GALLERY_FETCH_BATCH, state.pageUrls.size) : GALLERY_FETCH_BATCH;
    limit = Math.max(1, Math.min(maxBatch, limit));
    state.fetching = true;

    async function fetchPageDoc(url) {
      let lastError = "";
      try {
        const requestController = new AbortController();
        const abort = () => requestController.abort();
        signal.addEventListener("abort", abort, { once: true });
        const timeout = setTimeout(abort, 25000);
        let res;
        try {
          res = await fetch(url, { credentials: "include", cache: "no-store", referrer: activeUrl, signal: requestController.signal });
          if (res.ok) {
            const html = await res.text();
            if (!isCurrent()) throw new DOMException("Collection changed", "AbortError");
            if (!/正在进行安全验证|cloudflare|cf-browser-verification|Just a moment/i.test(html)) {
              const doc = new DOMParser().parseFromString(html, "text/html");
              doc.documentElement.dataset.xivBase = url;
              return doc;
            }
            throw new Error("security page");
          }
        } finally {
          clearTimeout(timeout);
          signal.removeEventListener("abort", abort);
        }
        lastError = `HTTP ${res.status}`;
      } catch (error) {
        if (!isCurrent()) throw error;
        lastError = String(error?.message || error);
      }
      if (isKnownGalleryUrl(url)) {
        try {
          const doc = await fetchSameOriginDocumentViaFrame(url, 22000, signal);
          doc.documentElement.dataset.xivBase = url;
          return doc;
        } catch (error) {
          lastError = `${lastError || "fetch failed"}; frame ${String(error?.message || error)}`;
        }
      }
      throw new Error(lastError || "fetch failed");
    }

    try {
      let loaded = 0;
      let claimed = 0;
      const nextPage = () => {
        if (!isCurrent()) return "";
        if (claimed >= limit) return "";
        const url = sortedPageUrls().find((candidate) => {
          const failure = state.failedPages.get(candidate);
          return !state.fetchedPages.has(candidate) && !state.pendingPages.has(candidate) && !samePageUrl(candidate, activeUrl)
            && (!failure || (failure.attempts < 3 && (force || Date.now() >= failure.retryAt)));
        });
        if (!url) return "";
        state.pendingPages.add(url);
        claimed += 1;
        return url;
      };
      const worker = async () => {
        while (true) {
          const url = nextPage();
          if (!url) break;
          updateStatus(`加载分页 ${loaded + 1}/${state.pageUrls.size}`);
          try {
            const doc = await fetchPageDoc(url);
            if (!isCurrent()) return;
            collectFromDocument(doc, url);
            state.fetchedPages.add(url);
            state.failedPages.delete(url);
            state.galleryFailureCount = state.failedPages.size;
          } catch (error) {
            if (!isCurrent()) return;
            const attempts = (state.failedPages.get(url)?.attempts || 0) + 1;
            state.failedPages.set(url, { attempts, retryAt: Date.now() + attempts * 1000 });
            state.galleryFailureCount = state.failedPages.size;
            debugLog("分页加载异常", { url, error: String(error?.message || error) });
            updateStatus(`分页异常：${String(error?.message || error).slice(0, 36)}`);
          } finally {
            if (isCurrent()) state.pendingPages.delete(url);
            loaded += 1;
            if (isKnownGalleryUrl(activeUrl)) await sleep(160);
          }
        }
      };
      const workers = Math.min(2, Math.max(1, limit));
      await Promise.all(Array.from({ length: workers }, worker));
    } finally {
      if (!isCurrent()) return;
      state.fetching = false;
      const hasMore = sortedPageUrls().some((url) => !state.fetchedPages.has(url) && !samePageUrl(url, activeUrl));
      if (hasMore && state.active) {
        updateStatus(state.galleryFailureCount
          ? `已收集 ${state.images.length} 张，失败 ${state.galleryFailureCount} 页`
          : `已收集 ${state.images.length} 张，继续滚动加载`);
      } else {
        updateStatus(state.galleryFailureCount ? `就绪，失败 ${state.galleryFailureCount} 页` : "就绪");
      }
    }
  }

  function clampLaunchPosition(x, y) {
    const width = state.launch?.offsetWidth || 48;
    const height = state.launch?.offsetHeight || 48;
    const margin = 8;
    return {
      x: Math.max(margin, Math.min(window.innerWidth - width - margin, Math.round(x))),
      y: Math.max(margin, Math.min(window.innerHeight - height - margin, Math.round(y)))
    };
  }

  function applyLaunchSettings() {
    if (!state.launch || !state.settings) return;
    state.launch.dataset.compact = state.settings.launchCompact ? "true" : "false";
    const hasPosition = Number(state.settings.launchX) > 0 || Number(state.settings.launchY) > 0;
    state.launch.dataset.pinned = hasPosition ? "true" : "false";
    if (!hasPosition) {
      state.launch.style.left = "";
      state.launch.style.top = "";
      return;
    }
    const pos = clampLaunchPosition(Number(state.settings.launchX || 0), Number(state.settings.launchY || 0));
    state.launch.style.left = `${pos.x}px`;
    state.launch.style.top = `${pos.y}px`;
  }

  function onLaunchPointerDown(event) {
    if (event.button !== 0) return;
    claimEvent(event);
    event.preventDefault();
    const rect = state.launch.getBoundingClientRect();
    state.launchDrag = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
      moved: false
    };
    state.launch.dataset.dragging = "true";
    state.launch.setPointerCapture?.(event.pointerId);
  }

  function onLaunchPointerMove(event) {
    const drag = state.launchDrag;
    if (!drag || drag.id !== event.pointerId) return;
    claimEvent(event);
    event.preventDefault();
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
    const pos = clampLaunchPosition(drag.left + dx, drag.top + dy);
    state.launch.dataset.pinned = "true";
    state.launch.style.left = `${pos.x}px`;
    state.launch.style.top = `${pos.y}px`;
  }

  function endLaunchDrag(event) {
    const drag = state.launchDrag;
    if (!drag || drag.id !== event.pointerId) return;
    claimEvent(event);
    event.preventDefault();
    state.launch.releasePointerCapture?.(event.pointerId);
    state.launch.dataset.dragging = "false";
    state.launchDrag = null;
    if (!drag.moved) return;
    state.launch.dataset.dragged = "true";
    const rect = state.launch.getBoundingClientRect();
    const pos = clampLaunchPosition(rect.left, rect.top);
    saveSettings({ launchX: pos.x, launchY: pos.y });
  }

  function closePanels(except = "") {
    [state.settingsPanel, state.diagnosticsPanel, state.galleryQueuePanel, state.linkGrabberPanel].forEach((panel) => {
      if (!panel) return;
      if (panel.dataset.panel === except) return;
      panel.dataset.open = "false";
    });
  }

  function toggleSettingsPanel() {
    const open = state.settingsPanel?.dataset.open === "true";
    closePanels(open ? "" : "settings");
    if (state.settingsPanel) state.settingsPanel.dataset.open = open ? "false" : "true";
    syncSettingsPanel();
  }

  function toggleDiagnosticsPanel() {
    const open = state.diagnosticsPanel?.dataset.open === "true";
    closePanels(open ? "" : "diagnostics");
    if (state.diagnosticsPanel) {
      state.diagnosticsPanel.dataset.open = open ? "false" : "true";
      const pre = state.diagnosticsPanel.querySelector("pre");
      if (pre) pre.textContent = diagnosticsText();
    }
  }

  function syncSettingsPanel() {
    if (!state.settingsPanel || !state.settings) return;
    state.settingsPanel.querySelectorAll("[data-setting]").forEach((control) => {
      const key = control.dataset.setting;
      if (control.type === "checkbox") control.checked = !!state.settings[key];
      else control.value = String(state.settings[key] ?? "");
    });
    void syncCd2SettingsPanel();
  }

  async function syncCd2SettingsPanel() {
    if (!state.settingsPanel) return;
    const config = await readCd2Config();
    state.settingsPanel.querySelectorAll("[data-cd2-setting]").forEach((control) => {
      const value = String(config[control.dataset.cd2Setting] ?? "");
      if (control.type === "radio") control.checked = control.value === value;
      else if (document.activeElement !== control) control.value = value;
    });
    const localRow = state.settingsPanel.querySelector("[data-cd2-local-row]");
    if (localRow) localRow.hidden = config.playMode !== "local";
  }

  function cd2ConfigFromSettingsPanel() {
    const current = { ...cd2SessionConfig };
    state.settingsPanel?.querySelectorAll?.("[data-cd2-setting]").forEach((control) => {
      if (control.type === "radio" && !control.checked) return;
      current[control.dataset.cd2Setting] = control.value;
    });
    return normalizeCd2Config(current);
  }

  function setCd2SettingsStatus(text, stateName = "") {
    const node = state.settingsPanel?.querySelector?.(".xiv-cd2-settings-status");
    if (!node) return;
    node.textContent = text;
    node.dataset.state = stateName;
  }

  async function onCd2SettingsAction(event) {
    const button = event.target?.closest?.("[data-cd2-action]");
    if (!button) return;
    const action = button.dataset.cd2Action;
    if (action === "tokens") {
      const config = cd2ConfigFromSettingsPanel();
      window.open(`${config.baseUrl}/?page=tokens`, "_blank", "noopener");
      return;
    }
    const original = button.textContent;
    button.disabled = true;
    button.textContent = action === "test" ? "检测中…" : "保存中…";
    try {
      const config = await writeCd2Config(cd2ConfigFromSettingsPanel());
      if (action === "test") {
        const result = await testCd2Direct(config);
        setCd2SettingsStatus(`连接成功 · ${config.cloudPath} 当前 ${result.count} 项`, "ready");
      } else {
        setCd2SettingsStatus("设置已保存到油猴私有存储。", "ready");
      }
      await probeCd2Bridge();
    } catch (error) {
      setCd2SettingsStatus(String(error?.message || error), "error");
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  function onCd2SettingsChange(event) {
    const control = event.target?.closest?.("[data-cd2-setting]");
    if (!control || control.dataset.cd2Setting !== "playMode") return;
    const localRow = state.settingsPanel?.querySelector?.("[data-cd2-local-row]");
    if (localRow) localRow.hidden = control.value !== "local";
  }

  function onSettingsControlChange(event) {
    const control = event.currentTarget;
    const key = control.dataset.setting;
    const value = control.type === "checkbox" ? control.checked : control.value;
    setSetting(key, value);
    updateStatus("设置已保存");
  }

  function diagnosticsText() {
    const imageCount = state.images.filter((url) => !isVideoUrl(url)).length;
    const videoCount = state.images.filter(isVideoUrl).length;
    const pendingPages = sortedPageUrls().filter((url) => !state.fetchedPages.has(url) && url !== location.href).length;
    const lines = [
      `页面：${location.href}`,
      `站点模式：${isGenericX810114Page() ? "x810114" : isKnownGalleryUrl() ? "已适配套图" : isPhotoGalleryPage() ? "通用套图" : "通用页面"}`,
      `媒体：${state.images.length} 个（图片 ${imageCount}，视频 ${videoCount}）`,
      `已渲染：${state.renderedKeys.size} 个`,
      `分页：发现 ${state.pageUrls.size} 页，已取 ${state.fetchedPages.size} 页，待取 ${pendingPages} 页，失败 ${state.galleryFailureCount} 页`,
      `收藏：${state.favoriteKeys.size} 个`,
      `过滤/去重：${state.rejectedCount} 个`,
      `入口：${state.settings?.launchCompact ? "圆形图标" : "图标文字"}，坐标 ${Math.round(state.settings?.launchX || 0)}, ${Math.round(state.settings?.launchY || 0)}`,
      `设置：列数 ${state.columns}，主题 ${state.settings?.theme || "system"}，自动滚动速度 ${state.autoScrollSpeed}，自动全屏 ${state.settings?.autoFullscreen ? "开" : "关"}，视频预览 ${state.settings?.videoPreview ? "开" : "关"}`
    ];
    return lines.join("\n");
  }

  const PAGE_BOOKMARKS_KEY = "flowlens-page-bookmarks-v1";
  const PAGE_BOOKMARKS_LIMIT = 300;

  function normalizePageBookmarkUrl(url = location.href) {
    try {
      const parsed = new URL(url, location.href);
      parsed.hash = "";
      return parsed.href;
    } catch {
      return String(url || "").split("#")[0];
    }
  }

  function pageBookmarkHost(url) {
    try { return new URL(url, location.href).hostname; } catch { return ""; }
  }

  function parsePageBookmarks(value) {
    try {
      const parsed = typeof value === "string" ? JSON.parse(value) : value;
      return Array.isArray(parsed) ? parsed.filter((item) => item?.url) : [];
    } catch {
      return [];
    }
  }

  async function readPageBookmarks() {
    try {
      if (typeof GM_getValue === "function") {
        return parsePageBookmarks(await GM_getValue(PAGE_BOOKMARKS_KEY, "[]"));
      }
    } catch {}
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        const result = await chrome.storage.local.get(PAGE_BOOKMARKS_KEY);
        return parsePageBookmarks(result?.[PAGE_BOOKMARKS_KEY]);
      }
    } catch {}
    try { return parsePageBookmarks(localStorage.getItem(PAGE_BOOKMARKS_KEY)); } catch { return []; }
  }

  async function writePageBookmarks(items) {
    const clean = items.slice(0, PAGE_BOOKMARKS_LIMIT);
    const value = JSON.stringify(clean);
    let stored = false;
    try {
      if (typeof GM_setValue === "function") {
        await GM_setValue(PAGE_BOOKMARKS_KEY, value);
        stored = true;
      }
    } catch {}
    if (!stored) {
      try {
        if (typeof chrome !== "undefined" && chrome.storage?.local) {
          await chrome.storage.local.set({ [PAGE_BOOKMARKS_KEY]: clean });
          stored = true;
        }
      } catch {}
    }
    if (!stored) {
      try { localStorage.setItem(PAGE_BOOKMARKS_KEY, value); } catch {}
    }
    window.dispatchEvent(new CustomEvent("flowlens:bookmarks-changed", { detail: { items: clean } }));
    return clean;
  }

  function currentPageBookmarkCover() {
    const node = document.querySelector('meta[property="og:image"], meta[name="twitter:image"], #xiv-root .xiv-tile img[src], img[src]');
    const raw = node?.getAttribute?.("content") || node?.getAttribute?.("src") || "";
    try { return raw ? new URL(raw, location.href).href : ""; } catch { return ""; }
  }

  async function syncPageBookmarkControls() {
    const button = state.root?.querySelector('[data-xiv="page-bookmark-toggle"]');
    if (!button) return;
    const currentUrl = normalizePageBookmarkUrl();
    const saved = (await readPageBookmarks()).some((item) => normalizePageBookmarkUrl(item.url) === currentUrl);
    button.dataset.saved = saved ? "true" : "false";
    button.textContent = saved ? "已收藏本页" : "收藏本页";
  }

  async function togglePageBookmarkFromCore() {
    const currentUrl = normalizePageBookmarkUrl();
    const bookmarks = await readPageBookmarks();
    const existing = bookmarks.some((item) => normalizePageBookmarkUrl(item.url) === currentUrl);
    const next = existing
      ? bookmarks.filter((item) => normalizePageBookmarkUrl(item.url) !== currentUrl)
      : [{
          url: currentUrl,
          title: (document.title || pageBookmarkHost(currentUrl) || "未命名页面").replace(/\s+/g, " ").trim(),
          host: pageBookmarkHost(currentUrl),
          cover: currentPageBookmarkCover(),
          mediaCount: state.grid?.querySelectorAll(".xiv-tile").length || 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }, ...bookmarks];
    await writePageBookmarks(next);
    await syncPageBookmarkControls();
    updateStatus(existing ? "已取消收藏当前页面" : "已收藏当前页面");
  }

  function ensureUi() {
    if (state.root) return;
    if (!state.settings) loadSettings();
    loadExtensionSettings();

    const style = document.createElement("style");
    style.textContent = css;
    document.documentElement.appendChild(style);

    state.launch = document.createElement("button");
    state.launch.id = "xiv-launch";
    state.launch.type = "button";
    state.launch.dataset.site = isGenericX810114Page() ? "x810114" : "";
    state.launch.title = "打开瀑光 FlowLens (G)";
    state.launch.innerHTML = `${icons.grid}<span>瀑光</span>`;
    ["pointerdown", "mousedown", "mouseup", "touchstart", "touchend"].forEach((type) => {
      state.launch.addEventListener(type, (event) => event.stopPropagation());
    });
    state.launch.addEventListener("click", (event) => {
      claimEvent(event);
      if (state.launch.dataset.dragged === "true") {
        state.launch.dataset.dragged = "false";
        return;
      }
      openViewer();
    });
    state.launch.addEventListener("pointerdown", onLaunchPointerDown);
    state.launch.addEventListener("pointermove", onLaunchPointerMove);
    state.launch.addEventListener("pointerup", endLaunchDrag);
    state.launch.addEventListener("pointercancel", endLaunchDrag);
    window.addEventListener("pointermove", onLaunchPointerMove, true);
    window.addEventListener("pointerup", endLaunchDrag, true);
    window.addEventListener("pointercancel", endLaunchDrag, true);
    window.addEventListener("flowlens:settings-sync", applySyncedSettings);
    document.documentElement.appendChild(state.launch);
    applyLaunchSettings();

    state.root = document.createElement("div");
    state.root.id = "xiv-root";
    state.root.innerHTML = `
      <div id="xiv-stage"><div id="xiv-grid"></div></div>
      <div id="xiv-topbar">
        <div class="xiv-pill"><span id="xiv-counter">0 张</span><span id="xiv-status">就绪</span></div>
        <div class="xiv-actions">
          <select class="xiv-select" data-xiv="filter" title="筛选媒体">
            <option value="all">全部</option>
            <option value="image">图片</option>
            <option value="video">视频</option>
          </select>
          <button class="xiv-btn" type="button" data-xiv="less" title="减少列数">${icons.gridPlus}<span>减少列数</span></button>
          <button class="xiv-btn" type="button" data-xiv="more" title="增加列数">${icons.gridMinus}<span>增加列数</span></button>
          <button class="xiv-btn" type="button" data-xiv="theme" title="切换主题">${icons.theme}<span>主题</span></button>
          <button class="xiv-btn" type="button" data-xiv="full" title="全屏">${icons.fullscreen}<span>全屏</span></button>
          <button class="xiv-btn" type="button" data-xiv="download" title="下载 ZIP">${icons.download}<span>下载</span></button>
          <button class="xiv-btn" type="button" data-xiv="link-grabber" title="抓取磁力 / ED2K 链接（M）">${icons.magnet}<span>抓取链接</span></button>
          <button class="xiv-btn" type="button" data-xiv="favzip" title="下载收藏 ZIP">${icons.heart}<span>收藏</span></button>
          <button class="xiv-btn" type="button" data-xiv="links" title="导出链接">${icons.link}<span>链接</span></button>
          <button class="xiv-btn" type="button" data-xiv="auto" title="自动滚动">${icons.play}<span>自动</span></button>
          <button class="xiv-btn" type="button" data-xiv="prev-set" title="上一组">${icons.prevSet}<span>上一组</span></button>
          <button class="xiv-btn" type="button" data-xiv="next-set" title="下一组">${icons.nextSet}<span>下一组</span></button>
          <button class="xiv-btn" type="button" data-xiv="queue-list" title="组列表">${icons.queueList}<span>组列表</span></button>
          <button class="xiv-btn" type="button" data-xiv="slower" title="减慢自动滚动">${icons.slow}<span>减速</span></button>
          <button class="xiv-btn" type="button" data-xiv="faster" title="加快自动滚动">${icons.fast}<span>加速</span></button>
          <button class="xiv-btn" type="button" data-xiv="top" title="回到顶部">${icons.top}<span>顶部</span></button>
          <button class="xiv-btn" type="button" data-xiv="diag" title="诊断">${icons.info}<span>诊断</span></button>
          <button class="xiv-btn" type="button" data-xiv="settings" title="设置">${icons.settings}<span>设置</span></button>
          <button class="xiv-btn xiv-btn-icon" type="button" data-xiv="close" title="关闭">${icons.close}</button>
        </div>
      </div>
      <div id="xiv-page-bookmarks-controls" aria-label="页面收藏">
        <button type="button" data-xiv="page-bookmark-toggle">收藏本页</button>
        <button type="button" data-xiv="page-bookmark-list">收藏列表</button>
      </div>
      <div class="xiv-panel" data-panel="settings">
        <h3>瀑光设置</h3>
        <label class="xiv-setting-row"><span>入口缩成圆形图标</span><input type="checkbox" data-setting="launchCompact"></label>
        <label class="xiv-setting-row"><span>打开时自动全屏</span><input type="checkbox" data-setting="autoFullscreen"></label>
        <label class="xiv-setting-row"><span>网格视频预览</span><input type="checkbox" data-setting="videoPreview"></label>
        <label class="xiv-setting-row"><span>主题</span><select class="xiv-select" data-setting="theme"><option value="system">跟随系统</option><option value="dark">深色</option><option value="light">浅色</option></select></label>
        <section class="xiv-cd2-settings" aria-label="CloudDrive2 直连设置">
          <div class="xiv-cd2-settings-head"><strong>CloudDrive2 直连</strong><span>无需磁力播放插件</span></div>
          <div class="xiv-cd2-play-modes" role="radiogroup" aria-label="磁力播放方式">
            <label class="xiv-cd2-play-mode"><input type="radio" name="xiv-cd2-play-mode" value="stream" data-cd2-setting="playMode"><span class="xiv-cd2-play-mode-card"><span class="xiv-cd2-play-mode-icon">▶</span><span class="xiv-cd2-play-mode-copy"><strong>流媒体</strong><small>通过 CloudDrive2 直链打开</small></span></span></label>
            <label class="xiv-cd2-play-mode"><input type="radio" name="xiv-cd2-play-mode" value="local" data-cd2-setting="playMode"><span class="xiv-cd2-play-mode-card"><span class="xiv-cd2-play-mode-icon">▰</span><span class="xiv-cd2-play-mode-copy"><strong>本地文件</strong><small>打开 CloudDrive2 挂载路径</small></span></span></label>
          </div>
          <div class="xiv-cd2-grid">
            <label class="xiv-cd2-field" data-wide="true">服务地址<input type="url" data-cd2-setting="baseUrl" placeholder="http://localhost:19798"></label>
            <label class="xiv-cd2-field" data-wide="true">115 转存目录<input type="text" data-cd2-setting="cloudPath" placeholder="/115/云下载/临时播放"></label>
            <label class="xiv-cd2-field" data-wide="true">API Token<input type="password" data-cd2-setting="apiToken" autocomplete="off" placeholder="CloudDrive2 → API Tokens 中创建"></label>
            <label class="xiv-cd2-field" data-wide="true" data-cd2-local-row hidden>本地挂载目录<input type="text" data-cd2-setting="localMountPath" placeholder="E:\\云下载\\临时播放"><small>浏览器需允许 Tampermonkey 访问 file:// 地址。</small></label>
          </div>
          <div class="xiv-cd2-controls"><button type="button" data-cd2-action="save">保存直连设置</button><button type="button" data-cd2-action="test">测试连接</button><button type="button" data-cd2-action="tokens">打开 Token 页面</button></div>
          <div class="xiv-cd2-settings-status">Token 只保存在油猴/扩展私有存储，不写入当前网页。</div>
        </section>
        <small>入口可以直接拖动，位置会保存。设置会自动保存，刷新网页后完全生效。</small>
      </div>
      <div class="xiv-panel xiv-diagnostics" data-panel="diagnostics">
        <h3>诊断报告</h3>
        <pre></pre>
      </div>
      <div class="xiv-panel xiv-queue-panel" data-panel="queue" aria-label="组列表">
        <div class="xiv-queue-head"><h3>后续组</h3><span class="xiv-queue-count">0 组</span></div>
        <div class="xiv-queue-list"></div>
      </div>
      <div class="xiv-panel xiv-link-panel" data-panel="link-grabber" aria-label="下载链接抓取">
        <div class="xiv-link-head"><h3>页面下载链接</h3><span class="xiv-link-count">0 磁力 · 0 ED2K</span></div>
        <div class="xiv-link-actions"><button type="button" data-link-action="save-all">全部存115</button><button type="button" data-link-action="rescan">重新扫描</button><button type="button" data-link-action="copy-all">复制全部</button><button type="button" data-link-action="export">导出 TXT</button></div>
        <div class="xiv-link-bridge-status">CloudDrive2 直连：等待检测</div>
        <div class="xiv-link-list"></div>
      </div>
      <div id="xiv-lightbox"><img alt=""></div>
    `;
    document.documentElement.appendChild(state.root);
    ["pointerdown", "mousedown", "mouseup", "touchstart", "touchend", "click", "dblclick", "contextmenu"].forEach((type) => {
      state.root.addEventListener(type, (event) => event.stopPropagation());
    });

    state.stage = state.root.querySelector("#xiv-stage");
    state.grid = state.root.querySelector("#xiv-grid");
    state.lightbox = state.root.querySelector("#xiv-lightbox");
    state.counter = state.root.querySelector("#xiv-counter");
    state.status = state.root.querySelector("#xiv-status");
    state.settingsPanel = state.root.querySelector('[data-panel="settings"]');
    state.diagnosticsPanel = state.root.querySelector('[data-panel="diagnostics"]');
    state.galleryQueuePanel = state.root.querySelector('[data-panel="queue"]');
    state.linkGrabberPanel = state.root.querySelector('[data-panel="link-grabber"]');

    state.root.querySelector('[data-xiv="close"]').addEventListener("click", closeViewer);
    state.root.querySelector('[data-xiv="filter"]').addEventListener("change", (event) => setMediaFilter(event.target.value));
    state.root.querySelector('[data-xiv="less"]').addEventListener("click", () => setColumns(state.columns - 1));
    state.root.querySelector('[data-xiv="more"]').addEventListener("click", () => setColumns(state.columns + 1));
    state.root.querySelector('[data-xiv="theme"]').addEventListener("click", toggleTheme);
    state.root.querySelector('[data-xiv="full"]').addEventListener("click", toggleFullscreen);
    state.root.querySelector('[data-xiv="download"]').addEventListener("click", downloadZip);
    state.root.querySelector('[data-xiv="link-grabber"]').addEventListener("click", toggleLinkGrabberPanel);
    state.root.querySelector('[data-xiv="favzip"]').addEventListener("click", () => downloadZip("favorites"));
    state.root.querySelector('[data-xiv="links"]').addEventListener("click", exportLinks);
    state.root.querySelector('[data-xiv="auto"]').addEventListener("click", toggleAutoScroll);
    state.root.querySelector('[data-xiv="prev-set"]').addEventListener("click", () => navigateGalleryQueue(-1));
    state.root.querySelector('[data-xiv="next-set"]').addEventListener("click", () => navigateGalleryQueue(1));
    state.root.querySelector('[data-xiv="queue-list"]').addEventListener("click", toggleGalleryQueuePanel);
    state.galleryQueuePanel.addEventListener("click", (event) => {
      const item = event.target?.closest?.(".xiv-queue-item[data-queue-index]");
      if (item) void jumpToGalleryQueueIndex(item.dataset.queueIndex);
    });
    state.linkGrabberPanel.addEventListener("click", async (event) => {
      const rowButton = event.target?.closest?.("[data-link-row-action][data-link-index]");
      if (rowButton) {
        const item = state.grabbedDownloadLinks[Number(rowButton.dataset.linkIndex)];
        const rowAction = rowButton.dataset.linkRowAction;
        if (!item) return;
        if (rowAction === "copy" && await copyCapturedText(item.url)) {
          rowButton.textContent = "已复制";
          window.setTimeout(() => { if (rowButton.isConnected) rowButton.textContent = "复制"; }, 900);
        }
        if (rowAction === "save") void runCd2Action("save", [item.url], rowButton);
        if (rowAction === "play") void runCd2Action("play-browser", [item.url], rowButton);
        return;
      }
      const action = event.target?.closest?.("[data-link-action]")?.dataset.linkAction;
      if (action === "rescan") scanPageDownloadLinks();
      if (action === "save-all" && state.grabbedDownloadLinks.length) {
        const button = event.target.closest("[data-link-action='save-all']");
        void runCd2Action("save", state.grabbedDownloadLinks.map((item) => item.url), button);
      }
      if (action === "copy-all" && state.grabbedDownloadLinks.length) {
        const ok = await copyCapturedText(state.grabbedDownloadLinks.map((item) => item.url).join("\n"));
        updateStatus(ok ? `已复制 ${state.grabbedDownloadLinks.length} 条链接` : "复制失败");
      }
      if (action === "export" && state.grabbedDownloadLinks.length) {
        downloadTextFile(state.grabbedDownloadLinks.map((item) => item.url).join("\n"), `flowlens-download-links-${state.grabbedDownloadLinks.length}.txt`);
      }
    });
    state.root.querySelector('[data-xiv="slower"]').addEventListener("click", () => setAutoScrollSpeed(state.autoScrollSpeed - 1));
    state.root.querySelector('[data-xiv="faster"]').addEventListener("click", () => setAutoScrollSpeed(state.autoScrollSpeed + 1));
    state.root.querySelector('[data-xiv="top"]').addEventListener("click", () => state.stage.scrollTo({ top: 0, behavior: "smooth" }));
    state.root.querySelector('[data-xiv="diag"]').addEventListener("click", toggleDiagnosticsPanel);
    state.root.querySelector('[data-xiv="settings"]').addEventListener("click", toggleSettingsPanel);
    state.root.querySelector('[data-xiv="page-bookmark-toggle"]').addEventListener("click", () => {
      void togglePageBookmarkFromCore();
    });
    state.root.querySelector('[data-xiv="page-bookmark-list"]').addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("flowlens:bookmark-list"));
    });
    state.root.querySelectorAll("[data-setting]").forEach((control) => {
      control.addEventListener("change", onSettingsControlChange);
    });
    state.settingsPanel.addEventListener("click", onCd2SettingsAction);
    state.settingsPanel.addEventListener("change", onCd2SettingsChange);
    state.stage.addEventListener("scroll", onScroll, { passive: true });
    state.stage.addEventListener("wheel", cancelViewerPositionRestoreForUser, { passive: true });
    state.stage.addEventListener("touchstart", cancelViewerPositionRestoreForUser, { passive: true });
    state.stage.addEventListener("pointerdown", cancelViewerPositionRestoreForUser, { passive: true });
    state.stage.addEventListener("click", onStageCaptureClick, true);
    state.stage.addEventListener("pointerdown", onStagePointerDown);
    state.stage.addEventListener("pointermove", onStagePointerMove);
    state.stage.addEventListener("pointerup", endStageSwipe);
    state.stage.addEventListener("pointercancel", endStageSwipe);
    state.lightbox.addEventListener("click", onLightboxClick);
    state.lightbox.addEventListener("wheel", onLightboxWheel, { passive: false });
    state.lightbox.addEventListener("pointerdown", onLightboxPointerDown);
    state.lightbox.addEventListener("pointermove", onLightboxPointerMove);
    state.lightbox.addEventListener("pointerup", endLightboxDrag);
    state.lightbox.addEventListener("pointercancel", endLightboxDrag);
    window.addEventListener("click", onLightboxClick, true);
    window.addEventListener("wheel", onLightboxWheel, { capture: true, passive: false });
    window.addEventListener("message", onVideoFrameMessage);
    window.addEventListener("keydown", onKeydown, true);
    window.addEventListener("keyup", onKeyRelease, true);
    window.addEventListener("keypress", onKeyRelease, true);
    window.addEventListener("beforeunload", saveViewerPosition);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") saveViewerPosition();
    });
    state.root.addEventListener("pointerdown", (event) => {
      const queueOpen = state.galleryQueuePanel?.dataset.open === "true";
      const linksOpen = state.linkGrabberPanel?.dataset.open === "true";
      if (!queueOpen && !linksOpen) return;
      if (event.target?.closest?.('[data-panel="queue"], [data-xiv="queue-list"], [data-panel="link-grabber"], [data-xiv="link-grabber"]')) return;
      if (state.galleryQueuePanel) state.galleryQueuePanel.dataset.open = "false";
      if (state.linkGrabberPanel) state.linkGrabberPanel.dataset.open = "false";
    });
    watchSystemTheme();
    syncSettingsPanel();
    void syncPageBookmarkControls();
    setColumns(state.columns, false);
    refreshGalleryQueue();
    startGalleryQueueObserver();
  }

  function watchSystemTheme() {
    try {
      const query = window.matchMedia?.("(prefers-color-scheme: dark)");
      query?.addEventListener?.("change", () => {
        if (state.themeManual) return;
        state.theme = systemTheme();
        if (state.root) state.root.dataset.theme = state.theme;
      });
    } catch {
      // Theme following is best-effort on older mobile browsers.
    }
  }

  function renderImages() {
    if (!state.grid) return;
    let queued = 0;
    for (let i = 0; i < state.images.length; i += 1) {
      const url = state.images[i];
      const key = keyForUrl(url);
      if (state.renderedKeys.has(key)) continue;
      state.renderedKeys.add(key);
      state.renderQueue.push({ url, index: i, key });
      queued += 1;
    }
    if (queued) scheduleRenderQueue();
    syncTileIndexes();
    updateCounter();
    scheduleRestoreViewerPosition();
  }

  function scheduleRenderQueue() {
    if (state.renderFrame || !state.renderQueue.length) return;
    if (state.lightbox?.dataset.active === "true") return;
    state.renderFrame = requestAnimationFrame(processRenderQueue);
  }

  function processRenderQueue() {
    state.renderFrame = 0;
    if (!state.grid || !state.renderQueue.length) return;
    if (state.lightbox?.dataset.active === "true") return;
    const fragment = document.createDocumentFragment();
    const start = performance.now();
    let created = 0;
    const maxBatch = state.renderStartedAt ? state.renderBatchSize : Math.max(10, Math.min(24, state.renderBatchSize + 6));
    if (!state.renderStartedAt) state.renderStartedAt = Date.now();

    while (state.renderQueue.length && created < maxBatch && performance.now() - start < 8) {
      const item = state.renderQueue.shift();
      const index = Math.max(0, Math.min(state.images.length - 1, item.index));
      const url = state.images[index] || item.url;
      const key = keyForUrl(url) || item.key;
      const tile = document.createElement("div");
      tile.className = "xiv-tile";
      tile.tabIndex = 0;
      tile.role = "button";
      tile.dataset.index = String(index);
      tile.dataset.url = url;
      tile.dataset.urlKey = key;
      tile.hidden = !mediaMatchesFilter(url);
      const media = isVideoUrl(url)
        ? createVideoPreviewElement(url, index)
        : createImageElement(url, index);
      if (media.tagName === "VIDEO") {
        media.controls = false;
      }
      const label = document.createElement("span");
      label.textContent = String(index + 1).padStart(2, "0");
      tile.append(media, label);
      if (isVideoUrl(url)) {
        const mark = document.createElement("i");
        mark.className = "xiv-video-mark";
        mark.setAttribute("aria-hidden", "true");
        tile.appendChild(mark);
      }
      tile.addEventListener("pointerdown", (event) => {
        tile.dataset.downX = String(event.clientX);
        tile.dataset.downY = String(event.clientY);
      });
      tile.addEventListener("click", (event) => {
        claimEvent(event);
        if (event.button !== 0) return;
        if (Date.now() < state.suppressLightboxUntil) return;
        const dx = Math.abs(event.clientX - Number(tile.dataset.downX || event.clientX));
        const dy = Math.abs(event.clientY - Number(tile.dataset.downY || event.clientY));
        if (dx > 8 || dy > 8) return;
        if (!state.autoScroll && Date.now() - state.lastStageScrollAt < 120 && (dx > 2 || dy > 2)) return;
        state.lightboxGestureToken = Date.now();
        openLightbox(Number(tile.dataset.index || index));
      });
      tile.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          claimEvent(event);
          if (Date.now() < state.suppressLightboxUntil) return;
          state.lightboxGestureToken = Date.now();
          openLightbox(Number(tile.dataset.index || index));
        }
      });
      fragment.appendChild(tile);
      created += 1;
    }
    if (fragment.childNodes.length) {
      ensureMasonryColumns();
      appendTilesToMasonry([...fragment.childNodes]);
      observeDeferredImages();
    }
    updateCounter();
    if (state.renderQueue.length) {
      scheduleRenderQueue();
    } else {
      state.renderStartedAt = 0;
      syncTileIndexes();
      scheduleRestoreViewerPosition();
      window.dispatchEvent(new CustomEvent("flowlens:gallery-items-rendered"));
    }
  }

  function ensureImageLoadObserver() {
    if (state.imageLoadObserver || !state.stage || typeof IntersectionObserver !== "function") return;
    state.imageLoadObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const img = entry.target;
        img.loading = "eager";
        if (img.fetchPriority !== "high") img.fetchPriority = "auto";
        delete img.dataset.xivDeferredImage;
        state.imageLoadObserver?.unobserve(img);
      }
    }, { root: state.stage, rootMargin: "900px 0px", threshold: 0.01 });
  }

  function observeDeferredImages() {
    ensureImageLoadObserver();
    if (!state.imageLoadObserver) return;
    state.grid?.querySelectorAll('img[data-xiv-deferred-image="true"]').forEach((img) => {
      state.imageLoadObserver.observe(img);
    });
  }

  function useSimpleGridLayout() {
    return false;
  }

  function allTiles() {
    return [...(state.grid?.querySelectorAll(".xiv-tile") || [])]
      .sort((a, b) => Number(a.dataset.index || 0) - Number(b.dataset.index || 0));
  }

  function syncTileIndexes() {
    const indexByKey = new Map(state.images.map((url, index) => [keyForUrl(url), index]));
    allTiles().forEach((tile) => {
      const i = indexByKey.get(tile.dataset.urlKey || keyForUrl(tile.dataset.url || ""));
      if (!Number.isInteger(i) || i < 0) return;
      tile.dataset.index = String(i);
      const label = tile.querySelector("span");
      const text = String(i + 1).padStart(2, "0");
      if (label && label.textContent !== text) label.textContent = text;
    });
  }

  function setMediaFilter(value) {
    state.mediaFilter = ["image", "video"].includes(value) ? value : "all";
    const select = state.root?.querySelector('[data-xiv="filter"]');
    if (select && select.value !== state.mediaFilter) select.value = state.mediaFilter;
    try {
      localStorage.setItem("flowlens-media-filter-v1", state.mediaFilter);
    } catch {
      // Filter persistence is best-effort.
    }
    applyMediaFilter();
    updateCounter();
  }

  function mediaMatchesFilter(url) {
    if (state.mediaFilter === "video") return isVideoUrl(url);
    if (state.mediaFilter === "image") return !isVideoUrl(url);
    return true;
  }

  function filteredImages() {
    return state.images.filter(mediaMatchesFilter);
  }

  function applyMediaFilter() {
    let changed = false;
    allTiles().forEach((tile) => {
      const blocked = tile.dataset.flDuplicate === "true" || !!window.__flowLensMediaFilter?.reasonFor?.(tile.dataset.url, tile);
      const hidden = !mediaMatchesFilter(tile.dataset.url || "") || blocked;
      if (tile.hidden !== hidden) { tile.hidden = hidden; changed = true; }
      if (tile.style.display) tile.style.removeProperty("display");
    });
    if (changed) layoutMasonry();
  }

  function rebuildMasonry() {
    if (!state.grid) return;
    const tiles = allTiles();
    tiles.forEach((tile) => { tile.dataset.estimatedHeight = ""; });
    state.grid.replaceChildren();
    state.masonryColumns = [];
    state.masonryColumnHeights = [];
    ensureMasonryColumns();
    appendTilesToMasonry(tiles);
    applyMediaFilter();
  }

  function ensureMasonryColumns() {
    if (!state.grid) return [];
    const count = Math.max(1, state.columns);
    if (state.masonryColumns.length === count && state.masonryColumns.every((column) => column.isConnected)) {
      return state.masonryColumns;
    }
    const tiles = allTiles();
    state.grid.replaceChildren();
    state.masonryColumns = Array.from({ length: count }, () => {
      const column = document.createElement("div");
      column.className = "xiv-masonry-column";
      state.grid.appendChild(column);
      return column;
    });
    state.masonryColumnHeights = new Array(count).fill(0);
    appendTilesToMasonry(tiles);
    return state.masonryColumns;
  }

  function appendTilesToMasonry(tiles) {
    if (!tiles.length) return;
    const columns = ensureMasonryColumns();
    if (state.masonryColumnHeights.length !== columns.length) {
      state.masonryColumnHeights = columns.map((column) => columnHeight(column));
    }
    const columnHeights = state.masonryColumnHeights;
    for (const tile of tiles) {
      const index = shortestColumnIndex(columnHeights);
      columns[index]?.appendChild(tile);
      if (!tile.hidden) columnHeights[index] += estimatedTileHeight(tile, columns[index]);
    }
  }

  function shortestColumnIndex(heights) {
    let index = 0;
    for (let i = 1; i < heights.length; i += 1) {
      if (heights[i] < heights[index]) index = i;
    }
    return index;
  }

  function columnHeight(column) {
    return [...column.children].reduce((sum, tile) => sum + (tile.hidden ? 0 : estimatedTileHeight(tile, column)), 0);
  }

  function estimatedTileHeight(tile, column) {
    const cached = Number(tile.dataset.estimatedHeight || 0);
    if (cached > 20) return cached;
    const url = tile.dataset.url || "";
    const media = tile.querySelector("img, video");
    const naturalWidth = media?.naturalWidth || media?.videoWidth || 0;
    const naturalHeight = media?.naturalHeight || media?.videoHeight || 0;
    if (naturalWidth > 0 && naturalHeight > 0) {
      rememberMediaRatio(url, naturalWidth, naturalHeight);
    }
    const ratio = state.mediaRatioByImage.get(keyForUrl(url))
      || ratioFromStyle(media)
      || ratioFromSize(sizeFromUrl(url))
      || ratioFromSize(sizeFromUrl(media?.currentSrc || media?.src || ""))
      || 0;
    const columnWidth = column?.clientWidth || tile.clientWidth || Math.max(160, Math.floor((state.stage?.clientWidth || window.innerWidth || 1000) / Math.max(1, state.columns)));
    if (!ratio) {
      const rect = tile.getBoundingClientRect?.();
      if (rect?.height > 20) {
        const measured = rect.height + masonryGap();
        tile.dataset.estimatedHeight = String(Math.round(measured));
        return measured;
      }
    }
    const estimated = Math.max(80, columnWidth / (ratio || 0.72)) + masonryGap();
    tile.dataset.estimatedHeight = String(Math.round(estimated));
    return estimated;
  }

  function ratioFromSize(size) {
    return size?.width > 0 && size?.height > 0 ? size.width / size.height : 0;
  }

  function ratioFromStyle(media) {
    const raw = media?.style?.aspectRatio || "";
    const match = raw.match(/^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/);
    if (!match) return 0;
    const width = Number(match[1]);
    const height = Number(match[2]);
    return width > 0 && height > 0 ? width / height : 0;
  }

  function masonryGap() {
    const raw = getComputedStyle(state.grid || document.documentElement).getPropertyValue("gap");
    const gap = Number.parseFloat(raw);
    return Number.isFinite(gap) ? gap : 10;
  }

  function layoutMasonry() {
    if (!state.grid) return;
    if (useSimpleGridLayout()) return;
    withStageScrollPreserved(() => {
      const tiles = allTiles();
      tiles.forEach((tile) => { tile.dataset.estimatedHeight = ""; });
      state.grid.replaceChildren();
      state.masonryColumns = [];
      state.masonryColumnHeights = [];
      ensureMasonryColumns();
      appendTilesToMasonry(tiles);
    });
  }

  function withStageScrollPreserved(run) {
    const stage = state.stage;
    const scrollTop = stage?.scrollTop || 0;
    const scrollLeft = stage?.scrollLeft || 0;
    run();
    if (!stage) return;
    stage.scrollTop = scrollTop;
    stage.scrollLeft = scrollLeft;
    requestAnimationFrame(() => {
      stage.scrollTop = scrollTop;
      stage.scrollLeft = scrollLeft;
    });
  }

  function scheduleMasonryLayout() {
    if (!state.active) return;
    clearTimeout(state.masonryLayoutTimer);
    const scrolling = Date.now() - state.lastStageScrollAt < 220;
    const delay = state.renderQueue.length ? 700 : scrolling ? 520 : 240;
    state.masonryLayoutTimer = setTimeout(layoutMasonry, delay);
  }

  function onStageCaptureClick(event) {
    if (!isGenericX810114Page() || !state.active) return;
    const tile = event.target?.closest?.(".xiv-tile");
    if (!tile || !state.stage.contains(tile)) return;
    claimEvent(event);
    if (event.button !== 0) return;
    if (Date.now() < state.suppressLightboxUntil) return;
    const dx = Math.abs(event.clientX - Number(tile.dataset.downX || event.clientX));
    const dy = Math.abs(event.clientY - Number(tile.dataset.downY || event.clientY));
    if (dx > 8 || dy > 8) return;
    if (!state.autoScroll && Date.now() - state.lastStageScrollAt < 120 && (dx > 2 || dy > 2)) return;
    state.lightboxGestureToken = Date.now();
    openLightbox(Number(tile.dataset.index || 0));
  }

  function positionStorageKey() {
    try {
      const parsed = new URL(location.href);
      return `xiv-viewer-position:${parsed.origin}${parsed.pathname}`;
    } catch {
      return `xiv-viewer-position:${location.href.split("#")[0]}`;
    }
  }

  function firstVisibleTile() {
    if (!state.stage) return null;
    const stageRect = state.stage.getBoundingClientRect();
    let best = null;
    let bestDistance = Infinity;
    for (const tile of allTiles()) {
      const rect = tile.getBoundingClientRect();
      if (rect.bottom < stageRect.top + 54) continue;
      const distance = Math.abs(rect.top - (stageRect.top + 54));
      if (distance < bestDistance) {
        best = tile;
        bestDistance = distance;
      }
    }
    return best || allTiles()[0] || null;
  }

  function currentViewerPosition() {
    const lightboxOpen = state.lightbox?.dataset.active === "true";
    const tile = lightboxOpen ? null : firstVisibleTile();
    const index = lightboxOpen ? state.index : Number(tile?.dataset.index || 0);
    return {
      url: state.images[index] || tile?.dataset.url || "",
      index: Number.isFinite(index) ? index : 0,
      scrollTop: Math.max(0, Math.round(state.stage?.scrollTop || 0)),
      mediaFilter: state.mediaFilter,
      lightboxOpen,
      lightboxIndex: state.index,
      lightboxUrl: lightboxOpen ? state.images[state.index] || "" : "",
      time: Date.now()
    };
  }

  function saveViewerPosition() {
    if (!state.active || !state.stage || !state.images.length) return;
    try {
      localStorage.setItem(positionStorageKey(), JSON.stringify(currentViewerPosition()));
    } catch {
      // Some pages restrict storage; position restore is best-effort.
    }
  }

  function scheduleViewerPositionSave() {
    if (!state.active) return;
    clearTimeout(state.positionSaveTimer);
    state.positionSaveTimer = window.setTimeout(saveViewerPosition, 450);
  }

  function loadViewerPosition() {
    try {
      const raw = localStorage.getItem(positionStorageKey());
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || Date.now() - Number(data.time || 0) > 30 * 24 * 60 * 60 * 1000) return null;
      return {
        url: String(data.url || ""),
        index: Math.max(0, Number(data.index || 0)),
        scrollTop: Math.max(0, Number(data.scrollTop || 0)),
        mediaFilter: ["all", "image", "video"].includes(data.mediaFilter) ? data.mediaFilter : "all",
        lightboxOpen: data.lightboxOpen === true,
        lightboxIndex: Math.max(0, Number(data.lightboxIndex || data.index || 0)),
        lightboxUrl: String(data.lightboxUrl || "")
      };
    } catch {
      return null;
    }
  }

  function startViewerPositionRestore() {
    state.restorePosition = loadViewerPosition();
    state.restoreStartedAt = Date.now();
    if (state.restorePosition?.mediaFilter) setMediaFilter(state.restorePosition.mediaFilter);
    scheduleRestoreViewerPosition();
  }

  function scheduleRestoreViewerPosition() {
    if (!state.active || !state.restorePosition || !state.stage) return;
    clearTimeout(state.restoreTimer);
    state.restoreTimer = window.setTimeout(restoreViewerPosition, 90);
  }

  function cancelViewerPositionRestoreForUser(event = null) {
    if (!state.restorePosition || state.restoringPosition) return;
    if (event && event.isTrusted === false) return;
    clearTimeout(state.restoreTimer);
    state.restorePosition = null;
  }

  function restoreViewerPosition() {
    const saved = state.restorePosition;
    if (!state.active || !saved || !state.stage) return;
    const key = saved.url ? keyForUrl(saved.url) : "";
    const tile = key
      ? state.grid?.querySelector(`[data-url-key="${CSS.escape(key)}"]`)
      : allTiles().find((item) => Number(item.dataset.index || 0) === saved.index);

    if (tile) {
      state.restoringPosition = true;
      tile.scrollIntoView({ block: "start", inline: "nearest", behavior: "auto" });
      state.stage.scrollTop = Math.max(0, state.stage.scrollTop - 54);
      requestAnimationFrame(() => { state.restoringPosition = false; });
      if (saved.lightboxOpen) restoreLightboxFromPosition(saved);
      state.restorePosition = null;
      return;
    }

    const timedOut = Date.now() - state.restoreStartedAt > 12000;
    if (!timedOut) {
      if (isPhotoGalleryPage() && !state.fetching && (saved.index >= state.images.length || (key && !state.imageKeys.has(key)))) {
        fetchRemainingPages(galleryFetchLimit(), true);
      }
      scheduleRestoreViewerPosition();
      return;
    }

    state.restoringPosition = true;
    state.stage.scrollTop = Math.min(saved.scrollTop, Math.max(0, state.stage.scrollHeight - state.stage.clientHeight));
    requestAnimationFrame(() => { state.restoringPosition = false; });
    if (saved.lightboxOpen) restoreLightboxFromPosition(saved);
    state.restorePosition = null;
  }

  function restoreLightboxFromPosition(saved) {
    if (!saved?.lightboxOpen || state.lightbox?.dataset.active === "true" || !state.images.length) return;
    const key = saved.lightboxUrl ? keyForUrl(saved.lightboxUrl) : "";
    let index = key ? state.images.findIndex((url) => keyForUrl(url) === key) : -1;
    if (index < 0) index = Math.min(Math.max(0, saved.lightboxIndex || saved.index || 0), state.images.length - 1);
    if (index < 0 || !state.images[index]) return;
    window.setTimeout(() => {
      if (!state.active || state.lightbox?.dataset.active === "true") return;
      openLightbox(index);
    }, 120);
  }

  function updateCounter() {
    if (!state.counter) return;
    const visibleCount = filteredImages().length;
    const suffix = state.mediaFilter === "all" ? "" : ` / 显示 ${visibleCount}`;
    const expected = isPornpicsGalleryPage() ? 0 : state.expectedImages;
    const text = expected ? `${state.images.length}/${state.expectedImages} 张${suffix}` : `${state.images.length} 张${suffix}`;
    if (state.counter.textContent !== text) state.counter.textContent = text;
  }

  function updateStatus(text) {
    if (state.status && state.status.textContent !== text) state.status.textContent = text;
  }

  function setColumns(next, persist = true) {
    state.columns = Math.max(2, Math.min(8, next));
    if (state.grid) state.grid.style.setProperty("--xiv-columns", state.columns);
    if (state.grid) layoutMasonry();
    if (persist) saveSettings({ columns: state.columns });
  }

  function toggleTheme() {
    state.themeManual = true;
    state.theme = state.theme === "dark" ? "light" : "dark";
    state.root.dataset.theme = state.theme;
    saveSettings({ theme: state.theme });
    syncSettingsPanel();
  }

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await state.root.requestFullscreen?.();
  }

  function setAutoScrollSpeed(next) {
    state.autoScrollSpeed = Math.max(1, Math.min(10, next));
    saveSettings({ autoScrollSpeed: state.autoScrollSpeed });
    updateStatus(`速度 ${state.autoScrollSpeed}`);
  }

  function toggleAutoScroll() {
    state.autoScroll = !state.autoScroll;
    state.autoScrollPausedForLightbox = false;
    updateStatus(state.autoScroll ? `自动滚动 ${state.autoScrollSpeed}` : "已暂停");
    if (state.autoScroll) runAutoScroll();
    else cancelAnimationFrame(state.autoScrollFrame);
  }

  function pauseAutoScrollForLightbox() {
    if (!state.autoScroll) return;
    state.autoScrollPausedForLightbox = true;
    state.autoScroll = false;
    cancelAnimationFrame(state.autoScrollFrame);
    updateStatus("已暂停自动滚动");
  }

  function resumeAutoScrollAfterLightbox() {
    if (!state.autoScrollPausedForLightbox || !state.active || !state.stage) return;
    state.autoScrollPausedForLightbox = false;
    state.autoScroll = true;
    updateStatus(`自动滚动 ${state.autoScrollSpeed}`);
    runAutoScroll();
  }

  function runAutoScroll() {
    cancelAnimationFrame(state.autoScrollFrame);
    if (!state.autoScroll || !state.active || !state.stage) return;
    state.autoScrollLastTime = 0;
    state.autoScrollRemainder = 0;
    const step = (timestamp) => {
      if (!state.autoScroll || !state.active || !state.stage) return;
      if (state.lightbox?.dataset.active === "true") return;
      const before = state.stage.scrollTop;
      const elapsed = state.autoScrollLastTime ? Math.min(34, Math.max(0, timestamp - state.autoScrollLastTime)) : 16.67;
      state.autoScrollLastTime = timestamp;
      const distance = state.autoScrollSpeed * 60 * elapsed / 1000 + state.autoScrollRemainder;
      const pixels = Math.max(1, Math.floor(distance));
      state.autoScrollRemainder = distance - pixels;
      state.stage.scrollTop += pixels;
      const nearBottom = state.stage.scrollTop + state.stage.clientHeight > state.stage.scrollHeight - 12;
      if (nearBottom) {
        fetchRemainingPages();
        if (state.stage.scrollTop === before && !state.fetching) {
          state.autoScroll = false;
          updateStatus("已到底部");
          return;
        }
      }
      state.autoScrollFrame = requestAnimationFrame(step);
    };
    state.autoScrollFrame = requestAnimationFrame(step);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function extensionFromUrl(url, contentType) {
    const parsed = new URL(url);
    const format = parsed.searchParams.get("format")?.toLowerCase();
    if (format && ["jpg", "jpeg", "png", "webp", "avif", "gif"].includes(format)) return format === "jpeg" ? "jpg" : format;
    const pathExt = parsed.pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
    if (pathExt && ["jpg", "jpeg", "png", "webp", "avif", "gif", "mp4", "webm", "mov", "m4v"].includes(pathExt)) return pathExt === "jpeg" ? "jpg" : pathExt;
    if (/mp4/i.test(contentType)) return "mp4";
    if (/webm/i.test(contentType)) return "webm";
    if (/quicktime/i.test(contentType)) return "mov";
    if (/gif/i.test(contentType)) return "gif";
    if (/png/i.test(contentType)) return "png";
    if (/webp/i.test(contentType)) return "webp";
    if (/avif/i.test(contentType)) return "avif";
    return "jpg";
  }

  function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function fetchImageViaBackground(url) {
    if (xivUserscriptMode) {
      return userscriptRequest(url, {
        responseType: "arraybuffer",
        headers: {
          "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
        }
      }).then((response) => {
        if (!response.ok || !response.response) return response;
        return {
          ok: true,
          contentType: response.contentType || "",
          base64: arrayBufferToBase64(response.response)
        };
      });
    }

    return new Promise((resolve) => {
      if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
        resolve({ ok: false, error: "extension runtime unavailable" });
        return;
      }
      chrome.runtime.sendMessage({
        type: "XIV_FETCH_IMAGE",
        url,
        referrer: location.href
      }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response);
      });
    });
  }

  function fetchTextViaBackground(url, referrer = location.href) {
    if (xivUserscriptMode) {
      return userscriptRequest(url, {
        responseType: "text",
        headers: {
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      }).then((response) => {
        if (!response.ok) return response;
        return {
          ok: true,
          contentType: response.contentType || "",
          text: response.text || ""
        };
      });
    }

    return new Promise((resolve) => {
      if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
        resolve({ ok: false, error: "extension runtime unavailable" });
        return;
      }
      chrome.runtime.sendMessage({
        type: "XIV_FETCH_TEXT",
        url,
        referrer
      }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response);
      });
    });
  }

  async function fetchHtml(url, referrer = location.href) {
    let lastError = "";
    try {
      const res = await fetch(url, { credentials: "include", cache: "no-store", referrer });
      if (res.ok) return await res.text();
      lastError = `HTTP ${res.status}`;
    } catch (error) {
      lastError = error?.message || String(error);
    }

    const res = await fetchTextViaBackground(url, referrer);
    if (res?.ok) return res.text || "";
    throw new Error(res?.error || lastError || "fetch failed");
  }

  async function fetchImageBytes(url) {
    let lastError = "";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const res = await fetchImageViaBackground(url);
      if (res?.ok && res.base64) {
        return {
          bytes: base64ToBytes(res.base64),
          contentType: res.contentType || ""
        };
      }
      lastError = res?.error || "background failed";
      await sleep(260 + attempt * 500);
    }

    try {
      const res = await fetch(url, { credentials: "include", cache: "force-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return {
        bytes: new Uint8Array(await res.arrayBuffer()),
        contentType: res.headers.get("content-type") || ""
      };
    } catch (error) {
      throw new Error(`${lastError}; page ${error?.message || error}`);
    }
  }

  function detailImageCandidates(doc, base) {
    const urls = [];
    if (isKnownGalleryUrl(base) || siteAlbumIdFromUrl(base)) {
      urls.push(...siteAlbumDirectImageCandidates(doc, base));
    }
    doc.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"], link[rel="image_src"]').forEach((node) => {
      const raw = node.getAttribute("content") || node.getAttribute("href");
      const url = absoluteUrl(raw, base);
      if (url && isMediaUrl(url) && !isAdMedia(url, node)) urls.push(url);
    });

    doc.querySelectorAll("img").forEach((img) => {
      const url = imageCandidateFromImg(img, base);
      if (url && isMediaUrl(url) && !BAD_IMAGE_RE.test(url) && !isAdMedia(url, img) && !isX810114Avatar(url, img)) urls.push(url);
    });
    doc.querySelectorAll("[style]").forEach((el) => {
      for (const url of backgroundImageUrls(el.getAttribute("style"), base)) {
        if (url && isMediaUrl(url) && !BAD_IMAGE_RE.test(url) && !isAdMedia(url, el) && !isX810114Avatar(url, el)) urls.push(url);
      }
    });

    const html = doc.documentElement?.innerHTML || "";
    const re = /https?:\\?\/\\?\/[^"'()<>\\\s]+\.(?:gif|jpe?g|png|webp|avif|mp4|webm|mov|m4v)(?:\?[^"'()<>\\\s]*)?/gi;
    let match;
    while ((match = re.exec(html))) {
      const url = absoluteUrl(unescapeEmbeddedUrl(match[0]), base);
      if (url) urls.push(url);
    }
    const stringRe = /["'`]((?:https?:\\?\/\\?\/|\/\/|\/)[^"'()<>\\\s]+?\.(?:gif|jpe?g|png|webp|avif|mp4|webm|mov|m4v)(?:\?[^"'`]*)?)["'`]/gi;
    while ((match = stringRe.exec(html))) {
      const url = absoluteUrl(unescapeEmbeddedUrl(match[1]), base);
      if (url) urls.push(url);
    }
    const attrRe = /(?:src|href|file|zoomfile|data-file|data-zoomfile|data-src|data-original|data-lazy-src|data-url|data-full|data-large)=["']([^"']+(?:\.(?:gif|jpe?g|png|webp|avif|mp4|webm|mov|m4v)|forum\.php\?mod=attachment)(?:[^"']*)?)["']/gi;
    while ((match = attrRe.exec(html))) {
      const url = absoluteUrl(unescapeEmbeddedUrl(match[1]), base);
      if (url) urls.push(url);
    }

    return [...new Set(urls)].filter((url) => {
      if (!isMediaUrl(url) || BAD_IMAGE_RE.test(url) || isAdMedia(url) || isX810114Avatar(url) || isBlockedZttaotuImage(url)) return false;
      const path = new URL(url).pathname;
      if (STATIC_ASSET_RE.test(url) && !/(upload|uploads|media|photos?|files?)/i.test(path)) return false;
      return true;
    });
  }

  function scoreHighResCandidate(url, thumbUrl) {
    let score = 0;
    const path = new URL(url).pathname;
    if (url !== thumbUrl) score += 20;
    if (/\/(upload|uploads|media|photos?|files?)\//i.test(path)) score += 60;
    if (/\d{4,}/.test(path)) score += 20;
    if (/\.(jpe?g|webp|png)(?:[?#].*)?$/i.test(url)) score += 10;
    if (/thumb|small|cover|list|preview/i.test(path)) score -= 50;
    return score;
  }

  function imageDimensions(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.referrerPolicy = "no-referrer-when-downgrade";
      const timer = setTimeout(() => resolve({ url, width: 0, height: 0, area: 0 }), 8000);
      img.onload = () => {
        clearTimeout(timer);
        const width = img.naturalWidth || 0;
        const height = img.naturalHeight || 0;
        resolve({ url, width, height, area: width * height });
      };
      img.onerror = () => {
        clearTimeout(timer);
        resolve({ url, width: 0, height: 0, area: 0 });
      };
      img.src = url;
    });
  }

  async function chooseLargestImage(candidates, thumbUrl) {
    const sorted = [...new Set(candidates.map((url) => siteAlbumOriginalImageUrl(url)).filter(isFavoriteImageUrl))]
      .sort((a, b) => scoreHighResCandidate(b, thumbUrl) - scoreHighResCandidate(a, thumbUrl))
      .slice(0, 12);
    if (!sorted.length) return isFavoriteImageUrl(thumbUrl) ? thumbUrl : "";
    const measured = await Promise.all(sorted.map(imageDimensions));
    measured.sort((a, b) => {
      if (b.area !== a.area) return b.area - a.area;
      return scoreHighResCandidate(b.url, thumbUrl) - scoreHighResCandidate(a.url, thumbUrl);
    });
    return measured.find((item) => item.area > 0)?.url || sorted[0] || (isFavoriteImageUrl(thumbUrl) ? thumbUrl : "");
  }

  async function resolveHighResUrl(imageUrl, quiet = false) {
    const key = keyForUrl(imageUrl);
    if (state.highResByImage.has(key)) return state.highResByImage.get(key);
    const directOriginal = siteAlbumOriginalImageUrl(imageUrl);
    if (directOriginal && directOriginal !== imageUrl && isFavoriteImageUrl(directOriginal)) {
      state.highResByImage.set(key, directOriginal);
      return directOriginal;
    }
    const siteAlbumDerived = siteAlbumDerivedImageCandidates(imageUrl).find(isFavoriteImageUrl) || "";
    if (siteAlbumDerived) {
      state.highResByImage.set(key, siteAlbumDerived);
      return siteAlbumDerived;
    }
    const detailUrl = state.photoShowByImage.get(key) || state.detailByImage.get(key) || (isDetailPhotoPage(imageUrl) ? imageUrl : "");
    if (!detailUrl) return imageUrl;

    try {
      if (!quiet) updateStatus("解析高清图");
      let targetUrl = detailUrl;
      let html = await fetchHtml(targetUrl, location.href);
      let doc = new DOMParser().parseFromString(html, "text/html");
      const photoShowUrl = isPhotoShowPage(targetUrl) ? targetUrl : findPhotoShowUrl(doc, targetUrl);
      if (photoShowUrl) {
        state.photoShowByImage.set(key, photoShowUrl);
        const referrer = targetUrl;
        targetUrl = photoShowUrl;
        try {
          html = await fetchHtml(targetUrl, referrer);
          doc = new DOMParser().parseFromString(html, "text/html");
        } catch {
          targetUrl = referrer;
        }
      }
      const candidates = detailImageCandidates(doc, targetUrl);
      const highRes = await chooseLargestImage(candidates, imageUrl);
      state.highResByImage.set(key, highRes);
      return highRes;
    } catch {
      state.highResByImage.set(key, imageUrl);
      return imageUrl;
    }
  }
  function crc32(bytes) {
    let table = crc32.table;
    if (!table) {
      table = new Uint32Array(256);
      for (let i = 0; i < 256; i += 1) {
        let c = i;
        for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[i] = c >>> 0;
      }
      crc32.table = table;
    }
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) c = table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function writeU16(out, value) {
    out.push(value & 0xff, (value >>> 8) & 0xff);
  }

  function writeU32(out, value) {
    out.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
  }

  function dosTimeDate(date = new Date()) {
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const day = Math.max(1, date.getDate());
    const month = date.getMonth() + 1;
    const year = Math.max(1980, date.getFullYear()) - 1980;
    return { time, date: (year << 9) | (month << 5) | day };
  }

  function makeZip(files) {
    const encoder = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;
    const stamp = dosTimeDate();

    for (const file of files) {
      const name = encoder.encode(file.name);
      const data = file.data;
      const crc = crc32(data);
      const local = [];
      writeU32(local, 0x04034b50);
      writeU16(local, 20);
      writeU16(local, 0x0800);
      writeU16(local, 0);
      writeU16(local, stamp.time);
      writeU16(local, stamp.date);
      writeU32(local, crc);
      writeU32(local, data.length);
      writeU32(local, data.length);
      writeU16(local, name.length);
      writeU16(local, 0);
      chunks.push(new Uint8Array(local), name, data);

      const entry = [];
      writeU32(entry, 0x02014b50);
      writeU16(entry, 20);
      writeU16(entry, 20);
      writeU16(entry, 0x0800);
      writeU16(entry, 0);
      writeU16(entry, stamp.time);
      writeU16(entry, stamp.date);
      writeU32(entry, crc);
      writeU32(entry, data.length);
      writeU32(entry, data.length);
      writeU16(entry, name.length);
      writeU16(entry, 0);
      writeU16(entry, 0);
      writeU16(entry, 0);
      writeU16(entry, 0);
      writeU32(entry, 0);
      writeU32(entry, offset);
      central.push(new Uint8Array(entry), name);

      offset += local.length + name.length + data.length;
    }

    const centralOffset = offset;
    const centralSize = central.reduce((sum, part) => sum + part.length, 0);
    const end = [];
    writeU32(end, 0x06054b50);
    writeU16(end, 0);
    writeU16(end, 0);
    writeU16(end, files.length);
    writeU16(end, files.length);
    writeU32(end, centralSize);
    writeU32(end, centralOffset);
    writeU16(end, 0);

    return new Blob([...chunks, ...central, new Uint8Array(end)], { type: "application/zip" });
  }

  async function waitForGalleryFetch() {
    while (state.fetching) await sleep(180);
    while (state.fetchedPages.size < state.pageUrls.size) {
      const before = state.fetchedPages.size;
      await fetchRemainingPages(GALLERY_FETCH_BATCH, true);
      while (state.fetching) await sleep(180);
      if (state.fetchedPages.size === before) break;
    }
  }

  function urlsForScope(scope = "all") {
    if (scope === "favorites") {
      return state.images.filter((url) => state.favoriteKeys.has(keyForUrl(url)));
    }
    if (scope === "filtered") return filteredImages();
    return [...state.images];
  }

  function downloadTextFile(text, filename) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.documentElement.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
  }

  async function exportLinks() {
    await waitForGalleryFetch();
    const urls = urlsForScope(state.mediaFilter === "all" ? "all" : "filtered");
    if (!urls.length) {
      updateStatus("没有可导出的链接");
      return;
    }
    downloadTextFile(urls.join("\n"), `flowlens-links-${urls.length}.txt`);
    updateStatus(`已导出 ${urls.length} 条链接`);
  }

  async function downloadZip(scope = "all") {
    if (state.downloading) return;
    state.downloading = true;
    state.lastDownloadScope = scope;

    try {
      updateStatus("准备下载");
      await waitForGalleryFetch();
      const urls = urlsForScope(scope);
      if (!urls.length) {
        updateStatus(scope === "favorites" ? "还没有收藏" : "没有图片");
        return;
      }

      const files = [];
      let failed = 0;
      let lastError = "";
      for (let i = 0; i < urls.length; i += 1) {
        updateStatus(`下载 ${i + 1}/${urls.length}`);
        try {
          const highResUrl = await resolveHighResUrl(urls[i]);
          const result = await fetchImageBytes(highResUrl);
          const bytes = result.bytes;
          const ext = extensionFromUrl(highResUrl, result.contentType || "");
          files.push({ name: `${String(files.length + 1).padStart(3, "0")}.${ext}`, data: bytes });
        } catch (error) {
          lastError = error?.message || String(error);
          failed += 1;
        }
      }

      if (!files.length) {
        updateStatus("下载失败");
        return;
      }

      updateStatus("正在打包");
      const zip = makeZip(files);
      const objectUrl = URL.createObjectURL(zip);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `${scope === "favorites" ? "flowlens-favorites" : "photo-stream"}-${files.length}.zip`;
      document.documentElement.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
      updateStatus(failed ? `已打包 ${files.length} 张，失败 ${failed} 张` : `已打包 ${files.length} 张`);
    } finally {
      state.downloading = false;
    }
  }

  function closeHostPhotoViewer() {
    if (!isGenericX810114Page()) return;
    document.querySelectorAll(".PhotoView-Portal, [class*='PhotoView' i], [class*='photo-view' i], [class*='ReactPhoto' i], [class*='react-photo' i]").forEach((node) => {
      node.setAttribute("aria-hidden", "true");
      node.style.setProperty("display", "none", "important");
      node.style.setProperty("visibility", "hidden", "important");
      node.style.setProperty("pointer-events", "none", "important");
    });
  }

  function startHostOverlayGuard() {
    if (!isGenericX810114Page() || state.hostOverlayObserver) return;
    closeHostPhotoViewer();
    clearInterval(state.hostOverlayTimer);
    state.hostOverlayTimer = window.setInterval(closeHostPhotoViewer, 350);
    state.hostOverlayObserver = new MutationObserver(() => closeHostPhotoViewer());
    state.hostOverlayObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function stopHostOverlayGuard() {
    state.hostOverlayObserver?.disconnect();
    state.hostOverlayObserver = null;
    clearInterval(state.hostOverlayTimer);
    state.hostOverlayTimer = 0;
  }

  function acquirePageLock() {
    if (state.pageLock) return;
    state.pageLock = [document.documentElement, document.body].filter(Boolean).map(node => ({
      node, value: node.style.getPropertyValue("overflow"), priority: node.style.getPropertyPriority("overflow")
    }));
    state.pageLock.forEach(({ node }) => node.style.setProperty("overflow", "hidden"));
  }

  function restorePageLock() {
    if (state.active || !state.pageLock) return;
    for (const { node, value, priority } of state.pageLock) {
      if (node.style.getPropertyValue("overflow") !== "hidden") continue;
      if (value) node.style.setProperty("overflow", value, priority);
      else node.style.removeProperty("overflow");
    }
    state.pageLock = null;
  }

  async function openViewer() {
    ensureUi();
    if (!isSupportedPage()) {
      updateStatus("当前页面不支持");
      alert("瀑光只支持 http/https 网页。");
      return;
    }

    const navigation = ++state.navigationGeneration;
    resetCollection();
    state.galleryQueueCurrentUrl = normalizedPageUrl(location.href);
    state.galleryQueueCurrentTitle = pageTitleFromDocument(document, location.href);
    startViewerPositionRestore();
    closeHostPhotoViewer();
    state.active = true;
    state.suppressLightboxUntil = Date.now() + 120;
    document.documentElement.classList.add("xiv-active");
    startHostOverlayGuard();
    state.root.dataset.active = "true";
    state.root.dataset.theme = state.theme;
    if (!isGenericX810114Page()) {
      acquirePageLock();
    }

    if (!state.images.length) {
      state.fetchedPages.add(location.href);
      state.pageUrls.add(location.href);
      if (isGenericX810114Page()) {
        await prepareGenericX810114Page();
        if (!state.active || navigation !== state.navigationGeneration) return;
      } else {
        collectFromDocument(document, location.href);
      }
      if (isGenericX810114Page()) {
        if (!state.x810114ApiMode) startGenericObserver();
      } else if (isPhotoGalleryPage()) {
        discoverNearbyPages();
        fetchRemainingPages(galleryFetchLimit());
      } else {
        startGenericObserver();
      }
    } else if (isGenericX810114Page() || !isPhotoGalleryPage()) {
      startGenericObserver();
    }

    if (state.settings?.autoFullscreen !== false && !document.fullscreenElement) {
      try {
        await state.root.requestFullscreen?.();
      } catch {
        // Browsers can reject fullscreen outside a direct user gesture.
      }
    }
  }

  async function closeViewer() {
    if (!state.root) return;
    state.navigationGeneration += 1;
    invalidateCollectionRequests();
    closePanels();
    saveViewerPosition();
    closeLightbox(false);
    state.autoScrollPausedForLightbox = false;
    state.autoScroll = false;
    cancelAnimationFrame(state.autoScrollFrame);
    clearTimeout(state.restoreTimer);
    clearTimeout(state.positionSaveTimer);
    state.restorePosition = null;
    stopGenericObserver();
    stopHostOverlayGuard();
    state.active = false;
    state.galleryQueueCurrentUrl = "";
    state.galleryQueueCurrentTitle = "";
    document.documentElement.classList.remove("xiv-active");
    state.root.dataset.active = "false";
    restorePageLock();
    if (document.fullscreenElement === state.root) {
      try {
        await document.exitFullscreen();
      } catch {
        // Ignore fullscreen exit failures.
      }
    }
  }

  function clearOldMediaPreloads() {
    const now = Date.now();
    for (const [key, item] of state.mediaPreloadCache) {
      if (!item || now - item.time < 45000) continue;
      const media = item.media;
      try {
        if (media?.tagName === "VIDEO") {
          media.pause();
          media.removeAttribute("src");
          media.load();
        }
      } catch {
        // Ignore preload teardown failures.
      }
      state.mediaPreloadCache.delete(key);
    }
  }

  function preloadMediaUrl(url, videoBudget) {
    if (!url) return videoBudget;
    const key = keyForUrl(url);
    if (state.mediaPreloadCache.has(key)) return videoBudget;
    clearOldMediaPreloads();
    if (isVideoUrl(url)) {
      if (videoBudget <= 0) return videoBudget;
      const video = document.createElement("video");
      video.preload = isCloudDriveMediaUrl(url) ? "metadata" : "auto";
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      video.controls = false;
      video.referrerPolicy = shouldKeepReferrer(url) ? "no-referrer-when-downgrade" : "no-referrer";
      video.style.cssText = "position:fixed;left:-1px;top:-1px;width:1px;height:1px;opacity:0;pointer-events:none;";
      video.dataset.xivPreload = "true";
      video.src = url;
      document.documentElement.appendChild(video);
      try { video.load(); } catch {}
      state.mediaPreloadCache.set(key, { media: video, time: Date.now() });
      return videoBudget - 1;
    }
    const img = new Image();
    img.decoding = "async";
    try { img.fetchPriority = "high"; } catch {}
    img.referrerPolicy = shouldKeepReferrer(url) ? "no-referrer-when-downgrade" : "no-referrer";
    img.src = url;
    state.mediaPreloadCache.set(key, { media: img, time: Date.now() });
    return videoBudget;
  }

  function scheduleLightboxMediaPreload(centerIndex = state.index) {
    clearTimeout(state.mediaPreloadTimer);
    state.mediaPreloadTimer = setTimeout(() => {
      if (state.lightbox?.dataset.active !== "true" || !state.images.length) return;
      const offsets = [1, 2, 3, 4, 5, -1, -2];
      const urls = [];
      const seen = new Set();
      for (const offset of offsets) {
        let index = centerIndex;
        for (let step = 0; step < state.images.length; step += 1) {
          index = (index + offset + state.images.length) % state.images.length;
          const url = state.images[index];
          if (!mediaMatchesFilter(url)) continue;
          const key = keyForUrl(url);
          if (!seen.has(key)) {
            seen.add(key);
            urls.push(url);
          }
          break;
        }
      }
      let videoBudget = isCloudDriveFilesPage() ? 1 : 2;
      for (const url of urls) {
        videoBudget = preloadMediaUrl(url, videoBudget);
      }
    }, 30);
  }

  function scheduleLightboxHighResUpgrade(index, thumbUrl, openToken) {
    clearTimeout(state.highResResolveTimer);
    if (!thumbUrl || isVideoUrl(thumbUrl)) return;
    state.highResResolveTimer = setTimeout(async () => {
      if (state.lightbox?.dataset.active !== "true" || state.index !== index || state.lightbox.dataset.openToken !== openToken) return;
      const highResUrl = await resolveHighResUrl(thumbUrl, true);
      if (!highResUrl || highResUrl === thumbUrl) return;
      if (state.lightbox?.dataset.active !== "true" || state.index !== index || state.lightbox.dataset.openToken !== openToken) return;
      if (isVideoUrl(highResUrl)) {
        setLightboxVideo(highResUrl);
      } else {
        const img = ensureLightboxImage();
        img.dataset.xivCanZoom = "false";
        img.addEventListener("load", () => updateLightboxZoomHint(img), { once: true });
        setImageSourceWithFallback(img, highResUrl);
        updateFavoriteButton(highResUrl, thumbUrl);
      }
      scheduleLightboxMediaPreload(index);
    }, state.highResByImage.has(keyForUrl(thumbUrl)) ? 40 : 420);
  }

  async function openLightbox(index) {
    if (isGenericX810114Page() && Date.now() - state.lightboxGestureToken > 500) {
      closeHostPhotoViewer();
      return;
    }
    if (state.renderFrame) {
      cancelAnimationFrame(state.renderFrame);
      state.renderFrame = 0;
    }
    clearTimeout(state.masonryLayoutTimer);
    pauseAutoScrollForLightbox();
    state.index = index;
    const openToken = `${Date.now()}:${index}:${Math.random()}`;
    state.lightbox.dataset.openToken = openToken;
    state.lightbox.dataset.zoom = "fit";
    delete state.lightbox.dataset.wheelZoom;
    state.lightbox.querySelectorAll(":scope > img, :scope > video").forEach((media) => {
      delete media.dataset.xivWheelBaseWidth;
      delete media.dataset.xivWheelBaseHeight;
      delete media.dataset.xivWheelZoomKey;
      media.style.removeProperty("--xiv-actual-width");
      media.style.removeProperty("--xiv-actual-height");
    });
    state.root.dataset.lightboxActive = "true";
    state.lightbox.dataset.flVideoEnded = "false";
    state.lightbox.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
    clearTimeout(state.highResResolveTimer);
    const thumbUrl = state.images[index];
    ensureLightboxChrome();
    state.lightbox.dataset.active = "true";
    if (isVideoUrl(thumbUrl)) {
      setLightboxVideo(thumbUrl);
      state.root.dataset.lightboxActive = "true";
      scheduleLightboxMediaPreload(index);
      return;
    } else {
      const img = ensureLightboxImage();
      img.dataset.xivCanZoom = "false";
      img.addEventListener("load", () => updateLightboxZoomHint(img), { once: true });
      setImageSourceWithFallback(img, thumbUrl);
      updateFavoriteButton(thumbUrl);
    }
    state.root.dataset.lightboxActive = "true";
    scheduleLightboxMediaPreload(index);
    scheduleLightboxHighResUpgrade(index, thumbUrl, openToken);
  }

  function closeLightbox(resumeAutoScroll = true) {
    if (!state.lightbox) return;
    pauseLightboxMedia();
    endLightboxDrag();
    endStageSwipe();
    state.lightbox.dataset.active = "false";
    state.root.dataset.lightboxActive = "false";
    state.lightbox.dataset.zoom = "fit";
    clearTimeout(state.mediaPreloadTimer);
    clearTimeout(state.highResResolveTimer);
    if (state.renderQueue.length) scheduleRenderQueue();
    if (resumeAutoScroll) resumeAutoScrollAfterLightbox();
  }

  function lightboxArrows() {
    return `<button class="xiv-lightbox-zoom" type="button" title="放大（之后可滚轮缩放、拖动查看）">${zoomInIcon()}</button><button class="xiv-lightbox-fav" type="button" title="\u6536\u85cf">${heartIcon()}</button><button class="xiv-lightbox-close" type="button" title="关闭">${closeIcon()}</button><div class="xiv-lightbox-arrow" data-side="left">‹</div><div class="xiv-lightbox-arrow" data-side="right">›</div>`;
  }

  function ensureLightboxChrome() {
    const box = state.lightbox;
    if (!box) return;
    const template = document.createElement("template");
    template.innerHTML = lightboxArrows();
    [...template.content.children].forEach((node) => {
      const selector = node.classList.contains("xiv-lightbox-arrow")
        ? `.xiv-lightbox-arrow[data-side="${node.dataset.side}"]`
        : `.${node.className}`;
      if (!box.querySelector(`:scope > ${selector}`)) box.appendChild(node);
    });
    syncLightboxZoomButton();
  }

  function removeDirectLightboxMedia(except = null) {
    state.lightbox?.querySelectorAll(":scope > img, :scope > video, :scope > iframe, :scope > .xiv-video-frame").forEach((node) => {
      if (node !== except) node.remove();
    });
  }

  function ensureLightboxImage() {
    ensureLightboxChrome();
    let img = state.lightbox?.querySelector(":scope > img");
    if (!img) {
      pauseLightboxMedia();
      removeDirectLightboxMedia();
      img = document.createElement("img");
      img.alt = "";
      state.lightbox.appendChild(img);
    } else {
      removeDirectLightboxMedia(img);
    }
    return img;
  }

  function heartIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 4.9c-2-2.1-5.2-1.9-7.1.3L12 7.1l-1.7-1.9C8.4 3 5.2 2.8 3.2 4.9 1 7.1 1.1 10.7 3.4 13l8.1 7.6c.3.3.7.3 1 0l8.1-7.6c2.3-2.3 2.4-5.9.2-8.1Z"/></svg>';
  }

  function closeIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.7" stroke-linecap="round" aria-hidden="true"><path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5"/></svg>';
  }

  function updateFavoriteButton(saveUrl, sourceUrl = saveUrl) {
    const button = state.lightbox?.querySelector(".xiv-lightbox-fav");
    if (!button) return;
    const key = keyForUrl(sourceUrl || saveUrl);
    button.dataset.url = isFavoriteMediaUrl(saveUrl) ? saveUrl : "";
    button.dataset.sourceUrl = sourceUrl || saveUrl || "";
    button.dataset.favorited = state.favoriteKeys.has(key) ? "true" : "false";
    button.innerHTML = heartIcon();
    button.title = button.dataset.favorited === "true" ? "\u5df2\u4fdd\u5b58" : "\u6536\u85cf";
  }

  function lightboxCurrentImageUrl() {
    const buttonUrl = state.lightbox?.querySelector(".xiv-lightbox-fav")?.dataset.url || "";
    const mediaUrl = state.lightbox?.querySelector("img")?.currentSrc || state.lightbox?.querySelector("img")?.src || "";
    return normalizeMediaUrl(buttonUrl || mediaUrl || state.images[state.index] || "");
  }

  function lightboxLoadedImageUrl() {
    const img = state.lightbox?.querySelector("img");
    const loaded = img?.currentSrc || img?.src || "";
    const source = img?.dataset?.sourceUrl || "";
    return normalizeMediaUrl(loaded.startsWith("blob:") ? source : loaded);
  }

  function favoriteFilename(url, index = state.index) {
    let basename = `image-${String(index + 1).padStart(4, "0")}.jpg`;
    let prefix = "";
    try {
      const parsed = new URL(url, location.href);
      const parts = parsed.pathname.split("/").filter(Boolean);
      const last = parts.at(-1) || basename;
      const gallery = parts.length >= 2 ? parts.at(-2) || "" : "";
      const ext = favoriteExtension(url);
      basename = /\.[a-z0-9]{2,5}$/i.test(last)
        ? last.replace(/\.[a-z0-9]{2,5}$/i, `.${ext}`)
        : `${last}.${ext}`;
      prefix = /^[A-Za-z0-9_-]{5,80}$/.test(gallery) ? `${gallery}-` : "";
    } catch {
      // Keep the generated fallback filename.
    }
    const safeName = `${prefix}${basename}`.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim();
    const folder = isVideoUrl(url) ? "视频" : "图片";
    return `${folder}/${safeName || basename}`;
  }

  function favoriteExtension(url) {
    try {
      const parsed = new URL(url, location.href);
      const format = parsed.searchParams.get("format")?.toLowerCase();
      if (format && ["jpg", "jpeg", "png", "webp", "avif", "gif", "mp4", "webm", "mov", "m4v"].includes(format)) return format === "jpeg" ? "jpg" : format;
      const ext = parsed.pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
      if (ext && ["jpg", "jpeg", "png", "webp", "avif", "gif", "mp4", "webm", "mov", "m4v"].includes(ext)) return ext === "jpeg" ? "jpg" : ext;
    } catch {
      // Fall through to jpg for image-like URLs without extensions.
    }
    return isVideoUrl(url) ? "mp4" : "jpg";
  }

  function downloadUrlViaBackground(url, filename, options = {}) {
    if (xivUserscriptMode && typeof GM_download === "function") {
      return new Promise((resolve) => {
        try {
          GM_download({
            url,
            name: filename.replace(/^(?:图片|视频)\//, ""),
            saveAs: false,
            onload: () => resolve({ ok: true, via: "GM_download" }),
            onerror: (error) => resolve({ ok: false, error: String(error?.error || error?.message || "download failed") }),
            ontimeout: () => resolve({ ok: false, error: "download timeout" })
          });
        } catch (error) {
          resolve({ ok: false, error: String(error?.message || error) });
        }
      });
    }

    return new Promise((resolve) => {
      try {
        if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
          resolve({ ok: false, error: "extension runtime unavailable" });
          return;
        }
        chrome.runtime.sendMessage({
          type: "XIV_DOWNLOAD_URL",
          url,
          filename,
          referrer: location.href,
          direct: options.direct === true
        }, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(response || { ok: false, error: "no response" });
        });
      } catch (error) {
        resolve({ ok: false, error: String(error?.message || error) });
      }
    });
  }

  function isExtensionContextError(error) {
    return /Extension context invalidated|context invalidated|runtime unavailable|Extension context/i.test(String(error || ""));
  }

  async function downloadUrlViaPageBlob(url, filename) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(url, {
        credentials: "include",
        cache: "force-cache",
        referrer: location.href,
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`page HTTP ${res.status}`);
      const contentType = res.headers.get("content-type") || "";
      if (contentType && !/^image\//i.test(contentType)) throw new Error(`page not image: ${contentType}`);
      const blob = await res.blob();
      if (!blob.size) throw new Error("page empty image");
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename.replace(/^(?:图片|视频)\//, "");
      document.documentElement.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
      return { ok: true, via: "page-blob", bytes: blob.size, contentType: blob.type || contentType };
    } finally {
      clearTimeout(timer);
    }
  }

  function downloadUrlViaDirectAnchor(url, filename) {
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename.replace(/^(?:图片|视频)\//, "");
      a.rel = "noopener";
      document.documentElement.appendChild(a);
      a.click();
      a.remove();
      return { ok: true, via: "direct-anchor" };
    } catch (error) {
      return { ok: false, error: String(error?.message || error), via: "direct-anchor" };
    }
  }

  function debugLog(...args) {
    try {
      console.info("[瀑光]", ...args);
    } catch {
      // Ignore console failures on restricted pages.
    }
  }

  async function siteAlbumFavoriteCandidates(sourceUrl, currentUrl) {
    if (!isKnownGalleryUrl(location.href) && !siteAlbumIdFromUrl(sourceUrl) && !siteAlbumIdFromUrl(currentUrl)) return [];
    const candidates = [];
    const seen = new Set();

    function remember(url) {
      const direct = siteAlbumOriginalImageUrl(url);
      if (!isFavoriteImageUrl(direct)) return;
      const key = keyForUrl(direct);
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push(direct);
    }

    const sourceKey = keyForUrl(sourceUrl || currentUrl || state.images[state.index] || "");
    const urls = [
      currentUrl,
      sourceUrl,
      state.images[state.index] || "",
      state.photoShowByImage.get(sourceKey) || "",
      state.detailByImage.get(sourceKey) || "",
      location.href
    ].filter(Boolean);

    for (const url of [...new Set(urls)]) {
      remember(url);
      siteAlbumDerivedImageCandidates(url).forEach(remember);
    }

    return candidates;
  }

  async function favoriteCurrentImage() {
    if (state.savingFavorite) {
      updateStatus("正在保存，请稍等");
      return;
    }
    if (state.lightbox?.dataset.active !== "true") {
      updateStatus("请先打开大图");
      return;
    }
    const button = state.lightbox?.querySelector(".xiv-lightbox-fav");
    if (!button) {
      updateStatus("当前不是图片或视频");
      return;
    }
    const sourceUrl = button.dataset.sourceUrl || state.images[state.index] || "";
    const loadedUrl = lightboxLoadedImageUrl();
    const currentUrl = loadedUrl || lightboxCurrentImageUrl();
    if (!currentUrl) {
      updateStatus("图片还没有加载出来");
      return;
    }
    const currentIsVideo = isVideoUrl(currentUrl)
      || isVideoUrl(sourceUrl)
      || !!state.lightbox?.querySelector("video, .xiv-video-frame");

    const favoriteKey = keyForUrl(sourceUrl || currentUrl);
    if (button.dataset.favorited === "true" && state.favoriteKeys.has(favoriteKey)) {
      updateStatus("已保存");
      return;
    }

    state.savingFavorite = true;
    button.title = "正在保存";
    try {
      const candidates = [];
      const candidateKeys = new Set();

      function rememberCandidate(candidate) {
        if (!candidate) return;
        if (currentIsVideo ? !isVideoUrl(candidate) : !isFavoriteImageUrl(candidate)) return;
        const key = keyForUrl(candidate);
        if (candidateKeys.has(key)) return;
        candidateKeys.add(key);
        candidates.push(candidate);
      }

      if (currentIsVideo) {
        [currentUrl, sourceUrl, state.images[state.index] || ""].forEach(rememberCandidate);
      } else {
        const siteAlbumCandidates = await siteAlbumFavoriteCandidates(sourceUrl, currentUrl);
        const highResUrl = siteAlbumCandidates.length
          ? ""
          : await resolveHighResUrl(sourceUrl || currentUrl, true);
        [loadedUrl, ...siteAlbumCandidates, highResUrl, currentUrl, sourceUrl]
          .filter(Boolean)
          .forEach((url) => {
            [url, siteAlbumOriginalImageUrl(url)].forEach(rememberCandidate);
          });
      }

      if (!candidates.length && currentIsVideo) {
        const frameUrl = state.lightbox?.querySelector(".xiv-video-frame")?.dataset.mediaUrl || "";
        const videoUrl = state.lightbox?.querySelector("video")?.dataset.mediaUrl || state.lightbox?.querySelector("video")?.currentSrc || "";
        [frameUrl, videoUrl].forEach(rememberCandidate);
      }

      if (!candidates.length) {
        button.title = currentIsVideo ? "没有可保存的视频地址" : "没有可保存的图片地址";
        debugLog("红心保存无候选", { sourceUrl, currentUrl, index: state.index, currentIsVideo });
        updateStatus(currentIsVideo ? "没有可保存的视频地址" : "没有可保存的图片地址");
        return;
      }

      const saveUrl = candidates[0];
      updateStatus(`保存 ${saveUrl.split("/").pop() || (currentIsVideo ? "视频" : "图片")}`);
      let result = null;
      if (currentIsVideo || isSiteAlbumImageUrl(saveUrl)) {
        result = await downloadUrlViaBackground(saveUrl, favoriteFilename(saveUrl), { direct: true });
      } else {
        try {
          result = await downloadUrlViaPageBlob(saveUrl, favoriteFilename(saveUrl));
        } catch (error) {
          result = { ok: false, error: String(error?.message || error), via: "page-blob" };
        }
      }
      if (!result?.ok && !currentIsVideo && !isSiteAlbumImageUrl(saveUrl)) {
        const fallback = await downloadUrlViaBackground(saveUrl, favoriteFilename(saveUrl));
        result = fallback?.ok ? fallback : {
          ok: false,
          error: `${result?.error || "page failed"}; ${fallback?.error || "background failed"}`
        };
      }
      if (!result?.ok && (currentIsVideo || isExtensionContextError(result?.error))) {
        result = downloadUrlViaDirectAnchor(saveUrl, favoriteFilename(saveUrl));
      }
      debugLog("红心保存结果", { url: saveUrl, result });
      if (!result?.ok) {
        button.title = "保存失败，可重试";
        button.dataset.favorited = "false";
        updateStatus(isExtensionContextError(result?.error)
          ? "扩展已重载，请刷新页面后再保存"
          : result?.error ? `保存失败：${result.error}` : "保存失败");
        return;
      }

      state.favoriteKeys.add(keyForUrl(sourceUrl || saveUrl));
      state.favoriteKeys.add(keyForUrl(saveUrl));
      updateFavoriteButton(saveUrl, sourceUrl || saveUrl);
      updateStatus("已保存");
    } catch (error) {
      button.title = "保存失败，可重试";
      button.dataset.favorited = "false";
      const message = error?.message || error;
      updateStatus(`保存失败：${message}`);
    } finally {
      state.savingFavorite = false;
    }
  }

  function safeScriptJson(value) {
    return JSON.stringify(value).replace(/</g, "\\u003c");
  }

  function safeHtmlAttribute(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function videoFrameSrcDoc(url, startTime) {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="referrer" content="no-referrer">
  <style>
    html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #000; }
    video { display: block; width: 100%; height: 100%; object-fit: contain; background: #000; }
  </style>
</head>
<body>
  <video id="v" controls autoplay playsinline preload="auto">
    <source src="${safeHtmlAttribute(url)}" type="video/mp4">
  </video>
  <script>
    const mediaUrl = ${safeScriptJson(url)};
    const startTime = ${safeScriptJson(startTime || 0)};
    const video = document.getElementById("v");
    video.volume = 1;
    video.muted = false;
    let started = false;
    let playPending = false;
    async function startPlayback() {
      if (started || playPending || video.ended) return;
      playPending = true;
      try { await video.play(); }
      catch (error) {
        if (error.name === "NotAllowedError") {
          video.muted = true;
          try { await video.play(); } catch { send("autoplay-blocked"); }
        } else if (error.name !== "AbortError") send("playback-error");
      } finally { playPending = false; }
    }
    video.addEventListener("playing", () => { started = true; video.dataset.played = "true"; });
    video.addEventListener("canplay", startPlayback);

    function send(eventName) {
      parent.postMessage({
        type: "XIV_VIDEO_TIME",
        url: mediaUrl,
        currentTime: Number(video.currentTime || 0),
        paused: video.paused,
        eventName
      }, "*");
    }

    video.addEventListener("loadedmetadata", () => {
      if (startTime > 0 && Number.isFinite(video.duration) && startTime < video.duration - 0.5) {
        try { video.currentTime = startTime; } catch {}
      }
      startPlayback();
      send("loadedmetadata");
    });
    ["timeupdate", "pause", "ended", "seeked", "playing"].forEach((eventName) => {
      video.addEventListener(eventName, () => send(eventName));
    });
    window.addEventListener("message", (event) => {
      const message = event.data || {};
      if (event.source !== parent || message.type !== "XIV_VIDEO_CONTROL" || message.url !== mediaUrl) return;
      send("before-" + message.action);
      if (message.action === "pause") video.pause();
      if (message.action === "play") { started = false; startPlayback(); }
    });
    setInterval(() => send("tick"), 500);
  </script>
</body>
</html>`;
  }

  function rememberVideoTime(video) {
    const url = video?.dataset?.mediaUrl || video?.dataset?.sourceUrl || video?.currentSrc || video?.src || "";
    const time = Number(video?.currentTime || 0);
    if (!url || !Number.isFinite(time) || time <= 0) return;
    state.videoTimeByImage.set(keyForUrl(normalizeMediaUrl(url)), time);
  }

  function setLightboxFrameVideo(url) {
    url = normalizeMediaUrl(url);
    pauseLightboxMedia();
    ensureLightboxChrome();
    removeDirectLightboxMedia();
    updateFavoriteButton(url);
    const startTime = state.videoTimeByImage.get(keyForUrl(url)) || 0;
    const iframe = document.createElement("iframe");
    iframe.title = "video-player";
    iframe.className = "xiv-video-frame";
    iframe.dataset.mediaUrl = url;
    const size = videoSizeFromUrl(url);
    if (size) iframe.style.setProperty("--xiv-video-ratio", String(size.width / size.height));
    iframe.referrerPolicy = "no-referrer";
    iframe.allow = "autoplay; fullscreen; encrypted-media; picture-in-picture";
    iframe.sandbox = "allow-scripts allow-same-origin allow-forms allow-presentation";
    iframe.srcdoc = videoFrameSrcDoc(url, startTime);
    state.lightbox.appendChild(iframe);
  }

  function setLightboxVideo(url) {
    url = normalizeMediaUrl(url);
    if (isGenericX810114Page()) {
      setLightboxFrameVideo(url);
      return;
    }
    pauseLightboxMedia();
    ensureLightboxChrome();
    removeDirectLightboxMedia();
    updateFavoriteButton(url);
    const startTime = state.videoTimeByImage.get(keyForUrl(url)) || 0;
    const video = createVideoElement(url, {
      autoplay: true,
      controls: true,
      preload: "auto",
      keepFirstFrame: false,
      allowFallback: !isCloudDriveMediaUrl(url),
      muted: false,
      loop: false,
      startTime
    });
    video.dataset.mediaUrl = url;
    video.controls = true;
    video.disablePictureInPicture = false;
    video.dataset.xivCanZoom = "false";
    video.addEventListener("loadedmetadata", () => updateLightboxZoomHint(video));
    video.addEventListener("loadeddata", () => updateLightboxZoomHint(video));
    state.lightbox.appendChild(video);
    requestVideoPlayback(video);
  }

  function unloadVideoElement(video) {
    if (!video) return;
    try {
      rememberVideoTime(video);
      video.pause();
    } catch {
      // Ignore media pause failures.
    }
    try {
      clearTimeout(Number(video.dataset.loadTimer || 0));
      video.removeAttribute("src");
      video.querySelectorAll("source").forEach((source) => source.removeAttribute("src"));
      video.load();
    } catch {
      // Some browser media elements can throw while being torn down.
    }
  }

  function pauseLightboxMedia() {
    state.lightbox?.querySelectorAll("video").forEach((video) => {
      unloadVideoElement(video);
    });
    state.lightbox?.querySelectorAll("iframe[data-media-url]").forEach((iframe) => {
      const url = normalizeMediaUrl(iframe.dataset.mediaUrl || "");
      iframe.contentWindow?.postMessage({ type: "XIV_VIDEO_CONTROL", action: "pause", url }, "*");
      try {
        iframe.removeAttribute("src");
        iframe.srcdoc = "";
      } catch {
        // Ignore iframe teardown failures.
      }
    });
  }

  function onVideoFrameMessage(event) {
    const message = event.data || {};
    if (message.type !== "XIV_VIDEO_TIME") return;
    const frame = state.lightbox?.querySelector("iframe[data-media-url]");
    if (!frame || event.source !== frame.contentWindow || message.url !== frame.dataset.mediaUrl) return;
    const url = normalizeMediaUrl(String(message.url || ""));
    const time = Number(message.currentTime || 0);
    if (message.eventName === "ended" && state.lightbox?.dataset.active === "true") {
      state.lightbox.dataset.flVideoEnded = "true";
    }
    if (!url || !Number.isFinite(time) || time <= 0) return;
    state.videoTimeByImage.set(keyForUrl(url), time);
  }

  function showAdjacentImage(delta) {
    if (!state.images.length) return false;
    let next = state.index;
    for (let step = 0; step < state.images.length; step += 1) {
      next = (next + delta + state.images.length) % state.images.length;
      const tile = state.grid?.querySelector(`.xiv-tile[data-index="${next}"]`);
      const blocked = window.__flowLensMediaFilter?.reasonFor?.(state.images[next], tile);
      if (mediaMatchesFilter(state.images[next]) && !blocked && (!tile || (!tile.hidden && tile.style.display !== "none"))) break;
      if (step === state.images.length - 1) return false;
    }
    state.lightboxGestureToken = Date.now();
    openLightbox(next);
    return true;
  }

  function actualZoomCssSize(media) {
    if (!media) return null;
    const width = media.naturalWidth || media.videoWidth || 0;
    const height = media.naturalHeight || media.videoHeight || 0;
    if (!width || !height) return null;
    const dpr = Math.max(1, Number(window.devicePixelRatio || 1));
    return {
      width: Math.max(1, Math.round(width / dpr)),
      height: Math.max(1, Math.round(height / dpr))
    };
  }

  function canActualZoomMedia(media) {
    const size = actualZoomCssSize(media);
    if (!size) return false;
    const rect = media.getBoundingClientRect?.();
    const currentWidth = Math.max(1, rect?.width || media.clientWidth || 1);
    const currentHeight = Math.max(1, rect?.height || media.clientHeight || 1);
    return size.width > currentWidth + 1 || size.height > currentHeight + 1;
  }

  function updateLightboxZoomHint(media = state.lightbox?.querySelector("img, video")) {
    if (!media) return;
    const zoomable = canActualZoomMedia(media);
    media.dataset.xivCanZoom = zoomable ? "true" : "false";
    media.title = zoomable ? "1:1 放大" : "";
  }

  function syncLightboxZoomButton() {
    const button = state.lightbox?.querySelector(".xiv-lightbox-zoom");
    if (!button) return;
    const active = state.lightbox?.dataset.zoom === "actual";
    const percent = Math.max(100, Math.round(Number(state.lightbox?.dataset.wheelZoom || 1) * 100));
    button.dataset.active = active ? "true" : "false";
    button.title = active
      ? `恢复适应屏幕（当前 ${percent}%）`
      : "放大（之后可滚轮缩放、拖动查看）";
    button.setAttribute("aria-label", button.title);
    const wanted = active ? "out" : "in";
    if (button.dataset.zoomIcon !== wanted) {
      button.dataset.zoomIcon = wanted;
      button.innerHTML = active ? zoomOutIcon() : zoomInIcon();
    }
  }

  function waitForVideoActualZoom(video) {
    if (!video || video.tagName !== "VIDEO" || video.dataset.xivPendingActual === "true") return;
    video.dataset.xivPendingActual = "true";
    updateStatus("等待视频尺寸");
    const apply = () => {
      video.dataset.xivPendingActual = "false";
      if (!video.isConnected || state.lightbox?.dataset.active !== "true") return;
      if (!prepareActualZoomMedia(video)) return;
      state.lightbox.dataset.zoom = "actual";
      centerActualLightboxMedia();
      updateStatus("1:1");
    };
    video.addEventListener("loadedmetadata", apply, { once: true });
    video.addEventListener("loadeddata", apply, { once: true });
  }

  function prepareActualZoomMedia(media) {
    const size = actualZoomCssSize(media);
    const lb = state.lightbox;
    if (!size || !lb) return false;
    const srcKey = media.currentSrc || media.src || media.dataset?.mediaUrl || "";
    const cachedKey = `${srcKey}|${media.naturalWidth || media.videoWidth || 0}x${media.naturalHeight || media.videoHeight || 0}|${window.devicePixelRatio || 1}`;
    media.dataset.xivActualKey = cachedKey;
    const currentFitWidth = Number(media.dataset.xivFitWidth || 0) || Math.max(1, media.getBoundingClientRect?.().width || media.clientWidth || 1);
    const currentFitHeight = Number(media.dataset.xivFitHeight || 0) || Math.max(1, media.getBoundingClientRect?.().height || media.clientHeight || 1);
    if (size.width <= currentFitWidth + 1 && size.height <= currentFitHeight + 1) {
      media.dataset.xivCanZoom = "false";
      media.title = "";
      return false;
    }
    media.style.setProperty("--xiv-actual-width", `${size.width}px`);
    media.style.setProperty("--xiv-actual-height", `${size.height}px`);
    media.dataset.xivCanZoom = "true";
    media.title = "1:1 放大";
    return true;
  }

  function centerActualLightboxMedia() {
    const lb = state.lightbox;
    if (!lb || lb.dataset.active !== "true" || lb.dataset.zoom !== "actual") return;
    const media = lb.querySelector("img, video");
    if (!media) return;
    const run = () => {
      if (!state.lightbox || state.lightbox.dataset.zoom !== "actual" || state.lightbox.dataset.dragging === "true") return;
      const left = Math.max(0, Math.round((state.lightbox.scrollWidth - state.lightbox.clientWidth) / 2));
      const top = Math.max(0, Math.round((state.lightbox.scrollHeight - state.lightbox.clientHeight) / 2));
      state.lightbox.scrollTo({ left, top, behavior: "auto" });
    };
    if (media.tagName !== "IMG" || media.complete) run();
    else media.addEventListener("load", run, { once: true });
    requestAnimationFrame(run);
  }

  function toggleLightboxZoom() {
    if (!state.lightbox) return;
    const zoomed = state.lightbox.dataset.zoom === "actual";
    if (zoomed) {
      state.lightbox.dataset.zoom = "fit";
      delete state.lightbox.dataset.wheelZoom;
      state.lightbox.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
    } else {
      const media = state.lightbox.querySelector("img, video");
      if (!prepareActualZoomMedia(media)) {
        if (media?.tagName === "VIDEO" && !(media.videoWidth && media.videoHeight)) {
          waitForVideoActualZoom(media);
          return;
        }
        const rect = media?.getBoundingClientRect?.();
        if (!media || !rect?.width || !rect?.height) return;
        const factor = 1.5;
        media.dataset.xivWheelBaseWidth = String(Math.max(1, Math.round(rect.width)));
        media.dataset.xivWheelBaseHeight = String(Math.max(1, Math.round(rect.height)));
        media.dataset.xivWheelZoomKey = `${media.currentSrc || media.src || media.dataset?.mediaUrl || ""}|${media.naturalWidth || media.videoWidth || 0}x${media.naturalHeight || media.videoHeight || 0}`;
        media.style.setProperty("--xiv-actual-width", `${Math.round(rect.width * factor)}px`);
        media.style.setProperty("--xiv-actual-height", `${Math.round(rect.height * factor)}px`);
        state.lightbox.dataset.wheelZoom = String(factor);
      }
      state.lightbox.dataset.zoom = "actual";
      centerActualLightboxMedia();
    }
    syncLightboxZoomButton();
  }

  function onLightboxClick(event) {
    if (state.lightbox?.dataset.active !== "true") return;
    if (!state.lightbox.contains(event.target)) return;
    if (event.target?.closest?.(".xiv-lightbox-slideshow")) return;
    if (event.target?.closest?.("#xiv-lightbox video") && !isMobilePointerEvent(event)) return;
    claimEvent(event);
    if (Date.now() < state.lightboxSuppressClickUntil) return;
    if (event.target?.closest?.(".xiv-lightbox-zoom")) {
      toggleLightboxZoom();
      return;
    }
    if (event.target?.closest?.(".xiv-lightbox-fav")) {
      favoriteCurrentImage();
      return;
    }
    if (event.target?.closest?.(".xiv-lightbox-close")) {
      closeLightbox();
      return;
    }
    const arrow = event.target?.closest?.(".xiv-lightbox-arrow");
    if (arrow) {
      showAdjacentImage(arrow.dataset.side === "right" ? 1 : -1);
      return;
    }
    if (event.target?.matches?.("img, video, iframe")) {
      toggleLightboxZoom();
      return;
    }
    closeLightbox();
  }

  function onLightboxPointerDown(event) {
    if (state.lightbox?.dataset.active !== "true" || event.button !== 0) return;
    if (event.target?.closest?.(".xiv-lightbox-fav, .xiv-lightbox-close, .xiv-lightbox-arrow, .xiv-lightbox-slideshow, .xiv-lightbox-zoom")) return;
    if (state.lightbox.dataset.zoom === "actual" && event.target?.matches?.("img, video")) {
      claimEvent(event);
      state.lightboxDrag = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: state.lightbox.scrollLeft,
        top: state.lightbox.scrollTop,
        moved: false
      };
      state.lightbox.dataset.dragging = "true";
      event.target.setPointerCapture?.(event.pointerId);
      return;
    }
    state.lightboxSwipe = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false
    };
    event.target?.setPointerCapture?.(event.pointerId);
  }

  function onLightboxPointerMove(event) {
    const drag = state.lightboxDrag;
    if (drag && drag.pointerId === event.pointerId && state.lightbox) {
      claimEvent(event);
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;
      state.lightbox.scrollLeft = drag.left - dx;
      state.lightbox.scrollTop = drag.top - dy;
      return;
    }
    const swipe = state.lightboxSwipe;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      swipe.moved = true;
      claimEvent(event);
    }
  }

  function endLightboxDrag(event = null) {
    const drag = state.lightboxDrag;
    if (drag) {
      if (event && drag.pointerId !== event.pointerId) return;
      if (drag.moved) state.lightboxSuppressClickUntil = Date.now() + 180;
      state.lightboxDrag = null;
      if (state.lightbox) delete state.lightbox.dataset.dragging;
      return;
    }
    const swipe = state.lightboxSwipe;
    if (!swipe) return;
    if (event && swipe.pointerId !== event.pointerId) return;
    state.lightboxSwipe = null;
    if (!event || !swipe.moved || state.lightbox?.dataset.active !== "true") return;
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const threshold = Math.max(42, Math.min(window.innerWidth, window.innerHeight) * 0.09);
    if (Math.max(absX, absY) < threshold) return;
    claimEvent(event);
    state.lightboxSuppressClickUntil = Date.now() + 260;
    if (absX >= absY) {
      showAdjacentImage(dx < 0 ? 1 : -1);
    } else {
      showAdjacentImage(dy < 0 ? 1 : -1);
    }
  }

  function onStagePointerDown(event) {
    // Edge swipes used to close the image stream. They conflict with normal
    // horizontal browsing and are intentionally disabled on touch devices.
    state.viewerSwipe = null;
  }

  function onStagePointerMove(event) {
    state.viewerSwipe = null;
  }

  function endStageSwipe(event = null) {
    state.viewerSwipe = null;
  }

  function zoomInIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5M10.5 7.5v6M7.5 10.5h6"/></svg>';
  }

  function zoomOutIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5M7.5 10.5h6"/></svg>';
  }

  function lightboxWheelZoom(event) {
    const lb = state.lightbox;
    const media = lb?.querySelector("img, video");
    if (!lb || !media) return false;
    const rect = media.getBoundingClientRect?.();
    if (!rect?.width || !rect?.height) return false;

    const sourceKey = media.currentSrc || media.src || media.dataset?.mediaUrl || "";
    const zoomKey = `${sourceKey}|${media.naturalWidth || media.videoWidth || 0}x${media.naturalHeight || media.videoHeight || 0}`;
    if (media.dataset.xivWheelZoomKey !== zoomKey || !media.dataset.xivWheelBaseWidth) {
      media.dataset.xivWheelZoomKey = zoomKey;
      media.dataset.xivWheelBaseWidth = String(Math.max(1, Math.round(rect.width)));
      media.dataset.xivWheelBaseHeight = String(Math.max(1, Math.round(rect.height)));
      lb.dataset.wheelZoom = "1";
    }

    const current = Number(lb.dataset.wheelZoom || 1);
    const direction = event.deltaY < 0 || event.deltaX < 0 ? 1 : -1;
    const next = Math.max(1, Math.min(4, current * (direction > 0 ? 1.12 : 0.89)));
    const anchorX = (event.clientX + lb.scrollLeft) / Math.max(1, lb.scrollWidth);
    const anchorY = (event.clientY + lb.scrollTop) / Math.max(1, lb.scrollHeight);

    if (next <= 1.03) {
      lb.dataset.zoom = "fit";
      delete lb.dataset.wheelZoom;
      delete media.dataset.xivWheelBaseWidth;
      delete media.dataset.xivWheelBaseHeight;
      delete media.dataset.xivWheelZoomKey;
      media.style.removeProperty("--xiv-actual-width");
      media.style.removeProperty("--xiv-actual-height");
      lb.scrollTo?.({ left: 0, top: 0, behavior: "auto" });
      updateStatus("适应屏幕");
      syncLightboxZoomButton();
      return true;
    }

    const baseWidth = Number(media.dataset.xivWheelBaseWidth || rect.width);
    const baseHeight = Number(media.dataset.xivWheelBaseHeight || rect.height);
    media.style.setProperty("--xiv-actual-width", `${Math.round(baseWidth * next)}px`);
    media.style.setProperty("--xiv-actual-height", `${Math.round(baseHeight * next)}px`);
    lb.dataset.zoom = "actual";
    lb.dataset.wheelZoom = String(next);
    media.dataset.xivCanZoom = "true";
    updateStatus(`${Math.round(next * 100)}%`);
    syncLightboxZoomButton();
    requestAnimationFrame(() => {
      lb.scrollLeft = Math.max(0, Math.round(anchorX * lb.scrollWidth - event.clientX));
      lb.scrollTop = Math.max(0, Math.round(anchorY * lb.scrollHeight - event.clientY));
    });
    return true;
  }

  function onLightboxWheel(event) {
    if (state.lightbox?.dataset.active !== "true") return;
    if (!state.lightbox.contains(event.target)) return;
    claimEvent(event);
    if (state.lightbox.dataset.zoom === "actual" || event.ctrlKey || event.altKey) {
      lightboxWheelZoom(event);
      return;
    }
    const now = Date.now();
    if (now - state.lastLightboxWheelAt < 220) return;
    const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (Math.abs(delta) < 4) return;
    state.lastLightboxWheelAt = now;
    showAdjacentImage(delta > 0 ? 1 : -1);
  }

  window.__flowLensHandleLightboxZoomWheel = lightboxWheelZoom;

  function claimEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

  function discoverNearbyPages() {
    const activeUrl = activeGalleryQueueUrl();
    if (isZttaotuUrl(activeUrl)) return;
    const prefix = galleryPrefixFromUrl(activeUrl);
    const n = pageNumberFromUrl(activeUrl);
    if (!prefix || !n) return;
    const discoveryWindow = galleryDiscoveryWindow(activeUrl);
    for (let i = Math.max(1, n - discoveryWindow); i <= n + discoveryWindow; i += 1) {
      const url = galleryPageUrlFromPrefix(prefix, i);
      if (url) state.pageUrls.add(url);
    }
  }

  function onKeydown(event) {
    const target = event.target;
    const isTyping = target?.matches?.("input, textarea, select, [contenteditable='true'], [contenteditable='']");
    if (!state.active && !isTyping && event.key.toLowerCase() === "g") {
      claimEvent(event);
      openViewer();
      return;
    }
    if (!state.active) return;
    if (!isTyping && ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) {
      cancelViewerPositionRestoreForUser(event);
    }
    if (state.lightbox?.dataset.active === "true" && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      claimEvent(event);
      if (event.repeat) return;
      showAdjacentImage(event.key === "ArrowRight" ? 1 : -1);
      return;
    }
    if (!isTyping && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "m") {
      claimEvent(event);
      if (!event.repeat) toggleLinkGrabberPanel();
      return;
    }
    const queuePrevKey = event.key === "ArrowLeft";
    const queueNextKey = event.key === "ArrowRight";
    if (!isTyping && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && (queuePrevKey || queueNextKey)) {
      claimEvent(event);
      if (event.repeat) return;
      navigateGalleryQueue(queueNextKey ? 1 : -1);
      return;
    }
    if (event.key === "Escape") {
      claimEvent(event);
      const openPanel = [state.galleryQueuePanel, state.linkGrabberPanel, state.settingsPanel, state.diagnosticsPanel]
        .find((panel) => panel?.dataset.open === "true");
      if (openPanel) openPanel.dataset.open = "false";
      else if (state.lightbox?.dataset.active === "true") closeLightbox();
      else closeViewer();
    } else if (!isTyping && event.key.toLowerCase() === "g") {
      claimEvent(event);
      closeViewer();
    } else if (event.key === "+" || event.key === "=") {
      claimEvent(event);
      setColumns(state.columns + 1);
    } else if (event.key === "-" || event.key === "_") {
      claimEvent(event);
      setColumns(state.columns - 1);
    } else if (event.key.toLowerCase() === "f") {
      claimEvent(event);
      toggleFullscreen();
    } else if (event.key.toLowerCase() === "t") {
      claimEvent(event);
      toggleTheme();
    } else if (event.key.toLowerCase() === "d") {
      claimEvent(event);
      downloadZip();
    } else if (event.key.toLowerCase() === "a") {
      claimEvent(event);
      toggleAutoScroll();
    } else if (event.key === "[" || event.key === "{") {
      claimEvent(event);
      setAutoScrollSpeed(state.autoScrollSpeed - 1);
    } else if (event.key === "]" || event.key === "}") {
      claimEvent(event);
      setAutoScrollSpeed(state.autoScrollSpeed + 1);
    } else if (event.key === "Home") {
      claimEvent(event);
      state.stage.scrollTo({ top: 0, behavior: "smooth" });
    } else if (event.key === "End") {
      claimEvent(event);
      state.stage.scrollTo({ top: state.stage.scrollHeight, behavior: "smooth" });
    }
  }

  function onKeyRelease(event) {
    if (!state.active || state.lightbox?.dataset.active !== "true") return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      claimEvent(event);
    }
  }

  function onScroll() {
    if (!state.stage) return;
    state.lastStageScrollAt = Date.now();
    scheduleViewerPositionSave();
    pumpVideoPreviewQueue();
    const nearBottom = state.stage.scrollTop + state.stage.clientHeight > state.stage.scrollHeight - 1800;
    if (nearBottom) fetchRemainingPages();
  }

  function installControlApi() {
    window.__flowLensControl = {
      refreshMediaFilter() { applyMediaFilter(); updateCounter(); },
      getMediaFilter() {
        return state.mediaFilter;
      },
      setMediaFilter(value) {
        setMediaFilter(value);
        return state.mediaFilter;
      },
      isLightboxOpen() {
        return state.lightbox?.dataset.active === "true";
      },
      getLightboxIndex() {
        return state.index;
      },
      showAdjacent(delta = 1) {
        if (state.lightbox?.dataset.active !== "true") return false;
        return showAdjacentImage(delta >= 0 ? 1 : -1);
      },
      openLightboxIndex(index) {
        if (!state.active || !Number.isInteger(index) || index < 0 || index >= state.images.length) return false;
        state.lightboxGestureToken = Date.now();
        void openLightbox(index);
        return true;
      },
      restorePageLock,
      playVideo: requestVideoPlayback,
      retryFailedPages() {
        if (state.fetching) return Promise.resolve(false);
        state.failedPages.clear();
        state.galleryFailureCount = 0;
        return fetchRemainingPages(GALLERY_FETCH_BATCH, true);
      },
      currentPageBookmarkUrl() {
        return normalizedPageUrl(state.galleryQueueCurrentUrl || location.href);
      },
      currentPageBookmarkTitle() {
        return cleanPageTitle(state.galleryQueueCurrentTitle || document.title, pageBookmarkHost(state.galleryQueueCurrentUrl || location.href));
      },
      loadSavedPage(url) {
        return loadSavedPageInPlace(url);
      },
      getSessionSnapshot() {
        return currentViewerPosition();
      },
      getAdapterStatus() {
        return siteAdapterStatus();
      }
    };
  }

  function siteAdapterStatus() {
    const adapters = [];
    if (isGenericX810114Page()) adapters.push("x.810114 通用页");
    if (isX810114ProfilePage()) adapters.push("x.810114 主页队列");
    if (isXchinaPhotoUrl(state.galleryQueueCurrentUrl || location.href)) adapters.push("xchina 图库");
    if (isPhotoGalleryPage(state.galleryQueueCurrentUrl || location.href)) adapters.push("分页图库");
    if (isPornpicsGalleryPage(state.galleryQueueCurrentUrl || location.href)) adapters.push("PornPics 图集");
    if (isCloudDriveFilesPage(state.galleryQueueCurrentUrl || location.href)) adapters.push("115/CloudDrive 文件页");
    if (isBuonduaPage(state.galleryQueueCurrentUrl || location.href)) adapters.push("Buondua 文章");
    if (isZttaotuUrl(state.galleryQueueCurrentUrl || location.href)) adapters.push("ZTTaoTu 专题");
    if (window.__flowLensMediaFilter?.readConfig?.().enabled) adapters.push("广告识别中心");
    if (window.__flowLensVirtualMasonry) adapters.push("虚拟瀑布流");

    const sourceUrl = state.galleryQueueCurrentUrl || location.href;
    const strategy = isGenericX810114Page()
      ? (state.x810114ApiMode ? "API 采集 + 动态观察" : "页面采集 + 动态观察")
      : isPhotoGalleryPage(sourceUrl)
        ? "分页发现 + 后台补齐"
        : "当前页面扫描 + 动态观察";

    return {
      site: (() => { try { return new URL(sourceUrl).hostname; } catch { return location.hostname; } })(),
      url: sourceUrl,
      adapters: adapters.length ? adapters : ["通用媒体扫描"],
      strategy,
      media: {
        total: state.images.length,
        visible: filteredImages().length,
        expected: state.expectedImages || 0,
        rejected: state.rejectedCount,
        collected: state.collectedCount,
        rendered: state.renderedKeys.size,
        queuedRender: state.renderQueue.length
      },
      pages: {
        known: state.pageUrls.size,
        fetched: state.fetchedPages.size,
        failures: state.galleryFailureCount,
        fetching: state.fetching
      },
      queue: {
        index: state.galleryQueueIndex,
        total: state.galleryQueue.length,
        title: state.galleryQueueCurrentTitle || document.title || ""
      },
      settings: {
        filter: state.mediaFilter,
        columns: state.columns,
        videoPreview: state.settings?.videoPreview !== false
      }
    };
  }

  if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === "XIV_TOGGLE") {
        if (state.active) closeViewer();
        else openViewer();
      }
    });
  }

  installControlApi();
  window.addEventListener("flowlens:settings-updated", () => { loadSettings(); if (state.root) applySettings(); });
  ensureUi();
  maybeAutoOpenFromGalleryQueue();
})();

// FlowLens module: src/core/optimizer.js
(() => {
  if (window.__flowLensUxPatch) return;
  window.__flowLensUxPatch = true;

  const SETTINGS_KEY = "flowlens-settings-v2";
  const FILTER_KEY = "flowlens-media-filter-v1";
  const KEEP_ACTIONS = new Set(["download", "link-grabber", "auto", "full", "prev-set", "next-set", "queue-list", "top", "settings", "close"]);
  const VIDEO_RE = /\.(mp4|webm|mov|m4v)(?:[?#]|$)/i;
  let mutationTimer = 0;
  let lightboxObserver = null;
  let lastSwitchDirection = "fade";
  let swipeStart = null;

  const css = `
    html.xiv-active,
    html.xiv-active body { margin: 0 !important; padding: 0 !important; background: #000 !important; overscroll-behavior: none !important; }
    #xiv-root { position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100dvh !important; max-height: 100dvh !important; overflow: hidden !important; background: #050505 !important; transform: none !important; }
    #xiv-root[data-theme="light"] { background: #f4f4f1 !important; color: #141414 !important; }
    @supports not (height: 100dvh) { #xiv-root { height: 100vh !important; max-height: 100vh !important; } }
    #xiv-root::before { content: ""; position: fixed; left: 0; right: 0; top: 0; height: max(env(safe-area-inset-top, 0px), 1px); background: #050505; z-index: 2; pointer-events: none; }
    #xiv-root[data-theme="light"]::before { background: #f4f4f1; }
    #xiv-stage { inset: 0 !important; width: 100% !important; height: 100% !important; box-sizing: border-box !important; padding-top: calc(54px + env(safe-area-inset-top, 0px)) !important; padding-right: max(6px, env(safe-area-inset-right, 0px)) !important; padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px)) !important; padding-left: max(6px, env(safe-area-inset-left, 0px)) !important; background: transparent !important; }
    #xiv-topbar { top: 0 !important; padding-top: calc(8px + env(safe-area-inset-top, 0px)) !important; background: linear-gradient(to bottom, rgba(0,0,0,.9), rgba(0,0,0,.36), rgba(0,0,0,0)) !important; }
    #xiv-root[data-theme="light"] #xiv-topbar { background: linear-gradient(to bottom, rgba(244,244,241,.92), rgba(244,244,241,.45), rgba(244,244,241,0)) !important; }
    #xiv-topbar .xiv-pill { background: transparent !important; border: 0 !important; color: #fff !important; padding: 0 4px !important; box-shadow: none !important; backdrop-filter: none !important; text-shadow: 0 1px 2px rgba(0,0,0,.72), 0 0 10px rgba(0,0,0,.46) !important; }
    #xiv-topbar [data-xiv]:not([data-xiv="download"]):not([data-xiv="link-grabber"]):not([data-xiv="auto"]):not([data-xiv="full"]):not([data-xiv="prev-set"]):not([data-xiv="next-set"]):not([data-xiv="queue-list"]):not([data-xiv="top"]):not([data-xiv="settings"]):not([data-xiv="close"]), #xiv-topbar .xiv-select[data-xiv="filter"] { display: none !important; }
    #xiv-topbar .xiv-actions { gap: 8px !important; flex-wrap: nowrap !important; }
    #xiv-root[data-lightbox-active="true"] #xiv-topbar { justify-content: flex-end !important; gap: 0 !important; padding: 8px 10px !important; pointer-events: none !important; }
    #xiv-root[data-lightbox-active="true"] #xiv-topbar .xiv-pill { display: none !important; }
    #xiv-root[data-lightbox-active="true"] #xiv-topbar .xiv-actions { max-width: calc(100vw - 20px) !important; gap: 7px !important; flex-wrap: nowrap !important; justify-content: flex-end !important; overflow: visible !important; pointer-events: auto !important; }
    #xiv-root[data-lightbox-active="true"] #xiv-topbar .xiv-btn { min-width: 38px !important; width: 38px !important; height: 38px !important; padding: 0 !important; flex: 0 0 38px !important; }
    #xiv-root[data-lightbox-active="true"] #xiv-topbar [data-xiv="prev-set"], #xiv-root[data-lightbox-active="true"] #xiv-topbar [data-xiv="next-set"], #xiv-root[data-lightbox-active="true"] #xiv-topbar [data-xiv="queue-list"], #xiv-root[data-lightbox-active="true"] #xiv-topbar [data-xiv="top"] { display: none !important; }
    html.xiv-fl-launch-hidden #xiv-launch { display: none !important; }
    .xiv-fl-filter-select { height: 34px; min-width: 108px; border-radius: 999px; border: 1px solid rgba(255,255,255,.18); background: rgba(18,18,20,.72); color: #fff; padding: 0 28px 0 12px; font: 800 13px/1 system-ui, sans-serif; }
    #xiv-root[data-theme="light"] .xiv-fl-filter-select { background: rgba(255,255,255,.86); color: #151515; border-color: rgba(0,0,0,.12); }
    .xiv-fl-stepper { display: inline-flex; align-items: center; gap: 8px; min-height: 34px; }
    .xiv-fl-stepper button { width: 34px; height: 34px; border: 1px solid rgba(255,255,255,.18); border-radius: 999px; background: rgba(18,18,20,.72); color: #fff; font: 900 18px/1 system-ui, sans-serif; cursor: pointer; }
    .xiv-fl-stepper strong { min-width: 46px; text-align: center; font: 850 13px/1 system-ui, sans-serif; }
    #xiv-root[data-theme="light"] .xiv-fl-stepper button { background: rgba(255,255,255,.86); color: #151515; border-color: rgba(0,0,0,.12); }
    #xiv-root [data-panel="settings"] small { display: none !important; }
    #xiv-lightbox img, #xiv-lightbox video, #xiv-lightbox iframe, #xiv-lightbox .xiv-video-frame { will-change: transform, opacity; backface-visibility: hidden; }
    #xiv-lightbox .xiv-fl-media-anim { animation: none !important; opacity: 1 !important; transform: none !important; }
    #xiv-lightbox[data-fl-dir="next-y"] .xiv-fl-media-anim { animation-name: xivFlNextY; }
    #xiv-lightbox[data-fl-dir="prev-y"] .xiv-fl-media-anim { animation-name: xivFlPrevY; }
    #xiv-lightbox[data-fl-dir="next-x"] .xiv-fl-media-anim { animation-name: xivFlNextX; }
    #xiv-lightbox[data-fl-dir="prev-x"] .xiv-fl-media-anim { animation-name: xivFlPrevX; }
    #xiv-lightbox[data-fl-dir="fade"] .xiv-fl-media-anim { animation-name: xivFlFade; }
    @keyframes xivFlNextY { from { opacity:.18; transform:translate3d(0,8vh,0) scale(.985); } to { opacity:1; transform:translate3d(0,0,0) scale(1); } }
    @keyframes xivFlPrevY { from { opacity:.18; transform:translate3d(0,-8vh,0) scale(.985); } to { opacity:1; transform:translate3d(0,0,0) scale(1); } }
    @keyframes xivFlNextX { from { opacity:.18; transform:translate3d(8vw,0,0) scale(.985); } to { opacity:1; transform:translate3d(0,0,0) scale(1); } }
    @keyframes xivFlPrevX { from { opacity:.18; transform:translate3d(-8vw,0,0) scale(.985); } to { opacity:1; transform:translate3d(0,0,0) scale(1); } }
    @keyframes xivFlFade { from { opacity:.25; transform:scale(.985); } to { opacity:1; transform:scale(1); } }
    @media (max-width: 820px) { #xiv-topbar { justify-content: space-between !important; align-items:flex-start !important; gap: 6px !important; padding-right: max(8px, env(safe-area-inset-right, 0px)) !important; padding-left: max(8px, env(safe-area-inset-left, 0px)) !important; } #xiv-topbar .xiv-pill { display: inline-flex !important; } #xiv-topbar .xiv-actions { flex-wrap: nowrap !important; justify-content:flex-end !important; max-width: calc(100vw - 104px) !important; gap: 6px !important; overflow: visible !important; } #xiv-topbar .xiv-btn { min-width: 36px !important; width: 36px !important; height: 36px !important; padding: 0 !important; flex: 0 0 36px !important; } #xiv-topbar .xiv-btn span { display: none !important; } #xiv-root[data-lightbox-active="true"] #xiv-topbar .xiv-btn { min-width: 34px !important; width: 34px !important; height: 34px !important; flex: 0 0 34px !important; } #xiv-stage { padding-top: calc(58px + env(safe-area-inset-top, 0px)) !important; } #xiv-lightbox img, #xiv-lightbox video { max-width: 100vw !important; max-height: 100dvh !important; } }
  `;

  function injectStyle() { if (document.getElementById("xiv-fl-ux-patch-style")) return; const style = document.createElement("style"); style.id = "xiv-fl-ux-patch-style"; style.textContent = css; document.documentElement.appendChild(style); }
  function readSettings() { const extensionSettings = window.__flowLensSettingsStore?.read?.(); if (extensionSettings) return extensionSettings; try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {}; } catch { return {}; } }
  function saveSettings(patch) { if (window.__flowLensSettingsStore?.write) return window.__flowLensSettingsStore.write(patch); const settings = { ...readSettings(), ...patch }; try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); window.__flowLensSyncGlobalSettings?.(patch); } catch { /* ignore */ } return settings; }
  function launchHidden() { return readSettings().launchHidden === true; }
  function applyLaunchVisibility() { document.documentElement.classList.toggle("xiv-fl-launch-hidden", launchHidden()); }
  function getStoredFilter() { const nativeSelect = document.querySelector('#xiv-root [data-xiv="filter"]'); const value = localStorage.getItem(FILTER_KEY) || (nativeSelect ? nativeSelect.value : "all") || "all"; return ["all", "image", "video"].includes(value) ? value : "all"; }
  function mediaTypeOfTile(tile) { const url = (tile && tile.dataset && tile.dataset.url) || ""; if (VIDEO_RE.test(url)) return "video"; if (tile && tile.querySelector && tile.querySelector("video, .xiv-video-mark")) return "video"; return "image"; }
  function applyFilterDom(value = getStoredFilter()) { const api = window.__flowLensControl; if (api && api.getMediaFilter?.() !== value) api.setMediaFilter?.(value); }
  function setStoredFilter(value) { const next = ["all", "image", "video"].includes(value) ? value : "all"; try { localStorage.setItem(FILTER_KEY, next); } catch { /* ignore */ } const nativeSelect = document.querySelector('#xiv-root [data-xiv="filter"]'); if (nativeSelect && nativeSelect.value !== next) { nativeSelect.value = next; nativeSelect.dispatchEvent(new Event("change", { bubbles: true })); } [0, 80, 180].forEach((delay) => setTimeout(() => applyFilterDom(next), delay)); syncAddonControls(); }
  function ensureToolbarCompact() { document.querySelectorAll("#xiv-topbar [data-xiv]").forEach((el) => { const show = KEEP_ACTIONS.has(el.dataset.xiv); if (el.hidden !== !show) el.hidden = !show; const display = show ? "" : "none"; if (el.style.display !== display) el.style.display = display; }); const filter = document.querySelector('#xiv-topbar .xiv-select[data-xiv="filter"]'); if (filter) { if (!filter.hidden) filter.hidden = true; if (filter.style.display !== "none") filter.style.display = "none"; } }
  function createSettingRow(labelText, control, id) { const label = document.createElement("label"); label.className = "xiv-setting-row"; label.dataset.flAddon = id || "true"; const span = document.createElement("span"); span.textContent = labelText; label.append(span, control); return label; }
  function createStepper(id, minusAction, plusAction) { const box = document.createElement("span"); box.className = "xiv-fl-stepper"; box.dataset.flStepper = id; box.innerHTML = `<button type="button" data-fl-minus>−</button><strong data-fl-value>--</strong><button type="button" data-fl-plus>+</button>`; box.querySelector("[data-fl-minus]").addEventListener("click", (event) => { event.preventDefault(); document.querySelector(`#xiv-root [data-xiv="${minusAction}"]`)?.click(); setTimeout(refreshSteppers, 120); }); box.querySelector("[data-fl-plus]").addEventListener("click", (event) => { event.preventDefault(); document.querySelector(`#xiv-root [data-xiv="${plusAction}"]`)?.click(); setTimeout(refreshSteppers, 120); }); return box; }
  function refreshSteppers() { const settings = readSettings(); const columns = Math.max(2, Math.min(8, Number(settings.columns || 3))); const speed = Math.max(1, Math.min(10, Number(settings.autoScrollSpeed || 3))); const colValue = document.querySelector('[data-fl-stepper="columns"] [data-fl-value]'); const speedValue = document.querySelector('[data-fl-stepper="speed"] [data-fl-value]'); if (colValue && colValue.textContent !== `${columns}列`) colValue.textContent = `${columns}列`; if (speedValue && speedValue.textContent !== `${speed}档`) speedValue.textContent = `${speed}档`; }
  function ensureSettingsAddons() { const panel = document.querySelector('#xiv-root [data-panel="settings"]'); if (!panel) return; if (panel.querySelector('[data-fl-addon="launch-hidden"]')) { refreshSteppers(); return; } const themeRow = panel.querySelector('[data-setting="theme"]')?.closest?.(".xiv-setting-row"); const insertBefore = themeRow || null; const columnsRow = createSettingRow("图片流列数", createStepper("columns", "less", "more"), "columns"); const speedRow = createSettingRow("自动滚动速度", createStepper("speed", "slower", "faster"), "speed"); const hideInput = document.createElement("input"); hideInput.type = "checkbox"; hideInput.dataset.flSetting = "launchHidden"; hideInput.checked = launchHidden(); hideInput.addEventListener("change", () => { saveSettings({ launchHidden: hideInput.checked }); applyLaunchVisibility(); syncAddonControls(); }); const hideRow = createSettingRow("隐藏入口图标（用 G 或 Alt+F 打开）", hideInput, "launch-hidden"); const filterSelect = document.createElement("select"); filterSelect.className = "xiv-fl-filter-select"; filterSelect.dataset.flSetting = "mediaFilter"; filterSelect.innerHTML = '<option value="all">全部</option><option value="image">只看图片</option><option value="video">只看视频</option>'; filterSelect.value = getStoredFilter(); filterSelect.addEventListener("change", () => setStoredFilter(filterSelect.value)); const filterRow = createSettingRow("图片流筛选", filterSelect, "media-filter"); panel.insertBefore(columnsRow, insertBefore); panel.insertBefore(speedRow, insertBefore); panel.insertBefore(hideRow, insertBefore); panel.insertBefore(filterRow, insertBefore); refreshSteppers(); }
  function syncAddonControls() { const hideInput = document.querySelector('[data-fl-setting="launchHidden"]'); if (hideInput) hideInput.checked = launchHidden(); const filterSelect = document.querySelector('[data-fl-setting="mediaFilter"]'); if (filterSelect) filterSelect.value = getStoredFilter(); refreshSteppers(); }
  function isTypingTarget(target) { return target && target.matches && target.matches("input, textarea, select, [contenteditable='true'], [contenteditable='']"); }
  function toggleViewerByPatch() { const root = document.getElementById("xiv-root"); if (root && root.dataset.active === "true") { const close = document.querySelector('#xiv-root [data-xiv="close"]'); if (close) close.click(); return; } const launch = document.getElementById("xiv-launch"); if (launch) launch.click(); }
  function closePanelsOnOutside(event) { const settingsPanel = document.querySelector('#xiv-root [data-panel="settings"]'); const diagnosticsPanel = document.querySelector('#xiv-root [data-panel="diagnostics"]'); const queuePanel = document.querySelector('#xiv-root [data-panel="queue"]'); const linkPanel = document.querySelector('#xiv-root [data-panel="link-grabber"]'); if ((!settingsPanel || settingsPanel.dataset.open !== "true") && (!diagnosticsPanel || diagnosticsPanel.dataset.open !== "true") && (!queuePanel || queuePanel.dataset.open !== "true") && (!linkPanel || linkPanel.dataset.open !== "true")) return; if (event.target && event.target.closest && event.target.closest('[data-panel="settings"], [data-panel="diagnostics"], [data-panel="queue"], [data-panel="link-grabber"], [data-xiv="settings"], [data-xiv="diag"], [data-xiv="queue-list"], [data-xiv="link-grabber"]')) return; if (settingsPanel) settingsPanel.dataset.open = "false"; if (diagnosticsPanel) diagnosticsPanel.dataset.open = "false"; if (queuePanel) queuePanel.dataset.open = "false"; if (linkPanel) linkPanel.dataset.open = "false"; }
  function bindShortcuts() { document.addEventListener("pointerdown", closePanelsOnOutside, true); document.addEventListener("keydown", (event) => { if (isTypingTarget(event.target)) return; if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "f") { event.preventDefault(); event.stopPropagation(); toggleViewerByPatch(); } const lightbox = document.getElementById("xiv-lightbox"); if (lightbox && lightbox.dataset.active === "true") { if (event.key === "ArrowRight") lastSwitchDirection = "next-x"; else if (event.key === "ArrowLeft") lastSwitchDirection = "prev-x"; } }, true); document.addEventListener("wheel", (event) => { const lightbox = document.getElementById("xiv-lightbox"); if (!lightbox || lightbox.dataset.active !== "true" || !lightbox.contains(event.target)) return; const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX; if (Math.abs(delta) > 4) lastSwitchDirection = delta > 0 ? "next-y" : "prev-y"; }, true); document.addEventListener("pointerdown", (event) => { const lightbox = document.getElementById("xiv-lightbox"); if (!lightbox || lightbox.dataset.active !== "true" || !lightbox.contains(event.target)) return; if (event.target && event.target.closest && event.target.closest(".xiv-lightbox-fav, .xiv-lightbox-close, .xiv-lightbox-arrow")) return; swipeStart = { x: event.clientX, y: event.clientY }; }, true); document.addEventListener("pointerup", (event) => { if (!swipeStart) return; const dx = event.clientX - swipeStart.x; const dy = event.clientY - swipeStart.y; swipeStart = null; if (Math.max(Math.abs(dx), Math.abs(dy)) < 28) return; lastSwitchDirection = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? "next-x" : "prev-x") : (dy < 0 ? "next-y" : "prev-y"); }, true); }
  function animateLightboxMedia() { lastSwitchDirection = "fade"; }
  function setImportantStyle(el, key, value) { if (el && (el.style.getPropertyValue(key) !== value || el.style.getPropertyPriority(key) !== "important")) el.style.setProperty(key, value, "important"); }
  function clearStyle(el, keys) { if (!el) return; keys.forEach((key) => { if (el.style.getPropertyValue(key)) el.style.removeProperty(key); }); }
  function isTouchLikeDevice() { return matchMedia("(pointer: coarse)").matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent); }
  function applyLightboxToolbarLayout(active) {
    const topbar = document.getElementById("xiv-topbar");
    const pill = document.querySelector("#xiv-topbar .xiv-pill");
    const actions = document.querySelector("#xiv-topbar .xiv-actions");
    const buttons = document.querySelectorAll("#xiv-topbar .xiv-btn");
    const hidden = document.querySelectorAll('#xiv-topbar [data-xiv="prev-set"], #xiv-topbar [data-xiv="next-set"], #xiv-topbar [data-xiv="queue-list"], #xiv-topbar [data-xiv="top"]');
    if (active) {
      setImportantStyle(topbar, "justify-content", "flex-end");
      setImportantStyle(topbar, "gap", "0");
      setImportantStyle(topbar, "padding", "8px 10px");
      setImportantStyle(topbar, "pointer-events", "none");
      setImportantStyle(pill, "display", "none");
      if (isTouchLikeDevice()) {
        setImportantStyle(actions, "display", "none");
        return;
      }
      setImportantStyle(actions, "max-width", "calc(100vw - 20px)");
      setImportantStyle(actions, "gap", "7px");
      setImportantStyle(actions, "flex-wrap", "nowrap");
      setImportantStyle(actions, "justify-content", "flex-end");
      setImportantStyle(actions, "overflow", "visible");
      setImportantStyle(actions, "pointer-events", "auto");
      buttons.forEach((button) => {
        setImportantStyle(button, "min-width", "38px");
        setImportantStyle(button, "width", "38px");
        setImportantStyle(button, "height", "38px");
        setImportantStyle(button, "padding", "0");
        setImportantStyle(button, "flex", "0 0 38px");
      });
      hidden.forEach((button) => setImportantStyle(button, "display", "none"));
      return;
    }
    clearStyle(topbar, ["justify-content", "gap", "padding", "pointer-events"]);
    clearStyle(pill, ["display"]);
    clearStyle(actions, ["display", "max-width", "gap", "flex-wrap", "justify-content", "overflow", "pointer-events"]);
    buttons.forEach((button) => clearStyle(button, ["min-width", "width", "height", "padding", "flex", "display"]));
  }
  function syncLightboxState() {
    const root = document.getElementById("xiv-root");
    const lightbox = document.getElementById("xiv-lightbox");
    const active = lightbox?.dataset.active === "true";
    if (root && lightbox && root.dataset.lightboxActive !== String(active)) root.dataset.lightboxActive = String(active);
    applyLightboxToolbarLayout(active);
  }
  function observeLightbox() { const lightbox = document.getElementById("xiv-lightbox"); if (!lightbox || lightbox.dataset.flObserved === "true") return; lightbox.dataset.flObserved = "true"; if (lightboxObserver && lightboxObserver.disconnect) lightboxObserver.disconnect(); lightboxObserver = new MutationObserver(() => requestAnimationFrame(() => { syncLightboxState(); animateLightboxMedia(); })); lightboxObserver.observe(lightbox, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "data-active"] }); }
  function applyAll() { injectStyle(); applyLaunchVisibility(); ensureToolbarCompact(); ensureSettingsAddons(); syncAddonControls(); observeLightbox(); syncLightboxState(); applyFilterDom(getStoredFilter()); }
  function scheduleApplyAll() { clearTimeout(mutationTimer); mutationTimer = setTimeout(applyAll, 80); }

  injectStyle();
  bindShortcuts();
  applyAll();
  new MutationObserver((records) => { if (records.some(record => record.target.closest?.("#xiv-root") || [...record.addedNodes].some(node => node.id === "xiv-root"))) scheduleApplyAll(); }).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("resize", () => applyFilterDom(getStoredFilter()), { passive: true });
})();

// FlowLens module: src/patches/product.js
(() => {
  if (window.__flowLensProductLayer) return;
  window.__flowLensProductLayer = true;

  const HISTORY_KEY = "flowlens-history-v1";
  const SETTINGS_KEY = "flowlens-settings-v2";
  const FILTER_KEY = "flowlens-media-filter-v1";
  const VIDEO_RE = /\.(mp4|webm|mov|m4v)(?:[?#]|$)/i;
  const IMAGE_RE = /(?:\.(avif|gif|jpe?g|png|webp)(?:[?#]|$)|[?&]format=(?:avif|gif|jpe?g|png|webp)\b)/i;
  const selectedKeys = new Set();
  let selectionMode = false;
  let applyTimer = 0;
  let historyTimer = 0;
  let preloadTimer = 0;
  let mediaObserver = null;
  let lightboxAutoTimer = 0;
  let lightboxAutoPlaying = false;

  const css = `
    #xiv-topbar .xiv-fl-product-btn { display: none !important; }
    #xiv-root[data-fl-selecting="true"] .xiv-tile { cursor: copy !important; }
    #xiv-root .xiv-tile[data-fl-selected="true"] {
      outline: 3px solid #4f8cff !important;
      outline-offset: -3px !important;
      box-shadow: 0 0 0 3px rgba(79,140,255,.25), 0 18px 42px rgba(0,0,0,.34) !important;
    }
    #xiv-root .xiv-tile[data-fl-selected="true"]::after {
      content: "✓";
      position: absolute;
      right: 8px;
      top: 8px;
      width: 26px;
      height: 26px;
      display: grid;
      place-items: center;
      border-radius: 999px;
      background: #1d6fff;
      color: #fff;
      font: 900 17px/1 system-ui, sans-serif;
      box-shadow: 0 8px 24px rgba(0,0,0,.28);
      z-index: 4;
      pointer-events: none;
    }
    #xiv-fl-help {
      position: fixed;
      inset: 0;
      z-index: 999999;
      display: none;
      place-items: center;
      background: rgba(0,0,0,.42);
      backdrop-filter: blur(8px);
      color: #fff;
      pointer-events: auto;
    }
    #xiv-fl-help[data-open="true"] { display: grid; }
    #xiv-fl-help-card {
      width: min(680px, calc(100vw - 32px));
      max-height: min(78vh, 680px);
      overflow: auto;
      border-radius: 18px;
      background: rgba(18,18,22,.96);
      border: 1px solid rgba(255,255,255,.16);
      box-shadow: 0 28px 90px rgba(0,0,0,.45);
      padding: 20px;
      box-sizing: border-box;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    #xiv-fl-help-card h2 { margin: 0 0 14px; font-size: 20px; }
    #xiv-fl-help-card table { width: 100%; border-collapse: collapse; font-size: 14px; }
    #xiv-fl-help-card td { padding: 9px 6px; border-top: 1px solid rgba(255,255,255,.1); vertical-align: top; }
    #xiv-fl-help-card kbd { display: inline-block; min-width: 28px; padding: 4px 8px; border-radius: 8px; background: rgba(255,255,255,.12); text-align: center; font: 800 13px/1 system-ui, sans-serif; }
    #xiv-fl-help-close { float: right; border: 0; border-radius: 999px; background: rgba(255,255,255,.12); color: #fff; width: 34px; height: 34px; cursor: pointer; font-size: 18px; }
    #xiv-fl-toast {
      position: fixed;
      left: 50%;
      bottom: 28px;
      transform: translateX(-50%);
      z-index: 999999;
      max-width: min(720px, calc(100vw - 28px));
      padding: 10px 14px;
      border-radius: 999px;
      background: rgba(18,18,22,.88);
      color: #fff;
      border: 1px solid rgba(255,255,255,.16);
      box-shadow: 0 16px 46px rgba(0,0,0,.38);
      font: 760 13px/1.35 system-ui, sans-serif;
      display: none;
      pointer-events: none;
    }
    #xiv-fl-toast[data-open="true"] { display: block; }
    .xiv-fl-lightbox-auto {
      position: absolute;
      right: 82px;
      top: max(18px, env(safe-area-inset-top, 0px) + 14px);
      z-index: 12;
      width: 58px;
      height: 58px;
      border: 0;
      border-radius: 999px;
      background: rgba(0,0,0,.46);
      color: #fff;
      cursor: pointer;
      display: grid;
      place-items: center;
      box-shadow: 0 12px 34px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.16);
      backdrop-filter: blur(10px);
      font: 900 22px/1 system-ui, sans-serif;
    }
    .xiv-fl-lightbox-auto[data-playing="true"] { background: rgba(29,111,255,.75); }
    .xiv-fl-lightbox-auto::before { content: "▶"; margin-left: 3px; }
    .xiv-fl-lightbox-auto[data-playing="true"]::before { content: "Ⅱ"; margin-left: 0; letter-spacing: -2px; }
    @media (max-width: 820px) {
      #xiv-fl-help-card { padding: 16px; }
      #xiv-fl-help-card table { font-size: 13px; }
      .xiv-fl-lightbox-auto { right: 74px; width: 54px; height: 54px; }
    }
  `;

  function root() { return document.getElementById("xiv-root"); }
  function active() { return root()?.dataset.active === "true"; }
  function lightbox() { return document.getElementById("xiv-lightbox"); }
  function lightboxActive() { return lightbox()?.dataset.active === "true"; }
  function tiles() { return [...document.querySelectorAll("#xiv-grid .xiv-tile")].sort((a, b) => Number(a.dataset.index || 0) - Number(b.dataset.index || 0)); }
  function visibleTiles() { return tiles().filter((tile) => !tile.hidden && tile.style.display !== "none" && tile.dataset.flDuplicate !== "true"); }
  function selectedTiles() { return tiles().filter((tile) => selectedKeys.has(tileKey(tile))); }

  function injectStyle() {
    if (document.getElementById("xiv-fl-product-style")) return;
    const style = document.createElement("style");
    style.id = "xiv-fl-product-style";
    style.textContent = css;
    document.documentElement.appendChild(style);
  }

  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || "") || fallback; } catch { return fallback; }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  }

  function settings() { return window.__flowLensSettingsStore?.read?.() || readJson(SETTINGS_KEY, {}); }

  function safePart(text, fallback = "FlowLens") {
    return String(text || fallback)
      .replace(/[\\/:*?"<>|\x00-\x1f]+/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 90) || fallback;
  }

  function pageTitle() {
    const title = document.title.replace(/[-_—|]+\s*知乎.*/i, "").trim();
    return safePart(title || location.hostname || "FlowLens");
  }

  function mediaUrl(tile) { return tile?.dataset?.url || tile?.querySelector?.("img, video")?.currentSrc || tile?.querySelector?.("img, video")?.src || ""; }

  function tileKey(tile) {
    const url = mediaUrl(tile);
    try {
      const parsed = new URL(url, location.href);
      parsed.hash = "";
      const zhihu = parsed.hostname.includes("zhimg.com") && parsed.pathname.match(/\/(?:\d+\/)?(v2-[A-Za-z0-9]+)(?:[_-][^/.]+)?\./i)?.[1];
      return zhihu ? `zhihu:${zhihu.toLowerCase()}` : parsed.href;
    } catch {
      return url.replace(/#.*$/, "");
    }
  }

  function isVideo(url) { return VIDEO_RE.test(String(url || "")); }
  function isImage(url) { return IMAGE_RE.test(String(url || "")) && !isVideo(url); }

  function extFromUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      const format = parsed.searchParams.get("format")?.toLowerCase();
      if (format && ["jpg", "jpeg", "png", "webp", "avif", "gif"].includes(format)) return format === "jpeg" ? "jpg" : format;
      const ext = parsed.pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
      if (ext) return ext === "jpeg" ? "jpg" : ext;
    } catch { /* ignore */ }
    return isVideo(url) ? "mp4" : "jpg";
  }

  function filenameFor(url, index) {
    const folder = safePart(settings().downloadFolder || pageTitle());
    const mediaFolder = isVideo(url) ? "视频" : "图片";
    const ext = extFromUrl(url);
    return `${folder}/${mediaFolder}/${String(index + 1).padStart(4, "0")}.${ext}`;
  }

  function mountInRoot(node) {
    const r = root();
    if (r && node.parentElement !== r) r.appendChild(node);
    else if (!node.parentElement) document.documentElement.appendChild(node);
  }

  function toast(text, ms = 1600) {
    let node = document.getElementById("xiv-fl-toast");
    if (!node) {
      node = document.createElement("div");
      node.id = "xiv-fl-toast";
    }
    mountInRoot(node);
    node.textContent = text;
    node.dataset.open = "true";
    clearTimeout(Number(node.dataset.timer || 0));
    node.dataset.timer = String(window.setTimeout(() => { node.dataset.open = "false"; }, ms));
  }

  function setStatus(text) {
    const status = document.getElementById("xiv-status");
    if (status) status.textContent = text;
    toast(text);
  }

  function ensureHelp() {
    let help = document.getElementById("xiv-fl-help");
    if (!help) {
      help = document.createElement("div");
      help.id = "xiv-fl-help";
      help.innerHTML = `
        <div id="xiv-fl-help-card">
          <button id="xiv-fl-help-close" type="button">×</button>
          <h2>瀑光 FlowLens 快捷键</h2>
          <table>
            <tr><td><kbd>G</kbd></td><td>打开 / 关闭图片流</td></tr>
            <tr><td><kbd>Esc</kbd></td><td>关闭大图；再次按关闭图片流</td></tr>
            <tr><td><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd></td><td>筛选：全部 / 图片 / 视频</td></tr>
            <tr><td><kbd>V</kbd></td><td>循环切换全部、图片、视频</td></tr>
            <tr><td><kbd>S</kbd></td><td>开启 / 关闭选择模式</td></tr>
            <tr><td><kbd>Shift</kbd> + <kbd>D</kbd></td><td>下载已选；没有选择时下载当前可见内容</td></tr>
            <tr><td><kbd>E</kbd></td><td>复制已选或可见链接</td></tr>
            <tr><td><kbd>X</kbd></td><td>清空选择</td></tr>
            <tr><td><kbd>A</kbd></td><td>瀑布流自动滚动</td></tr>
            <tr><td><kbd>P</kbd></td><td>大图自动播放下一张</td></tr>
            <tr><td><kbd>←</kbd> / <kbd>→</kbd></td><td>切换上一组 / 下一组</td></tr>
            <tr><td><kbd>+</kbd> <kbd>-</kbd></td><td>调整列数</td></tr>
            <tr><td><kbd>F</kbd></td><td>全屏</td></tr>
            <tr><td><kbd>T</kbd></td><td>切换主题</td></tr>
            <tr><td><kbd>?</kbd></td><td>打开 / 关闭本说明</td></tr>
          </table>
        </div>`;
      help.addEventListener("click", (event) => {
        if (event.target === help || event.target?.id === "xiv-fl-help-close") toggleHelp(false);
      });
    }
    mountInRoot(help);
    return help;
  }

  function toggleHelp(force) {
    const help = ensureHelp();
    const open = force ?? help.dataset.open !== "true";
    help.dataset.open = open ? "true" : "false";
  }

  function syncSelectionUi() {
    const r = root();
    if (r) r.dataset.flSelecting = selectionMode ? "true" : "false";
    for (const tile of tiles()) {
      tile.dataset.flSelected = selectedKeys.has(tileKey(tile)) ? "true" : "false";
    }
    const count = selectedKeys.size;
    if (selectionMode) setStatus(count ? `已选择 ${count} 个` : "选择模式：点击图片加入选择");
  }

  function toggleSelectionMode(force) {
    selectionMode = force ?? !selectionMode;
    syncSelectionUi();
  }

  function clearSelection() {
    selectedKeys.clear();
    syncSelectionUi();
    setStatus("已清空选择");
  }

  function toggleTile(tile) {
    const key = tileKey(tile);
    if (!key) return;
    if (selectedKeys.has(key)) selectedKeys.delete(key);
    else selectedKeys.add(key);
    syncSelectionUi();
  }

  document.addEventListener("click", (event) => {
    if (!active() || !selectionMode || lightboxActive()) return;
    const tile = event.target?.closest?.("#xiv-grid .xiv-tile");
    if (!tile) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    toggleTile(tile);
  }, true);

  function targetTiles() {
    const picked = selectedTiles();
    return picked.length ? picked : visibleTiles();
  }

  async function sendDownload(url, filename) {
    if (!url) return { ok: false, error: "empty url" };
    if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage && isImage(url)) {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "XIV_DOWNLOAD_URL", url, filename, referrer: location.href, direct: true }, (response) => {
          if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
          else resolve(response || { ok: false, error: "no response" });
        });
      });
    }
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename.split("/").pop() || "flowlens-media";
      a.rel = "noopener";
      document.documentElement.appendChild(a);
      a.click();
      a.remove();
      return { ok: true, via: "anchor" };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }

  async function downloadSelectedOrVisible() {
    const list = targetTiles();
    if (!list.length) { setStatus("没有可下载内容"); return; }
    setStatus(`开始下载 ${list.length} 个`);
    let ok = 0;
    let fail = 0;
    for (let i = 0; i < list.length; i += 1) {
      const url = mediaUrl(list[i]);
      const res = await sendDownload(url, filenameFor(url, i));
      if (res?.ok) ok += 1;
      else fail += 1;
      if (i % 6 === 5) await sleep(260);
    }
    setStatus(fail ? `下载完成 ${ok} 个，失败 ${fail} 个` : `下载完成 ${ok} 个`);
  }

  async function copySelectedOrVisibleLinks() {
    const urls = targetTiles().map(mediaUrl).filter(Boolean);
    if (!urls.length) { setStatus("没有可复制链接"); return; }
    const text = [...new Set(urls)].join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      document.documentElement.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setStatus(`已复制 ${urls.length} 条链接`);
  }

  function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

  function stopLightboxAuto() {
    lightboxAutoPlaying = false;
    clearInterval(lightboxAutoTimer);
    lightboxAutoTimer = 0;
    syncLightboxAutoButton();
  }

  function playNextLightbox() {
    const lb = lightbox();
    if (!lb || lb.dataset.active !== "true") {
      stopLightboxAuto();
      return;
    }
    const right = lb.querySelector('.xiv-lightbox-arrow[data-side="right"]');
    if (right) right.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    else document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
  }

  function toggleLightboxAuto() {
    if (lightboxAutoPlaying) {
      stopLightboxAuto();
      setStatus("大图自动播放已暂停");
      return;
    }
    lightboxAutoPlaying = true;
    clearInterval(lightboxAutoTimer);
    lightboxAutoTimer = window.setInterval(playNextLightbox, Math.max(800, Number(settings().lightboxAutoDelay || 1200)));
    syncLightboxAutoButton();
    setStatus("大图自动播放已开启");
  }

  function syncLightboxAutoButton() {
    const button = document.querySelector(".xiv-fl-lightbox-auto");
    if (!button) return;
    button.dataset.playing = lightboxAutoPlaying ? "true" : "false";
    button.title = lightboxAutoPlaying ? "暂停自动播放 (P)" : "自动播放下一张 (P)";
  }

  function ensureLightboxAutoButton() {
    lightbox()?.querySelector(".xiv-fl-lightbox-auto")?.remove();
    if (lightboxAutoPlaying) stopLightboxAuto();
  }

  function isTypingTarget(target) { return target?.matches?.("input, textarea, select, [contenteditable='true'], [contenteditable='']"); }

  document.addEventListener("keydown", (event) => {
    if (isTypingTarget(event.target)) return;
    if (event.key === "?" || (event.shiftKey && event.key === "/")) {
      if (active() || lightboxActive()) {
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); toggleHelp();
      }
      return;
    }
    if (!active() && !lightboxActive()) return;
    if (lightboxActive() && !event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "p") {
      const button = lightbox()?.querySelector(".xiv-lightbox-slideshow");
      if (button) {
        event.preventDefault();
        event.stopPropagation();
        button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      }
    } else if (!event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "s") {
      event.preventDefault(); event.stopPropagation(); toggleSelectionMode();
    } else if (!event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "x") {
      event.preventDefault(); event.stopPropagation(); clearSelection();
    } else if (event.shiftKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "d") {
      event.preventDefault(); event.stopPropagation(); downloadSelectedOrVisible();
    } else if (!event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "e") {
      event.preventDefault(); event.stopPropagation(); copySelectedOrVisibleLinks();
    } else if (event.key === "Escape" && lightboxAutoPlaying) {
      stopLightboxAuto();
    }
  }, true);

  function recordHistory() {
    if (!active()) return;
    const first = visibleTiles()[0];
    const stage = document.getElementById("xiv-stage");
    const history = readJson(HISTORY_KEY, []);
    const item = {
      url: location.href,
      title: document.title || location.href,
      time: Date.now(),
      count: tiles().length,
      filter: localStorage.getItem(FILTER_KEY) || "all",
      scrollTop: stage?.scrollTop || 0,
      firstUrl: mediaUrl(first)
    };
    const next = [item, ...history.filter((old) => old.url !== item.url)].slice(0, 80);
    writeJson(HISTORY_KEY, next);
  }

  function scheduleHistory() {
    clearTimeout(historyTimer);
    historyTimer = window.setTimeout(recordHistory, 500);
  }

  function preloadAroundLightbox() {
    clearTimeout(preloadTimer);
    preloadTimer = window.setTimeout(() => {
      if (!lightboxActive()) return;
      const lb = lightbox();
      const current = lb?.querySelector("img, video")?.currentSrc
        || lb?.querySelector("img, video")?.src
        || lb?.querySelector(".xiv-video-frame")?.dataset.mediaUrl
        || "";
      const list = tiles();
      let index = list.findIndex((tile) => mediaUrl(tile) === current || current.includes(mediaUrl(tile)) || mediaUrl(tile).includes(current));
      if (index < 0) index = Number(list.find((tile) => tile.getBoundingClientRect().top >= 0)?.dataset.index || 0);
      const urls = [];
      for (const offset of [1, 2, 3, -1]) {
        const tile = list[index + offset];
        const url = mediaUrl(tile);
        if (url) urls.push(url);
      }
      let videoCount = 0;
      for (const url of urls.slice(0, 4)) {
        if (isVideo(url)) {
          if (videoCount >= 1) continue;
          videoCount += 1;
          const video = document.createElement("video");
          video.preload = "metadata";
          video.muted = true;
          video.playsInline = true;
          video.referrerPolicy = "no-referrer";
          video.src = url;
          try { video.load(); } catch { /* ignore */ }
          window.setTimeout(() => {
            try {
              video.removeAttribute("src");
              video.load();
            } catch { /* ignore */ }
          }, 30000);
          continue;
        }
        if (!isImage(url)) continue;
        const img = new Image();
        img.decoding = "async";
        img.referrerPolicy = "no-referrer";
        img.src = url;
      }
    }, 120);
  }

  function ensureMediaObserver() {
    if (mediaObserver || !("IntersectionObserver" in window)) return;
    mediaObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const tile = entry.target;
        tile.dataset.flNearViewport = entry.isIntersecting ? "true" : "false";
        if (!entry.isIntersecting) {
          tile.querySelectorAll("video").forEach((video) => {
            try { video.pause(); } catch { /* ignore */ }
          });
        }
      }
    }, { root: document.getElementById("xiv-stage") || null, rootMargin: "900px 0px", threshold: 0.01 });
  }

  function observeTiles() {
    ensureMediaObserver();
    if (!mediaObserver) return;
    for (const tile of tiles()) {
      if (tile.dataset.flObserved === "true") continue;
      tile.dataset.flObserved = "true";
      mediaObserver.observe(tile);
      const media = tile.querySelector("img, video");
      if (media) {
        media.decoding = "async";
        if (media.tagName === "IMG" && !media.loading) media.loading = "lazy";
        if (media.tagName === "VIDEO") media.preload = "metadata";
      }
    }
  }

  function applyAll() {
    injectStyle();
    ensureHelp();
    observeTiles();
    syncSelectionUi();
    ensureLightboxAutoButton();
    scheduleHistory();
    preloadAroundLightbox();
    if (!lightboxActive() && lightboxAutoPlaying) stopLightboxAuto();
  }

  function scheduleApplyAll() {
    clearTimeout(applyTimer);
    applyTimer = window.setTimeout(applyAll, 120);
  }

  let observedRoot = null;
  let rootObserver = null;
  let bootstrapObserver = null;
  function observeViewerRoot() {
    const root = document.getElementById("xiv-root");
    if (!root || root === observedRoot) return;
    rootObserver?.disconnect();
    observedRoot = root;
    rootObserver = new MutationObserver(scheduleApplyAll);
    rootObserver.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-active", "src"] });
    bootstrapObserver?.disconnect();
    bootstrapObserver = null;
    scheduleApplyAll();
  }

  injectStyle();
  bootstrapObserver = new MutationObserver(observeViewerRoot);
  bootstrapObserver.observe(document.documentElement, { childList: true, subtree: true });
  observeViewerRoot();
  window.addEventListener("scroll", scheduleHistory, { passive: true });
  window.addEventListener("resize", scheduleApplyAll, { passive: true });
})();

// FlowLens module: src/patches/fixes.js
(() => {
  if (window.__flowLensStabilityFixes) return;
  window.__flowLensStabilityFixes = true;

  const FILTER_KEY = "flowlens-media-filter-v1";
  const VIDEO_RE = /\.(mp4|webm|mov|m4v)(?:[?#]|$)/i;
  const FILTER_SHORTCUTS = { "1": "all", "2": "image", "3": "video" };
  const FILTER_LABELS = { all: "全部", image: "图片", video: "视频" };
  let applyTimer = 0;
  let recoveryTimer = 0;

  const css = `
    #xiv-stage, #xiv-grid, .xiv-masonry-column {
      contain: layout style paint;
    }
    #xiv-grid .xiv-tile {
      contain: layout paint style;
      content-visibility: auto;
      contain-intrinsic-size: 260px 340px;
    }
    #xiv-grid .xiv-tile[data-fl-duplicate="true"] {
      display: none !important;
    }
    #xiv-grid .xiv-tile img,
    #xiv-grid .xiv-tile video {
      backface-visibility: hidden;
      transform: translateZ(0);
    }
  `;

  function injectStyle() {
    if (document.getElementById("xiv-fl-stability-style")) return;
    const style = document.createElement("style");
    style.id = "xiv-fl-stability-style";
    style.textContent = css;
    document.documentElement.appendChild(style);
  }

  function viewerIsActive() {
    return document.getElementById("xiv-root")?.dataset.active === "true";
  }

  function cleanupPageLockIfClosed() {
    if (viewerIsActive()) return;
    window.__flowLensControl?.restorePageLock?.();
  }

  function schedulePageLockRecovery() {
    clearTimeout(recoveryTimer);
    recoveryTimer = window.setTimeout(cleanupPageLockIfClosed, 80);
  }

  function getStoredFilter() {
    const value = localStorage.getItem(FILTER_KEY) || document.querySelector('#xiv-root [data-xiv="filter"]')?.value || "all";
    return ["all", "image", "video"].includes(value) ? value : "all";
  }

  function mediaTypeOfTile(tile) {
    const url = tile?.dataset?.url || "";
    if (VIDEO_RE.test(url)) return "video";
    if (tile?.querySelector?.("video, .xiv-video-mark")) return "video";
    return "image";
  }

  function zhimgIdentityKey(url) {
    if (!url) return "";
    try {
      const parsed = new URL(url, location.href);
      if (!/(^|\.)zhimg\.com$/i.test(parsed.hostname)) return "";
      const pathname = decodeURIComponent(parsed.pathname || "");
      const match = pathname.match(/\/(?:\d+\/)?(v2-[A-Za-z0-9]+)(?:[_-][^/.]+)?\.(?:webp|jpe?g|png)$/i);
      if (match) return `zhihu:${match[1].toLowerCase()}`;
      return `zhihu:${pathname.replace(/_(?:\d+w|r|b|hd)(?=\.)/i, "").toLowerCase()}`;
    } catch {
      const match = String(url).match(/\/(?:\d+\/)?(v2-[A-Za-z0-9]+)(?:[_-][^/.]+)?\.(?:webp|jpe?g|png)/i);
      return match ? `zhihu:${match[1].toLowerCase()}` : "";
    }
  }

  function mediaIdentityKey(tile) {
    const url = tile?.dataset?.url || "";
    const zhihu = zhimgIdentityKey(url);
    if (zhihu) return zhihu;
    try {
      const parsed = new URL(url, location.href);
      parsed.hash = "";
      return parsed.href;
    } catch {
      return url.replace(/#.*$/, "");
    }
  }

  function tileQualityScore(tile) {
    const url = tile?.dataset?.url || "";
    let score = 0;
    const width = Number(url.match(/_(\d+)w\./i)?.[1] || 0);
    if (width) score += width;
    if (/_r\./i.test(url)) score += 1400;
    if (/_b\./i.test(url)) score += 1200;
    const media = tile?.querySelector?.("img, video");
    const area = (media?.naturalWidth || media?.videoWidth || 0) * (media?.naturalHeight || media?.videoHeight || 0);
    if (area) score += Math.min(area / 1000, 1800);
    score -= Number(tile?.dataset?.index || 0) / 10000;
    return score;
  }

  function dedupeTilesDom(tiles) {
    const bestByKey = new Map();
    for (const tile of tiles) {
      const key = mediaIdentityKey(tile);
      if (!key) continue;
      const current = bestByKey.get(key);
      if (!current || tileQualityScore(tile) > tileQualityScore(current)) bestByKey.set(key, tile);
    }
    let duplicates = 0;
    for (const tile of tiles) {
      const key = mediaIdentityKey(tile);
      const duplicate = !!(key && bestByKey.get(key) && bestByKey.get(key) !== tile);
      tile.dataset.flDuplicate = duplicate ? "true" : "false";
      if (duplicate) duplicates += 1;
    }
    return duplicates;
  }

  function applyFilterDom(value = getStoredFilter()) {
    const root = document.getElementById("xiv-root");
    if (!root || root.dataset.active !== "true") return;
    const tiles = [...document.querySelectorAll("#xiv-grid .xiv-tile")];
    if (!tiles.length) return;
    dedupeTilesDom(tiles);
    const api = window.__flowLensControl;
    if (api?.getMediaFilter?.() !== value) api?.setMediaFilter?.(value);
    else api?.refreshMediaFilter?.();
  }

  function setStoredFilter(value) {
    const next = ["all", "image", "video"].includes(value) ? value : "all";
    try { localStorage.setItem(FILTER_KEY, next); } catch { /* ignore */ }
    const nativeSelect = document.querySelector('#xiv-root [data-xiv="filter"]');
    if (nativeSelect && nativeSelect.value !== next) {
      nativeSelect.value = next;
      nativeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }
    [0, 80, 180].forEach((delay) => window.setTimeout(() => applyFilterDom(next), delay));
    const addonSelect = document.querySelector('[data-fl-setting="mediaFilter"]');
    if (addonSelect) addonSelect.value = next;
  }

  function setStatus(text) {
    const status = document.getElementById("xiv-status");
    if (status) status.textContent = text;
  }

  function cycleFilter() {
    const order = ["all", "image", "video"];
    const current = getStoredFilter();
    const next = order[(order.indexOf(current) + 1) % order.length] || "all";
    setStoredFilter(next);
    setStatus(`筛选：${FILTER_LABELS[next]}（1全部 2图片 3视频）`);
  }

  function isTypingTarget(target) {
    return target?.matches?.("input, textarea, select, [contenteditable='true'], [contenteditable='']");
  }

  document.addEventListener("keydown", (event) => {
    if (isTypingTarget(event.target)) return;
    if (viewerIsActive() && !event.altKey && !event.ctrlKey && !event.metaKey && FILTER_SHORTCUTS[event.key]) {
      event.preventDefault();
      event.stopPropagation();
      const next = FILTER_SHORTCUTS[event.key];
      setStoredFilter(next);
      setStatus(`筛选：${FILTER_LABELS[next]}（1全部 2图片 3视频）`);
    }
    if (viewerIsActive() && !event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "v") {
      event.preventDefault();
      event.stopPropagation();
      cycleFilter();
    }
    if (event.key === "Escape" || event.key.toLowerCase() === "g") schedulePageLockRecovery();
  }, true);

  function applyAll() {
    injectStyle();
    cleanupPageLockIfClosed();
    applyFilterDom(getStoredFilter());
  }

  function scheduleApplyAll() {
    clearTimeout(applyTimer);
    applyTimer = window.setTimeout(applyAll, 160);
  }

  injectStyle();
  applyAll();
  new MutationObserver((mutations) => {
    const important = mutations.some((mutation) => {
      const target = mutation.target;
      if (target?.id === "xiv-root" || target?.id === "xiv-grid") return true;
      return [...mutation.addedNodes].some((node) => node?.nodeType === 1 && (node.id === "xiv-root" || node.id === "xiv-grid" || node.querySelector?.("#xiv-root, #xiv-grid, .xiv-tile")));
    });
    if (important) scheduleApplyAll();
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-active"] });
  window.addEventListener("resize", () => applyFilterDom(getStoredFilter()), { passive: true });
})();

// FlowLens module: src/patches/ui-cleanup.js
(() => {
  if (window.__flowLensUiCleanup) return;
  window.__flowLensUiCleanup = true;

  const css = `
    .xiv-fl-lightbox-auto {
      display: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
      opacity: 0 !important;
    }
  `;

  function injectStyle() {
    if (document.getElementById("xiv-fl-ui-cleanup-style")) return;
    const style = document.createElement("style");
    style.id = "xiv-fl-ui-cleanup-style";
    style.textContent = css;
    document.documentElement.appendChild(style);
  }

  function removeIntrusiveAutoButtons() {
    document.querySelectorAll("#xiv-root .xiv-fl-lightbox-auto").forEach((button) => button.remove());
  }

  let observedRoot = null;
  let rootObserver = null;
  let bootstrapObserver = null;
  function observeViewerRoot() {
    const root = document.getElementById("xiv-root");
    if (!root || root === observedRoot) return;
    rootObserver?.disconnect();
    observedRoot = root;
    rootObserver = new MutationObserver(removeIntrusiveAutoButtons);
    rootObserver.observe(root, { childList: true, subtree: true });
    bootstrapObserver?.disconnect();
    bootstrapObserver = null;
    removeIntrusiveAutoButtons();
  }

  injectStyle();
  bootstrapObserver = new MutationObserver(observeViewerRoot);
  bootstrapObserver.observe(document.documentElement, { childList: true, subtree: true });
  observeViewerRoot();
})();

// FlowLens module: src/patches/lightbox-stable.js
(() => {
  if (window.__flowLensLightboxStable) return;
  window.__flowLensLightboxStable = true;

  const VIDEO_RE = /\.(mp4|webm|mov|m4v)(?:[?#]|$)/i;
  let lastKey = "";
  let skipLockUntil = 0;

  const css = `
    #xiv-lightbox,
    #xiv-lightbox *,
    #xiv-lightbox .xiv-fl-media-anim,
    #xiv-lightbox[data-fl-dir] .xiv-fl-media-anim {
      animation: none !important;
      transition: none !important;
    }
    #xiv-lightbox img,
    #xiv-lightbox video,
    #xiv-lightbox iframe,
    #xiv-lightbox .xiv-video-frame {
      opacity: 1 !important;
      filter: none !important;
      transform: none !important;
    }
  `;

  function injectStyle() {
    if (document.getElementById("xiv-fl-lightbox-stable-style")) return;
    const style = document.createElement("style");
    style.id = "xiv-fl-lightbox-stable-style";
    style.textContent = css;
    document.documentElement.appendChild(style);
  }

  function activeLightbox() {
    const lightbox = document.getElementById("xiv-lightbox");
    return lightbox?.dataset.active === "true" ? lightbox : null;
  }

  function mediaUrlFromLightbox() {
    const lb = activeLightbox();
    if (!lb) return "";
    const media = lb.querySelector("img, video, iframe[data-media-url], .xiv-video-frame[data-media-url]");
    return media?.dataset?.mediaUrl || media?.dataset?.sourceUrl || media?.currentSrc || media?.src || "";
  }

  function mediaKey(url) {
    const text = String(url || "");
    if (!text) return "";
    try {
      const parsed = new URL(text, location.href);
      parsed.hash = "";
      const zhihu = parsed.hostname.includes("zhimg.com") && parsed.pathname.match(/\/(?:\d+\/)?(v2-[A-Za-z0-9]+)(?:[_-][^/.]+)?\./i)?.[1];
      if (zhihu) return `zhihu:${zhihu.toLowerCase()}`;
      if (VIDEO_RE.test(parsed.pathname)) return `video:${parsed.href}`;
      parsed.search = parsed.search.replace(/([?&])(source|utm_[^=&]+|from|fd|fmt|width|height|quality|token)=[^&]*/gi, "");
      return parsed.href.replace(/_(?:\d+w|r|b|hd)(?=\.)/i, "");
    } catch {
      const zhihu = text.match(/\/(?:\d+\/)?(v2-[A-Za-z0-9]+)(?:[_-][^/.]+)?\./i)?.[1];
      return zhihu ? `zhihu:${zhihu.toLowerCase()}` : text.replace(/[?#].*$/, "");
    }
  }

  function clickArrow(direction) {
    const lb = activeLightbox();
    if (!lb) return false;
    const selector = direction > 0 ? '.xiv-lightbox-arrow[data-side="right"]' : '.xiv-lightbox-arrow[data-side="left"]';
    const arrow = lb.querySelector(selector);
    if (!arrow) return false;
    arrow.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    return true;
  }

  function currentKey() {
    return mediaKey(mediaUrlFromLightbox());
  }

  function skipDuplicate(direction) {
    if (Date.now() < skipLockUntil) return;
    const key = currentKey();
    if (!key || !lastKey || key !== lastKey) {
      lastKey = key;
      return;
    }
    skipLockUntil = Date.now() + 500;
    let hops = 0;
    const hop = () => {
      if (!activeLightbox() || hops >= 4) return;
      hops += 1;
      clickArrow(direction);
      window.setTimeout(() => {
        const nextKey = currentKey();
        if (nextKey && nextKey !== lastKey) {
          lastKey = nextKey;
          return;
        }
        hop();
      }, 90);
    };
    hop();
  }

  function rememberDirection(direction) {
    window.__flowLensLastLightboxDirection = direction;
    lastKey = currentKey() || lastKey;
    window.setTimeout(() => skipDuplicate(direction), 120);
  }

  document.addEventListener("keydown", (event) => {
    if (!activeLightbox()) return;
    if (event.key === "ArrowRight") rememberDirection(1);
    else if (event.key === "ArrowLeft") rememberDirection(-1);
  }, true);

  document.addEventListener("click", (event) => {
    const arrow = event.target?.closest?.(".xiv-lightbox-arrow");
    if (!arrow || !activeLightbox()) return;
    rememberDirection(arrow.dataset.side === "left" ? -1 : 1);
  }, true);

  document.addEventListener("wheel", (event) => {
    if (!activeLightbox()) return;
    const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (Math.abs(delta) > 4) rememberDirection(delta > 0 ? 1 : -1);
  }, true);

  new MutationObserver(() => {
    injectStyle();
    const lb = activeLightbox();
    if (!lb) {
      lastKey = "";
      return;
    }
    const key = currentKey();
    if (key && !lastKey) lastKey = key;
    lb.querySelectorAll(".xiv-fl-media-anim").forEach((node) => node.classList.remove("xiv-fl-media-anim"));
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "class", "data-active"] });

  injectStyle();
})();

// FlowLens module: src/patches/settings-compact.js
(() => {
  if (window.__flowLensSettingsCompactV3) return;
  window.__flowLensSettingsCompactV3 = true;

  const STYLE_ID = "xiv-fl-settings-modules-v3-style";
  let timer = 0;

  const icons = {
    display: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8M12 18v3"/></svg>',
    cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.4-1.8A4.8 4.8 0 0 0 7 18Z"/><path d="m9 14 3 3 3-3M12 10v7"/></svg>',
    bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18l-6-4-6 4Z"/></svg>',
    advanced: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>'
  };

  const css = `
    #xiv-root [data-panel="settings"] {
      --fl-ink: #17191f;
      --fl-muted: #737986;
      --fl-line: rgba(29,35,48,.12);
      --fl-surface: rgba(255,255,255,.82);
      --fl-soft: #f1f3f7;
      --fl-accent: #315bd8;
      width: min(500px, calc(100vw - 24px)) !important;
      max-width: min(500px, calc(100vw - 24px)) !important;
      max-height: min(84vh, 780px) !important;
      box-sizing: border-box !important;
      padding: 18px !important;
      overflow: auto !important;
      border: 1px solid rgba(255,255,255,.7) !important;
      border-radius: 22px !important;
      background: rgba(247,248,250,.96) !important;
      color: var(--fl-ink) !important;
      box-shadow: 0 24px 80px rgba(24,29,40,.28) !important;
      backdrop-filter: blur(22px) saturate(1.1) !important;
      scrollbar-width: thin !important;
      font-family: "MiSans", "HarmonyOS Sans SC", "Microsoft YaHei UI", sans-serif !important;
    }
    #xiv-root[data-theme="dark"] [data-panel="settings"] {
      --fl-ink: #f3f4f6;
      --fl-muted: #9da3af;
      --fl-line: rgba(255,255,255,.11);
      --fl-surface: rgba(30,33,40,.84);
      --fl-soft: #252832;
      background: rgba(20,22,27,.96) !important;
      border-color: rgba(255,255,255,.1) !important;
    }
    #xiv-root [data-panel="settings"] > h3 {
      margin: 0 !important;
      color: var(--fl-ink) !important;
      font-size: 24px !important;
      font-weight: 900 !important;
      line-height: 1.1 !important;
      letter-spacing: -.04em !important;
    }
    #xiv-root [data-panel="settings"] > .fl-version-row {
      min-height: 28px !important;
      margin: 4px 0 14px !important;
      padding: 0 !important;
      border: 0 !important;
      color: var(--fl-muted) !important;
      font-size: 11px !important;
      font-weight: 750 !important;
    }
    #xiv-root [data-panel="settings"] > .fl-version-row strong {
      min-width: 0 !important;
      padding: 5px 9px !important;
      border-radius: 999px !important;
      background: rgba(49,91,216,.1) !important;
      color: var(--fl-accent) !important;
      font-size: 12px !important;
      font-weight: 900 !important;
    }
    #xiv-root .xiv-settings-group {
      margin: 0 0 10px !important;
      overflow: clip !important;
      border: 1px solid var(--fl-line) !important;
      border-radius: 15px !important;
      background: var(--fl-surface) !important;
    }
    #xiv-root .xiv-settings-group > summary {
      min-height: 62px !important;
      box-sizing: border-box !important;
      display: grid !important;
      grid-template-columns: 34px minmax(0,1fr) 18px !important;
      align-items: center !important;
      gap: 10px !important;
      padding: 10px 13px !important;
      color: var(--fl-ink) !important;
      cursor: pointer !important;
      list-style: none !important;
      user-select: none !important;
    }
    #xiv-root .xiv-settings-group > summary::-webkit-details-marker { display: none !important; }
    #xiv-root .xiv-settings-group > summary:hover { background: rgba(49,91,216,.045) !important; }
    #xiv-root .xiv-settings-group-icon {
      width: 34px !important;
      height: 34px !important;
      display: grid !important;
      place-items: center !important;
      border-radius: 10px !important;
      background: var(--fl-soft) !important;
      color: var(--fl-accent) !important;
    }
    #xiv-root .xiv-settings-group-icon svg { width: 18px !important; height: 18px !important; }
    #xiv-root .xiv-settings-group-copy { min-width: 0 !important; }
    #xiv-root .xiv-settings-group-copy b,
    #xiv-root .xiv-settings-group-copy small { display: block !important; }
    #xiv-root .xiv-settings-group-copy b { font-size: 14px !important; font-weight: 900 !important; line-height: 1.2 !important; }
    #xiv-root .xiv-settings-group-copy small { margin-top: 3px !important; color: var(--fl-muted) !important; font-size: 10px !important; font-weight: 650 !important; line-height: 1.25 !important; }
    #xiv-root .xiv-settings-group-chevron {
      width: 8px !important;
      height: 8px !important;
      justify-self: center !important;
      border-right: 2px solid currentColor !important;
      border-bottom: 2px solid currentColor !important;
      opacity: .48 !important;
      transform: rotate(45deg) translate(-2px,-2px) !important;
      transition: transform .18s ease !important;
    }
    #xiv-root .xiv-settings-group[open] > summary .xiv-settings-group-chevron { transform: rotate(225deg) translate(-2px,-2px) !important; }
    #xiv-root .xiv-settings-group-body { padding: 0 13px 12px !important; border-top: 1px solid var(--fl-line) !important; }
    #xiv-root .xiv-settings-group .xiv-setting-row {
      min-height: 50px !important;
      box-sizing: border-box !important;
      margin: 0 !important;
      padding: 8px 1px !important;
      border: 0 !important;
      border-bottom: 1px solid var(--fl-line) !important;
      color: var(--fl-ink) !important;
      font-size: 13px !important;
      font-weight: 800 !important;
      line-height: 1.25 !important;
    }
    #xiv-root .xiv-settings-group .xiv-setting-row:last-child { border-bottom: 0 !important; }
    #xiv-root .xiv-settings-group .xiv-setting-row > span:first-child { color: var(--fl-ink) !important; font-size: 13px !important; font-weight: 800 !important; }
    #xiv-root .xiv-settings-group .xiv-setting-row input[type="checkbox"] {
      appearance: none !important;
      width: 40px !important;
      height: 23px !important;
      flex: 0 0 auto !important;
      margin: 0 !important;
      border: 1px solid rgba(127,127,127,.3) !important;
      border-radius: 999px !important;
      background: radial-gradient(circle at 11px 50%, #fff 0 7px, transparent 7.5px), rgba(127,127,127,.3) !important;
      cursor: pointer !important;
    }
    #xiv-root .xiv-settings-group .xiv-setting-row input[type="checkbox"]:checked {
      border-color: var(--fl-accent) !important;
      background: radial-gradient(circle at 28px 50%, #fff 0 7px, transparent 7.5px), var(--fl-accent) !important;
    }
    #xiv-root .xiv-settings-group .xiv-setting-row select {
      min-width: 146px !important;
      height: 36px !important;
      padding: 0 34px 0 13px !important;
      border: 1px solid var(--fl-line) !important;
      border-radius: 10px !important;
      background-color: var(--fl-soft) !important;
      color: var(--fl-ink) !important;
      font: 850 12px/1 "MiSans", "Microsoft YaHei UI", sans-serif !important;
    }
    #xiv-root .xiv-settings-group .xiv-setting-row button {
      width: 34px !important;
      height: 34px !important;
      min-width: 34px !important;
      border-radius: 10px !important;
      font-size: 18px !important;
    }
    #xiv-root .xiv-settings-group .xiv-setting-row strong,
    #xiv-root .xiv-settings-group .xiv-setting-row b { min-width: 48px !important; font-size: 14px !important; text-align: center !important; }
    #xiv-root .xiv-settings-group[data-settings-group="cloud"] .xiv-settings-group-body { padding: 12px !important; }
    #xiv-root .xiv-settings-group .xiv-cd2-settings {
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      border-radius: 0 !important;
      background: transparent !important;
    }
    #xiv-root .xiv-settings-group .xiv-cd2-settings-head { display: none !important; }
    #xiv-root .xiv-settings-group .xiv-cd2-play-modes { margin: 0 0 12px !important; gap: 8px !important; }
    #xiv-root .xiv-settings-group .xiv-cd2-play-mode-card {
      min-height: 64px !important;
      border-color: var(--fl-line) !important;
      border-radius: 12px !important;
      background: var(--fl-soft) !important;
    }
    #xiv-root .xiv-settings-group .xiv-cd2-play-mode input:checked + .xiv-cd2-play-mode-card {
      border-color: var(--fl-accent) !important;
      background: rgba(49,91,216,.08) !important;
      box-shadow: inset 0 0 0 1px var(--fl-accent) !important;
    }
    #xiv-root .xiv-settings-group .xiv-cd2-field { color: var(--fl-muted) !important; font-size: 10px !important; font-weight: 750 !important; }
    #xiv-root .xiv-settings-group .xiv-cd2-field input {
      height: 39px !important;
      border-color: var(--fl-line) !important;
      border-radius: 10px !important;
      background: var(--fl-soft) !important;
      color: var(--fl-ink) !important;
      font-size: 11px !important;
    }
    #xiv-root .xiv-settings-group .xiv-cd2-field small { margin: 2px 0 0 !important; color: var(--fl-muted) !important; font-size: 9px !important; }
    #xiv-root .xiv-settings-group .xiv-cd2-controls button {
      min-height: 34px !important;
      border-radius: 10px !important;
      background: var(--fl-soft) !important;
      color: var(--fl-ink) !important;
      font-size: 11px !important;
    }
    #xiv-root .xiv-settings-group .xiv-cd2-controls [data-cd2-action="save"] { background: var(--fl-accent) !important; color: #fff !important; }
    #xiv-root .xiv-settings-group .fl-page-bookmark-settings {
      margin: 0 !important;
      padding: 12px 0 0 !important;
      border: 0 !important;
      border-radius: 0 !important;
      background: transparent !important;
    }
    #xiv-root .xiv-settings-group .fl-page-bookmark-settings-title { display: none !important; }
    #xiv-root .xiv-settings-group .fl-page-bookmark-settings-btn { min-height: 46px !important; border-radius: 11px !important; background: var(--fl-soft) !important; color: var(--fl-ink) !important; }
    #xiv-root .xiv-settings-group[data-settings-group="advanced"] .xiv-settings-group-body > details {
      margin: 10px 0 0 !important;
      border: 1px solid var(--fl-line) !important;
      border-radius: 11px !important;
      background: var(--fl-soft) !important;
      overflow: hidden !important;
    }
    #xiv-root .xiv-settings-group[data-settings-group="advanced"] .xiv-settings-group-body > details > summary {
      padding: 11px 12px !important;
      color: var(--fl-ink) !important;
      font-size: 12px !important;
      font-weight: 850 !important;
      cursor: pointer !important;
    }
    #xiv-root .xiv-fl-shortcuts-mini { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 8px !important; padding: 0 11px 11px !important; color: var(--fl-muted) !important; font-size: 11px !important; }
    #xiv-root .xiv-fl-shortcuts-mini kbd { display: inline-grid !important; min-width: 28px !important; margin-right: 6px !important; padding: 3px 5px !important; place-items: center !important; border-radius: 6px !important; background: rgba(127,127,127,.14) !important; color: var(--fl-ink) !important; font-size: 10px !important; font-weight: 950 !important; }
    #xiv-root .xiv-fl-compact-section { display: none !important; }
    @media (max-width: 560px) {
      #xiv-root [data-panel="settings"] {
        position: fixed !important;
        top: max(58px, calc(env(safe-area-inset-top, 0px) + 50px)) !important;
        right: max(8px, env(safe-area-inset-right, 0px)) !important;
        left: auto !important;
        bottom: auto !important;
        width: min(380px, calc(100vw - 16px)) !important;
        max-width: calc(100vw - 16px) !important;
        max-height: min(78vh, calc(100vh - 74px - env(safe-area-inset-bottom, 0px))) !important;
        padding: 14px !important;
      }
      #xiv-root .xiv-cd2-play-modes { grid-template-columns: 1fr !important; }
      #xiv-root .xiv-fl-shortcuts-mini { grid-template-columns: 1fr !important; }
    }
  `;

  function injectStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = css;
      document.documentElement.appendChild(style);
    } else if (style !== document.documentElement.lastElementChild) {
      document.documentElement.appendChild(style);
    }
  }

  function findPanel() {
    return document.querySelector('#xiv-root [data-panel="settings"]');
  }

  function makeGroup(key, title, description, open = false) {
    const group = document.createElement("details");
    group.className = "xiv-settings-group";
    group.dataset.settingsGroup = key;
    group.open = open;
    group.innerHTML = `
      <summary>
        <span class="xiv-settings-group-icon">${icons[key]}</span>
        <span class="xiv-settings-group-copy"><b>${title}</b><small>${description}</small></span>
        <i class="xiv-settings-group-chevron" aria-hidden="true"></i>
      </summary>
      <div class="xiv-settings-group-body"></div>`;
    return group;
  }

  function ensureGroup(panel, key, title, description, open = false) {
    let group = panel.querySelector(`:scope > .xiv-settings-group[data-settings-group="${key}"]`);
    if (!group) {
      group = makeGroup(key, title, description, open);
      panel.appendChild(group);
    }
    return group;
  }

  function makeShortcuts() {
    const node = document.createElement("details");
    node.className = "xiv-fl-shortcuts-wrap";
    node.innerHTML = `
      <summary>快捷键</summary>
      <div class="xiv-fl-shortcuts-mini">
        <span><kbd>G</kbd>开关图片流</span><span><kbd>Esc</kbd>退出/关闭</span>
        <span><kbd>1/2/3</kbd>全部/图/视频</span><span><kbd>V</kbd>循环筛选</span>
        <span><kbd>A</kbd>自动滚动</span><span><kbd>P</kbd>大图自动切换</span>
        <span><kbd>M</kbd>抓取磁力/ED2K</span><span><kbd>←/→</kbd>上一组/下一组</span>
        <span><kbd>S</kbd>选择模式</span><span><kbd>Shift+D</kbd>下载已选</span>
      </div>`;
    return node;
  }

  function apply() {
    injectStyle();
    const panel = findPanel();
    if (!panel) return;
    panel.querySelectorAll(":scope > .xiv-fl-compact-section").forEach((node) => node.remove());
    panel.querySelectorAll(".xiv-fl-speed-row").forEach((node) => node.remove());

    const display = ensureGroup(panel, "display", "显示与浏览", "入口、布局、筛选和大图播放", true);
    const cloud = ensureGroup(panel, "cloud", "磁力与播放", "CloudDrive2、115 转存和播放方式");
    const bookmark = ensureGroup(panel, "bookmark", "页面收藏", "收藏当前页面和查看收藏列表");
    const advanced = ensureGroup(panel, "advanced", "高级设置", "广告过滤、快捷键和低频选项");
    const displayBody = display.querySelector(".xiv-settings-group-body");
    const cloudBody = cloud.querySelector(".xiv-settings-group-body");
    const bookmarkBody = bookmark.querySelector(".xiv-settings-group-body");
    const advancedBody = advanced.querySelector(".xiv-settings-group-body");

    panel.querySelectorAll(":scope > .xiv-setting-row").forEach((row) => displayBody.appendChild(row));
    panel.querySelectorAll(":scope > .xiv-cd2-settings").forEach((section) => cloudBody.appendChild(section));
    panel.querySelectorAll(":scope > .fl-page-bookmark-settings").forEach((section) => bookmarkBody.appendChild(section));

    if (!advancedBody.querySelector(".xiv-fl-shortcuts-wrap")) advancedBody.appendChild(makeShortcuts());
    [...panel.children].forEach((node) => {
      if (node.matches("h3, .fl-version-row, .xiv-settings-group, style")) return;
      if (node.matches("small") || node.matches("details")) advancedBody.appendChild(node);
    });

    const desiredGroups = [display, cloud, bookmark, advanced];
    const currentGroups = [...panel.querySelectorAll(":scope > .xiv-settings-group")];
    if (desiredGroups.some((group, index) => currentGroups[index] !== group)) {
      desiredGroups.forEach((group) => panel.appendChild(group));
    }
    const cloudHidden = !cloudBody.querySelector(".xiv-cd2-settings");
    const bookmarkHidden = !bookmarkBody.querySelector(".fl-page-bookmark-settings");
    if (cloud.hidden !== cloudHidden) cloud.hidden = cloudHidden;
    if (bookmark.hidden !== bookmarkHidden) bookmark.hidden = bookmarkHidden;
  }

  function schedule() {
    clearTimeout(timer);
    timer = window.setTimeout(apply, 90);
  }

  injectStyle();
  schedule();
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-open", "data-active"]
  });
})();

// FlowLens module: src/patches/zhihu.js
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
  window.addEventListener("keydown", () => setTimeout(maybeStartAnswerAutoload, 200), true);
  window.addEventListener("click", () => setTimeout(maybeStartAnswerAutoload, 200), true);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") maybeStartAnswerAutoload();
  });
  new MutationObserver(scheduleSync).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src", "srcset", "data-src", "data-srcset", "data-original", "data-actualsrc"]
  });
})();

// FlowLens module: src/patches/topfix.js
(() => {
  if (window.__flowLensTopFix) return;
  window.__flowLensTopFix = true;

  const OVERBLEED = 3;
  const css = `
    html.xiv-active,
    html.xiv-active body {
      background: #050505 !important;
    }
    #xiv-root[data-active="true"] {
      top: -${OVERBLEED}px !important;
      right: -${OVERBLEED}px !important;
      bottom: -${OVERBLEED}px !important;
      left: -${OVERBLEED}px !important;
      width: calc(100vw + ${OVERBLEED * 2}px) !important;
      height: calc(100dvh + ${OVERBLEED * 2}px) !important;
      max-height: none !important;
      border: 0 !important;
      outline: 0 !important;
      box-shadow: none !important;
    }
    #xiv-root[data-active="true"][data-theme="dark"] {
      background: #050505 !important;
    }
    #xiv-root[data-active="true"][data-theme="dark"] #xiv-stage {
      background: #050505 !important;
    }
    #xiv-root[data-active="true"][data-theme="dark"] .xiv-stage-safe-cover {
      background: #050505 !important;
    }
    #xiv-root[data-active="true"] #xiv-stage {
      padding-top: max(13px, calc(env(safe-area-inset-top, 0px) + 13px)) !important;
      padding-left: calc(max(6px, env(safe-area-inset-left, 0px)) + ${OVERBLEED}px) !important;
      padding-right: calc(max(6px, env(safe-area-inset-right, 0px)) + ${OVERBLEED}px) !important;
    }
    #xiv-root[data-active="true"] #xiv-grid {
      margin-top: 0 !important;
      padding-top: 0 !important;
      border-top: 0 !important;
      box-shadow: none !important;
    }
    #xiv-root[data-active="true"] #xiv-topbar {
      top: 0 !important;
      padding-top: calc(13px + env(safe-area-inset-top, 0px)) !important;
      padding-left: calc(max(8px, env(safe-area-inset-left, 0px)) + ${OVERBLEED}px) !important;
      padding-right: calc(max(8px, env(safe-area-inset-right, 0px)) + ${OVERBLEED}px) !important;
      background: transparent !important;
      pointer-events: none !important;
      box-shadow: none !important;
      border: 0 !important;
    }
    #xiv-root[data-active="true"] #xiv-topbar .xiv-pill,
    #xiv-root[data-active="true"] #xiv-topbar .xiv-actions,
    #xiv-root[data-active="true"] #xiv-topbar .xiv-btn,
    #xiv-root[data-active="true"] #xiv-topbar .xiv-select {
      pointer-events: auto !important;
    }
    #xiv-root[data-active="true"]::before,
    #xiv-root[data-active="true"]::after,
    #xiv-root[data-active="true"] #xiv-topbar::before,
    #xiv-root[data-active="true"] #xiv-topbar::after {
      content: none !important;
      display: none !important;
      height: 0 !important;
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
    }
    @media (max-width: 820px) {
      #xiv-root[data-active="true"] #xiv-topbar {
        display: flex !important;
        align-items: flex-start !important;
        justify-content: space-between !important;
        gap: 6px !important;
        min-height: calc(54px + env(safe-area-inset-top, 0px)) !important;
        z-index: 2147483647 !important;
      }
      #xiv-root[data-active="true"] #xiv-topbar .xiv-pill {
        display: inline-flex !important;
        visibility: visible !important;
        opacity: 1 !important;
        flex: 0 1 auto !important;
        min-width: 0 !important;
        max-width: calc(100vw - 178px) !important;
        min-height: 28px !important;
        padding: 0 !important;
        overflow: hidden !important;
        white-space: nowrap !important;
        background: transparent !important;
        color: #fff !important;
        border: 0 !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
        text-shadow: 0 1px 2px rgba(0,0,0,.72), 0 0 10px rgba(0,0,0,.46) !important;
      }
      #xiv-root[data-active="true"][data-theme="light"] #xiv-topbar .xiv-pill {
        background: transparent !important;
        color: #fff !important;
        border-color: transparent !important;
      }
      #xiv-root[data-active="true"] #xiv-counter,
      #xiv-root[data-active="true"] #xiv-status {
        display: inline !important;
        visibility: visible !important;
      }
      #xiv-root[data-active="true"] #xiv-status {
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }
      #xiv-root[data-active="true"] #xiv-topbar .xiv-actions {
        flex: 0 0 auto !important;
      }
    }
  `;

  function inject() {
    let style = document.getElementById("xiv-fl-topfix-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "xiv-fl-topfix-style";
      document.documentElement.appendChild(style);
    }
    if (style.textContent !== css) style.textContent = css;
  }

  inject();
  new MutationObserver(inject).observe(document.documentElement, { childList: true, subtree: true });
})();

// FlowLens module: src/patches/media-sync.js
(() => {
  if (window.__flowLensMediaSyncPatch) return;
  window.__flowLensMediaSyncPatch = true;

  const VERSION = window.__FLOWLENS_VERSION__ || "dev";
  const FILTER_ORDER = ["all", "image", "video"];
  const FILTER_TEXT = { all: "全部", image: "图片", video: "视频" };
  const FILTER_KEY = "flowlens-media-filter-v1";
  const LEGACY_FILTER_KEY = "flowlens-media-filter-v2";
  const SPEED_KEY = "flowlens-lightbox-slideshow-delay-v1";
  const SETTINGS_KEY = "flowlens-settings-v2";
  const SPEED_OPTIONS = [800, 1200, 1800, 2400, 3200];
  const DEFAULT_DELAY = 1200;

  let currentMode = localStorage.getItem(FILTER_KEY) || localStorage.getItem(LEGACY_FILTER_KEY) || "all";
  if (!FILTER_ORDER.includes(currentMode)) currentMode = "all";
  function readSettings() {
    const extensionSettings = window.__flowLensSettingsStore?.read?.();
    if (extensionSettings) return extensionSettings;
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {}; } catch { return {}; }
  }

  function writeSettings(patch) {
    if (window.__flowLensSettingsStore?.write) return window.__flowLensSettingsStore.write(patch);
    const next = { ...readSettings(), ...patch };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch {}
    try { (chrome?.storage?.sync || chrome?.storage?.local)?.set?.({ [SETTINGS_KEY]: next }); } catch {}
    try { window.__flowLensSyncGlobalSettings?.(); } catch {}
    return next;
  }

  function readSlideshowDelay() {
    const settings = readSettings();
    const stored = Number(settings.lightboxAutoDelay || 0);
    if (SPEED_OPTIONS.includes(stored)) return stored;
    try {
      const legacy = Number(localStorage.getItem(SPEED_KEY) || 0);
      if (SPEED_OPTIONS.includes(legacy)) return legacy;
    } catch {}
    return DEFAULT_DELAY;
  }

  function writeSlideshowDelay(value) {
    writeSettings({ lightboxAutoDelay: value });
    try { localStorage.setItem(SPEED_KEY, String(value)); } catch {}
  }

  let slideshowDelay = readSlideshowDelay();
  if (!SPEED_OPTIONS.includes(slideshowDelay)) slideshowDelay = DEFAULT_DELAY;
  let slideshowTimer = 0;
  let slideshowActive = false;
  let lightboxObserver = null;
  let lightboxObserverTarget = null;
  let refreshTimer = 0;
  let bootTimer = 0;

  function root() { return document.getElementById("xiv-root"); }
  function lightbox() { return root()?.querySelector("#xiv-lightbox"); }
  function filterSelect() { return root()?.querySelector('#xiv-topbar .xiv-select[data-xiv="filter"]'); }
  function isLightboxOpen() { return lightbox()?.dataset.active === "true"; }
  function coreApi() { return window.__flowLensControl || null; }
  function nativeSlideshowOwnsButton() { return !!window.__flowLensSlideshowNativePatch; }

  function liveFilter() {
    const apiValue = coreApi()?.getMediaFilter?.();
    if (FILTER_ORDER.includes(apiValue)) return apiValue;
    const selectValue = filterSelect()?.value;
    if (FILTER_ORDER.includes(selectValue)) return selectValue;
    const stored = localStorage.getItem(FILTER_KEY) || localStorage.getItem(LEGACY_FILTER_KEY);
    return FILTER_ORDER.includes(stored) ? stored : "all";
  }

  function ensureStyle() {
    if (document.getElementById("xiv-media-sync-style")) return;
    const style = document.createElement("style");
    style.id = "xiv-media-sync-style";
    style.textContent = `
      #xiv-root .xiv-media-switch { display: none !important; }
      #xiv-root .fl-top-filter-btn { display: inline-grid !important; place-items: center !important; align-items: center !important; justify-content: center !important; padding: 0 !important; font-size: 0 !important; letter-spacing: 0 !important; }
      #xiv-root .fl-top-filter-btn svg { width: 23px; height: 23px; display: block; pointer-events: none; margin: 0 auto; }
      #xiv-root .fl-version-row { display: flex; align-items: center; justify-content: space-between; min-height: 28px; padding: 0 0 8px; margin: -2px 0 2px; border-bottom: 1px solid rgba(0,0,0,.08); color: rgba(0,0,0,.52); font: 700 12px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      #xiv-root[data-theme="dark"] .fl-version-row, #xiv-root:not([data-theme="light"]) .fl-version-row { border-bottom-color: rgba(255,255,255,.12); color: rgba(255,255,255,.66); }
      #xiv-root .fl-version-row strong { padding: 4px 8px; border-radius: 999px; background: rgba(79,114,255,.1); color: #4668df; font-weight: 850; }
      #xiv-root[data-theme="dark"] .fl-version-row strong, #xiv-root:not([data-theme="light"]) .fl-version-row strong { background: rgba(117,145,255,.16); color: #aebdff; }
      #xiv-root .fl-slideshow-speed { min-width: 120px; }
      #xiv-root .xiv-lightbox-slideshow { position: fixed; right: 118px; top: 18px; z-index: 2147483647; width: 42px; height: 42px; border-radius: 999px; border: 1px solid rgba(255,255,255,.26); background: radial-gradient(circle at 32% 24%, rgba(255,255,255,.22), rgba(18,18,20,.72)); color: #fff; display: none; place-items: center; pointer-events: auto; cursor: pointer; padding: 0; box-shadow: 0 12px 30px rgba(0,0,0,.36), inset 0 1px 0 rgba(255,255,255,.18); backdrop-filter: blur(12px); }
      #xiv-root[data-fl-lightbox="true"] .xiv-lightbox-slideshow { display: grid; }
      #xiv-root .xiv-lightbox-slideshow[data-active="true"] { color: #111; background: radial-gradient(circle at 32% 24%, rgba(255,255,255,.95), rgba(255,255,255,.76)); border-color: rgba(255,255,255,.7); }
      #xiv-root .xiv-lightbox-slideshow svg { width: 20px; height: 20px; display: block; }
      @media (max-width: 820px) {
        #xiv-root .xiv-panel[data-panel="settings"] { position: fixed !important; top: max(54px, calc(env(safe-area-inset-top, 0px) + 48px)) !important; right: max(8px, env(safe-area-inset-right, 0px)) !important; left: auto !important; bottom: auto !important; width: min(420px, calc(100vw - 16px)) !important; max-width: calc(100vw - 16px) !important; height: auto !important; max-height: min(76vh, calc(100vh - 74px - env(safe-area-inset-bottom, 0px))) !important; padding: 12px !important; border-radius: 18px !important; overflow-y: auto !important; overscroll-behavior: contain !important; }
        #xiv-root .xiv-panel[data-panel="settings"] h3 { font-size: 20px !important; margin: 0 0 6px !important; line-height: 1.2 !important; }
        #xiv-root .xiv-panel[data-panel="settings"] .xiv-setting-row { min-height: 38px !important; padding: 7px 2px !important; gap: 10px !important; font-size: 13px !important; line-height: 1.25 !important; }
        #xiv-root .xiv-panel[data-panel="settings"] .xiv-setting-row > span { font-size: 13px !important; font-weight: 750 !important; }
        #xiv-root .xiv-panel[data-panel="settings"] .xiv-setting-row input[type="checkbox"] { width: 38px !important; height: 22px !important; }
        #xiv-root .xiv-panel[data-panel="settings"] .xiv-select { min-height: 36px !important; padding: 0 32px 0 12px !important; border-radius: 18px !important; font-size: 13px !important; font-weight: 800 !important; }
        #xiv-root .xiv-panel[data-panel="settings"] .xiv-setting-row button { width: 36px !important; height: 36px !important; min-width: 36px !important; }
        #xiv-root .xiv-panel[data-panel="settings"] small { display: block !important; margin-top: 6px !important; font-size: 11px !important; line-height: 1.35 !important; opacity: .66 !important; }
        #xiv-root .fl-version-row { min-height: 24px !important; padding-bottom: 7px !important; margin-bottom: 2px !important; font-size: 11px !important; }
        #xiv-root .xiv-lightbox-slideshow { right: 118px; top: 18px; width: 42px; height: 42px; }
      }
    `;
    document.documentElement.appendChild(style);
  }

  function filterIcon(mode) {
    if (mode === "image") return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="m4 15 4.2-4.2a2 2 0 0 1 2.8 0L16 16"/><path d="m14 14 1.2-1.2a2 2 0 0 1 2.8 0L20 15"/><circle cx="15.5" cy="9.5" r="1.2"/></svg>';
    if (mode === "video") return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="6" width="12" height="12" rx="2"/><path d="m16 10 4-2.5v9L16 14"/></svg>';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1.4"/><rect x="14" y="4" width="6" height="6" rx="1.4"/><rect x="4" y="14" width="6" height="6" rx="1.4"/><rect x="14" y="14" width="6" height="6" rx="1.4"/></svg>';
  }

  function setFilter(mode) {
    if (!FILTER_ORDER.includes(mode)) mode = "all";
    currentMode = mode;
    try {
      localStorage.setItem(FILTER_KEY, mode);
      localStorage.setItem(LEGACY_FILTER_KEY, mode);
    } catch {}
    coreApi()?.setMediaFilter?.(mode);
    const select = filterSelect();
    if (select) {
      select.value = mode;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    document.querySelectorAll('[data-fl-setting="mediaFilter"]').forEach((node) => {
      node.value = mode;
    });
    [0, 80, 180].forEach((delay) => setTimeout(() => {
      coreApi()?.setMediaFilter?.(mode);
    }, delay));
    updateTopFilterButton();
  }

  function cycleFilter() {
    currentMode = liveFilter();
    const next = FILTER_ORDER[(FILTER_ORDER.indexOf(currentMode) + 1 + FILTER_ORDER.length) % FILTER_ORDER.length];
    setFilter(next);
  }

  function ensureTopFilterButton() {
    const button = root()?.querySelector('[data-xiv="top"]');
    if (!button) return;
    button.classList.add("fl-top-filter-btn");
    if (button.dataset.flFilterBound !== "true") {
      button.dataset.flFilterBound = "true";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        cycleFilter();
      }, true);
    }
    updateTopFilterButton();
  }

  function updateTopFilterButton() {
    const button = root()?.querySelector('[data-xiv="top"]');
    if (!button) return;
    currentMode = liveFilter();
    button.title = `切换图/视频：当前${FILTER_TEXT[currentMode]}`;
    button.setAttribute("aria-label", button.title);
    if (button.dataset.flIconMode !== currentMode) { button.dataset.flIconMode = currentMode; button.innerHTML = filterIcon(currentMode); }
  }

  function speedLabel(ms) {
    if (ms <= 800) return "极速 0.8秒";
    if (ms <= 1200) return "默认 1.2秒";
    if (ms <= 1800) return "较快 1.8秒";
    if (ms <= 2400) return "普通 2.4秒";
    return "慢速 3.2秒";
  }

  function setSlideshowDelay(ms) {
    const next = SPEED_OPTIONS.includes(Number(ms)) ? Number(ms) : DEFAULT_DELAY;
    slideshowDelay = next;
    writeSlideshowDelay(next);
    const select = root()?.querySelector(".fl-slideshow-speed");
    if (select) select.value = String(next);
    if (slideshowActive) restartSlideshowTimer();
  }

  function ensureSettingsRows() {
    const panel = root()?.querySelector('[data-panel="settings"]');
    if (!panel) return;
    let versionRow = panel.querySelector(".fl-version-row");
    if (!versionRow) {
      versionRow = document.createElement("div");
      versionRow.className = "fl-version-row";
      const h3 = panel.querySelector("h3");
      if (h3?.nextSibling) panel.insertBefore(versionRow, h3.nextSibling);
      else panel.prepend(versionRow);
    }
    if (versionRow.dataset.version !== VERSION) { versionRow.dataset.version = VERSION; versionRow.innerHTML = `<span>瀑光版本</span><strong>v${VERSION}</strong>`; }

    let speedRow = panel.querySelector(".fl-slideshow-speed-row");
    if (!speedRow) {
      speedRow = document.createElement("label");
      speedRow.className = "xiv-setting-row fl-slideshow-speed-row";
      speedRow.innerHTML = `<span>大图切换速度</span><select class="xiv-select fl-slideshow-speed"></select>`;
      const autoScrollRow = [...panel.querySelectorAll(".xiv-setting-row")].find((row) => /自动滚动速度/.test(row.textContent || ""));
      const rowContainer = autoScrollRow?.parentNode || panel;
      if (autoScrollRow?.nextSibling) rowContainer.insertBefore(speedRow, autoScrollRow.nextSibling);
      else rowContainer.appendChild(speedRow);
      speedRow.querySelector("select")?.addEventListener("change", (event) => setSlideshowDelay(event.target.value));
    }
    const select = speedRow.querySelector("select");
    if (select && !select.options.length) {
      SPEED_OPTIONS.forEach((ms) => {
        const option = document.createElement("option");
        option.value = String(ms);
        option.textContent = speedLabel(ms);
        select.appendChild(option);
      });
    }
    if (select) select.value = String(slideshowDelay);
  }

  function slideshowIcon() {
    return slideshowActive
      ? '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="7" y="5" width="3.8" height="14" rx="1.2"/><rect x="13.2" y="5" width="3.8" height="14" rx="1.2"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.8v12.4c0 .8.9 1.3 1.6.9l9.2-6.2c.6-.4.6-1.4 0-1.8L9.6 4.9C8.9 4.5 8 5 8 5.8Z"/></svg>';
  }

  function ensureSlideshowButton() {
    const app = root();
    if (!app) return;
    if (nativeSlideshowOwnsButton()) {
      // lightbox-enhance owns the only slideshow button. Remove the legacy
      // root-level copy so clicks cannot land on a controller that immediately
      // stops itself.
      app.querySelectorAll(":scope > .xiv-lightbox-slideshow").forEach((node) => node.remove());
      if (slideshowActive) stopSlideshow(false);
      if (app.dataset.flLightbox !== String(isLightboxOpen())) app.dataset.flLightbox = String(isLightboxOpen());
      return;
    }
    let button = app.querySelector(".xiv-lightbox-slideshow");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "xiv-lightbox-slideshow";
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
      }, true);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        toggleSlideshow();
      }, true);
      app.appendChild(button);
    }
    const open = isLightboxOpen();
    if (app.dataset.flLightbox !== String(open)) app.dataset.flLightbox = String(open);
    if (!open) {
      stopSlideshow(false);
      return;
    }
    button.dataset.active = slideshowActive ? "true" : "false";
    button.title = slideshowActive ? "暂停大图自动切换" : `开始大图自动切换（${speedLabel(slideshowDelay)}）`;
    button.setAttribute("aria-label", button.title);
    button.innerHTML = slideshowIcon();
  }

  function clickNextInLightbox() {
    const box = lightbox();
    if (!box || box.dataset.active !== "true") {
      stopSlideshow(false);
      return;
    }
    const before = box.innerHTML;
    const arrow = box.querySelector('.xiv-lightbox-arrow[data-side="right"]');
    if (arrow) arrow.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    setTimeout(() => {
      if (box.dataset.active !== "true") return;
      if (box.innerHTML === before) {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", code: "ArrowRight", bubbles: true, cancelable: true }));
      }
      setTimeout(checkLightbox, 120);
    }, 120);
  }

  function restartSlideshowTimer() {
    clearInterval(slideshowTimer);
    slideshowTimer = window.setInterval(clickNextInLightbox, slideshowDelay);
    ensureSlideshowButton();
  }

  function startSlideshow() {
    if (slideshowActive) return;
    slideshowActive = true;
    restartSlideshowTimer();
  }

  function stopSlideshow(update = true) {
    slideshowActive = false;
    clearInterval(slideshowTimer);
    slideshowTimer = 0;
    if (update) ensureSlideshowButton();
  }

  function toggleSlideshow() {
    if (slideshowActive) stopSlideshow();
    else startSlideshow();
  }

  function checkLightbox() {
    const app = root();
    const open = isLightboxOpen();
    if (app) if (app.dataset.flLightbox !== String(open)) app.dataset.flLightbox = String(open);
    if (!open) stopSlideshow(false);
    ensureSlideshowButton();
  }

  function ensureLightboxObserver() {
    const box = lightbox();
    if (!box || box === lightboxObserverTarget) return;
    lightboxObserver?.disconnect?.();
    lightboxObserverTarget = box;
    lightboxObserver = new MutationObserver(() => scheduleRefresh());
    lightboxObserver.observe(box, { childList: true, subtree: false, attributes: true, attributeFilter: ["data-active"] });
  }

  function refreshAll() {
    ensureStyle();
    document.querySelectorAll(".xiv-media-switch").forEach((node) => node.remove());
    ensureTopFilterButton();
    ensureSettingsRows();
    ensureSlideshowButton();
    ensureLightboxObserver();
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshAll, 140);
  }

  function boot() {
    refreshAll();
    clearTimeout(bootTimer);
    if (!root()) bootTimer = setTimeout(boot, 500);
  }

  document.addEventListener("click", () => setTimeout(checkLightbox, 120), true);
  document.addEventListener("keydown", () => setTimeout(checkLightbox, 120), true);
  document.addEventListener("fullscreenchange", scheduleRefresh, true);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();

// FlowLens module: src/patches/lightbox-enhance.js
(() => {
  if (window.__flowLensLightboxEnhancePatch) return;
  window.__flowLensLightboxEnhancePatch = true;
  window.__flowLensSlideshowNativePatch = true;
  window.__flowLensSlideshowOwner = "lightbox-enhance";

  const SETTINGS_KEY = "flowlens-settings-v2";
  const LEGACY_SPEED_KEY = "flowlens-lightbox-slideshow-delay-v1";
  const STYLE_ID = "flowlens-lightbox-enhance-style";
  const SPEED_OPTIONS = [800, 1200, 1800, 2400, 3200];
  const DEFAULT_DELAY = 1200;
  const ZOOM_MAP = { "1": 1.5, "2": 2, "3": 4, "0": 1 };

  let slideshowActive = false;
  let slideshowTimer = 0;
  let refreshTimer = 0;
  let observer = null;
  let lightboxObserver = null;
  let lightboxObserverTarget = null;
  let zoomFactor = 1;
  let zoomMediaKey = "";
  let drag = null;
  let videoAdvanceTimer = 0;
  let lastEndedMediaKey = "";
  let lastEndedAt = 0;

  function root() { return document.getElementById("xiv-root"); }
  function lightbox() { return root()?.querySelector("#xiv-lightbox"); }
  function isOpen() { return lightbox()?.dataset.active === "true"; }
  function coreApi() { return window.__flowLensControl || null; }
  function ownsSlideshow() {
    return window.__flowLensSlideshowOwner === "lightbox-enhance";
  }

  function readSettings() {
    const extensionSettings = window.__flowLensSettingsStore?.read?.();
    if (extensionSettings) return extensionSettings;
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {}; } catch { return {}; }
  }

  function slideshowDelay() {
    const stored = Number(readSettings().lightboxAutoDelay || 0);
    if (SPEED_OPTIONS.includes(stored)) return stored;
    try {
      const legacy = Number(localStorage.getItem(LEGACY_SPEED_KEY) || 0);
      if (SPEED_OPTIONS.includes(legacy)) return legacy;
    } catch {}
    return DEFAULT_DELAY;
  }

  function speedLabel(ms) {
    if (ms <= 800) return "极速 0.8秒";
    if (ms <= 1200) return "默认 1.2秒";
    if (ms <= 1800) return "较快 1.8秒";
    if (ms <= 2400) return "普通 2.4秒";
    return "慢速 3.2秒";
  }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #xiv-lightbox[data-fl-shortcut-zoom="true"] {
        overflow: auto !important;
        align-items: flex-start !important;
        justify-content: flex-start !important;
        scroll-behavior: auto !important;
      }
      #xiv-lightbox[data-fl-shortcut-zoom="true"] img,
      #xiv-lightbox[data-fl-shortcut-zoom="true"] video,
      #xiv-lightbox[data-fl-shortcut-zoom="true"] iframe[data-media-url],
      #xiv-lightbox[data-fl-shortcut-zoom="true"] .xiv-video-frame {
        max-width: none !important;
        max-height: none !important;
        object-fit: contain !important;
        flex: 0 0 auto !important;
        cursor: grab !important;
      }
      #xiv-lightbox[data-fl-dragging="true"] img,
      #xiv-lightbox[data-fl-dragging="true"] video,
      #xiv-lightbox[data-fl-dragging="true"] iframe[data-media-url],
      #xiv-lightbox[data-fl-dragging="true"] .xiv-video-frame { cursor: grabbing !important; }
      #xiv-lightbox .fl-zoom-hint {
        position: fixed;
        left: 50%;
        bottom: max(20px, env(safe-area-inset-bottom, 0px) + 18px);
        transform: translateX(-50%);
        z-index: 2147483647;
        padding: 8px 12px;
        border-radius: 999px;
        color: #fff;
        background: rgba(0,0,0,.58);
        backdrop-filter: blur(10px);
        font: 850 13px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        pointer-events: none;
        opacity: 0;
        transition: opacity .16s ease;
      }
      #xiv-lightbox .fl-zoom-hint[data-show="true"] { opacity: 1; }
    `;
    document.documentElement.appendChild(style);
  }

  function ensureButton() {
    const box = lightbox();
    if (!box || box.dataset.active !== "true") return null;
    if (!ownsSlideshow()) return box.querySelector(".xiv-lightbox-slideshow");
    let btn = box.querySelector(".xiv-lightbox-slideshow");
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = "xiv-lightbox-slideshow";
      const fav = box.querySelector(".xiv-lightbox-fav");
      if (fav?.parentNode === box) box.insertBefore(btn, fav);
      else box.appendChild(btn);
    }
    const active = String(slideshowActive);
    if (btn.dataset.active !== active) btn.dataset.active = active;
    btn.setAttribute("aria-pressed", active);
    btn.title = slideshowActive ? "暂停大图自动切换" : `开始大图自动切换（${speedLabel(slideshowDelay())}）`;
    btn.setAttribute("aria-label", btn.title);
    return btn;
  }

  function removeButton() {
    if (!ownsSlideshow()) {
      stopSlideshow(false);
      return;
    }
    stopSlideshow(false);
    lightbox()?.querySelector(".xiv-lightbox-slideshow")?.remove();
  }

  function mediaEl() { return lightbox()?.querySelector("img, video, iframe[data-media-url], .xiv-video-frame") || null; }
  function mediaKey(el = mediaEl()) { return el?.currentSrc || el?.src || el?.dataset?.mediaUrl || el?.getAttribute?.("src") || el?.getAttribute?.("srcdoc")?.slice(0, 120) || ""; }

  function iframeVideo(frame) {
    try { return frame?.contentDocument?.querySelector?.("video") || null; } catch { return null; }
  }

  function activeVideo() {
    const box = lightbox();
    return box?.querySelector("video") || iframeVideo(box?.querySelector("iframe[data-media-url], .xiv-video-frame"));
  }

  let waitingVideoKey = "";
  let waitingVideoSince = 0;
  function playVideo(video) {
    if (!video || video.ended) return false;
    if (video.paused && video.dataset.played !== "true") coreApi()?.playVideo?.(video);
    return !video.error && video.dataset.flPlaybackBlocked !== "true";
  }
  function videoRunning() {
    const video = activeVideo();
    if (!video || video.ended || video.error || video.dataset.flPlaybackBlocked === "true") return false;
    const key = mediaKey(video);
    if (key !== waitingVideoKey) { waitingVideoKey = key; waitingVideoSince = Date.now(); }
    playVideo(video);
    if (video.readyState < 2 || video.paused) return Date.now() - waitingVideoSince < 15000;
    waitingVideoSince = Date.now();
    return true;
  }

  function goNext() {
    resetZoom(false);
    const api = coreApi();
    if (typeof api?.showAdjacent === "function") {
      const moved = api.showAdjacent(1);
      return moved !== false;
    }
    const arrow = lightbox()?.querySelector?.('.xiv-lightbox-arrow[data-side="right"]');
    if (arrow) {
      arrow.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      return true;
    }
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", code: "ArrowRight", bubbles: true, cancelable: true }));
    return false;
  }

  function scheduleSlideshow(wait = slideshowDelay()) {
    if (!ownsSlideshow()) return;
    clearTimeout(slideshowTimer);
    if (!slideshowActive) return;
    slideshowTimer = window.setTimeout(slideshowTick, Math.max(250, Number(wait) || DEFAULT_DELAY));
    ensureButton();
    window.dispatchEvent(new CustomEvent("flowlens:slideshow-state", { detail: { active: slideshowActive } }));
  }

  function slideshowTick() {
    if (!slideshowActive) return;
    if (!isOpen()) { removeButton(); return; }
    if (videoRunning()) { scheduleSlideshow(650); return; }
    goNext();
    window.setTimeout(() => {
      const video = activeVideo();
      if (video) playVideo(video);
      ensureButton();
      window.dispatchEvent(new CustomEvent("flowlens:slideshow-state", { detail: { active: slideshowActive } }));
    }, 120);
    scheduleSlideshow(slideshowDelay());
  }

  function advanceAfterVideoEnded(sourceKey = "") {
    if (!slideshowActive || !isOpen()) return;
    const key = sourceKey || mediaKey();
    const now = Date.now();
    const currentKey = mediaKey();
    if (key && currentKey && key !== currentKey) return;
    if (key && key === lastEndedMediaKey && now - lastEndedAt < 1200) return;
    lastEndedMediaKey = key;
    lastEndedAt = now;
    clearTimeout(videoAdvanceTimer);
    clearTimeout(slideshowTimer);
    videoAdvanceTimer = window.setTimeout(() => {
      if (!slideshowActive || !isOpen()) return;
      const current = activeVideo();
      if (current && !current.ended && mediaKey(current) === key) return;
      goNext();
      window.setTimeout(() => {
        const nextVideo = activeVideo();
        if (nextVideo) playVideo(nextVideo);
      }, 120);
      scheduleSlideshow(slideshowDelay());
    }, 140);
  }

  function startSlideshow() {
    if (!ownsSlideshow()) return;
    if (!isOpen()) return;
    slideshowActive = true;
    const video = activeVideo();
    if (video) playVideo(video);
    scheduleSlideshow(video ? 650 : Math.min(480, slideshowDelay()));
    ensureButton();
    window.dispatchEvent(new CustomEvent("flowlens:slideshow-state", { detail: { active: true } }));
  }

  function stopSlideshow(update = true) {
    const changed = slideshowActive;
    slideshowActive = false;
    clearTimeout(slideshowTimer);
    clearTimeout(videoAdvanceTimer);
    slideshowTimer = 0;
    if (update && isOpen()) ensureButton();
    if (changed) window.dispatchEvent(new CustomEvent("flowlens:slideshow-state", { detail: { active: false } }));
  }

  function toggleSlideshow() { slideshowActive ? stopSlideshow() : startSlideshow(); }

  function ensureZoomHint() {
    const box = lightbox();
    if (!box) return null;
    let hint = box.querySelector(".fl-zoom-hint");
    if (!hint) {
      hint = document.createElement("div");
      hint.className = "fl-zoom-hint";
      box.appendChild(hint);
    }
    return hint;
  }

  function showZoomHint(text) {
    const hint = ensureZoomHint();
    if (!hint) return;
    hint.textContent = text;
    hint.dataset.show = "true";
    clearTimeout(Number(hint.dataset.timer || 0));
    hint.dataset.timer = String(window.setTimeout(() => { hint.dataset.show = "false"; }, 900));
  }

  function clearMediaStyle(el) {
    if (!el) return;
    ["width", "height", "max-width", "max-height", "margin", "margin-left", "margin-top", "margin-right", "margin-bottom"].forEach((p) => el.style.removeProperty(p));
  }

  function resetZoom(notify = false) {
    const box = lightbox();
    clearMediaStyle(mediaEl());
    if (box) {
      delete box.dataset.flShortcutZoom;
      delete box.dataset.flZoomFactor;
      delete box.dataset.flDragging;
      box.scrollTo?.({ left: 0, top: 0, behavior: "auto" });
    }
    zoomFactor = 1;
    zoomMediaKey = "";
    if (notify) showZoomHint("已恢复适应屏幕");
  }

  function baseSize(el) {
    const rect = el.getBoundingClientRect?.();
    return {
      width: Math.max(1, Math.round(rect?.width || el.clientWidth || el.naturalWidth || el.videoWidth || 1)),
      height: Math.max(1, Math.round(rect?.height || el.clientHeight || el.naturalHeight || el.videoHeight || 1))
    };
  }

  function applyZoom(factor, notify = true) {
    const box = lightbox();
    const el = mediaEl();
    if (!box || box.dataset.active !== "true" || !el) return;
    const next = Number(factor) > 1 ? Number(factor) : 1;
    if (next === 1) { resetZoom(true); return; }
    if (el.tagName === "IMG" && !el.complete) {
      el.addEventListener("load", () => applyZoom(next, notify), { once: true });
      return;
    }
    const key = mediaKey(el);
    if (zoomMediaKey && zoomMediaKey !== key) resetZoom(false);
    zoomMediaKey = key;
    const size = baseSize(el);
    const width = Math.round(size.width * next);
    const height = Math.round(size.height * next);
    const marginX = Math.max(40, Math.round((box.clientWidth - width) / 2));
    const marginY = Math.max(40, Math.round((box.clientHeight - height) / 2));
    el.style.setProperty("width", `${width}px`, "important");
    el.style.setProperty("height", `${height}px`, "important");
    el.style.setProperty("max-width", "none", "important");
    el.style.setProperty("max-height", "none", "important");
    el.style.setProperty("margin", `${marginY}px ${marginX}px`, "important");
    box.dataset.flShortcutZoom = "true";
    box.dataset.flZoomFactor = String(next);
    zoomFactor = next;
    const center = () => {
      if (!box.isConnected || box.dataset.active !== "true" || box.dataset.flDragging === "true") return;
      box.scrollTo?.({
        left: Math.max(0, Math.round(marginX + width / 2 - box.clientWidth / 2)),
        top: Math.max(0, Math.round(marginY + height / 2 - box.clientHeight / 2)),
        behavior: "auto"
      });
    };
    requestAnimationFrame(center);
    window.setTimeout(center, 120);
    if (notify) showZoomHint(`已放大 ${next}×`);
  }

  function claim(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

  function onSlideshowPointerDown(event) {
    if (!event.target?.closest?.(".xiv-lightbox-slideshow")) return;
    if (!isOpen()) return;
    if (!ownsSlideshow()) return;
    claim(event);
  }

  function onClick(event) {
    if (event.target?.closest?.(".xiv-lightbox-slideshow")) {
      if (!ownsSlideshow()) return;
      claim(event);
      toggleSlideshow();
      return;
    }
    if (event.target?.closest?.(".xiv-lightbox-close")) window.setTimeout(removeButton, 40);
    if (event.target?.closest?.(".xiv-lightbox-arrow")) window.setTimeout(() => resetZoom(false), 40);
  }

  function onKeydown(event) {
    if (!isOpen()) return;
    const target = event.target;
    if (target?.matches?.("input, textarea, select, [contenteditable='true'], [contenteditable='']")) return;
    if (event.key === "Escape") { window.setTimeout(removeButton, 40); return; }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") window.setTimeout(() => resetZoom(false), 40);
    if (!(event.key in ZOOM_MAP) || event.ctrlKey || event.metaKey || event.altKey) return;
    claim(event);
    applyZoom(ZOOM_MAP[event.key]);
  }

  function onPointerDown(event) {
    const box = lightbox();
    if (!box || box.dataset.active !== "true" || box.dataset.flShortcutZoom !== "true") return;
    if (!event.target?.closest?.("#xiv-lightbox img, #xiv-lightbox video, #xiv-lightbox iframe")) return;
    if (event.target?.closest?.(".xiv-lightbox-fav, .xiv-lightbox-close, .xiv-lightbox-arrow, .xiv-lightbox-slideshow")) return;
    drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: box.scrollLeft, top: box.scrollTop };
    box.dataset.flDragging = "true";
    event.target?.setPointerCapture?.(event.pointerId);
    claim(event);
  }

  function onPointerMove(event) {
    const box = lightbox();
    if (!box || !drag || drag.pointerId !== event.pointerId) return;
    box.scrollLeft = drag.left - (event.clientX - drag.x);
    box.scrollTop = drag.top - (event.clientY - drag.y);
    claim(event);
  }

  function onPointerUp(event) {
    const box = lightbox();
    if (!drag || (event && drag.pointerId !== event.pointerId)) return;
    drag = null;
    if (box) delete box.dataset.flDragging;
  }

  function watchLightbox() {
    const box = lightbox();
    if (!box || box === lightboxObserverTarget) return;
    lightboxObserver?.disconnect?.();
    lightboxObserverTarget = box;
    lightboxObserver = new MutationObserver(() => scheduleRefresh(50));
    lightboxObserver.observe(box, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-active"] });
  }

  function refresh() {
    installStyle();
    watchLightbox();
    if (!isOpen()) { removeButton(); resetZoom(false); return; }
    const key = mediaKey();
    if (zoomMediaKey && key && zoomMediaKey !== key) resetZoom(false);
    ensureButton();
  }

  function scheduleRefresh(delay = 80) {
    clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(refresh, delay);
  }

  window.addEventListener("message", (event) => {
    const msg = event.data || {};
    const frame = lightbox()?.querySelector("iframe[data-media-url]");
    if (!frame || event.source !== frame.contentWindow) return;
    if (msg.type === "XIV_VIDEO_TIME" && msg.eventName === "ended") advanceAfterVideoEnded(String(msg.url || ""));
  });
  document.addEventListener("pointerdown", onSlideshowPointerDown, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeydown, true);
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("pointermove", onPointerMove, true);
  document.addEventListener("pointerup", onPointerUp, true);
  document.addEventListener("pointercancel", onPointerUp, true);
  document.addEventListener("ended", (event) => {
    if (event.target?.matches?.("#xiv-lightbox video")) advanceAfterVideoEnded(mediaKey(event.target));
  }, true);

  observer = new MutationObserver(() => scheduleRefresh(80));
  if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-active"] });
  scheduleRefresh(0);
})();

// FlowLens module: src/patches/lightbox-ios-smooth.js
(() => {
  if (window.__flowLensIosSmoothPatch) return;
  window.__flowLensIosSmoothPatch = true;

  const STYLE_ID = "flowlens-lightbox-ios-smooth-style";
  const PRELOAD_OFFSETS = [1, 2, 3, 4, -1, -2];
  const preloadCache = new Map();
  const internalSrcSets = new WeakSet();
  const pendingTokens = new WeakMap();

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #xiv-lightbox[data-active="true"] {
        contain: none !important;
        -webkit-font-smoothing: antialiased;
      }
      #xiv-lightbox img.xiv-fl-smooth-media,
      #xiv-lightbox video.xiv-fl-smooth-media,
      #xiv-lightbox iframe.xiv-fl-smooth-media,
      #xiv-lightbox .xiv-video-frame.xiv-fl-smooth-media {
        opacity: 1 !important;
        transform: translate3d(0, 0, 0) !important;
        transition: none !important;
        will-change: transform !important;
        backface-visibility: hidden !important;
        -webkit-backface-visibility: hidden !important;
        filter: none !important;
      }
      #xiv-lightbox img.xiv-fl-smooth-decoded {
        image-rendering: auto;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function activeLightbox() {
    const node = document.getElementById("xiv-lightbox");
    return node?.dataset.active === "true" ? node : null;
  }

  function coreApi() {
    return window.__flowLensControl || null;
  }

  function normalizeUrl(value) {
    const text = String(value || "");
    if (!text) return "";
    if (/^(?:blob|data):/i.test(text)) return text;
    try {
      const parsed = new URL(text, location.href);
      parsed.hash = "";
      return parsed.href;
    } catch {
      return text.replace(/#.*$/, "");
    }
  }

  function sameUrl(a, b) {
    const left = normalizeUrl(a);
    const right = normalizeUrl(b);
    return !!left && !!right && left === right;
  }

  function isVideoUrl(url) {
    return /\.(?:mp4|webm|mov|m4v)(?:[?#]|$)/i.test(String(url || ""));
  }

  function referrerPolicyFor(url, fallback = "") {
    if (fallback) return fallback;
    try {
      const parsed = new URL(url, location.href);
      return /(^|\.)(xchina\.co|155picpic\.com)$/i.test(parsed.hostname) ? "no-referrer-when-downgrade" : "no-referrer";
    } catch {
      return "no-referrer";
    }
  }

  function warmImage(url, referrerPolicy = "") {
    const key = normalizeUrl(url);
    if (!key || isVideoUrl(key) || /^(?:blob|data):/i.test(key)) return Promise.resolve(false);

    const cached = preloadCache.get(key);
    if (cached && Date.now() - cached.time < 90000) return cached.promise;

    const img = new Image();
    img.decoding = "async";
    try { img.fetchPriority = "high"; } catch {}
    img.referrerPolicy = referrerPolicyFor(key, referrerPolicy);

    let done = false;
    let timer = 0;
    const finish = (ok) => {
      if (done) return ok;
      done = true;
      clearTimeout(timer);
      return ok;
    };

    const waitLoad = new Promise((resolve) => {
      img.onload = () => resolve(finish(true));
      img.onerror = () => resolve(finish(false));
      timer = window.setTimeout(() => resolve(finish(false)), 2600);
    });

    img.src = key;
    const decode = img.decode ? img.decode().then(() => true, () => false) : waitLoad;
    const promise = Promise.race([decode, waitLoad]).then((ok) => ok !== false);
    preloadCache.set(key, { promise, time: Date.now(), image: img });
    return promise;
  }

  function markSmoothMedia(media) {
    if (!media || !media.classList) return;
    if (!media.classList.contains("xiv-fl-smooth-media")) media.classList.add("xiv-fl-smooth-media");
  }

  function shouldSmoothSwap(img, nextUrl) {
    if (!img || img.tagName !== "IMG") return false;
    if (internalSrcSets.has(img)) return false;
    const lb = activeLightbox();
    if (!lb || !lb.contains(img)) return false;
    const target = normalizeUrl(nextUrl);
    if (!target || /^(?:blob|data):/i.test(target)) return false;
    const current = normalizeUrl(img.currentSrc || img.src || "");
    if (!current || sameUrl(current, target)) return false;
    return true;
  }

  function findImageSrcDescriptor() {
    let proto = HTMLImageElement.prototype;
    while (proto) {
      const descriptor = Object.getOwnPropertyDescriptor(proto, "src");
      if (descriptor?.get && descriptor?.set) return descriptor;
      proto = Object.getPrototypeOf(proto);
    }
    return null;
  }

  function installSmoothSrcSetter() {
    const descriptor = findImageSrcDescriptor();
    if (!descriptor || HTMLImageElement.prototype.__flowLensSmoothSrcInstalled) return;

    Object.defineProperty(HTMLImageElement.prototype, "src", {
      configurable: true,
      enumerable: descriptor.enumerable,
      get: descriptor.get,
      set(value) {
        const url = String(value || "");
        if (!shouldSmoothSwap(this, url)) {
          descriptor.set.call(this, value);
          return;
        }
        smoothSetSrc(this, url, descriptor);
      }
    });

    Object.defineProperty(HTMLImageElement.prototype, "__flowLensSmoothSrcInstalled", {
      configurable: false,
      enumerable: false,
      value: true
    });
  }

  async function smoothSetSrc(img, url, descriptor) {
    const token = `${Date.now()}:${Math.random()}`;
    pendingTokens.set(img, token);
    markSmoothMedia(img);

    await Promise.race([
      warmImage(url, img.referrerPolicy || ""),
      new Promise((resolve) => window.setTimeout(resolve, 180))
    ]);
    if (!img.isConnected || pendingTokens.get(img) !== token) return;

    const onReady = () => {
      if (pendingTokens.get(img) !== token) return;
      pendingTokens.delete(img);
      img.classList.add("xiv-fl-smooth-decoded");
      markSmoothMedia(img);
      warmAdjacentFromLightbox();
    };

    img.addEventListener("load", onReady, { once: true });
    img.addEventListener("error", onReady, { once: true });

    internalSrcSets.add(img);
    try {
      descriptor.set.call(img, url);
    } finally {
      queueMicrotask(() => internalSrcSets.delete(img));
    }

    if (img.complete) window.setTimeout(onReady, 0);
    window.setTimeout(onReady, 140);
  }

  function sortedTiles() {
    return [...document.querySelectorAll("#xiv-grid .xiv-tile")]
      .sort((a, b) => Number(a.dataset.index || 0) - Number(b.dataset.index || 0));
  }

  function warmAroundIndex(index) {
    const tiles = sortedTiles();
    if (!tiles.length || !Number.isFinite(index)) return;
    for (const offset of [0, ...PRELOAD_OFFSETS]) {
      const tile = tiles[index + offset];
      const url = tile?.dataset.url || "";
      if (url && !isVideoUrl(url)) warmImage(url);
    }
  }

  function warmAdjacentFromLightbox() {
    const index = Number(coreApi()?.getLightboxIndex?.());
    if (Number.isFinite(index)) warmAroundIndex(index);
  }

  function bindTilePreload() {
    document.addEventListener("pointerdown", (event) => {
      const tile = event.target?.closest?.("#xiv-grid .xiv-tile");
      if (!tile) return;
      warmAroundIndex(Number(tile.dataset.index || 0));
    }, true);
  }

  function decorateLightboxMedia(root = activeLightbox()) {
    if (!root) return;
    root.querySelectorAll("img, video, iframe, .xiv-video-frame").forEach(markSmoothMedia);
    warmAdjacentFromLightbox();
  }

  function observeLightbox() {
    const observer = new MutationObserver((mutations) => {
      let shouldDecorate = false;
      for (const mutation of mutations) {
        if (mutation.target?.id === "xiv-lightbox") shouldDecorate = true;
        if ([...mutation.addedNodes].some((node) => node?.nodeType === 1 && (node.matches?.("#xiv-lightbox img, #xiv-lightbox video, #xiv-lightbox iframe, #xiv-lightbox .xiv-video-frame") || node.querySelector?.("#xiv-lightbox img, #xiv-lightbox video, #xiv-lightbox iframe, #xiv-lightbox .xiv-video-frame")))) {
          shouldDecorate = true;
        }
      }
      if (shouldDecorate) requestAnimationFrame(() => decorateLightboxMedia());
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-active", "src", "class"]
    });
  }

  installStyle();
  installSmoothSrcSetter();
  bindTilePreload();
  observeLightbox();
})();

// FlowLens module: src/patches/lightbox-gallery-swipe.js
(() => {
  window.__flowLensLightboxGallerySwipe = true;
})();

// FlowLens module: src/patches/lightbox-icon-dom-fix.js
(() => {
  // Disabled: live-page DOM pruning caused loading issues on some sites.
})();

// FlowLens module: src/patches/lightbox-icons-unified.js
(() => {
  if (window.__flowLensLightboxIconsUnified) return;
  window.__flowLensLightboxIconsUnified = true;

  const STYLE_ID = "flowlens-lightbox-icons-unified-style";
  const SIZE = 46;
  const GAP = 8;
  const RIGHT = 14;
  const HEART_RED = "#e11d48";
  let timer = 0;

  function root() { return document.getElementById("xiv-root"); }
  function box() { return root()?.querySelector("#xiv-lightbox"); }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #xiv-root > .xiv-lightbox-slideshow,
      body > .xiv-lightbox-slideshow,
      html > .xiv-lightbox-slideshow,
      .xiv-lightbox-slideshow[data-fl-legacy-hidden="true"] {
        display: none !important;
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
      #xiv-root {
        contain: none !important;
        transform: none !important;
      }
      #xiv-lightbox[data-active="true"] {
        contain: none !important;
        transform: none !important;
      }
      #xiv-lightbox .xiv-lightbox-slideshow,
      #xiv-lightbox .xiv-lightbox-zoom,
      #xiv-lightbox .xiv-lightbox-fav,
      #xiv-lightbox .xiv-lightbox-close {
        position: fixed !important;
        top: max(10px, env(safe-area-inset-top, 0px) + 10px) !important;
        bottom: auto !important;
        left: auto !important;
        inset-block-end: auto !important;
        inset-inline-start: auto !important;
        width: ${SIZE}px !important;
        height: ${SIZE}px !important;
        min-width: ${SIZE}px !important;
        min-height: ${SIZE}px !important;
        border-radius: 999px !important;
        border: 1px solid rgba(0,0,0,.14) !important;
        background: rgba(255,255,255,.96) !important;
        background-image: none !important;
        color: #111 !important;
        box-shadow: 0 1px 4px rgba(0,0,0,.10) !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 0 !important;
        margin: 0 !important;
        opacity: 1 !important;
        visibility: visible !important;
        pointer-events: auto !important;
        cursor: pointer !important;
        z-index: 2147483647 !important;
        transform: none !important;
        translate: none !important;
        scale: none !important;
        rotate: none !important;
        transform-origin: center center !important;
        contain: layout paint style !important;
        transition: none !important;
        will-change: auto !important;
        overflow: hidden !important;
        text-indent: 0 !important;
        filter: none !important;
      }
      #xiv-lightbox .xiv-lightbox-close { right: ${RIGHT}px !important; }
      #xiv-lightbox .xiv-lightbox-fav { right: ${RIGHT + SIZE + GAP}px !important; }
      #xiv-lightbox .xiv-lightbox-slideshow { right: ${RIGHT + (SIZE + GAP) * 2}px !important; }
      #xiv-lightbox .xiv-lightbox-zoom { right: ${RIGHT + (SIZE + GAP) * 3}px !important; }
      #xiv-lightbox .xiv-lightbox-arrow {
        position: fixed !important;
        top: 50dvh !important;
        bottom: auto !important;
        width: ${SIZE}px !important;
        height: ${SIZE}px !important;
        margin-top: -${SIZE / 2}px !important;
        transform: none !important;
        translate: none !important;
        scale: none !important;
        rotate: none !important;
        transform-origin: center center !important;
        contain: layout paint style !important;
        transition: none !important;
        will-change: auto !important;
        z-index: 2147483647 !important;
      }
      #xiv-lightbox .xiv-lightbox-arrow[data-side="left"] {
        left: max(${RIGHT}px, env(safe-area-inset-left, 0px) + ${RIGHT}px) !important;
        right: auto !important;
      }
      #xiv-lightbox .xiv-lightbox-arrow[data-side="right"] {
        right: max(${RIGHT}px, env(safe-area-inset-right, 0px) + ${RIGHT}px) !important;
        left: auto !important;
      }
      #xiv-lightbox .xiv-lightbox-fav[data-favorited="true"] {
        color: ${HEART_RED} !important;
        border-color: rgba(225,29,72,.28) !important;
      }
      #xiv-lightbox .xiv-lightbox-slideshow::before,
      #xiv-lightbox .xiv-lightbox-slideshow::after,
      #xiv-lightbox .xiv-lightbox-zoom::before,
      #xiv-lightbox .xiv-lightbox-zoom::after,
      #xiv-lightbox .xiv-lightbox-fav::before,
      #xiv-lightbox .xiv-lightbox-fav::after,
      #xiv-lightbox .xiv-lightbox-close::before,
      #xiv-lightbox .xiv-lightbox-close::after {
        content: none !important;
        display: none !important;
      }
      #xiv-lightbox .xiv-lightbox-slideshow svg,
      #xiv-lightbox .xiv-lightbox-zoom svg,
      #xiv-lightbox .xiv-lightbox-fav svg,
      #xiv-lightbox .xiv-lightbox-close svg {
        display: block !important;
        width: 24px !important;
        height: 24px !important;
        min-width: 24px !important;
        min-height: 24px !important;
        opacity: 1 !important;
        visibility: visible !important;
        color: currentColor !important;
        stroke: currentColor !important;
        filter: none !important;
        flex: 0 0 auto !important;
      }
      #xiv-lightbox .xiv-lightbox-slideshow svg path,
      #xiv-lightbox .xiv-lightbox-slideshow svg rect { fill: currentColor !important; stroke: none !important; }
      #xiv-lightbox .xiv-lightbox-zoom[data-active="true"] { color: #315bd8 !important; border-color: rgba(49,91,216,.3) !important; }
      #xiv-lightbox .xiv-lightbox-fav[data-favorited="true"] svg,
      #xiv-lightbox .xiv-lightbox-fav[data-favorited="true"] svg path {
        color: ${HEART_RED} !important;
        fill: ${HEART_RED} !important;
        stroke: ${HEART_RED} !important;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function hideLegacyDuplicates(lb) {
    document.querySelectorAll(".xiv-lightbox-slideshow").forEach((btn) => {
      if (lb && lb.contains(btn)) return;
      btn.dataset.flLegacyHidden = "true";
      btn.style.setProperty("display", "none", "important");
      btn.style.setProperty("visibility", "hidden", "important");
      btn.style.setProperty("opacity", "0", "important");
      btn.style.setProperty("pointer-events", "none", "important");
    });
  }

  function svgEl(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    if (name === "pause") {
      [[7, 5], [13.2, 5]].forEach(([x, y]) => {
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", String(x));
        rect.setAttribute("y", String(y));
        rect.setAttribute("width", "3.8");
        rect.setAttribute("height", "14");
        rect.setAttribute("rx", "1.2");
        rect.setAttribute("fill", "currentColor");
        svg.appendChild(rect);
      });
    } else {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M8 5.8v12.4c0 .8.9 1.3 1.6.9l9.2-6.2c.6-.4.6-1.4 0-1.8L9.6 4.9C8.9 4.5 8 5 8 5.8Z");
      path.setAttribute("fill", "currentColor");
      svg.appendChild(path);
    }
    return svg;
  }

  function ensureSlideshowButton(lb) {
    const buttons = Array.from(lb.querySelectorAll(".xiv-lightbox-slideshow"));
    let btn = buttons[0];
    buttons.slice(1).forEach((dup) => dup.remove());
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = "xiv-lightbox-slideshow";
      btn.dataset.active = "false";
      const fav = lb.querySelector(".xiv-lightbox-fav");
      if (fav?.parentNode === lb) lb.insertBefore(btn, fav);
      else lb.appendChild(btn);
    }
    return btn;
  }

  function drawButton(btn) {
    if (!btn) return;
    const wanted = btn.dataset.active === "true" ? "pause" : "play";
    if (btn.dataset.flUnifiedIcon === wanted && btn.querySelector("svg")) return;
    btn.dataset.flUnifiedIcon = wanted;
    btn.textContent = "";
    btn.appendChild(svgEl(wanted));
  }

  function scan() {
    installStyle();
    const lb = box();
    hideLegacyDuplicates(lb);
    if (!lb || lb.dataset.active !== "true") return;
    drawButton(ensureSlideshowButton(lb));
  }

  function schedule(delay = 30) {
    clearTimeout(timer);
    timer = window.setTimeout(scan, delay);
  }

  document.addEventListener("click", () => schedule(20), true);
  document.addEventListener("keydown", () => schedule(20), true);
  window.addEventListener("flowlens:slideshow-state", () => schedule(0));
  const observer = new MutationObserver(() => schedule(60));
  if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-active", "data-favorited"] });
  schedule(0);
})();

// FlowLens module: src/patches/lightbox-toolbar-stable.js
(() => {
  window.__flowLensLightboxStableToolbar = true;
})();

// FlowLens module: src/patches/page-bookmarks.js
(() => {
  if (window.__flowLensPageBookmarksPatch) return;
  window.__flowLensPageBookmarksPatch = true;

  const KEY = "flowlens-page-bookmarks-v2";
  const MAX_ITEMS = 300;
  const extensionStorage = typeof chrome !== "undefined" ? chrome.storage?.local || null : null;
  let extensionItems = [];
  const SAVE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4.5h12a1 1 0 0 1 1 1v15l-7-4-7 4v-15a1 1 0 0 1 1-1Z"/></svg>';
  const LIST_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h11M8 12h11M8 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/></svg>';

  const root = () => document.getElementById("xiv-root");
  const settingsPanel = () => root()?.querySelector('[data-panel="settings"]') || null;

  function normalizeUrl(url = location.href) {
    try {
      const parsed = new URL(url, location.href);
      parsed.hash = "";
      return parsed.href;
    } catch {
      return String(url || "").split("#")[0];
    }
  }

  function hostOf(url) {
    try { return new URL(url, location.href).hostname; } catch { return ""; }
  }

  function currentUrl() {
    return normalizeUrl(window.__flowLensControl?.currentPageBookmarkUrl?.() || location.href);
  }

  function currentTitle(url = currentUrl()) {
    const title = window.__flowLensControl?.currentPageBookmarkTitle?.()
      || document.querySelector('meta[property="og:title"], meta[name="twitter:title"]')?.getAttribute?.("content")
      || document.querySelector("h1")?.textContent
      || document.title
      || "";
    return String(title || hostOf(url) || url)
      .replace(/\s+/g, " ")
      .replace(/\s*[-_|–—]+\s*(?:xChina|PornPics|FlowLens|瀑光).*$/i, "")
      .trim();
  }

  function status(text) {
    const node = document.getElementById("xiv-status");
    if (node) node.textContent = text;
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  }

  function readItems() {
    if (extensionStorage) return extensionItems.slice(0, MAX_ITEMS);
    try {
      const items = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(items) ? items.filter((item) => item?.url).slice(0, MAX_ITEMS) : [];
    } catch {
      return [];
    }
  }

  function writeItems(items) {
    const seen = new Set();
    const clean = [];
    for (const item of items) {
      const url = normalizeUrl(item?.url || "");
      if (!url || seen.has(url)) continue;
      seen.add(url);
      clean.push({
        url,
        title: item.title || hostOf(url) || url,
        host: item.host || hostOf(url),
        cover: item.cover || "",
        mediaCount: Number(item.mediaCount || 0),
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || item.createdAt || new Date().toISOString()
      });
    }
    const result = clean.slice(0, MAX_ITEMS);
    if (extensionStorage) {
      extensionItems = result;
      extensionStorage.set({ [KEY]: result });
    } else {
      localStorage.setItem(KEY, JSON.stringify(result));
    }
    return result;
  }

  async function loadExtensionItems() {
    if (!extensionStorage) return;
    try {
      const result = await extensionStorage.get(KEY);
      extensionItems = Array.isArray(result?.[KEY]) ? result[KEY].filter((item) => item?.url).slice(0, MAX_ITEMS) : [];
    } catch {
      extensionItems = [];
    }
    syncButton();
    renderPanel();
  }

  function coverOfCurrentPage() {
    const node = document.querySelector('#xiv-root .xiv-tile img[src], meta[property="og:image"], meta[name="twitter:image"], img[src]');
    const raw = node?.getAttribute?.("content") || node?.currentSrc || node?.getAttribute?.("src") || "";
    try { return raw ? new URL(raw, location.href).href : ""; } catch { return ""; }
  }

  function injectStyle() {
    if (document.getElementById("fl-page-bookmarks-style")) return;
    const style = document.createElement("style");
    style.id = "fl-page-bookmarks-style";
    style.textContent = `
      #xiv-root .fl-page-bookmark-btn svg { width: 20px !important; height: 20px !important; display: block !important; }
      #xiv-root #xiv-page-bookmarks-controls { display: none !important; visibility: hidden !important; pointer-events: none !important; }
      #xiv-root #xiv-topbar .fl-page-bookmark-btn { display: none !important; }
      #xiv-root .fl-page-bookmark-settings {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: 8px !important;
        margin: 10px 0 2px !important;
        padding: 10px !important;
        border-radius: 14px !important;
        background: rgba(92,104,132,.07) !important;
        border: 1px solid rgba(127,127,127,.12) !important;
      }
      #xiv-root[data-theme="dark"] .fl-page-bookmark-settings { background: rgba(255,255,255,.06) !important; }
      #xiv-root .fl-page-bookmark-settings-title {
        grid-column: 1 / -1 !important;
        color: #6d7482 !important;
        font-size: 11px !important;
        font-weight: 900 !important;
        letter-spacing: .08em !important;
      }
      #xiv-root[data-theme="dark"] .fl-page-bookmark-settings-title { color: #b7bdc9 !important; }
      #xiv-root .fl-page-bookmark-settings-btn {
        min-width: 0 !important;
        height: 40px !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 8px !important;
        padding: 0 12px !important;
        border: 1px solid rgba(127,127,127,.18) !important;
        border-radius: 12px !important;
        background: rgba(255,255,255,.78) !important;
        color: inherit !important;
        font-size: 13px !important;
        font-weight: 850 !important;
        cursor: pointer !important;
      }
      #xiv-root[data-theme="dark"] .fl-page-bookmark-settings-btn { background: rgba(255,255,255,.08) !important; }
      #xiv-root .fl-page-bookmark-btn[data-saved="true"] { color: #ffb648 !important; border-color: rgba(255,190,80,.56) !important; background: rgba(255,190,80,.22) !important; }
      #xiv-root .fl-page-bookmark-btn[data-saved="true"] svg { fill: currentColor !important; }
      #xiv-root .fl-page-bookmark-panel {
        position: fixed !important;
        right: max(12px, env(safe-area-inset-right, 0px) + 8px) !important;
        top: max(62px, env(safe-area-inset-top, 0px) + 58px) !important;
        z-index: 2147483647 !important;
        width: min(420px, calc(100vw - 18px)) !important;
        max-height: min(78vh, 650px) !important;
        display: none !important;
        flex-direction: column !important;
        overflow: hidden !important;
        border-radius: 14px !important;
        background: rgba(248,249,251,.97) !important;
        color: #111 !important;
        border: 1px solid rgba(0,0,0,.1) !important;
        box-shadow: 0 24px 72px rgba(0,0,0,.3) !important;
        backdrop-filter: blur(18px) !important;
        font-family: system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif !important;
      }
      #xiv-root[data-theme="dark"] .fl-page-bookmark-panel { background: rgba(18,19,23,.97) !important; color: #f5f5f5 !important; border-color: rgba(255,255,255,.12) !important; }
      #xiv-root .fl-page-bookmark-panel[data-open="true"] { display: flex !important; }
      #xiv-root .fl-page-bookmark-head { display: flex !important; align-items: center !important; justify-content: space-between !important; gap: 10px !important; padding: 11px 12px !important; border-bottom: 1px solid rgba(0,0,0,.08) !important; }
      #xiv-root .fl-page-bookmark-head strong { font-size: 17px !important; font-weight: 950 !important; }
      #xiv-root .fl-page-bookmark-close { width: 32px !important; height: 32px !important; border: 0 !important; border-radius: 999px !important; background: rgba(0,0,0,.08) !important; color: inherit !important; cursor: pointer !important; font-size: 18px !important; }
      #xiv-root .fl-page-bookmark-list { overflow: auto !important; padding: 6px 8px 10px !important; }
      #xiv-root .fl-page-bookmark-empty { padding: 22px !important; text-align: center !important; font-weight: 850 !important; opacity: .65 !important; }
      #xiv-root .fl-page-bookmark-item { display: grid !important; grid-template-columns: 46px minmax(0, 1fr) auto !important; align-items: center !important; gap: 9px !important; padding: 8px !important; margin: 5px 0 !important; border-radius: 12px !important; background: rgba(0,0,0,.045) !important; }
      #xiv-root[data-theme="dark"] .fl-page-bookmark-item { background: rgba(255,255,255,.08) !important; }
      #xiv-root .fl-page-bookmark-cover { width: 46px !important; height: 46px !important; border-radius: 10px !important; object-fit: cover !important; background: rgba(0,0,0,.1) !important; }
      #xiv-root .fl-page-bookmark-title { font-size: 13px !important; line-height: 1.25 !important; font-weight: 900 !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; }
      #xiv-root .fl-page-bookmark-url { margin-top: 2px !important; font-size: 11px !important; color: #61708a !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; direction: ltr !important; }
      #xiv-root .fl-page-bookmark-actions { display: flex !important; gap: 4px !important; }
      #xiv-root .fl-page-bookmark-actions button { height: 30px !important; padding: 0 10px !important; border: 0 !important; border-radius: 999px !important; background: rgba(255,255,255,.86) !important; color: inherit !important; cursor: pointer !important; font-size: 13px !important; font-weight: 900 !important; }
      #xiv-root .fl-page-bookmark-actions [data-action="remove"] { color: #c2410c !important; }
      @media (max-width: 560px) { #xiv-root .fl-page-bookmark-panel { left: 6px !important; right: 6px !important; width: auto !important; } }
    `;
    document.documentElement.appendChild(style);
  }

  function removeLegacyControls() {
    document.querySelectorAll("#xiv-root #xiv-page-bookmarks-controls").forEach((node) => node.remove());
  }

  function ensurePanel() {
    const app = root();
    if (!app) return null;
    removeLegacyControls();
    let panel = app.querySelector(".fl-page-bookmark-panel");
    if (panel) return panel;
    panel = document.createElement("section");
    panel.className = "fl-page-bookmark-panel";
    panel.innerHTML = '<div class="fl-page-bookmark-head"><strong>收藏页面</strong><button type="button" class="fl-page-bookmark-close" title="关闭">×</button></div><div class="fl-page-bookmark-list"></div>';
    app.appendChild(panel);
    panel.querySelector(".fl-page-bookmark-close")?.addEventListener("click", () => { panel.dataset.open = "false"; });
    return panel;
  }

  function renderPanel() {
    const panel = ensurePanel();
    if (!panel) return;
    const list = panel.querySelector(".fl-page-bookmark-list");
    const items = readItems();
    if (!items.length) {
      list.innerHTML = '<div class="fl-page-bookmark-empty">还没有收藏页面</div>';
      return;
    }
    list.innerHTML = items.map((item, index) => `
      <article class="fl-page-bookmark-item" data-index="${index}">
        ${item.cover ? `<img class="fl-page-bookmark-cover" loading="lazy" decoding="async" src="${escapeHtml(item.cover)}" alt="">` : '<div class="fl-page-bookmark-cover"></div>'}
        <div class="fl-page-bookmark-info" title="${escapeHtml(item.url)}">
          <div class="fl-page-bookmark-title">${escapeHtml(item.title || item.url)}</div>
          <div class="fl-page-bookmark-url">${escapeHtml(item.url)}${item.mediaCount ? ` · ${item.mediaCount} 项` : ""}</div>
        </div>
        <div class="fl-page-bookmark-actions">
          <button type="button" data-action="open">打开</button>
          <button type="button" data-action="remove">删除</button>
        </div>
      </article>
    `).join("");
  }

  function syncButton() {
    const button = root()?.querySelector('[data-fl-page-bookmark="save"]');
    if (!button) return;
    const url = currentUrl();
    const saved = readItems().some((item) => normalizeUrl(item.url) === url);
    button.dataset.saved = saved ? "true" : "false";
    button.dataset.url = url;
    button.title = saved ? "取消收藏本页" : "收藏本页";
  }

  function toggleCurrentPage() {
    syncButton();
    const url = currentUrl();
    const items = readItems();
    const existing = items.findIndex((item) => normalizeUrl(item.url) === url);
    if (existing >= 0) {
      items.splice(existing, 1);
      writeItems(items);
      status("已取消收藏本页");
    } else {
      const now = new Date().toISOString();
      writeItems([{
        url,
        title: currentTitle(url),
        host: hostOf(url),
        cover: coverOfCurrentPage(),
        mediaCount: document.querySelectorAll("#xiv-root .xiv-tile").length || 0,
        createdAt: now,
        updatedAt: now
      }, ...items]);
      status("已收藏本页");
    }
    renderPanel();
    syncButton();
  }

  async function openItem(index) {
    const item = readItems()[index];
    if (!item?.url) return;
    const panel = root()?.querySelector(".fl-page-bookmark-panel");
    if (panel) panel.dataset.open = "false";
    try {
      const ok = await window.__flowLensControl?.loadSavedPage?.(item.url);
      if (ok) {
        status("已打开收藏页面");
        return;
      }
    } catch {}
    location.href = item.url;
  }

  function removeItem(index) {
    const items = readItems();
    items.splice(index, 1);
    writeItems(items);
    renderPanel();
    syncButton();
    status("已删除收藏");
  }

  function makeButton(kind, icon, title) {
    const button = document.createElement("button");
    button.className = "fl-page-bookmark-settings-btn fl-page-bookmark-btn";
    button.type = "button";
    button.dataset.flPageBookmark = kind;
    button.title = title;
    button.innerHTML = `${icon}<span>${title}</span>`;
    return button;
  }

  function installButtons() {
    injectStyle();
    removeLegacyControls();
    ensurePanel();
    root()?.querySelectorAll('#xiv-topbar .fl-page-bookmark-btn').forEach((button) => button.remove());
    const panel = settingsPanel();
    if (!panel) return;
    let section = panel.querySelector(".fl-page-bookmark-settings");
    if (!section) {
      section = document.createElement("section");
      section.className = "fl-page-bookmark-settings";
      section.innerHTML = '<div class="fl-page-bookmark-settings-title">页面收藏</div>';
      panel.appendChild(section);
      const save = makeButton("save", SAVE_ICON, "收藏本页");
      section.appendChild(save);
      save.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleCurrentPage();
      });
      const list = makeButton("list", LIST_ICON, "收藏列表");
      section.appendChild(list);
      list.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const panel = ensurePanel();
        if (!panel) return;
        panel.dataset.open = panel.dataset.open === "true" ? "false" : "true";
        renderPanel();
      });
    }
    syncButton();
  }

  document.addEventListener("click", (event) => {
    const row = event.target?.closest?.("#xiv-root .fl-page-bookmark-item");
    if (!row) return;
    const index = Number(row.dataset.index || -1);
    if (event.target.closest("[data-action='remove']")) {
      event.preventDefault();
      event.stopPropagation();
      removeItem(index);
      return;
    }
    if (event.target.closest("[data-action='open'], .fl-page-bookmark-info")) {
      event.preventDefault();
      event.stopPropagation();
      openItem(index);
    }
  }, true);

  window.addEventListener("flowlens:page-url-changed", () => {
    window.setTimeout(() => {
      syncButton();
      renderPanel();
    }, 30);
  });
  window.addEventListener("popstate", () => window.setTimeout(syncButton, 30));
  window.addEventListener("storage", (event) => {
    if (!event.key || event.key === KEY) syncButton();
  });
  if (typeof chrome !== "undefined") {
    chrome.storage?.onChanged?.addListener?.((changes, areaName) => {
      if (areaName !== "local" || !changes[KEY]) return;
      extensionItems = Array.isArray(changes[KEY].newValue) ? changes[KEY].newValue.slice(0, MAX_ITEMS) : [];
      syncButton();
      renderPanel();
    });
  }

  let timer = 0;
  function scheduleInstall() {
    clearTimeout(timer);
    timer = window.setTimeout(installButtons, 80);
  }

  new MutationObserver(scheduleInstall).observe(document.documentElement, { childList: true, subtree: true });
  loadExtensionItems();
  installButtons();
})();

// FlowLens module: src/mobile/mobile-center.js
(() => {
  if (window.__flowLensMobileCenterPatch) return;
  window.__flowLensMobileCenterPatch = true;

  let centerTimer = 0;
  let settleTimer = 0;

  const css = `
    #xiv-lightbox[data-zoom="actual"] {
      scroll-behavior: auto !important;
      overscroll-behavior: contain !important;
    }
    #xiv-lightbox[data-zoom="actual"] > img {
      width: var(--xiv-actual-width, auto) !important;
      height: var(--xiv-actual-height, auto) !important;
      max-width: none !important;
      max-height: none !important;
      flex: 0 0 auto !important;
    }
  `;

  function injectStyle() {
    if (document.getElementById("xiv-mobile-center-style")) return;
    const style = document.createElement("style");
    style.id = "xiv-mobile-center-style";
    style.textContent = css;
    document.documentElement.appendChild(style);
  }

  function lightbox() {
    const node = document.getElementById("xiv-lightbox");
    return node && node.dataset.active === "true" ? node : null;
  }

  function currentImage() {
    return lightbox()?.querySelector?.("img") || null;
  }

  function imageKey(img) {
    return img?.currentSrc || img?.src || "";
  }

  function isActualMode() {
    const lb = lightbox();
    return !!lb && lb.dataset.zoom === "actual";
  }

  function centerNow(force = false) {
    const lb = lightbox();
    const img = currentImage();
    if (!lb || !img || lb.dataset.zoom !== "actual") return;
    if (lb.dataset.dragging === "true") return;

    if (!img.complete || !img.naturalWidth || !img.naturalHeight) {
      img.addEventListener("load", () => scheduleCenter(true, 40), { once: true });
      return;
    }

    const token = [imageKey(img), lb.clientWidth, lb.clientHeight, img.naturalWidth, img.naturalHeight].join("|");
    if (!force && lb.dataset.flActualCentered === token) return;
    lb.dataset.flActualCentered = token;

    const dpr = Math.max(1, Number(window.devicePixelRatio || 1));
    const cssWidth = Math.max(1, Math.round(img.naturalWidth / dpr));
    const cssHeight = Math.max(1, Math.round(img.naturalHeight / dpr));
    img.style.setProperty("--xiv-actual-width", `${cssWidth}px`);
    img.style.setProperty("--xiv-actual-height", `${cssHeight}px`);

    const run = () => {
      if (!isActualMode() || lightbox()?.dataset.dragging === "true") return;
      const current = lightbox();
      if (!current) return;
      const left = Math.max(0, Math.round((current.scrollWidth - current.clientWidth) / 2));
      const top = Math.max(0, Math.round((current.scrollHeight - current.clientHeight) / 2));
      current.scrollTo({ left, top, behavior: "auto" });
    };

    requestAnimationFrame(run);
    clearTimeout(settleTimer);
    settleTimer = window.setTimeout(run, 140);
  }

  function scheduleCenter(force = false, delay = 80) {
    clearTimeout(centerTimer);
    centerTimer = window.setTimeout(() => centerNow(force), delay);
  }

  function rememberActualBeforeClick(event) {
    const lb = lightbox();
    if (!lb || !event.target?.matches?.("#xiv-lightbox img")) return;
    lb.dataset.flWasActualBeforeClick = lb.dataset.zoom === "actual" ? "true" : "false";
  }

  function centerAfterZoomClick(event) {
    const lb = lightbox();
    if (!lb || !event.target?.matches?.("#xiv-lightbox img")) return;
    window.setTimeout(() => {
      const current = lightbox();
      if (!current) return;
      const wasActual = current.dataset.flWasActualBeforeClick === "true";
      if (!wasActual && current.dataset.zoom === "actual") scheduleCenter(true, 30);
    }, 0);
  }

  injectStyle();

  document.addEventListener("pointerdown", rememberActualBeforeClick, true);
  document.addEventListener("click", centerAfterZoomClick, true);

  window.addEventListener("resize", () => scheduleCenter(true, 120), { passive: true });
  window.addEventListener("orientationchange", () => scheduleCenter(true, 260), { passive: true });

  new MutationObserver((mutations) => {
    let shouldCenter = false;
    for (const mutation of mutations) {
      if (mutation.target?.id === "xiv-lightbox" && (mutation.attributeName === "data-zoom" || mutation.attributeName === "data-active")) shouldCenter = true;
      if (mutation.target?.tagName === "IMG" && mutation.target.closest?.("#xiv-lightbox")) shouldCenter = true;
      if ([...mutation.addedNodes].some((node) => node?.nodeType === 1 && (node.matches?.("#xiv-lightbox img") || node.querySelector?.("#xiv-lightbox img")))) shouldCenter = true;
    }
    if (shouldCenter) scheduleCenter(false, 90);
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-zoom", "data-active", "src", "class"]
  });
})();


(() => {
  window.__FLOWLENS_VERSION__ = "2.0.5";
})();
