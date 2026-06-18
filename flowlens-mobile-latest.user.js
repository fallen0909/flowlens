// ==UserScript==
// @name         瀑光 FlowLens 手机整合版
// @namespace    local.flowlens.mobile.all
// @version      1.4.6
// @description  手机 Edge / Tampermonkey 稳定更新版：修复筛选切换按钮并加图标，修复大图自动切换，保留爱心原位。
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      *
// @downloadURL  https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-mobile-latest.user.js
// @updateURL    https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-mobile-latest.user.js
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/mobile-userscript/flowlens-global-settings.user.js
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/mobile-userscript/flowlens.user.js
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/mobile-userscript/flowlens-optimizer.user.js
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-extension/content-fixes.js
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-extension/content-product.js
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-extension/content-ui-cleanup.js
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-extension/content-lightbox-stable.js
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-extension/content-settings-compact-v2.js
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-extension/content-zhihu.js
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/mobile-userscript/flowlens-media-bridge-v4.user.js
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/mobile-userscript/flowlens-mobile-action-v6.user.js
// ==/UserScript==

/*
  FlowLens mobile stable latest loader.
  固定安装地址：
  https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-mobile-latest.user.js

  以后手机版更新只维护这个文件，不再更换安装链接。
*/
