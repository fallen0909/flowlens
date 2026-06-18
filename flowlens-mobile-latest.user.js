// ==UserScript==
// @name         瀑光 FlowLens 手机整合版
// @namespace    local.flowlens.mobile.all
// @version      1.4.8
// @description  手机 Edge / Tampermonkey 稳定更新版：修复左上角信息、图片贴顶、筛选图标按钮、大图自动切换。
// @match        *://*/*
// @run-at       document-start
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      *
// @downloadURL  https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-mobile-latest.user.js
// @updateURL    https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-mobile-latest.user.js
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/mobile-userscript/flowlens-mobile-shim-v7.user.js?v=1.4.8
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-extension/content.js?v=1.4.8
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-extension/content-ui-cleanup.js?v=1.4.8
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-extension/content-lightbox-stable.js?v=1.4.8
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-extension/content-settings-compact-v2.js?v=1.4.8
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-extension/content-zhihu.js?v=1.4.8
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/mobile-userscript/flowlens-media-bridge-v4.user.js?v=1.4.8
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/mobile-userscript/flowlens-mobile-controls-v8.user.js?v=1.4.8
// ==/UserScript==

/*
  FlowLens mobile stable latest loader.
  固定安装地址：
  https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-mobile-latest.user.js

  v1.4.8：只保留最新桌面核心 + V8 手机控制补丁，避免旧补丁互相覆盖。
*/
