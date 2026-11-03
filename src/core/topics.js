// Turns a typed question into a topic code, on Dani's phone. The text itself goes no further:
// this module returns codes and record IDs only, and runs in the browser before any request.
// Order matters: crisis first, then the four unknowns the records can't answer, then topics.

const CRISIS = /\b(kill(ing)? myself|kms|suicid\w*|end (it all|my life|myself)|want to die|(don'?t|do not|dont) want to (live|be (here|alive))|no reason to live|better off dead|hurt(ing)? myself|self[- ]?harm|cutting myself|being abused|abus(e|ing) me|not safe at home|unsafe at home|someone (is )?hurting me)\b/i;

// Phones type curly apostrophes and extra spaces. Match on one plain form.
const plain = (text) => String(text ?? '').replace(/[\u2018\u2019\u02bc]/g, "'").replace(/\s+/g, ' ').slice(0, 500);

const UNKNOWN = [
  ['UNKNOWN_SEATS', /\b(seats?|spots?|openings?|space left|room left|still open|full|capacity|wait ?list|sold out)\b/i],
  ['UNKNOWN_AID_AMOUNT', /\b(how much|what amount|exact(ly)?)\b.{0,40}\b(aid|grant|award|scholarship|funding|financial|fafsa)\b|\b(give|pay) me\b|\b(aid|grant|award|scholarship)s? amount\b|\bamount of (aid|grant|award|money)\b|\b(will|would|do|can) i get\b.{0,30}\b(aid|grant|money|award|scholarship)\b/i],
  ['UNKNOWN_PERSONAL_ELIGIBILITY', /\b(am i|i'?m|will i|would i|can i|do i|could i|should i)\b.{0,30}\b(eligible|qualify|get in|be accepted|accepted|make it in|allowed to (apply|join)|meet|get into)\b|\b(accept|admit|take|let)s? me\b|\bget into\b|\b(qualify|eligible|eligibility)\b/i],
];

// A question naming a date can only be answered when that date is listed for the program she named.
const MONTH_DAY = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?\b/gi;
const LISTED_DATES = {
  'PRG-02': ['nov 30 2026', 'mar 1 2027'],
  'PRG-01': ['jan 6 2027'],
  'PRG-04': ['jan 6 2027'],
  'PRG-03': ['feb 1 2027'],
};

const PROGRAM_WORDS = [
  ['PRG-02', /\b(northline|apprentice\w*|electric\w*)\b/i],
  ['PRG-01', /\b(medical|medical assistant|ma cert\w*)\b/i],
  ['PRG-04', /\b(it support|it cert\w*|tech support|computers? support)\b/i],
  ['CASCADE', /\b(cascade|community college|cc)\b/i],
  ['PRG-03', /\b(riverbend|university|computer science|bachelor\w*|cs degree)\b/i],
  ['PRG-05', /\b(harbor|cdl|truck\w*|commercial driver)\b/i],
];

// [topic, pattern, fact keys it may cite]
const TOPICS = [
  ['AID', /\b(aid|grants?|fafsa|financial|scholarships?|help paying|pay for)\b/i, ['basis', 'how_to_apply', 'amount', 'aid_application']],
  ['COST', /\b(cost|costs|tuition|price|expensive|afford|fees?)\b/i, ['tuition']],
  ['PAY', /\b(pay|paid|wages?|earn|salary|hourly|money)\b/i, ['paid', 'wage']],
  ['DEADLINE', /\b(deadlines?|due|closes?|apply by|last day|when (do|should|can) i apply)\b/i, ['applications_close', 'priority_deadline']],
  ['START', /\b(start|starts|begin|begins|first day)\b/i, ['next_start', 'program_start']],
  ['AGE_RULE', /\b(18|eighteen|17|seventeen|age|old enough|too young)\b/i, ['age_rule', 'program_start']],
  ['DIPLOMA_RULE', /\b(diploma|ged|graduat\w*)\b/i, ['diploma_rule']],
  ['LENGTH', /\b(how long|years?|quarters?|weeks?|length)\b/i, ['length']],
  ['SCHEDULE', /\b(evening|night|nights|day classes|schedule|online|part[- ]time|after school)\b/i, ['schedule']],
  ['ADVISOR', /\b(advisor|adviser|counsel?lor|real person|talk to (a |an )?(person|human|someone))\b/i, ['confirms', 'response']],
];

export const TOPIC_CODES = TOPICS.map(([t]) => t);
export const TOPIC_KEYS = Object.fromEntries(TOPICS.map(([t, , keys]) => [t, keys]));

// Without a plan yet, Dani's two paths; with one, the programs she picked. Others only when named.
const DEFAULT_PROGRAMS = ['PRG-02', 'PRG-01', 'PRG-04'];
const LISTED_STARTS = new Set(['PRG-01', 'PRG-02', 'PRG-04']);
const UNLISTED_TIME = /\b(fall|summer|spring|next year|20(2[89]|3\d)|next (cycle|round|class|cohort)|later)\b/i;

function mentionedPrograms(text) {
  const ids = new Set();
  for (const [id, re] of PROGRAM_WORDS) {
    if (!re.test(text)) continue;
    if (id === 'CASCADE') ids.add('PRG-01').add('PRG-04');
    else ids.add(id);
  }
  return [...ids];
}

/**
 * @returns {{kind:'crisis'} | {kind:'cannot_confirm', code:string} | {kind:'topic', topic:string, record_ids:string[]}}
 */
export function matchQuestion(text, considering = DEFAULT_PROGRAMS) {
  const q = plain(text);
  if (CRISIS.test(q)) return { kind: 'crisis' };
  for (const [code, re] of UNKNOWN) if (re.test(q)) return { kind: 'cannot_confirm', code };

  const named = mentionedPrograms(q);
  const scope = (named.length ? named : Object.keys(LISTED_DATES)).flatMap((id) => LISTED_DATES[id] ?? []);
  for (const m of q.matchAll(MONTH_DAY)) {
    const [, mon, day, year] = m;
    const listed = scope.some((d) => d.startsWith(`${mon.toLowerCase()} ${Number(day)} `) && (!year || d.endsWith(year)));
    if (!listed) return { kind: 'cannot_confirm', code: 'UNKNOWN_START_DATE' };
  }

  for (const [topic, re] of TOPICS) {
    if (!re.test(q)) continue;
    if (topic === 'START') {
      const unlisted = named.some((id) => !LISTED_STARTS.has(id)) || UNLISTED_TIME.test(q);
      if (unlisted) return { kind: 'cannot_confirm', code: 'UNKNOWN_START_DATE' };
    }
    const record_ids =
      topic === 'AID' ? ['AID-A', ...named.filter((id) => id === 'PRG-03')]
      : topic === 'ADVISOR' ? ['ADV-01']
      : named.length ? named : considering;
    return { kind: 'topic', topic, record_ids };
  }
  return { kind: 'cannot_confirm', code: 'UNMATCHED_QUESTION' };
}

export function isCrisis(text) {
  return CRISIS.test(plain(text));
}
