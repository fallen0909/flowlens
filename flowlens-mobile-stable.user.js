// ==UserScript==
// @name         瀑光 FlowLens 手机版稳定版
// @namespace    local.flowlens.mobile.stable.v2
// @version      1.4.7
// @description  手机 Edge / Tampermonkey 新安装身份：恢复左上角信息、图片贴顶、筛选切换按钮、缓存刷新。
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      *
// @downloadURL  https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-mobile-stable.user.js
// @updateURL    https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-mobile-stable.user.js
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/mobile-userscript/flowlens-global-settings.user.js?v=1.4.7
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/mobile-userscript/flowlens.user.js?v=1.4.7
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/mobile-userscript/flowlens-optimizer.user.js?v=1.4.7
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-extension/content-fixes.js?v=1.4.7
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-extension/content-product.js?v=1.4.7
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-extension/content-ui-cleanup.js?v=1.4.7
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-extension/content-lightbox-stable.js?v=1.4.7
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-extension/content-settings-compact-v2.js?v=1.4.7
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-extension/content-zhihu.js?v=1.4.7
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/mobile-userscript/flowlens-media-bridge-v4.user.js?v=1.4.7
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/mobile-userscript/flowlens-mobile-action-v6.user.js?v=1.4.7
// ==/UserScript==

/*
  新稳定安装地址：
  https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-mobile-stable.user.js

  说明：这是新的脚本身份，避免 Tampermonkey 把旧“手机整合版”的缓存补丁继续拿来运行。
*/
