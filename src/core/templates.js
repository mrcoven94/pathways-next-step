// Plain replies built by code. Shown when a model reply fails the checks, and used for
// every "can't confirm" answer, which never goes to the model at all.

import { getRecord } from './records.js';

export function byRecord(facts) {
  const groups = new Map();
  for (const f of facts) groups.set(f.record_id, [...(groups.get(f.record_id) ?? []), f.text]);
  return [...groups].map(([id, texts]) => `${getRecord(id).short}: ${texts.join('. ')}.`);
}

const factFor = (payload, id) => payload.facts.filter((f) => f.record_id === id).map((f) => f.text);

export function templateReply(payload) {
  if (payload.task === 'explain_plan') {
    const { action, record_id } = payload.next_step;
    const close = factFor(payload, 'PRG-02').find((t) => t.startsWith('Applications close'));
    if (action === 'apply_by_deadline') {
      return { text: `{first_name}, your next step is to apply to the Northline Electrical Apprenticeship. ${close}.`, cites: ['PRG-02'] };
    }
    if (action === 'ask_advisor_then_apply') {
      return { text: `{first_name}, your next step is to ask an advisor about what the records can't confirm, then apply to Northline. ${close}.`, cites: ['PRG-02'] };
    }
    const apply = factFor(payload, record_id)[0] ?? '';
    return { text: `{first_name}, your next step is to start your aid application. ${apply}.`, cites: [record_id] };
  }

  const lines = byRecord(payload.facts);
  return { text: `Here's what the records say. ${lines.join(' ')}`, cites: [...new Set(payload.facts.map((f) => f.record_id))] };
}

export const CANNOT_CONFIRM = {
  UNKNOWN_SEATS: "I can't confirm how many seats are left. The records don't track that. An advisor can check.",
  UNKNOWN_PERSONAL_ELIGIBILITY: "I can't confirm whether you'll qualify or get in. Only an advisor can check that for you, person to person.",
  UNKNOWN_AID_AMOUNT: "I can't confirm how much aid you'd get. The grant amount varies, and an advisor confirms award amounts.",
  UNKNOWN_START_DATE: "I can't confirm that start date. It isn't in the records I have. An advisor can check.",
  UNMATCHED_QUESTION: "I can't confirm that from the records I have. An advisor can answer it.",
  NOT_IN_RECORDS: "The records don't say. An advisor can check that for you.",
};
