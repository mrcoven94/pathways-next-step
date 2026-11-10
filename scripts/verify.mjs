// `npm run verify`: the checks plus a live smoke test of the running app.
// With BASE_URL set (for example the production URL), it checks that deployment instead.

import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createApp } from '../src/app.js';

const tests = spawnSync(process.execPath, ['scripts/test.mjs'], { stdio: 'inherit' });
if (tests.status !== 0) process.exit(tests.status ?? 1);

let base = process.env.BASE_URL;
let server;
if (!base) {
  server = createServer(createApp().handle);
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
}

const checks = [
  ['GET /', async () => { const r = await fetch(base + '/'); const t = await r.text(); return r.ok && t.includes('Let’s find your next step') && t.includes('tel:988'); }],
  ['GET /how', async () => { const r = await fetch(base + '/how'); return r.ok && (await r.text()).includes('What the model saw'); }],
  ['GET /report', async () => {
    const r = await fetch(base + '/report'); const t = await r.text();
    const data = await Promise.all(['/report.js', '/report-client.js', '/data/rampart-eval.json', '/data/mutations.json', '/data/synthetic-notes.json'].map((p) => fetch(base + p).then((x) => x.ok)));
    return r.ok && t.includes('What protects the private note') && data.every(Boolean);
  }],
  ['GET /src/core/topics.js', async () => (await fetch(base + '/src/core/topics.js')).ok],
  ['GET /src/core/gateway.js is not served', async () => (await fetch(base + '/src/core/gateway.js')).status === 404],
  ['GET /advisor opens with no sign-in, and the list carries no note', async () => {
    const page = await fetch(base + '/advisor');
    const text = await page.text();
    const { requests } = await (await fetch(base + '/api/advisor/requests')).json();
    return page.ok && !/type="password"/.test(text) && requests.filter((r) => r.sample).length === 2 && requests.every((r) => !('note' in r));
  }],
  ['POST /api/plan', async () => {
    const r = await fetch(base + '/api/plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ answers: { considering: ['PRG-02', 'PRG-01'], age18: 'yes', diploma: 'yes', lean: 'earn' }, today: '2026-11-03' }) });
    const b = await r.json();
    return r.ok && b.plan.next_step.action === 'apply_by_deadline' && b.summary.verdict === 'used';
  }],
  ['POST /api/answer can\'t confirm', async () => {
    const r = await fetch(base + '/api/answer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cannot_confirm: 'UNKNOWN_SEATS' }) });
    return r.ok && (await r.json()).kind === 'cannot_confirm';
  }],
];

let failed = 0;
for (const [name, check] of checks) {
  const ok = await check().catch(() => false);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${base})`);
}
server?.close();
process.exit(failed ? 1 : 0);
