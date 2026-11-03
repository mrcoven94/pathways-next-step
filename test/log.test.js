import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startApp, LOG_FILE } from './helpers.js';

test('AC11 log: every model call lands in model-calls.log with what was sent, what came back and the verdict', async () => {
  const s = await startApp();
  try {
    const sizeBefore = readFileSync(LOG_FILE, 'utf8').length;
    await s.plan({ age18: 'yes', diploma: 'yes', lean: 'earn' });
    await s.ask('when do applications close');
    await s.ask('how many seats are left'); // can't confirm: no model call, no entry

    const added = readFileSync(LOG_FILE, 'utf8').slice(sizeBefore);
    const entries = added.split(/^=== model call /m).filter(Boolean);
    assert.equal(s.app.gateway.calls.length, 2);
    assert.equal(entries.length, 2);
    s.app.gateway.calls.forEach((call, i) => {
      assert.ok(entries[i].includes(`--- sent ---\n${call.sent}\n--- received ---\n${call.received}\n--- verdict: used`));
    });
  } finally {
    await s.close();
  }
});
