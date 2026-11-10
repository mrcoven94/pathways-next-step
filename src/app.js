// HTTP API and static files. Used by server.js locally and api/index.js on Vercel.
// The name and advisor note arrive only at /api/handoff, which never touches the gateway.
// The note is sealed there. Only the advisor read path, behind the access code, opens it.

import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
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
const PAGES = { '/': 'index.html', '/how': 'how.html', '/advisor': 'advisor.html' };
// The inbox shows student-typed text to a signed-in advisor, so it may load nothing from anywhere else.
// 'wasm-unsafe-eval' lets the page compile Rampart Edge's WASM engine from this site; it allows no eval of JS.
const INBOX_POLICY = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const digest = (s) => createHash('sha256').update(String(s)).digest();
const sameCode = (header, code) => timingSafeEqual(digest(header ?? ''), digest(`Bearer ${code}`));
/** A request as the inbox list shows it: everything but the note, which stays sealed. */
const listed = ({ note, ...rest }) => ({ ...rest, has_note: !note.empty });

/**
 * @param {{model?: object, logFile?: string|null, today?: () => string}} opts
 */
/** Today's date where the pilot runs, so a deadline stays open until midnight there, not in UTC. */
export function todayIn(timeZone = 'America/Los_Angeles', now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function createApp({ model = mockModel, logFile = null, today = () => todayIn(), advisorCode = '', handoffCode = newHandoffCode } = {}) {
  const gateway = createGateway({ model, logFile });
  const handoffs = []; // stand-in for the advisor queue; served only to an advisor with the access code
  const opens = []; // every time a sealed note was opened: why, which request, when. Never the text.

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
    while (handoffs.some((h) => h.code === code)) code = handoffCode(); // a code names one request
    const request = {
      code,
      first_name: clean(first_name, 40),
      note: seal(raw),
      question: clean(question, 300),
      reasons: (Array.isArray(reasons) ? reasons : []).map((r) => clean(r, 40)).slice(0, 12),
      next_step: next_step ? clean(next_step, 40) : null,
      at: new Date().toISOString(),
      status: 'new',
    };
    request.crisis = [request.first_name, raw, request.question].some(isCrisis);
    handoffs.push(request);
    return {
      code: request.code,
      crisis: request.crisis,
      response: fact('ADV-01', 'response'),
      label: 'This is a request for an advisor, not an application.',
    };
  }

  /** The advisor read path. It does not exist unless a code is configured, and it answers only to that code. */
  async function advisor(req, res, pathname) {
    if (!advisorCode) return send(res, 404, { error: 'Not found' });
    if (!sameCode(req.headers.authorization, advisorCode)) return send(res, 401, { error: 'That access code is not right.' });
    const m = pathname.match(/^\/api\/advisor\/requests(?:\/(ADV-[A-Z2-9]{4})(\/status)?)?$/);
    if (!m) return send(res, 404, { error: 'Not found' });
    const [, code, status] = m;
    if (!code) return req.method === 'GET' ? send(res, 200, { requests: handoffs.map(listed) }) : send(res, 404, { error: 'Not found' });
    const request = handoffs.find((h) => h.code === code);
    if (!request) return send(res, 404, { error: 'Not found' });
    if (status && req.method === 'POST') {
      const next = (await readJson(req)).status;
      if (!STATUSES.includes(next)) return send(res, 400, { error: 'Status must be new, in_progress or resolved.' });
      request.status = next;
      return send(res, 200, { request: listed(request) });
    }
    if (!status && req.method === 'GET') {
      return send(res, 200, { request: { ...listed(request), note: Sealed.open(request.note, opens, { purpose: 'advisor_read', code }) } });
    }
    return send(res, 404, { error: 'Not found' });
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

  return { handle, plan, answer, handoff, gateway, handoffs, opens };
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
