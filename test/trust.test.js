import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, badModel, ALL_ANSWERS } from './helpers.js';
import { checkPayload, PayloadRejected } from '../src/core/gateway.js';

const CLAIM = /\b(eligible|accepted|admitted|enrolled|approved|awarded|you'?re in)\b/i;
const DANI = { age18: 'yes', diploma: 'yes', lean: 'earn' };

test('AC7a no reply in any scenario says she is eligible, accepted, enrolled, approved or awarded', async () => {
  const s = await startApp();
  try {
    for (const answers of ALL_ANSWERS) {
      const { summary } = await s.plan(answers);
      assert.equal(summary.verdict, 'used');
      assert.doesNotMatch(summary.text, CLAIM, JSON.stringify(answers));
    }
    for (const q of ['how much does it pay', 'when do applications close', 'what does cascade cost', 'do i need to be 18', 'diploma?', 'how do i apply for aid', 'how long is it', 'is there an evening option', 'when does it start', 'how fast does an advisor answer']) {
      const r = await s.ask(q);
      assert.doesNotMatch(r.text, CLAIM, q);
    }
  } finally {
    await s.close();
  }
});

const BAD = [
  ['claims eligibility', { text: "Great news {first_name}, you're eligible for Northline!", cites: ['PRG-02'] }, 'STATUS_CLAIM'],
  ['says she applied', { text: 'Your application is submitted, {first_name}.', cites: ['PRG-02'] }, 'STATUS_CLAIM'],
  ['invents a dollar figure', { text: 'You could get a 5,000 USD grant. Applications close Nov 30, 2026.', cites: ['PRG-02'] }, 'UNGROUNDED_NUMBER'],
  ['invents a date', { text: 'Applications close Dec 15, 2026.', cites: ['PRG-02'] }, 'UNGROUNDED_NUMBER'],
  ['cites a record that does not exist', { text: 'Apply soon, {first_name}.', cites: ['PRG-99'] }, 'CITES_UNGIVEN_RECORD'],
  ['cites nothing', { text: 'Apply soon, {first_name}.', cites: [] }, 'NO_CITATION'],
  ['asks for a placeholder it was not given', { text: 'Hi {last_name}, apply by Nov 30, 2026.', cites: ['PRG-02'] }, 'UNKNOWN_PLACEHOLDER'],
  ['returns prose instead of JSON', 'Sure! Here is a plan for Dani.', 'NOT_JSON'],
];

test('AC7b a misbehaving model is caught, replaced with the code-built template, and logged as replaced', async () => {
  for (const [what, reply, code] of BAD) {
    const s = await startApp({ model: badModel(what, reply) });
    try {
      const { summary } = await s.plan(DANI);
      assert.equal(summary.verdict, 'replaced', what);
      assert.equal(summary.text, '{first_name}, your next step is to apply to the Northline Electrical Apprenticeship. Applications close Nov 30, 2026.', what);
      const call = s.app.gateway.calls.at(-1);
      assert.ok(call.problems.some((p) => p.code === code), `${what}: flagged ${code}, got ${JSON.stringify(call.problems)}`);
    } finally {
      await s.close();
    }
  }
});

test('AC9 allowlist: the gateway refuses a payload with an extra field or a string outside the closed set', () => {
  const ok = {
    task: 'answer_topic', topic: 'PAY', open: [],
    facts: [{ record_id: 'PRG-02', text: 'Paid' }],
  };
  assert.doesNotThrow(() => checkPayload(ok));

  const leaks = [
    ['an extra field', { ...ok, first_name: 'Dani' }],
    ['a typed question', { ...ok, question: 'my mom lost her job, can I still apply?' }],
    ['free text dressed as a fact', { ...ok, facts: [{ record_id: 'PRG-02', text: 'Dani is 17 and lives on Elm St' }] }],
    ['an extra key on a fact', { ...ok, facts: [{ record_id: 'PRG-02', text: 'Paid', note: 'call me' }] }],
    ['a made-up record', { ...ok, facts: [{ record_id: 'PRG-99', text: 'Paid' }] }],
    ['a made-up topic', { ...ok, topic: 'Dani asked about her dad' }],
    ['a made-up reason code', { ...ok, open: ['SHE_SEEMS_SAD'] }],
    ['an unknown task', { ...ok, task: 'chat' }],
  ];
  for (const [what, payload] of leaks) assert.throws(() => checkPayload(payload), PayloadRejected, what);
});

test('AC9b the API answers 400, not 500, when a client sends something outside the allowlist', async () => {
  const s = await startApp();
  try {
    assert.equal((await s.post('/api/answer', { topic: 'PAY', record_ids: ['PRG-02'], question: 'hi' })).status, 200); // extra keys are ignored, never forwarded
    assert.equal((await s.post('/api/answer', { topic: 'GOSSIP', record_ids: ['PRG-02'] })).status, 400);
    assert.equal((await s.post('/api/plan', { answers: { age18: 'maybe', diploma: 'yes', lean: 'earn' } })).status, 400);
  } finally {
    await s.close();
  }
});
