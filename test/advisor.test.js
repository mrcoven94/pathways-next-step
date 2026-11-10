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
