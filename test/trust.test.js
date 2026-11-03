import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, badModel, ALL_ANSWERS, dani } from './helpers.js';
import { checkPayload, PayloadRejected } from '../src/core/gateway.js';

const CLAIM = /\b(eligible|accepted|admitted|enrolled|approved|awarded|you'?re in)\b/i;
const DANI = dani({ age18: 'yes', diploma: 'yes', lean: 'earn' });

test('AC7a no reply in any scenario says she is eligible, accepted, enrolled, approved or awarded', async () => {
  const s = await startApp();
  try {
    for (const answers of ALL_ANSWERS) {
      const { summary } = await s.plan(answers);
      assert.equal(summary.verdict, 'used', JSON.stringify([answers, s.app.gateway.calls.at(-1).problems, s.app.gateway.calls.at(-1).received]));
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
  ['claims eligibility', { text: "{first_name}, {fact:PRG-02:paid} You're eligible for Northline!" }, 'STATUS_CLAIM'],
  ['says she applied', { text: '{fact:PRG-02:paid} Your application is submitted, {first_name}.' }, 'STATUS_CLAIM'],
  ['invents a dollar figure', { text: '{fact:PRG-02:paid} You could get a 5,000 USD grant.' }, 'UNGROUNDED_NUMBER'],
  ['invents a date', { text: '{fact:PRG-02:paid} Applications close Dec 15, 2026.' }, 'UNGROUNDED_DATE'],
  ['points at a record that does not exist', { text: 'Apply soon, {first_name}. {fact:PRG-99:paid}' }, 'CITES_UNGIVEN_FACT'],
  ['points at nothing', { text: 'Apply soon, {first_name}.' }, 'NO_CITATION'],
  ['asks for a placeholder it was not given', { text: 'Hi {last_name}. {fact:PRG-02:paid}' }, 'UNKNOWN_PLACEHOLDER'],
  ['returns prose instead of JSON', 'Sure! Here is a plan for Dani.', 'NOT_JSON'],
  // Found by the first independent review (Sol): each passed the first version of the validator.
  ['moves the deadline by a month, same day and year', { text: '{fact:PRG-02:paid} Applications close Dec 30, 2026.' }, 'UNGROUNDED_DATE'],
  ['borrows the 18 from the age rule as a wage', { text: '{fact:PRG-02:paid} Northline pays 18 USD an hour.' }, 'UNGROUNDED_NUMBER'],
  ['says she qualifies', { text: '{fact:PRG-02:paid} You qualify for Northline.' }, 'STATUS_CLAIM'],
  ['invents a benefit with no number in it', { text: '{fact:PRG-02:paid} Northline provides free housing.' }, 'UNGROUNDED_WORD'],
  // Found by the second independent review (Sol): each passed the closed-vocabulary version.
  ['pins a real date on the wrong event', { text: '{fact:PRG-02:paid} Applications close Mar 1, 2027.' }, 'UNGROUNDED_DATE'],
  ["borrows another program's facts", { text: '{fact:PRG-02:paid} Northline has evening online classes.' }, 'UNGROUNDED_WORD'],
  ['shrinks 55% to 5%', { text: '{fact:PRG-02:paid} Northline starts at 5% of journey-level wage.' }, 'UNGROUNDED_NUMBER'],
  ['writes a number as a word', { text: '{fact:PRG-02:paid} Northline is paid one USD.' }, 'UNGROUNDED_NUMBER'],
];

test('AC7b a misbehaving model is caught, replaced with the code-built template, and logged as replaced', async () => {
  for (const [what, reply, code] of BAD) {
    const s = await startApp({ model: badModel(what, reply) });
    try {
      const { summary } = await s.plan(DANI);
      assert.equal(summary.verdict, 'replaced', what);
      assert.equal(summary.text, '{first_name}, your next step is to apply to the Northline Electrical Apprenticeship. Applications close Nov 30, 2026.', what);
      assert.deepEqual(summary.cites, ['PRG-02'], what);
      const call = s.app.gateway.calls.at(-1);
      assert.ok(call.problems.some((p) => p.code === code), `${what}: flagged ${code}, got ${JSON.stringify(call.problems)}`);
    } finally {
      await s.close();
    }
  }
});

test('AC7c the model points at facts; code writes them, so every fact shown is word for word from the records', async () => {
  const s = await startApp();
  try {
    const call = async () => s.app.gateway.calls.at(-1);
    const { summary } = await s.plan(dani({ age18: 'yes', diploma: 'yes', lean: 'earn' }));
    assert.equal(JSON.parse((await call()).received).text, '{first_name}, {fact:PRG-02:paid} Its deadline is the first on your road.');
    assert.equal(summary.text, '{first_name}, Northline Apprenticeship is paid. Its deadline is the first on your road.');

    // A misbehaving model's reply about the diploma still keeps the "ask an advisor when" caveat.
    const broken = await startApp({ model: badModel('broken', 'not json') });
    try {
      const r = await broken.ask('Do I need my diploma?');
      assert.equal(r.verdict, 'replaced');
      assert.match(r.text, /HS diploma or GED/);
      assert.match(r.text, /ask an advisor/);
    } finally {
      await broken.close();
    }
  } finally {
    await s.close();
  }
});

test('AC9 allowlist: the gateway refuses a payload with an extra field or a string outside the closed set', () => {
  const ok = {
    task: 'answer_topic', topic: 'PAY', open: [],
    facts: [{ record_id: 'PRG-02', key: 'paid', text: 'Paid' }],
  };
  assert.doesNotThrow(() => checkPayload(ok));

  const leaks = [
    ['an extra field', { ...ok, first_name: 'Dani' }],
    ['a typed question', { ...ok, question: 'my mom lost her job, can I still apply?' }],
    ['free text dressed as a fact', { ...ok, facts: [{ record_id: 'PRG-02', key: 'paid', text: 'Dani is 17 and lives on Elm St' }] }],
    ['an extra key on a fact', { ...ok, facts: [{ record_id: 'PRG-02', key: 'paid', text: 'Paid', note: 'call me' }] }],
    ['a made-up record', { ...ok, facts: [{ record_id: 'PRG-99', key: 'paid', text: 'Paid' }] }],
    ['a real fact pinned to the wrong record', { ...ok, facts: [{ record_id: 'PRG-01', key: 'paid', text: 'Paid' }] }],
    ['a made-up topic', { ...ok, topic: 'Dani asked about her dad' }],
    ['a made-up reason code', { ...ok, open: ['SHE_SEEMS_SAD'] }],
    ['an unknown task', { ...ok, task: 'chat' }],
    // Found by the independent review (Sol): inherited property names slipped past `in`.
    ['a field named like a built-in', { ...ok, constructor: 'CANARY-STUDENT-NAME' }],
    ['a task named like a built-in', { ...ok, task: 'toString' }],
    ['a built-in name on a nested fact', { ...ok, facts: [{ record_id: 'PRG-02', key: 'paid', text: 'Paid', hasOwnProperty: 'Dani' }] }],
  ];
  for (const [what, payload] of leaks) assert.throws(() => checkPayload(payload), PayloadRejected, what);
});

test('AC9b the API answers 400, not 500, when a client sends something outside the allowlist', async () => {
  const s = await startApp();
  try {
    assert.equal((await s.post('/api/answer', { topic: 'PAY', record_ids: ['PRG-02'], question: 'hi' })).status, 200); // extra keys are ignored, never forwarded
    assert.equal((await s.post('/api/answer', { topic: 'GOSSIP', record_ids: ['PRG-02'] })).status, 400);
    assert.equal((await s.post('/api/plan', { answers: dani({ age18: 'maybe', diploma: 'yes', lean: 'earn' }) })).status, 400);
  } finally {
    await s.close();
  }
});
