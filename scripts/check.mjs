import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
for (const file of ['app.js', 'model.js', 'scripts/server.mjs', 'scripts/build.mjs']) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status) { console.error(result.stderr); process.exit(1); }
}
const html = readFileSync('index.html', 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
if (new Set(ids).size !== ids.length) throw new Error('Duplicate HTML IDs');
console.log('JavaScript syntax and HTML ID checks passed.');
