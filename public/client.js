// What the browser decides before anything leaves Dani's phone. No DOM here, so tests run the
// same code the page runs: which requests get built, and what goes in them.

import { matchQuestion, isCrisis } from '../src/core/topics.js';
import { questionsFor } from '../src/core/planner.js';

/** The questions to ask, in order. Who she is and what she's weighing come before anything about her age. */
export function stepsFor(answers) {
  if (answers.stage && answers.stage !== 'high_school') return ['stage'];
  return ['stage', 'considering', ...(answers.considering?.length ? questionsFor(answers.considering) : [])];
}

/** The model writes {first_name}. Her name goes in here, on the phone, after the reply comes back. */
export function withName(text, name) {
  if (name) return text.replaceAll('{first_name}', name);
  const t = text.replace(/^\{first_name\},\s*/, '').replace(/,\s*\{first_name\}/g, '').replaceAll('{first_name}', 'you');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** A typed question becomes a topic code. The words themselves are never in the request. */
export function askRequest(text, considering) {
  if (isCrisis(text)) return { crisis: true };
  const m = matchQuestion(text, considering?.length ? considering : undefined);
  if (m.kind === 'cannot_confirm') return { code: m.code, body: { cannot_confirm: m.code } };
  return { body: { topic: m.topic, record_ids: m.record_ids } };
}

/**
 * The advisor request: the one place her name, note and question leave the phone, to a person.
 * A crisis in any field stops the send and shows 988 and 911 instead.
 * The inbox key says which inbox the request lands in (public/inbox-key.js). It is not about her and never reaches the model.
 */
export function handoffRequest({ name = '', note = '', question = '', reasons = [], nextStep = null, inboxKey = '' }) {
  if ([name, note, question].some(isCrisis)) return { crisis: true };
  return { body: { first_name: name.trim(), note: note.trim(), question: question.trim(), reasons: [...new Set(reasons)], next_step: nextStep, ...(inboxKey && { inbox_key: inboxKey }) } };
}

// Questions the box can suggest as she types, scoped to what she's weighing. Every one routes to
// a topic the records answer or to an advisor; a test holds that true.
const QUESTION_BANK = [
  [['PRG-02'], 'How much does Northline pay?'],
  [['PRG-02'], 'When do Northline applications close?'],
  [['PRG-02'], 'When does Northline start?'],
  [['PRG-02'], 'How long is the Northline apprenticeship?'],
  [['PRG-02'], 'Do I need my diploma for Northline?'],
  [['PRG-02'], 'Do I need to be 18 for Northline?'],
  [['PRG-01', 'PRG-04'], 'What does Cascade cost?'],
  [['PRG-01', 'PRG-04'], 'When does Cascade start?'],
  [['PRG-01', 'PRG-04'], 'Does Cascade have evening classes?'],
  [['PRG-01', 'PRG-04'], 'How long are the Cascade certificates?'],
  [['PRG-03'], 'How long is Riverbend?'],
  [['PRG-03'], 'When is the Riverbend priority deadline?'],
  [null, 'How do I apply for the Evergreen grant?'],
  [null, 'How much aid will I get?'],
  [null, 'Are there seats left?'],
  [null, 'How fast does an advisor answer?'],
];

export function suggestionsFor(considering = []) {
  return QUESTION_BANK.filter(([ids]) => !ids || ids.some((id) => considering.includes(id))).map(([, q]) => q);
}

/** Suggestions whose words start with every word she has typed so far, best first. */
export function matchSuggestions(list, text, max = 4) {
  const typed = String(text).toLowerCase().match(/[a-z0-9]+/g) ?? [];
  if (!typed.length) return [];
  const hits = list.filter((q) => {
    const words = q.toLowerCase().match(/[a-z0-9]+/g);
    return q.toLowerCase() !== String(text).trim().toLowerCase() && typed.every((t) => words.some((w) => w.startsWith(t)));
  });
  return hits.slice(0, max);
}

const TOPIC_WORDS = {
  AID: 'financial aid', COST: 'cost', PAY: 'pay', DEADLINE: 'deadlines', START: 'start dates', AGE_RULE: 'the age rule',
  DIPLOMA_RULE: 'the diploma rule', LENGTH: 'how long it takes', SCHEDULE: 'schedules', ADVISOR: 'advisors',
};

/** A live read of what she's typing, matched on the phone: answered from the records, or by a person. */
export function previewQuestion(text, considering) {
  if (String(text).trim().length < 6) return null;
  if (isCrisis(text)) return { kind: 'crisis' };
  const m = matchQuestion(text, considering?.length ? considering : undefined);
  if (m.kind === 'topic') return { kind: 'records', about: TOPIC_WORDS[m.topic] };
  return m.code === 'UNMATCHED_QUESTION' ? null : { kind: 'advisor' };
}
