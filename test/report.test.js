// AC23: /report shows what protects the private note, read from public/data, with nothing hard-coded.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startApp } from './helpers.js';
import { esc, runsOf, kindRows, kindTotals, keyRows, timing, headline, noteRows, checkRows, mutationSummary, compareKinds, NOTE_CHECKS } from '../public/report-client.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const rampart = JSON.parse(read('public/data/rampart-eval.json'));
const mutations = JSON.parse(read('public/data/mutations.json'));
const fixtures = JSON.parse(read('public/data/synthetic-notes.json')).notes;
const run = runsOf(rampart)[0];
const clone = (x) => structuredClone(x);

test('AC23 the kind table adds up to what the evaluation counted, and every note in it has a fixture', () => {
  const rows = kindRows(run);
  for (const r of rows) assert.equal(r.caught + r.partial + r.missed, r.total, r.kind);
  const t = kindTotals(rows);
  const expected = fixtures.reduce((n, f) => n + f.expect.length, 0);
  assert.equal(t.total, expected, 'one row value per expected detail in the fixtures');
  assert.equal(t.caught + t.partial + t.missed, t.total);
  assert.equal(noteRows(run, fixtures).length, run.perNote.length);
  assert.ok(noteRows(run, fixtures).every((n) => n.text.length > 0));
});

test('AC23 a kind with nothing expected is left out of the table', () => {
  const r = clone(run);
  r.byType.passport = { caught: 0, partial: 0, total: 0, missed: [] };
  assert.ok(!kindRows(r).some((row) => row.kind === 'passport'));
  assert.ok(kindRows(r).every((row) => row.total > 0));
});

test('AC23 the sensitive-notes row is counted from each note, not copied from a summary', () => {
  const r = clone(run);
  const before = keyRows(r).sensitivePassed;
  assert.equal(before.total, r.perNote.filter((n) => n.group === 'sensitive').length);
  r.perNote.find((n) => n.group === 'sensitive').verdict = 'BLOCK';
  r.sensitiveNoIdentifiers.allowed = 999; // a stale summary must not leak into the page
  assert.equal(keyRows(r).sensitivePassed.count, before.count - 1);
  assert.match(headline(r), new RegExp(`${before.count - 1} of ${before.total} of the most private notes`));
  r.perNote.find((n) => n.group === 'harmless').verdict = 'BLOCK';
  assert.equal(keyRows(r).harmlessBlocked.count, 1);
});

test('AC23 each note says whether its details were caught, partly caught or missed', () => {
  const r = clone(run);
  r.byType.phone = { caught: 2, partial: 1, total: 4, missed: ['c03', 'c04'] }; // one partial, one missed: can't tell which
  r.byType.name = { caught: 6, partial: 0, total: 7, missed: ['n02'] };
  r.byType.email = { caught: 2, partial: 1, total: 3, missed: ['c02'] };
  const rows = new Map(noteRows(r, fixtures).map((n) => [n.id, n]));
  assert.equal(rows.get('n02').result, 'Missed');
  assert.equal(rows.get('c02').result, 'Partly caught');
  assert.equal(rows.get('c03').result, 'Not fully caught');
  assert.equal(rows.get('c01').result, 'Caught');
  for (const n of r.perNote.filter((p) => p.group === 'sensitive')) assert.equal(rows.get(n.id).result, n.verdict === 'ALLOW' ? 'Passed, nothing to find' : 'Blocked');
  const t = timing(run);
  assert.ok(t.min <= t.median && t.median <= t.max);
});

test('AC23 the checks table lists every criterion that guards the note with the mutations aimed at it', () => {
  const r = runsOf(mutations)[0];
  const rows = checkRows(r);
  assert.deepEqual(rows.map((c) => c.check), ['AC8', 'AC8b', 'AC10b', 'AC18', 'AC19', 'AC20', 'AC20b', 'AC21', 'AC22']);
  const s = mutationSummary(r);
  assert.equal(s.noteTotal, rows.reduce((n, c) => n + c.mutations.length, 0));
  assert.equal(s.total, r.mutations.length);
  const broken = clone(r);
  broken.mutations.find((m) => m.check === 'AC18').caught = false;
  assert.equal(mutationSummary(broken).noteCaught, s.noteCaught - 1);
  assert.equal(NOTE_CHECKS.length, 9);
});

test('AC23 one run shows no comparison; two runs compare this run with the one before', () => {
  assert.equal(compareKinds([run]), null);
  const older = clone(run);
  older.byType.phone.caught = 1;
  const pair = compareKinds([run, older]);
  assert.equal(pair.find((c) => c.kind === 'phone').before.caught, 1);
  assert.deepEqual(runsOf({ runs: [run, older] }).length, 2);
});

test('AC23 esc makes a script tag inert', () => {
  const out = esc('<script>alert("x")</script><img src=x onerror=alert(1)>');
  assert.ok(!out.includes('<'));
  assert.ok(!out.includes('"'));
  assert.equal(out, '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;');
});

test('AC23 the real app serves /report, its scripts and its data', async () => {
  const app = await startApp();
  try {
    const page = await fetch(app.base + '/report');
    assert.equal(page.status, 200);
    assert.match(await page.text(), /What protects the private note/);
    for (const p of ['/report.js', '/report-client.js', '/report.css']) assert.equal((await fetch(app.base + p)).status, 200, p);
    for (const p of ['/data/rampart-eval.json', '/data/mutations.json', '/data/synthetic-notes.json']) {
      const r = await fetch(app.base + p);
      assert.equal(r.status, 200, p);
      assert.ok(await r.json(), p);
    }
  } finally {
    await app.close();
  }
});

test('AC23 the page and its scripts load nothing from another host', () => {
  for (const f of ['public/report.html', 'public/report.js', 'public/report-client.js', 'public/report.css']) {
    const src = read(f);
    assert.ok(!/(src|href)\s*=\s*["']?(https?:)?\/\//i.test(src), `${f} references another host`);
    assert.ok(!/(import|fetch)\s*\(?\s*["'`](https?:)?\/\//i.test(src), `${f} fetches from another host`);
    assert.ok(!/url\(\s*["']?(https?:)?\/\//i.test(src), `${f} loads a url() from another host`);
  }
});
