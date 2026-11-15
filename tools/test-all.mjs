import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const tests = (await readdir(new URL('.', import.meta.url))).filter(file => /^test-.*\.mjs$/.test(file) && file !== 'test-all.mjs').sort();
for (const file of tests) {
  console.log(`\n${file}`);
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(file, import.meta.url))], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`\nPassed ${tests.length} test suites.`);
