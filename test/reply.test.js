import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inspect } from 'node:util';
import { startApp, LOG_FILE, dani, dani as dani_ } from './helpers.js';
import { mockModel } from '../src/core/mock-model.js';

// Copied from test/private-note.test.js on purpose: each test file stands alone.
function spyModel() {
  const prompts = [];
  return { name: mockModel.name, prompts, complete: async (prompt) => { prompts.push(String(prompt)); return mockModel.complete(prompt); } };
}
function captureOutput() {
  const out = [];
  const names = ['log', 'info', 'warn', 'error', 'debug', 'trace', 'dir'];
  const saved = names.map((n) => console[n]);
  names.forEach((n) => { console[n] = (...args) => { out.push(args.map((a) => (typeof a === 'string' ? a : inspect(a, { depth: 9 }))).join(' ')); }; });
  const streams = [process.stdout, process.stderr].map((stream) => {
    const write = stream.write;
    stream.write = function (chunk, ...rest) { out.push(String(chunk)); return write.call(stream, chunk, ...rest); };
    return () => { stream.write = write; };
  });
  return { out, restore() { names.forEach((n, i) => { console[n] = saved[i]; }); streams.forEach((undo) => undo()); } };
}

// A reply can quote the note, so it is held to the note's rules.
const REPLY_SENTINEL = 'REPLY-SENTINEL-9K2';
const REPLY = `${REPLY_SENTINEL} I checked: the welding program has a spring start. Your aunt can drive you on Saturdays.`;
const NOTE_SENTINEL = 'NOTE-SENTINEL-3H8';
const NOTE = `${NOTE_SENTINEL} my aunt drives me on weekends only.`;
const NAME = 'Quillon';
const QUESTION = 'QUESTION-SENTINEL-5P1 is there a weekend option?';
const REASON = 'UNKNOWN_START_DATE';

const replyLeaks = (text, where) => assert.ok(!String(text).includes(REPLY_SENTINEL), `the reply must not appear in ${where}`);
const reply = (s, code, body) => fetch(`${s.base}/api/advisor/requests/${code}/reply`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const status = (s, code, next) => fetch(`${s.base}/api/advisor/requests/${code}/status`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: next }) });

test('AC25 a reply reaches the advisor read and the student read word for word, and no prompt, log, list, other reply, printed line or copy of the queue', async () => {
  const spy = spyModel();
  const cap = captureOutput();
  const seen = {};
  let s, advisorRead, studentRead, code, queueForms, opensForNote;
  try {
    s = await startApp({ model: spy });
    code = (await s.post('/api/handoff', { first_name: NAME, note: NOTE, question: QUESTION, reasons: [REASON] })).body.code;
    await s.plan(dani({ age18: 'yes', diploma: 'yes', lean: 'earn' }));

    const sent = await reply(s, code, { text: `  ${REPLY}  ` });
    assert.equal(sent.status, 200);
    seen['the reply to sending a reply'] = await sent.text();
    const after = JSON.parse(seen['the reply to sending a reply']).request;
    assert.equal(after.replies, 1, 'the row now counts one reply');
    assert.equal(after.status, 'resolved', 'the first reply resolves the request');

    // Model calls after the reply is in the queue count too.
    await s.plan(dani({ age18: 'unsure', diploma: 'no', lean: 'earn' }));
    await s.ask('how much does it pay', ['PRG-02']);
    await s.post('/api/answer', { topic: 'PAY', record_ids: ['PRG-02'], reply: REPLY });

    const moved = await status(s, code, 'in_progress');
    assert.equal(moved.status, 200, 'a status change still works after a reply');
    seen['the reply to a status change'] = await moved.text();
    assert.equal(JSON.parse(seen['the reply to a status change']).request.status, 'in_progress');

    for (const path of ['/api/advisor/requests', '/api/log', '/api/records', `/api/advisor/requests/${code}/reply`, `/api/advisor/requests/${code}/status`, '/api/handoff/ADV-ZZZZ']) {
      seen[`GET ${path}`] = await (await fetch(s.base + path)).text();
    }
    const tooLong = await reply(s, code, { text: `${REPLY}${'x'.repeat(1000)}` });
    seen['the reply to a reply that is too long'] = await tooLong.text();
    const unreadable = await fetch(`${s.base}/api/advisor/requests/${code}/reply`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: REPLY });
    assert.equal(unreadable.status, 400);
    seen['the reply to an unreadable body'] = await unreadable.text();

    const queued = s.app.handoffs.find((h) => h.code === code);
    queueForms = {
      'JSON of the queue': JSON.stringify(s.app.handoffs),
      'a string of the reply': String(queued.replies[0].text),
      'a template with the replies': `${queued.replies.map((r) => r.text)}`,
      'util.inspect of the queue': inspect(s.app.handoffs, { depth: 9, showHidden: true }),
      'util.inspect with custom inspect off': inspect(queued.replies[0].text, { depth: 9, showHidden: true, customInspect: false }),
      'a structured clone of the replies': JSON.stringify(structuredClone(queued.replies.map((r) => ({ ...r, text: { ...r.text } })))),
    };

    // The two reads that may carry it.
    studentRead = await (await fetch(`${s.base}/api/handoff/${code}`)).json();
    advisorRead = (await (await fetch(`${s.base}/api/advisor/requests/${code}`)).json()).request;
    opensForNote = s.app.opens.filter((o) => o.code === code && o.purpose === 'advisor_read').length;
  } finally {
    cap.restore();
    await s?.close();
  }

  assert.deepEqual(advisorRead.replies.map((r) => r.text), [REPLY], 'the advisor read carries the reply, trimmed, word for word');
  assert.match(advisorRead.replies[0].at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(advisorRead.note, NOTE);
  assert.deepEqual(Object.keys(studentRead).sort(), ['code', 'replies', 'status']);
  assert.deepEqual(studentRead, { code, status: 'in_progress', replies: [{ from: 'advisor', text: REPLY, at: advisorRead.replies[0].at }] });
  assert.equal(opensForNote, 1, 'reading replies did not count as opening the note');
  assert.deepEqual(s.app.opens.filter((o) => o.code === code).map((o) => o.purpose), ['advisor_read'], 'the note list holds note opens only');
  assert.deepEqual(s.app.replyOpens.filter((o) => o.code === code).map((o) => o.purpose).sort(), ['advisor_reply_read', 'student_reply_read'], 'each reply read is recorded with its own purpose');

  assert.ok(spy.prompts.length >= 3, 'the model was called during the run, after the reply too');
  spy.prompts.forEach((p, i) => replyLeaks(p, `model prompt ${i + 1}`));
  replyLeaks(readFileSync(LOG_FILE, 'utf8'), 'model-calls.log');
  for (const [where, body] of Object.entries(seen)) replyLeaks(body, where);
  for (const [where, form] of Object.entries(queueForms)) replyLeaks(form, where);
  replyLeaks(JSON.stringify([s.app.opens, s.app.replyOpens]), 'the record of opens');
  replyLeaks(cap.out.join('\n'), 'anything the server printed');
});

test('AC25 the student read carries only the code, the status and the replies: never the note, name, question or reasons', async () => {
  const s = await startApp();
  try {
    const code = (await s.post('/api/handoff', { first_name: NAME, note: NOTE, question: QUESTION, reasons: [REASON] })).body.code;
    const before = await fetch(`${s.base}/api/handoff/${code}`);
    assert.equal(before.status, 200);
    const empty = await before.text();
    assert.deepEqual(JSON.parse(empty), { code, status: 'new', replies: [] }, 'no answer yet');
    assert.equal((await reply(s, code, { text: 'Yes, there is a Saturday cohort.' })).status, 200);
    const text = await (await fetch(`${s.base}/api/handoff/${code}`)).text();
    for (const leak of [NOTE_SENTINEL, NAME, 'QUESTION-SENTINEL', REASON, 'first_name', 'note', 'question', 'reasons']) {
      assert.ok(!text.includes(leak) && !empty.includes(leak), `the student read must not carry ${leak}`);
    }
    assert.equal(s.app.opens.filter((o) => o.purpose === 'advisor_read').length, 0, 'the student read never opens the note');
    assert.equal((await fetch(`${s.base}/api/handoff/ADV-ZZZZ`)).status, 404);
    assert.equal((await fetch(`${s.base}/api/handoff/nonsense`)).status, 404);
  } finally {
    await s.close();
  }
});

test('AC25 replies: empty, too long, more than 10, unknown codes; follow-ups, a chosen status, and the samples', async () => {
  const s = await startApp();
  try {
    const code = (await s.post('/api/handoff', { first_name: 'Rio', note: NOTE, reasons: [] })).body.code;
    for (const body of [{}, { text: '' }, { text: '   ' }, { text: 42 }, { text: 'x'.repeat(1001) }]) {
      const res = await reply(s, code, body);
      assert.equal(res.status, 400, JSON.stringify(body).slice(0, 40));
    }
    assert.equal((await reply(s, code, { text: 'y'.repeat(1000) })).status, 200, '1000 characters is allowed');
    assert.equal((await reply(s, 'ADV-ZZZZ', { text: 'hello' })).status, 404);
    assert.equal((await fetch(`${s.base}/api/advisor/requests/${code}/reply`)).status, 404, 'GET on the reply route is not a read');

    // Follow-ups keep the status the advisor set; a first reply can keep its status if the advisor says so.
    assert.equal((await status(s, code, 'in_progress')).status, 200);
    const follow = await (await reply(s, code, { text: 'One more thing.' })).json();
    assert.equal(follow.request.status, 'in_progress', 'only the first reply resolves');
    const other = (await s.post('/api/handoff', { first_name: 'Sam', note: '', reasons: [] })).body.code;
    const kept = await (await reply(s, other, { text: 'Looking into it.', status: 'in_progress' })).json();
    assert.equal(kept.request.status, 'in_progress', 'the advisor chose to keep it open');
    assert.equal((await reply(s, other, { text: 'ok', status: 'done' })).status, 400, 'an unknown status is refused');

    for (let i = 3; i <= 10; i++) assert.equal((await reply(s, code, { text: `reply ${i}` })).status, 200, `reply ${i}`);
    assert.equal((await reply(s, code, { text: 'reply 11' })).status, 400, 'ten replies at most');
    const rows = (await (await fetch(`${s.base}/api/advisor/requests`)).json()).requests;
    assert.equal(rows.find((r) => r.code === code).replies, 10);
    assert.equal(rows.find((r) => r.code === other).replies, 1);

    const sample = rows.find((r) => r.sample).code;
    assert.equal((await reply(s, sample, { text: 'Sample answer.' })).status, 200);
    assert.deepEqual((await (await fetch(`${s.base}/api/handoff/${sample}`)).json()).replies.at(-1), { from: 'advisor', text: 'Sample answer.', at: (await (await fetch(`${s.base}/api/handoff/${sample}`)).json()).replies.at(-1).at });
    assert.equal(s.app.opens.filter((o) => o.purpose === 'advisor_read').length, 0, 'replying opens no note');
  } finally {
    await s.close();
  }
});

const STUDENT_SENTINEL = 'STUDENT-SENTINEL-6W4';
const back = (s, code, body) => fetch(`${s.base}/api/handoff/${code}/reply`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('AC25 the student answers back: her follow-up reaches both reads in order, and no prompt, log, list row or printed line', async () => {
  const spy = spyModel();
  const cap = captureOutput();
  let s, advisorRead, studentRead, list, other;
  try {
    s = await startApp({ model: spy });
    const code = (await s.post('/api/handoff', { first_name: 'Rio', note: NOTE, reasons: [] })).body.code;
    assert.equal((await reply(s, code, { text: 'Which days work for you?' })).status, 200);
    const sent = await back(s, code, { text: `  ${STUDENT_SENTINEL} Saturdays work best.  ` });
    assert.equal(sent.status, 200);
    other = await sent.text();
    assert.equal(JSON.parse(other).status, 'in_progress', 'her answer reopens a resolved request');
    await s.plan(dani({ age18: 'yes', diploma: 'yes', lean: 'earn' }));
    await s.ask('how much does it pay', ['PRG-02']);
    list = await (await fetch(`${s.base}/api/advisor/requests`)).text();
    for (const body of [{}, { text: ' ' }, { text: 'x'.repeat(1001) }]) assert.equal((await back(s, code, body)).status, 400);
    assert.equal((await back(s, 'ADV-ZZZZ', { text: 'hi' })).status, 404);
    studentRead = await (await fetch(`${s.base}/api/handoff/${code}`)).json();
    advisorRead = (await (await fetch(`${s.base}/api/advisor/requests/${code}`)).json()).request;
    for (let i = 3; i <= 6; i++) assert.equal((await back(s, code, { text: `m${i}` })).status, 200);
    assert.equal((await back(s, code, { text: 'm7' })).status, 400, 'five messages from the student');
    assert.equal((await reply(s, code, { text: 'a2' })).status, 200, 'the advisor still has room');
  } finally {
    cap.restore();
    await s?.close();
  }
  const expected = [['advisor', 'Which days work for you?'], ['student', `${STUDENT_SENTINEL} Saturdays work best.`]];
  assert.deepEqual(advisorRead.replies.map((r) => [r.from, r.text]), expected);
  assert.deepEqual(studentRead.replies.map((r) => [r.from, r.text]), expected);
  const gone = (text, where) => assert.ok(!String(text).includes(STUDENT_SENTINEL), `her follow-up must not appear in ${where}`);
  spy.prompts.forEach((p, i) => gone(p, `model prompt ${i + 1}`));
  gone(readFileSync(LOG_FILE, 'utf8'), 'model-calls.log');
  gone(list, 'the inbox list');
  gone(other, 'the reply to sending it');
  gone(JSON.stringify(s.app.handoffs), 'JSON of the queue');
  gone(cap.out.join('\n'), 'anything the server printed');
});

test('AC25 the two samples arrive with an invented conversation, sealed like any other', async () => {
  const spy = spyModel();
  let s, rows, dani, marcus;
  try {
    s = await startApp({ model: spy });
    rows = (await (await fetch(`${s.base}/api/advisor/requests`)).json()).requests;
    await s.plan(dani_({ age18: 'yes', diploma: 'yes', lean: 'earn' }));
    dani = (await (await fetch(`${s.base}/api/advisor/requests/ADV-SMPA`)).json()).request;
    marcus = (await (await fetch(`${s.base}/api/advisor/requests/ADV-SMPB`)).json()).request;
  } finally {
    await s?.close();
  }
  assert.deepEqual(rows.filter((r) => r.sample).map((r) => [r.code, r.replies, r.status]), [['ADV-SMPA', 3, 'resolved'], ['ADV-SMPB', 1, 'in_progress']]);
  assert.deepEqual(dani.replies.map((r) => r.from), ['advisor', 'student', 'advisor']);
  assert.ok(dani.replies.every((r, i) => i === 0 || r.at > dani.replies[i - 1].at), 'in order');
  assert.ok(dani.replies.every((r) => r.at > dani.at), 'after the note');
  assert.match(dani.replies[1].text, /555/);
  assert.equal(marcus.note, '');
  const seeded = [...dani.replies, ...marcus.replies].map((r) => r.text);
  const log = readFileSync(LOG_FILE, 'utf8');
  assert.ok(spy.prompts.length >= 1);
  for (const text of seeded) {
    const bit = text.slice(0, 40);
    assert.ok(!JSON.stringify(rows).includes(bit), 'no list row');
    assert.ok(spy.prompts.every((p) => !p.includes(bit)), 'no model prompt');
    assert.ok(!log.includes(bit), 'no model-calls.log line');
  }
});

test('AC25 a student cannot fill the thread: she writes back only after an answer, five times at most, and the advisor always has room', async () => {
  const s = await startApp();
  try {
    const code = (await s.post('/api/handoff', { first_name: 'Rio', note: NOTE, reasons: [] })).body.code;
    const early = await back(s, code, { text: 'hello?' });
    assert.equal(early.status, 400, 'no follow-up before an advisor has answered');
    assert.match((await early.json()).error, /^[A-Z][^{}<>]*\.$/, 'a plain message');
    assert.equal((await (await fetch(`${s.base}/api/handoff/${code}`)).json()).replies.length, 0, 'nothing was stored');

    assert.equal((await reply(s, code, { text: 'First answer.' })).status, 200);
    for (let i = 1; i <= 5; i++) assert.equal((await back(s, code, { text: `s${i}` })).status, 200, `student message ${i}`);
    const sixth = await back(s, code, { text: 's6' });
    assert.equal(sixth.status, 400, 'five student messages at most');
    assert.ok(!(await sixth.text()).includes('s6'), 'the refusal does not repeat what was typed');

    for (let i = 2; i <= 10; i++) assert.equal((await reply(s, code, { text: `a${i}` })).status, 200, `advisor reply ${i} still fits`);
    assert.equal((await reply(s, code, { text: 'a11' })).status, 400, 'ten advisor replies at most');
    const thread = (await (await fetch(`${s.base}/api/handoff/${code}`)).json()).replies;
    assert.deepEqual([thread.filter((r) => r.from === 'advisor').length, thread.filter((r) => r.from === 'student').length], [10, 5]);
  } finally {
    await s.close();
  }
});
