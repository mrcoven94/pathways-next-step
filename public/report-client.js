// /report without the DOM: turns public/data/*.json into the rows the page shows. Tests import this file.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-11-10T19:36:31.889Z" → "Nov 10, 2026" (the UTC date the run finished). */
export const fmtDate = (iso) => {
  if (!iso) return 'an unknown date';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};
const ms = (n) => `${Math.round(n)} ms`;

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
  return `On ${run.notes ?? run.perNote.length} invented notes, Rampart Edge fully caught ${t.caught} of ${t.total} personal details, and it let through ${all} of the most private notes, because they hold no detail for it to find.`;
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
    const f = byId.get(n.id) ?? { text: '', expect: [] };
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
  ['AC21', 'Names, phone numbers, emails and other details in a note stay hidden from the advisor until switched on, one kind at a time.'],
  ['AC22', 'The detector is served from this site, no page names another host, and the real model runs in the checks with no install.'],
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
