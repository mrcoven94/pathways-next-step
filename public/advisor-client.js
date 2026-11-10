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

// Rampart span types mapped to one plain kind each. A name is not in this list on purpose.
export const RAMPART_KINDS = {
  PHONE: 'phone', EMAIL: 'email', ADDRESS: 'address', GOV_ID: 'id', OTHER_ID: 'id',
  FINANCIAL: 'bank', DOB_KEYED: 'birthday', URL_HANDLE: 'handle',
};
export const KIND_WORDS = {
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

// Rampart spans ({start, end, type: 'PHONE'...}) to plain kinds; anything unmapped (a name) is dropped.
export function fromRampart(spans) {
  return (spans ?? [])
    .filter((s) => RAMPART_KINDS[s.type] && Number.isInteger(s.start) && Number.isInteger(s.end) && s.end > s.start)
    .map((s) => ({ start: s.start, end: s.end, type: RAMPART_KINDS[s.type] }));
}

// Overlapping spans become one; the merged span keeps the type of the one that starts first (longest on a tie).
export function mergeSpans(a = [], b = []) {
  const all = [...a, ...b].filter((s) => s.end > s.start).sort((x, y) => x.start - y.start || y.end - x.end);
  const out = [];
  for (const s of all) {
    const last = out[out.length - 1];
    if (last && s.start < last.end) last.end = Math.max(last.end, s.end);
    else out.push({ ...s });
  }
  return out;
}

export function kindsIn(spans) {
  return [...new Set((spans ?? []).map((s) => s.type))];
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
    segs.push({ text: s.slice(start, end), type: sp.type, masked: !shown.has(sp.type) });
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
