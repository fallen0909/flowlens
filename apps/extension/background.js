const SETTINGS_KEY = "flowlens-settings-v2";
const MAX_TEXT_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 25000;

const BASE_FEATURE_SCRIPTS = [
  "content-version.js",
  "content-settings-sync.js",
  "content-item-gallery.js",
  "content-media-filter-center.js",
  "content-site-adapter-center.js",
  "content-visible-sequence-safe.js",
  "content-lightbox-event-guard.js",
  "content.js",
  "content-patch.js",
  "content-product.js",
  "content-fixes.js",
  "content-ui-cleanup.js",
  "content-lightbox-stable.js",
  "content-settings-compact-v2.js",
  "content-topfix.js",
  "content-media-sync.js",
  "content-lightbox-enhance.js",
  "content-lightbox-ios-smooth.js",
  "content-lightbox-icons-unified.js",
  "content-page-bookmarks.js",
  "content-video-cover-strategy.js",
  "content-diagnostics-log.js"
];

function featureScriptsForUrl(value) {
  const scripts = [...BASE_FEATURE_SCRIPTS];
  let hostname = "";
  try { hostname = new URL(value).hostname.toLowerCase(); } catch {}
  if (hostname === "x.810114.xyz" || hostname.endsWith(".810114.xyz")) {
    scripts.splice(2, 0, "content-x810114-safe-start.js");
  }
  if (hostname === "xchina.co" || hostname.endsWith(".xchina.co") || hostname.endsWith(".xchina.io")) {
    scripts.splice(2, 0, "content-xchina-ad-filter.js");
  }
  if (hostname === "pornpics.com" || hostname.endsWith(".pornpics.com")) {
    scripts.splice(2, 0, "content-pornpics-queue-hotfix.js");
  }
  if (hostname === "zhihu.com" || hostname.endsWith(".zhihu.com")) {
    scripts.splice(scripts.indexOf("content-topfix.js"), 0, "content-zhihu.js");
  }
  return scripts;
}

function isInjectableTabUrl(value) {
  try {
    return ["http:", "https:", "file:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

async function extensionSettings() {
  try {
    const result = await chrome.storage.sync.get(SETTINGS_KEY);
    return result?.[SETTINGS_KEY] && typeof result[SETTINGS_KEY] === "object" ? result[SETTINGS_KEY] : {};
  } catch {
    return {};
  }
}

async function ensureFeaturesInjected(tabId, tabUrl) {
  const settings = await extensionSettings();
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (initialSettings) => {
      window.__FLOWLENS_EXTENSION_SETTINGS__ = initialSettings || {};
      window.__flowLensSettingsStore?.replace?.(initialSettings || {}, false);
    },
    args: [settings]
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: featureScriptsForUrl(tabUrl)
  });
}

async function activateTab(tabId) {
  if (!Number.isInteger(tabId)) throw new Error("找不到当前标签页");
  const tab = await chrome.tabs.get(tabId);
  if (!isInjectableTabUrl(tab?.url || "")) throw new Error("当前页面不允许运行瀑光");
  await ensureFeaturesInjected(tabId, tab.url);
  await chrome.tabs.sendMessage(tabId, { type: "XIV_TOGGLE" });
  return true;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "FLOWLENS_ACTIVATE") {
    const tabId = sender?.tab?.id ?? message.tabId;
    activateTab(tabId)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }

  if (message?.type === "XIV_DOWNLOAD_URL") {
    downloadImage(message.url, message.filename, message.referrer, sender, message.direct === true)
      .then((downloadId) => sendResponse({ ok: true, downloadId }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }

  if (message?.type === "XIV_FETCH_TEXT") {
    fetchText(message.url, message.referrer, sender)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }

  if (message?.type === "XIV_FETCH_IMAGE") {
    fetchImage(message.url, message.referrer, sender)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }

  return false;
});

function httpUrl(value) {
  const parsed = new URL(String(value || ""));
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error("只允许 HTTP 或 HTTPS 地址");
  return parsed;
}

function sameSiteHostname(left, right) {
  if (!left || !right) return false;
  return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`);
}

function requestContext(url, requestedReferrer, sender) {
  const target = httpUrl(url);
  let senderUrl = null;
  try { senderUrl = httpUrl(sender?.tab?.url || ""); } catch {}
  let referrer = senderUrl;
  try {
    const requested = httpUrl(requestedReferrer || "");
    if (sameSiteHostname(requested.hostname, target.hostname) || sameSiteHostname(requested.hostname, senderUrl?.hostname)) {
      referrer = requested;
    }
  } catch {}
  const includeCredentials = sameSiteHostname(target.hostname, referrer?.hostname || senderUrl?.hostname || "");
  return { target, referrer: referrer?.href || undefined, includeCredentials };
}

async function fetchLimited(url, options, maxBytes, acceptedType) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    httpUrl(response.url);
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (!acceptedType(contentType)) throw new Error(`不支持的响应类型：${contentType || "unknown"}`);
    const declaredSize = Number(response.headers.get("content-length") || 0);
    if (declaredSize > maxBytes) throw new Error("响应文件过大");
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxBytes) throw new Error("响应文件过大");
    return { buffer, contentType };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("请求超时");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url, referrer, sender) {
  const context = requestContext(url, referrer, sender);
  const result = await fetchLimited(context.target.href, {
    credentials: context.includeCredentials ? "include" : "omit",
    referrer: context.referrer,
    headers: { "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8" }
  }, MAX_TEXT_BYTES, (type) => !type || /^(?:text\/|application\/(?:xhtml\+xml|xml))/.test(type));
  return {
    contentType: result.contentType,
    text: new TextDecoder().decode(result.buffer)
  };
}

async function fetchImage(url, referrer, sender) {
  const context = requestContext(url, referrer, sender);
  const result = await fetchLimited(context.target.href, {
    credentials: context.includeCredentials ? "include" : "omit",
    referrer: context.referrer,
    headers: { "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8" }
  }, MAX_IMAGE_BYTES, (type) => /^image\//.test(type));
  return {
    contentType: result.contentType,
    base64: arrayBufferToBase64(result.buffer)
  };
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

function safeDownloadFilename(filename) {
  const fallback = "图片/image.jpg";
  const value = String(filename || fallback)
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.replace(/[<>:"|?*\x00-\x1f]+/g, "_").trim())
    .filter(Boolean)
    .join("/");
  return value || fallback;
}

function isDownloadableImageUrl(url) {
  try {
    const parsed = httpUrl(url);
    const format = parsed.searchParams.get("format")?.toLowerCase() || "";
    return ["jpg", "jpeg", "png", "webp", "avif", "gif"].includes(format)
      || /\.(?:avif|gif|jpe?g|png|webp)$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

async function downloadImage(url, filename, referrer, sender, direct = false) {
  if (!isDownloadableImageUrl(url)) throw new Error("不是可下载的图片地址");
  const parsed = httpUrl(url);
  let downloadUrl = parsed.href;
  if (!direct && /(^|\.)img\.xchina\.io$/i.test(parsed.hostname)) {
    const image = await fetchImage(parsed.href, referrer, sender);
    downloadUrl = `data:${image.contentType};base64,${image.base64}`;
  }
  return startDownload(downloadUrl, filename);
}

function startDownload(url, filename) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download({
      url,
      filename: safeDownloadFilename(filename),
      conflictAction: "uniquify",
      saveAs: false
    }, (downloadId) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(downloadId);
    });
  });
}
