// ==UserScript==
// @name         瀑光 FlowLens 手机整合版
// @namespace    local.flowlens.mobile.all
// @version      1.4.7
// @description  手机 Edge / Tampermonkey 稳定更新版：改用最新桌面核心，修复旧手机核心导致的筛选、顶部、自动切换失效。
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
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/mobile-userscript/flowlens-mobile-shim-v7.user.js?v=1.4.7
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-extension/content.js?v=1.4.7
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-extension/content-ui-cleanup.js?v=1.4.7
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-extension/content-lightbox-stable.js?v=1.4.7
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-extension/content-settings-compact-v2.js?v=1.4.7
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-extension/content-zhihu.js?v=1.4.7
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/mobile-userscript/flowlens-media-bridge-v4.user.js?v=1.4.7
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/mobile-userscript/flowlens-mobile-native-fixes-v7.user.js?v=1.4.7
// ==/UserScript==

/*
  FlowLens mobile stable latest loader.
  固定安装地址：
  https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-mobile-latest.user.js

  v1.4.7 起：不再加载旧手机核心 mobile-userscript/flowlens.user.js，改用最新桌面核心 content.js。
*/
