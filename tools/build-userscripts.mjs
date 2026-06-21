import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(await readFile(resolve(root, "version.json"), "utf8"));
const version = manifest.version;

if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid version: ${version}`);
if (manifest.desktop?.version !== version || manifest.mobile?.version !== version) {
  throw new Error("version.json desktop/mobile versions must match the release version");
}

const shared = [
  "src/core/version.js",
  "src/core/global-settings.js",
  "src/core/flowlens-core.js",
  "src/core/optimizer.js",
  "src/patches/fixes.js",
  "src/patches/product.js",
  "src/patches/ui-cleanup.js",
  "src/patches/lightbox-stable.js",
  "src/patches/settings-compact.js",
  "src/patches/zhihu.js",
  "src/patches/zhihu-dedupe.js",
  "src/patches/topfix.js",
  "src/patches/media-sync.js",
  "src/patches/slideshow-native.js",
  "src/patches/page-bookmarks.js",
  "src/patches/version-display.js",
  "src/patches/diagnostics-log.js"
];

function header(name, namespace, description) {
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
// @connect      *
// @downloadURL  https://raw.githubusercontent.com/fallen0909/flowlens/master/${namespace.endsWith("desktop") ? "flowlens-desktop.user.js" : "flowlens-mobile-all.user.js"}
// @updateURL    https://raw.githubusercontent.com/fallen0909/flowlens/master/${namespace.endsWith("desktop") ? "flowlens-desktop.user.js" : "flowlens-mobile-all.user.js"}
// ==/UserScript==`;
}

function stripUserscriptHeader(source) {
  return source.replace(/^\s*\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/u, "");
}

async function source(path) {
  const text = stripUserscriptHeader(await readFile(resolve(root, path), "utf8"));
  return `\n/* ${path} */\n${text}`;
}

async function build({ name, namespace, description, output, additions = [] }) {
  const parts = await Promise.all([...shared, ...additions].map(source));
  const bundle = `${header(name, namespace, description)}\n\n${parts.join("\n")}`
    .replaceAll("__FLOWLENS_BUILD_VERSION__", version)
    .replaceAll("__FLOWLENS_BUILD_CHANNEL__", "stable");
  if (/\b(?:eval|GM_xmlhttpRequest\s*\(\s*\{\s*method:\s*["']GET["'])/.test(bundle.slice(0, bundle.indexOf("/* src/core/version.js */")))) {
    throw new Error("The userscript entry must not contain a runtime loader");
  }
  if (!bundle.includes('data-xiv="full"') || !bundle.includes('not([data-xiv="full"])')) {
    throw new Error("The fullscreen toolbar control must remain visible in the compact toolbar");
  }
  await writeFile(resolve(root, output), `${bundle.trim()}\n`, "utf8");
}

await build({
  name: "瀑光 FlowLens 电脑油猴版",
  namespace: "local.flowlens.desktop",
  description: "完整单文件发布版：沉浸式网页图片与视频瀑布流。",
  output: "flowlens-desktop.user.js"
});

await build({
  name: "瀑光 FlowLens 手机整合版",
  namespace: "local.flowlens.mobile.all",
  description: "完整单文件发布版：沉浸式网页图片与视频瀑布流。",
  output: "flowlens-mobile-all.user.js",
  additions: ["src/mobile/mobile-center.js"]
});

console.log(`Built FlowLens userscripts v${version}`);
