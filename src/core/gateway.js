// The only door to the model. Three jobs:
// 1. Refuse any payload that isn't built from a closed set of strings (the minors' data boundary).
// 2. Check every reply against the facts it was given (grounded or silent).
// 3. Log exactly what was sent and what came back, every time.

import { appendFileSync } from 'node:fs';
import { CANONICAL_FACT_TEXT, RECORDS, getRecord } from './records.js';

const KEYS = [...new Set(RECORDS.flatMap((r) => r.facts.map((f) => f.key)))];
import { ACTIONS, OUTCOMES } from './planner.js';
import { TOPIC_CODES } from './topics.js';
import { templateReply, sayFact } from './templates.js';

export const REASON_CODES = [
  'AGE_UNCONFIRMED', 'AGE_RULE_MISSED', 'DIPLOMA_TIMING_UNKNOWN', 'DEADLINE_PASSED',
  'START_DATE_PASSED', 'STALE_RECORD', 'APPLY_DEADLINE_UNLISTED',
];

// A rejection names where the problem is, never what was there: the refused value could be a student's words.
export class PayloadRejected extends Error {}

const oneOf = (allowed) => (v, path) => {
  if (!allowed.includes(v)) throw new PayloadRejected(`${path}: not an allowed value`);
};
const recordId = (v, path) => {
  if (!getRecord(v)) throw new PayloadRejected(`${path}: not a record ID`);
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
  for (const k of Object.keys(v)) if (!Object.hasOwn(keys, k)) throw new PayloadRejected(`${path}: has a field that is not allowed`);
  for (const [k, check] of Object.entries(keys)) check(v[k], `${path}.${k}`);
};

// A fact is its record, its key and its exact wording, all three matching records.js.
const FACT = (v, path) => {
  shape({ record_id: recordId, key: oneOf(KEYS), text: factText })(v, path);
  if (getRecord(v.record_id).facts.find((f) => f.key === v.key)?.text !== v.text) {
    throw new PayloadRejected(`${path}: ${v.record_id}.${v.key} does not say that`);
  }
};

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

/** The payload as plain data, exactly as it would be written into a prompt. */
function plainCopy(payload) {
  try {
    return JSON.parse(JSON.stringify(payload));
  } catch {
    throw new PayloadRejected('payload: not plain data');
  }
}

export function checkPayload(payload) {
  const schema = Object.hasOwn(SCHEMAS, payload?.task ?? '') ? SCHEMAS[payload.task] : null;
  if (!schema) throw new PayloadRejected('task: not an allowed task');
  schema(payload, 'payload');
  return payload;
}

const INSTRUCTIONS = `You write two or three short, warm sentences for a high school student.
Rules:
- You never write a fact yourself. To use a fact, write its slot, {fact:RECORD-ID:key}, and code fills in the exact wording from the records.
- Your own words may greet, connect and encourage. They may not contain numbers, dates, money, or anything about a program that is not in a slot.
- Decisions are already made in the payload. Do not change them or add new ones.
- Never say the student is eligible, accepted, enrolled, approved or awarded anything.
- To address the student, write {first_name}. You do not know their name.
- Reply as JSON: {"text": "..."}`;

export function renderPrompt(payload) {
  return `${INSTRUCTIONS}\n\nPAYLOAD\n${JSON.stringify(payload, null, 2)}`;
}

const CLAIMS = /\b(eligible|eligibility|qualif(y|ies|ied)|accept(s|ed)?|admit(s|ted)?|enrolled|approved|awarded|guarantee[sd]?|you('re| are) (in|set|a fit|a match)|you got in|you meet|(you('ll| will)|you can) (get in|join|start)|application (is )?(submitted|sent|complete)|you('ve| have) applied|signed you up|registered)\b/i;
const SLOT = /\{fact:([A-Z]+-[A-Z0-9]+):([a-z_]+)\}/g;
const MONTH = /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)\b/i;
const WRITTEN_NUMBER = /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand|million|half|dozen|once|twice)\b/i;

// The model's own words: how to say something, never what is true. Program names it was given are
// allowed so it can say which program it means. Fact words ("paid", "evening", "tuition") are not:
// those only arrive through slots. Negations are left out on purpose: a reply can't flip a fact.
const CONNECTIVES = new Set(`a about advisor advisors after also an and answer answered answers any apply are as ask at be because before below but by can can't check comes confirm could day deadline do does first for from get go good has have here here's how i if in is it it's its just know let's look make more move need next now of on or our out plan program programs question questions records right road so something start step still take than that that's the their them then there these they this those through to too up us want way we we'll what when where which while who will with would yes you you'll you're your`.split(' '));

function vocabulary(payload) {
  const words = new Set(CONNECTIVES);
  for (const id of new Set(payload.facts.map((f) => f.record_id))) {
    const r = getRecord(id);
    for (const w of `${r.name} ${r.short}`.toLowerCase().match(/[a-z][a-z'-]*/g) ?? []) words.add(w);
  }
  return words;
}

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
  if (!text) problems.push({ code: 'EMPTY' });
  if (text.length > 600) problems.push({ code: 'TOO_LONG' });

  // Every slot must name a fact the model was actually handed.
  const given = new Set(payload.facts.map((f) => `${f.record_id}:${f.key}`));
  const slots = [...text.matchAll(SLOT)];
  if (!slots.length) problems.push({ code: 'NO_CITATION' });
  for (const m of slots) if (!given.has(`${m[1]}:${m[2]}`)) problems.push({ code: 'CITES_UNGIVEN_FACT', detail: `${m[1]}:${m[2]}` });

  // Everything outside the slots is the model's own prose, and prose may not state facts.
  const prose = text.replace(SLOT, ' ').replace(/\{first_name\}/g, ' ');
  for (const p of prose.match(/\{[^}]*\}/g) ?? []) problems.push({ code: 'UNKNOWN_PLACEHOLDER', detail: p });
  const digits = prose.match(/\d[\d,.%]*/);
  if (digits) problems.push({ code: 'UNGROUNDED_NUMBER', detail: digits[0] });
  const written = prose.match(WRITTEN_NUMBER);
  if (written) problems.push({ code: 'UNGROUNDED_NUMBER', detail: written[0] });
  const month = prose.match(MONTH);
  if (month) problems.push({ code: 'UNGROUNDED_DATE', detail: month[0] });
  const words = vocabulary(payload);
  for (const raw of prose.toLowerCase().replace(/[‘’]/g, "'").match(/[a-z][a-z'-]*/g) ?? []) {
    const w = raw.replace(/'s$/, '');
    if (!words.has(w)) problems.push({ code: 'UNGROUNDED_WORD', detail: w });
  }
  const claim = prose.match(CLAIMS);
  if (claim) problems.push({ code: 'STATUS_CLAIM', detail: claim[0] });
  return problems;
}

/** Slots become the records' own wording, written by code. */
function renderReply(text, payload) {
  const cites = new Set();
  const out = text.replace(SLOT, (_, id, key, at) => {
    cites.add(id);
    const said = sayFact(payload.facts.find((f) => f.record_id === id && f.key === key));
    // After "{first_name}, " a sentence that opens with a plain word continues in lower case.
    return text.slice(0, at).endsWith(', ') ? said.replace(/^(The|You|An|They|Pay) /, (w) => w.toLowerCase()) : said;
  });
  return { text: out.replace(/\s{2,}/g, ' ').trim(), cites: [...cites] };
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
  let count = 0;

  async function callModel(given) {
    // Check the copy that will be sent, not the object that was handed in. A getter or a toJSON hook
    // on the original could say one thing to the check and another to the prompt.
    const payload = checkPayload(plainCopy(given)); // throws before anything leaves
    const sent = renderPrompt(payload);
    let received;
    try {
      received = await model.complete(sent);
    } catch (err) {
      received = `[model error] ${err.message}`;
    }
    const problems = received.startsWith('[model error]') ? [{ code: 'MODEL_ERROR' }] : checkReply(received, payload);
    const verdict = problems.length ? 'replaced' : 'used';
    const reply = verdict === 'used' ? renderReply(JSON.parse(received).text, payload) : templateReply(payload);
    const entry = {
      n: ++count,
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
    if (calls.length > 200) calls.shift(); // the file keeps everything; memory keeps the recent calls for /how
    if (logFile) appendFileSync(logFile, formatEntry(entry));
    return { text: reply.text, cites: reply.cites, verdict, call: entry.n };
  }

  return { callModel, calls };
}
