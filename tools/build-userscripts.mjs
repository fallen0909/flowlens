import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(await readFile(resolve(root, "version.json"), "utf8"));
const version = manifest.version;

if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid version: ${version}`);
if (manifest.desktop?.version !== version || manifest.mobile?.version !== version) {
  throw new Error("version.json desktop/mobile versions must match the release version");
}

const versionCenterPath = resolve(root, "src/core/version.js");
const versionCenter = await readFile(versionCenterPath, "utf8");
await writeFile(
  versionCenterPath,
  versionCenter
    .replace(/\/\/ @version\s+\d+\.\d+\.\d+/, `// @version      ${version}`)
    .replace(/const VERSION = "\d+\.\d+\.\d+";/, `const VERSION = "${version}";`),
  "utf8"
);

const rawRef = process.env.FLOWLENS_RAW_REF || "master";
const outputSuffix = process.env.FLOWLENS_OUTPUT_SUFFIX || "";
if (!/^[A-Za-z0-9._/-]+$/.test(rawRef)) throw new Error(`Invalid raw ref: ${rawRef}`);
if (outputSuffix && !/^-[a-z0-9-]+$/.test(outputSuffix)) throw new Error(`Invalid output suffix: ${outputSuffix}`);
const baseUrl = `https://raw.githubusercontent.com/fallen0909/flowlens/${rawRef}`;
const modulesConfig = JSON.parse(await readFile(resolve(root, "config/modules.json"), "utf8"));
const shared = modulesConfig.userscriptShared;

function header({ name, namespace, description, output, sources }) {
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
// @grant        GM_addValueChangeListener
// @grant        GM_openInTab
// @connect      localhost
// @connect      127.0.0.1
// @connect      self
// @connect      video.twimg.com
// @connect      video-cf.twimg.com
// @connect      pbs.twimg.com
// @connect      twimg.moonchan.xyz
// @connect      x.moonchan.xyz
// @connect      img.xchina.io
// @connect      upload.xchina.io
// @downloadURL  ${baseUrl}/${output}
// @updateURL    ${baseUrl}/${output}
// ==/UserScript==

${sources}

(() => {
  window.__FLOWLENS_VERSION__ = "${version}";
})();
`;
}

async function build(entry) {
  const output = entry.output.replace(/\.user\.js$/, `${outputSuffix}.user.js`);
  const modules = [...shared, ...(entry.additions || [])];
  const sources = (await Promise.all(modules.map(async (path) => {
    const source = (await readFile(resolve(root, path), "utf8")).replace(/^\uFEFF/, "").replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/g, "");
    return `// FlowLens module: ${path}\n${source.trim()}\n`;
  }))).join("\n");
  await writeFile(resolve(root, output), header({ ...entry, output, sources }), "utf8");
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
  additions: modulesConfig.userscriptMobile
});

console.log(`Built FlowLens userscript bundles v${version}`);
