// ==UserScript==
// @name         瀑光 FlowLens 手机整合版
// @namespace    local.flowlens.mobile.all
// @version      1.3.5
// @description  手机 Edge / Tampermonkey 整合版：主脚本、优化补丁、全局设置和知乎适配一键安装。
// @match        *://*/*
// @run-at       document-start
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      *
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/mobile-userscript/flowlens-global-settings.user.js
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/mobile-userscript/flowlens.user.js
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/mobile-userscript/flowlens-optimizer.user.js
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/mobile-userscript/flowlens-zhihu.user.js
// ==/UserScript==

/*
  FlowLens mobile all-in-one loader v1.3.5.
  This file is intentionally small. Tampermonkey loads the mobile modules above via @require.
  If Tampermonkey still shows an old version, delete the old script and install this URL again:
  https://fallen0909.github.io/flowlens/flowlens-mobile-all.user.js
*/
