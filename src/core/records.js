// The only facts this app may state. Synthetic records from the challenge brief.
// Each fact's `text` is canonical: the model gateway only accepts these exact strings.

export const RECORDS = [
  {
    id: 'PRG-01',
    kind: 'program',
    name: 'Cascade Community College, Medical Assistant Certificate',
    short: 'Cascade Medical Assistant',
    checked: '2026-10-20',
    facts: [
      { key: 'length', text: '3 quarters' },
      { key: 'schedule', text: 'Day classes only' },
      { key: 'tuition', text: 'Estimated total tuition 4,200 USD' },
      { key: 'next_start', text: 'Next start Jan 6, 2027', date: '2027-01-06' },
    ],
  },
  {
    id: 'PRG-02',
    kind: 'program',
    name: 'Northline Electrical Apprenticeship',
    short: 'Northline Apprenticeship',
    checked: '2026-10-20',
    facts: [
      { key: 'paid', text: 'Paid' },
      { key: 'length', text: '4 years' },
      { key: 'wage', text: 'Starts at 55% of journey-level wage' },
      { key: 'age_rule', text: 'Applicants must be 18 by the program start date' },
      { key: 'diploma_rule', text: 'HS diploma or GED required' },
      { key: 'applications_close', text: 'Applications close Nov 30, 2026', date: '2026-11-30' },
      { key: 'program_start', text: 'Program starts Mar 1, 2027', date: '2027-03-01' },
    ],
  },
  {
    id: 'PRG-03',
    kind: 'program',
    name: 'Riverbend University, BS Computer Science',
    short: 'Riverbend Computer Science',
    checked: '2026-10-18',
    facts: [
      { key: 'length', text: '4 years' },
      { key: 'aid_application', text: 'FAFSA or state aid application required' },
      { key: 'priority_deadline', text: 'Priority deadline Feb 1, 2027', date: '2027-02-01' },
    ],
  },
  {
    id: 'PRG-04',
    kind: 'program',
    name: 'Cascade Community College, IT Support Certificate',
    short: 'Cascade IT Support',
    checked: '2026-10-20',
    facts: [
      { key: 'length', text: '2 quarters' },
      { key: 'schedule', text: 'Evening online option' },
      { key: 'tuition', text: 'Estimated total tuition 2,100 USD' },
      { key: 'next_start', text: 'Next start Jan 6, 2027', date: '2027-01-06' },
    ],
  },
  {
    id: 'PRG-05',
    kind: 'program',
    name: 'Harbor Workforce Center, CDL Class A Training',
    short: 'Harbor CDL Class A',
    checked: '2026-10-15',
    facts: [
      { key: 'length', text: '6 weeks' },
      { key: 'schedule', text: 'Evening cohort available' },
      { key: 'funding', text: 'Eligible for dislocated-worker training funds' },
    ],
  },
  {
    id: 'AID-A',
    kind: 'aid',
    name: 'Evergreen Opportunity Grant (state)',
    short: 'Evergreen Opportunity Grant',
    checked: '2026-10-18',
    facts: [
      { key: 'basis', text: 'Income-based' },
      { key: 'how_to_apply', text: 'Apply through FAFSA or the state aid application' },
      { key: 'amount', text: 'Award amount varies' },
    ],
  },
  {
    id: 'AID-B',
    kind: 'aid',
    name: 'Dislocated Worker Training Funds',
    short: 'Dislocated Worker Training Funds',
    checked: '2026-10-15',
    facts: [
      { key: 'requires', text: 'Requires a layoff notice' },
      { key: 'how_to_apply', text: 'Apply through Harbor Workforce Center' },
      { key: 'covers', text: 'Covers approved training' },
    ],
  },
  {
    id: 'ADV-01',
    kind: 'advisor',
    name: 'Human advisor hand-off',
    short: 'Advisor',
    checked: null,
    facts: [
      { key: 'confirms', text: 'Advisors confirm eligibility, seats, and award amounts' },
      { key: 'response', text: 'Response within 2 business days' },
    ],
  },
];

const byId = new Map(RECORDS.map((r) => [r.id, r]));

export function getRecord(id) {
  return byId.get(id);
}

/** A citable fact: the canonical text plus where it came from and when it was checked. */
export function fact(recordId, key) {
  const record = byId.get(recordId);
  const f = record?.facts.find((x) => x.key === key);
  if (!f) throw new Error(`No fact ${recordId}.${key}`);
  return { record_id: recordId, key, text: f.text, checked: record.checked, ...(f.date && { date: f.date }) };
}

/** Every canonical fact string, for the gateway's closed-set check. */
export const CANONICAL_FACT_TEXT = new Set(RECORDS.flatMap((r) => r.facts.map((f) => f.text)));
