// ==UserScript==
// @name         瀑光 FlowLens 电脑油猴版
// @namespace    local.flowlens.desktop
// @version      1.7.0
// @description  完整单文件发布版：沉浸式网页图片与视频瀑布流。
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      *
// @downloadURL  https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-desktop.user.js
// @updateURL    https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-desktop.user.js
// ==/UserScript==


/* src/core/version.js */
(() => {
  const VERSION = "1.7.0";
  const CHANNEL = "stable";
  const RELEASE_DATE = "2026-06-20";
  const FEATURES = [
    "build-time-single-file",
    "unified-version-center",
    "version-display-sync",
    "page-bookmarks"
  ];

  const previous = window.__FlowLensVersion && typeof window.__FlowLensVersion === "object"
    ? window.__FlowLensVersion
    : {};

  const info = Object.freeze({
    ...previous,
    name: "瀑光 FlowLens",
    version: VERSION,
    channel: CHANNEL,
    releaseDate: RELEASE_DATE,
    features: Object.freeze([...(Array.isArray(previous.features) ? previous.features : []), ...FEATURES]
      .filter((item, index, array) => item && array.indexOf(item) === index)),
    source: "src/core/version.js"
  });

  window.__FlowLensVersion = info;
  window.__FLOWLENS_VERSION__ = VERSION;
  window.__flowLensGetVersion = () => window.__FlowLensVersion || info;
})();


/* src/core/global-settings.js */
(() => {
  if (window.__flowLensGlobalSettings) return;
  window.__flowLensGlobalSettings = true;

  const SETTINGS_KEY = "flowlens-settings-v2";
  const GLOBAL_KEY = "flowlens-global-settings-v2";
  const SYNC_KEYS = ["launchHidden", "launchCompact", "autoFullscreen", "videoPreview", "theme", "columns", "autoScrollSpeed", "lightboxAutoDelay"];
  let saveTimer = 0;

  function safeJsonParse(text) {
    try { return JSON.parse(text || "{}") || {}; } catch { return {}; }
  }

  function readLocalSettings() {
    return safeJsonParse(localStorage.getItem(SETTINGS_KEY) || "{}");
  }

  function writeLocalSettings(settings) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings || {})); } catch { /* ignore */ }
  }

  function pick(settings) {
    const result = {};
    SYNC_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(settings || {}, key)) result[key] = settings[key];
    });
    return result;
  }

  function readGlobalSettings() {
    try { return safeJsonParse(GM_getValue(GLOBAL_KEY, "{}")); } catch { return {}; }
  }

  function writeGlobalSettings(settings) {
    try { GM_setValue(GLOBAL_KEY, JSON.stringify(pick(settings || {}))); } catch { /* ignore */ }
  }

  function applyLaunchVisibility(settings) {
    document.documentElement.classList.toggle("xiv-fl-launch-hidden", settings && settings.launchHidden === true);
  }

  function applyGlobalToThisSite() {
    const global = readGlobalSettings();
    const local = readLocalSettings();
    const merged = { ...local, ...pick(global) };
    writeLocalSettings(merged);
    applyLaunchVisibility(merged);
    return merged;
  }

  function syncThisSiteToGlobal() {
    const local = readLocalSettings();
    writeGlobalSettings(local);
    applyLaunchVisibility(local);
  }

  window.__flowLensApplyGlobalSettings = applyGlobalToThisSite;
  window.__flowLensSyncGlobalSettings = syncThisSiteToGlobal;

  applyGlobalToThisSite();

  window.addEventListener("storage", (event) => {
    if (event.key !== SETTINGS_KEY) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(syncThisSiteToGlobal, 120);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") syncThisSiteToGlobal();
  });
})();


/* src/core/flowlens-core.js */
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
    downloading: false,
    autoScroll: false,
    autoScrollSpeed: 3,
    autoScrollFrame: 0,
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
    mediaPreloadCache: new Map(),
    lightboxDrag: null,
    lightboxSuppressClickUntil: 0,
    lastStageScrollAt: 0,
    masonryLayoutTimer: 0,
    restorePosition: null,
    restoreStartedAt: 0,
    restoreTimer: 0,
    galleryFailureCount: 0,
    rejectedCount: 0,
    collectedCount: 0,
    lastDownloadScope: "all",
    collectionBase: "",
    x810114ApiMode: false,
    galleryQueue: [],
    galleryQueueIndex: -1,
    galleryQueueCurrentUrl: ""
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

  function chromeStorageLocal() {
    try {
      return typeof chrome !== "undefined" ? chrome.storage?.local : null;
    } catch {
      return null;
    }
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(settingsStorageKey());
      const parsed = raw ? JSON.parse(raw) : {};
      state.settings = { ...DEFAULT_SETTINGS, ...parsed };
    } catch {
      state.settings = { ...DEFAULT_SETTINGS };
    }
    state.columns = Math.max(2, Math.min(8, Number(state.settings.columns || DEFAULT_SETTINGS.columns)));
    state.autoScrollSpeed = Math.max(1, Math.min(10, Number(state.settings.autoScrollSpeed || DEFAULT_SETTINGS.autoScrollSpeed)));
    state.themeManual = state.settings.theme !== "system";
    state.theme = state.themeManual ? state.settings.theme : systemTheme();
  }

  function loadExtensionSettings() {
    const storage = chromeStorageLocal();
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
    try {
      localStorage.setItem(settingsStorageKey(), JSON.stringify(state.settings));
    } catch {
      // Storage can be blocked on restricted pages; settings remain active for this session.
    }
    const storage = chromeStorageLocal();
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
      min-height: 96px;
    }
    #xiv-root[data-theme="light"] .xiv-tile {
      background: #fff; box-shadow: 0 1px 14px rgba(0,0,0,.13);
    }
    .xiv-tile img, .xiv-tile video {
      display: block !important; width: 100%; height: auto; min-height: 96px; max-height: 82vh; object-fit: contain; background: #111; pointer-events: none;
      overflow-anchor: none;
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
    .xiv-lightbox-fav {
      position: fixed; right: 68px; top: 18px; z-index: 6;
      width: 42px; height: 42px; border-radius: 999px; border: 1px solid rgba(255,255,255,.26);
      background: radial-gradient(circle at 32% 24%, rgba(255,255,255,.22), rgba(18,18,20,.72));
      color: #fff; display: grid; place-items: center;
      pointer-events: auto; cursor: pointer; padding: 0;
      box-shadow: 0 12px 30px rgba(0,0,0,.36), inset 0 1px 0 rgba(255,255,255,.18);
      backdrop-filter: blur(12px); transition: transform .14s ease, background .14s ease, border-color .14s ease, color .14s ease;
    }
    .xiv-lightbox-fav:hover { transform: translateY(-1px) scale(1.04); background: radial-gradient(circle at 32% 24%, rgba(255,255,255,.28), rgba(42,42,46,.82)); }
    .xiv-lightbox-fav:active { transform: scale(.96); }
    .xiv-lightbox-fav svg,
    .xiv-lightbox-close svg { width: 21px; height: 21px; display: block; filter: drop-shadow(0 5px 10px rgba(0,0,0,.28)); }
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
    } catch {
      return false;
    }
    return false;
  }

  function collectGalleryQueueFromDocument(doc = document, base = location.href) {
    const queue = [];
    const seen = new Set();

    function remember(raw) {
      const url = normalizedPageUrl(absoluteUrl(raw, base));
      if (!url || !isQueueCandidateUrl(url)) return;
      const key = url.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      queue.push(url);
    }

    doc.querySelectorAll("a[href]").forEach((link) => remember(link.getAttribute("href")));
    collectGalleryQueueUrlsFromHtml(doc, base).forEach(remember);
    if (/^https?:\/\/x\.810114\.xyz(?:\/|$)/i.test(base)) {
      collectX810114ProfileQueueFromText(doc).forEach(remember);
    }
    return queue;
  }

  function collectGalleryQueueUrlsFromHtml(doc = document, base = location.href) {
    const found = [];
    const seen = new Set();
    const html = doc.documentElement?.innerHTML || "";
    if (!html) return found;

    function remember(raw) {
      const url = normalizedPageUrl(absoluteUrl(raw, base));
      if (!url || !isQueueCandidateUrl(url)) return;
      const key = url.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      found.push(url);
    }

    for (const match of html.matchAll(/https?:\/\/(?:www\.)?pornpics\.com\/(?:[a-z]{2}\/)?galleries\/[^"'<>\\\s]+?-\d+\/?/gi)) remember(match[0]);
    for (const match of html.matchAll(/["'](\/(?:[a-z]{2}\/)?galleries\/[^"'<>\\\s]+?-\d+\/?)["']/gi)) remember(match[1]);
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
      return Array.isArray(data) ? data.map(normalizedPageUrl).filter(isQueueCandidateUrl) : [];
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
    const stored = readStoredGalleryQueue();
    const discovered = collectGalleryQueueFromDocument(doc, base);
    const current = activeGalleryQueueUrl();
    const merged = [];
    const seen = new Set();

    function remember(url) {
      const clean = normalizedPageUrl(url);
      if (!clean || !isQueueCandidateUrl(clean)) return;
      const key = clean.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(clean);
    }

    stored.forEach(remember);
    discovered.forEach(remember);
    if (isQueueCandidateUrl(current)) remember(current);
    state.galleryQueue = merged;
    state.galleryQueueIndex = merged.findIndex((url) => samePageUrl(url, current));
    if (merged.length > 1) writeStoredGalleryQueue(merged);
    syncGalleryQueueButtons();
  }

  function rebuildGalleryQueueFromVisiblePage() {
    const current = activeGalleryQueueUrl();
    const visibleBase = state.collectionBase || location.href;
    const discovered = collectGalleryQueueFromDocument(document, visibleBase);
    const stored = readStoredGalleryQueue();
    const merged = [];
    const seen = new Set();

    function remember(url) {
      const clean = normalizedPageUrl(url);
      if (!clean || !isQueueCandidateUrl(clean)) return;
      const key = clean.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(clean);
    }

    discovered.forEach(remember);
    stored.forEach(remember);
    if (isQueueCandidateUrl(current)) remember(current);
    if (merged.length < 2) {
      // x.810114 renders the recommendation rail lazily. A second pass after
      // layout catches cards that appeared between the original refresh and tap.
      if (isGenericX810114Page()) {
        window.setTimeout(() => refreshGalleryQueue(), 120);
      }
      return false;
    }
    state.galleryQueue = merged;
    state.galleryQueueIndex = merged.findIndex((url) => samePageUrl(url, current));
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
    let index = state.galleryQueueIndex;
    if (index < 0) index = queue.findIndex((url) => samePageUrl(url, activeGalleryQueueUrl()));
    if (index < 0) index = 0;
    const next = (index + delta + queue.length) % queue.length;
    const url = queue[next];
    return samePageUrl(url, activeGalleryQueueUrl()) ? "" : url;
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

    const virtualSelfieNavigation = false;
    const previousQueueUrl = state.galleryQueueCurrentUrl;
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

    if (isGenericX810114Page()) {
      await prepareGenericX810114Page();
      if (!state.x810114ApiMode) startGenericObserver();
    } else {
      let html = "";
      try {
        html = await fetchHtml(targetUrl, previousQueueUrl || location.href);
      } catch (error) {
        if (virtualSelfieNavigation) state.galleryQueueCurrentUrl = previousQueueUrl;
        throw error;
      }
      const doc = new DOMParser().parseFromString(html, "text/html");
      doc.documentElement.dataset.xivBase = targetUrl;
      collectFromDocument(doc, targetUrl);
      if (isPhotoGalleryPage()) {
        discoverNearbyPages();
        fetchRemainingPages(galleryFetchLimit());
      } else if (!virtualSelfieNavigation && !isPornpicsGalleryPage(targetUrl)) {
        startGenericObserver();
      }
    }

    refreshGalleryQueue(document, targetUrl);
    renderImages();
    applyMediaFilter();
    updateCounter();
    updateStatus(`已切换到${state.galleryQueueIndex >= 0 ? `第 ${state.galleryQueueIndex + 1} 组` : "新套图"}`);
    if (state.stage) state.stage.scrollTo({ top: 0, behavior: "auto" });
    return state.images.length > 0;
  }

  // Loads a saved page without navigating the browser. This is deliberately
  // separate from gallery-queue navigation: saved pages may belong to another
  // origin, and pushState cannot change origins while the viewer is open.
  async function loadSavedPageInPlace(target) {
    const targetUrl = normalizedPageUrl(target);
    if (!targetUrl || !HTTP_PAGE_RE.test(targetUrl)) return false;

    let html = "";
    try {
      updateStatus("正在读取收藏页面");
      html = await fetchHtml(targetUrl, state.galleryQueueCurrentUrl || location.href);
    } catch {
      updateStatus("收藏页面读取失败，已保留当前图片流");
      return false;
    }

    const doc = new DOMParser().parseFromString(html, "text/html");
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
    state.stage?.scrollTo({ top: 0, behavior: "auto" });
    return true;
  }

  async function loadSelfieGalleryQueueTargetInPlace(targetUrl) {
    const previousQueueUrl = state.galleryQueueCurrentUrl || location.href;
    let doc = null;
    try {
      doc = await fetchSelfieGalleryDocument(targetUrl, previousQueueUrl);
    } catch {
      updateStatus("下一组加载失败，已保留当前全屏");
      return false;
    }

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
    const target = galleryQueueTarget(delta);
    if (!target) {
      updateStatus("没有可切换的套图");
      return;
    }
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

  function isPhotoGalleryPage() {
    return galleryPrefixFromUrl(location.href) !== "";
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
    const genericPage = !isPhotoGalleryPage();
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
    if (isPhotoGalleryPage()) discoverPageLinksFromDocument(doc, base);

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
      if (isPhotoGalleryPage() && sameGalleryPage(href)) state.pageUrls.add(href);
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

    if (!isPhotoGalleryPage() || !added) {
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

  function resetCollection() {
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
    return url ? url.replace("https://video.twimg.com", "https://video-cf.twimg.com") : "";
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
    img.addEventListener("load", () => {
      img.dataset.awaitingFallback = "";
    });
    img.addEventListener("error", () => {
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
    });
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
    const eagerLimit = isKnownGalleryUrl() ? 24 : 8;
    img.loading = index < eagerLimit ? "eager" : "lazy";
    if (index < eagerLimit) img.fetchPriority = "high";
    img.decoding = "async";
    applyInitialAspectRatio(img, url);
    setImageSourceWithFallback(img, url);
    img.addEventListener("load", () => {
      if (!isLoadedPhotoLike(img)) rejectImage(url);
      rememberMediaRatio(url, img.naturalWidth || 0, img.naturalHeight || 0);
      if (img.naturalWidth > 0 && img.naturalHeight > 0) img.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
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
        previewMode: isGenericX810114Page() || /\/\/video(?:-cf)?\.twimg\.com\//i.test(url) ? "seek" : "canvas",
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
    img.loading = index < 8 ? "eager" : "lazy";
    img.decoding = "async";
    applyInitialAspectRatio(img, poster);
    img.referrerPolicy = shouldKeepReferrer(poster) ? "no-referrer-when-downgrade" : "no-referrer";
    img.src = poster;
    img.addEventListener("load", () => {
      rememberMediaRatio(url, img.naturalWidth || 0, img.naturalHeight || 0);
      if (img.naturalWidth > 0 && img.naturalHeight > 0) img.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
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
      if (autoplay) video.play().catch(() => {});
    };
    video.dataset.loadTimer = String(window.setTimeout(tryFallback, autoplay ? 4500 : 3200));
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
    if (previewMode === "canvas" && !/\/\/video(?:-cf)?\.twimg\.com\//i.test(url)) video.crossOrigin = "anonymous";
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
      if (autoplay) video.play().catch(() => {});
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
    const name = x810114ProfileName();
    if (!name) return false;
    updateStatus("读取站点数据");
    const apiUrl = `https://x.moonchan.xyz/api/twitter/${encodeURIComponent(name)}.json.gz?t=${new Date().toISOString().slice(0, 10)}`;
    const res = await fetch(apiUrl, { credentials: "omit", cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
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
    if (!isX810114ProfilePage()) {
      collectFromDocument(document, location.href);
      updateStatus(`已收集 ${state.images.length} 张`);
      return;
    }
    try {
      if (await collectX810114ProfileFromApi()) return;
    } catch {
      updateStatus("接口失败，改用页面收集");
    }
    const expand = findButtonByText(/展开全部/);
    if (expand) {
      updateStatus("正在展开全部");
      expand.click();
      await sleep(900);
    }
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
        if (BAD_IMAGE_RE.test(url) || isAdMedia(url) || isX810114Avatar(url) || (STATIC_ASSET_RE.test(url) && !isDiscuzAttachmentUrl(url))) continue;
        if (!isPhotoGalleryPage() && !isGenericX810114Page()) {
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
      if (!sameGalleryPage(url)) return false;
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
    if (isKnownGalleryUrl()) return SITE_ALBUM_FETCH_BATCH;
    return isZttaotuUrl() ? Math.max(GALLERY_FETCH_BATCH, state.pageUrls.size) : GALLERY_FETCH_BATCH;
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

  function sameGalleryPage(url) {
    if (!url) return false;
    try {
      const currentPrefix = galleryPrefixFromUrl(location.href);
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
    if (!isPhotoGalleryPage()) {
      updateStatus("当前页模式");
      return;
    }
    if (state.fetching) return;
    const now = Date.now();
    if (!force && now - state.lastGalleryFetchAt < 900) return;
    state.lastGalleryFetchAt = now;
    const maxBatch = isKnownGalleryUrl()
      ? SITE_ALBUM_FETCH_BATCH
      : isZttaotuUrl() ? Math.max(GALLERY_FETCH_BATCH, state.pageUrls.size) : GALLERY_FETCH_BATCH;
    limit = Math.max(1, Math.min(maxBatch, limit));
    state.fetching = true;

    try {
      let loaded = 0;
      let claimed = 0;
      const nextPage = () => {
        if (claimed >= limit) return "";
        const url = sortedPageUrls().find((candidate) => !state.fetchedPages.has(candidate) && candidate !== location.href);
        if (!url) return "";
        state.fetchedPages.add(url);
        claimed += 1;
        return url;
      };
      const worker = async () => {
        while (true) {
          const url = nextPage();
          if (!url) break;
          updateStatus(`加载分页 ${loaded + 1}/${state.pageUrls.size}`);
          try {
            const res = await fetch(url, { credentials: "include" });
            if (!res.ok) {
              state.galleryFailureCount += 1;
              debugLog("分页加载失败", { url, status: res.status, statusText: res.statusText });
              updateStatus(`分页失败 ${res.status}：${pageNumberFromUrl(url) || "?"}`);
            } else {
              const html = await res.text();
              if (/正在进行安全验证|cloudflare|cf-browser-verification|Just a moment/i.test(html)) {
                state.galleryFailureCount += 1;
                debugLog("分页触发安全验证", { url });
                updateStatus(`分页触发安全验证：${pageNumberFromUrl(url) || "?"}`);
              } else {
                const doc = new DOMParser().parseFromString(html, "text/html");
                collectFromDocument(doc, url);
              }
            }
          } catch (error) {
            state.galleryFailureCount += 1;
            debugLog("分页加载异常", { url, error: String(error?.message || error) });
            updateStatus(`分页异常：${String(error?.message || error).slice(0, 36)}`);
          } finally {
            loaded += 1;
            if (isKnownGalleryUrl()) await sleep(160);
          }
        }
      };
      const workers = Math.min(isKnownGalleryUrl() ? 2 : 2, Math.max(1, limit));
      await Promise.all(Array.from({ length: workers }, worker));
    } finally {
      state.fetching = false;
      const hasMore = sortedPageUrls().some((url) => !state.fetchedPages.has(url) && url !== location.href);
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
    [state.settingsPanel, state.diagnosticsPanel].forEach((panel) => {
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
          <button class="xiv-btn" type="button" data-xiv="favzip" title="下载收藏 ZIP">${icons.heart}<span>收藏</span></button>
          <button class="xiv-btn" type="button" data-xiv="links" title="导出链接">${icons.link}<span>链接</span></button>
          <button class="xiv-btn" type="button" data-xiv="auto" title="自动滚动">${icons.play}<span>自动</span></button>
          <button class="xiv-btn" type="button" data-xiv="prev-set" title="上一组">${icons.prevSet}<span>上一组</span></button>
          <button class="xiv-btn" type="button" data-xiv="next-set" title="下一组">${icons.nextSet}<span>下一组</span></button>
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
        <small>入口可以直接拖动，位置会保存。普通更新通过 reload-token 自动重载。</small>
      </div>
      <div class="xiv-panel xiv-diagnostics" data-panel="diagnostics">
        <h3>诊断报告</h3>
        <pre></pre>
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

    state.root.querySelector('[data-xiv="close"]').addEventListener("click", closeViewer);
    state.root.querySelector('[data-xiv="filter"]').addEventListener("change", (event) => setMediaFilter(event.target.value));
    state.root.querySelector('[data-xiv="less"]').addEventListener("click", () => setColumns(state.columns - 1));
    state.root.querySelector('[data-xiv="more"]').addEventListener("click", () => setColumns(state.columns + 1));
    state.root.querySelector('[data-xiv="theme"]').addEventListener("click", toggleTheme);
    state.root.querySelector('[data-xiv="full"]').addEventListener("click", toggleFullscreen);
    state.root.querySelector('[data-xiv="download"]').addEventListener("click", downloadZip);
    state.root.querySelector('[data-xiv="favzip"]').addEventListener("click", () => downloadZip("favorites"));
    state.root.querySelector('[data-xiv="links"]').addEventListener("click", exportLinks);
    state.root.querySelector('[data-xiv="auto"]').addEventListener("click", toggleAutoScroll);
    state.root.querySelector('[data-xiv="prev-set"]').addEventListener("click", () => navigateGalleryQueue(-1));
    state.root.querySelector('[data-xiv="next-set"]').addEventListener("click", () => navigateGalleryQueue(1));
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
    state.stage.addEventListener("scroll", onScroll, { passive: true });
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
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < state.images.length; i += 1) {
      const url = state.images[i];
      const key = keyForUrl(url);
      if (state.renderedKeys.has(key)) continue;
      state.renderedKeys.add(key);
      const tile = document.createElement("div");
      tile.className = "xiv-tile";
      tile.tabIndex = 0;
      tile.role = "button";
      tile.dataset.index = String(i);
      tile.dataset.url = url;
      tile.dataset.urlKey = key;
      const media = isVideoUrl(url)
        ? createVideoPreviewElement(url, i)
        : createImageElement(url, i);
      if (media.tagName === "VIDEO") {
        media.controls = false;
      }
      const label = document.createElement("span");
      label.textContent = String(i + 1).padStart(2, "0");
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
        openLightbox(Number(tile.dataset.index || i));
      });
      tile.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          claimEvent(event);
          if (Date.now() < state.suppressLightboxUntil) return;
          state.lightboxGestureToken = Date.now();
          openLightbox(Number(tile.dataset.index || i));
        }
      });
      fragment.appendChild(tile);
    }
    if (fragment.childNodes.length) {
      ensureMasonryColumns();
      appendTilesToMasonry([...fragment.childNodes]);
    }
    syncTileIndexes();
    updateCounter();
    scheduleRestoreViewerPosition();
  }

  function useSimpleGridLayout() {
    return false;
  }

  function allTiles() {
    return [...(state.grid?.querySelectorAll(".xiv-tile") || [])]
      .sort((a, b) => Number(a.dataset.index || 0) - Number(b.dataset.index || 0));
  }

  function syncTileIndexes() {
    allTiles().forEach((tile) => {
      const i = state.images.indexOf(tile.dataset.url || "");
      if (i < 0) return;
      tile.dataset.index = String(i);
      const label = tile.querySelector("span");
      if (label) label.textContent = String(i + 1).padStart(2, "0");
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
    allTiles().forEach((tile) => {
      tile.hidden = !mediaMatchesFilter(tile.dataset.url || "");
    });
    layoutMasonry();
  }

  function rebuildMasonry() {
    if (!state.grid) return;
    const tiles = allTiles();
    state.grid.replaceChildren();
    state.masonryColumns = [];
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
    appendTilesToMasonry(tiles);
    return state.masonryColumns;
  }

  function appendTilesToMasonry(tiles) {
    if (!tiles.length) return;
    const columns = ensureMasonryColumns();
    const columnHeights = columns.map((column) => columnHeight(column));
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
    const rect = tile.getBoundingClientRect?.();
    if (rect?.height > 20) return rect.height + masonryGap();

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
      || 0.72;
    const columnWidth = column?.clientWidth || tile.clientWidth || Math.max(160, Math.floor((state.stage?.clientWidth || window.innerWidth || 1000) / Math.max(1, state.columns)));
    return Math.max(80, columnWidth / ratio) + masonryGap();
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
      state.grid.replaceChildren();
      state.masonryColumns = [];
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
    state.masonryLayoutTimer = setTimeout(layoutMasonry, 120);
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

  function loadViewerPosition() {
    try {
      const raw = localStorage.getItem(positionStorageKey());
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || Date.now() - Number(data.time || 0) > 30 * 24 * 60 * 60 * 1000) return null;
      return {
        url: String(data.url || ""),
        index: Math.max(0, Number(data.index || 0)),
        scrollTop: Math.max(0, Number(data.scrollTop || 0))
      };
    } catch {
      return null;
    }
  }

  function startViewerPositionRestore() {
    state.restorePosition = loadViewerPosition();
    state.restoreStartedAt = Date.now();
    scheduleRestoreViewerPosition();
  }

  function scheduleRestoreViewerPosition() {
    if (!state.active || !state.restorePosition || !state.stage) return;
    clearTimeout(state.restoreTimer);
    state.restoreTimer = window.setTimeout(restoreViewerPosition, 90);
  }

  function restoreViewerPosition() {
    const saved = state.restorePosition;
    if (!state.active || !saved || !state.stage) return;
    const key = saved.url ? keyForUrl(saved.url) : "";
    const tile = key
      ? state.grid?.querySelector(`[data-url-key="${CSS.escape(key)}"]`)
      : allTiles().find((item) => Number(item.dataset.index || 0) === saved.index);

    if (tile) {
      tile.scrollIntoView({ block: "start", inline: "nearest" });
      state.stage.scrollTop = Math.max(0, state.stage.scrollTop - 54);
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

    state.stage.scrollTop = Math.min(saved.scrollTop, Math.max(0, state.stage.scrollHeight - state.stage.clientHeight));
    state.restorePosition = null;
  }

  function updateCounter() {
    if (!state.counter) return;
    const visibleCount = filteredImages().length;
    const suffix = state.mediaFilter === "all" ? "" : ` / 显示 ${visibleCount}`;
    const expected = isPornpicsGalleryPage() ? 0 : state.expectedImages;
    state.counter.textContent = expected
      ? `${state.images.length}/${state.expectedImages} 张${suffix}`
      : `${state.images.length} 张${suffix}`;
  }

  function updateStatus(text) {
    if (state.status) state.status.textContent = text;
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
    const step = () => {
      if (!state.autoScroll || !state.active || !state.stage) return;
      if (state.lightbox?.dataset.active === "true") return;
      const before = state.stage.scrollTop;
      state.stage.scrollTop += state.autoScrollSpeed;
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
      await fetchRemainingPages(GALLERY_FETCH_BATCH, true);
      while (state.fetching) await sleep(180);
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

  async function openViewer() {
    ensureUi();
    if (!isSupportedPage()) {
      updateStatus("当前页面不支持");
      alert("瀑光只支持 http/https 网页。");
      return;
    }

    resetCollection();
    state.galleryQueueCurrentUrl = normalizedPageUrl(location.href);
    startViewerPositionRestore();
    closeHostPhotoViewer();
    state.active = true;
    state.suppressLightboxUntil = Date.now() + 900;
    document.documentElement.classList.add("xiv-active");
    startHostOverlayGuard();
    state.root.dataset.active = "true";
    state.root.dataset.theme = state.theme;
    if (!isGenericX810114Page()) {
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
    }

    if (!state.images.length) {
      state.fetchedPages.add(location.href);
      state.pageUrls.add(location.href);
      if (isGenericX810114Page()) {
        await prepareGenericX810114Page();
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
    saveViewerPosition();
    closeLightbox(false);
    state.autoScrollPausedForLightbox = false;
    state.autoScroll = false;
    cancelAnimationFrame(state.autoScrollFrame);
    clearTimeout(state.restoreTimer);
    state.restorePosition = null;
    stopGenericObserver();
    stopHostOverlayGuard();
    state.active = false;
    state.galleryQueueCurrentUrl = "";
    document.documentElement.classList.remove("xiv-active");
    state.root.dataset.active = "false";
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
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
    img.referrerPolicy = shouldKeepReferrer(url) ? "no-referrer-when-downgrade" : "no-referrer";
    img.src = url;
    state.mediaPreloadCache.set(key, { media: img, time: Date.now() });
    return videoBudget;
  }

  function scheduleLightboxMediaPreload(centerIndex = state.index) {
    clearTimeout(state.mediaPreloadTimer);
    state.mediaPreloadTimer = setTimeout(() => {
      if (state.lightbox?.dataset.active !== "true" || !state.images.length) return;
      const offsets = [1, 2, 3, -1];
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
    }, 90);
  }

  async function openLightbox(index) {
    if (isGenericX810114Page() && Date.now() - state.lightboxGestureToken > 500) {
      closeHostPhotoViewer();
      return;
    }
    pauseAutoScrollForLightbox();
    state.index = index;
    const openToken = `${Date.now()}:${index}:${Math.random()}`;
    state.lightbox.dataset.openToken = openToken;
    state.lightbox.dataset.zoom = "fit";
    state.root.dataset.lightboxActive = "true";
    state.lightbox.dataset.flVideoEnded = "false";
    state.lightbox.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
    const thumbUrl = state.images[index];
    if (isVideoUrl(thumbUrl)) {
      setLightboxVideo(thumbUrl);
      state.lightbox.dataset.active = "true";
      state.root.dataset.lightboxActive = "true";
      scheduleLightboxMediaPreload(index);
      return;
    } else {
      state.lightbox.innerHTML = `${lightboxArrows()}<img alt="">`;
      const img = state.lightbox.querySelector("img");
      img.dataset.xivCanZoom = "false";
      img.addEventListener("load", () => updateLightboxZoomHint(img));
      setImageSourceWithFallback(img, thumbUrl);
      updateFavoriteButton(thumbUrl);
    }
    state.lightbox.dataset.active = "true";
    state.root.dataset.lightboxActive = "true";
    scheduleLightboxMediaPreload(index);
    const highResUrl = await resolveHighResUrl(thumbUrl);
    if (state.lightbox.dataset.active === "true" && state.index === index && state.lightbox.dataset.openToken === openToken) {
      if (isVideoUrl(highResUrl)) {
        setLightboxVideo(highResUrl);
      } else {
        let img = state.lightbox.querySelector("img");
        if (!img) {
          state.lightbox.innerHTML = `${lightboxArrows()}<img alt="">`;
          img = state.lightbox.querySelector("img");
        }
        img.dataset.xivCanZoom = "false";
        img.addEventListener("load", () => updateLightboxZoomHint(img));
        setImageSourceWithFallback(img, highResUrl);
        updateFavoriteButton(highResUrl, thumbUrl);
      }
      scheduleLightboxMediaPreload(index);
    }
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
    if (resumeAutoScroll) resumeAutoScrollAfterLightbox();
  }

  function lightboxArrows() {
    return `<button class="xiv-lightbox-fav" type="button" title="\u6536\u85cf">${heartIcon()}</button><button class="xiv-lightbox-close" type="button" title="关闭">${closeIcon()}</button><div class="xiv-lightbox-arrow" data-side="left">‹</div><div class="xiv-lightbox-arrow" data-side="right">›</div>`;
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
      video.play().catch(() => {});
      send("loadedmetadata");
    });
    ["timeupdate", "pause", "ended", "seeked", "playing"].forEach((eventName) => {
      video.addEventListener(eventName, () => send(eventName));
    });
    window.addEventListener("message", (event) => {
      const message = event.data || {};
      if (message.type !== "XIV_VIDEO_CONTROL" || message.url !== mediaUrl) return;
      send("before-" + message.action);
      if (message.action === "pause") video.pause();
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
    state.lightbox.innerHTML = lightboxArrows();
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
    state.lightbox.innerHTML = lightboxArrows();
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
    video.play().catch(() => {});
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
    const url = normalizeMediaUrl(String(message.url || ""));
    const time = Number(message.currentTime || 0);
    if (message.eventName === "ended" && state.lightbox?.dataset.active === "true") {
      state.lightbox.dataset.flVideoEnded = "true";
    }
    if (!url || !Number.isFinite(time) || time <= 0) return;
    state.videoTimeByImage.set(keyForUrl(url), time);
  }

  function showAdjacentImage(delta) {
    if (!state.images.length) return;
    let next = state.index;
    for (let step = 0; step < state.images.length; step += 1) {
      next = (next + delta + state.images.length) % state.images.length;
      if (mediaMatchesFilter(state.images[next])) break;
    }
    state.lightboxGestureToken = Date.now();
    openLightbox(next);
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
      state.lightbox.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
    } else {
      const media = state.lightbox.querySelector("img, video");
      if (!prepareActualZoomMedia(media)) {
        waitForVideoActualZoom(media);
        return;
      }
      state.lightbox.dataset.zoom = "actual";
      centerActualLightboxMedia();
    }
  }

  function onLightboxClick(event) {
    if (state.lightbox?.dataset.active !== "true") return;
    if (!state.lightbox.contains(event.target)) return;
    if (event.target?.closest?.("#xiv-lightbox video") && !isMobilePointerEvent(event)) return;
    claimEvent(event);
    if (Date.now() < state.lightboxSuppressClickUntil) return;
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
    if (event.target?.closest?.(".xiv-lightbox-fav, .xiv-lightbox-close, .xiv-lightbox-arrow")) return;
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

  function onLightboxWheel(event) {
    if (state.lightbox?.dataset.active !== "true") return;
    if (!state.lightbox.contains(event.target)) return;
    claimEvent(event);
    const now = Date.now();
    if (now - state.lastLightboxWheelAt < 220) return;
    const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (Math.abs(delta) < 4) return;
    state.lastLightboxWheelAt = now;
    showAdjacentImage(delta > 0 ? 1 : -1);
  }

  function claimEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

  function discoverNearbyPages() {
    if (isZttaotuUrl()) return;
    if (isKnownGalleryUrl()) return;
    const prefix = galleryPrefixFromUrl(location.href);
    const n = pageNumberFromUrl(location.href);
    if (!prefix || !n) return;
    const discoveryWindow = galleryDiscoveryWindow(location.href);
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
    const queuePrevKey = event.key === "," || event.key === "，" || event.code === "Comma";
    const queueNextKey = event.key === "." || event.key === "。" || event.code === "Period";
    if (!isTyping && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && (queuePrevKey || queueNextKey)) {
      claimEvent(event);
      if (event.repeat) return;
      navigateGalleryQueue(queueNextKey ? 1 : -1);
      return;
    }
    if (state.lightbox?.dataset.active === "true" && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      claimEvent(event);
      if (event.repeat) return;
      showAdjacentImage(event.key === "ArrowRight" ? 1 : -1);
      return;
    }
    if (event.key === "Escape") {
      claimEvent(event);
      if (state.lightbox?.dataset.active === "true") closeLightbox();
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
    pumpVideoPreviewQueue();
    const nearBottom = state.stage.scrollTop + state.stage.clientHeight > state.stage.scrollHeight - 1800;
    if (nearBottom) fetchRemainingPages();
  }

  function installControlApi() {
    window.__flowLensControl = {
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
        showAdjacentImage(delta >= 0 ? 1 : -1);
        return true;
      },
      loadSavedPage(url) {
        return loadSavedPageInPlace(url);
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
  ensureUi();
  maybeAutoOpenFromGalleryQueue();
})();


/* src/core/optimizer.js */
(() => {
  if (window.__flowLensUxPatch) return;
  window.__flowLensUxPatch = true;

  const SETTINGS_KEY = "flowlens-settings-v2";
  const FILTER_KEY = "flowlens-media-filter-v1";
  const KEEP_ACTIONS = new Set(["download", "auto", "prev-set", "next-set", "top", "settings", "close"]);
  const VIDEO_RE = /\.(mp4|webm|mov|m4v)(?:[?#]|$)/i;
  let mutationTimer = 0;
  let lightboxObserver = null;
  let lastSwitchDirection = "fade";
  let swipeStart = null;

  const css = `
    html.xiv-active,
    html.xiv-active body { margin: 0 !important; padding: 0 !important; background: #000 !important; overscroll-behavior: none !important; }
    #xiv-root { position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100dvh !important; max-height: 100dvh !important; overflow: hidden !important; background: #050505 !important; transform: translateZ(0); }
    #xiv-root[data-theme="light"] { background: #f4f4f1 !important; color: #141414 !important; }
    @supports not (height: 100dvh) { #xiv-root { height: 100vh !important; max-height: 100vh !important; } }
    #xiv-root::before { content: ""; position: fixed; left: 0; right: 0; top: 0; height: max(env(safe-area-inset-top, 0px), 1px); background: #050505; z-index: 2; pointer-events: none; }
    #xiv-root[data-theme="light"]::before { background: #f4f4f1; }
    #xiv-stage { inset: 0 !important; width: 100% !important; height: 100% !important; box-sizing: border-box !important; padding-top: calc(54px + env(safe-area-inset-top, 0px)) !important; padding-right: max(6px, env(safe-area-inset-right, 0px)) !important; padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px)) !important; padding-left: max(6px, env(safe-area-inset-left, 0px)) !important; background: transparent !important; }
    #xiv-topbar { top: 0 !important; padding-top: calc(8px + env(safe-area-inset-top, 0px)) !important; background: linear-gradient(to bottom, rgba(0,0,0,.9), rgba(0,0,0,.36), rgba(0,0,0,0)) !important; }
    #xiv-root[data-theme="light"] #xiv-topbar { background: linear-gradient(to bottom, rgba(244,244,241,.92), rgba(244,244,241,.45), rgba(244,244,241,0)) !important; }
    #xiv-topbar .xiv-pill { background: transparent !important; border: 0 !important; color: #fff !important; padding: 0 4px !important; box-shadow: none !important; backdrop-filter: none !important; text-shadow: 0 1px 2px rgba(0,0,0,.72), 0 0 10px rgba(0,0,0,.46) !important; }
    #xiv-topbar [data-xiv]:not([data-xiv="download"]):not([data-xiv="auto"]):not([data-xiv="prev-set"]):not([data-xiv="next-set"]):not([data-xiv="top"]):not([data-xiv="settings"]):not([data-xiv="close"]), #xiv-topbar .xiv-select[data-xiv="filter"] { display: none !important; }
    #xiv-topbar .xiv-actions { gap: 8px !important; flex-wrap: nowrap !important; }
    #xiv-root[data-lightbox-active="true"] #xiv-topbar { justify-content: flex-end !important; gap: 0 !important; padding: 8px 10px !important; pointer-events: none !important; }
    #xiv-root[data-lightbox-active="true"] #xiv-topbar .xiv-pill { display: none !important; }
    #xiv-root[data-lightbox-active="true"] #xiv-topbar .xiv-actions { max-width: calc(100vw - 20px) !important; gap: 7px !important; flex-wrap: nowrap !important; justify-content: flex-end !important; overflow: visible !important; pointer-events: auto !important; }
    #xiv-root[data-lightbox-active="true"] #xiv-topbar .xiv-btn { min-width: 38px !important; width: 38px !important; height: 38px !important; padding: 0 !important; flex: 0 0 38px !important; }
    #xiv-root[data-lightbox-active="true"] #xiv-topbar [data-xiv="prev-set"], #xiv-root[data-lightbox-active="true"] #xiv-topbar [data-xiv="next-set"], #xiv-root[data-lightbox-active="true"] #xiv-topbar [data-xiv="top"] { display: none !important; }
    html.xiv-fl-launch-hidden #xiv-launch { display: none !important; }
    .xiv-fl-filter-select { height: 34px; min-width: 108px; border-radius: 999px; border: 1px solid rgba(255,255,255,.18); background: rgba(18,18,20,.72); color: #fff; padding: 0 28px 0 12px; font: 800 13px/1 system-ui, sans-serif; }
    #xiv-root[data-theme="light"] .xiv-fl-filter-select { background: rgba(255,255,255,.86); color: #151515; border-color: rgba(0,0,0,.12); }
    .xiv-fl-stepper { display: inline-flex; align-items: center; gap: 8px; min-height: 34px; }
    .xiv-fl-stepper button { width: 34px; height: 34px; border: 1px solid rgba(255,255,255,.18); border-radius: 999px; background: rgba(18,18,20,.72); color: #fff; font: 900 18px/1 system-ui, sans-serif; cursor: pointer; }
    .xiv-fl-stepper strong { min-width: 46px; text-align: center; font: 850 13px/1 system-ui, sans-serif; }
    #xiv-root[data-theme="light"] .xiv-fl-stepper button { background: rgba(255,255,255,.86); color: #151515; border-color: rgba(0,0,0,.12); }
    #xiv-root [data-panel="settings"] small { display: none !important; }
    #xiv-lightbox img, #xiv-lightbox video, #xiv-lightbox iframe, #xiv-lightbox .xiv-video-frame { will-change: transform, opacity; backface-visibility: hidden; }
    #xiv-lightbox .xiv-fl-media-anim { animation-duration: 280ms; animation-timing-function: cubic-bezier(.22,.61,.36,1); animation-fill-mode: both; }
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
  function readSettings() { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {}; } catch { return {}; } }
  function saveSettings(patch) { const settings = { ...readSettings(), ...patch }; try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ } }
  function launchHidden() { return readSettings().launchHidden === true; }
  function applyLaunchVisibility() { document.documentElement.classList.toggle("xiv-fl-launch-hidden", launchHidden()); }
  function getStoredFilter() { const nativeSelect = document.querySelector('#xiv-root [data-xiv="filter"]'); const value = localStorage.getItem(FILTER_KEY) || (nativeSelect ? nativeSelect.value : "all") || "all"; return ["all", "image", "video"].includes(value) ? value : "all"; }
  function mediaTypeOfTile(tile) { const url = (tile && tile.dataset && tile.dataset.url) || ""; if (VIDEO_RE.test(url)) return "video"; if (tile && tile.querySelector && tile.querySelector("video, .xiv-video-mark")) return "video"; return "image"; }
  function applyFilterDom(value = getStoredFilter()) { const tiles = Array.from(document.querySelectorAll("#xiv-grid .xiv-tile")); if (!tiles.length) return; let imageCount = 0; let videoCount = 0; let visible = 0; for (const tile of tiles) { const type = mediaTypeOfTile(tile); if (type === "video") videoCount += 1; else imageCount += 1; tile.dataset.flMediaType = type; const show = value === "all" || value === type; tile.hidden = !show; tile.style.display = show ? "" : "none"; if (show) visible += 1; } const counter = document.getElementById("xiv-counter"); if (counter) { if (value === "image") counter.textContent = `图片 ${visible}/${imageCount}`; else if (value === "video") counter.textContent = `视频 ${visible}/${videoCount}`; else counter.textContent = `${tiles.length} 张`; } }
  function setStoredFilter(value) { const next = ["all", "image", "video"].includes(value) ? value : "all"; try { localStorage.setItem(FILTER_KEY, next); } catch { /* ignore */ } const nativeSelect = document.querySelector('#xiv-root [data-xiv="filter"]'); if (nativeSelect && nativeSelect.value !== next) { nativeSelect.value = next; nativeSelect.dispatchEvent(new Event("change", { bubbles: true })); } [0, 80, 180].forEach((delay) => setTimeout(() => applyFilterDom(next), delay)); syncAddonControls(); }
  function ensureToolbarCompact() { document.querySelectorAll("#xiv-topbar [data-xiv]").forEach((el) => { const show = KEEP_ACTIONS.has(el.dataset.xiv); el.hidden = !show; el.style.display = show ? "" : "none"; }); const filter = document.querySelector('#xiv-topbar .xiv-select[data-xiv="filter"]'); if (filter) { filter.hidden = true; filter.style.display = "none"; } }
  function createSettingRow(labelText, control, id) { const label = document.createElement("label"); label.className = "xiv-setting-row"; label.dataset.flAddon = id || "true"; const span = document.createElement("span"); span.textContent = labelText; label.append(span, control); return label; }
  function createStepper(id, minusAction, plusAction) { const box = document.createElement("span"); box.className = "xiv-fl-stepper"; box.dataset.flStepper = id; box.innerHTML = `<button type="button" data-fl-minus>−</button><strong data-fl-value>--</strong><button type="button" data-fl-plus>+</button>`; box.querySelector("[data-fl-minus]").addEventListener("click", (event) => { event.preventDefault(); document.querySelector(`#xiv-root [data-xiv="${minusAction}"]`)?.click(); setTimeout(refreshSteppers, 120); }); box.querySelector("[data-fl-plus]").addEventListener("click", (event) => { event.preventDefault(); document.querySelector(`#xiv-root [data-xiv="${plusAction}"]`)?.click(); setTimeout(refreshSteppers, 120); }); return box; }
  function refreshSteppers() { const settings = readSettings(); const columns = Math.max(2, Math.min(8, Number(settings.columns || 3))); const speed = Math.max(1, Math.min(10, Number(settings.autoScrollSpeed || 3))); const colValue = document.querySelector('[data-fl-stepper="columns"] [data-fl-value]'); const speedValue = document.querySelector('[data-fl-stepper="speed"] [data-fl-value]'); if (colValue) colValue.textContent = `${columns}列`; if (speedValue) speedValue.textContent = `${speed}档`; }
  function ensureSettingsAddons() { const panel = document.querySelector('#xiv-root [data-panel="settings"]'); if (!panel) return; panel.querySelectorAll("small").forEach((el) => el.remove()); if (panel.querySelector('[data-fl-addon="launch-hidden"]')) { refreshSteppers(); return; } const themeRow = panel.querySelector('[data-setting="theme"]')?.closest?.(".xiv-setting-row"); const insertBefore = themeRow || null; const columnsRow = createSettingRow("图片流列数", createStepper("columns", "less", "more"), "columns"); const speedRow = createSettingRow("自动滚动速度", createStepper("speed", "slower", "faster"), "speed"); const hideInput = document.createElement("input"); hideInput.type = "checkbox"; hideInput.dataset.flSetting = "launchHidden"; hideInput.checked = launchHidden(); hideInput.addEventListener("change", () => { saveSettings({ launchHidden: hideInput.checked }); applyLaunchVisibility(); syncAddonControls(); }); const hideRow = createSettingRow("隐藏入口图标（用 G 或 Alt+F 打开）", hideInput, "launch-hidden"); const filterSelect = document.createElement("select"); filterSelect.className = "xiv-fl-filter-select"; filterSelect.dataset.flSetting = "mediaFilter"; filterSelect.innerHTML = '<option value="all">全部</option><option value="image">只看图片</option><option value="video">只看视频</option>'; filterSelect.value = getStoredFilter(); filterSelect.addEventListener("change", () => setStoredFilter(filterSelect.value)); const filterRow = createSettingRow("图片流筛选", filterSelect, "media-filter"); panel.insertBefore(columnsRow, insertBefore); panel.insertBefore(speedRow, insertBefore); panel.insertBefore(hideRow, insertBefore); panel.insertBefore(filterRow, insertBefore); refreshSteppers(); }
  function syncAddonControls() { const hideInput = document.querySelector('[data-fl-setting="launchHidden"]'); if (hideInput) hideInput.checked = launchHidden(); const filterSelect = document.querySelector('[data-fl-setting="mediaFilter"]'); if (filterSelect) filterSelect.value = getStoredFilter(); refreshSteppers(); }
  function isTypingTarget(target) { return target && target.matches && target.matches("input, textarea, select, [contenteditable='true'], [contenteditable='']"); }
  function toggleViewerByPatch() { const root = document.getElementById("xiv-root"); if (root && root.dataset.active === "true") { const close = document.querySelector('#xiv-root [data-xiv="close"]'); if (close) close.click(); return; } const launch = document.getElementById("xiv-launch"); if (launch) launch.click(); }
  function closePanelsOnOutside(event) { const settingsPanel = document.querySelector('#xiv-root [data-panel="settings"]'); const diagnosticsPanel = document.querySelector('#xiv-root [data-panel="diagnostics"]'); if ((!settingsPanel || settingsPanel.dataset.open !== "true") && (!diagnosticsPanel || diagnosticsPanel.dataset.open !== "true")) return; if (event.target && event.target.closest && event.target.closest('[data-panel="settings"], [data-panel="diagnostics"], [data-xiv="settings"], [data-xiv="diag"]')) return; if (settingsPanel) settingsPanel.dataset.open = "false"; if (diagnosticsPanel) diagnosticsPanel.dataset.open = "false"; }
  function bindShortcuts() { document.addEventListener("pointerdown", closePanelsOnOutside, true); document.addEventListener("keydown", (event) => { if (isTypingTarget(event.target)) return; if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "f") { event.preventDefault(); event.stopPropagation(); toggleViewerByPatch(); } const lightbox = document.getElementById("xiv-lightbox"); if (lightbox && lightbox.dataset.active === "true") { if (event.key === "ArrowRight") lastSwitchDirection = "next-x"; else if (event.key === "ArrowLeft") lastSwitchDirection = "prev-x"; } }, true); document.addEventListener("wheel", (event) => { const lightbox = document.getElementById("xiv-lightbox"); if (!lightbox || lightbox.dataset.active !== "true" || !lightbox.contains(event.target)) return; const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX; if (Math.abs(delta) > 4) lastSwitchDirection = delta > 0 ? "next-y" : "prev-y"; }, true); document.addEventListener("pointerdown", (event) => { const lightbox = document.getElementById("xiv-lightbox"); if (!lightbox || lightbox.dataset.active !== "true" || !lightbox.contains(event.target)) return; if (event.target && event.target.closest && event.target.closest(".xiv-lightbox-fav, .xiv-lightbox-close, .xiv-lightbox-arrow")) return; swipeStart = { x: event.clientX, y: event.clientY }; }, true); document.addEventListener("pointerup", (event) => { if (!swipeStart) return; const dx = event.clientX - swipeStart.x; const dy = event.clientY - swipeStart.y; swipeStart = null; if (Math.max(Math.abs(dx), Math.abs(dy)) < 28) return; lastSwitchDirection = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? "next-x" : "prev-x") : (dy < 0 ? "next-y" : "prev-y"); }, true); }
  function animateLightboxMedia() { const lightbox = document.getElementById("xiv-lightbox"); if (!lightbox || lightbox.dataset.active !== "true") return; const media = lightbox.querySelector(".xiv-video-frame, img, video, iframe"); if (!media) return; lightbox.dataset.flDir = lastSwitchDirection || "fade"; media.classList.remove("xiv-fl-media-anim"); void media.offsetWidth; media.classList.add("xiv-fl-media-anim"); setTimeout(() => media.classList.remove("xiv-fl-media-anim"), 340); lastSwitchDirection = "fade"; }
  function setImportantStyle(el, key, value) { if (el) el.style.setProperty(key, value, "important"); }
  function clearStyle(el, keys) { if (!el) return; keys.forEach((key) => el.style.removeProperty(key)); }
  function isTouchLikeDevice() { return matchMedia("(pointer: coarse)").matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent); }
  function applyLightboxToolbarLayout(active) {
    const topbar = document.getElementById("xiv-topbar");
    const pill = document.querySelector("#xiv-topbar .xiv-pill");
    const actions = document.querySelector("#xiv-topbar .xiv-actions");
    const buttons = document.querySelectorAll("#xiv-topbar .xiv-btn");
    const hidden = document.querySelectorAll('#xiv-topbar [data-xiv="prev-set"], #xiv-topbar [data-xiv="next-set"], #xiv-topbar [data-xiv="top"]');
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
    if (root && lightbox) root.dataset.lightboxActive = active ? "true" : "false";
    applyLightboxToolbarLayout(active);
  }
  function observeLightbox() { const lightbox = document.getElementById("xiv-lightbox"); if (!lightbox || lightbox.dataset.flObserved === "true") return; lightbox.dataset.flObserved = "true"; if (lightboxObserver && lightboxObserver.disconnect) lightboxObserver.disconnect(); lightboxObserver = new MutationObserver(() => requestAnimationFrame(() => { syncLightboxState(); animateLightboxMedia(); })); lightboxObserver.observe(lightbox, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "data-active"] }); }
  function applyAll() { injectStyle(); applyLaunchVisibility(); ensureToolbarCompact(); ensureSettingsAddons(); syncAddonControls(); observeLightbox(); syncLightboxState(); applyFilterDom(getStoredFilter()); }
  function scheduleApplyAll() { clearTimeout(mutationTimer); mutationTimer = setTimeout(applyAll, 80); }

  injectStyle();
  bindShortcuts();
  applyAll();
  new MutationObserver(scheduleApplyAll).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("resize", () => applyFilterDom(getStoredFilter()), { passive: true });
})();


/* src/patches/fixes.js */
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
    #xiv-root, #xiv-stage, #xiv-grid, .xiv-masonry-column {
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
    const root = document.getElementById("xiv-root");
    if (root?.dataset.active === "true") return;
    document.documentElement.classList.remove("xiv-active");
    for (const node of [document.documentElement, document.body]) {
      if (!node) continue;
      if (node.style.overflow === "hidden") node.style.overflow = "";
      if (node.style.pointerEvents === "none") node.style.pointerEvents = "";
    }
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
    const duplicateCount = dedupeTilesDom(tiles);
    let imageCount = 0;
    let videoCount = 0;
    let visible = 0;
    for (const tile of tiles) {
      const duplicate = tile.dataset.flDuplicate === "true";
      const type = mediaTypeOfTile(tile);
      if (!duplicate) {
        if (type === "video") videoCount += 1;
        else imageCount += 1;
      }
      tile.dataset.flMediaType = type;
      const show = !duplicate && (value === "all" || value === type);
      tile.hidden = !show;
      tile.style.display = show ? "" : "none";
      if (show) visible += 1;
    }
    const counter = document.getElementById("xiv-counter");
    if (counter) {
      const total = imageCount + videoCount;
      const dedupeText = duplicateCount ? `，去重 ${duplicateCount}` : "";
      if (value === "image") counter.textContent = `图片 ${visible}/${imageCount}${dedupeText}`;
      else if (value === "video") counter.textContent = `视频 ${visible}/${videoCount}${dedupeText}`;
      else counter.textContent = `${total} 个${dedupeText}`;
    }
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
    if (important || viewerIsActive()) scheduleApplyAll();
    else schedulePageLockRecovery();
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-active", "class", "style"] });
  window.addEventListener("resize", () => applyFilterDom(getStoredFilter()), { passive: true });
  window.setInterval(cleanupPageLockIfClosed, 1500);
})();


/* src/patches/product.js */
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

  function settings() { return readJson(SETTINGS_KEY, {}); }

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
            <tr><td><kbd>,</kbd> / <kbd>.</kbd></td><td>切换上一组 / 下一组</td></tr>
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
    const lb = lightbox();
    if (!lb || lb.dataset.active !== "true") {
      stopLightboxAuto();
      return;
    }
    let button = lb.querySelector(".xiv-fl-lightbox-auto");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "xiv-fl-lightbox-auto";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        toggleLightboxAuto();
      });
      lb.appendChild(button);
    }
    syncLightboxAutoButton();
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
      event.preventDefault(); event.stopPropagation(); toggleLightboxAuto();
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
    rootObserver.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-active", "src", "style", "hidden", "class"] });
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


/* src/patches/ui-cleanup.js */
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


/* src/patches/lightbox-stable.js */
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


/* src/patches/settings-compact.js */
(() => {
  if (window.__flowLensSettingsCompactV2) return;
  window.__flowLensSettingsCompactV2 = true;

  const SETTINGS_KEY = "flowlens-settings-v2";
  const SPEED_KEY = "flowlens-lightbox-slideshow-delay-v1";
  const SPEEDS = [800, 1200, 1800, 2400, 3200];
  const DEFAULT_DELAY = 1200;
  let timer = 0;

  const css = `
    #xiv-root [data-panel="settings"],
    #xiv-root .xiv-settings,
    #xiv-root .xiv-settings-panel,
    #xiv-root .xiv-panel:has(.xiv-setting-row) {
      width: min(420px, calc(100vw - 24px)) !important;
      max-width: min(420px, calc(100vw - 24px)) !important;
      max-height: min(76vh, 640px) !important;
      overflow: auto !important;
      padding: 16px !important;
      border-radius: 18px !important;
      font-size: 14px !important;
    }
    #xiv-root [data-panel="settings"] h3,
    #xiv-root .xiv-settings h3,
    #xiv-root .xiv-settings-panel h3,
    #xiv-root .xiv-panel:has(.xiv-setting-row) h3 {
      font-size: 22px !important;
      margin: 0 0 12px !important;
      line-height: 1.15 !important;
    }
    #xiv-root .xiv-setting-row {
      min-height: 42px !important;
      padding: 10px 0 !important;
      gap: 12px !important;
      font-size: 14px !important;
      line-height: 1.25 !important;
    }
    #xiv-root .xiv-setting-row input[type="checkbox"] {
      width: 22px !important;
      height: 22px !important;
      flex: 0 0 auto !important;
    }
    #xiv-root .xiv-setting-row select {
      min-width: 138px !important;
      height: 40px !important;
      border-radius: 999px !important;
      padding: 0 34px 0 14px !important;
      font-size: 14px !important;
      font-weight: 850 !important;
    }
    #xiv-root .xiv-setting-row button {
      width: 42px !important;
      height: 42px !important;
      min-width: 42px !important;
      border-radius: 999px !important;
      font-size: 22px !important;
      line-height: 1 !important;
    }
    #xiv-root .xiv-setting-row strong,
    #xiv-root .xiv-setting-row b {
      min-width: 52px !important;
      text-align: center !important;
      font-size: 15px !important;
    }
    .xiv-fl-compact-section {
      margin: 12px 0 4px !important;
      color: #7a8190 !important;
      font-size: 12px !important;
      font-weight: 950 !important;
      letter-spacing: .06em !important;
    }
    #xiv-root[data-theme="dark"] .xiv-fl-compact-section { color: #aab1c0 !important; }
    .xiv-fl-speed-row .xiv-fl-speed-control {
      display: inline-flex !important;
      align-items: center !important;
      gap: 10px !important;
      flex: 0 0 auto !important;
    }
    .xiv-fl-speed-row .xiv-fl-speed-value {
      min-width: 72px !important;
      text-align: center !important;
      font-size: 14px !important;
      font-weight: 900 !important;
      white-space: nowrap !important;
    }
    .xiv-fl-shortcuts-mini {
      margin-top: 10px !important;
      padding: 10px !important;
      border-radius: 14px !important;
      background: rgba(0,0,0,.045) !important;
      display: grid !important;
      grid-template-columns: 1fr 1fr !important;
      gap: 7px 8px !important;
      font-size: 12px !important;
      line-height: 1.3 !important;
    }
    #xiv-root[data-theme="dark"] .xiv-fl-shortcuts-mini { background: rgba(255,255,255,.08) !important; }
    .xiv-fl-shortcuts-mini kbd {
      display: inline-block !important;
      min-width: 28px !important;
      padding: 3px 6px !important;
      margin-right: 6px !important;
      border-radius: 7px !important;
      background: rgba(0,0,0,.1) !important;
      font-size: 11px !important;
      font-weight: 950 !important;
      text-align: center !important;
    }
    #xiv-root[data-theme="dark"] .xiv-fl-shortcuts-mini kbd { background: rgba(255,255,255,.14) !important; }
    @media (max-width: 560px) {
      #xiv-root [data-panel="settings"],
      #xiv-root .xiv-settings,
      #xiv-root .xiv-settings-panel,
      #xiv-root .xiv-panel:has(.xiv-setting-row) {
        position: fixed !important;
        top: max(58px, calc(env(safe-area-inset-top, 0px) + 50px)) !important;
        right: max(8px, env(safe-area-inset-right, 0px)) !important;
        left: auto !important;
        bottom: auto !important;
        width: min(356px, calc(100vw - 16px)) !important;
        max-width: calc(100vw - 16px) !important;
        height: auto !important;
        max-height: min(68vh, calc(100vh - 74px - env(safe-area-inset-bottom, 0px))) !important;
        padding: 10px !important;
      }
      .xiv-fl-shortcuts-mini { grid-template-columns: 1fr !important; }
    }
  `;

  function injectStyle() {
    if (document.getElementById("xiv-fl-settings-compact-v2-style")) return;
    const style = document.createElement("style");
    style.id = "xiv-fl-settings-compact-v2-style";
    style.textContent = css;
    document.documentElement.appendChild(style);
  }

  function readSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {}; } catch { return {}; }
  }

  function writeSettings(patch) {
    const next = { ...readSettings(), ...patch };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    try { chrome?.storage?.local?.set?.({ [SETTINGS_KEY]: next }); } catch {}
    try { window.__flowLensSyncGlobalSettings?.(); } catch {}
    return next;
  }

  function readGlobalSpeed() {
    const settings = readSettings();
    const stored = Number(settings.lightboxAutoDelay || 0);
    if (SPEEDS.includes(stored)) return stored;
    try {
      const legacy = Number(localStorage.getItem(SPEED_KEY) || 0);
      if (SPEEDS.includes(legacy)) return legacy;
    } catch {}
    return DEFAULT_DELAY;
  }

  function writeGlobalSpeed(value) {
    writeSettings({ lightboxAutoDelay: value });
    try { localStorage.setItem(SPEED_KEY, String(value)); } catch {}
  }

  function nearestSpeed(value) {
    const raw = Number(value || DEFAULT_DELAY);
    return SPEEDS.reduce((best, item) => Math.abs(item - raw) < Math.abs(best - raw) ? item : best, SPEEDS[0]);
  }

  function speedLabel(ms) {
    if (ms <= 800) return "极速";
    if (ms <= 1200) return "默认";
    if (ms <= 1800) return "较快";
    if (ms <= 2400) return "普通";
    return "慢速";
  }

  function currentSpeed() {
    return nearestSpeed(readGlobalSpeed());
  }

  function updateSpeedLabel() {
    const node = document.querySelector(".xiv-fl-speed-value");
    if (!node) return;
    const ms = currentSpeed();
    node.textContent = `${speedLabel(ms)} ${Math.round(ms / 100) / 10}秒`;
  }

  function changeSpeed(delta) {
    const ms = currentSpeed();
    const index = Math.max(0, SPEEDS.indexOf(ms));
    const next = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, index + delta))];
    writeGlobalSpeed(next);
    updateSpeedLabel();
    const status = document.getElementById("xiv-status");
    if (status) status.textContent = `大图切换速度：${speedLabel(next)} ${Math.round(next / 100) / 10}秒`;
  }

  function findSettingsPanel() {
    const candidates = [
      ...document.querySelectorAll('#xiv-root [data-panel="settings"], #xiv-root .xiv-settings, #xiv-root .xiv-settings-panel, #xiv-root .xiv-panel')
    ];
    return candidates.find((node) => /瀑光设置|图片流列数|自动滚动速度|图片流筛选|主题/.test(node.textContent || "")) || null;
  }

  function makeSection(text) {
    const node = document.createElement("div");
    node.className = "xiv-fl-compact-section";
    node.dataset.flCompact = "true";
    node.textContent = text;
    return node;
  }

  function makeSpeedRow() {
    const row = document.createElement("div");
    row.className = "xiv-setting-row xiv-fl-speed-row";
    row.dataset.flCompact = "true";
    row.innerHTML = `
      <span>大图切换速度</span>
      <span class="xiv-fl-speed-control">
        <button type="button" data-fl-speed-slower title="变慢">−</button>
        <span class="xiv-fl-speed-value">适中 2.6秒</span>
        <button type="button" data-fl-speed-faster title="变快">+</button>
      </span>`;
    row.querySelector("[data-fl-speed-slower]").addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      changeSpeed(1);
    });
    row.querySelector("[data-fl-speed-faster]").addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      changeSpeed(-1);
    });
    return row;
  }

  function makeShortcuts() {
    const node = document.createElement("div");
    node.className = "xiv-fl-shortcuts-mini";
    node.dataset.flCompact = "true";
    node.innerHTML = `
      <span><kbd>G</kbd>开关图片流</span>
      <span><kbd>Esc</kbd>退出/关闭</span>
      <span><kbd>1/2/3</kbd>全部/图/视频</span>
      <span><kbd>V</kbd>循环筛选</span>
      <span><kbd>A</kbd>自动滚动</span>
      <span><kbd>P</kbd>大图自动切换</span>
      <span><kbd>,/.</kbd>上一组/下一组</span>
      <span><kbd>S</kbd>选择模式</span>
      <span><kbd>Shift+D</kbd>下载已选</span>`;
    return node;
  }

  function apply() {
    injectStyle();
    const panel = findSettingsPanel();
    if (!panel) return;
    panel.querySelectorAll('[data-fl-compact="true"]').forEach((node) => node.remove());
    const rows = [...panel.querySelectorAll('.xiv-setting-row')];
    const title = panel.querySelector('h3, .xiv-panel-title');
    const firstRow = rows[0];
    if (firstRow) firstRow.before(makeSection("基础显示"));
    const filterRow = rows.find((row) => /图片流筛选|主题/.test(row.textContent || ""));
    if (filterRow) filterRow.before(makeSection("浏览控制"));
    const themeRow = rows.find((row) => /主题/.test(row.textContent || ""));
    const speedRow = makeSpeedRow();
    if (themeRow) themeRow.before(speedRow);
    else panel.appendChild(speedRow);
    panel.appendChild(makeSection("快捷键"));
    panel.appendChild(makeShortcuts());
    updateSpeedLabel();
    if (title) title.textContent = "瀑光设置";
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(apply, 80);
  }

  injectStyle();
  schedule();
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "data-active", "data-open"] });
})();


/* src/patches/zhihu.js */
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


/* src/patches/zhihu-dedupe.js */
(() => {
  if (window.__flowLensZhihuDedupe) return;
  window.__flowLensZhihuDedupe = true;

  const isZhihuPage = () => /(^|\.)zhihu\.com$/i.test(location.hostname);
  if (!isZhihuPage()) return;

  let timer = 0;
  let observedRoot = null;
  let rootObserver = null;
  let bootstrapObserver = null;

  function mediaKey(raw) {
    if (!raw) return "";
    try {
      const url = new URL(String(raw).replace(/&amp;/g, "&"), location.href);
      const host = url.hostname.replace(/^i\d+\./i, "").toLowerCase();
      const path = decodeURIComponent(url.pathname || "").toLowerCase();
      const zhihu = path.match(/(?:^|\/)(v2-[a-f0-9]{16,})(?:_[^/.]+)?\.(?:jpe?g|png|webp|gif)/i);
      if (zhihu) return `zhimg:${zhihu[1].toLowerCase()}`;
      return `${host}${path.replace(/([_-])(?:small|middle|large|hd|origin|thumb|thumbnail|720w|1080w|1200w)(?=\.)/gi, "")}`;
    } catch {
      return String(raw).split(/[?#]/)[0].toLowerCase();
    }
  }

  function sourceOf(tile) {
    const media = tile.querySelector("img, video");
    if (!media) return "";
    if (media.tagName === "VIDEO") return media.currentSrc || media.src || media.poster || media.querySelector("source[src]")?.src || "";
    return media.currentSrc || media.src || media.getAttribute("data-original") || media.getAttribute("data-src") || "";
  }

  function dedupe() {
    const root = document.getElementById("xiv-root");
    if (!root) return;
    if (!document.getElementById("flowlens-zhihu-dedupe-style")) {
      const style = document.createElement("style");
      style.id = "flowlens-zhihu-dedupe-style";
      style.textContent = "#xiv-root .fl-dup-hidden{display:none!important}";
      document.documentElement.appendChild(style);
    }

    const seen = new Set();
    let hidden = 0;
    for (const tile of root.querySelectorAll(".xiv-tile,.xiv-card,[data-xiv-media]")) {
      const key = mediaKey(sourceOf(tile));
      if (!key) continue;
      const duplicate = seen.has(key);
      tile.classList.toggle("fl-dup-hidden", duplicate);
      if (duplicate) hidden += 1;
      else seen.add(key);
    }
    root.dataset.zhihuDedupeHidden = String(hidden);
  }

  function schedule() {
    clearTimeout(timer);
    timer = window.setTimeout(dedupe, 180);
  }

  function observeRoot() {
    const root = document.getElementById("xiv-root");
    if (!root || root === observedRoot) return;
    rootObserver?.disconnect();
    observedRoot = root;
    rootObserver = new MutationObserver(schedule);
    rootObserver.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "poster"] });
    bootstrapObserver?.disconnect();
    bootstrapObserver = null;
    schedule();
  }

  bootstrapObserver = new MutationObserver(observeRoot);
  bootstrapObserver.observe(document.documentElement, { childList: true, subtree: true });
  observeRoot();
})();


/* src/patches/topfix.js */
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


/* src/patches/media-sync.js */
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
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {}; } catch { return {}; }
  }

  function writeSettings(patch) {
    const next = { ...readSettings(), ...patch };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch {}
    try { chrome?.storage?.local?.set?.({ [SETTINGS_KEY]: next }); } catch {}
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
      #xiv-root .fl-version-row { display: flex; align-items: center; justify-content: space-between; min-height: 30px; padding: 0 0 10px; margin: -4px 0 4px; border-bottom: 1px solid rgba(0,0,0,.08); color: rgba(0,0,0,.58); font: 750 13px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      #xiv-root[data-theme="dark"] .fl-version-row, #xiv-root:not([data-theme="light"]) .fl-version-row { border-bottom-color: rgba(255,255,255,.12); color: rgba(255,255,255,.66); }
      #xiv-root .fl-version-row strong { color: inherit; font-weight: 900; }
      #xiv-root .fl-slideshow-speed { min-width: 120px; }
      #xiv-root .xiv-lightbox-slideshow { position: fixed; right: 118px; top: 18px; z-index: 2147483647; width: 42px; height: 42px; border-radius: 999px; border: 1px solid rgba(255,255,255,.26); background: radial-gradient(circle at 32% 24%, rgba(255,255,255,.22), rgba(18,18,20,.72)); color: #fff; display: none; place-items: center; pointer-events: auto; cursor: pointer; padding: 0; box-shadow: 0 12px 30px rgba(0,0,0,.36), inset 0 1px 0 rgba(255,255,255,.18); backdrop-filter: blur(12px); }
      #xiv-root[data-fl-lightbox="true"] .xiv-lightbox-slideshow { display: grid; }
      #xiv-root .xiv-lightbox-slideshow[data-active="true"] { color: #111; background: radial-gradient(circle at 32% 24%, rgba(255,255,255,.95), rgba(255,255,255,.76)); border-color: rgba(255,255,255,.7); }
      #xiv-root .xiv-lightbox-slideshow svg { width: 20px; height: 20px; display: block; }
      @media (max-width: 820px) {
        #xiv-root .xiv-panel[data-panel="settings"] { position: fixed !important; top: max(54px, calc(env(safe-area-inset-top, 0px) + 48px)) !important; right: max(8px, env(safe-area-inset-right, 0px)) !important; left: auto !important; bottom: auto !important; width: min(356px, calc(100vw - 16px)) !important; max-width: calc(100vw - 16px) !important; height: auto !important; max-height: min(68vh, calc(100vh - 74px - env(safe-area-inset-bottom, 0px))) !important; padding: 10px !important; border-radius: 12px !important; overflow-y: auto !important; overscroll-behavior: contain !important; }
        #xiv-root .xiv-panel[data-panel="settings"] h3 { font-size: 18px !important; margin: 0 0 6px !important; line-height: 1.2 !important; }
        #xiv-root .xiv-panel[data-panel="settings"] .xiv-setting-row { min-height: 42px !important; padding: 7px 0 !important; gap: 10px !important; font-size: 14px !important; line-height: 1.25 !important; }
        #xiv-root .xiv-panel[data-panel="settings"] .xiv-setting-row > span { font-size: 14px !important; font-weight: 800 !important; }
        #xiv-root .xiv-panel[data-panel="settings"] input[type="checkbox"] { width: 24px !important; height: 24px !important; }
        #xiv-root .xiv-panel[data-panel="settings"] .xiv-select { min-height: 38px !important; padding: 0 32px 0 12px !important; border-radius: 19px !important; font-size: 14px !important; font-weight: 850 !important; }
        #xiv-root .xiv-panel[data-panel="settings"] button { width: 40px !important; height: 40px !important; min-width: 40px !important; }
        #xiv-root .xiv-panel[data-panel="settings"] small { display: block !important; margin-top: 6px !important; font-size: 11px !important; line-height: 1.35 !important; opacity: .66 !important; }
        #xiv-root .fl-version-row { min-height: 26px !important; padding-bottom: 8px !important; margin-bottom: 4px !important; font-size: 12px !important; }
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
    button.innerHTML = filterIcon(currentMode);
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
    versionRow.innerHTML = `<span>瀑光版本</span><strong>v${VERSION}</strong>`;

    let speedRow = panel.querySelector(".fl-slideshow-speed-row");
    if (!speedRow) {
      speedRow = document.createElement("label");
      speedRow.className = "xiv-setting-row fl-slideshow-speed-row";
      speedRow.innerHTML = `<span>大图切换速度</span><select class="xiv-select fl-slideshow-speed"></select>`;
      const autoScrollRow = [...panel.querySelectorAll(".xiv-setting-row")].find((row) => /自动滚动速度/.test(row.textContent || ""));
      if (autoScrollRow?.nextSibling) panel.insertBefore(speedRow, autoScrollRow.nextSibling);
      else panel.appendChild(speedRow);
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
    app.dataset.flLightbox = open ? "true" : "false";
    if (nativeSlideshowOwnsButton()) {
      if (slideshowActive) stopSlideshow(false);
      return;
    }
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
    if (app) app.dataset.flLightbox = open ? "true" : "false";
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


/* src/patches/slideshow-native.js */
(() => {
  if (window.__flowLensSlideshowNativePatch) return;
  window.__flowLensSlideshowNativePatch = true;

  const VERSION = window.__FLOWLENS_VERSION__ || "dev";
  const SPEED_KEY = "flowlens-lightbox-slideshow-delay-v1";
  const SETTINGS_KEY = "flowlens-settings-v2";
  const SPEED_OPTIONS = [800, 1200, 1800, 2400, 3200];
  const DEFAULT_DELAY = 1200;
  function readSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {}; } catch { return {}; }
  }
  function writeSettings(patch) {
    const next = { ...readSettings(), ...patch };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch {}
    try { chrome?.storage?.local?.set?.({ [SETTINGS_KEY]: next }); } catch {}
    try { window.__flowLensSyncGlobalSettings?.(); } catch {}
    return next;
  }
  function readDelay() {
    const settings = readSettings();
    const stored = Number(settings.lightboxAutoDelay || 0);
    if (SPEED_OPTIONS.includes(stored)) return stored;
    try {
      const legacy = Number(localStorage.getItem(SPEED_KEY) || 0);
      if (SPEED_OPTIONS.includes(legacy)) return legacy;
    } catch {}
    return DEFAULT_DELAY;
  }
  function writeDelay(value) {
    writeSettings({ lightboxAutoDelay: value });
    try { localStorage.setItem(SPEED_KEY, String(value)); } catch {}
  }
  let delay = readDelay();
  if (!SPEED_OPTIONS.includes(delay)) delay = DEFAULT_DELAY;
  let timer = 0;
  let active = false;
  let bootTimer = 0;

  function root() { return document.getElementById("xiv-root"); }
  function lightbox() { return root()?.querySelector("#xiv-lightbox"); }
  function isOpen() { return lightbox()?.dataset.active === "true"; }
  function coreApi() { return window.__flowLensControl || null; }
  function currentVideoElement() { return lightbox()?.querySelector("video") || null; }
  function currentVideoFrame() { return lightbox()?.querySelector(".xiv-video-frame[data-media-url], iframe[data-media-url]") || null; }
  function zoomPaused() { return lightbox()?.dataset.zoom === "actual"; }
  function videoStillPlaying() {
    const video = currentVideoElement();
    if (video) {
      const duration = Number(video.duration || 0);
      if (!video.ended && (!Number.isFinite(duration) || duration <= 0 || video.currentTime < duration - 0.35)) {
        video.play?.().catch?.(() => {});
        if (video.dataset.flSlideEndedBound !== VERSION) {
          video.dataset.flSlideEndedBound = VERSION;
          video.addEventListener("ended", () => {
            if (active && isOpen()) setTimeout(nativeNext, 120);
          });
        }
        return true;
      }
      return false;
    }
    const frame = currentVideoFrame();
    if (frame && lightbox()?.dataset.flVideoEnded !== "true") return true;
    return false;
  }

  function nativeNext() {
    if (!isOpen()) {
      stop(false);
      return;
    }
    if (zoomPaused()) {
      syncButton();
      return;
    }
    if (videoStillPlaying()) {
      syncButton();
      return;
    }
    if (coreApi()?.showAdjacent?.(1)) return;
    const box = lightbox();
    const arrow = box?.querySelector('.xiv-lightbox-arrow[data-side="right"]');
    if (arrow) {
      arrow.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      return;
    }
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", code: "ArrowRight", bubbles: true, cancelable: true }));
  }

  function restart() {
    clearInterval(timer);
    timer = setInterval(nativeNext, delay);
    syncButton();
  }
  function start() {
    if (active) return;
    active = true;
    restart();
  }
  function stop(update = true) {
    active = false;
    clearInterval(timer);
    timer = 0;
    if (update) syncButton();
  }
  function toggle() { active ? stop() : start(); }
  function icon() {
    return active
      ? '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="5" width="3.8" height="14" rx="1.2"/><rect x="13.2" y="5" width="3.8" height="14" rx="1.2"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.8v12.4c0 .8.9 1.3 1.6.9l9.2-6.2c.6-.4.6-1.4 0-1.8L9.6 4.9C8.9 4.5 8 5 8 5.8Z"/></svg>';
  }
  function button() { return root()?.querySelector(".xiv-lightbox-slideshow"); }
  function syncButton() {
    const app = root();
    const btn = button();
    if (!app || !btn) return;
    const open = coreApi()?.isLightboxOpen?.() ?? isOpen();
    app.dataset.flLightbox = open ? "true" : "false";
    if (!open) {
      stop(false);
      return;
    }
    const title = active
      ? zoomPaused()
        ? "1:1 查看中，自动切换已暂停"
        : videoStillPlaying()
          ? "等待当前视频播放完"
          : "暂停大图自动切换"
      : "开始大图自动切换";
    const nextIcon = icon();
    btn.dataset.active = active ? "true" : "false";
    if (btn.dataset.flIconState !== String(active)) {
      btn.innerHTML = nextIcon;
      btn.dataset.flIconState = String(active);
    }
    btn.title = title;
    btn.setAttribute("aria-label", title);
  }
  function rebindButton() {
    const old = button();
    if (!old || old.dataset.flNativeBound === VERSION) return;
    const fresh = old.cloneNode(false);
    fresh.className = old.className;
    fresh.type = "button";
    fresh.dataset.flNativeBound = VERSION;
    fresh.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    }, true);
    fresh.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      toggle();
    }, true);
    old.replaceWith(fresh);
    syncButton();
  }
  function speedText(ms) {
    if (ms <= 800) return "极速 0.8秒";
    if (ms <= 1200) return "默认 1.2秒";
    if (ms <= 1800) return "较快 1.8秒";
    if (ms <= 2400) return "普通 2.4秒";
    return "慢速 3.2秒";
  }
  function syncSettings() {
    const panel = root()?.querySelector('[data-panel="settings"]');
    if (!panel) return;
    const version = panel.querySelector(".fl-version-row strong");
    if (version) version.textContent = `v${VERSION}`;
    const select = panel.querySelector(".fl-slideshow-speed");
    if (select && select.dataset.flNativeBound !== VERSION) {
      select.dataset.flNativeBound = VERSION;
      select.addEventListener("change", () => {
        const value = Number(select.value || DEFAULT_DELAY);
        delay = SPEED_OPTIONS.includes(value) ? value : DEFAULT_DELAY;
        writeDelay(delay);
        if (active) restart();
      });
    }
    if (select) {
      select.value = String(delay);
      const option = [...select.options].find((item) => Number(item.value) === delay);
      if (option) option.textContent = speedText(delay);
    }
  }
  function tick() {
    rebindButton();
    syncButton();
    syncSettings();
  }
  function boot() {
    tick();
    clearTimeout(bootTimer);
    if (!root()) bootTimer = setTimeout(boot, 500);
  }
  document.addEventListener("click", () => setTimeout(tick, 120), true);
  document.addEventListener("keydown", () => setTimeout(tick, 120), true);
  document.addEventListener("fullscreenchange", tick, true);
  window.addEventListener("message", (event) => {
    const message = event.data || {};
    if (message.type === "XIV_VIDEO_TIME" && message.eventName === "ended" && active && isOpen()) {
      lightbox().dataset.flVideoEnded = "true";
      setTimeout(nativeNext, 120);
    }
  });
  setInterval(tick, 1200);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();


/* src/patches/page-bookmarks.js */
(() => {
  if (window.__flowLensPageBookmarksPatch) return;
  window.__flowLensPageBookmarksPatch = true;

  const KEY = "flowlens-page-bookmarks-v1";
  const SYNC_KEY = "flowlens-page-bookmarks-sync-v1";
  const REMOTE_FILE = "flowlens-bookmarks.json";
  const MAX_ITEMS = 300;
  const MIN_PULL_MS = 120000;
  const AUTO_PULL_MS = 600000;
  const MIN_PUSH_MS = 120000;
  const PUSH_DEBOUNCE_MS = 10000;
  const RATE_BACKOFF_MS = 3600000;
  const SAVE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4.5h12a1 1 0 0 1 1 1v15l-7-4-7 4v-15a1 1 0 0 1 1-1Z"/></svg>';
  const LIST_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h11M8 12h11M8 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/></svg>';

  let cache = null;
  let syncConfig = null;
  let syncBusy = false;
  let syncTimer = 0;
  let pushTimer = 0;
  let lastPullAt = 0;
  let lastPushAt = 0;
  let lastSyncError = "";
  let rateLimitedUntil = 0;

  const root = () => document.getElementById("xiv-root");
  const actions = () => root()?.querySelector("#xiv-topbar .xiv-actions") || null;
  const safeJson = (text, fallback) => { try { return JSON.parse(text || "") || fallback; } catch { return fallback; } };
  function status(text) {
    const node = document.getElementById("xiv-status");
    if (node) node.textContent = text;
    const syncStatus = root()?.querySelector(".fl-safe-sync-status");
    if (syncStatus && text) syncStatus.textContent = text;
  }
  function normalizeUrl(url = location.href) {
    try { const u = new URL(url, location.href); u.hash = ""; return u.href; }
    catch { return String(url || "").split("#")[0]; }
  }
  const hostOf = (url) => { try { return new URL(url, location.href).hostname; } catch { return ""; } };
  function slugOfX810114(url) {
    try { const u = new URL(url, location.href); const p = u.pathname.split("/").filter(Boolean); return /^x\.810114\.xyz$/i.test(u.hostname) && p.length === 1 && /^[A-Za-z0-9_]{2,64}$/.test(p[0]) ? p[0] : ""; }
    catch { return ""; }
  }
  function currentUrl() {
    const apiUrl = window.__flowLensControl?.currentPageBookmarkUrl?.();
    const current = normalizeUrl(apiUrl || location.href);
    if (slugOfX810114(current)) return current;
    const canonical = document.querySelector('link[rel="canonical"]')?.href || "";
    const og = document.querySelector('meta[property="og:url"],meta[name="og:url"]')?.getAttribute?.("content") || "";
    return [canonical, og, current].filter(Boolean).map(normalizeUrl).find(slugOfX810114) || current;
  }
  const titleForUrl = (url) => slugOfX810114(url) ? `@${slugOfX810114(url)}` : ((document.title || hostOf(url) || "未命名页面").replace(/\s+/g, " ").trim());
  function coverOfCurrentPage() {
    const node = document.querySelector('meta[property="og:image"],meta[name="twitter:image"],#xiv-root .xiv-tile img[src],img[src]');
    const raw = node?.getAttribute?.("content") || node?.getAttribute?.("src") || node?.currentSrc || "";
    try { return raw ? new URL(raw, location.href).href : ""; } catch { return ""; }
  }
  function storageGet(key, fallback = "") {
    try { if (typeof GM_getValue === "function") return GM_getValue(key, fallback); } catch {}
    try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
  }
  function storageSet(key, value) {
    let ok = false;
    try { if (typeof GM_setValue === "function") { GM_setValue(key, value); ok = true; } } catch {}
    if (!ok) { try { localStorage.setItem(key, value); } catch {} }
  }
  function normalizeItems(items) {
    const map = new Map();
    for (const raw of Array.isArray(items) ? items : []) {
      if (!raw?.url) continue;
      const url = normalizeUrl(raw.url);
      const item = {
        url,
        title: raw.title || titleForUrl(url),
        host: raw.host || hostOf(url),
        cover: raw.cover || "",
        mediaCount: Number(raw.mediaCount || 0),
        createdAt: raw.createdAt || raw.updatedAt || new Date().toISOString(),
        updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString()
      };
      const prev = map.get(url);
      if (!prev || String(item.updatedAt) > String(prev.updatedAt)) map.set(url, item);
    }
    return Array.from(map.values()).sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""))).slice(0, MAX_ITEMS);
  }
  const mergeItems = (a, b) => normalizeItems([...(a || []), ...(b || [])]);
  const escapeHtml = (value) => String(value || "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  function displayTitle(item) {
    const slug = slugOfX810114(item?.url || "");
    const title = String(item?.title || "").trim();
    if (slug && (!title || title === "推图 - 推特看图纯享版" || title === item.host)) return `@${slug}`;
    return title || (slug ? `@${slug}` : item?.url || "未命名页面");
  }

  async function readBookmarks() {
    if (cache) return cache;
    cache = normalizeItems(safeJson(await Promise.resolve(storageGet(KEY, "[]")), []));
    return cache;
  }
  async function writeBookmarks(items, options = {}) {
    cache = normalizeItems(items);
    storageSet(KEY, JSON.stringify(cache));
    if (!options.silent) window.dispatchEvent(new CustomEvent("flowlens:bookmarks-changed", { detail: { items: cache } }));
    if (options.push !== false) schedulePush();
    return cache;
  }

  function b64urlEncode(text) { return btoa(unescape(encodeURIComponent(text))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
  function b64urlDecode(text) {
    const clean = String(text || "").replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
    const pad = clean.length % 4 ? "=".repeat(4 - (clean.length % 4)) : "";
    return decodeURIComponent(escape(atob(clean + pad)));
  }
  const normalizeSyncCode = (code) => decodeURIComponent(String(code || "")).replace(/\s+/g, "").trim();
  function loadSyncConfig() {
    if (syncConfig !== null) return syncConfig;
    syncConfig = safeJson(storageGet(SYNC_KEY, "null"), null);
    return syncConfig;
  }
  function saveSyncConfig(config) {
    syncConfig = config || null;
    storageSet(SYNC_KEY, JSON.stringify(syncConfig));
    if (syncConfig) startAutoSync();
    else if (syncTimer) { clearInterval(syncTimer); syncTimer = 0; }
    updateSyncUi();
  }
  const encodeSyncCode = (config) => `FLGIST2.${b64urlEncode(JSON.stringify({ g: config.gistId }))}`;
  function decodeSyncCode(code) {
    const raw = normalizeSyncCode(code);
    if (!raw || !raw.startsWith("FLGIST2.")) return null;
    const body = raw.slice("FLGIST2.".length);
    const parsed = safeJson(b64urlDecode(body), null);
    return parsed?.g ? { provider: "gist", gistId: parsed.g } : null;
  }
  function promptForToken() {
    const token = window.prompt("请输入 GitHub Token（需要 gist 权限）。Token 只保存在当前设备，绝不会写入同步码。", "");
    return String(token || "").trim();
  }
  function isBackoffActive() {
    if (Date.now() < rateLimitedUntil) {
      const mins = Math.max(1, Math.ceil((rateLimitedUntil - Date.now()) / 60000));
      updateSyncUi(`GitHub 限流，暂停同步约 ${mins} 分钟`);
      return true;
    }
    return false;
  }
  function handleSyncError(error, fallback) {
    const msg = String(error?.message || lastSyncError || fallback || "同步失败");
    lastSyncError = msg;
    if (/HTTP\s*403|rate limit|API rate limit/i.test(msg)) rateLimitedUntil = Date.now() + RATE_BACKOFF_MS;
    return msg;
  }
  function requestJson(method, url, body = null, token = "") {
    const headers = { Accept: "application/vnd.github+json", "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    lastSyncError = "";
    return new Promise((resolve, reject) => {
      const fail = (message) => { lastSyncError = message; reject(new Error(message)); };
      const handle = (statusCode, text) => {
        const ok = Number(statusCode || 0) >= 200 && Number(statusCode || 0) < 300;
        const data = safeJson(text || "", null);
        ok ? resolve(data) : fail(`HTTP ${statusCode || 0}${text ? `：${String(text).slice(0, 160)}` : ""}`);
      };
      const gmRequest = typeof GM_xmlhttpRequest === "function" ? GM_xmlhttpRequest : (typeof GM !== "undefined" && typeof GM.xmlHttpRequest === "function" ? GM.xmlHttpRequest.bind(GM) : null);
      if (gmRequest) {
        gmRequest({ method, url, headers, data: body ? JSON.stringify(body) : undefined, timeout: 30000, onload: (res) => handle(res.status, res.responseText || ""), onerror: () => fail("网络错误：无法连接 GitHub Gist"), ontimeout: () => fail("网络超时：无法连接 GitHub Gist") });
        return;
      }
      fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined }).then(async (res) => handle(res.status, await res.text())).catch((error) => fail(error?.message || "网络错误"));
    });
  }
  async function fetchRemote(config = loadSyncConfig()) {
    if (!config?.gistId || !config?.token || isBackoffActive()) return { items: [] };
    const gist = await requestJson("GET", `https://api.github.com/gists/${encodeURIComponent(config.gistId)}`, null, config.token);
    return safeJson(gist?.files?.[REMOTE_FILE]?.content || "", { items: [] });
  }
  async function patchRemote(items, config = loadSyncConfig()) {
    if (!config?.gistId || !config?.token || isBackoffActive()) return false;
    const payload = { version: 1, updatedAt: new Date().toISOString(), items: normalizeItems(items) };
    await requestJson("PATCH", `https://api.github.com/gists/${encodeURIComponent(config.gistId)}`, { files: { [REMOTE_FILE]: { content: JSON.stringify(payload, null, 2) } } }, config.token);
    lastPushAt = Date.now();
    return true;
  }
  async function createRemote(token) {
    const local = await readBookmarks();
    const payload = { version: 1, updatedAt: new Date().toISOString(), items: local };
    const gist = await requestJson("POST", "https://api.github.com/gists", { description: "FlowLens bookmarks sync", public: false, files: { [REMOTE_FILE]: { content: JSON.stringify(payload, null, 2) } } }, token);
    if (!gist?.id) throw new Error("Gist 创建失败");
    return { provider: "gist", gistId: gist.id, token };
  }
  async function pullSync(options = {}) {
    const config = loadSyncConfig();
    if (!config?.gistId || !config?.token || syncBusy || isBackoffActive()) return false;
    syncBusy = true;
    try {
      if (!options.silent) status("正在同步收藏");
      const remote = await fetchRemote(config);
      const local = await readBookmarks();
      const merged = mergeItems(local, remote.items || []);
      if (JSON.stringify(merged) !== JSON.stringify(local)) await writeBookmarks(merged, { push: false, silent: true });
      lastPullAt = Date.now();
      renderPanel(); syncButton(); updateSyncUi("已同步");
      return true;
    } catch (error) {
      const msg = handleSyncError(error, "同步失败");
      if (!options.silent) status(`同步失败：${msg}`);
      updateSyncUi(/rate limit|限流|HTTP\s*403/i.test(msg) ? "GitHub 限流，已暂停自动同步" : `同步失败：${msg}`);
      return false;
    } finally { syncBusy = false; }
  }
  async function pushSync() {
    const config = loadSyncConfig();
    if (!config?.gistId || !config?.token || syncBusy || isBackoffActive()) return false;
    if (Date.now() - lastPushAt < MIN_PUSH_MS) return false;
    syncBusy = true;
    try {
      status("正在上传收藏");
      const remote = await fetchRemote(config).catch(() => ({ items: [] }));
      const local = await readBookmarks();
      const merged = await writeBookmarks(mergeItems(local, remote.items || []), { push: false, silent: true });
      await patchRemote(merged, config);
      lastPullAt = Date.now();
      renderPanel(); syncButton(); updateSyncUi("已同步");
      return true;
    } catch (error) {
      const msg = handleSyncError(error, "上传失败");
      updateSyncUi(/rate limit|限流|HTTP\s*403/i.test(msg) ? "GitHub 限流，已暂停自动同步" : `上传失败：${msg}`);
      return false;
    } finally { syncBusy = false; }
  }
  function schedulePush() {
    if (!loadSyncConfig() || isBackoffActive()) return;
    clearTimeout(pushTimer);
    pushTimer = window.setTimeout(() => pushSync(), Math.max(PUSH_DEBOUNCE_MS, MIN_PUSH_MS - (Date.now() - lastPushAt)));
  }
  function startAutoSync() {
    if (!loadSyncConfig() || syncTimer) return;
    syncTimer = window.setInterval(() => {
      if (loadSyncConfig() && Date.now() - lastPullAt > AUTO_PULL_MS) pullSync({ silent: true });
    }, 60000);
  }
  async function configureSync() {
    const current = loadSyncConfig();
    if (current?.gistId && current?.token) {
      const input = window.prompt("已开启自动同步。复制下面同步码到另一台设备；输入 clear 可关闭同步；输入新的同步码可切换。", encodeSyncCode(current));
      if (input === null) return;
      if (String(input).trim().toLowerCase() === "clear") { saveSyncConfig(null); updateSyncUi("未同步"); status("已关闭收藏同步"); window.alert?.("已关闭收藏同步"); return; }
      const next = decodeSyncCode(input);
      if (!next) { status("同步码格式不正确"); window.alert?.("同步码格式不正确，请完整复制 FLGIST2 开头的同步码"); return; }
      const token = promptForToken();
      if (!token) return;
      const config = { ...next, token };
      saveSyncConfig(config); updateSyncUi("正在验证同步码");
      const pulled = await pullSync({ silent: false });
      const pushed = pulled ? await patchRemote(await readBookmarks(), config).then(() => true).catch((e) => { handleSyncError(e, "上传失败"); return false; }) : false;
      window.alert?.(pulled && pushed ? "同步码已生效，收藏夹会自动同步。" : `同步失败：${lastSyncError || "请检查同步码、Token 权限和网络"}`);
      return;
    }
    const code = window.prompt("粘贴另一台设备的同步码；没有同步码就留空并点确定，创建新的自动同步空间。", "");
    if (code === null) return;
    const trimmed = normalizeSyncCode(code);
    if (trimmed) {
      const parsed = decodeSyncCode(trimmed);
      if (!parsed) { status("同步码格式不正确"); window.alert?.("同步码格式不正确，请完整复制 FLGIST2 开头的同步码"); return; }
      const token = promptForToken();
      if (!token) return;
      const config = { ...parsed, token };
      saveSyncConfig(config); updateSyncUi("正在验证同步码");
      const pulled = await pullSync({ silent: false });
      const pushed = pulled ? await patchRemote(await readBookmarks(), config).then(() => true).catch((e) => { handleSyncError(e, "上传失败"); return false; }) : false;
      window.alert?.(pulled && pushed ? "同步码已生效，收藏夹会自动同步。" : `同步失败：${lastSyncError || "请检查同步码、Token 权限和网络"}`);
      return;
    }
    const token = promptForToken();
    if (!token) return;
    try { status("正在创建同步空间"); const config = await createRemote(token); saveSyncConfig(config); await patchRemote(await readBookmarks(), config); window.prompt("同步已开启。复制此同步码到另一台设备；新设备需单独输入自己的 GitHub Token。", encodeSyncCode(config)); }
    catch (error) { const msg = handleSyncError(error, "同步空间创建失败"); status(`同步空间创建失败：${msg}`); window.alert?.(`同步空间创建失败：${msg}`); }
  }
  function updateSyncUi(text = "") {
    const config = loadSyncConfig();
    const button = root()?.querySelector(".fl-safe-sync");
    if (button) button.textContent = "同步";
    const node = root()?.querySelector(".fl-safe-sync-status");
    if (!node) return;
    if (Date.now() < rateLimitedUntil) { const mins = Math.max(1, Math.ceil((rateLimitedUntil - Date.now()) / 60000)); node.textContent = `GitHub 限流，暂停同步约 ${mins} 分钟`; return; }
    node.textContent = text || (config ? "自动同步已开启（低频防限流）" : "未开启同步");
  }

  function injectStyle() {
    if (document.getElementById("fl-bookmarks-safe-style")) return;
    const style = document.createElement("style");
    style.id = "fl-bookmarks-safe-style";
    style.textContent = `
      #xiv-root #xiv-page-bookmarks-controls,#xiv-root .fl-bookmarks-tools{display:none!important}
      #xiv-root .fl-safe-bookmark-btn span{display:none!important}
      #xiv-root .fl-safe-bookmark-btn svg{width:21px!important;height:21px!important}
      #xiv-root .fl-safe-bookmark-btn[data-saved="true"]{color:#ffb648!important;border-color:rgba(255,190,80,.56)!important;background:rgba(255,190,80,.22)!important}
      #xiv-root .fl-safe-bookmark-btn[data-saved="true"] svg{fill:currentColor!important}
      #xiv-root .fl-safe-panel{position:fixed!important;right:max(12px,env(safe-area-inset-right,0px) + 8px)!important;top:max(62px,env(safe-area-inset-top,0px) + 58px)!important;width:min(420px,calc(100vw - 18px))!important;max-height:min(78vh,650px)!important;z-index:2147483647!important;display:none!important;overflow:hidden!important;border-radius:16px!important;background:rgba(248,249,251,.96)!important;color:#111!important;border:1px solid rgba(0,0,0,.08)!important;box-shadow:0 24px 72px rgba(0,0,0,.3)!important;backdrop-filter:blur(18px)!important;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important}
      #xiv-root[data-theme="dark"] .fl-safe-panel{background:rgba(18,19,23,.96)!important;color:#f5f5f5!important;border-color:rgba(255,255,255,.12)!important}
      #xiv-root .fl-safe-panel[data-open="true"]{display:flex!important;flex-direction:column!important}
      #xiv-root .fl-safe-head{display:grid!important;grid-template-columns:1fr auto!important;gap:8px!important;align-items:center!important;padding:10px 12px!important;border-bottom:1px solid rgba(0,0,0,.08)!important}
      #xiv-root .fl-safe-head h3{margin:0!important;font-size:18px!important;font-weight:950!important;line-height:1.1!important}
      #xiv-root .fl-safe-head-actions{display:flex!important;align-items:center!important;gap:6px!important}
      #xiv-root .fl-safe-sync,#xiv-root .fl-safe-close{height:32px!important;border:0!important;border-radius:999px!important;font-size:13px!important;font-weight:900!important;background:rgba(0,0,0,.08)!important;color:inherit!important;cursor:pointer!important;padding:0 12px!important}
      #xiv-root .fl-safe-close{width:32px!important;padding:0!important;font-size:18px!important}
      #xiv-root .fl-safe-sync-status{grid-column:1/-1!important;font-size:11px!important;color:#61708a!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
      #xiv-root .fl-safe-list{overflow:auto!important;padding:4px 8px 10px!important}
      #xiv-root .fl-safe-item{display:grid!important;grid-template-columns:44px minmax(0,1fr) auto!important;gap:8px!important;align-items:center!important;padding:8px!important;margin:5px 0!important;border-radius:12px!important;background:rgba(0,0,0,.045)!important}
      #xiv-root[data-theme="dark"] .fl-safe-item{background:rgba(255,255,255,.08)!important}
      #xiv-root .fl-safe-cover{width:44px!important;height:44px!important;border-radius:10px!important;object-fit:cover!important;background:rgba(0,0,0,.1)!important}
      #xiv-root .fl-safe-title{font-size:13px!important;font-weight:900!important;line-height:1.25!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
      #xiv-root .fl-safe-url{margin-top:2px!important;font-size:11px!important;color:#61708a!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;direction:ltr!important}
      #xiv-root .fl-safe-actions{display:flex!important;gap:4px!important;align-items:center!important}
      #xiv-root .fl-safe-actions button{height:30px!important;padding:0 10px!important;border:0!important;border-radius:999px!important;background:rgba(255,255,255,.86)!important;color:inherit!important;font-size:13px!important;font-weight:900!important;cursor:pointer!important}
      #xiv-root .fl-safe-actions [data-action="remove"]{color:#c2410c!important}
      @media(max-width:560px){#xiv-root .fl-safe-panel{left:6px!important;right:6px!important;width:auto!important}#xiv-root .fl-safe-item{grid-template-columns:42px minmax(0,1fr) auto!important}#xiv-root .fl-safe-actions button{padding:0 8px!important}}
    `;
    document.documentElement.appendChild(style);
  }
  function ensurePanel() {
    const r = root(); if (!r) return null;
    let panel = r.querySelector(".fl-safe-panel"); if (panel) return panel;
    panel = document.createElement("section");
    panel.className = "fl-safe-panel";
    panel.innerHTML = '<div class="fl-safe-head"><h3>页面收藏</h3><div class="fl-safe-head-actions"><button type="button" class="fl-safe-sync">同步</button><button type="button" class="fl-safe-close">×</button></div><div class="fl-safe-sync-status">未开启同步</div></div><div class="fl-safe-list"></div>';
    r.appendChild(panel);
    panel.querySelector(".fl-safe-close")?.addEventListener("click", () => { panel.dataset.open = "false"; });
    panel.querySelector(".fl-safe-sync")?.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); configureSync(); });
    updateSyncUi();
    return panel;
  }
  async function renderPanel() {
    const panel = ensurePanel(); if (!panel) return;
    const listEl = panel.querySelector(".fl-safe-list");
    const items = await readBookmarks();
    if (!items.length) { listEl.innerHTML = '<div style="padding:20px;text-align:center;font-weight:800;opacity:.65">还没有页面收藏</div>'; updateSyncUi(); return; }
    listEl.innerHTML = items.map((item, index) => {
      const url = normalizeUrl(item.url); const count = Number(item.mediaCount || 0);
      return `<article class="fl-safe-item" data-index="${index}">${item.cover ? `<img class="fl-safe-cover" loading="lazy" decoding="async" src="${escapeHtml(item.cover)}" alt="">` : '<div class="fl-safe-cover"></div>'}<div class="fl-safe-info" title="${escapeHtml(url)}"><div class="fl-safe-title">${escapeHtml(displayTitle(item))}</div><div class="fl-safe-url">${escapeHtml(url)}${count ? ` · ${count} 项` : ""}</div></div><div class="fl-safe-actions"><button type="button" data-action="open">打开</button><button type="button" data-action="remove">删除</button></div></article>`;
    }).join("");
    updateSyncUi();
  }
  async function syncButton() {
    const btn = root()?.querySelector('[data-fl-bookmark-safe="toggle"]'); if (!btn) return;
    const url = currentUrl(); const saved = (await readBookmarks()).some((item) => normalizeUrl(item.url) === url);
    btn.dataset.saved = saved ? "true" : "false"; btn.title = saved ? "已收藏本页" : "收藏本页";
  }
  async function toggleBookmark() {
    const url = currentUrl(); const items = await readBookmarks(); const exists = items.some((item) => normalizeUrl(item.url) === url);
    if (exists) { await writeBookmarks(items.filter((item) => normalizeUrl(item.url) !== url)); status("已取消收藏当前页面"); }
    else { const now = new Date().toISOString(); await writeBookmarks([{ url, title: titleForUrl(url), host: hostOf(url), cover: coverOfCurrentPage(), mediaCount: document.querySelectorAll("#xiv-root .xiv-tile").length || 0, createdAt: now, updatedAt: now }, ...items]); status("已收藏当前页面"); }
    await renderPanel(); await syncButton();
  }
  async function openBookmark(index) {
    const item = (await readBookmarks())[index]; if (!item?.url) return;
    const panel = root()?.querySelector(".fl-safe-panel"); if (panel) panel.dataset.open = "false";
    const api = window.__flowLensControl;
    if (api?.loadSavedPage) { const ok = await api.loadSavedPage(item.url); if (ok) return; }
    status("收藏页无法在图片流内打开");
  }
  async function removeBookmark(index) {
    const items = await readBookmarks(); items.splice(index, 1);
    await writeBookmarks(items); await renderPanel(); await syncButton(); status("已删除收藏");
  }
  function makeButton(kind, icon, title) {
    const btn = document.createElement("button"); btn.className = "xiv-btn fl-safe-bookmark-btn"; btn.type = "button"; btn.dataset.flBookmarkSafe = kind; btn.title = title; btn.innerHTML = `${icon}<span>${title}</span>`; return btn;
  }
  function installButtons() {
    injectStyle(); ensurePanel(); startAutoSync(); const bar = actions(); if (!bar) return;
    if (!bar.querySelector('[data-fl-bookmark-safe="toggle"]')) { const btn = makeButton("toggle", SAVE_ICON, "收藏本页"); bar.insertBefore(btn, bar.firstElementChild || null); btn.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); toggleBookmark(); }); }
    if (!bar.querySelector('[data-fl-bookmark-safe="list"]')) { const btn = makeButton("list", LIST_ICON, "收藏列表"); const toggle = bar.querySelector('[data-fl-bookmark-safe="toggle"]'); bar.insertBefore(btn, toggle?.nextSibling || bar.firstElementChild || null); btn.addEventListener("click", async (event) => { event.preventDefault(); event.stopPropagation(); const panel = ensurePanel(); const willOpen = panel.dataset.open !== "true"; panel.dataset.open = willOpen ? "true" : "false"; if (willOpen && loadSyncConfig() && Date.now() - lastPullAt > MIN_PULL_MS) await pullSync({ silent: true }); await renderPanel(); }); }
    syncButton(); updateSyncUi();
  }
  document.addEventListener("click", (event) => {
    const row = event.target?.closest?.("#xiv-root .fl-safe-item"); if (!row) return;
    const index = Number(row.dataset.index || -1);
    if (event.target.closest("[data-action='remove']")) { event.preventDefault(); event.stopPropagation(); removeBookmark(index); return; }
    if (event.target.closest("[data-action='open'],.fl-safe-info")) { event.preventDefault(); event.stopPropagation(); openBookmark(index); }
  }, true);
  window.addEventListener("flowlens:bookmarks-changed", () => { cache = null; renderPanel(); syncButton(); });
  let installTimer = 0;
  const scheduleInstall = () => {
    clearTimeout(installTimer);
    installTimer = window.setTimeout(installButtons, 80);
  };
  new MutationObserver(() => {
    const bar = actions();
    if (bar && (!bar.querySelector('[data-fl-bookmark-safe="toggle"]') || !bar.querySelector('[data-fl-bookmark-safe="list"]'))) scheduleInstall();
  }).observe(document.documentElement, { childList: true, subtree: true });
  installButtons();
})();


/* src/patches/version-display.js */
(() => {
  if (window.__flowLensVersionDisplayPatch) return;
  window.__flowLensVersionDisplayPatch = true;

  let timer = 0;

  function currentVersion() {
    try {
      const info = typeof window.__flowLensGetVersion === "function"
        ? window.__flowLensGetVersion()
        : window.__FlowLensVersion;
      if (info?.version) return info.version;
    } catch {
      // Fall through to legacy globals.
    }
    return window.__FLOWLENS_VERSION__ || "dev";
  }

  function settingsPanel() {
    return document.querySelector('#xiv-root [data-panel="settings"], #xiv-root .xiv-settings, #xiv-root .xiv-settings-panel');
  }

  function makeVersionRow() {
    const row = document.createElement("div");
    row.className = "xiv-setting-row fl-version-row";
    row.dataset.flVersionRow = "true";
    row.innerHTML = `<span>瀑光版本</span><strong class="fl-version-value"></strong>`;
    return row;
  }

  function setRowValue(row) {
    const value = `v${currentVersion()}`;
    let target = row.querySelector?.(".fl-version-value, strong, b, em, code");
    if (!target) {
      const children = [...row.children];
      target = children.at(-1) || row;
    }
    if (target) target.textContent = value;
    row.dataset.flVersionSynced = "true";
  }

  function syncVersion() {
    const panel = settingsPanel();
    if (!panel) return;

    const rows = [...panel.querySelectorAll(".xiv-setting-row, label, div")];
    let versionRow = rows.find((row) => /瀑光版本|FlowLens\s*版本|版本/.test(row.textContent || "") && /v?\d+\.\d+\.\d+/.test(row.textContent || ""));

    if (!versionRow) {
      versionRow = makeVersionRow();
      const title = panel.querySelector("h3, .xiv-panel-title");
      if (title?.nextSibling) panel.insertBefore(versionRow, title.nextSibling);
      else panel.prepend(versionRow);
    }

    if (!versionRow.classList.contains("xiv-setting-row")) versionRow.classList.add("xiv-setting-row");
    versionRow.classList.add("fl-version-row");
    versionRow.dataset.flVersionRow = "true";
    setRowValue(versionRow);
  }

  function schedule() {
    clearTimeout(timer);
    timer = window.setTimeout(syncVersion, 80);
  }

  syncVersion();
  document.addEventListener("click", schedule, true);
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-active", "data-open", "class", "style"]
  });
})();


/* src/patches/diagnostics-log.js */
(() => {
  if (window.__flowLensDiagnosticsPatch) return;
  window.__flowLensDiagnosticsPatch = true;

  const MAX_EVENTS = 80;
  const failedMedia = [];
  const runtimeEvents = [];

  function versionInfo() {
    try {
      const info = typeof window.__flowLensGetVersion === "function"
        ? window.__flowLensGetVersion()
        : window.__FlowLensVersion;
      if (info && typeof info === "object") return info;
    } catch {
      // Fall through to legacy globals.
    }
    return { version: window.__FLOWLENS_VERSION__ || "unknown", source: "diagnostics-fallback" };
  }

  function push(list, item) {
    list.push({ time: new Date().toISOString(), ...item });
    if (list.length > MAX_EVENTS) list.splice(0, list.length - MAX_EVENTS);
  }

  window.addEventListener("error", (event) => {
    const target = event.target;
    if (!target || !["IMG", "VIDEO", "SOURCE", "IFRAME"].includes(target.tagName)) return;
    const src = target.currentSrc || target.src || target.getAttribute?.("src") || target.getAttribute?.("data-src") || "";
    if (!src) return;
    const rect = target.getBoundingClientRect?.();
    push(failedMedia, {
      type: "media-error",
      tag: target.tagName,
      src,
      inFlowLens: !!target.closest?.("#xiv-root"),
      size: rect ? `${Math.round(rect.width)}x${Math.round(rect.height)}` : "unknown"
    });
  }, true);

  window.addEventListener("unhandledrejection", (event) => {
    push(runtimeEvents, { type: "unhandledrejection", message: String(event.reason?.message || event.reason || "") });
  });

  window.addEventListener("error", (event) => {
    if (event.target && event.target !== window) return;
    push(runtimeEvents, { type: "runtime-error", message: event.message || "", file: event.filename || "", line: event.lineno || 0 });
  });

  function root() { return document.getElementById("xiv-root"); }
  function settingsPanel() { return root()?.querySelector('[data-panel="settings"]'); }
  function filterSelect() { return root()?.querySelector('#xiv-topbar .xiv-select[data-xiv="filter"]'); }
  function mediaKind(tile) {
    const url = tile?.dataset?.url || "";
    if (/\.(mp4|webm|mov|m4v)(?:[?#]|$)/i.test(url) || tile?.querySelector?.("video, .fl-video-cover-fallback")) return "video";
    return "image";
  }
  function tileSnapshot() {
    const tiles = [...(root()?.querySelectorAll(".xiv-tile") || [])];
    let images = 0;
    let videos = 0;
    let hidden = 0;
    let posterCovers = 0;
    let fallbackCovers = 0;
    for (const tile of tiles) {
      if (mediaKind(tile) === "video") videos += 1;
      else images += 1;
      if (tile.dataset.flVideoCoverStage === "poster") posterCovers += 1;
      if (tile.dataset.flVideoCoverFallback === "true") fallbackCovers += 1;
      const style = getComputedStyle(tile);
      if (style.display === "none" || style.visibility === "hidden" || tile.hidden) hidden += 1;
    }
    return {
      total: tiles.length,
      images,
      videos,
      hidden,
      videoCover: {
        posterCovers,
        fallbackCovers
      },
      samples: tiles.slice(0, 12).map((tile) => ({
        index: tile.dataset.index || "",
        kind: mediaKind(tile),
        url: tile.dataset.url || "",
        videoCoverStage: tile.dataset.flVideoCoverStage || "",
        visible: getComputedStyle(tile).display !== "none" && !tile.hidden
      }))
    };
  }
  function storageSnapshot() {
    const result = {};
    for (const key of ["flowlens-settings-v2", "flowlens-media-filter-v2", "flowlens-lightbox-slideshow-delay-v1"]) {
      try { result[key] = localStorage.getItem(key); } catch { result[key] = "<blocked>"; }
    }
    return result;
  }
  function buildLog() {
    const app = root();
    const box = app?.querySelector("#xiv-lightbox");
    const info = versionInfo();
    return JSON.stringify({
      version: info.version || "unknown",
      versionInfo: info,
      generatedAt: new Date().toISOString(),
      page: {
        url: location.href,
        title: document.title,
        userAgent: navigator.userAgent,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        devicePixelRatio: window.devicePixelRatio || 1
      },
      flowlens: {
        loaded: !!app,
        active: app?.dataset.active || "",
        theme: app?.dataset.theme || "",
        filter: filterSelect()?.value || "",
        lightboxActive: box?.dataset.active || "",
        lightboxZoom: box?.dataset.zoom || ""
      },
      tiles: tileSnapshot(),
      storage: storageSnapshot(),
      failedMedia,
      runtimeEvents
    }, null, 2);
  }
  async function copyLog() {
    const text = buildLog();
    try {
      await navigator.clipboard.writeText(text);
      toast("分析日志已复制，可以直接发给我");
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;height:38vh;z-index:2147483647;font:12px/1.4 monospace;";
      document.body.appendChild(area);
      area.select();
      toast("已生成日志，请手动复制文本框内容");
    }
  }
  function toast(message) {
    document.getElementById("fl-diagnostics-toast")?.remove();
    const node = document.createElement("div");
    node.id = "fl-diagnostics-toast";
    node.textContent = message;
    node.style.cssText = "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483647;background:rgba(0,0,0,.78);color:#fff;padding:10px 14px;border-radius:999px;font:800 13px/1.2 system-ui,sans-serif;box-shadow:0 10px 26px rgba(0,0,0,.28);";
    document.documentElement.appendChild(node);
    setTimeout(() => node.remove(), 2200);
  }
  function ensureStyle() {
    if (document.getElementById("fl-diagnostics-style")) return;
    const style = document.createElement("style");
    style.id = "fl-diagnostics-style";
    style.textContent = `
      #xiv-root .fl-diagnostics-row {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        gap: 12px !important;
      }
      #xiv-root .fl-diagnostics-row > span {
        min-width: 0 !important;
        flex: 1 1 auto !important;
      }
      #xiv-root .fl-diagnostics-row button {
        width: auto !important;
        min-width: 112px !important;
        max-width: 132px !important;
        height: 38px !important;
        padding: 0 16px !important;
        border-radius: 999px !important;
        border: 1px solid rgba(0,0,0,.12) !important;
        background: rgba(255,255,255,.92) !important;
        color: #111 !important;
        font: 900 13px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        white-space: nowrap !important;
        writing-mode: horizontal-tb !important;
        cursor: pointer !important;
      }
      #xiv-root[data-theme="dark"] .fl-diagnostics-row button,
      #xiv-root:not([data-theme="light"]) .fl-diagnostics-row button {
        border-color: rgba(255,255,255,.16) !important;
        background: rgba(255,255,255,.12) !important;
        color: #fff !important;
      }
      #xiv-root .fl-diagnostics-row small { display:block; margin-top:6px; opacity:.58; font-size:12px; line-height:1.35; }
      @media (max-width: 820px) {
        #xiv-root .fl-diagnostics-row button { min-width: 96px !important; height: 36px !important; padding: 0 12px !important; font-size: 12px !important; }
      }
    `;
    document.documentElement.appendChild(style);
  }
  function ensureRow() {
    const panel = settingsPanel();
    if (!panel) return;
    ensureStyle();
    let row = panel.querySelector(".fl-diagnostics-row");
    if (!row) {
      row = document.createElement("div");
      row.className = "xiv-setting-row fl-diagnostics-row";
      row.innerHTML = `<span><b>分析日志</b><small>复制页面、图片加载、筛选和错误信息</small></span><button type="button">复制日志</button>`;
      panel.appendChild(row);
      row.querySelector("button")?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        copyLog();
      });
    }
  }
  function tick() { ensureRow(); }
  document.addEventListener("click", () => setTimeout(tick, 120), true);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", tick, { once: true });
  else tick();
})();
