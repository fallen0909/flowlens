// ==UserScript==
// @name         FlowLens version center
// @namespace    local.flowlens.version
// @version      1.7.33
// @description  FlowLens runtime version center.
// @match        *://*/*
// @run-at       document-start
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  const VERSION = "1.7.33";
  window.__FlowLensVersion = Object.freeze({ name: "FlowLens", version: VERSION, channel: "stable", releaseDate: "2026-07-03", features: Object.freeze(["lightbox-control-fixes", "pornpics-short-queue", "lightbox-wheel-zoom"]), source: "src/core/version.js" });
  window.__FLOWLENS_VERSION__ = VERSION;
  window.__flowLensGetVersion = () => window.__FlowLensVersion;
})();