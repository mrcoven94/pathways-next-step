# Pathways next-step slice

Dani, 17, should apply to the Northline Electrical Apprenticeship before applications close Nov 30, 2026, and ask an advisor this week whether she needs her diploma when she applies or only by the Mar 1, 2027 start. This slice gets her to that step in about a minute on her phone. Every fact on screen shows where it came from, and nothing about her reaches the model.

- **Live:** https://pathways-next-step.vercel.app (records and every model call are at [/how](https://pathways-next-step.vercel.app/how))
- **Run:** `npm start`, then open http://localhost:3000
- **Advisor inbox:** `ADVISOR_CODE=<a code you choose> npm start`, then open http://localhost:3000/advisor. Without the variable the inbox does not exist (404).
- **Test:** `npm test` (43 checks, prints pass or fail, writes `model-calls.log` with a summary at the top)
- **Prove the tests bite:** `npm run mutate` breaks 41 guards, at least one behind every acceptance criterion, one at a time in a scratch copy. It confirms the named check fails each time.
- **The 30-minute version:** tag [`v0.1-30min`](https://github.com/mrcoven94/pathways-next-step/tree/v0.1-30min) is the slice as it stood 23 minutes after the repo started, before any review. To run it: `git checkout v0.1-30min && npm test && npm start` (15 checks, all passing). Compare it with `main` to see what review added.
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

## The private note (added 2026-11-10)

**The task.** A student leaves a private note for their advisor. The advisor can read it through the advisor workflow. It is never sent to an AI model.

**What changed, and it is small.** The note was already captured and already kept away from the gateway by convention. Three things were missing, and each is now code:
- **The advisor can read it.** `/advisor` is an inbox behind an access code. The list shows who asked and why, without the note. Opening a request opens the note.
- **The note is sealed where it arrives** (`src/core/private.js`). It prints as "[private]" in JSON, strings, templates, logs and errors. One function can open it, and every open is recorded: why, which request, when, never the text.
- **The gateway checks the copy it sends**, so an object can't show the check one thing and the prompt another.

**Where the boundary is.** Two layers, both in code, neither a prompt:
1. `checkPayload` in `src/core/gateway.js`: a model payload may hold only record IDs, codes and the exact text of record facts. A note is none of those, so it is refused before any call.
2. `Sealed` in `src/core/private.js`: outside the advisor read path, the note is not a string anyone can pass along by accident.

Rampart Edge is served from this site (`public/vendor/rampart/`, about 9 MB, no request to any other host) and runs only in the two browsers that already hold the note: the student's send screen, where it suggests leaving contact details out, and the advisor inbox, where it hides names, addresses, phone numbers, emails and IDs until the advisor switches each kind on. The server never runs it. `npm test` runs the real model with no install (AC22).

It is not the boundary and can't be. `npm run eval:rampart` runs it over 40 invented notes: it found every email and street address and 6 of 7 names, and it passed all 12 notes that hold no identifier at all but are the most private in the set (a parent's job loss, an eviction, a health worry). A detector finds contact details. It does not know what is private.

**What the test proves (AC18 to AC21).** A sentinel string is planted in a note, and the run then looks everywhere it must not be:
- every prompt the model was handed, recorded by a spy at `model.complete`, including calls made after the note is in the queue;
- every line of `model-calls.log`, and that the spy and the log agree on the number of calls;
- every response a caller without the access code can get, including replies to an unreadable request;
- everything the server printed;
- the queue itself as JSON, as a string, in a template and through `util.inspect`.

It also proves the note arrives word for word through the advisor read, that one read is exactly one recorded open, and that the gateway refuses the note in 212 placements across both payload shapes. `npm run mutate` breaks each guard in turn. One of those mutations calls the model directly, around the gateway: the log never sees it and the old log-only check would have passed. The spy fails it.

**What it misses.**
- **The browser.** The inbox shows a student's text to an advisor. The page escapes it and a content security policy blocks outside code, and I checked a script-tag note by hand, but no automated test drives a real browser.
- **A model client the test doesn't inject.** The spy sees calls through the app's model. Code that built its own client and called a provider would not be seen. The guard for that is review, plus a lint rule in production that only `gateway.js` may import a model client.
- **The host.** Vercel's request logs, a crash dump or an error tracker could hold a request body. Nothing in the repo can test that.
- **The raw request.** For one function call, before sealing, the note is a plain string in the request body. A debugger or a heap dump would show it.
- **An advisor who copies it.** Once a person reads the note, software can't stop them pasting it into a chat tool.

**How production differs.**
- **Storage.** The queue is in memory, and on Vercel each server instance has its own, so a request can vanish on restart or land where the inbox isn't looking. Production needs a durable queue with the note encrypted as its own field, so the store and its backups hold ciphertext.
- **Who the advisor is.** A shared access code is a stand-in. Production uses the district's sign-in, assigns each request to an advisor, and records the advisor's identity with every open.
- **Retention.** Hand-offs are deleted 90 days after they're resolved, as in the data inventory below.
- **The model.** A real provider goes behind the same gateway, under zero retention, with egress from the server limited to that provider. A daily canary student leaves a sentinel note and searches the provider-side log for it.
- **Logging.** Request bodies are never logged at the host, and the error tracker is set to drop them.

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

Before any code: a design interview (three rounds of questions with me, logged in `docs/process.md`). Then the repo started at 08:47, and the spec, planner, gateway and checks were committed at 08:57. The slice ran end to end at 09:10 (commit `d12279a`, tagged `v0.1-30min`, still runnable). That's the 30-minute build, counted from the repo. Everything after it came from reviews, on purpose:
- my three redirects above;
- two rounds of Sol finding real holes in the boundary;
- two design critiques and a finish review;
- a deploy that built green but served errors.

Each finding was a gap I'd have to answer for in front of a state agency, so I fixed it rather than stopping at the clock. The last product change (live suggestions and a typing indicator) was polish, and is labeled as such in `docs/process.md`.

## Where the code makes the key decisions

| Decision | Where | Who decides |
|---|---|---|
| Northline's age and diploma rules, and the deadline | `src/core/planner.js:66` (`northline`), age rule at line 70 | Code |
| Which step comes first | `src/core/planner.js:112` | Code |
| Which questions she is asked, from what she's weighing | `src/core/planner.js:41` (`questionsFor`) | Code |
| Typed text becomes a topic code on the phone | `public/client.js:21` (`askRequest`) | Code |
| Nothing outside the closed set reaches the model | `src/core/gateway.js:63` (`checkPayload`), called at line 173 before every call | Code |
| A reply is used or replaced | `src/core/gateway.js:103` (`checkReply`) | Code |
| Facts are written from the records, not by the model | `src/core/gateway.js:141` (`renderReply`) | Code |
| Her name is filled in | `public/client.js:14` (`withName`), in the browser | Code |
| Which facts to mention, and the words around them | `src/core/mock-model.js` | The (scripted) model |

## Student data inventory

Every piece of student data the slice touches, checked against the code. "Model" means anything inside a payload to `callModel` in `src/core/gateway.js`, and AC8 and AC9 test that column.

| Data | Where it lives | Who can see it | Reaches the model? | Deleted when |
|---|---|---|---|---|
| First name | Her phone (`localStorage` `pathways.name`). Sent only in the advisor request | Her, and the advisor if she sends a request | **Never.** The model writes `{first_name}`, and the phone fills it in | She clears site data. On the server, when the in-memory queue restarts (production: 90 days after the request is resolved) |
| Where she is ("finishing high school") | Her phone only. It's removed before the plan request | Her | **Never.** Only an `OUTSIDE_PREVIEW` code goes with an advisor request | With the page |
| Programs she's weighing | Her phone, then `/api/plan` | Her and the planner | Only as record IDs, which are public program IDs | Not stored on the server |
| Age, diploma, learn-by-doing taps | Her phone, then `/api/plan` | Her and the planner | **Codes derived from them do; the answers never do.** The model sees whether a listed rule applies (`AGE_RULE_MISSED`, `AGE_UNCONFIRMED`, `DIPLOMA_TIMING_UNKNOWN`). It never sees her age or a birth date. These codes are linked to no one, but they are derived from a minor's answers, and they appear in the public `/how` table | Not stored on the server |
| Typed question | Her phone. Matched to a topic there | Her. Also the advisor, only if she taps "Ask an advisor about this" | **Never.** Only a topic code and record IDs | With the page. If sent to an advisor, as for the first name |
| Advisor note | Her phone, then `/api/handoff`, where it is sealed | The advisor, through the inbox with the access code. Every open is recorded | **Never.** The gateway refuses it in any position, and outside the advisor read it prints as "[private]" (AC18, AC19) | As for the first name |
| Saved plan | Her phone (`localStorage` `pathways.saved`): her taps and a timestamp | Her | No | She clears site data |
| Advisor request code | Her phone (`pathways.handoff`, which also keeps the question she sent) and the server's in-memory queue | Her and the advisor | No | As for the first name |
| Model log | `model-calls.log` and the "What the model saw" table | Anyone: it's public at `/how` | It is the record of what the model saw: codes and record text only | Kept for audit. Safe to keep, because it holds no student data by construction |
| Network metadata (IP address, user agent) | Vercel's request logs. No other host sees a request: Rampart Edge is served from this site | Platform operators | No | Platform retention. Until 2026-11-10 a CDN and a model host also saw it |

What isn't collected at all: age or birth date, last name, phone, email, address, school, or any account. The app never asks for them. If she types contact details into the advisor note, Rampart Edge suggests taking them out, because the advisor replies inside Pathways.

## The checks

`npm test` runs 43 checks, one or more per acceptance criterion in `SPEC.md`. They run through the real HTTP API and through the browser's own request builder (`public/client.js`). Every model call is written to `model-calls.log`: the exact text sent, the exact reply and the verdict. A summary at the top lists every replaced call. `npm run verify` adds a smoke test of the running app, or of the live deployment with `BASE_URL` set. `npm run mutate` proves the checks catch what they claim: 41 deliberate breaks, every one caught. Writing it caught one weak test. AC5b had only checked the time zone it was handed, never the app's default (`docs/process.md`, entry 13).

"Today" is the date in Pacific time, so Northline stays open until midnight on Nov 30 (AC5b). To replay a plan on another date, add `?today=2026-12-05` to the URL. The screen then says it's showing a replay.

## System design

How the slice is built today, and how it changes for a statewide pilot of about 100,000 students. The parts that protect students stay the same; the parts around them grow. Where today and production differ, it says which. For example, today the gateway calls the model on every request, and the reviewed reply cache is the production design.

### Requirements

**Functional**
- Move one student to one dated next step from the records, with three ways to act on it: ask an advisor, add it to a calendar, or save the plan.
- Answer questions from the records, with a source ID and check date on every fact. Anything the records can't answer gets "I can't confirm that" and an advisor.
- Hand off to a person with the reasons attached. Crisis words show 988 and 911 on the phone at once.

**Non-functional**
- **Safety:**
  - No name, age, typed text or advisor note reaches the model, provable from the log.
  - No fact appears that isn't in the records.
  - Never "eligible", "accepted", "enrolled", "approved" or "awarded".
- **Latency:** the plan appears in under a second on a school phone on cellular data.
- **Availability:** it works through a model outage. If the model fails, code writes the reply instead.
- **Cost:** model spend is paid per records update, not per student.
- **Auditability:** a state reviewer can check the boundary themselves.

**Constraints**
- No dependencies.
- No accounts, database or paid services in the slice.
- Many users are minors.
- The buyer is a state agency, and the pilot is next month.

### High-level design

```
 Student's phone (browser)                         Server (one stateless function)
 ┌──────────────────────────────┐                  ┌───────────────────────────────────────┐
 │ Name, plan, typed questions  │                  │ planner.js   decides fit, order, dates │
 │ stay here (localStorage)     │  taps + codes    │ topics.js    shared with the browser   │
 │                              │ ───────────────► │ records.js   the only facts            │
 │ client.js                    │  /api/plan       │                    │                   │
 │  · question → topic code     │  /api/answer     │                    ▼ codes + record text
 │  · crisis words → 988 / 911  │                  │ gateway.js ── TRUST BOUNDARY ──────────┐
 │  · fills in {first_name}     │ ◄─────────────── │  · closed allowlist on every payload   │
 │                              │  plan + reply    │  · reply checks; slots → record text   │
 │ Rampart Edge on advisor note │                  │  · template if a reply fails           │
 │                              │  name, note,     │  · model-calls.log                     │
 │                              │  question        │                    │                   │
 │                              │ ───────────────► │ handoff queue ─────┼─► advisor (person) │
 └──────────────────────────────┘  /api/handoff    │                    ▼                   │
                                                   │            model (scripted now)        │
                                                   └────────────────────────────────────────┘
```

Two paths leave the phone, and they never meet:
- **Taps and codes** go to the planner and on to the model.
- **The name, the note and the question** go only to the hand-off queue, which reaches a person and never the model.

Typed text is turned into a topic code before any request is made.

**API contracts**

| Endpoint | Accepts | Returns |
|---|---|---|
| `POST /api/plan` | `answers`: program IDs plus yes, no or not sure taps. Optional `today` for replays | the plan (next step, programs, open questions, road), every fact with its source and check date, and the reply |
| `POST /api/answer` | a `topic` code and record IDs, or a `cannot_confirm` code | the reply with its cited facts, or a can't-confirm message with the advisor |
| `POST /api/handoff` | first name, note, question, reason codes, next-step action | a request code |
| `GET /api/advisor/requests` | the advisor access code | the requests, without notes. 404 unless a code is set on the server, 401 without it |
| `GET /api/advisor/requests/<code>` | the advisor access code | one request with its note, and the open is recorded |
| `POST /api/advisor/requests/<code>/status` | the access code and a status | the request, without its note |
| `GET /api/records` | nothing | the eight records |
| `GET /api/log` | nothing | recent model calls, exactly as sent and received. They hold no student data, so they can be public |

Anything outside these shapes returns 400. A request body over 20 KB is refused.

**Storage**
- The records are a module in code.
- The plan and name live on the device.
- The hand-off queue and the recent-call table live in memory.
- The model log is a file.
- There is no database. Nothing a student enters is stored on the server, except in the hand-off.

### Deep dive

**Data model.** A record has an ID, a name, a check date and keyed facts. A fact is the triple `(record_id, key, exact text)`. The gateway refuses any fact whose three parts don't match `records.js`, so text can't be smuggled in as a fact. The planner's output is codes: three outcomes, three actions and seven reason codes.

**The model contract.** The model gets the payload and must answer as JSON. It points at facts with `{fact:RECORD:key}` slots, and code writes each fact's sentence. The model's own words may not contain a digit, a written number, a month or any word from a fact. It may write `{first_name}`, which the phone fills in.

**Caching (production design).** The payload is built only from taps and record facts, so the input space is finite. There are 205 possible plans per date (counted in `test/helpers.js` as `ALL_ANSWERS`), and each question payload is one of ten topic codes plus record facts. Every reply can be generated once, read by a person, and served from a cache keyed by the payload's hash.

**Errors and retries.** A model reply that fails a check, isn't JSON or times out is replaced with code-written text, and the log marks it "replaced". If the plan request itself fails, the phone keeps her answers and offers "Try again". The advisor send is guarded so a double tap sends once. A reply that arrives after "Start over" is dropped.

**Queues.** The slice has one queue: advisor hand-offs, in memory. In production it becomes a durable queue that feeds the district's case tool. Each reason code routes to an advisor who can answer it.

### Scale and reliability

**Load.** About 100,000 students with a plan and a few questions each is about 400,000 requests a season, peaking in the weeks before deadlines like Nov 30.
- The pages are static files on a CDN.
- The API is one stateless function, so it scales sideways with no shared state on the student path.
- The model is called per records update, not per request: a few thousand calls, each reviewed.

**Failover.** With the reply cache, a model outage changes nothing for students. Without it, the code-written fallback keeps every answer correct, just plainer. Crisis handling and can't-confirm answers never depend on the model.

**Records.**
- Agencies publish programs through a pipeline that stamps every fact with its source and check date.
- Facts older than 45 days are flagged on screen, as they are now, and the owner is alerted.
- A records change regenerates and re-reviews only the replies that cite it.

**Advisors.** Hand-offs land in the district's case tool behind the district's sign-in, so we never collect a student's phone or email. The reply comes back inside Pathways. Crisis hand-offs are flagged for same-day review.

**Minors' data.**
- No account is needed to plan.
- Hand-off records stay in region and encrypted, are deleted 90 days after they're resolved, and are never used for training.
- The model provider is under zero retention and no training.
- The model log holds no student data by construction, so it can be kept for audit.
- FERPA and COPPA review happens before the pilot.

**Monitoring and alerts.**
- The acceptance checks and `npm run mutate` run on every pull request.
- A daily canary student walks the live flow, then searches the log for its own canary name.
- Alerts fire on: any replaced reply in production, any 400 from a payload outside the allowlist (a client bug or a probe), stale records, hand-offs past 2 business days, and a crisis hand-off.

### Trade-offs

| Decision | What we gain | What it costs | Revisit when |
|---|---|---|---|
| Code decides; the model only points at facts | No invented facts, and a boundary you can test | Replies sound plainer than a free-writing model | A state asks for more conversational help. Add it behind the same slots |
| Typed text matched on the phone, never sent | Her words can't leak to the model or the server logs | Pattern matching misses questions it doesn't know; those go to an advisor | Unmatched questions pile up. Grow the topic list from advisor hand-offs |
| Name filled in on the phone | Personal, and the model never knows who she is | The model can't use her name in reasoning (it shouldn't) | Never |
| No database, no accounts | Nothing to breach on the student path; zero setup | No saved plan across devices | Districts want plans to follow a student. Use their sign-in, not ours |
| Scripted model in the slice | Runs anywhere for free, and the tests are deterministic | Says nothing about how a real model behaves | First step after the pilot is approved: a real model behind the gateway, measuring the replace rate |
| Pre-review every reply | Students never see unreviewed model text | Review work for each records update | Records change faster than people can review. Review only replies whose cited facts changed |
| Zero dependencies | `git clone` and run, nothing to audit | Hand-built UI and a test runner instead of a framework | The team grows past a few people |

## What I left out, and why

- **A real model.** The slice is about the boundary and the checks. A real model goes behind the same gateway, and the first job after that is measuring how often its replies get replaced.
- **Spanish and other languages.** The reply check needs a word list per language. I'd rather ship that tested than half-done.
- **Real application links.** The records don't include any, and a made-up link is exactly the claim this slice exists to prevent.
- **Marcus.** Out of scope by the brief (see Section A for what his branch would need).

## Rough edges

- Rampart Edge is about 9 MB of engine and model, served from this site and cached after the first load. If it isn't ready in about 4 seconds, the inbox uses built-in patterns for phone numbers and emails, and the student's note goes as typed.
- The advisor queue and the "What the model saw" table are in memory on each server, so on the live site a request can be missing from the inbox if a different server instance answers. The full log from the test run is `model-calls.log`.
- The topic matcher is a list of patterns. A question it doesn't recognize goes to an advisor, which is safe but sometimes unhelpful.
- ADV-01 has no check date in the records ("n/a"), so its source line says so.
- The screens are checked by hand and through `public/client.js`. There's no automated browser test, to keep the zero-install promise.
