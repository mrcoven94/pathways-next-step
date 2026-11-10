import { test } from 'node:test';
import assert from 'node:assert/strict';
import { builtinSpans, mergeSpans, maskNote, kindsIn, esc, fromRampart } from '../public/advisor-client.js';

const NOTE = 'Hi, this is Dani. Call me at 206-555-0142 or email dani.r@example.com after 4.';
const join = (segs) => segs.map((s) => s.text).join('');

test('AC21 phone and email in a note are masked by default', () => {
  const spans = builtinSpans(NOTE);
  assert.deepEqual(kindsIn(spans).sort(), ['email', 'phone']);
  const segs = maskNote(NOTE, spans, new Set());
  const masked = segs.filter((s) => s.masked);
  assert.deepEqual(masked.map((s) => [s.type, s.text]), [['phone', '206-555-0142'], ['email', 'dani.r@example.com']]);
  assert.ok(segs.filter((s) => !s.masked).every((s) => !s.text.includes('555') && !s.text.includes('@')));
  assert.ok(segs.some((s) => !s.masked && s.text.includes('Dani')), 'a name in a note to their own advisor stays visible');
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
  assert.deepEqual(rampart, [{ start: 29, end: 36, type: 'phone' }], 'a name from Rampart is not masked');
  const merged = mergeSpans(rampart, builtinSpans(NOTE));
  assert.equal(merged.length, 2);
  assert.deepEqual(merged[0], { start: 29, end: 41, type: 'phone' });
  assert.deepEqual(mergeSpans([{ start: 0, end: 5, type: 'a' }], [{ start: 3, end: 9, type: 'b' }, { start: 9, end: 10, type: 'c' }]),
    [{ start: 0, end: 9, type: 'a' }, { start: 9, end: 10, type: 'c' }]);
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
