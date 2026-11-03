import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp } from './helpers.js';
import { stepsFor, withName } from '../public/client.js';

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
