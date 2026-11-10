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

// ---- Review 11: the page must never show a wrong number, an active tag, or a verdict the data does not support.

const client = await import('../public/report-client.js');
const HOSTILE = '<img src=x onerror=alert(1)>';
const fixturesText = read('public/data/synthetic-notes.json');
const rampartData = () => clone(rampart);
const view = (data = rampartData(), fx = { notes: fixtures }, match = true) => client.rampartView(data, fx, match);
const cell = (html, rowLabel, col) => {
  const row = html.split('<tr').find((r) => r.includes(`>${rowLabel}</th>`));
  assert.ok(row, `no row ${rowLabel}`);
  return row.match(new RegExp(`data-label="${col}">([^<]*)<`))?.[1];
};
const inert = (html) => !/<img|onerror=alert\(1\)>/.test(html.replace(/&lt;img src=x onerror=alert\(1\)&gt;/g, ''));

test('AC23 the committed data shows 19 caught, 2 partly caught, 3 missed of 24, 12 of 12 private notes passed and 0 of 5 everyday notes blocked', () => {
  const t = kindTotals(kindRows(run));
  assert.deepEqual(t, { caught: 19, partial: 2, missed: 3, total: 24 });
  const k = keyRows(run);
  assert.deepEqual([k.sensitivePassed.count, k.sensitivePassed.total], [12, 12]);
  assert.deepEqual([k.harmlessBlocked.count, k.harmlessBlocked.total], [0, 5]);
  const v = view();
  assert.equal(cell(v.kinds, 'All kinds', 'Caught'), '19');
  assert.equal(cell(v.kinds, 'All kinds', 'Partly caught'), '2');
  assert.equal(cell(v.kinds, 'All kinds', 'Missed'), '3');
  assert.equal(cell(v.kinds, 'All kinds', 'Out of'), '24');
  assert.match(v.key, /passed by the detector<\/th><td data-label="Result" class="big">12 of 12</);
  assert.match(v.key, /wrongly blocked<\/th><td data-label="Result" class="big">0 of 5</);
});

test('AC23 each count lands in its own column of the rendered table', () => {
  const d = rampartData();
  d.runs[0].byType.phone = { caught: 1, partial: 2, total: 7, missed: ['c01', 'c03', 'c04'] };
  const k = view(d).kinds;
  assert.equal(cell(k, 'Phone numbers', 'Caught'), '1');
  assert.equal(cell(k, 'Phone numbers', 'Partly caught'), '2');
  assert.equal(cell(k, 'Phone numbers', 'Missed'), '4');
  assert.equal(cell(k, 'Phone numbers', 'Out of'), '7');
  assert.equal(cell(k, 'Names', 'Missed'), '1');
});

test('AC23 a hostile value in any field of the data comes out inert, previous-run cells included', () => {
  const d = rampartData();
  const r0 = d.runs[0];
  r0.byType[HOSTILE] = { caught: 1, partial: 0, total: 1, missed: [] };
  r0.perNote[0].id = HOSTILE; r0.perNote[1].group = HOSTILE; r0.perNote[2].spanTypes = [HOSTILE]; r0.perNote[3].ms = HOSTILE;
  r0.package = HOSTILE; r0.version = HOSTILE; r0.runtime = HOSTILE; r0.date = HOSTILE;
  const fx = clone(fixtures);
  fx[1].text = HOSTILE; fx[2].expect[0].value = HOSTILE; fx[2].expect[0].type = HOSTILE;
  const before = clone(r0); before.byType.phone.caught = HOSTILE;
  d.runs = [r0, before];
  const v = view(d, { notes: fx });
  for (const html of [v.kinds, v.key, v.notes]) assert.ok(inert(html), html.slice(0, 300));
  assert.match(cell(v.kinds, 'All kinds', 'Run before'), /could not be read/i);
  const m = clone(runsOf(mutations)[0]);
  m.mutations[0].what = HOSTILE; m.mutations[0].file = HOSTILE;
  assert.ok(inert(client.checksView({ runs: [m] }).body));
  m.mutations[0].caught = HOSTILE;
  assert.ok(inert(client.checksView({ runs: [m] }).body));
});

test('AC23 counts that are not whole numbers of zero or more make the section say the data could not be read', () => {
  for (const bad of [HOSTILE, -1, 1.5, '3', null, Infinity]) {
    const d = rampartData();
    d.runs[0].byType.phone.caught = bad;
    const v = view(d);
    assert.match(v.kinds, /This data could not be read\./, String(bad));
    assert.ok(!v.kinds.includes('data-label="Caught"'));
    assert.ok(inert(v.kinds));
  }
  const m = clone(runsOf(mutations)[0]); m.planned = -2;
  assert.match(client.checksView({ runs: [m] }).body + client.checksView({ runs: [m] }).runText, /could not be read/);
});

test('AC23 a note with no fixture says so instead of a wrong verdict', () => {
  const rows = new Map(noteRows(run, fixtures.filter((f) => f.id !== 'c01' && f.id !== 'h01')).map((n) => [n.id, n]));
  assert.equal(rows.get('c01').result, 'No fixture for this note');
  assert.equal(rows.get('h01').result, 'No fixture for this note');
  const html = view(rampartData(), { notes: fixtures.filter((f) => f.id !== 'c01') }).notes;
  assert.ok(!/Wrongly blocked/.test(html));
  assert.match(html, /No fixture for this note/);
});

test('AC23 bad data in one section leaves the other section working', () => {
  for (const bad of [{}, { runs: [{}] }, null, 'x', { runs: [null] }]) {
    const v = client.rampartView(bad, { notes: fixtures }, true);
    assert.match(v.kinds, /This data could not be read\./);
    assert.match(client.checksView(mutations).body, /Caught/);
    const c = client.checksView(bad);
    assert.ok(/could not be read|No mutation run/.test(c.runText + c.body));
    assert.match(view().kinds, /data-label="Caught">19</);
  }
  const v = client.rampartView(rampart, { notes: 'nope' }, true);
  assert.match(v.kinds, /data-label="Caught">19</);
  assert.match(v.notes, /could not be read/);
});

test('AC23 the notes are shown only when the notes file is the one this run measured', async () => {
  assert.equal(typeof run.fixturesSha256, 'string');
  assert.equal(await client.fixturesMatch(run, fixturesText), true);
  assert.equal(await client.fixturesMatch(run, fixturesText.replace('206-555-0142', '206-555-0143')), false);
  assert.equal(await client.fixturesMatch({ ...run, fixturesSha256: undefined }, fixturesText), false);
  assert.equal(fixturesText, read('test/fixtures/synthetic-notes.json'));
  const v = view(rampartData(), { notes: fixtures }, false);
  assert.ok(!v.notes.includes('c01'));
  assert.match(v.notes, /do not match/);
});

test('AC23 an unfinished mutation run is shown as unfinished, never as all caught', () => {
  const m = clone(runsOf(mutations)[0]);
  m.completed = false; m.planned = 43; m.mutations = m.mutations.slice(0, 5);
  const v = client.checksView({ runs: [m] });
  assert.match(v.runText, /did not finish/);
  assert.match(v.runText, /5 of 43/);
  assert.ok(!/breaks aimed at the note were caught/.test(v.runText));
  const done = clone(runsOf(mutations)[0]);
  Object.assign(done, { completed: true, planned: done.mutations.length });
  done.mutations.forEach((x) => { x.caught = true; });
  assert.match(client.checksView({ runs: [done] }).runText, new RegExp(`${done.mutations.length} of ${done.mutations.length} across the whole app`));
  m.completed = true; // claims done but holds fewer outcomes than planned
  assert.match(client.checksView({ runs: [m] }).runText, /did not finish/);
});

test('AC23 npm run mutate leaves a file that says the run did not finish when a mutation no longer applies', async () => {
  const { mkdtempSync, mkdirSync, cpSync, writeFileSync, rmSync } = await import('node:fs');
  const { spawnSync } = await import('node:child_process');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'pathways-mutate-test-'));
  try {
    mkdirSync(join(dir, 'scripts')); mkdirSync(join(dir, 'public/data'), { recursive: true });
    cpSync(new URL('../scripts/mutate.mjs', import.meta.url), join(dir, 'scripts/mutate.mjs'));
    writeFileSync(join(dir, 'public/client.js'), '// the first mutation no longer applies here\n');
    writeFileSync(join(dir, 'public/data/mutations.json'), JSON.stringify(mutations));
    const r = spawnSync(process.execPath, ['scripts/mutate.mjs'], { cwd: dir, encoding: 'utf8' });
    assert.notEqual(r.status, 0);
    const saved = JSON.parse(readFileSync(join(dir, 'public/data/mutations.json'), 'utf8'));
    assert.equal(saved.runs[0].completed, false);
    assert.equal(saved.runs[0].mutations.length, 0);
    assert.equal(saved.runs.length, Math.min(10, mutations.runs.length + 1));
    assert.match(client.checksView(saved).runText, /did not finish/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('AC23 the advisor sentence claims only what the detector finds', () => {
  const ac21 = NOTE_CHECKS.find(([c]) => c === 'AC21')[1];
  assert.match(ac21, /^Details the detector finds/);
  assert.match(ac21, /one kind at a time/);
});
