import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inspect } from 'node:util';
import { startApp, LOG_FILE, dani } from './helpers.js';
import { handoffRequest } from '../public/client.js';
import { mockModel } from '../src/core/mock-model.js';
import { createGateway, PayloadRejected } from '../src/core/gateway.js';
import { fact } from '../src/core/records.js';
import { seal } from '../src/core/private.js';

// A string that exists nowhere else. If it shows up anywhere but the advisor read path, the note leaked.
const SENTINEL = 'SENTINEL-7Q4-PRIVATE';
const PHONE = '555-0147';
const NOTE = `${SENTINEL} my dad lost his job and we might have to move. Call me at ${PHONE}.`;
const CODE = 'test-advisor-code';
const LEAKS = [SENTINEL, PHONE, 'lost his job'];

/** The scripted model, with a record of every prompt it was handed. This sees what the log can't: a call made around the gateway. */
function spyModel() {
  const prompts = [];
  return { name: mockModel.name, prompts, complete: async (prompt) => { prompts.push(String(prompt)); return mockModel.complete(prompt); } };
}

/** Everything the process prints while the flow runs: console.* and raw writes to stdout and stderr. */
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

const get = (s, path, code) => fetch(s.base + path, { headers: code === undefined ? {} : { authorization: `Bearer ${code}` } });
const clean = (text, where) => { for (const leak of LEAKS) assert.ok(!String(text).includes(leak), `"${leak}" must not appear in ${where}`); };

test('AC18 private note: it reaches the advisor through the read path, and no model prompt, log, public response, printed line or copy of the queue', async () => {
  const spy = spyModel();
  const cap = captureOutput();
  const seen = {}; // every response body anyone without the advisor code can get
  let s, opened, opensBefore, queueForms;
  try {
    s = await startApp({ model: spy, advisorCode: CODE });
    const { plan } = await s.plan(dani({ age18: 'unsure', diploma: 'no', lean: 'earn' }));
    const req = handoffRequest({ name: 'Dani', note: NOTE, question: 'are there seats left?', reasons: plan.escalations.map((e) => e.code), nextStep: plan.next_step.action });
    const ticket = await s.post('/api/handoff', req.body);
    assert.match(ticket.body.code, /^ADV-[A-Z2-9]{4}$/);
    seen['the hand-off response'] = JSON.stringify(ticket.body);

    // Model calls made after the note is in the queue count too: an accidental leak would show up later.
    await s.plan(dani({ age18: 'yes', diploma: 'yes', lean: 'earn' }));
    await s.ask('how much does it pay', ['PRG-02']);
    await s.ask('are there seats left');
    // The note pushed at the two endpoints that do reach the model is refused before any call.
    const callsBefore = spy.prompts.length;
    const pushed = [
      [400, await s.post('/api/answer', { topic: NOTE, record_ids: ['PRG-02'] })],
      [400, await s.post('/api/answer', { topic: 'PAY', record_ids: [NOTE] })],
      [200, await s.post('/api/answer', { cannot_confirm: 'UNKNOWN_SEATS', topic: NOTE, record_ids: NOTE })], // answered by code, no model call
      [400, await s.post('/api/plan', { answers: { considering: ['PRG-02'], age18: NOTE, diploma: 'yes' } })],
      [400, await s.post('/api/plan', { answers: { considering: [NOTE] } })],
      [400, await s.post('/api/plan', { answers: dani({ age18: 'yes', diploma: 'yes', lean: 'earn' }), today: NOTE })],
      [200, await s.post('/api/answer', { topic: 'PAY', record_ids: ['PRG-02'], note: NOTE })],
      [200, await s.post('/api/plan', { answers: dani({ age18: 'yes', diploma: 'yes', lean: 'earn' }), note: NOTE })],
    ];
    pushed.forEach(([status, res], i) => {
      assert.equal(res.status, status, `request ${i + 1} with the note pushed at a model endpoint`);
      seen[`the reply to request ${i + 1} with the note pushed at a model endpoint`] = JSON.stringify(res.body);
    });
    assert.equal(spy.prompts.length, callsBefore + 2, 'the two valid requests reach the model without the extra field');

    // A body that isn't JSON: the parser's own error message quotes what it read, so the reply must not repeat it.
    for (const path of ['/api/handoff', '/api/plan', '/api/answer']) {
      const res = await fetch(s.base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: NOTE });
      assert.equal(res.status, 400, `${path} with a body that isn't JSON`);
      // The parser quotes only the first few characters, so the whole sentinel would never show. The reply must be the fixed sentence.
      const reply = await res.text();
      assert.equal(reply, JSON.stringify({ error: 'That request could not be read.' }), `${path} repeats nothing from an unreadable body`);
      seen[`the reply to an unreadable body at ${path}`] = reply;
    }

    for (const path of ['/api/log', '/api/records', '/api/handoff', '/api/handoffs', '/api/advisor/requests', `/api/advisor/requests/${ticket.body.code}`]) {
      seen[`GET ${path} without the code`] = await (await get(s, path)).text();
    }
    seen['the advisor read with a wrong code'] = await (await get(s, `/api/advisor/requests/${ticket.body.code}`, 'wrong-code')).text();
    const list = await get(s, '/api/advisor/requests', CODE);
    assert.equal(list.status, 200);
    seen['the advisor list'] = await list.text();
    assert.equal(JSON.parse(seen['the advisor list']).requests.at(-1).has_note, true, 'the list says a note exists without carrying it');

    // The queue itself, in every form a log line, an error or a store would turn it into.
    const queued = s.app.handoffs.at(-1);
    queueForms = {
      'JSON of the queue': JSON.stringify(s.app.handoffs),
      'a string of the note': String(queued.note),
      'a template with the note': `${queued.note}`,
      'the note joined to text': 'note: ' + queued.note,
      'util.inspect of the queue': inspect(s.app.handoffs, { depth: 9, showHidden: true }),
      'util.inspect with custom inspect off': inspect(queued.note, { depth: 9, showHidden: true, customInspect: false }),
      'the note spread into an object': JSON.stringify({ ...queued.note }),
      'the note\'s own values': JSON.stringify([Object.keys(queued.note), Object.values(queued.note), Object.getOwnPropertyNames(queued.note)]),
      'a structured clone of the request': JSON.stringify(structuredClone({ ...queued, note: { ...queued.note } })),
    };

    // The one way in: the advisor read, with the code. Nothing opened the note before this.
    opensBefore = s.app.opens.length;
    const read = await get(s, `/api/advisor/requests/${ticket.body.code}`, CODE);
    assert.equal(read.status, 200);
    opened = (await read.json()).request;
  } finally {
    cap.restore();
    await s?.close();
  }

  assert.equal(opened.note, NOTE, 'the advisor gets the note exactly as she wrote it');
  assert.equal(opened.first_name, 'Dani');
  assert.ok(opened.reasons.includes('DIPLOMA_TIMING_UNKNOWN'));

  assert.equal(opensBefore, 0, 'nothing opened the note before the advisor read: not the crisis check, the list or the queue');
  assert.equal(s.app.opens.length, 1, 'one advisor read is one recorded open');
  assert.deepEqual({ purpose: s.app.opens[0].purpose, code: s.app.opens[0].code }, { purpose: 'advisor_read', code: opened.code });
  clean(JSON.stringify(s.app.opens), 'the record of who opened it');

  assert.ok(spy.prompts.length >= 5, 'the model was called during the run');
  spy.prompts.forEach((prompt, i) => clean(prompt, `model prompt ${i + 1}`));
  assert.equal(spy.prompts.length, s.app.gateway.calls.length, 'every prompt the model received went through the gateway');
  clean(readFileSync(LOG_FILE, 'utf8'), 'model-calls.log');
  for (const [where, body] of Object.entries(seen)) clean(body, where);
  for (const [where, form] of Object.entries(queueForms)) clean(form, where);
  clean(cap.out.join('\n'), 'anything the server printed');
});

// Valid payloads of both shapes, built by hand so the walk below starts from something the gateway accepts.
const f = (id, key) => { const { record_id, key: k, text } = fact(id, key); return { record_id, key: k, text }; };
const PAYLOADS = [
  { task: 'explain_plan', next_step: { action: 'apply_by_deadline', record_id: 'PRG-02' }, programs: [{ record_id: 'PRG-02', outcome: 'unknown', reasons: ['AGE_UNCONFIRMED'] }], facts: [f('PRG-02', 'paid'), f('PRG-02', 'wage')] },
  { task: 'answer_topic', topic: 'PAY', open: ['DIPLOMA_TIMING_UNKNOWN'], facts: [f('PRG-02', 'paid'), f('PRG-02', 'wage')] },
];

/** Every way to put `value` into `payload`: in place of each string, appended to each string, and as a new field on each object. */
function* withNote(node, value, rebuild = (x) => x) {
  if (typeof node === 'string') {
    yield rebuild(value);
    if (typeof value === 'string') yield rebuild(`${node} ${value}`);
  } else if (Array.isArray(node)) {
    yield rebuild([...node, value]);
    for (const [i, item] of node.entries()) yield* withNote(item, value, (x) => rebuild(node.map((y, j) => (j === i ? x : y))));
  } else if (node && typeof node === 'object') {
    for (const extra of ['note', 'first_name', 'question', 'text', 'context']) if (!(extra in node)) yield rebuild({ ...node, [extra]: value });
    for (const [k, v] of Object.entries(node)) yield* withNote(v, value, (x) => rebuild({ ...node, [k]: x }));
  }
}

test('AC19 the gateway refuses the note in every position of every payload, as text or sealed, before the model is called', async () => {
  const spy = spyModel();
  const gateway = createGateway({ model: spy });
  for (const payload of PAYLOADS) assert.equal((await gateway.callModel(payload)).verdict, 'used', 'the starting payload is valid');
  let tried = 0;
  for (const payload of PAYLOADS) {
    for (const value of [NOTE, seal(NOTE), { note: NOTE }]) {
      for (const bad of withNote(payload, value)) {
        tried++;
        await assert.rejects(gateway.callModel(bad), (err) => {
          assert.ok(err instanceof PayloadRejected, JSON.stringify(bad).slice(0, 200));
          clean(err.message, 'the error for a refused payload'); // the error says where, never what
          return true;
        });
      }
    }
  }
  // Objects that tell the check one thing and the prompt another. Sol 6.1 found the first in review of the plan.
  const [plan] = PAYLOADS;
  const hook = (target, value) => Object.defineProperty(structuredClone(target), 'toJSON', { value: () => value, enumerable: false });
  let reads = 0;
  const sneaky = [
    hook(plan, { ...plan, note: NOTE }),
    hook(plan, NOTE),
    { ...plan, next_step: hook(plan.next_step, { ...plan.next_step, note: NOTE }) },
    { ...plan, facts: [hook(plan.facts[0], { ...plan.facts[0], text: NOTE }), plan.facts[1]] },
    { ...plan, toJSON() { throw new Error(NOTE); } },
  ];
  for (const bad of sneaky) {
    tried++;
    await assert.rejects(gateway.callModel(bad), (err) => err instanceof PayloadRejected && !err.message.includes(SENTINEL));
  }
  // A field that answers the check truthfully and anything after it with the note. It is read once, for the copy that is sent.
  const twoFaced = Object.defineProperty({ ...plan }, 'task', { enumerable: true, get: () => (reads++ ? NOTE : 'explain_plan') });
  assert.equal((await gateway.callModel(twoFaced)).verdict, 'used');
  assert.ok(tried > 100, `${tried} placements tried`);
  if (process.env.SHOW_TRIED) console.log(`placements tried: ${tried}`);
  assert.equal(spy.prompts.length, PAYLOADS.length + 1, 'the model saw only the valid payloads');
  spy.prompts.forEach((prompt) => clean(prompt, 'a model prompt'));
});

test('AC20 the advisor inbox is closed without an access code, and its list never carries a note', async () => {
  // No code configured: the routes don't exist, whatever the caller sends.
  const closed = await startApp();
  try {
    const ticket = await closed.post('/api/handoff', { first_name: 'Dani', note: NOTE, reasons: [] });
    for (const code of [undefined, '', 'undefined', 'null', CODE]) {
      for (const path of ['/api/advisor/requests', `/api/advisor/requests/${ticket.body.code}`]) {
        const res = await get(closed, path, code);
        assert.equal(res.status, 404, `${path} with code ${JSON.stringify(code)}`);
        clean(await res.text(), `${path} on a server with no code`);
      }
    }
    assert.equal(closed.app.opens.length, 0);
  } finally {
    await closed.close();
  }

  const s = await startApp({ advisorCode: CODE });
  try {
    const ticket = await s.post('/api/handoff', { first_name: 'Dani', note: NOTE, question: 'are there seats left?', reasons: ['UNKNOWN_SEATS'] });
    const one = `/api/advisor/requests/${ticket.body.code}`;
    for (const code of [undefined, '', 'wrong', CODE + 'x', CODE.slice(0, -1), CODE.toUpperCase()]) {
      for (const path of ['/api/advisor/requests', one]) {
        const res = await get(s, path, code);
        assert.equal(res.status, 401, `${path} with code ${JSON.stringify(code)}`);
        clean(await res.text(), `${path} with a wrong code`);
      }
    }
    const post = (path, body, code) => fetch(s.base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(code && { authorization: `Bearer ${code}` }) }, body: JSON.stringify(body) });
    assert.equal((await post(`${one}/status`, { status: 'resolved' })).status, 401, 'status needs the code too');
    assert.equal(s.app.opens.length, 0, 'a refused request opens nothing');

    const list = await (await get(s, '/api/advisor/requests', CODE)).json();
    assert.equal(list.requests.length, 1);
    assert.deepEqual(Object.keys(list.requests[0]).sort(), ['at', 'code', 'crisis', 'first_name', 'has_note', 'next_step', 'question', 'reasons', 'status']);
    assert.deepEqual({ ...list.requests[0], at: null }, { code: ticket.body.code, first_name: 'Dani', question: 'are there seats left?', reasons: ['UNKNOWN_SEATS'], next_step: null, at: null, status: 'new', has_note: true, crisis: false });
    clean(JSON.stringify(list), 'the advisor list');
    assert.equal(s.app.opens.length, 0, 'listing opens nothing');

    assert.equal((await post(`${one}/status`, { status: 'in_progress' }, CODE)).status, 200);
    assert.equal((await post(`${one}/status`, { status: NOTE }, CODE)).status, 400);
    assert.equal((await (await get(s, '/api/advisor/requests', CODE)).json()).requests[0].status, 'in_progress');
    assert.equal((await get(s, '/api/advisor/requests/ADV-ZZZZ', CODE)).status, 404);
    assert.equal(s.app.opens.length, 0, 'triage without reading opens nothing');
  } finally {
    await s.close();
  }
});

test('AC10b crisis words in a note are still flagged for the advisor once the note is sealed', async () => {
  const s = await startApp({ advisorCode: CODE });
  try {
    // The page stops a crisis note before sending. This is the server's own check, for a request that skips the page.
    const ticket = await s.post('/api/handoff', { first_name: 'Dani', note: 'I am not safe at home', reasons: [] });
    assert.equal(ticket.body.crisis, true);
    const list = await (await get(s, '/api/advisor/requests', CODE)).json();
    assert.equal(list.requests[0].crisis, true);
    assert.equal(s.app.opens.length, 0);
  } finally {
    await s.close();
  }
});

test('AC20b two requests never share a code, so an advisor can never open one student\'s note under another\'s request', async () => {
  const codes = ['ADV-AAAA', 'ADV-AAAA', 'ADV-AAAA', 'ADV-BBBB'];
  const s = await startApp({ advisorCode: CODE, handoffCode: () => codes.shift() });
  try {
    const first = await s.post('/api/handoff', { first_name: 'Dani', note: NOTE, reasons: [] });
    const second = await s.post('/api/handoff', { first_name: 'Marcus', note: 'a different note', reasons: [] });
    assert.deepEqual([first.body.code, second.body.code], ['ADV-AAAA', 'ADV-BBBB']);
    const read = async (code) => (await (await get(s, `/api/advisor/requests/${code}`, CODE)).json()).request;
    assert.equal((await read('ADV-AAAA')).note, NOTE);
    assert.deepEqual([(await read('ADV-BBBB')).first_name, (await read('ADV-BBBB')).note], ['Marcus', 'a different note']);
  } finally {
    await s.close();
  }
});
