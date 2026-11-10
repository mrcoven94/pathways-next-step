// HTTP API and static files. Used by server.js locally and api/index.js on Vercel.
// The name and advisor note arrive only at /api/handoff, which never touches the gateway.
// The note is sealed there. Only the advisor read path opens it, and every open is recorded.
// In this demo that path is public: there is no sign-in, and nothing in the queue belongs to a real student.

import { randomInt } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RECORDS, getRecord, fact } from './core/records.js';
import { planNextStep, BadAnswers } from './core/planner.js';
import { TOPIC_CODES, TOPIC_KEYS, isCrisis } from './core/topics.js';
import { createGateway, PayloadRejected } from './core/gateway.js';
import { CANNOT_CONFIRM } from './core/templates.js';
import { mockModel } from './core/mock-model.js';
import { seal, Sealed } from './core/private.js';

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const CORE = fileURLToPath(new URL('./core/', import.meta.url));
const BROWSER_MODULES = new Set(['topics.js', 'planner.js', 'records.js']); // pure modules the browser shares; never the gateway
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

const toPayloadFact = ({ record_id, key, text }) => ({ record_id, key, text });
const withChecked = (f) => ({ ...f, checked: getRecord(f.record_id).checked });
const advisorFacts = () => [fact('ADV-01', 'confirms'), fact('ADV-01', 'response')];

function dedupe(facts) {
  const seen = new Set();
  return facts.filter((f) => !seen.has(f.record_id + f.key) && seen.add(f.record_id + f.key));
}

function newHandoffCode() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return 'ADV-' + Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join('');
}

const STATUSES = ['new', 'in_progress', 'resolved'];
const PAGES = { '/': 'index.html', '/how': 'how.html', '/advisor': 'advisor.html', '/report': 'report.html', '/guide': 'guide.html' };
// The inbox shows student-typed text, so it may load nothing from anywhere else.
// 'wasm-unsafe-eval' lets the page compile Rampart Edge's WASM engine from this site; it allows no eval of JS.
const INBOX_POLICY = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/** A request as the inbox list shows it: everything but the note and the replies, which stay sealed. Replies are only counted. */
const listed = ({ note, replies, ...rest }) => ({ ...rest, has_note: !note.empty, replies: replies.length, answered: replies.some((r) => r.from === 'advisor') });
const MAX_QUEUE = 500; // the demo queue is in memory, so it has a ceiling; the oldest requests go first

// The inbox always shows two invented requests, so the page shows what an advisor sees at once.
// They are made once and kept apart from the queue: listing them costs real requests no room.
const SAMPLES = [
  { first_name: 'Dani', question: 'are there seats left?', reasons: ['DIPLOMA_TIMING_UNKNOWN', 'UNKNOWN_SEATS'], next_step: 'ask_advisor_then_apply',
    note: 'My dad Marcus Hale lost his job last month, so I need to work while I train. You can text me at 253-555-0119 or dani.r@example.com. We live at 418 Alder Street in Tacoma.',
    status: 'resolved',
    // An invented exchange, so a reviewer sees a whole conversation without typing. Minutes are before the server started.
    thread: [
      ['advisor', 150, 'Hi Dani, thanks for telling me. The records don’t say how many seats are left or when you need your diploma, so I called Northline and will confirm both by Thursday. Do you expect your diploma in June, or a GED sooner?'],
      ['student', 120, 'June. My phone is new, it’s 253-555-0144 if texting is easier.'],
      ['advisor', 30, 'Thanks, Dani. I’ll text you on Thursday once Northline confirms both. Then let’s fill in the application together before the deadline.'],
    ] },
  { first_name: 'Marcus', question: 'how much aid will I get?', reasons: ['UNKNOWN_AID_AMOUNT'], next_step: 'start_aid_application', note: '',
    status: 'in_progress',
    thread: [
      ['advisor', 60, 'Hi Marcus. The records don’t list award amounts, and the amount is different for each student, so I can’t give you a number yet. Start your FAFSA or state aid application this week and send me a message when it’s in. We’ll go through it together.'],
    ] },
];
// Each side has its own room, so a student can never fill the thread and leave the advisor unable to answer.
const MAX_ADVISOR_REPLIES = 10;
const MAX_STUDENT_REPLIES = 5;
const fromWho = (request, from) => request.replies.filter((r) => r.from === from).length;
// The demo keeps a bounded history: only the latest MAX_OPENS records of each kind. The count an opened request
// shows comes from a tally per request, kept only while the request is in the queue, so dropping old records
// never makes a request still in the queue show a smaller count.
const MAX_OPENS = 1000;
const keepLatest = (log) => { if (log.length > MAX_OPENS) log.splice(0, log.length - MAX_OPENS); };

/**
 * @param {{model?: object, logFile?: string|null, today?: () => string}} opts
 */
/** Today's date where the pilot runs, so a deadline stays open until midnight there, not in UTC. */
export function todayIn(timeZone = 'America/Los_Angeles', now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function createApp({ model = mockModel, logFile = null, today = () => todayIn(), handoffCode = newHandoffCode } = {}) {
  const gateway = createGateway({ model, logFile });
  const handoffs = []; // stand-in for the advisor queue; served only by the advisor routes below
  const started = Date.now();
  const ago = (min) => new Date(started - min * 60000).toISOString();
  const samples = SAMPLES.map((s, i) => ({
    code: `ADV-SMP${'AB'[i]}`, first_name: s.first_name, note: seal(s.note), question: s.question, reasons: s.reasons,
    next_step: s.next_step, at: ago(180), status: s.status, sample: true, crisis: false,
    replies: s.thread.map(([from, min, text]) => ({ from, text: seal(text), at: ago(min) })), // sealed like any message
  }));
  const used = new Set(samples.map((s) => s.code)); // every code ever given out, so one is never given twice
  const opens = []; // every time a sealed note was opened: why, which request, when. Never the text.
  const replyOpens = []; // every time a sealed reply was read, by the advisor or the student. Kept apart so note opens stay a true count.
  const noteTally = new Map(); // code -> { n, at }: how many times that request's note was opened, and when last
  const readReplies = (request, purpose) => {
    const replies = request.replies.map((r) => ({ from: r.from, text: Sealed.open(r.text, replyOpens, { purpose, code: request.code }), at: r.at }));
    keepLatest(replyOpens);
    return replies;
  };

  async function plan({ answers, today: asOf }) {
    if (asOf !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new BadAnswers('today must look like 2026-12-05.');
    const p = planNextStep(answers, asOf ?? today());
    const payload = {
      task: 'explain_plan',
      next_step: { action: p.next_step.action, record_id: p.next_step.record_id },
      programs: p.programs.map(({ record_id, outcome, reasons }) => ({ record_id, outcome, reasons })),
      facts: dedupe([...p.next_step.facts, ...p.programs.flatMap((x) => x.facts), ...p.aid, ...p.advisor.facts]).map(toPayloadFact),
    };
    const summary = await gateway.callModel(payload);
    return { plan: p, summary };
  }

  async function answer(body) {
    if (body.cannot_confirm) {
      const code = body.cannot_confirm in CANNOT_CONFIRM ? body.cannot_confirm : 'UNMATCHED_QUESTION';
      // The one code-written answer that states a fact carries that fact's source.
      const facts = code === 'UNKNOWN_AID_AMOUNT' ? [fact('AID-A', 'amount')] : [];
      return { kind: 'cannot_confirm', code, text: CANNOT_CONFIRM[code], facts, advisor: advisorFacts() };
    }
    const { topic, record_ids } = body;
    if (!TOPIC_CODES.includes(topic) || !Array.isArray(record_ids) || !record_ids.every(getRecord)) {
      throw new PayloadRejected('Unknown topic or record.');
    }
    const keys = TOPIC_KEYS[topic];
    const facts = record_ids.flatMap((id) => getRecord(id).facts.filter((f) => keys.includes(f.key)).map((f) => fact(id, f.key)));
    if (!facts.length) {
      return { kind: 'cannot_confirm', code: 'NOT_IN_RECORDS', text: CANNOT_CONFIRM.NOT_IN_RECORDS, facts: [], advisor: advisorFacts() };
    }
    const open = topic === 'DIPLOMA_RULE' ? ['DIPLOMA_TIMING_UNKNOWN'] : [];
    const reply = await gateway.callModel({ task: 'answer_topic', topic, open, facts: facts.map(toPayloadFact) });
    return { kind: 'answer', topic, ...reply, facts, open, advisor: advisorFacts() };
  }

  function handoff({ first_name = '', note = '', question = '', reasons = [], next_step = null }) {
    const clean = (s, n) => String(s ?? '').slice(0, n);
    const raw = clean(note, 1000); // the last line that holds the note as plain text
    let code = handoffCode();
    while (used.has(code)) code = handoffCode(); // a code names one request, for good
    used.add(code);
    const request = {
      code,
      first_name: clean(first_name, 40),
      note: seal(raw),
      question: clean(question, 300),
      reasons: (Array.isArray(reasons) ? reasons : []).map((r) => clean(r, 40)).slice(0, 12),
      next_step: next_step ? clean(next_step, 40) : null,
      at: new Date().toISOString(),
      status: 'new',
      sample: false,
      replies: [], // the advisor's answers, each sealed like the note: { text: Sealed, at }
    };
    request.crisis = [request.first_name, raw, request.question].some(isCrisis);
    handoffs.push(request);
    if (handoffs.length > MAX_QUEUE) for (const gone of handoffs.splice(0, handoffs.length - MAX_QUEUE)) noteTally.delete(gone.code);
    return {
      code: request.code,
      crisis: request.crisis,
      response: fact('ADV-01', 'response'),
      label: 'This is a request for an advisor, not an application.',
    };
  }

  /** The advisor read path: list without notes, open one request, set a status. Public in this demo. */
  async function advisor(req, res, pathname) {
    const m = pathname.match(/^\/api\/advisor\/requests(?:\/(ADV-[A-Z2-9]{4})(?:\/(status|reply))?)?$/);
    if (!m) return send(res, 404, { error: 'Not found' });
    const [, code, action] = m;
    const status = action === 'status';
    if (!code) {
      if (req.method !== 'GET') return send(res, 404, { error: 'Not found' });
      return send(res, 200, { requests: [...handoffs, ...samples].map(listed) });
    }
    const request = handoffs.find((h) => h.code === code) ?? samples.find((h) => h.code === code);
    if (!request) return send(res, 404, { error: 'Not found' });
    if (status && req.method === 'POST') {
      const next = (await readJson(req)).status;
      if (!STATUSES.includes(next)) return send(res, 400, { error: 'Status must be new, in_progress or resolved.' });
      request.status = next;
      return send(res, 200, { request: listed(request) });
    }
    if (action === 'reply' && req.method === 'POST') {
      const body = await readJson(req);
      // Fixed messages only: a refusal never repeats what was typed.
      const text = typeof body.text === 'string' ? body.text.trim() : '';
      if (!text || text.length > 1000) return send(res, 400, { error: 'A reply must be 1 to 1000 characters.' });
      if (body.status !== undefined && !STATUSES.includes(body.status)) return send(res, 400, { error: 'Status must be new, in_progress or resolved.' });
      if (fromWho(request, 'advisor') >= MAX_ADVISOR_REPLIES) return send(res, 400, { error: `A request holds ${MAX_ADVISOR_REPLIES} replies from the advisor at most.` });
      const at = new Date().toISOString();
      const first = !request.replies.some((r) => r.from === 'advisor');
      request.replies.push({ from: 'advisor', text: seal(text), at });
      // The first answer resolves the request unless the advisor chose a status. Later ones keep it as it is.
      request.status = body.status ?? (first ? 'resolved' : request.status);
      return send(res, 200, { request: listed(request), reply: { at } });
    }
    if (!action && req.method === 'GET') {
      // An empty note is never opened, so reading a request without one counts no open.
      const before = noteTally.get(code) ?? { n: 0, at: null }; // earlier note opens: times only, never text
      const opened = !request.note.empty;
      const note = opened ? Sealed.open(request.note, opens, { purpose: 'advisor_read', code }) : '';
      if (opened) { noteTally.set(code, { n: before.n + 1, at: opens.at(-1).at }); keepLatest(opens); }
      const replies = readReplies(request, 'advisor_reply_read');
      return send(res, 200, { request: { ...listed(request), note, replies, opens: opened ? before.n + 1 : 0, last_opened_at: opened ? before.at : null } });
    }
    return send(res, 404, { error: 'Not found' });
  }

  /** The student's read of her own request: the code, the status and the answers. Never her note, name, question or reasons. */
  const findRequest = (code) => /^ADV-[A-Z2-9]{4}$/.test(code) && (handoffs.find((h) => h.code === code) ?? samples.find((h) => h.code === code));
  function studentRead(res, code) {
    const request = findRequest(code);
    if (!request) return send(res, 404, { error: 'Not found' });
    const replies = readReplies(request, 'student_reply_read');
    return send(res, 200, { code: request.code, status: request.status, replies });
  }

  /** The student answers back once an advisor has answered, a few times at most. Sealed like the advisor's replies; a crisis word flags the request again. */
  async function studentReply(req, res, code) {
    const request = findRequest(code);
    if (!request) return send(res, 404, { error: 'Not found' });
    const body = await readJson(req);
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text || text.length > 1000) return send(res, 400, { error: 'A reply must be 1 to 1000 characters.' });
    if (!fromWho(request, 'advisor')) return send(res, 400, { error: 'You can write back once an advisor has answered.' });
    if (fromWho(request, 'student') >= MAX_STUDENT_REPLIES) return send(res, 400, { error: `You can send ${MAX_STUDENT_REPLIES} messages in a conversation at most.` });
    const at = new Date().toISOString();
    request.replies.push({ from: 'student', text: seal(text), at });
    if (isCrisis(text)) request.crisis = true;
    if (request.status === 'resolved') request.status = 'in_progress'; // she wrote back, so it needs someone again
    return send(res, 200, { code: request.code, status: request.status, reply: { at } });
  }

  async function serveStatic(pathname, res) {
    let file;
    if (pathname.startsWith('/src/core/')) {
      const name = pathname.slice('/src/core/'.length);
      if (!BROWSER_MODULES.has(name)) return send(res, 404, { error: 'Not found' });
      file = join(CORE, name);
    } else {
      const rel = normalize(PAGES[pathname] ?? pathname.slice(1));
      if (rel.startsWith('..')) return send(res, 404, { error: 'Not found' });
      file = join(PUBLIC, rel);
    }
    try {
      const body = await readFile(file);
      const inbox = file.endsWith('advisor.html') ? { 'content-security-policy': INBOX_POLICY } : {};
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache', ...inbox });
      res.end(body);
    } catch {
      send(res, 404, { error: 'Not found' });
    }
  }

  async function handle(req, res) {
    const { pathname } = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && pathname === '/api/records') return send(res, 200, RECORDS.map((r) => ({ ...r })));
      if (req.method === 'GET' && pathname === '/api/log') return send(res, 200, gateway.calls);
      if (req.method === 'POST' && pathname === '/api/plan') return send(res, 200, await plan(await readJson(req)));
      if (req.method === 'POST' && pathname === '/api/answer') return send(res, 200, await answer(await readJson(req)));
      if (req.method === 'POST' && pathname === '/api/handoff') return send(res, 200, handoff(await readJson(req)));
      if (req.method === 'GET' && pathname.startsWith('/api/handoff/')) return studentRead(res, pathname.slice('/api/handoff/'.length));
      const back = req.method === 'POST' && pathname.match(/^\/api\/handoff\/([^/]+)\/reply$/);
      if (back) return await studentReply(req, res, back[1]);
      if (pathname.startsWith('/api/advisor/')) return await advisor(req, res, pathname);
      if (req.method === 'GET') return serveStatic(pathname, res);
      return send(res, 404, { error: 'Not found' });
    } catch (err) {
      // A parser error quotes the text it choked on, which could be a note. The reply never repeats it.
      if (err instanceof SyntaxError) return send(res, 400, { error: 'That request could not be read.' });
      if (err instanceof BadAnswers || err instanceof PayloadRejected) return send(res, 400, { error: err.message });
      console.error(err);
      return send(res, 500, { error: 'Something went wrong on our side.' });
    }
  }

  return { handle, plan, answer, handoff, gateway, handoffs, opens, replyOpens };
}

async function readJson(req) {
  let parsed;
  try { parsed = req.body; } catch { throw new SyntaxError('unreadable'); } // Vercel pre-parses JSON, and throws on a bad body
  if (parsed && typeof parsed === 'object') return parsed;
  if (typeof parsed === 'string') return JSON.parse(parsed);
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 20_000) throw new SyntaxError('Request too large.');
  }
  return raw ? JSON.parse(raw) : {};
}

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}
