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
  ['Facts lose their last-checked date', 'src/core/records.js',
    'checked: record.checked,', 'checked: null,', 'AC2'],
  ['"No diploma yet" no longer sends her to an advisor', 'src/core/planner.js',
    "if (diploma !== 'yes') open.push('DIPLOMA_TIMING_UNKNOWN');", '', 'AC4'],
  ['The Nov 30 deadline never passes', 'src/core/planner.js',
    "if (today > fact('PRG-02', 'applications_close').date) missed.push('DEADLINE_PASSED');", '', 'AC5'],
  ['"Today" is the UTC date', 'src/app.js',
    "export function todayIn(timeZone = 'America/Los_Angeles'", "export function todayIn(timeZone = 'UTC'", 'AC5b'],
  ['The scripted model claims she is eligible', 'src/core/mock-model.js',
    "'{first_name}, {fact:PRG-02:paid} {fact:PRG-02:wage}'", "\"{first_name}, you're eligible. {fact:PRG-02:paid}\"", 'AC7a'],
  ['Facts are shown as raw record text instead of sentences', 'src/core/templates.js',
    '[/^Paid$/, (s) => `${s} is paid.`],', "[/^Paid$/, () => 'Paid.'],", 'AC7c'],
  ['Model calls stop being logged', 'src/core/gateway.js',
    'if (logFile) appendFileSync(logFile, formatEntry(entry));', '', 'AC11'],
  ['The advisor queue is served over HTTP', 'src/app.js',
    "if (req.method === 'GET' && pathname === '/api/log')", "if (req.method === 'GET' && pathname === '/api/handoffs') return send(res, 200, handoffs);\n      if (req.method === 'GET' && pathname === '/api/log')", 'AC8b'],
  ['Bad requests crash with a 500 instead of a 400', 'src/app.js',
    'if (err instanceof BadAnswers || err instanceof PayloadRejected) return send', 'if (false) return send', 'AC9b'],
  ['Everyone is asked her age, even for Cascade only', 'src/core/planner.js',
    "if (considering.includes('PRG-02')) q.push('age18', 'diploma');", "q.push('age18', 'diploma');", 'AC12'],
  ['No fallback path when everything she picked is ruled out', 'src/core/planner.js',
    "const suggested = programs.every((p) => p.outcome === 'misses_a_listed_rule');", 'const suggested = false;', 'AC13'],
  ['A suggested question leads nowhere', 'public/client.js',
    "[null, 'How fast does an advisor answer?'],", "[null, 'How fast?'],", 'AC15'],
  ['The advisor answer date is wrong', 'src/core/planner.js',
    'const answer_by = addBusinessDays(today, 2);', 'const answer_by = addBusinessDays(today, 20);', 'AC17'],
  ['Thanksgiving counts as a business day', 'src/core/planner.js',
    "'2026-11-26', ", '', 'AC17'],
  ['The note is kept in the queue as plain text', 'src/app.js',
    'note: seal(raw),', 'note: raw,', 'AC18'],
  ['A sealed note gives up its text as JSON', 'src/core/private.js',
    'toJSON() { return MARK; }', 'toJSON() { return this.#text; }', 'AC18'],
  ['The hand-off sends the note straight to the model, around the gateway (the log never sees it)', 'src/app.js',
    'handoffs.push(request);', 'handoffs.push(request); model.complete(raw);', 'AC18'],
  ['The hand-off prints the note to the server log', 'src/app.js',
    'handoffs.push(request);', "handoffs.push(request); console.log('handoff', raw);", 'AC18'],
  ['A request that is not JSON gets the parser\'s error back, which quotes the note', 'src/app.js',
    "if (err instanceof SyntaxError) return send(res, 400, { error: 'That request could not be read.' });", 'if (err instanceof SyntaxError) return send(res, 400, { error: err.message });', 'AC18'],
  ['Opening a note leaves no record', 'src/core/private.js',
    'audit.push({ purpose, code: String(code), at: new Date().toISOString() });', '', 'AC18'],
  ['The gateway checks the object it was handed, not the copy it sends', 'src/core/gateway.js',
    'const payload = checkPayload(plainCopy(given));', 'const payload = checkPayload(given);', 'AC19'],
  ['Extra fields are allowed in a model payload', 'src/core/gateway.js',
    'for (const k of Object.keys(v)) if (!Object.hasOwn(keys, k)) throw new PayloadRejected(`${path}: has a field that is not allowed`);', '', 'AC19'],
  ['A refused payload is quoted in the error', 'src/core/gateway.js',
    'throw new PayloadRejected(`${path}: not an allowed value`);', 'throw new PayloadRejected(`${path}: ${JSON.stringify(v)} is not an allowed value`);', 'AC19'],
  ['The inbox list carries the note', 'src/app.js',
    'const listed = ({ note, ...rest }) => ({ ...rest, has_note: !note.empty });', "const listed = ({ note, ...rest }) => ({ ...rest, has_note: !note.empty, note: Sealed.open(note, [], { purpose: 'advisor_read', code: rest.code }) });", 'AC20'],
  ['Two requests can share a code', 'src/app.js',
    'while (used.has(code)) code = handoffCode();', '', 'AC20b'],
  ['A code is given out again once its request has left the queue', 'src/app.js',
    'while (used.has(code)) code = handoffCode();', 'while (handoffs.some((h) => h.code === code)) code = handoffCode();', 'AC20b'],
  ['Crisis words in a sealed note are missed', 'src/app.js',
    'request.crisis = [request.first_name, raw, request.question].some(isCrisis);', 'request.crisis = [request.first_name, request.note, request.question].some(isCrisis);', 'AC10b'],
  ['Contact details in a note are shown to the advisor without asking', 'public/advisor-client.js',
    'segs.push({ text: s.slice(start, end), type: hidden[0] ?? sp.type, masked: hidden.length > 0 });', 'segs.push({ text: s.slice(start, end), type: sp.type, masked: false });', 'AC21'],
  ['Switching one kind on shows another kind found in the same text', 'public/advisor-client.js',
    'const hidden = sp.kinds.filter((k) => !shown.has(k));', 'const hidden = shown.has(sp.type) ? [] : [sp.type];', 'AC21'],
  ['The detector is loaded from a CDN again', 'public/rampart.js',
    "const BASE = new URL('./vendor/rampart/', import.meta.url);", "const BASE = new URL('https://cdn.jsdelivr.net/npm/@nationaldesignstudio/rampart-edge@2.0.5/', import.meta.url);", 'AC22'],
  ['Names in a note are shown to the advisor without asking', 'public/advisor-client.js',
    "  NAME: 'name', PHONE: 'phone', EMAIL: 'email', ADDRESS: 'address', GOV_ID: 'id', OTHER_ID: 'id',", "  PHONE: 'phone', EMAIL: 'email', ADDRESS: 'address', GOV_ID: 'id', OTHER_ID: 'id',", 'AC21'],
  ['The demo queue has no ceiling', 'src/app.js',
    'if (handoffs.length > MAX_QUEUE) handoffs.splice(0, handoffs.length - MAX_QUEUE);', '', 'AC20'],
  ['A status change sends the note back', 'src/app.js',
    'request.status = next;\n      return send(res, 200, { request: listed(request) });', "request.status = next;\n      return send(res, 200, { request: { ...listed(request), note: Sealed.open(request.note, [], { purpose: 'advisor_read', code }) } });", 'AC20'],
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
