// /report without the DOM: turns public/data/*.json into the HTML strings and text the page shows.
// report.js only assigns them. Tests import this file. Every value from the data is escaped, and every
// count is checked to be a whole number of zero or more before it is used.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-11-10T19:36:31.889Z" → "Nov 10, 2026" (the UTC date the run finished). */
export const fmtDate = (iso) => {
  const parts = /^(\d{4})-(\d{2})-(\d{2})/.exec(typeof iso === 'string' ? iso : '');
  if (!parts || !MONTHS[Number(parts[2]) - 1]) return 'an unknown date';
  return `${MONTHS[Number(parts[2]) - 1]} ${Number(parts[3])}, ${parts[1]}`;
};
const ms = (n) => (Number.isFinite(n) ? `${Math.round(n)} ms` : 'an unknown time');

export const UNREADABLE = 'This data could not be read.';
export const isCount = (n) => Number.isInteger(n) && n >= 0;
const isStr = (s) => typeof s === 'string';
const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);

/** A Rampart run the page can trust: whole counts, a missed list of ids, and a verdict on every note. */
export function rampartRunOk(run) {
  if (!isObj(run) || !isObj(run.byType)) return false;
  const kindsOk = Object.values(run.byType).every((r) => isObj(r) && [r.caught, r.partial, r.total].every(isCount)
    && r.caught + r.partial <= r.total && Array.isArray(r.missed) && r.missed.every(isStr));
  const notesOk = Array.isArray(run.perNote) && run.perNote.length > 0 && run.perNote.every((n) => isObj(n) && isStr(n.id) && isStr(n.group)
    && (n.verdict === 'ALLOW' || n.verdict === 'BLOCK') && (n.spanTypes === undefined || (Array.isArray(n.spanTypes) && n.spanTypes.every(isStr))));
  return kindsOk && notesOk && (run.notes === undefined || isCount(run.notes));
}

/** The notes file: every note has an id, text and a list of expected details. */
export const fixturesOk = (notes) => Array.isArray(notes) && notes.every((f) => isObj(f) && isStr(f.id) && isStr(f.text)
  && Array.isArray(f.expect) && f.expect.every((e) => isObj(e) && isStr(e.type) && isStr(e.value)));

export function mutationRunOk(run) {
  return isObj(run) && Array.isArray(run.mutations) && run.mutations.every((m) => isObj(m) && isStr(m.what) && isStr(m.file) && isStr(m.check) && typeof m.caught === 'boolean')
    && (run.planned === undefined || isCount(run.planned)) && (run.completed === undefined || typeof run.completed === 'boolean');
}

/** Runs saved before the completed flag existed were written only once every mutation had run. */
export const mutationRunFinished = (run) => (run.completed === undefined
  ? run.planned === undefined
  : run.completed === true && (run.planned === undefined || run.mutations.length === run.planned));

async function sha256Hex(text) {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** True only when the notes file is byte for byte the one this run measured. */
export async function fixturesMatch(run, text) {
  if (!isStr(run?.fixturesSha256) || !isStr(text)) return false;
  try { return (await sha256Hex(text)) === run.fixturesSha256; } catch { return false; }
}

/** Both data files hold `runs` newest first. An older file holding one bare run counts as one run. */
export const runsOf = (data) => (Array.isArray(data?.runs) ? data.runs : data ? [data] : []);

export const KINDS = { phone: 'Phone numbers', email: 'Email addresses', address: 'Street addresses', name: 'Names', dob: 'Birthdays', id: 'ID numbers', handle: 'Social media handles' };
const KIND_ORDER = Object.keys(KINDS);
export const GROUPS = { contact: 'Contact details', name: 'A name', address: 'An address', sensitive: 'Private, no details', harmless: 'Everyday question' };

/**
 * One row per kind of detail. `missed` in the data lists every note not fully caught, partial or not,
 * so the fully missed count is total minus caught minus partial. Kinds with nothing expected are left out.
 */
export function kindRows(run) {
  return Object.entries(run?.byType ?? {})
    .filter(([, r]) => r.total > 0)
    .sort(([a], [b]) => KIND_ORDER.indexOf(a) - KIND_ORDER.indexOf(b))
    .map(([kind, r]) => ({ kind, label: KINDS[kind] ?? kind, caught: r.caught, partial: r.partial, missed: r.total - r.caught - r.partial, total: r.total }));
}

export function kindTotals(rows) {
  return rows.reduce((t, r) => ({ caught: t.caught + r.caught, partial: t.partial + r.partial, missed: t.missed + r.missed, total: t.total + r.total }), { caught: 0, partial: 0, missed: 0, total: 0 });
}

/** The two rows that matter most, counted from the per-note verdicts, not from the summary fields. */
export function keyRows(run) {
  const notes = run?.perNote ?? [];
  const sensitive = notes.filter((n) => n.group === 'sensitive');
  const harmless = notes.filter((n) => n.group === 'harmless');
  return {
    sensitivePassed: { count: sensitive.filter((n) => n.verdict === 'ALLOW').length, total: sensitive.length },
    harmlessBlocked: { count: harmless.filter((n) => n.verdict === 'BLOCK').length, total: harmless.length, ids: harmless.filter((n) => n.verdict === 'BLOCK').map((n) => n.id) },
  };
}

export function timing(run) {
  const t = (run?.perNote ?? []).map((n) => n.ms).filter(Number.isFinite).sort((a, b) => a - b);
  if (!t.length) return null;
  const mid = t.length >> 1;
  return { median: t.length % 2 ? t[mid] : (t[mid - 1] + t[mid]) / 2, min: t[0], max: t.at(-1), count: t.length };
}

/** The finding, in one sentence, from the numbers. */
export function headline(run) {
  const t = kindTotals(kindRows(run));
  const { sensitivePassed: s } = keyRows(run);
  const all = s.count === s.total ? `all ${s.total}` : `${s.count} of ${s.total}`;
  return `On ${isCount(run.notes) ? run.notes : run.perNote.length} invented notes, Rampart Edge fully caught ${t.caught} of ${t.total} personal details, and it let through ${all} of the most private notes, because they hold no detail for it to find.`;
}

/** How one expected value fared. The data names the notes not fully caught per kind, not which were partial. */
function valueStatus(run, id, type) {
  const r = run.byType?.[type];
  if (!r || !r.missed.includes(id)) return 'caught';
  const notFull = r.total - r.caught;
  if (r.partial === notFull) return 'partial';
  if (r.partial === 0) return 'missed';
  return 'not fully caught';
}

const RESULT = {
  caught: ['Caught', 'good'],
  partial: ['Partly caught', 'ask'],
  'not fully caught': ['Not fully caught', 'miss'],
  missed: ['Missed', 'miss'],
};

/** Every note as a row: its text, what was expected, what was found and the verdict. */
export function noteRows(run, fixtures) {
  const byId = new Map((fixtures ?? []).map((f) => [f.id, f]));
  return (run?.perNote ?? []).map((n) => {
    const f = byId.get(n.id);
    if (!f) {
      return { id: n.id, group: GROUPS[n.group] ?? n.group, text: '', expected: [], found: n.spanTypes ?? [], gate: n.verdict === 'BLOCK' ? 'Blocked' : 'Passed', ms: n.ms, result: 'No fixture for this note', tone: 'ask', noFixture: true };
    }
    const expected = f.expect.map((e) => ({ kind: KINDS[e.type] ?? e.type, value: e.value, status: valueStatus(run, n.id, e.type) }));
    let result;
    let tone;
    if (expected.length) {
      const worst = ['missed', 'not fully caught', 'partial', 'caught'].find((s) => expected.some((e) => e.status === s));
      [result, tone] = RESULT[worst];
      // A detail can be marked and the note still passed (c05: a birthday). Say so rather than "Caught".
      if (worst === 'caught' && n.verdict !== 'BLOCK') [result, tone] = ['Found, but passed', 'ask'];
    } else if (n.group === 'sensitive') {
      [result, tone] = n.verdict === 'ALLOW' ? ['Passed, nothing to find', 'ask'] : ['Blocked', 'good'];
    } else {
      [result, tone] = n.verdict === 'ALLOW' ? ['Passed, correctly', 'good'] : ['Wrongly blocked', 'miss'];
    }
    return {
      id: n.id,
      group: GROUPS[n.group] ?? n.group,
      text: f.text,
      expected: expected.map((e) => ({ ...e, status: RESULT[e.status][0] })),
      found: n.spanTypes ?? [],
      gate: n.verdict === 'BLOCK' ? 'Blocked' : 'Passed',
      ms: n.ms,
      result,
      tone,
    };
  });
}

/** The criteria that guard the note, and what each one proves. */
export const NOTE_CHECKS = [
  ['AC8', 'A made-up name, note and question reach the advisor hand-off and never show up in the model log.'],
  ['AC8b', 'The hand-off queue is served only by the advisor routes, never by the public log, the records or the hand-off itself.'],
  ['AC10b', 'Crisis words in a note still raise the alarm after the note is sealed.'],
  ['AC18', 'The note reaches the advisor word for word and nowhere else: not the model, the log, errors or anything the server prints.'],
  ['AC19', 'The gateway refuses the note in every spot of a model request, even when it is hidden, before the model is called.'],
  ['AC20', 'The inbox list never carries a note, and only opening a request opens one.'],
  ['AC20b', 'Two requests never share a code, so one advisor read can never open someone else’s note.'],
  ['AC20c', 'Each advisor open is counted, and the count is what the inbox shows.'],
  ['AC21', 'Details the detector finds in a note, such as names, phone numbers and emails, stay hidden from the advisor until switched on, one kind at a time.'],
  ['AC22', 'The detector is served from this site, no page names another host, and the real model runs in the checks with no install.'],
  ['AC25', 'The advisor replies to a note, and the student reads the reply.'],
];

export function checkRows(mutRun) {
  const muts = mutRun?.mutations ?? [];
  return NOTE_CHECKS.map(([check, proves]) => ({ check, proves, mutations: muts.filter((m) => m.check === check).map((m) => ({ what: m.what, file: m.file, caught: m.caught })) }));
}

export function mutationSummary(mutRun) {
  const all = mutRun?.mutations ?? [];
  const ids = new Set(NOTE_CHECKS.map(([c]) => c));
  const note = all.filter((m) => ids.has(m.check));
  return { caught: all.filter((m) => m.caught).length, total: all.length, noteCaught: note.filter((m) => m.caught).length, noteTotal: note.length };
}

/** Rampart per kind, this run against the run before. Null when there is only one run. */
export function compareKinds(runs) {
  if (runs.length < 2) return null;
  const before = new Map(kindRows(runs[1]).map((r) => [r.kind, r]));
  return kindRows(runs[0]).map((r) => ({ kind: r.kind, before: before.get(r.kind) ?? null }));
}

export { ms };

// ---- The HTML the page shows. Pure functions that return strings; report.js assigns them.

const pct = (n, total) => (total ? (100 * n) / total : 0);
const bar = (r) => `<span class="bar" aria-hidden="true"><span class="b-good" style="width:${pct(r.caught, r.total)}%"></span><span class="b-ask" style="width:${pct(r.partial, r.total)}%"></span><span class="b-miss" style="width:${pct(r.missed, r.total)}%"></span></span>`;
const unreadableRow = (cols) => `<tr><td colspan="${cols}">${UNREADABLE}</td></tr>`;

function kindsHtml(runs) {
  const [run, before] = runs;
  const rows = kindRows(run);
  const beforeOk = before !== undefined && rampartRunOk(before);
  const prev = beforeOk ? new Map(kindRows(before).map((r) => [r.kind, r])) : null;
  const beforeCell = (b) => (before === undefined ? '' : `<td data-label="Run before">${!beforeOk ? 'Could not be read' : b ? `${esc(b.caught)} of ${esc(b.total)} caught` : 'Not measured'}</td>`);
  return [...rows, { label: 'All kinds', ...kindTotals(rows), all: true }].map((r) => `
    <tr${r.all ? ' class="total"' : ''}>
      <th scope="row" data-label="Kind">${esc(r.label)}</th>
      <td data-label="Caught">${esc(r.caught)}</td>
      <td data-label="Partly caught">${esc(r.partial)}</td>
      <td data-label="Missed">${esc(r.missed)}</td>
      <td data-label="Out of">${esc(r.total)}</td>
      ${beforeCell(r.all ? (prev ? kindTotals([...prev.values()]) : null) : prev?.get(r.kind))}
      <td class="bar-cell">${bar(r)}</td>
    </tr>`).join('');
}

function keyHtml(k) {
  const blockedIds = k.harmlessBlocked.ids.length ? ` (${esc(k.harmlessBlocked.ids.join(', '))})` : '';
  return `
    <tr><th scope="row" data-label="Notes">Very private notes with no contact details, passed by the detector</th><td data-label="Result" class="big">${esc(k.sensitivePassed.count)} of ${esc(k.sensitivePassed.total)}</td></tr>
    <tr><th scope="row" data-label="Notes">Everyday notes wrongly blocked</th><td data-label="Result" class="big">${esc(k.harmlessBlocked.count)} of ${esc(k.harmlessBlocked.total)}${blockedIds}</td></tr>`;
}

function notesHtml(run, notes, match) {
  if (!fixturesOk(notes)) return unreadableRow(4);
  if (!match) return '<tr><td colspan="4">The saved notes do not match this run, so they are not shown.</td></tr>';
  return noteRows(run, notes).map((n) => `
    <tr>
      <th scope="row" data-label="Note">${esc(n.id)}</th>
      <td data-label="Kind">${esc(n.group)}</td>
      <td data-label="Result"><span class="verdict ${esc(n.tone)}">${esc(n.result)}</span></td>
      <td data-label="Details">
        <details><summary>Open</summary>
          ${n.noFixture ? '' : `<p class="note-text">${esc(n.text)}</p>`}
          <dl>
            <dt>Expected</dt><dd>${n.noFixture ? 'No fixture for this note' : n.expected.length ? n.expected.map((e) => `${esc(e.kind)}: ${esc(e.value)}. ${esc(e.status)}`).join('<br>') : 'Nothing for the detector to find'}</dd>
            <dt>Found</dt><dd>${n.found.length ? esc(n.found.join(', ')) : 'Nothing'}</dd>
            <dt>Detector said</dt><dd>${esc(n.gate)}, in ${esc(ms(n.ms))}</dd>
          </dl>
        </details>
      </td>
    </tr>`).join('');
}

const KEY_WHY = [
  'The detector blocked every one of these, but it is still not what keeps a note away from a model. The note is sealed when it arrives, and the gateway refuses it.',
  'That is right for a detector: a note about a parent in prison or sleeping in a car has no phone number in it. It is also why the detector can never be what keeps a note away from a model. The note is sealed when it arrives, and the gateway refuses it, whatever the detector says.',
];

/**
 * Everything the Rampart section shows. `data` is rampart-eval.json, `fixturesData` is synthetic-notes.json,
 * `match` is fixturesMatch() for the newest run. Never throws: bad data gives the unreadable state.
 */
export function rampartView(data, fixturesData, match) {
  const unreadable = { ok: false, headline: 'The detector results could not be read.', runText: '', kinds: unreadableRow(7), key: unreadableRow(2), keyWhy: '', timing: '', notes: unreadableRow(4), showBefore: false, noteCount: null };
  try {
    const runs = runsOf(data);
    const [run, before] = runs;
    if (!rampartRunOk(run)) return unreadable;
    const k = keyRows(run);
    const tm = timing(run);
    const name = isStr(run.package) ? run.package.split('/').pop() : 'rampart-edge';
    const str = (v) => (isStr(v) ? v : 'unknown');
    return {
      ok: true,
      headline: headline(run),
      runText: `Run on ${fmtDate(run.date)}, ${name} ${str(run.version)}, ${str(run.runtime)}.${run.basis === 'model' ? '' : ' The model did not load, so these are the simple pattern checks only.'}${before !== undefined ? ` The run before was on ${fmtDate(before?.date)}.` : ''}`,
      kinds: kindsHtml(runs),
      key: keyHtml(k),
      keyWhy: KEY_WHY[k.sensitivePassed.count ? 1 : 0],
      timing: tm ? `Half the notes took ${ms(tm.median)} or less. The fastest took ${ms(tm.min)} and the slowest ${ms(tm.max)}, in Node on a laptop.` : 'No timings in this run.',
      notes: notesHtml(run, fixturesData?.notes, match === true),
      showBefore: before !== undefined,
      noteCount: isCount(run.notes) ? run.notes : run.perNote.length,
    };
  } catch {
    return unreadable;
  }
}

/** Everything the checks section shows, from mutations.json. Never throws. */
export function checksView(data) {
  try {
    const runs = runsOf(data);
    const [run, before] = runs;
    if (run === undefined) return { runText: 'No mutation run has been saved yet. Run npm run mutate to make one.', body: '', hideTable: true };
    if (!mutationRunOk(run)) return { runText: UNREADABLE, body: unreadableRow(3), hideTable: false };
    const s = mutationSummary(run);
    const finished = mutationRunFinished(run);
    let prevText = '';
    if (before !== undefined) {
      if (!mutationRunOk(before)) prevText = ' The run before could not be read.';
      else if (!mutationRunFinished(before)) prevText = ` The run before, on ${fmtDate(before.date)}, did not finish.`;
      else { const p = mutationSummary(before); prevText = ` The run before, on ${fmtDate(before.date)}, caught ${p.caught} of ${p.total}.`; }
    }
    const runText = finished
      ? `Run on ${fmtDate(run.date)} with Node ${isStr(run.node) ? run.node : 'unknown'}. ${s.noteCaught} of ${s.noteTotal} breaks aimed at the note were caught, and ${s.caught} of ${s.total} across the whole app.${prevText}`
      : `The last run, on ${fmtDate(run.date)}, did not finish. It ran ${s.total} of ${isCount(run.planned) ? run.planned : 'its'} breaks before it stopped, so it does not show that the checks work. Of those, ${s.caught} were caught.${prevText}`;
    const body = checkRows(run).map((c) => `
    <tr>
      <th scope="row" data-label="Check">${esc(c.check)}</th>
      <td data-label="What it proves">${esc(c.proves)}</td>
      <td data-label="Broken on purpose">${c.mutations.length ? `<ul>${c.mutations.map((m) => `<li>${esc(m.what)} <span class="file">${esc(m.file)}</span> <span class="verdict ${m.caught ? 'good' : 'miss'}">${m.caught ? 'Caught' : 'Not caught'}</span></li>`).join('')}</ul>` : finished ? 'Not in this run yet' : 'Not reached before the run stopped'}</td>
    </tr>`).join('');
    return { runText, body, hideTable: false };
  } catch {
    return { runText: UNREADABLE, body: unreadableRow(3), hideTable: false };
  }
}

// ---- The four acceptance criteria. The words are the task's, quoted exactly. The checks behind each are
// listed here, in one place, and every count is computed from mutations.json.

export const CRITERIA = [
  {
    id: 'ac1',
    name: 'Acceptance criterion 1',
    words: 'Capture the note and make it available through the intended advisor workflow, or explicitly identify the missing infrastructure needed to do so.',
    met: [
      'The note is captured on the send screen and sealed where it arrives, so it prints as "[private]" everywhere but the advisor read.',
      '/advisor is an inbox: the list shows who asked and why, without the note, and opening a request opens the note and records the open.',
      'Missing infrastructure, named: a queue that survives a restart, and district sign-in to say who the advisor is.',
    ],
    checks: [
      ['AC18', 'the advisor read returns the note word for word, one recorded open'],
      ['AC20', 'the list never carries a note; only opening opens one'],
      ['AC20b', 'a request code is never reused'],
      ['AC20c', 'the open count'],
      ['AC25', 'the advisor replies and the student reads the reply'],
      ['AC21', 'personal details stay hidden until switched on'],
    ],
    links: [['/advisor', 'The advisor inbox'], ['/guide#ac1', 'The guide on criterion 1']],
  },
  {
    id: 'ac2',
    name: 'Acceptance criterion 2',
    words: 'The note does not enter model request payloads; enforce this at a trustworthy boundary.',
    met: [
      'The boundary is code, not a prompt: checkPayload in the gateway lets a model payload hold only record IDs, codes and the exact text of record facts, so a note is refused before any call.',
      'The gateway checks the copy it sends, and outside the advisor read the note is sealed, not a string anyone can pass along by accident.',
      'The server never runs any model on a note, not even the detector.',
    ],
    checks: [
      ['AC19', 'the gateway refuses the note in every position of a model payload'],
      ['AC8', 'the note, name and typed question never reach the model log'],
      ['AC8b', 'the queue is served only by the advisor routes'],
      ['AC22', 'the detector is served from this site and runs only in the browser'],
    ],
    links: [['/how', 'How this works'], ['/guide#ac2', 'The guide on criterion 2']],
  },
  {
    id: 'ac3',
    name: 'Acceptance criterion 3',
    words: 'Add an automated regression test (for example, a sentinel and model-calls.log inspection) that would fail on leakage.',
    met: [
      'A sentinel string is planted in a note, and the test looks for it in every prompt the model was handed, every line of model-calls.log, every response but the advisor read, and everything the server printed.',
      'npm run mutate breaks each guard in turn, including one that calls the model around the gateway: the log never sees it, and the check on every prompt fails it.',
    ],
    checks: [['AC18', 'the sentinel check, which looks in every prompt the model was handed and not only the log']],
    wholeRun: true,
    links: [['/how', 'How this works'], ['/guide#ac3', 'The guide on criterion 3']],
  },
  {
    id: 'ac4',
    name: 'Acceptance criterion 4',
    words: 'Explain what the test proves, what it misses, and how the behavior would differ in production.',
    met: ['No check can prove an explanation. This is it, in brief. The full text is in the README, under "The private note", and in the guide.'],
    checks: [],
    lists: [
      ['What the test proves', [
        'A sentinel note never reaches a model prompt, the model log, any other response, the server output or the queue printed any way.',
        'The advisor read returns the note word for word, and one read is one recorded open.',
        'The gateway refuses the note in every placement tried, across both payload shapes.',
      ]],
      ['What it misses', [
        'A real browser: no automated test drives one.',
        'A model client the test does not inject.',
        'The host: request logs, crash dumps or an error tracker.',
        'The raw request body, for the one call before sealing.',
        'An advisor who copies the note somewhere else.',
      ]],
      ['How production differs', [
        'A durable queue, with the note encrypted as its own field.',
        'District sign-in in front of the inbox, and the advisor recorded with every open.',
        'Hand-offs deleted 90 days after they are resolved.',
        'A real model behind the same gateway, under zero retention, with a daily canary note.',
        'Request bodies never logged at the host or the error tracker.',
      ]],
    ],
    links: [['/guide#ac4', 'The guide on criterion 4']],
  },
];

export const NOT_YET = 'not in this run yet';

/** Per check: how many mutations were aimed at it and how many were caught. `null` counts when it has none. */
export function criterionEvidence(criterion, mutRun) {
  const muts = mutRun?.mutations ?? [];
  const rows = criterion.checks.map(([check, says]) => {
    const aimed = muts.filter((m) => m.check === check);
    return { check, says, aimed: aimed.length, caught: aimed.filter((m) => m.caught === true).length };
  });
  const whole = criterion.wholeRun ? { aimed: muts.length, caught: muts.filter((m) => m.caught === true).length } : null;
  return { rows, whole };
}

function evidenceHtml(c, run, state) {
  if (!c.checks.length) return '';
  const { rows, whole } = criterionEvidence(c, run);
  const count = (r) => {
    if (state !== 'finished') return '';
    return r.aimed ? `: ${esc(r.caught)} of ${esc(r.aimed)} breaks caught` : `: ${NOT_YET}`;
  };
  const items = rows.map((r) => `<li><strong>${esc(r.check)}</strong>, ${esc(r.says)}${count(r)}</li>`);
  if (whole && state === 'finished') items.push(`<li><strong>The whole mutation run</strong>: ${esc(whole.caught)} of ${esc(whole.aimed)} breaks caught</li>`);
  const lead = state === 'finished'
    ? `The checks behind it, with the breaks aimed at each in the run on ${esc(fmtDate(run.date))}:`
    : state === 'unfinished'
      ? `The checks behind it. The last mutation run, on ${esc(fmtDate(run.date))}, did not finish, so no counts are shown.`
      : state === 'none'
        ? 'The checks behind it. No mutation run has been saved yet.'
        : `The checks behind it. ${UNREADABLE}`;
  return `<p>${lead}</p><ul class="evidence">${items.join('')}</ul>`;
}

/** The criteria section, from mutations.json. Never throws. */
export function criteriaView(data) {
  let run;
  let state;
  try {
    run = runsOf(data)[0];
    state = run === undefined ? 'none' : !mutationRunOk(run) ? 'unreadable' : mutationRunFinished(run) ? 'finished' : 'unfinished';
  } catch {
    state = 'unreadable';
  }
  if (state !== 'finished') run = state === 'unfinished' ? run : undefined;
  return CRITERIA.map((c) => `
    <article class="criterion" id="criterion-${esc(c.id)}" aria-labelledby="h-${esc(c.id)}">
      <h3 id="h-${esc(c.id)}">${esc(c.name)}</h3>
      <blockquote><p>“${esc(c.words)}”</p></blockquote>
      <p>${c.met.map(esc).join(' ')}</p>
      ${(c.lists ?? []).map(([title, items]) => `<h4>${esc(title)}</h4><ul class="evidence">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`).join('')}
      ${evidenceHtml(c, run, state)}
      <p class="see">${c.links.map(([href, label]) => `<a href="${esc(href)}">${esc(label)}</a>`).join('')}</p>
    </article>`).join('');
}
