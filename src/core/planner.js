// Every decision about Dani's plan is made here, in code. The model never decides.
// Inputs are taps (yes / no / unsure), never free text. Output is codes and cited facts.

import { fact, getRecord } from './records.js';

export const OUTCOMES = ['fits_listed_rules', 'misses_a_listed_rule', 'unknown'];
export const ACTIONS = ['apply_by_deadline', 'ask_advisor_then_apply', 'start_aid_application'];
export const ANSWERS = ['yes', 'no', 'unsure'];
export const LEANS = ['earn', 'classes', 'unsure'];

export const STALE_AFTER_DAYS = 45;
const DAY_MS = 24 * 60 * 60 * 1000;

export class BadAnswers extends Error {}

function daysBetween(fromIso, toIso) {
  return Math.floor((Date.parse(toIso) - Date.parse(fromIso)) / DAY_MS);
}

// One program's outcome. `misses_a_listed_rule` beats `unknown` beats `fits_listed_rules`,
// and none of them is ever "eligible": only an advisor can confirm that for one person.
function northline({ age18, diploma }, today) {
  const missed = [];
  const open = [];
  if (today > fact('PRG-02', 'applications_close').date) missed.push('DEADLINE_PASSED');
  if (age18 === 'no') missed.push('AGE_RULE_MISSED');
  if (age18 === 'unsure') open.push('AGE_UNCONFIRMED');
  if (diploma !== 'yes') open.push('DIPLOMA_TIMING_UNKNOWN');
  const outcome = missed.length ? 'misses_a_listed_rule' : open.length ? 'unknown' : 'fits_listed_rules';
  return {
    record_id: 'PRG-02',
    outcome,
    reasons: [...missed, ...open],
    facts: [
      fact('PRG-02', 'applications_close'),
      fact('PRG-02', 'program_start'),
      fact('PRG-02', 'age_rule'),
      fact('PRG-02', 'diploma_rule'),
      fact('PRG-02', 'paid'),
      fact('PRG-02', 'wage'),
      fact('PRG-02', 'length'),
    ],
  };
}

// Cascade lists no entry rules, so there is nothing to miss. It does not list an
// application deadline either, which is an unknown an advisor has to fill.
function cascade(id) {
  return {
    record_id: id,
    outcome: 'fits_listed_rules',
    reasons: ['APPLY_DEADLINE_UNLISTED'],
    facts: [fact(id, 'next_start'), fact(id, 'length'), fact(id, 'tuition'), fact(id, 'schedule')],
  };
}

export function validateAnswers(answers) {
  const { age18, diploma, lean } = answers ?? {};
  if (!ANSWERS.includes(age18) || !ANSWERS.includes(diploma) || !LEANS.includes(lean)) {
    throw new BadAnswers('Answers must be yes, no or unsure, and lean must be earn, classes or unsure.');
  }
  return { age18, diploma, lean };
}

/**
 * Build Dani's plan.
 * @param {{age18:string, diploma:string, lean:string}} answers  taps only
 * @param {string} today  ISO date, injectable so deadlines and staleness are testable
 */
export function planNextStep(answers, today) {
  const a = validateAnswers(answers);
  const apprenticeship = northline(a, today);
  const college = [cascade('PRG-01'), cascade('PRG-04')];
  const aid = [fact('AID-A', 'basis'), fact('AID-A', 'how_to_apply'), fact('AID-A', 'amount')];

  // The eligibility-and-ordering decision. Northline goes first unless a listed rule
  // rules it out or Dani said she wants classes first, because its deadline comes first.
  const northlineOpen = apprenticeship.outcome !== 'misses_a_listed_rule';
  const northlineFirst = northlineOpen && a.lean !== 'classes';

  let next_step;
  if (northlineFirst && apprenticeship.outcome === 'fits_listed_rules') {
    next_step = { action: 'apply_by_deadline', record_id: 'PRG-02', facts: [fact('PRG-02', 'applications_close')] };
  } else if (northlineFirst) {
    next_step = { action: 'ask_advisor_then_apply', record_id: 'PRG-02', facts: [fact('PRG-02', 'applications_close')] };
  } else {
    next_step = { action: 'start_aid_application', record_id: 'AID-A', facts: [fact('AID-A', 'how_to_apply'), fact('PRG-01', 'next_start')] };
  }

  const programs = northlineFirst ? [apprenticeship, ...college] : [...college, apprenticeship];

  const used = new Set([...programs.map((p) => p.record_id), 'AID-A', 'ADV-01']);
  const stale = [...used]
    .map(getRecord)
    .filter((r) => r.checked && daysBetween(r.checked, today) > STALE_AFTER_DAYS)
    .map((r) => ({ code: 'STALE_RECORD', record_id: r.id }));

  const escalations = [
    ...apprenticeship.reasons.map((code) => ({ code, record_id: 'PRG-02' })),
    ...(northlineFirst ? [] : [{ code: 'APPLY_DEADLINE_UNLISTED', record_id: 'PRG-01' }]),
    ...stale,
  ];

  return {
    today,
    answers: a,
    next_step,
    programs,
    aid,
    escalations,
    advisor: { record_id: 'ADV-01', facts: [fact('ADV-01', 'confirms'), fact('ADV-01', 'response')] },
    label: 'This is your plan, not an application.',
  };
}
