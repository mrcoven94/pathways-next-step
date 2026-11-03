# Pathways next-step slice

Dani, 17, should apply to the Northline Electrical Apprenticeship before applications close Nov 30, 2026, and ask an advisor this week whether she needs her diploma when she applies or only by the Mar 1, 2027 start. This slice gets her to that step in about a minute on her phone. Every fact on screen shows where it came from, and nothing about her reaches the model.

- **Live:** https://pathways-next-step.vercel.app (records and every model call are at [/how](https://pathways-next-step.vercel.app/how))
- **Run:** `npm start`, then open http://localhost:3000
- **Test:** `npm test` (23 checks, prints pass or fail, writes `model-calls.log` with a summary at the top)
- **Prove the tests bite:** `npm run mutate` breaks nine guards one at a time in a scratch copy, and confirms the named check fails each time.
- Node 20 or newer. No `npm install`, no API key, no accounts, no database.

`SPEC.md` is the brief the coding agents got, with dated amendments. `docs/process.md` records every time a person or a check corrected the AI.

## Section A: Build summary

**Who and what step.** Dani taps where she is and what she's weighing: Northline and Cascade Community College. Because she picked Northline, the planner asks whether she'll be 18 and have her diploma by Mar 1, 2027. She gets one dated step and three ways to act: ask an advisor, add the date to her calendar, or save the plan. A plan is never presented as an application.

**Real versus mocked.** The planner, question routing, reply checks, advisor queue and log are real. The model is a scripted stand-in, labeled on every screen. The advisor queue lives in memory, and no person receives the request.

**Biggest trade-off.** The model never writes a fact. It points at facts by ID, and code writes them from the records. A real model would sound less fluent. For minors, a plainer sentence beats an invented one.

**What the checks prove.**
- **AC8** plants a canary name, note and question: the advisor gets all three, `model-calls.log` gets none.
- **AC7b** feeds a misbehaving model sixteen bad answers. Every one is replaced.
- **AC6** proves that seats, her own eligibility, aid amounts and unlisted dates get "I can't confirm that" without a model call.

**One thing they miss.** Every check runs against the scripted model. A real model's wording hasn't been tested, and connecting words could still mislead ("Cascade comes first") even though code draws the real order on screen.

**Marcus.** The same gateway and checks apply, but the planner needs a new branch: PRG-05 and evening filters, and a layoff-notice tap checked in code against AID-B, never sent to the model.

## Section B: AI Usage Log

I worked with Claude Code (Opus 5.5) as the builder, Codex (Sol 6.1) as an independent reviewer, and Claude subagents as design critics. The full log is in `docs/process.md`. The first three are moments I redirected the AI myself. The fourth is how I checked its work with another AI.

**1. It asked her birthday before it knew who she was.**
- **Asked:** Claude to build the flow from the spec.
- **Got:** A flow that opened with "Will you be 18 by March 1, 2027?". It assumed every user is Dani and is already weighing Northline.
- **Did:** Pushed back: we were asking a minor for her dates without knowing anything about her or why we needed them. The flow now asks where she is and what she's weighing first, and asks about age only if she picks Northline. Someone not finishing high school gets an honest "built for seniors for now" and an advisor. AC12 proves that someone who picks only Cascade is never asked her age.

**2. "[removed]" in her own chat.**
- **Asked:** Claude to wire a real personal-info detector (Rampart Edge, in the browser) into the question box.
- **Got:** Names and phone numbers replaced with "[removed]" in her own chat thread.
- **Did:** Rejected it. Her question never leaves the phone; only a topic code does. Scrubbing her words on her own screen protected nothing and made the product feel suspicious of her. The detector now runs only on the advisor note, the one piece of text that leaves the phone, and there it only suggests.

**3. Her name.**
- **Asked:** Claude to design the data boundary.
- **Got:** A proposal to never ask her name.
- **Did:** Overruled it. A planner that won't use a teenager's name feels like a form. The name stays on the phone and goes to the advisor. The model writes `{first_name}`, and the browser fills it in after the reply. AC8 proves the name never appears in the log.

**4. Checking the AI with another AI.**
- **Asked:** Sol 6.1 to try to break the boundary and the grounding checks.
- **Got:** Replies the validator wrongly passed, like "Applications close Dec 30, 2026." The 30 and the 2026 both appear in the real date, and numbers were matched as substrings. A second pass broke the tightened rules with "Applications close Mar 1, 2027": a real date on the wrong event.
- **Did:** Sol argued that rules over free prose would keep losing, and I agreed. So the model now only points at facts with slots like `{fact:PRG-02:paid}`, and code writes each fact. Every case from both reviews is a test.

## How long it took

The repo started at 08:47. The spec, planner, gateway and checks were committed at 08:57. The slice ran end to end at 09:10 (commit `d12279a`). That's the 30-minute build. Everything after it came from reviews, on purpose:
- my three redirects above;
- two rounds of Sol finding real holes in the boundary;
- two design critiques and a finish review;
- a deploy that built green but served errors.

Each finding was a gap I'd have to answer for in front of a state agency, so I fixed it rather than stopping at the clock. The last product change (live suggestions and a typing indicator) was polish, and is labeled as such in `docs/process.md`.

## Where the code makes the key decisions

| Decision | Where | Who decides |
|---|---|---|
| Northline's age and diploma rules, and the deadline | `src/core/planner.js:51` (`northline`), age rule at line 55 | Code |
| Which step comes first | `src/core/planner.js:97` | Code |
| Which questions she is asked, from what she's weighing | `src/core/planner.js:26` (`questionsFor`) | Code |
| Typed text becomes a topic code on the phone | `public/client.js:21` (`askRequest`) | Code |
| Nothing outside the closed set reaches the model | `src/core/gateway.js:63` (`checkPayload`), called at line 173 before every call | Code |
| A reply is used or replaced | `src/core/gateway.js:103` (`checkReply`) | Code |
| Facts are written from the records, not by the model | `src/core/gateway.js:141` (`renderReply`) | Code |
| Her name is filled in | `public/client.js:14` (`withName`), in the browser | Code |
| Which facts to mention, and the words around them | `src/core/mock-model.js` | The (scripted) model |

## The checks

`npm test` runs 23 checks, one or more per acceptance criterion in `SPEC.md`. They run through the real HTTP API and through the browser's own request builder (`public/client.js`). Every model call is written to `model-calls.log`: the exact text sent, the exact reply and the verdict. A summary at the top lists every replaced call. `npm run verify` adds a smoke test of the running app, or of the live deployment with `BASE_URL` set. `npm run mutate` proves the checks catch what they claim.

"Today" is the date in Pacific time, so Northline stays open until midnight on Nov 30 (AC5b). To replay a plan on another date, add `?today=2026-12-05` to the URL. The screen then says it's showing a replay.

## Taking it to 100,000 students, and protecting their data

**The model inputs are finite, so every reply can be reviewed before launch.**
- A plan payload is built only from taps and record facts. That makes 205 possible plans per date, plus a few hundred possible question payloads.
- At scale, a hosted model under zero retention and no training generates each one once. The same checks run, a person reviews the set, and the approved replies are cached.
- A student is never shown model text a person hasn't seen.
- Cost is a few thousand model calls per records update, not per student. Latency is a cache read.

**Load.** About 100,000 students, each with a plan and a few questions, is about 400,000 requests a season. It's static files on a CDN plus a stateless function, with no database on the student path.

**Records become a service.**
- Agencies publish programs with a source and check date on every fact.
- Facts older than 45 days are flagged on screen, as they are here, and the owner is alerted.
- A records change regenerates and re-reviews only the replies that cite it.

**Advisors get a real queue.**
- Hand-offs land in the district's case tool, behind the district's sign-in, so we never collect a student's phone or email.
- The reply comes back inside Pathways.
- A crisis phrase shows 988 and 911 on the phone first, and flags the hand-off for same-day review.

**Data for minors.**
- No student account is needed to plan, and the name and plan stay on the device.
- Hand-off records stay in region and encrypted, are deleted 90 days after they're resolved, and are never used for training.
- The model log holds no student data by construction, so it can be kept for audit.
- FERPA and COPPA review happens before the pilot.

**Proof at scale.** The checks and the mutation run on every pull request. A daily canary student walks the live flow and checks the log for leaks.

## What I left out, and why

- **A real model.** The slice is about the boundary and the checks. A real model goes behind the same gateway, and the first job after that is measuring how often its replies get replaced.
- **Spanish and other languages.** The reply check needs a word list per language. I'd rather ship that tested than half-done.
- **Real application links.** The records don't include any, and a made-up link is exactly the claim this slice exists to prevent.
- **Marcus.** Out of scope by the brief (see Section A for what his branch would need).

## Rough edges

- Rampart Edge loads from a CDN and takes about 5 seconds the first time. If it doesn't load, the note goes as typed. In production it would be self-hosted.
- The advisor queue and the "What the model saw" table are in memory on each server. The full log from the test run is `model-calls.log`.
- The topic matcher is a list of patterns. A question it doesn't recognize goes to an advisor, which is safe but sometimes unhelpful.
- ADV-01 has no check date in the records ("n/a"), so its source line says so.
- The screens are checked by hand and through `public/client.js`. There's no automated browser test, to keep the zero-install promise.
