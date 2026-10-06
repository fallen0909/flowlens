// ==UserScript==
// @name         FlowLens version center
// @namespace    local.flowlens.version
// @version      2.0.7
// @description  FlowLens runtime version center.
// @match        *://*/*
// @run-at       document-start
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  const VERSION = "2.0.7";
  window.__FlowLensVersion = Object.freeze({ name: "FlowLens", version: VERSION, channel: "stable", releaseDate: "2026-10-07", features: Object.freeze(["settings-modules", "reliable-slideshow", "video-auto-advance", "cd2-stream-local-playback", "gallery-locale-dedupe", "gallery-previews"]), source: "src/core/version.js" });
  window.__FLOWLENS_VERSION__ = VERSION;
  window.__flowLensGetVersion = () => window.__FlowLensVersion;
})();
