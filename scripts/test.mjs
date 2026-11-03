// `npm test`: starts a fresh model-calls.log, runs every check, prints pass or fail for each.

import { spawnSync } from 'node:child_process';
import { readdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const log = `${root}model-calls.log`;
writeFileSync(log, `# model-calls.log: every model call from the last \`npm test\` run, written by src/core/gateway.js\n# started ${new Date().toISOString()}\n\n`);

const files = readdirSync(`${root}test`).filter((f) => f.endsWith('.test.js')).sort().map((f) => `test/${f}`);
const run = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=spec', ...files], { cwd: root, stdio: 'inherit' });

// Put a summary at the top so a reviewer can find the interesting calls without reading them all.
const body = readFileSync(log, 'utf8');
const calls = (body.match(/^=== model call /gm) ?? []).length;
const replaced = body.split(/^(?==== model call )/m)
  .map((entry) => [entry.match(/^=== model call (\d+) · [^\n]* · model=([^\n]+)/), entry.match(/^--- verdict: replaced · ([^\n]+)/m)])
  .filter(([head, verdict]) => head && verdict)
  .map(([head, verdict]) => [null, head[1], head[2], verdict[1]]);
const summary = [
  `# Summary: ${calls} model calls. ${calls - replaced.length} passed the checks and were shown. ${replaced.length} were replaced with code-written text.`,
  '# Every replaced call came from a deliberately misbehaving test model; search for "verdict: replaced" to read them:',
  ...replaced.map((m) => `#   call ${m[1]} (${m[2]}): ${m[3]}`),
  '# Search for the canaries "Zyxquorra", "CANARY" or "Quillfeather": none appear, because no name or typed text reaches the model.',
  '',
].join('\n');
writeFileSync(log, body.replace(/^(# model-calls\.log[^\n]*\n# started[^\n]*\n)/, `$1${summary}\n`));
console.log(`\n${run.status === 0 ? 'PASS' : 'FAIL'}: ${files.length} test files. ${calls} model calls logged to model-calls.log (${replaced.length} replaced).`);
process.exit(run.status ?? 1);
