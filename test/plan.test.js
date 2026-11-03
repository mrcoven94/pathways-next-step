import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, ALL_ANSWERS } from './helpers.js';
import { getRecord } from '../src/core/records.js';

let s;
before(async () => (s = await startApp()));
after(() => s.close());

const outcome = (plan, id) => plan.programs.find((p) => p.record_id === id).outcome;
const codes = (plan) => plan.escalations.map((e) => e.code);

test('AC1 next step: yes, yes, earn gets "apply to Northline by Nov 30, 2026", cited to PRG-02', async () => {
  const { plan, summary } = await s.plan({ age18: 'yes', diploma: 'yes', lean: 'earn' });
  assert.equal(plan.next_step.action, 'apply_by_deadline');
  assert.equal(plan.next_step.record_id, 'PRG-02');
  assert.deepEqual(plan.next_step.facts[0], {
    record_id: 'PRG-02', key: 'applications_close', text: 'Applications close Nov 30, 2026', checked: '2026-10-20', date: '2026-11-30',
  });
  assert.equal(outcome(plan, 'PRG-02'), 'fits_listed_rules');
  assert.equal(plan.label, 'This is your plan, not an application.');
  assert.match(summary.text, /Nov 30, 2026/);
});

test('AC2 grounding: every fact in all 27 tap combinations cites a real record and its checked date', async () => {
  for (const answers of ALL_ANSWERS) {
    const { plan, summary } = await s.plan(answers);
    const facts = [...plan.next_step.facts, ...plan.programs.flatMap((p) => p.facts), ...plan.aid, ...plan.advisor.facts];
    for (const f of facts) {
      const record = getRecord(f.record_id);
      assert.ok(record, `${f.record_id} exists`);
      assert.equal(f.checked, record.checked, `${f.record_id} carries its checked date`);
      assert.ok(record.facts.some((x) => x.text === f.text), `"${f.text}" is word for word in ${f.record_id}`);
    }
    for (const id of summary.cites) assert.ok(getRecord(id), `summary cites real record ${id}`);
  }
});

test('AC3 age rule: not 18 by Mar 1, 2027 misses PRG-02 and moves Cascade to the front', async () => {
  const { plan } = await s.plan({ age18: 'no', diploma: 'yes', lean: 'earn' });
  assert.equal(outcome(plan, 'PRG-02'), 'misses_a_listed_rule');
  assert.ok(codes(plan).includes('AGE_RULE_MISSED'));
  assert.deepEqual(plan.programs.slice(0, 2).map((p) => p.record_id), ['PRG-01', 'PRG-04']);
  assert.equal(plan.next_step.action, 'start_aid_application');
});

test('AC4 unknowns: "not sure" on age, or no diploma yet, gives unknown and sends her to an advisor first', async () => {
  const unsureAge = (await s.plan({ age18: 'unsure', diploma: 'yes', lean: 'earn' })).plan;
  assert.equal(outcome(unsureAge, 'PRG-02'), 'unknown');
  assert.ok(codes(unsureAge).includes('AGE_UNCONFIRMED'));
  assert.equal(unsureAge.next_step.action, 'ask_advisor_then_apply');

  for (const diploma of ['no', 'unsure']) {
    const plan = (await s.plan({ age18: 'yes', diploma, lean: 'earn' })).plan;
    assert.equal(outcome(plan, 'PRG-02'), 'unknown');
    assert.ok(codes(plan).includes('DIPLOMA_TIMING_UNKNOWN'));
    assert.equal(plan.next_step.action, 'ask_advisor_then_apply');
  }
});

test('AC5 clock: after Nov 30, 2026 the deadline has passed; 46 days after a check the record is stale', async () => {
  const late = await startApp({ today: '2026-12-01' });
  try {
    const { plan } = await late.plan({ age18: 'yes', diploma: 'yes', lean: 'earn' });
    assert.equal(outcome(plan, 'PRG-02'), 'misses_a_listed_rule');
    assert.ok(codes(plan).includes('DEADLINE_PASSED'));
    assert.notEqual(plan.next_step.record_id, 'PRG-02');
  } finally {
    await late.close();
  }

  const fresh = (await s.plan({ age18: 'yes', diploma: 'yes', lean: 'earn' }, '2026-12-04')).plan; // Oct 20 + 45 days
  assert.ok(!fresh.escalations.some((e) => e.code === 'STALE_RECORD' && e.record_id === 'PRG-02'));
  const stale = (await s.plan({ age18: 'yes', diploma: 'yes', lean: 'earn' }, '2026-12-05')).plan;
  assert.ok(stale.escalations.some((e) => e.code === 'STALE_RECORD' && e.record_id === 'PRG-02'));
});
