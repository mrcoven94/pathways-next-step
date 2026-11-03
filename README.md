# Pathways next-step slice

Dani, 17, should apply to the Northline Electrical Apprenticeship before applications close Nov 30, 2026, and ask an advisor this week whether she needs her diploma when she applies or only by the Mar 1, 2027 start. This slice gets her to that step in about a minute on her phone. Every fact on screen shows where it came from, and nothing about her reaches the model.

- **Live:** https://pathways-next-step.vercel.app (the model-call table is at [/how](https://pathways-next-step.vercel.app/how))
- **Run:** `npm start`, then open http://localhost:3000
- **Test:** `npm test` (21 checks, prints pass or fail, writes `model-calls.log`)
- Node 20 or newer. No `npm install`, no API key, no accounts, no database.

`SPEC.md` is the brief the coding agents got before writing code. `docs/process.md` records every time a person or a check corrected the AI.

## Section A: Build summary

**Who and what step.** Dani taps where she is and what she's weighing: Northline and Cascade Community College. Because she picked Northline, the planner asks whether she'll be 18 and have her diploma by Mar 1, 2027. She gets one step with a date and three ways to act on it: ask an advisor, add the date to her calendar, or save the plan. A plan is never presented as an application.

**Real versus mocked.** The planner, question routing, reply checks, advisor queue and log are real. The model is a scripted stand-in, labeled on every screen. The advisor queue lives in memory, and no person receives the request.

**Biggest trade-off.** The model never writes a fact. It points at facts by ID, and code writes them from the records. A real model would feel less fluent. For minors, a plainer sentence beats an invented one.

**What the checks prove.**
- **AC8** plants a canary name, note and question. It proves the advisor gets all three and `model-calls.log` gets none.
- **AC7b** feeds a misbehaving model sixteen bad answers. Every one is caught and replaced.
- **AC6** proves that seats, her own eligibility, aid amounts and unlisted dates get "I can't confirm that" without calling the model.

**One thing they miss.** The model can't write a fact, only point at one, but its connecting words can still mislead: "Cascade is first on your road" passes, though code draws the real order on screen.

**Marcus on the same planner.** He taps "out of school and looking for work" and picks evening options (PRG-04 and PRG-05). His layoff notice becomes a yes/no tap checked in code against AID-B, never sent to the model. His next step is to apply for dislocated-worker funds through Harbor Workforce Center.

## Section B: AI Usage Log

I worked with Claude Code (Opus 5.5) as the builder, Codex (Sol 6.1) as an independent reviewer, and Claude subagents as design critics. The full log is in `docs/process.md`. These four mattered most.

**1. The validator an independent model broke.**
- **Asked:** Sol 6.1 to review the branch against the spec and try to break the minors' data boundary and the grounding checks.
- **Got:** Four replies my validator marked "used":
  - "Applications close Dec 30, 2026." The 30 and the 2026 both appear in the real date, and I was matching numbers as substrings.
  - "Northline pays 18 USD an hour." The 18 came from the age rule.
  - "You qualify for Northline."
  - "Northline provides free housing." No number, so nothing was checked.
  It also found that `k in keys` let a field named `constructor` through the allowlist.
- **Did:** Tightened the rules (exact dates, numbers with units, a closed vocabulary, `Object.hasOwn`) and made all five cases tests. A second Sol pass broke that too: "Applications close Mar 1, 2027" used only real words and a real date, but pinned the date to the wrong event.
- **What I did instead:** Stopped patching rules over free text and changed who writes facts. The model now points at facts with slots like `{fact:PRG-02:paid}`, and code writes each fact's sentence from the records. The model's own words may not contain a number, a month or any fact word. Every case from both reviews is a test, and undoing each fix in a scratch copy turns its test red.

**2. Asking her birthday before knowing who she is.**
- **Asked:** Claude to build the flow from the spec.
- **Got:** A flow that opened with "Will you be 18 by March 1, 2027?", assuming every user is Dani and already weighing Northline.
- **Did:** I pushed back: we were asking for her dates without knowing anything about who she is. The flow now asks where she is and what she's weighing first. The age questions only appear if she picks Northline. A test (AC12) proves that someone who picks only Cascade is never asked her age.

**3. "[removed]" in her own chat.**
- **Asked:** Claude to wire a real personal-info detector (Rampart Edge, in the browser) into the question box.
- **Got:** Detected names and phone numbers replaced with "[removed]" in her own chat thread.
- **Did:** Rejected it. Her question never leaves the phone; only a topic code does. Scrubbing her words on her own screen protected nothing and made the product feel suspicious of her. The detector now runs only on the advisor note, the one piece of text that leaves the phone. There it offers to take out a phone number and never edits on its own.

**4. Her name.**
- **Asked:** Claude to design the data boundary.
- **Got:** A proposal to never ask her name at all.
- **Did:** Overruled it. A planner that won't use a teenager's name feels like a form. The name now stays on the phone and goes to the advisor. The model writes `{first_name}`, the browser fills it in after the reply comes back, and AC8 proves the name never appears in the log.

## Where the code makes the key decisions

| Decision | Where | Who decides |
|---|---|---|
| Northline's age and diploma rules, and the deadline | `src/core/planner.js:51` (`northline`), age rule at line 55 | Code |
| Which step comes first | `src/core/planner.js:97` | Code |
| Typed text becomes a topic code on the phone | `public/client.js:21` (`askRequest`) | Code |
| Which questions she is asked, from what she's weighing | `src/core/planner.js:26` (`questionsFor`) | Code |
| Nothing outside the closed set reaches the model | `src/core/gateway.js:63` (`checkPayload`), called at line 173 before every call | Code |
| A reply is used or replaced | `src/core/gateway.js:103` (`checkReply`) | Code |
| Facts are written from the records, not by the model | `src/core/gateway.js:141` (`renderReply`) | Code |
| Her name is filled in | `public/client.js:14` (`withName`), in the browser | Code |
| Which facts to mention, and the warm words around them | `src/core/mock-model.js` | The (scripted) model |

## The checks

`npm test` runs 21 checks, one per acceptance criterion in `SPEC.md`, through the real HTTP API and the browser's own request builder (`public/client.js`). Every model call they make is written to `model-calls.log`, with the exact text sent, the exact reply and the verdict. `npm run verify` adds a smoke test of the running app. With `BASE_URL` set, it checks the live deployment instead.

To replay a plan on another date (deadline passed, stale records), add `?today=2026-12-05` to the URL.

## Taking it to 100,000 students, and protecting their data

**The boundary doesn't change; the parts around it do.**
- The gateway is the only path to a model, and it accepts only codes and canonical record text.
- At scale, the scripted model becomes a hosted model under a zero-retention, no-training agreement. The same checks run on every reply.
- Running Rampart Edge on the outbound payload as a tripwire is cheap, but the closed set is the guarantee.

**The records become a service.**
- Agencies publish programs through a records pipeline that stamps every fact with its source and check date.
- Facts older than 45 days are flagged on screen, as they are here, and a nightly job alerts the owner.

**Advisors get a real queue.**
- Hand-offs land in the district's case tool through its own sign-in, so the student never gives us a phone number or email.
- The reply comes back inside Pathways. A crisis phrase still shows 988 and 911 on the phone first, and also flags the hand-off for same-day review.

**Data for minors.**
- No student account is needed to plan. Name and plan stay on the device.
- Hand-off records sit in the district's region, encrypted, deleted on a fixed schedule, and are never used for training.
- The model log holds no student data by construction, so it can be kept for audit.
- FERPA and COPPA reviews happen before the pilot, not after.

**Load.** Planning is code plus one short model call, so 100,000 students is mostly static files on a CDN and a stateless function. Model calls get cached by payload, since many students share the same codes, and rate-limited per district.

**Proof at scale.** The acceptance checks run on every pull request. A daily canary student walks the live flow and checks the log for leaks.

## What I left out, and why

- **Spanish and other languages.** Copy is in one place, but translated text would need its own word list for the reply check. I'd rather ship that tested than half-done.
- **Real application links.** The records don't include any, and a made-up link is the kind of claim this slice exists to prevent.
- **A real model.** The point of the slice is the boundary and the checks. Swapping in a real model is a one-function change in `src/core/mock-model.js`, and the gateway stays the same.
- **Marcus.** Out of scope by the brief. The planner takes his inputs; his screens aren't built.

## Rough edges

- Rampart Edge loads from a CDN and takes about 5 seconds the first time. If it doesn't load, the note goes as typed. In production it would be self-hosted and pinned.
- The advisor queue and the "What the model saw" table are in memory on each server. On Vercel, each instance has its own. The full log from the test run is `model-calls.log` in this repo.
- The topic matcher is a list of patterns. A question it doesn't recognize goes to an advisor, which is safe but sometimes unhelpful.
- The browser screens are checked by hand and through `public/client.js`. There is no automated browser test, to keep the zero-install promise.
