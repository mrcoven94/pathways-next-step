import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startApp, LOG_FILE } from './helpers.js';

// Strings that could only reach the log if personal data leaked into a model call.
const NAME = 'Zyxquorra';
const NOTE = 'CANARY-NOTE my mom works nights, text me at 555-0142';
const QUESTION = 'CANARY-QUESTION I am 17 and live on Quillfeather Lane, how much does it pay?';

test('AC8 minors\' data: her name, advisor note and typed question reach the advisor and never the model log', async () => {
  const s = await startApp();
  try {
    const { plan, summary } = await s.plan({ age18: 'unsure', diploma: 'no', lean: 'earn' });
    const answer = await s.ask(QUESTION);
    assert.equal(answer.kind, 'answer', 'the question still gets answered');

    const ticket = await s.post('/api/handoff', {
      first_name: NAME,
      note: NOTE,
      reasons: plan.escalations.map((e) => e.code),
      next_step: plan.next_step.action,
    });
    assert.match(ticket.body.code, /^ADV-[A-Z2-9]{4}$/);
    assert.equal(ticket.body.label, 'This is a request for an advisor, not an application.');

    // The advisor gets what they need.
    const queued = s.app.handoffs.at(-1);
    assert.equal(queued.first_name, NAME);
    assert.equal(queued.note, NOTE);

    // The model saw a placeholder, never the name; the browser fills it in after.
    assert.match(summary.text, /\{first_name\}/);
    const log = readFileSync(LOG_FILE, 'utf8');
    for (const canary of [NAME, 'CANARY-NOTE', '555-0142', 'CANARY-QUESTION', 'Quillfeather', 'I am 17']) {
      assert.ok(!log.includes(canary), `"${canary}" must not appear in model-calls.log`);
    }
    for (const call of s.app.gateway.calls) {
      for (const canary of [NAME, 'CANARY', 'Quillfeather']) assert.ok(!call.sent.includes(canary));
    }
  } finally {
    await s.close();
  }
});

test('AC8b the hand-off queue and names are never served over HTTP', async () => {
  const s = await startApp();
  try {
    await s.post('/api/handoff', { first_name: NAME, note: NOTE, reasons: [] });
    for (const path of ['/api/handoff', '/api/handoffs', '/api/log', '/api/records']) {
      const body = await (await fetch(s.base + path)).text();
      assert.ok(!body.includes(NAME), `${path} does not expose the name`);
    }
  } finally {
    await s.close();
  }
});
