// Every decision about Dani's plan is made here, in code. The model never decides.
// Inputs are taps (program IDs and yes / no / unsure), never free text. Output is codes and cited facts.

import { fact, getRecord } from './records.js';

export const OUTCOMES = ['fits_listed_rules', 'misses_a_listed_rule', 'unknown'];
export const ACTIONS = ['apply_by_deadline', 'ask_advisor_then_apply', 'start_aid_application'];
export const ANSWERS = ['yes', 'no', 'unsure'];
export const LEANS = ['earn', 'classes', 'unsure'];

// Programs a high school senior can pick from. CDL training (PRG-05) is in the records but
// built for adults returning to work, which is the other persona.
export const STUDENT_PROGRAMS = ['PRG-02', 'PRG-01', 'PRG-04', 'PRG-03'];
const CLASSROOM = ['PRG-01', 'PRG-04', 'PRG-03'];

export const STALE_AFTER_DAYS = 45;
const DAY_MS = 24 * 60 * 60 * 1000;

export class BadAnswers extends Error {}

// Federal holidays through the pilot window. Not in the records, but "business days" (ADV-01) can't
// include them: asked the day before Thanksgiving, an answer can't be promised for Thanksgiving.
export const HOLIDAYS = new Set(['2026-11-11', '2026-11-26', '2026-12-25', '2027-01-01', '2027-01-18', '2027-02-15']);

/** The date `n` business days after `iso`: weekdays that aren't federal holidays. */
export function addBusinessDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  while (n > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.toISOString().slice(0, 10);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !HOLIDAYS.has(day)) n -= 1;
  }
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromIso, toIso) {
  return Math.floor((Date.parse(toIso) - Date.parse(fromIso)) / DAY_MS);
}

/** Which questions to ask, given what she's weighing. The UI asks only these. */
export function questionsFor(considering) {
  const q = [];
  if (considering.includes('PRG-02')) q.push('age18', 'diploma');
  if (considering.includes('PRG-02') && considering.some((id) => CLASSROOM.includes(id))) q.push('lean');
  return q;
}

export function validateAnswers(answers) {
  const { considering, age18, diploma, lean } = answers ?? {};
  const picked = Array.isArray(considering) ? [...new Set(considering)] : [];
  if (!picked.length || !picked.every((id) => STUDENT_PROGRAMS.includes(id))) {
    throw new BadAnswers(`considering must list one or more of ${STUDENT_PROGRAMS.join(', ')}.`);
  }
  const needed = questionsFor(picked);
  const out = { considering: picked };
  for (const [key, allowed, value] of [['age18', ANSWERS, age18], ['diploma', ANSWERS, diploma], ['lean', LEANS, lean]]) {
    if (!needed.includes(key)) continue;
    if (!allowed.includes(value)) throw new BadAnswers(`${key} must be one of ${allowed.join(', ')}.`);
    out[key] = value;
  }
  return out;
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
    facts: ['applications_close', 'program_start', 'age_rule', 'diploma_rule', 'paid', 'wage', 'length'].map((k) => fact('PRG-02', k)),
  };
}

// Cascade and Riverbend list no age or diploma rule, so there is nothing to miss.
// Neither lists how or by when to apply, which is an unknown an advisor fills.
function classroom(id, today) {
  const keys = id === 'PRG-03' ? ['priority_deadline', 'aid_application', 'length'] : ['next_start', 'length', 'tuition', 'schedule'];
  const dated = fact(id, id === 'PRG-03' ? 'priority_deadline' : 'next_start');
  const passed = today > dated.date ? [id === 'PRG-03' ? 'DEADLINE_PASSED' : 'START_DATE_PASSED'] : [];
  return {
    record_id: id,
    outcome: passed.length ? 'unknown' : 'fits_listed_rules',
    reasons: [...passed, 'APPLY_DEADLINE_UNLISTED'],
    facts: keys.map((k) => fact(id, k)),
  };
}

/**
 * Build Dani's plan.
 * @param {{considering:string[], age18?:string, diploma?:string, lean?:string}} answers  taps only
 * @param {string} today  ISO date, injectable so deadlines and staleness are testable
 */
export function planNextStep(answers, today) {
  const a = validateAnswers(answers);
  let programs = a.considering.map((id) => (id === 'PRG-02' ? northline(a, today) : classroom(id, today)));

  // If everything she picked is ruled out, show the paths with no age or diploma rule, marked as suggestions.
  const suggested = programs.every((p) => p.outcome === 'misses_a_listed_rule');
  if (suggested) programs = [...programs, ...['PRG-01', 'PRG-04'].filter((id) => !a.considering.includes(id)).map((id) => ({ ...classroom(id, today), suggested: true }))];

  // The ordering decision. Northline goes first when it's still open and she didn't say
  // classes first, because its deadline (Nov 30, 2026) comes before anything else listed.
  const apprenticeship = programs.find((p) => p.record_id === 'PRG-02');
  const northlineFirst = apprenticeship && apprenticeship.outcome !== 'misses_a_listed_rule' && a.lean !== 'classes';
  const classes = programs.filter((p) => CLASSROOM.includes(p.record_id));

  let next_step;
  if (northlineFirst) {
    next_step = {
      action: apprenticeship.outcome === 'fits_listed_rules' ? 'apply_by_deadline' : 'ask_advisor_then_apply',
      record_id: 'PRG-02',
      facts: [fact('PRG-02', 'applications_close')],
    };
  } else {
    // A listed deadline beats a start date, so Riverbend's priority deadline leads when she picked it.
    const dated = classes.some((p) => p.record_id === 'PRG-03') ? fact('PRG-03', 'priority_deadline') : fact(classes[0].record_id, 'next_start');
    // A date that has already passed is never offered as the thing to put on her calendar.
    next_step = { action: 'start_aid_application', record_id: dated.record_id, facts: [fact('AID-A', 'how_to_apply'), ...(dated.date >= today ? [dated] : [])] };
  }

  // This week's move. If she needs an advisor first, code works out when the answer arrives
  // (ADV-01: within 2 business days) and whether that's still before the deadline.
  const deadline = next_step.facts.find((f) => f.date)?.date;
  if (next_step.action === 'ask_advisor_then_apply') {
    const answer_by = addBusinessDays(today, 2);
    next_step.advisor = { answer_by, before_deadline: answer_by < deadline, fact: fact('ADV-01', 'response') };
  }
  // Why this step comes first, in her own terms: what she told us, then what the records say.
  next_step.why = [
    ...(northlineFirst && a.lean === 'earn' ? ['SHE_PREFERS_LEARNING_BY_DOING'] : []),
    ...(northlineFirst ? ['EARLIEST_DEADLINE'] : []),
  ];

  const lead = programs.find((p) => p.record_id === next_step.record_id);
  const rank = { fits_listed_rules: 0, unknown: 1, misses_a_listed_rule: 2 };
  programs = [lead, ...programs.filter((p) => p !== lead).sort((x, y) => rank[x.outcome] - rank[y.outcome])];
  const aid = classes.length ? [fact('AID-A', 'basis'), fact('AID-A', 'how_to_apply'), fact('AID-A', 'amount')] : [];

  const used = new Set([...programs.map((p) => p.record_id), ...(aid.length ? ['AID-A'] : [])]);
  const stale = [...used]
    .map(getRecord)
    .filter((r) => daysBetween(r.checked, today) > STALE_AFTER_DAYS)
    .map((r) => ({ code: 'STALE_RECORD', record_id: r.id }));

  const escalations = [
    ...programs.flatMap((p) => p.reasons.map((code) => ({ code, record_id: p.record_id }))),
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
