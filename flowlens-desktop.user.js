// ==UserScript==
// @name         FlowLens desktop
// @namespace    local.flowlens.desktop
// @version      1.9.6
// @description  FlowLens desktop release.
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_getValue
// @grant        GM_setValue
// @downloadURL  https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-desktop.user.js
// @updateURL    https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-desktop.user.js
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/core/version.js?v=1.9.6
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/core/global-settings.js?v=1.9.6
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/core/flowlens-core.js?v=1.9.6
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/patches/x810114-dynamic-queue.js?v=1.9.6
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/src/core/optimizer.js?v=1.9.6
// ==/UserScript==

(() => {
  window.__FLOWLENS_VERSION__ = "1.9.6";
})();
