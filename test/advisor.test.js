import { test } from 'node:test';
import assert from 'node:assert/strict';
import { builtinSpans, mergeSpans, maskNote, kindsIn, esc, fromRampart, KIND_WORDS } from '../public/advisor-client.js';

const NOTE = 'Hi, this is Dani. Call me at 206-555-0142 or email dani.r@example.com after 4.';
const join = (segs) => segs.map((s) => s.text).join('');

test('AC21 phone and email in a note are masked by default', () => {
  const spans = builtinSpans(NOTE);
  assert.deepEqual(kindsIn(spans).sort(), ['email', 'phone']);
  const segs = maskNote(NOTE, spans, new Set());
  const masked = segs.filter((s) => s.masked);
  assert.deepEqual(masked.map((s) => [s.type, s.text]), [['phone', '206-555-0142'], ['email', 'dani.r@example.com']]);
  assert.ok(segs.filter((s) => !s.masked).every((s) => !s.text.includes('555') && !s.text.includes('@')));
  assert.ok(segs.some((s) => !s.masked && s.text.includes('Dani')), 'the built-in patterns find no names; names come from Rampart');
});

test('AC21 switching one kind on reveals only that kind', () => {
  const segs = maskNote(NOTE, builtinSpans(NOTE), new Set(['phone']));
  assert.equal(segs.find((s) => s.type === 'phone').masked, false);
  assert.equal(segs.find((s) => s.type === 'email').masked, true);
});

test('AC21 text outside spans is unchanged and in order', () => {
  const segs = maskNote(NOTE, builtinSpans(NOTE), new Set());
  assert.equal(join(segs), NOTE);
  assert.equal(segs[0].text, 'Hi, this is Dani. Call me at ');
  assert.equal(segs.at(-1).text, ' after 4.');
  assert.equal(join(maskNote('no contact details here', [], new Set())), 'no contact details here');
});

test('AC21 overlapping spans from Rampart and the built-in patterns merge', () => {
  const rampart = fromRampart([{ start: 29, end: 36, type: 'PHONE' }, { start: 12, end: 16, type: 'PERSON' }]);
  assert.deepEqual(rampart, [{ start: 29, end: 36, type: 'phone' }], 'a type Rampart does not return is dropped');
  const merged = mergeSpans(rampart, builtinSpans(NOTE));
  assert.equal(merged.length, 2);
  assert.deepEqual(merged[0], { start: 29, end: 41, type: 'phone', kinds: ['phone'] });
  assert.deepEqual(mergeSpans([{ start: 0, end: 5, type: 'a' }], [{ start: 3, end: 9, type: 'b' }, { start: 9, end: 10, type: 'c' }]),
    [{ start: 0, end: 9, type: 'a', kinds: ['a', 'b'] }, { start: 9, end: 10, type: 'c', kinds: ['c'] }]);
});

test('AC21 a note with script tags comes back as plain text segments, and esc makes it inert', () => {
  const evil = '<script>alert(1)</script><img src=x onerror="alert(2)"> call 425.555.0199';
  const segs = maskNote(evil, builtinSpans(evil), new Set());
  assert.equal(join(segs), evil);
  assert.equal(segs[0].text, '<script>alert(1)</script><img src=x onerror="alert(2)"> call ');
  assert.equal(segs[0].masked, false);
  const html = segs.map((s) => (s.masked ? 'phone hidden' : esc(s.text))).join('');
  assert.ok(!html.includes('<') && !html.includes('"'));
  assert.equal(esc(`<b a="1">'&`), '&lt;b a=&quot;1&quot;&gt;&#39;&amp;');
});

test('AC21 local and international phone numbers are hidden too, and dates and other numbers are left alone', () => {
  for (const phone of ['555-0147', '555 0147', '253-555-0119', '(425) 555-0187', '+1 253 555 0119', '+44 20 7946 0958']) {
    const text = `Call me at ${phone}. Thanks`;
    const shown = maskNote(text, builtinSpans(text), new Set()).filter((s) => !s.masked).map((s) => s.text).join('');
    assert.equal(shown, 'Call me at . Thanks', phone);
  }
  for (const plain of ['Applications close Nov 30, 2026.', 'It starts 2027-03-01 in room 204.', 'I have 3.5 and 18 credits, about 5,000 saved.', 'My zip is 98101-1234.']) {
    assert.deepEqual(builtinSpans(plain), [], plain);
  }
});

// Spans exactly as Rampart Edge 2.0.5 returned them for this invented note (vendored model, run under Node).
const RAMPART_NOTE = 'My aunt Delphine Marchetti lives at 4418 Larkspur Ave NE, Seattle, WA 98105 and email jaylen.okafor17@example.com';
const RAMPART_SPANS = [
  { start: 8, end: 26, type: 'NAME', probability: 0.9978512561456658, source: 'model' },
  { start: 36, end: 75, type: 'ADDRESS', probability: 0.9999134728596436, source: 'model' },
  { start: 86, end: 113, type: 'EMAIL', probability: 1, source: 'validator', rule: 'email' },
];

test('AC21 every Rampart span type maps to a kind with plain words, names included', () => {
  for (const type of ['NAME', 'ADDRESS', 'EMAIL', 'PHONE', 'GOV_ID', 'FINANCIAL', 'DOB_KEYED', 'URL_HANDLE', 'OTHER_ID']) {
    const [span] = fromRampart([{ start: 0, end: 4, type }]);
    assert.ok(span, type);
    assert.ok(KIND_WORDS[span.type], `${type} has words`);
  }
  assert.deepEqual(fromRampart([{ start: 8, end: 26, type: 'NAME' }]), [{ start: 8, end: 26, type: 'name' }]);
  assert.deepEqual(KIND_WORDS.name, ['Names', 'name hidden']);
});

test('AC21 a real Rampart result hides the name, the address and the email, each behind its own switch', () => {
  const spans = mergeSpans(fromRampart(RAMPART_SPANS), builtinSpans(RAMPART_NOTE));
  assert.deepEqual(kindsIn(spans), ['name', 'address', 'email']);
  const segs = maskNote(RAMPART_NOTE, spans, new Set());
  assert.deepEqual(segs.filter((s) => s.masked).map((s) => [s.type, s.text]),
    [['name', 'Delphine Marchetti'], ['address', '4418 Larkspur Ave NE, Seattle, WA 98105'], ['email', 'jaylen.okafor17@example.com']]);
  assert.equal(join(segs), RAMPART_NOTE);
  const names = maskNote(RAMPART_NOTE, spans, new Set(['name']));
  assert.equal(names.find((s) => s.type === 'name').masked, false);
  assert.ok(names.filter((s) => s.type !== 'name' && s.type).every((s) => s.masked));
});

test('AC21 two kinds found in the same text stay hidden until both are switched on (found by Sol 6.1 with the real model)', () => {
  // The real detector reads "123" in this note as an ID; the built-in pattern reads the ten digits as a phone number.
  const text = 'My ID number is 1234567890.';
  const spans = mergeSpans(fromRampart([{ start: 16, end: 19, type: 'OTHER_ID' }]), builtinSpans(text));
  assert.deepEqual(kindsIn(spans).sort(), ['id', 'phone'], 'both kinds get a switch');
  const shown = (on) => maskNote(text, spans, new Set(on)).filter((s) => !s.masked).map((s) => s.text).join('');
  assert.equal(shown([]), 'My ID number is .');
  assert.equal(shown(['phone']), 'My ID number is .', 'phones on alone does not show the ID');
  assert.equal(shown(['id']), 'My ID number is .', 'IDs on alone does not show the phone number');
  assert.equal(shown(['id', 'phone']), text);
  const label = (on) => maskNote(text, spans, new Set(on)).find((s) => s.masked).type;
  assert.equal(label(['phone']), 'id', 'the label names the kind still hidden');
});

import { sortRequests, countByStatus, filterRequests, rowReason, nextStepWords, handlingWords, rowMeta } from '../public/advisor-client.js';

const req = (code, status, extra = {}) => ({ code, status, at: '2026-11-10T10:00:00.000Z', crisis: false, sample: false, reasons: [], ...extra });

test('AC21 the list puts crisis first, then new, in progress and resolved, newest first and samples last', () => {
  const rows = [
    req('R1', 'resolved'),
    req('P1', 'in_progress'),
    req('S1', 'new', { sample: true, at: '2026-11-10T12:00:00.000Z' }),
    req('N1', 'new', { at: '2026-11-10T09:00:00.000Z' }),
    req('N2', 'new', { at: '2026-11-10T11:00:00.000Z' }),
    req('C1', 'in_progress', { crisis: true }),
    req('C2', 'resolved', { crisis: true }),
  ];
  assert.deepEqual(sortRequests(rows).map((r) => r.code), ['C1', 'N2', 'N1', 'S1', 'P1', 'R1', 'C2']);
  assert.deepEqual(rows.map((r) => r.code)[0], 'R1', 'sorting leaves the input alone');
  assert.deepEqual(countByStatus(rows), { all: 7, crisis: 1, new: 3, in_progress: 2, resolved: 2 });
  assert.deepEqual(filterRequests(rows, 'in_progress').map((r) => r.code), ['C1', 'P1']);
  assert.deepEqual(filterRequests(rows, 'resolved').map((r) => r.code), ['R1', 'C2']);
  assert.equal(filterRequests(rows).length, 7);
  assert.deepEqual(countByStatus([]), { all: 0, crisis: 0, new: 0, in_progress: 0, resolved: 0 });
});

test('AC21 a row says why in plain words, and the next step reads as the student saw it', () => {
  assert.equal(rowReason(req('C', 'new', { crisis: true, reasons: ['UNKNOWN_SEATS'] })), 'Used crisis words. Reach them first.');
  assert.equal(rowReason(req('A', 'new', { reasons: ['UNKNOWN_AID_AMOUNT', 'UNKNOWN_SEATS'] })), 'How much aid they would get');
  assert.equal(rowReason(req('B', 'new')), 'Asked for an advisor');
  assert.equal(rowReason(req('D', 'resolved', { crisis: true, reasons: ['UNKNOWN_SEATS'] })), 'How many seats are left', 'a resolved crisis no longer jumps the queue');
  assert.equal(nextStepWords('start_aid_application'), 'Start the FAFSA or state aid application.');
  assert.equal(nextStepWords(null), null);
  assert.equal(nextStepWords('<b>'), null, 'an unknown code shows nothing rather than itself');
});

test('AC21 the handling line counts opens from the server and names the open before this one', () => {
  const now = new Date(2026, 10, 10, 15, 0);
  assert.equal(handlingWords({ opens: 1, last: null }, now), 'You are the first to open it.');
  assert.equal(handlingWords({ opens: 3, last: new Date(2026, 10, 10, 14, 5).toISOString() }, now),
    'Opened 3 times, counting this one. Last opened before this at 2:05 PM.');
  assert.match(handlingWords({ opens: 2, last: new Date(2026, 10, 3, 9, 0).toISOString() }, now), /Last opened before this on Nov 3\.$/);
  assert.match(handlingWords({}, now), /first to open/);
});

test('AC21 the opened request says when it was sent in a plain sentence', async () => {
  const { sentWords } = await import('../public/advisor-client.js');
  const now = new Date(2026, 10, 10, 15, 0);
  assert.equal(sentWords(new Date(2026, 10, 10, 14, 59, 50).toISOString(), now), 'Sent just now');
  assert.equal(sentWords(new Date(2026, 10, 10, 14, 50).toISOString(), now), 'Sent 10 min ago');
  assert.equal(sentWords(new Date(2026, 10, 10, 9, 5).toISOString(), now), 'Sent today at 9:05 AM');
  assert.equal(sentWords(new Date(2026, 10, 3, 9, 5).toISOString(), now), 'Sent Nov 3');
  assert.equal(sentWords('not a date', now), 'Sent');
});

test('AC21 unanswered work comes first inside each group, and the row says whether anyone answered', () => {
  const rows = [
    req('A1', 'new', { replies: 1, at: '2026-11-10T12:00:00.000Z' }),
    req('U1', 'new', { replies: 0, at: '2026-11-10T09:00:00.000Z' }),
    req('C1', 'new', { crisis: true, replies: 2 }),
    req('P1', 'in_progress', { replies: 0 }),
  ];
  assert.deepEqual(sortRequests(rows).map((r) => r.code), ['C1', 'U1', 'A1', 'P1']);
  assert.equal(rowMeta({ status: 'resolved', replies: 2, has_note: true }), 'Resolved · Answered · Private note');
  assert.equal(rowMeta({ status: 'new', replies: 0, has_note: false }), 'New · No note');
});
