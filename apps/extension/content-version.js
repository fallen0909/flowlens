// ==UserScript==
// @name         FlowLens version center
// @namespace    local.flowlens.version
// @version      1.10.0
// @description  FlowLens runtime version center.
// @match        *://*/*
// @run-at       document-start
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  const VERSION = "1.10.0";
  window.__FlowLensVersion = Object.freeze({ name: "FlowLens", version: VERSION, channel: "stable", releaseDate: "2026-07-08", features: Object.freeze(["site-adapter-center", "session-restore", "smooth-rendering", "restore-scroll-guard"]), source: "src/core/version.js" });
  window.__FLOWLENS_VERSION__ = VERSION;
  window.__flowLensGetVersion = () => window.__FlowLensVersion;
})();
