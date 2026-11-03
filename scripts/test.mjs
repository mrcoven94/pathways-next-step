// `npm test`: starts a fresh model-calls.log, runs every check, prints pass or fail for each.

import { spawnSync } from 'node:child_process';
import { readdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const log = `${root}model-calls.log`;
writeFileSync(log, `# model-calls.log: every model call from the last \`npm test\` run, written by src/core/gateway.js\n# started ${new Date().toISOString()}\n\n`);

const files = readdirSync(`${root}test`).filter((f) => f.endsWith('.test.js')).sort().map((f) => `test/${f}`);
const run = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=spec', ...files], { cwd: root, stdio: 'inherit' });

const calls = (readFileSync(log, 'utf8').match(/^=== model call /gm) ?? []).length;
console.log(`\n${run.status === 0 ? 'PASS' : 'FAIL'}: ${files.length} test files. ${calls} model calls logged to model-calls.log.`);
process.exit(run.status ?? 1);
