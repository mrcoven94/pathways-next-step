// Advisor inbox logic without the DOM, so tests run the page's own masking and escaping.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Plain words for every reason code a hand-off can carry. Wording follows public/app.js and src/core/templates.js.
export const REASON_WORDS = {
  UNKNOWN_SEATS: 'How many seats are left',
  UNKNOWN_PERSONAL_ELIGIBILITY: 'Whether they will get in',
  UNKNOWN_AID_AMOUNT: 'How much aid they would get',
  UNKNOWN_START_DATE: 'A start date the records don’t list',
  NOT_IN_RECORDS: 'Something the records don’t say',
  UNMATCHED_QUESTION: 'A question the records can’t answer',
  AGE_UNCONFIRMED: 'Whether they will be 18 by Mar 1, 2027',
  AGE_RULE_MISSED: 'Not 18 by the Mar 1, 2027 start',
  DIPLOMA_TIMING_UNKNOWN: 'When they need their diploma or GED',
  DEADLINE_PASSED: 'An application deadline has passed',
  START_DATE_PASSED: 'A start date has passed',
  STALE_RECORD: 'A record may be out of date',
  APPLY_DEADLINE_UNLISTED: 'How and when to apply',
  OUTSIDE_PREVIEW: 'Outside this preview',
};
export const reasonWords = (code) => REASON_WORDS[code] ?? 'Asked for an advisor';

export const STATUS_WORDS = { new: 'New', in_progress: 'In progress', resolved: 'Resolved' };

// Rampart span types mapped to one plain kind each. Every type Rampart Edge 2.0.5 returns is here.
export const RAMPART_KINDS = {
  NAME: 'name', PHONE: 'phone', EMAIL: 'email', ADDRESS: 'address', GOV_ID: 'id', OTHER_ID: 'id',
  FINANCIAL: 'bank', DOB_KEYED: 'birthday', URL_HANDLE: 'handle',
};
export const KIND_WORDS = {
  name: ['Names', 'name hidden'],
  phone: ['Phone numbers', 'phone hidden'],
  email: ['Email addresses', 'email hidden'],
  address: ['Addresses', 'address hidden'],
  id: ['ID numbers', 'ID hidden'],
  bank: ['Bank and card numbers', 'number hidden'],
  birthday: ['Birthdays', 'birthday hidden'],
  handle: ['Social handles', 'handle hidden'],
};

// Three shapes: a number with a country code, a ten-digit number, and a local seven-digit number.
const PHONE = /\+\d{1,3}(?:[\s.-]?\(?\d{1,4}\)?){2,5}|(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)|(?<![\d-])\d{3}[\s.-]\d{4}(?!\d)/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

export function builtinSpans(text) {
  const s = String(text ?? '');
  const out = [];
  for (const m of s.matchAll(EMAIL)) out.push({ start: m.index, end: m.index + m[0].length, type: 'email' });
  for (const m of s.matchAll(PHONE)) out.push({ start: m.index, end: m.index + m[0].length, type: 'phone' });
  return out.sort((x, y) => x.start - y.start);
}

// Rampart spans ({start, end, type: 'PHONE'...}) to plain kinds; a type Rampart does not document is dropped.
export function fromRampart(spans) {
  return (spans ?? [])
    .filter((s) => RAMPART_KINDS[s.type] && Number.isInteger(s.start) && Number.isInteger(s.end) && s.end > s.start)
    .map((s) => ({ start: s.start, end: s.end, type: RAMPART_KINDS[s.type] }));
}

// Overlapping spans become one, and the merged span remembers every kind inside it. It is shown only when all of
// its kinds are switched on, so switching phone numbers on never shows an ID found in the same digits.
export function mergeSpans(a = [], b = []) {
  const all = [...a, ...b].filter((s) => s.end > s.start).sort((x, y) => x.start - y.start || y.end - x.end);
  const out = [];
  for (const s of all) {
    const kinds = s.kinds ?? [s.type];
    const last = out[out.length - 1];
    if (last && s.start < last.end) {
      last.end = Math.max(last.end, s.end);
      for (const k of kinds) if (!last.kinds.includes(k)) last.kinds.push(k);
    } else out.push({ start: s.start, end: s.end, type: kinds[0], kinds: [...kinds] });
  }
  return out;
}

export function kindsIn(spans) {
  return [...new Set((spans ?? []).flatMap((s) => s.kinds ?? [s.type]))];
}

// Segments in order; joined with masked spans shown, they are exactly the input text.
export function maskNote(text, spans, shown = new Set()) {
  const s = String(text ?? '');
  const segs = [];
  let at = 0;
  for (const sp of mergeSpans(spans)) {
    const start = Math.max(sp.start, at);
    const end = Math.min(sp.end, s.length);
    if (start >= end) continue;
    if (start > at) segs.push({ text: s.slice(at, start), type: null, masked: false });
    const hidden = sp.kinds.filter((k) => !shown.has(k)); // every kind in the span must be switched on
    segs.push({ text: s.slice(start, end), type: hidden[0] ?? sp.type, masked: hidden.length > 0 });
    at = end;
  }
  if (at < s.length) segs.push({ text: s.slice(at), type: null, masked: false });
  return segs;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function when(iso, now = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const mins = Math.round((now - d) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24 && d.getDate() === now.getDate()) {
    const h = d.getHours() % 12 || 12;
    return `Today ${h}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
  }
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

// ---------- triage ----------
// Crisis first (until resolved), then new, then in progress, then resolved. Inside each group, requests nobody
// has answered come first, then newest first, and the two invented samples after real requests.
export const STATUS_ORDER = ['new', 'in_progress', 'resolved'];
const rank = (r) => (r.crisis && r.status !== 'resolved' ? 0 : 1 + Math.max(0, STATUS_ORDER.indexOf(r.status)));

export function sortRequests(requests) {
  return [...(requests ?? [])].sort((a, b) =>
    rank(a) - rank(b) || Number(!!a.answered) - Number(!!b.answered) || Number(!!a.sample) - Number(!!b.sample)
      || String(b.at).localeCompare(String(a.at)));
}

/** How many requests sit in each view of the list. Crisis counts requests that still need someone. */
export function countByStatus(requests) {
  const counts = { all: 0, crisis: 0, new: 0, in_progress: 0, resolved: 0 };
  for (const r of requests ?? []) {
    counts.all++;
    if (r.status in counts) counts[r.status]++;
    if (r.crisis && r.status !== 'resolved') counts.crisis++;
  }
  return counts;
}

export function filterRequests(requests, view = 'all') {
  const sorted = sortRequests(requests);
  return view === 'all' ? sorted : sorted.filter((r) => r.status === view);
}

/** The one line a row uses to say why it is here. */
export const rowReason = (r) => (r.crisis && r.status !== 'resolved' ? 'Used crisis words. Reach them first.' : reasonWords(r.reasons?.[0]));

/** The small line under a row's reason: status, "Answered" once an advisor has, and whether there is a note. */
export const rowMeta = (r) => [STATUS_WORDS[r.status] ?? 'New', r.answered ? 'Answered' : null, r.has_note ? 'Private note' : 'No note'].filter(Boolean).join(' · ');

/**
 * When a request is opened, what the server just sent replaces what the list had cached for that row, so a
 * student's follow-up (a crisis word, a status back to in progress) shows at once and no stale status is sent back.
 * `fresh` is a list row or an opened request; the note, the message texts and the open count never reach the list.
 */
export function mergeOpened(requests, fresh) {
  const { note, replies, opens, last_opened_at, ...rest } = fresh ?? {};
  let open = null;
  const merged = (requests ?? []).map((r) => {
    if (r.code !== rest.code) return r;
    open = { ...r, ...rest, replies: Array.isArray(replies) ? replies.length : (replies ?? r.replies) };
    return open;
  });
  return { requests: merged, open };
}

// The next step the planner gave the student, in the words the student saw.
export const NEXT_STEP_WORDS = {
  apply_by_deadline: 'Apply to Northline before the deadline.',
  ask_advisor_then_apply: 'Check what the records can’t confirm with an advisor, then apply to Northline.',
  start_aid_application: 'Start the FAFSA or state aid application.',
};
export const nextStepWords = (code) => NEXT_STEP_WORDS[code] ?? null;

const clock = (d) => `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'AM' : 'PM'}`;

/**
 * How often the note has been opened, from what the server recorded. `opens` counts this read.
 * `last` is the open before this one, or null.
 */
export function handlingWords({ opens, last } = {}, now = new Date()) {
  const n = Number.isInteger(opens) && opens > 0 ? opens : 1;
  const prev = last ? new Date(last) : null;
  const before = prev && !Number.isNaN(prev.getTime())
    ? ` Last opened before this ${prev.toDateString() === now.toDateString() ? `at ${clock(prev)}` : `on ${MONTHS[prev.getMonth()]} ${prev.getDate()}`}.`
    : '';
  return n === 1 ? 'You are the first to open it.' : `Opened ${n} times, counting this one.${before}`;
}

/** "Sent just now", "Sent 5 min ago", "Sent today at 3:42 PM", "Sent Nov 3". */
export function sentWords(iso, now = new Date()) {
  const w = when(iso, now);
  if (!w) return 'Sent';
  return `Sent ${w === 'Just now' ? 'just now' : w.replace(/^Today /, 'today at ')}`;
}
