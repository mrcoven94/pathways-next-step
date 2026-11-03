import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp } from './helpers.js';
import { stepsFor, withName, askRequest, suggestionsFor, matchSuggestions, previewQuestion } from '../public/client.js';

let s;
before(async () => (s = await startApp()));
after(() => s.close());

test('AC12 context first: she says where she is and what she is weighing before any question about her age', () => {
  assert.deepEqual(stepsFor({}), ['stage', 'considering']);
  assert.deepEqual(stepsFor({ stage: 'working' }), ['stage'], 'not finishing high school: no program questions at all');
  assert.deepEqual(stepsFor({ stage: 'high_school', considering: ['PRG-01', 'PRG-04'] }), ['stage', 'considering'], 'Cascade only: never asked her age');
  assert.deepEqual(stepsFor({ stage: 'high_school', considering: ['PRG-02'] }), ['stage', 'considering', 'age18', 'diploma']);
  assert.deepEqual(stepsFor({ stage: 'high_school', considering: ['PRG-02', 'PRG-03'] }), ['stage', 'considering', 'age18', 'diploma', 'lean']);
});

test('AC12b the server asks for the same taps the screen asks for, and no more', async () => {
  assert.equal((await s.post('/api/plan', { answers: { considering: ['PRG-01'] } })).status, 200, 'Cascade only needs no age');
  assert.equal((await s.post('/api/plan', { answers: { considering: ['PRG-02'] } })).status, 400, 'Northline needs the age and diploma taps');
  assert.equal((await s.post('/api/plan', { answers: { considering: ['PRG-05'] } })).status, 400, 'CDL is the other persona');
  assert.equal((await s.post('/api/plan', { answers: { considering: [] } })).status, 400);
});

test('AC13 each path reaches a dated next step from the records', async () => {
  const riverbend = (await s.plan({ considering: ['PRG-03'] })).plan;
  assert.equal(riverbend.next_step.action, 'start_aid_application');
  assert.deepEqual(riverbend.next_step.facts.map((f) => f.text), ['Apply through FAFSA or the state aid application', 'Priority deadline Feb 1, 2027']);

  // Only Northline, and the age rule rules it out: she still leaves with a step, from paths with no age rule.
  const ruledOut = (await s.plan({ considering: ['PRG-02'], age18: 'no', diploma: 'yes' })).plan;
  assert.equal(ruledOut.next_step.action, 'start_aid_application');
  assert.deepEqual(ruledOut.programs.filter((p) => p.suggested).map((p) => p.record_id), ['PRG-01', 'PRG-04']);
});

test('AC14 a date that has passed is never offered as the next step (found by the independent review)', async () => {
  const { plan } = await s.plan({ considering: ['PRG-02', 'PRG-01', 'PRG-04'], age18: 'no', diploma: 'yes', lean: 'earn' }, '2027-02-01');
  assert.ok(plan.next_step.facts.every((f) => !f.date || f.date >= plan.today), JSON.stringify(plan.next_step.facts));
  assert.ok(plan.escalations.some((e) => e.code === 'START_DATE_PASSED' && e.record_id === 'PRG-01'));

  // Even when the model fails and code writes the reply, the passed date stays out (second review).
  const broken = await startApp({ model: { name: 'broken', complete: async () => 'not json' }, today: '2027-02-01' });
  try {
    const { summary } = await broken.plan({ considering: ['PRG-01'] });
    assert.equal(summary.verdict, 'replaced');
    assert.doesNotMatch(summary.text, /Jan 6, 2027/);
  } finally {
    await broken.close();
  }
});

test('her name is filled in on the phone, after the reply, and the reply still reads without it', () => {
  assert.equal(withName('{first_name}, apply by Nov 30, 2026.', 'Dani'), 'Dani, apply by Nov 30, 2026.');
  assert.equal(withName('{first_name}, apply by Nov 30, 2026.', ''), 'Apply by Nov 30, 2026.');
});

test('AC15 every question the box suggests is answered from the records or routed to an advisor, never dropped', async () => {
  const sets = [['PRG-02'], ['PRG-01', 'PRG-04'], ['PRG-03'], ['PRG-02', 'PRG-01', 'PRG-04', 'PRG-03']];
  for (const considering of sets) {
    for (const q of suggestionsFor(considering)) {
      const req = askRequest(q, considering);
      assert.notEqual(req.body?.cannot_confirm, 'UNMATCHED_QUESTION', q);
      const r = await s.ask(q, considering);
      assert.ok(r.kind === 'answer' ? r.verdict === 'used' && r.facts.length : r.code !== 'NOT_IN_RECORDS', `${q}: ${JSON.stringify(r)}`);
    }
  }
  assert.deepEqual(matchSuggestions(suggestionsFor(['PRG-02']), 'pay'), ['How much does Northline pay?']);
  assert.deepEqual(previewQuestion('are there seats left', ['PRG-02']), { kind: 'advisor' });
  assert.deepEqual(previewQuestion('how much does it pay', ['PRG-02']), { kind: 'records', about: 'pay' });
});

test('AC17 her next step is concrete for this week: when the advisor answers, and whether that beats the deadline', async () => {
  const { plan } = await s.plan({ considering: ['PRG-02', 'PRG-01', 'PRG-04'], age18: 'yes', diploma: 'no', lean: 'earn' });
  // Tue Nov 3 + 2 business days (ADV-01) = Thu Nov 5, before Nov 30.
  assert.deepEqual(plan.next_step.advisor, { answer_by: '2026-11-05', before_deadline: true, fact: { record_id: 'ADV-01', key: 'response', text: 'Response within 2 business days', checked: null } });
  assert.deepEqual(plan.next_step.why, ['SHE_PREFERS_LEARNING_BY_DOING', 'EARLIEST_DEADLINE']);

  // Asked on Fri Nov 27, the answer comes Tue Dec 1: after the deadline, and the plan says so.
  const late = (await s.plan({ considering: ['PRG-02'], age18: 'yes', diploma: 'no' }, '2026-11-27')).plan;
  assert.equal(late.next_step.advisor.answer_by, '2026-12-01');
  assert.equal(late.next_step.advisor.before_deadline, false);
  assert.deepEqual(late.next_step.why, ['EARLIEST_DEADLINE']);

  // Asked Wed Nov 25: Thanksgiving doesn't count, so the answer comes Mon Nov 30, the deadline day itself.
  const thanksgiving = (await s.plan({ considering: ['PRG-02'], age18: 'yes', diploma: 'no' }, '2026-11-25')).plan;
  assert.equal(thanksgiving.next_step.advisor.answer_by, '2026-11-30');
  assert.equal(thanksgiving.next_step.advisor.before_deadline, false);
});
