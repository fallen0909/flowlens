import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
const { version } = JSON.parse(await readFile('version.json', 'utf8'));
const page = await readFile('index.html', 'utf8');
await writeFile('index.html', page.replace(/(https:\/\/raw\.githubusercontent\.com\/fallen0909\/flowlens\/master\/flowlens-(?:desktop|mobile-all)\.user\.js)(?:\?v=[\d.]+)?/g, `$1?v=${version}`));
const run = (file, env = {}) => {
  const result = spawnSync(process.execPath, [file], { stdio: 'inherit', env: { ...process.env, FLOWLENS_RAW_REF: 'master', FLOWLENS_OUTPUT_SUFFIX: '', ...env } });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
};
run('tools/build-userscripts.mjs');
run('tools/sync-extension-sources.mjs');
run('tools/build-userscripts.mjs', { FLOWLENS_RAW_REF: 'codex/extension-stability-performance', FLOWLENS_OUTPUT_SUFFIX: '-preview' });
run('tools/validate-release.mjs');
