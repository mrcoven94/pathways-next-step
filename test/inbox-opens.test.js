import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startApp } from './helpers.js';

const NOTE = 'OPENS-CANARY: my mom works nights, so text me after 4.';
const OTHER = 'OTHER-CANARY: a different student entirely.';

test('AC20c the opened request says how many times its note was opened and when before, and nothing else counts', async () => {
  const s = await startApp();
  const get = async (path) => (await fetch(s.base + path)).json();
  const post = (path, body) => fetch(s.base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const mine = (await s.post('/api/handoff', { first_name: 'Rio', note: NOTE, reasons: ['UNKNOWN_SEATS'] })).body.code;
    const other = (await s.post('/api/handoff', { first_name: 'Sam', note: OTHER, reasons: [] })).body.code;
    const one = `/api/advisor/requests/${mine}`;

    const first = (await get(one)).request;
    assert.equal(first.opens, 1, 'the first read is the first open');
    assert.equal(first.last_opened_at, null, 'nobody opened it before');
    const firstAt = s.app.opens.at(-1).at;

    // Listing and triage open nothing, so they add nothing to the count.
    await get('/api/advisor/requests');
    assert.equal((await post(`${one}/status`, { status: 'in_progress' })).status, 200);
    await get(`/api/advisor/requests/${other}`); // another request's open is not this one's

    const second = (await get(one)).request;
    assert.equal(second.opens, 2);
    assert.equal(second.last_opened_at, firstAt, 'the previous open is the first one, not this read');
    assert.equal(second.note, NOTE);
    assert.ok(!JSON.stringify(second).includes('OTHER-CANARY') && !JSON.stringify(second).includes(other), 'no other request\'s data');

    // The list rows stay as they were: no count there.
    const rows = (await get('/api/advisor/requests')).requests;
    assert.ok(rows.every((r) => !('opens' in r) && !('last_opened_at' in r)));

    // The samples are counted the same way.
    const sample = rows.find((r) => r.sample && r.has_note).code;
    const a = (await get(`/api/advisor/requests/${sample}`)).request;
    const b = (await get(`/api/advisor/requests/${sample}`)).request;
    assert.deepEqual([a.opens, a.last_opened_at, b.opens], [1, null, 2]);
    assert.equal(b.last_opened_at, s.app.opens.at(-2).at);
  } finally {
    await s.close();
  }
});
