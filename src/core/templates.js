// Plain replies built by code. Shown when a model reply fails the checks, and used for
// every "can't confirm" answer, which never goes to the model at all.

import { getRecord } from './records.js';

// One plain sentence per canonical fact, so answers read like a person and not a database row.
const SAY = [
  [/^Paid$/, (s) => `${s} is paid.`],
  [/^Starts at (.+)$/, (s, m) => `Pay starts at ${m[1]}.`],
  [/^Applications close (.+)$/, (s, m) => `${s} applications close ${m[1]}.`],
  [/^Program starts (.+)$/, (s, m) => `${s} starts ${m[1]}.`],
  [/^Next start (.+)$/, (s, m) => `${s} starts next on ${m[1]}.`],
  [/^Estimated total tuition (.+)$/, (s, m) => `${s} is about ${m[1]} in total tuition.`],
  [/^(\d+ (quarters|years|weeks))$/, (s, m) => `${s} takes ${m[1]}.`],
  [/^Applicants must be (.+)$/, (s, m) => `${s} applicants must be ${m[1]}.`],
  [/^HS diploma or GED required$/, (s) => `${s} requires an HS diploma or GED.`],
  [/^Day classes only$/, (s) => `${s} has day classes only.`],
  [/^Evening online option$/, (s) => `${s} has an evening online option.`],
  [/^Evening cohort available$/, (s) => `${s} has an evening cohort.`],
  [/^Priority deadline (.+)$/, (s, m) => `${s} has a priority deadline of ${m[1]}.`],
  [/^FAFSA or state aid application required$/, (s) => `${s} requires the FAFSA or state aid application.`],
  [/^Income-based$/, (s) => `The ${s} is income-based.`],
  [/^Apply through FAFSA or the state aid application$/, () => 'You apply through FAFSA or the state aid application.'],
  [/^Award amount varies$/, () => 'The award amount varies.'],
  [/^Advisors confirm/, () => 'An advisor can check seats and award amounts with you.'],
  [/^Response within (.+)$/, (s, m) => `They answer within ${m[1]}.`],
];

export function sayFact(f) {
  const short = getRecord(f.record_id).short;
  for (const [re, say] of SAY) {
    const m = f.text.match(re);
    if (m) return say(short, m);
  }
  return `${short}: ${f.text}.`;
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
      return { text: `{first_name}, your next step is to ask an advisor what the records can't confirm, then apply to Northline. ${close}.`, cites: ['PRG-02'] };
    }
    // The planner already left out any date that has passed, and the headline shows the one that hasn't.
    const apply = factFor(payload, 'AID-A').find((t) => t.startsWith('Apply through'));
    return { text: `{first_name}, your next step is to start your aid application. ${apply}.`, cites: ['AID-A', record_id] };
  }

  const caveat = payload.open.includes('DIPLOMA_TIMING_UNKNOWN') ? " The records don't say when you need it by, so ask an advisor." : '';
  return { text: payload.facts.map(sayFact).join(' ') + caveat, cites: [...new Set(payload.facts.map((f) => f.record_id))] };
}

export const CANNOT_CONFIRM = {
  UNKNOWN_SEATS: "I can't confirm how many seats are left. The records don't track that, but an advisor can check.",
  UNKNOWN_PERSONAL_ELIGIBILITY: "I can't confirm whether you'll get in. That's a person-to-person question, and an advisor can check it with you.",
  UNKNOWN_AID_AMOUNT: "I can't confirm how much aid you'd get. The award amount varies, and an advisor can check it with you.",
  UNKNOWN_START_DATE: "I can't confirm that date. It isn't in the records I have, but an advisor can check.",
  UNMATCHED_QUESTION: "I can't confirm that from the records I have. An advisor can answer it.",
  NOT_IN_RECORDS: "The records don't say. An advisor can check that for you.",
};
