import { cp, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const version = JSON.parse(await readFile(resolve(root, "version.json"), "utf8")).version;

const sourceMap = {
  "src/core/version.js": "apps/extension/content-version.js",
  "src/core/flowlens-core.js": "apps/extension/content.js",
  "src/core/optimizer.js": "apps/extension/content-patch.js",
  "src/patches/x810114-safe-start.js": "apps/extension/content-x810114-safe-start.js",
  "src/patches/item-gallery.js": "apps/extension/content-item-gallery.js",
  "src/patches/xchina-ad-filter.js": "apps/extension/content-xchina-ad-filter.js",
  "src/patches/media-filter-center.js": "apps/extension/content-media-filter-center.js",
  "src/patches/fixes.js": "apps/extension/content-fixes.js",
  "src/patches/product.js": "apps/extension/content-product.js",
  "src/patches/site-adapter-center.js": "apps/extension/content-site-adapter-center.js",
  "src/patches/ui-cleanup.js": "apps/extension/content-ui-cleanup.js",
  "src/patches/lightbox-stable.js": "apps/extension/content-lightbox-stable.js",
  "src/patches/lightbox-ios-smooth.js": "apps/extension/content-lightbox-ios-smooth.js",
  "src/patches/lightbox-enhance.js": "apps/extension/content-lightbox-enhance.js",
  "src/patches/lightbox-event-guard.js": "apps/extension/content-lightbox-event-guard.js",
  "src/patches/lightbox-icons-unified.js": "apps/extension/content-lightbox-icons-unified.js",
  "src/patches/visible-sequence-safe.js": "apps/extension/content-visible-sequence-safe.js",
  "src/patches/settings-compact.js": "apps/extension/content-settings-compact-v2.js",
  "src/patches/zhihu.js": "apps/extension/content-zhihu.js",
  "src/patches/topfix.js": "apps/extension/content-topfix.js",
  "src/patches/media-sync.js": "apps/extension/content-media-sync.js",
  "src/patches/lightbox-control-fixes.js": "apps/extension/content-lightbox-control-fixes.js",
  "src/patches/pornpics-queue-hotfix.js": "apps/extension/content-pornpics-queue-hotfix.js",
  "src/patches/slideshow-native.js": "apps/extension/content-slideshow-native.js",
  "src/patches/page-bookmarks.js": "apps/extension/content-page-bookmarks.js",
  "src/patches/video-cover-strategy.js": "apps/extension/content-video-cover-strategy.js",
  "src/patches/diagnostics-log.js": "apps/extension/content-diagnostics-log.js"
};

await Promise.all(Object.entries(sourceMap).map(([source, target]) => cp(resolve(root, source), resolve(root, target))));

const manifestPath = resolve(root, "apps/extension/manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.version = version;
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(`Synced extension sources for FlowLens v${version}`);
