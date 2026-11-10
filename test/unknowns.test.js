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
  // Found by the second independent review (Sol).
  ['seat availability', 'Is the evening program full?', 'UNKNOWN_SEATS'],
  ['exact aid amount', 'How much will FAFSA give me?', 'UNKNOWN_AID_AMOUNT'],
  ['her own eligibility', 'Will I get into Northline if I have a diploma?', 'UNKNOWN_PERSONAL_ELIGIBILITY'],
  ["a listed date, but another program's", 'Does Northline start Jan 6, 2027?', 'UNKNOWN_START_DATE'],
  ['a listed day, but the wrong year', 'Does Cascade start Jan 6, 2026?', 'UNKNOWN_START_DATE'],
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

  // The one can't-confirm answer that states a fact ("the award amount varies") carries its source.
  const amount = await s.ask('How much grant money will I get?');
  assert.deepEqual(amount.facts.map((f) => [f.record_id, f.text, f.checked]), [['AID-A', 'Award amount varies', '2026-10-18']]);

  const diploma = await s.ask('Do I need my diploma?');
  assert.deepEqual(diploma.open, ['DIPLOMA_TIMING_UNKNOWN']);
});

test('AC10 crisis: crisis words in any box stop the request and show 988 and 911, with no model call', async () => {
  const before = s.app.gateway.calls.length;
  // Phones type curly apostrophes; the second review found these slipped past.
  for (const q of ['i want to kill myself', 'Someone is hurting me at home', 'I want to die', 'I don\u2019t want to live', 'I do not want to live', 'I don\u2019t want to be here; how much does Northline pay?']) {
    assert.deepEqual(askRequest(q), { crisis: true }, `question box: ${q}`);
    assert.deepEqual(handoffRequest({ name: q }), { crisis: true }, `name field: ${q}`);
    assert.deepEqual(handoffRequest({ note: q }), { crisis: true }, `advisor note: ${q}`);
  }
  const page = await (await fetch(s.base + '/')).text();
  assert.match(page, /id="crisis"[\s\S]*tel:911[\s\S]*tel:988/);
  assert.equal(s.app.gateway.calls.length, before);
});

test('AC10c the phrases the interview panel asked about show 988 and 911, and everyday uses of the same words do not', async () => {
  const { isCrisis } = await import('../src/core/topics.js');
  // Asked on 2026-11-10: what happens when a student types these? Before this check, both went to an advisor as an unmatched question.
  for (const q of [
    'I want to disappear', 'i just want to disappear', 'I wish I could disappear', 'I wish I could just disappear forever',
    'my parents kicked me out and I have nowhere to sleep', 'My mom kicked me out', 'I got kicked out of my house', 'I have nowhere to stay tonight',
    'I have no place to sleep', 'we are homeless right now', 'I\u2019m homeless', 'I am sleeping in my car', 'they threw me out',
  ]) {
    assert.equal(isCrisis(q), true, q);
    assert.deepEqual(askRequest(q), { crisis: true }, `question box: ${q}`);
    assert.deepEqual(handoffRequest({ note: q }), { crisis: true }, `advisor note: ${q}`);
  }
  // The same words in an ordinary question still get an answer or an advisor, not the card.
  for (const q of [
    'my teacher kicked me out of class, can I still apply', 'I got kicked out of the program last year', 'does the Nov 30 deadline disappear if I miss it',
    'will my saved plan disappear', 'is there anywhere to stay near Cascade', 'how do homeless students apply for aid',
  ]) {
    assert.equal(isCrisis(q), false, q);
  }
});

