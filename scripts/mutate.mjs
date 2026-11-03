// `npm run mutate`: proves the checks catch what they claim. Each mutation breaks one guard in a
// scratch copy of the repo; the named check must then fail. A mutation that survives is a weak test.

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

const MUTATIONS = [
  ['The browser sends her typed words with the topic', 'public/client.js',
    'return { body: { topic: m.topic, record_ids: m.record_ids } };', 'return { body: { topic: m.topic, record_ids: m.record_ids, question: text } };', 'AC8'],
  ['The server tries to send her name to the model (the gateway refuses it, so the plan fails)', 'src/app.js',
    'next_step: { action: p.next_step.action, record_id: p.next_step.record_id },', "next_step: { action: p.next_step.action, record_id: p.next_step.record_id }, first_name: 'Dani',", 'AC1'],
  ['The allowlist accepts inherited names like "constructor"', 'src/core/gateway.js',
    'if (!Object.hasOwn(keys, k))', 'if (!(k in keys))', 'AC9'],
  ['Numbers are allowed in the model\'s own words', 'src/core/gateway.js',
    'if (digits) problems.push', 'if (false) problems.push', 'AC7b'],
  ['Months are allowed in the model\'s own words', 'src/core/gateway.js',
    'if (month) problems.push', 'if (false) problems.push', 'AC7b'],
  ['Crisis words are matched without fixing phone apostrophes', 'src/core/topics.js',
    'return CRISIS.test(plain(text));', 'return CRISIS.test(String(text));', 'AC10'],
  ['The age rule is ignored', 'src/core/planner.js',
    "if (age18 === 'no') missed.push('AGE_RULE_MISSED');", '', 'AC3'],
  ['Seat questions go to the model instead of an advisor', 'src/core/topics.js',
    "['UNKNOWN_SEATS',", "['UNKNOWN_SEATS_OFF',", 'AC6'],
  ['A passed start date is offered as the next step', 'src/core/planner.js',
    '...(dated.date >= today ? [dated] : [])', 'dated', 'AC14'],
];

let survived = 0;
for (const [what, file, from, to, check] of MUTATIONS) {
  const dir = mkdtempSync(join(tmpdir(), 'pathways-mutant-'));
  cpSync(root, dir, { recursive: true, filter: (p) => !p.includes('/.git') && !p.includes('/.vercel') });
  const path = join(dir, file);
  const source = readFileSync(path, 'utf8');
  if (!source.includes(from)) throw new Error(`Mutation "${what}" no longer applies to ${file}. Update scripts/mutate.mjs.`);
  writeFileSync(path, source.replace(from, to));
  const run = spawnSync(process.execPath, ['scripts/test.mjs'], { cwd: dir, encoding: 'utf8' });
  const caught = run.status !== 0 && new RegExp(`^✖ ${check}\\b`, 'm').test(run.stdout);
  if (!caught) survived++;
  console.log(`${caught ? 'CAUGHT  ' : 'SURVIVED'}  ${what}  (expected ${check} to fail)`);
  rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${survived ? 'FAIL' : 'PASS'}: ${MUTATIONS.length - survived} of ${MUTATIONS.length} mutations caught.`);
process.exit(survived ? 1 : 0);
