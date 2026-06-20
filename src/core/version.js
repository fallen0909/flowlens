// ==UserScript==
// @name         瀑光 FlowLens 版本中心
// @namespace    local.flowlens.version
// @version      1.4.45
// @description  FlowLens 统一运行时版本中心，供入口脚本、补丁和诊断日志读取同一份版本信息。
// @match        *://*/*
// @run-at       document-start
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  const VERSION = "1.4.45";
  const CHANNEL = "stable";
  const RELEASE_DATE = "2026-06-20";
  const FEATURES = [
    "unified-version-center",
    "version-display-sync",
    "video-cover-strategy",
    "video-preview-card",
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
