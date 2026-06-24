// ==UserScript==
// @name         瀑光 FlowLens 版本中心
// @namespace    local.flowlens.version
// @version      1.7.7
// @description  FlowLens 统一运行时版本中心，供入口脚本、补丁和诊断日志读取同一份版本信息。
// @match        *://*/*
// @run-at       document-start
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  const RAW_VERSION = "__FLOWLENS_BUILD_VERSION__";
  const RAW_CHANNEL = "__FLOWLENS_BUILD_CHANNEL__";
  const VERSION = /^__FLOWLENS_/.test(RAW_VERSION) ? "1.7.7" : RAW_VERSION;
  const CHANNEL = /^__FLOWLENS_/.test(RAW_CHANNEL) ? "stable" : RAW_CHANNEL;
  const RELEASE_DATE = "2026-06-24";
  const FEATURES = [
    "build-time-single-file",
    "unified-version-center",
    "version-display-sync",
    "page-bookmarks",
    "item-gallery-pagination",
    "meitulu-item-pagination",
    "x810114-no-refresh-auto-open",
    "lightbox-enhanced-slideshow",
    "lightbox-keyboard-zoom-centered",
    "lightbox-button-sync"
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