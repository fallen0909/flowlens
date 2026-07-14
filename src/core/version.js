// ==UserScript==
// @name         FlowLens version center
// @namespace    local.flowlens.version
// @version      2.0.3
// @description  FlowLens runtime version center.
// @match        *://*/*
// @run-at       document-start
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  const VERSION = "2.0.3";
  window.__FlowLensVersion = Object.freeze({ name: "FlowLens", version: VERSION, channel: "stable", releaseDate: "2026-07-14", features: Object.freeze(["cd2-direct", "magnet-transfer", "browser-stream-playback", "secure-token-storage"]), source: "src/core/version.js" });
  window.__FLOWLENS_VERSION__ = VERSION;
  window.__flowLensGetVersion = () => window.__FlowLensVersion;
})();
