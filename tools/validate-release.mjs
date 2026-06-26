import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const versionManifest = JSON.parse(await readFile(resolve(root, "version.json"), "utf8"));
const version = versionManifest.version;

const files = {
  desktop: "flowlens-desktop.user.js",
  mobile: "flowlens-mobile-all.user.js",
  index: "index.html",
  manifest: "apps/extension/manifest.json"
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

for (const [name, path] of Object.entries({ desktop: files.desktop, mobile: files.mobile })) {
  const content = await text(path);
  assert(content.includes(`// @version      ${version}`), `${path} has stale @version`);
  assert(content.includes(`window.__FLOWLENS_VERSION__ = "${version}"`), `${path} has stale runtime version`);
  assert(content.includes(`src/patches/lightbox-ios-smooth.js?v=${version}`), `${path} is missing smooth lightbox patch`);
  assert(content.includes(`src/core/version.js?v=${version}`), `${path} has stale version center require`);
}

const index = await text(files.index);
assert(index.includes(`v${version}`), "install page does not show current version");

const manifest = JSON.parse(await text(files.manifest));
assert(manifest.version === version, "extension manifest version is stale");
const scripts = manifest.content_scripts?.[0]?.js || [];
assert(scripts.includes("content-lightbox-ios-smooth.js"), "extension manifest is missing smooth lightbox content script");

console.log(`FlowLens release ${version} is consistent.`);
