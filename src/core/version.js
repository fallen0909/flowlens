// ==UserScript==
// @name         FlowLens version center
// @namespace    local.flowlens.version
// @version      1.7.16
// @description  FlowLens runtime version center.
// @match        *://*/*
// @run-at       document-start
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  const VERSION = "1.7.16";
  const CHANNEL = "stable";
  const RELEASE_DATE = "2026-06-24";
  const FEATURES = [
    "build-time-single-file",
    "unified-version-center",
    "page-bookmarks",
    "item-gallery-pagination",
    "meitulu-item-pagination",
    "x810114-no-refresh-auto-open",
    "lightbox-toolbar-style-icons",
    "lightbox-hide-legacy-play-duplicate",
    "lightbox-pointer-slideshow-toggle",
    "lightbox-red-favorite"
  ];

  const previous = window.__FlowLensVersion && typeof window.__FlowLensVersion === "object" ? window.__FlowLensVersion : {};
  const info = Object.freeze({
    ...previous,
    name: "FlowLens",
    version: VERSION,
    channel: CHANNEL,
    releaseDate: RELEASE_DATE,
    features: Object.freeze([...(Array.isArray(previous.features) ? previous.features : []), ...FEATURES].filter((item, index, array) => item && array.indexOf(item) === index)),
    source: "src/core/version.js"
  });

  window.__FlowLensVersion = info;
  window.__FLOWLENS_VERSION__ = VERSION;
  window.__flowLensGetVersion = () => window.__FlowLensVersion || info;
})();