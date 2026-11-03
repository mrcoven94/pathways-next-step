# Spec: Pathways next-step slice for Dani

This is the brief the coding agents got before writing code. It was written first in the session and committed together with the first code (`5898f35`). It is kept in sync with what shipped: changes after the first build are marked "(amended)" and explained under Amendments. If the code and this file disagree, the code is wrong.

## Outcome

Dani is 17, a high school senior, likes hands-on work, and is torn between the Northline Electrical Apprenticeship and community college. She wants to know what to do before winter break.

In under two minutes on her phone, the slice moves her to one concrete next step with a date on it, built only from the synthetic records. It gives her three ways to act on it: put the date on her calendar, save the plan on her device, and ask a human advisor to confirm what the records can't.

Done looks like this: Dani says where she is and what she's weighing, answers only the questions those picks need (amended: three to five taps), and sees her next step. That is Northline with "Applications close Nov 30, 2026", or the community college plan if the age rule rules her out. Every fact on screen shows its record ID and last-checked date. She leaves with a calendar file, a saved plan or an advisor request code.

## Users and buyers

- Dani, 17. On a phone, between classes. Reads fast, skips walls of text, does not want to be lectured.
- State agencies and school districts piloting with several thousand students next month. They need to see that nothing is made up, that nothing about a minor reaches the model, and that a person is reachable whenever the records run out.

## Hard constraints

1. Grounded or silent. Every fact shown comes from `src/core/records.js` and carries its source ID and last-checked date. Anything not in the records is unknown.
2. The four unknowns from the brief always produce "I can't confirm that" and the advisor hand-off: seat availability, a specific person's eligibility, exact aid amounts, start dates not listed.
3. Code decides, the model words it. Fit, deadlines, unknowns, staleness and escalations are decided in `src/core/planner.js` and `src/core/topics.js`. The model never decides anything.
4. The code never says Dani is eligible. Each program gets one of three outcomes: `fits_listed_rules`, `misses_a_listed_rule`, `unknown`. Copy never says she is eligible, accepted, enrolled, approved or awarded.
5. A saved plan is never presented as an application, enrollment or award.
6. Minors' data stays out of the model.
   - Dani's first name may be asked. It stays on her device and goes into the advisor hand-off, never to the model. The model writes `{first_name}` and the browser fills it in after the reply comes back.
   - Typed text (the question box, the advisor note) never reaches the model. Questions are matched against a fixed topic list and only the topic code is sent.
   - Every string in a model payload must come from a closed set: topic codes, record IDs, decision codes, canonical record fact text. The gateway throws on anything else.
   - Rampart Edge (an in-browser personal info detector) runs on the advisor note, the one piece of typed text that leaves the phone, and only suggests removing contact details (amended: it no longer touches the question box). It is the third layer, not the boundary: its published catch rate on name-only messages is 49.6%.
7. Every model call is logged to `model-calls.log`: the exact text sent, the exact text returned, and the validator verdict.
8. The model is a clearly labeled scripted stand-in. No API keys, no paid services, no accounts, no database.
9. `npm start` runs it. `npm test` runs the checks and prints pass or fail. No `npm install`. Node 20 or newer.
10. A crisis phrase in any text box shows 988 and 911 on the device at once. No model call, no waiting on an advisor.

## Escalations (code decides, advisor hand-off offered)

| Code | When |
|---|---|
| `AGE_UNCONFIRMED` | Dani is not sure she'll be 18 by Mar 1, 2027 |
| `AGE_RULE_MISSED` | She won't be 18 by Mar 1, 2027. The plan moves to community college; the next Northline cycle is not in the records |
| `DIPLOMA_TIMING_UNKNOWN` | She won't have, or isn't sure she'll have, a diploma or GED by Mar 1, 2027. The record says one is required but not by when |
| `DEADLINE_PASSED` | Today is after a listed deadline |
| `STALE_RECORD` | A record used was checked more than 45 days before today |
| `UNKNOWN_SEATS` | Asked about seats or spots |
| `UNKNOWN_PERSONAL_ELIGIBILITY` | Asked whether she, personally, qualifies or will get in |
| `UNKNOWN_AID_AMOUNT` | Asked how much aid she'll get |
| `UNKNOWN_START_DATE` | Asked about a start date the records don't list |
| `UNMATCHED_QUESTION` | The question matches no known topic |
| `CRISIS` | Crisis words in any text box. Shows 988 and 911 instead of a hand-off |

The validator also replaces any model reply that:
- cites an unknown record,
- states a number or date not in a cited record,
- uses any placeholder other than `{first_name}`, or
- claims eligibility, acceptance, enrollment or an award.

The replacement is a plain template built by code, logged as `replaced`.

## The flow

1. Start. "Let's find your next step before winter break." First name, optional.
2. Where are you right now? Finishing high school, out of school and looking for work, or something else. Only the first continues; the others get an honest "built for seniors for now" and the advisor (amended).
3. What are you weighing? Pick any of Northline, the two Cascade certificates and Riverbend, or "not sure yet" (amended).
4. Only if she picked Northline: Will you be 18 by Mar 1, 2027? Will you have a diploma or GED by then? Only if she also picked a classroom program: earn right away, or classes first? Each answer is yes, no or not sure (amended).
5. Plan. One next step with its date, what's still open, the road of dates, and her options.
6. Three actions: ask an advisor, add the date to her calendar (.ics), save the plan on this device.
7. A question box answered from the records, or routed to an advisor.
8. "How this works": the records table and the model-call table.

## Acceptance criteria (each one is an automated check)

1. Yes, yes, earn gives Northline as the next step, with "Applications close Nov 30, 2026" cited to PRG-02 and its checked date.
2. Every fact in every plan and answer carries a record ID that exists, plus that record's last-checked date.
3. No to the age question gives `misses_a_listed_rule` for PRG-02 and moves Cascade (PRG-01, PRG-04) to the front.
4. "Not sure" on age, or no or not sure on diploma, gives `unknown` with the matching escalation code and the advisor offer.
5. With the clock after Nov 30, 2026, Northline shows `DEADLINE_PASSED`. With the clock more than 45 days after Oct 20, 2026, `STALE_RECORD` appears.
6. Questions about seats, her own eligibility, exact aid amounts and an unlisted start date each return "can't confirm" with the advisor hand-off, and make no model call.
7. No reply in any scenario says she is eligible, accepted, enrolled, approved or awarded. A scripted bad model that says so, invents a dollar figure, or cites PRG-99 is caught and replaced.
8. A canary first name, a canary advisor note and a canary typed question appear in the hand-off and nowhere in `model-calls.log`.
9. The gateway throws when a payload carries an unknown field or a string outside the closed set.
10. A crisis phrase returns the 988 and 911 card and makes no model call.
11. Every model call made during the run appears in `model-calls.log`, with what was sent, what came back and the verdict.

## Seams under test

One seam does most of the work: the HTTP API (`/api/plan`, `/api/ask`, `/api/handoff`), exercised in-process with an injectable clock and an injectable model. Two narrower seams cover what the API can't reach directly: the model gateway (allowlist and validator) and the log file itself.

## Out of scope

Marcus (the gateway and checks carry over, but the planner needs a new branch for PRG-05, evening filters and an AID-B layoff-notice tap; see the README), accounts, real advisor messaging, real application links, Spanish and other languages, analytics, and anything not in the records table.

## Amendments (2026-11-03, after the first build)

The brief above is what the agents got first. These changes came from David's review of the first build and two independent model reviews. `docs/process.md` has the story behind each.

1. **Context first.** The flow asks where she is and what she's weighing before anything else. Age and diploma questions appear only when she picks Northline. The earn-or-classes question appears only when she picks Northline and a classroom program. Someone not finishing high school is told this preview is built for seniors and offered an advisor. Riverbend (PRG-03) is now selectable too.
2. **Her words stay hers.** Nothing redacts or rewrites text on her own screen. The personal-info detector runs only on the advisor note, the one piece of text that leaves the phone, and it only suggests.
3. **The model points, code writes.** Replies reference facts as `{fact:RECORD-ID:key}` slots, and code renders each fact's sentence from `records.js`. The model's own words may not contain a digit, a written number, a month or a word from any fact.
4. **Passed dates.** A start or deadline that has passed is never offered as the next step or the calendar date.

New acceptance criteria:

12. Someone weighing only Cascade is never asked her age, and the server refuses a Northline plan without the age and diploma taps.
13. Every path reaches a dated next step from the records, including a Riverbend-only path and a path where everything she picked is ruled out.
14. A date that has passed is never the next step, even in the code-written fallback.
15. Every question the box suggests routes to an answer from the records or to an advisor.
16. "Today" is the date in Pacific time, so a deadline stays open until midnight there (AC5b).

17. Her next step is concrete for this week. When asking an advisor comes first, code works out when the answer arrives (ADV-01: 2 business days) and says whether that's before the deadline. If she said she'd rather learn by doing, the plan says that's why Northline comes first.

`npm run mutate` breaks at least one guard behind every criterion above (22 in all) and confirms the named check fails each time.
