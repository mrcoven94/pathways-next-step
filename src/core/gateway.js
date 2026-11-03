// The only door to the model. Three jobs:
// 1. Refuse any payload that isn't built from a closed set of strings (the minors' data boundary).
// 2. Check every reply against the facts it was given (grounded or silent).
// 3. Log exactly what was sent and what came back, every time.

import { appendFileSync } from 'node:fs';
import { CANONICAL_FACT_TEXT, getRecord } from './records.js';
import { ACTIONS, OUTCOMES } from './planner.js';
import { TOPIC_CODES } from './topics.js';
import { templateReply } from './templates.js';

export const REASON_CODES = [
  'AGE_UNCONFIRMED', 'AGE_RULE_MISSED', 'DIPLOMA_TIMING_UNKNOWN', 'DEADLINE_PASSED',
  'STALE_RECORD', 'APPLY_DEADLINE_UNLISTED',
];

export class PayloadRejected extends Error {}

const oneOf = (allowed) => (v, path) => {
  if (!allowed.includes(v)) throw new PayloadRejected(`${path}: ${JSON.stringify(v)} is not an allowed value`);
};
const recordId = (v, path) => {
  if (!getRecord(v)) throw new PayloadRejected(`${path}: ${JSON.stringify(v)} is not a record ID`);
};
const factText = (v, path) => {
  if (!CANONICAL_FACT_TEXT.has(v)) throw new PayloadRejected(`${path}: text is not a canonical record fact`);
};
const list = (item) => (v, path) => {
  if (!Array.isArray(v)) throw new PayloadRejected(`${path}: expected a list`);
  v.forEach((x, i) => item(x, `${path}[${i}]`));
};
const shape = (keys) => (v, path) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new PayloadRejected(`${path}: expected an object`);
  for (const k of Object.keys(v)) if (!(k in keys)) throw new PayloadRejected(`${path}.${k}: field is not allowed`);
  for (const [k, check] of Object.entries(keys)) check(v[k], `${path}.${k}`);
};

const FACT = shape({ record_id: recordId, text: factText });

const SCHEMAS = {
  explain_plan: shape({
    task: oneOf(['explain_plan']),
    next_step: shape({ action: oneOf(ACTIONS), record_id: recordId }),
    programs: list(shape({ record_id: recordId, outcome: oneOf(OUTCOMES), reasons: list(oneOf(REASON_CODES)) })),
    facts: list(FACT),
  }),
  answer_topic: shape({
    task: oneOf(['answer_topic']),
    topic: oneOf(TOPIC_CODES),
    open: list(oneOf(REASON_CODES)),
    facts: list(FACT),
  }),
};

export function checkPayload(payload) {
  const schema = SCHEMAS[payload?.task];
  if (!schema) throw new PayloadRejected(`task: ${JSON.stringify(payload?.task)} is not an allowed task`);
  schema(payload, 'payload');
  return payload;
}

const INSTRUCTIONS = `You write two or three short, warm sentences for a high school student, using only the facts given.
Rules:
- Decisions are already made in the payload. Do not change them or add new ones.
- Never say the student is eligible, accepted, enrolled, approved or awarded anything.
- Use only numbers and dates that appear in the facts.
- To address the student, write {first_name}. You do not know their name.
- Reply as JSON: {"text": "...", "cites": ["RECORD-ID", ...]}`;

export function renderPrompt(payload) {
  return `${INSTRUCTIONS}\n\nPAYLOAD\n${JSON.stringify(payload, null, 2)}`;
}

const CLAIMS = /\b(eligible|eligibility|accepted|admitted|enrolled|approved|awarded|guarantee[sd]?|you'?re in|you got in|application (is )?(submitted|sent|complete)|you('ve| have) applied|signed you up|registered)\b/i;

/** Returns [] when the reply is usable, or the reasons it isn't. */
export function checkReply(raw, payload) {
  let reply;
  try {
    reply = JSON.parse(raw);
  } catch {
    return [{ code: 'NOT_JSON' }];
  }
  const problems = [];
  const text = typeof reply?.text === 'string' ? reply.text : '';
  const cites = Array.isArray(reply?.cites) ? reply.cites : [];
  if (!text) problems.push({ code: 'EMPTY' });
  if (text.length > 600) problems.push({ code: 'TOO_LONG' });

  const given = new Set(payload.facts.map((f) => f.record_id));
  if (!cites.length) problems.push({ code: 'NO_CITATION' });
  for (const id of cites) if (!given.has(id)) problems.push({ code: 'CITES_UNGIVEN_RECORD', detail: id });

  const citedText = payload.facts.filter((f) => cites.includes(f.record_id)).map((f) => f.text).join(' | ');
  for (const n of text.match(/\d[\d,.]*\d|\d/g) ?? []) {
    if (!citedText.includes(n)) problems.push({ code: 'UNGROUNDED_NUMBER', detail: n });
  }
  for (const p of text.match(/\{[^}]*\}/g) ?? []) {
    if (p !== '{first_name}') problems.push({ code: 'UNKNOWN_PLACEHOLDER', detail: p });
  }
  const claim = text.match(CLAIMS);
  if (claim) problems.push({ code: 'STATUS_CLAIM', detail: claim[0] });
  return problems;
}

function formatEntry(e) {
  return [
    `=== model call ${e.n} · ${e.at} · task=${e.task} · model=${e.model}`,
    '--- sent ---',
    e.sent,
    '--- received ---',
    e.received,
    `--- verdict: ${e.verdict}${e.problems.length ? ' · ' + e.problems.map((p) => p.code + (p.detail ? `(${p.detail})` : '')).join(', ') : ''}`,
    e.verdict === 'replaced' ? `--- shown instead (template) ---\n${e.shown}` : '',
    '',
  ].filter(Boolean).join('\n') + '\n';
}

/**
 * @param {{model: {name:string, complete:(prompt:string)=>Promise<string>}, logFile?: string|null, now?: () => Date}} deps
 */
export function createGateway({ model, logFile = null, now = () => new Date() }) {
  const calls = [];

  async function callModel(payload) {
    checkPayload(payload); // throws before anything leaves
    const sent = renderPrompt(payload);
    let received;
    try {
      received = await model.complete(sent);
    } catch (err) {
      received = `[model error] ${err.message}`;
    }
    const problems = received.startsWith('[model error]') ? [{ code: 'MODEL_ERROR' }] : checkReply(received, payload);
    const verdict = problems.length ? 'replaced' : 'used';
    const reply = verdict === 'used' ? JSON.parse(received) : templateReply(payload);
    const entry = {
      n: calls.length + 1,
      at: now().toISOString(),
      task: payload.task,
      model: model.name,
      sent,
      received,
      verdict,
      problems,
      shown: reply.text,
    };
    calls.push(entry);
    if (logFile) appendFileSync(logFile, formatEntry(entry));
    return { text: reply.text, cites: reply.cites, verdict, call: entry.n };
  }

  return { callModel, calls };
}
