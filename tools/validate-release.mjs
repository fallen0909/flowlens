import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const versionManifest = JSON.parse(await readFile(resolve(root, "version.json"), "utf8"));
const version = versionManifest.version;

const files = {
  desktop: "flowlens-desktop.user.js",
  mobile: "flowlens-mobile-all.user.js",
  index: "index.html",
  readme: "README.md",
  changelog: "docs/CHANGELOG.md",
  manifest: "apps/extension/manifest.json",
  versionCenter: "src/core/version.js"
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function text(path) {
  return readFile(resolve(root, path), "utf8");
}

assert(/^\d+\.\d+\.\d+$/.test(version), `Invalid version: ${version}`);
assert(versionManifest.desktop?.version === version, "desktop version must match version.json root version");
assert(versionManifest.mobile?.version === version, "mobile version must match version.json root version");

for (const path of [files.desktop, files.mobile]) {
  const content = await text(path);
  assert(content.includes(`// @version      ${version}`), `${path} has stale @version`);
  assert(content.includes(`window.__FLOWLENS_VERSION__ = "${version}"`), `${path} has stale runtime version`);
  assert(content.includes(`src/patches/lightbox-event-guard.js?v=${version}`), `${path} is missing lightbox event guard`);
  assert(content.includes(`src/patches/lightbox-ios-smooth.js?v=${version}`), `${path} is missing smooth lightbox patch`);
  assert(content.includes(`src/patches/lightbox-gallery-swipe.js?v=${version}`), `${path} is missing gallery swipe patch`);
  assert(content.includes(`src/patches/lightbox-enhance.js?v=${version}`), `${path} is missing the slideshow controller`);
  assert(!content.includes("src/patches/lightbox-control-fixes.js"), `${path} still loads the conflicting slideshow controller`);
  assert(content.includes(`src/patches/site-adapter-center.js?v=${version}`), `${path} is missing site adapter center patch`);
  assert(content.includes(`src/core/version.js?v=${version}`), `${path} has stale version center require`);
}

const index = await text(files.index);
assert(index.includes(`v${version}`), "install page does not show current version");

const readme = await text(files.readme);
assert(readme.includes(`当前版本：**v${version}**`), "README has stale current version");

const changelog = await text(files.changelog);
assert(changelog.includes(`## ${version} -`), "CHANGELOG is missing current version entry");

const extensionManifest = JSON.parse(await text(files.manifest));
assert(extensionManifest.version === version, "extension manifest has stale version");
assert(extensionManifest.name === "瀑光 FlowLens", "extension manifest name is not valid UTF-8 Chinese");
assert(extensionManifest.action?.default_title === "打开瀑光 FlowLens", "extension action title is not valid UTF-8 Chinese");
assert(!extensionManifest.permissions?.includes("downloads.ui"), "extension must not hide the browser download UI");
assert(!extensionManifest.permissions?.includes("alarms"), "release manifest contains the development reload alarm permission");
const staticScripts = extensionManifest.content_scripts?.flatMap((entry) => entry.js || []) || [];
assert(staticScripts.length === 1 && staticScripts[0] === "content-bootstrap.js", "extension should only inject the lightweight bootstrap globally");

const background = await text("apps/extension/background.js");
const featureScripts = [...new Set(background.match(/content-[a-z0-9-]+\.js/g) || [])];
for (const script of [...staticScripts, ...featureScripts]) {
  await text(`apps/extension/${script}`);
}
assert(featureScripts.includes("content-lightbox-enhance.js"), "extension background is missing the lightbox controller");
assert(!featureScripts.includes("content-lightbox-control-fixes.js"), "extension still loads the conflicting slideshow controller");
assert(!featureScripts.includes("content-slideshow-native.js"), "extension still loads the duplicate slideshow controller");
assert(!background.includes("setUiOptions") && !background.includes("setShelfEnabled"), "background still changes the global download UI");

const lightboxEnhance = await text("src/patches/lightbox-enhance.js");
assert(lightboxEnhance.includes('window.__flowLensSlideshowOwner = "lightbox-enhance";'), "lightbox controller does not own slideshow state");
const core = await text("src/core/flowlens-core.js");
const syncIndexesBody = core.match(/function syncTileIndexes\(\) \{([\s\S]*?)\n  \}/)?.[1] || "";
assert(syncIndexesBody.includes("indexByKey") && !syncIndexesBody.includes("state.images.indexOf"), "tile index synchronization regressed to quadratic scanning");

const sourceSync = await text("tools/sync-extension-sources.mjs");
const sourcePairs = [...sourceSync.matchAll(/"([^"]+\.js)"\s*:\s*"([^"]+\.js)"/g)].map((match) => [match[1], match[2]]);
assert(sourcePairs.length >= 20, "extension source map is unexpectedly incomplete");
for (const [source, target] of sourcePairs) {
  assert(await text(source) === await text(target), `${target} has drifted from ${source}`);
}

const versionCenter = await text(files.versionCenter);
assert(versionCenter.includes(`// @version      ${version}`), "version center has stale @version");
assert(versionCenter.includes(`const VERSION = "${version}";`), "version center has stale runtime VERSION");

console.log(`FlowLens userscript release ${version} is consistent.`);
