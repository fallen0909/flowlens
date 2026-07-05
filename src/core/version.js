// ==UserScript==
// @name         FlowLens version center
// @namespace    local.flowlens.version
// @version      1.9.6
// @description  FlowLens runtime version center.
// @match        *://*/*
// @run-at       document-start
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  const VERSION = "1.9.6";
  window.__FlowLensVersion = Object.freeze({ name: "FlowLens", version: VERSION, channel: "stable", releaseDate: "2026-07-04", features: Object.freeze([]), source: "src/core/version.js" });
  window.__FLOWLENS_VERSION__ = VERSION;
  window.__flowLensGetVersion = () => window.__FlowLensVersion;
})();
