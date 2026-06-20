// ==UserScript==
// @name         瀑光 FlowLens
// @namespace    local.flowlens
// @version      1.2.1
// @description  手机 Edge / Tampermonkey 版：把多图网页整理成沉浸式全屏瀑布流。
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @connect      *
// ==/UserScript==

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
