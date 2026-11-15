import { cp, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const version = JSON.parse(await readFile(resolve(root, "version.json"), "utf8")).version;

const { extensionSources: sourceMap } = JSON.parse(await readFile(resolve(root, "config/modules.json"), "utf8"));

await Promise.all(Object.entries(sourceMap).map(([source, target]) => cp(resolve(root, source), resolve(root, target))));

const manifestPath = resolve(root, "apps/extension/manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.version = version;
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(`Synced extension sources for FlowLens v${version}`);
