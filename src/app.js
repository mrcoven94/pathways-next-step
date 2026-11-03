// HTTP API and static files. Used by server.js locally and api/index.js on Vercel.
// The name and advisor note arrive only at /api/handoff, which never touches the gateway.

import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RECORDS, getRecord, fact } from './core/records.js';
import { planNextStep, BadAnswers } from './core/planner.js';
import { TOPIC_CODES, TOPIC_KEYS, isCrisis } from './core/topics.js';
import { createGateway, PayloadRejected } from './core/gateway.js';
import { CANNOT_CONFIRM } from './core/templates.js';
import { mockModel } from './core/mock-model.js';

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const CORE = fileURLToPath(new URL('./core/', import.meta.url));
const BROWSER_MODULES = new Set(['topics.js', 'planner.js', 'records.js']); // pure modules the browser shares; never the gateway
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

const toPayloadFact = ({ record_id, key, text }) => ({ record_id, key, text });
const withChecked = (f) => ({ ...f, checked: getRecord(f.record_id).checked });
const advisorFacts = () => [fact('ADV-01', 'confirms'), fact('ADV-01', 'response')];

function dedupe(facts) {
  const seen = new Set();
  return facts.filter((f) => !seen.has(f.record_id + f.key) && seen.add(f.record_id + f.key));
}

function newHandoffCode() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return 'ADV-' + Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

/**
 * @param {{model?: object, logFile?: string|null, today?: () => string}} opts
 */
/** Today's date where the pilot runs, so a deadline stays open until midnight there, not in UTC. */
export function todayIn(timeZone = 'America/Los_Angeles', now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function createApp({ model = mockModel, logFile = null, today = () => todayIn() } = {}) {
  const gateway = createGateway({ model, logFile });
  const handoffs = []; // stand-in for the advisor queue; never exposed over HTTP

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
    const request = {
      code: newHandoffCode(),
      first_name: clean(first_name, 40),
      note: clean(note, 1000),
      question: clean(question, 300),
      reasons: (Array.isArray(reasons) ? reasons : []).map((r) => clean(r, 40)).slice(0, 12),
      next_step: next_step ? clean(next_step, 40) : null,
      at: new Date().toISOString(),
    };
    handoffs.push(request);
    return {
      code: request.code,
      crisis: [request.first_name, request.note, request.question].some(isCrisis),
      response: fact('ADV-01', 'response'),
      label: 'This is a request for an advisor, not an application.',
    };
  }

  async function serveStatic(pathname, res) {
    let file;
    if (pathname.startsWith('/src/core/')) {
      const name = pathname.slice('/src/core/'.length);
      if (!BROWSER_MODULES.has(name)) return send(res, 404, { error: 'Not found' });
      file = join(CORE, name);
    } else {
      const rel = normalize(pathname === '/' || pathname === '/how' ? (pathname === '/' ? 'index.html' : 'how.html') : pathname.slice(1));
      if (rel.startsWith('..')) return send(res, 404, { error: 'Not found' });
      file = join(PUBLIC, rel);
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
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
      if (req.method === 'GET') return serveStatic(pathname, res);
      return send(res, 404, { error: 'Not found' });
    } catch (err) {
      if (err instanceof BadAnswers || err instanceof PayloadRejected || err instanceof SyntaxError) {
        return send(res, 400, { error: err.message });
      }
      console.error(err);
      return send(res, 500, { error: 'Something went wrong on our side.' });
    }
  }

  return { handle, plan, answer, handoff, gateway, handoffs };
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body; // Vercel pre-parses JSON
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
