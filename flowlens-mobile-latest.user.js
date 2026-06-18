// ==UserScript==
// @name         瀑光 FlowLens 手机整合版
// @namespace    local.flowlens.mobile.all
// @version      1.4.0
// @description  手机 Edge / Tampermonkey 稳定更新版：顶部信息纯文字、图片贴顶、大图不闪、自动切换按钮强制显示、增强媒体抓取。
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
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/mobile-userscript/flowlens-mobile-center.user.js
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/mobile-userscript/flowlens-mobile-polish.user.js
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/mobile-userscript/flowlens-mobile-layout-v2.user.js
// @require      https://raw.githubusercontent.com/fallen0909/flowlens/master/mobile-userscript/flowlens-media-bridge.user.js
// ==/UserScript==

/*
  FlowLens mobile stable latest loader.
  固定安装地址：
  https://raw.githubusercontent.com/fallen0909/flowlens/master/flowlens-mobile-latest.user.js

  以后手机版更新只维护这个文件，不再更换安装链接。
*/
