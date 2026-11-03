import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp } from './helpers.js';
import { askRequest, handoffRequest } from '../public/client.js';

let s;
before(async () => (s = await startApp()));
after(() => s.close());

const UNKNOWNS = [
  ['seat availability', 'Are there still spots in the Northline apprenticeship?', 'UNKNOWN_SEATS'],
  ['her own eligibility', 'Am I eligible for Northline?', 'UNKNOWN_PERSONAL_ELIGIBILITY'],
  ['her own eligibility', 'will i get in', 'UNKNOWN_PERSONAL_ELIGIBILITY'],
  ['exact aid amount', 'How much grant money will I get?', 'UNKNOWN_AID_AMOUNT'],
  ['unlisted start date', 'When does Riverbend start?', 'UNKNOWN_START_DATE'],
  ['unlisted start date', 'Does Cascade start again in the fall?', 'UNKNOWN_START_DATE'],
  ['not in the records', 'What does Northline cost?', 'NOT_IN_RECORDS'],
  ['no matching topic', 'Can I bring my dog?', 'UNMATCHED_QUESTION'],
  // Found by the independent review (Sol): these first fell through to a model answer.
  ['exact aid amount', 'What aid amount will I get?', 'UNKNOWN_AID_AMOUNT'],
  ['unlisted start date', 'Does Northline start April 1, 2027?', 'UNKNOWN_START_DATE'],
  ['her own eligibility', 'Will Northline accept me if I have a diploma?', 'UNKNOWN_PERSONAL_ELIGIBILITY'],
];

test('AC6 unknowns: seats, her eligibility, aid amounts and unlisted dates say "can\'t confirm", offer an advisor, and skip the model', async () => {
  for (const [what, question, code] of UNKNOWNS) {
    const before = s.app.gateway.calls.length;
    const r = await s.ask(question);
    assert.equal(r.kind, 'cannot_confirm', `${what}: "${question}"`);
    assert.equal(r.code, code, `${what}: "${question}"`);
    assert.match(r.text, /can't confirm|don't say/i);
    assert.ok(r.advisor.some((f) => f.record_id === 'ADV-01' && f.text === 'Response within 2 business days'));
    assert.equal(s.app.gateway.calls.length, before, `${what}: no model call`);
  }
});

test('AC6b known topics answer from the records, with sources', async () => {
  const pay = await s.ask('How much does the apprenticeship pay?');
  assert.equal(pay.kind, 'answer');
  assert.deepEqual(pay.facts.map((f) => f.text), ['Paid', 'Starts at 55% of journey-level wage']);
  assert.ok(pay.facts.every((f) => f.record_id === 'PRG-02' && f.checked === '2026-10-20'));

  const diploma = await s.ask('Do I need my diploma?');
  assert.deepEqual(diploma.open, ['DIPLOMA_TIMING_UNKNOWN']);
});

test('AC10 crisis: crisis words in any box stop the request and show 988 and 911, with no model call', async () => {
  const before = s.app.gateway.calls.length;
  for (const q of ['i want to kill myself', 'Someone is hurting me at home', 'I want to die']) {
    assert.deepEqual(askRequest(q), { crisis: true }, `question box: ${q}`);
    assert.deepEqual(handoffRequest({ name: q }), { crisis: true }, `name field: ${q}`);
    assert.deepEqual(handoffRequest({ note: q }), { crisis: true }, `advisor note: ${q}`);
  }
  const page = await (await fetch(s.base + '/')).text();
  assert.match(page, /id="crisis"[\s\S]*tel:911[\s\S]*tel:988/);
  assert.equal(s.app.gateway.calls.length, before);
});
