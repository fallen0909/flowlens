import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(await readFile(resolve(root, "version.json"), "utf8"));
const version = manifest.version;

if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid version: ${version}`);
if (manifest.desktop?.version !== version || manifest.mobile?.version !== version) {
  throw new Error("version.json desktop/mobile versions must match the release version");
}

const baseUrl = "https://raw.githubusercontent.com/fallen0909/flowlens/master";
const shared = [
  "src/core/version.js",
  "src/core/global-settings.js",
  "src/patches/x810114-safe-start.js",
  "src/patches/item-gallery.js",
  "src/patches/lightbox-event-guard.js",
  "src/core/flowlens-core.js",
  "src/core/optimizer.js",
  "src/patches/product.js",
  "src/patches/fixes.js",
  "src/patches/ui-cleanup.js",
  "src/patches/lightbox-stable.js",
  "src/patches/settings-compact.js",
  "src/patches/zhihu.js",
  "src/patches/topfix.js",
  "src/patches/media-sync.js",
  "src/patches/lightbox-enhance.js",
  "src/patches/lightbox-ios-smooth.js",
  "src/patches/lightbox-gallery-swipe.js",
  "src/patches/lightbox-icon-dom-fix.js",
  "src/patches/lightbox-icons-unified.js",
  "src/patches/lightbox-toolbar-stable.js",
  "src/patches/page-bookmarks.js"
];

function header({ name, namespace, description, output, additions = [] }) {
  const requires = [...shared, ...additions]
    .map((path) => `// @require      ${baseUrl}/${path}?v=${version}`)
    .join("\n");

  return `// ==UserScript==
// @name         ${name}
// @namespace    ${namespace}
// @version      ${version}
// @description  ${description}
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_getValue
// @grant        GM_setValue
// @downloadURL  ${baseUrl}/${output}
// @updateURL    ${baseUrl}/${output}
${requires}
// ==/UserScript==

(() => {
  window.__FLOWLENS_VERSION__ = "${version}";
})();
`;
}

async function build(entry) {
  await writeFile(resolve(root, entry.output), header(entry), "utf8");
}

await build({
  name: "FlowLens desktop",
  namespace: "local.flowlens.desktop",
  description: "FlowLens desktop release.",
  output: "flowlens-desktop.user.js"
});

await build({
  name: "FlowLens mobile",
  namespace: "local.flowlens.mobile.all",
  description: "FlowLens mobile release.",
  output: "flowlens-mobile-all.user.js",
  additions: ["src/mobile/mobile-center.js"]
});

console.log(`Built FlowLens userscript loaders v${version}`);
