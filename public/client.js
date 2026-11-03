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
 */
export function handoffRequest({ name = '', note = '', question = '', reasons = [], nextStep = null }) {
  if ([name, note, question].some(isCrisis)) return { crisis: true };
  return { body: { first_name: name.trim(), note: note.trim(), question: question.trim(), reasons: [...new Set(reasons)], next_step: nextStep } };
}
