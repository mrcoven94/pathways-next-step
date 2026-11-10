# Process log

A running record of moments where a person or a check corrected what an AI tool produced. These entries are written as the work happens, not reconstructed afterward. The README's AI Usage Log picks from here.

Tools: Claude Code (Opus 5.5) as the architect and builder. A Claude subagent read the design systems of two earlier products. Codex (Sol 6.1) gave the independent code critique. Critic subagents ran the design review.

## 1. The name question (grilling, before any code)

- **Asked:** Claude interviewed David on the design ("grill me") before writing the spec.
- **AI proposed:** Never ask Dani's name at all. Fewest fields, smallest risk.
- **What David did:** Overruled it. "Name can be asked, so it's personal, just ensure it's protected."
- **What changed:** The name stays on the device and goes to the human advisor. The model never sees it. The model writes `{first_name}`, the browser fills it in after the reply returns, and a canary test proves the name is missing from `model-calls.log`.
- **Why it matters:** Avoiding the data was the lazy safe answer. A planner that won't use a teen's name feels like a form. The real requirement was to protect the name, not to avoid it.

## 2. Rampart Edge: a real PII model, demoted to the third layer

- **Asked:** David asked whether a real personal-info filter (Rampart Edge from National Design Studio) could guard the boundary instead of a hand-built rule.
- **AI found:** Claude read the release notes. On name-only messages it blocks 49.6%. On street addresses it blocks 48.2%.
- **Decision:** Keep the structural boundary (typed text never enters a model payload, and the payload accepts only a closed set of strings). Rampart runs in the browser as a kind nudge before Dani submits text. A detector that misses half of names can't be the thing we promise a state agency.

## 3. "Eligibility" (grilling)

- **Asked:** Claude proposed escalation paths for unknowns.
- **What David did:** Restated the brief's rule that a specific person's eligibility is unknown.
- **What changed:** Claude's design said "code decides eligibility," so the planner would have told Dani she was eligible once she tapped yes on age and diploma. That is still a claim about one person's eligibility, and only an advisor can make it. The code now has three outcomes only: `fits_listed_rules`, `misses_a_listed_rule` and `unknown`. A test fails if any reply claims she is eligible, accepted, enrolled, approved or awarded.

## 4. A skill that didn't fit

- **Asked:** "Use pstack."
- **AI did:** Loaded the `setup-pstack` skill, which writes a Cursor model-routing config.
- **Decision:** Skipped it. It doesn't apply to this repo. pstack here means the delivery standard: a spec before code, a verify script and CI, a PR with a review section, and a check on the live URL before calling it done.

## 5. "[removed]" in her own chat (David, after the first build)

- **AI built:** Rampart Edge ran on the question box and replaced detected names and phone numbers with "[removed]" in the chat thread, with a note saying it took them out.
- **What David said:** "Good UX should not interfere with privacy, both can exist. The [removed] is not helpful."
- **Why he was right:** The question never leaves her phone; only a topic code does. Mangling her own words on her own screen protected nothing and made the product feel like it was scolding her.
- **What changed:** Her words show as typed. Rampart runs only where text actually leaves the device (the advisor note), and there it suggests, it never edits.

## 6. System language on a teenager's screen (David)

- **AI wrote:** Status lines like "Fits what they list. An advisor confirms the rest." and "Nothing listed rules you out." Accurate to the code's three outcomes, but written for the engineer, not for Dani.
- **What changed:** Every status is rewritten per case in plain words, and the code's outcome names stay in the code.

## 7. Asking her birthday before knowing who she is (David)

- **AI built:** The flow opened with "Will you be 18 by March 1, 2027?", assuming every user is Dani and already weighing Northline.
- **What David said:** "How do we know what Dani is pursuing before we engage with them? We are asking their date and whatnot without knowing anything about who is using."
- **What changed:** The flow now asks where she is and what she's weighing first. The age and diploma questions only appear if she picks Northline, with the reason attached. Someone who isn't finishing high school is told plainly that this preview is built for students and offered an advisor.

## 8. An independent model broke my validator (Sol 6.1, via Codex)

- **Asked:** A second model (Sol 6.1, through Codex, read-only) to review the branch against SPEC.md and try to break the boundary.
- **What I had shipped:** A reply validator that checked each number in the model's text by looking for it as a substring of the cited facts, plus a short blacklist of status words.
- **What Sol produced:** Four replies that passed as "used": "Applications close Dec 30, 2026." (30 and 2026 both appear in the real date), "Northline pays 18 USD an hour." (the 18 came from the age rule), "You qualify for Northline." (not on the blacklist) and "Northline provides free housing." (no number, so nothing to check). It also found that `k in keys` accepts inherited names like `constructor`, so a field called `constructor` carrying a name would have reached the model.
- **What changed:** Dates must match a cited fact exactly. Numbers must appear together with the word after them. The reply's vocabulary is closed: every word must come from a given fact, a record name or a short list of connecting words, with negations left out on purpose. The allowlist uses `Object.hasOwn`. All five cases are now tests, and a mutation run (undoing each fix in a scratch copy) turns the matching test red.
- **What I rejected:** Nothing material. I declined to make the vocabulary check the only defense. It still can't catch allowed words recombined into a false sentence, and the README says so.
- **Also from the same review, fixed:** crisis words in the name field were not caught, and a crisis note still got sent; questions like "Will Northline accept me" fell through to a model answer; a passed Cascade start date could become the calendar target; the advisor hand-off dropped the question that triggered it; the tests checked a helper rather than the browser's own request builder (now `public/client.js`, shared by the page and the tests).

## 9. The second review: stop patching the word list, change who writes facts (Sol 6.1)

- **Asked:** A fresh Sol session to try to break the fixes from entry 8 again, with new variants.
- **What Sol produced:** Four more replies marked "used" by the closed-vocabulary validator:
  - "Applications close Mar 1, 2027." A real date pinned to the wrong event.
  - "Northline has evening online classes." Cascade's words, borrowed for Northline.
  - "Northline starts at 5% of journey-level wage." "5%" is a substring of "55%".
  - "Northline is paid one USD." A number written as a word.
  It also found:
  - "I don't want to live" typed with a phone's curly apostrophe slipped past crisis detection.
  - Three more unknown phrasings fell through to model answers.
  - A Jan 6, 2027 question about Northline was answered as if Northline started then.
  - A late reply could land in a new session after Start over.
  - A double tap could send two advisor requests.
- **My first instinct (rejected):** Add these cases to the word list and the number rules. Sol's point, which I agreed with, was that any rule over free prose loses this race: real words and real dates can always be recombined into a false sentence.
- **What changed instead:** The model no longer writes facts. It points at them with slots like `{fact:PRG-02:paid}`, and code writes each fact's sentence from the records. The model's own words may greet and connect, but may not contain a digit, a written number, a month or any word from a fact. A fact can't be pinned to the wrong program, because the sentence that states it is written by code from that program's record.
- **Kept from the reviewer, fixed:**
  - Apostrophe normalizing and "do not want to" for crisis words.
  - Program-and-year date matching.
  - Sources on the one code-written answer that states a fact.
  - The diploma caveat kept in the fallback reply.
  - A session counter that drops late replies.
  - A guard against double sends.
- **Proof:** 21 checks pass. None of 22 honest topic answers are rejected. Removing the digit rule, letting fact words back into prose, or dropping the apostrophe normalizing each turns a named test red.
- **What's left:** Prose made only of connecting words and program names can still be false ("Cascade is first on your road"). The headline, the order of programs and the road are all drawn by code, so a sentence like that would contradict the screen around it. The README names this.

## 10. A green build that didn't work (verification, before merge)

- **What happened:** The first Vercel preview built "Ready" but every request returned 500. Vercel's zero-config detection had picked `public/app.js`, the browser script, as a Node server entrypoint, and never built `api/index.js`.
- **How it was caught:** By checking the preview's real responses before merging, not by trusting the build status. Building it locally (`vercel build`) showed the wrong entrypoint.
- **What changed:** `vercel.json` pins `"framework": null`, so `api/index.js` is the function and `public/` is served as static files. The preview then passed: pages 200, the gateway source not served (404), and the plan API returning the right step.

## 11. Making the question box feel like a conversation (David)

- **Asked by David:** "Make the search more interactive, and some typing indicator like iMessage." He also showed a screenshot where the student's name opened every single reply.
- **What changed:**
  - Suggestions filter as she types, with her words in bold. They are scoped to the programs she picked, and the arrow keys work.
  - A line under the box says, as she types, whether the records answer this or an advisor will. That's matched on the phone too.
  - A typing indicator plays for a short beat while the answer loads.
  - Her name opens only the first reply.
- **Kept honest:** A new test (AC15) checks that every suggested question routes to an answer from the records or to an advisor, so a suggestion can't lead to a dead end.

## 12. A rubric grader caught claims the build didn't back up (independent Claude grader)

- **Asked:** A fresh agent to grade the submission against Provn's rubric, given only the challenge, the repo and the live URL, not my view of it. It scored 80.3 out of 100.
- **What it caught that I had missed:**
  - The README said the planner "takes Marcus's inputs". It doesn't; the live API returns 400.
  - "Today" was the UTC date, so Northline would show as closed from 4pm Pacific on Nov 30, its last day.
  - The scripted model's own sentence "Its deadline is the first on your road" was a claim the validator let through.
  - The mutation claim had no script behind it, the check counts were stale, the spec had drifted from the flow, and nothing said the build ran well past 30 minutes.
  - Section B led with an AI-versus-AI story instead of my own redirections.
- **What changed:**
  - The Marcus line now says what his branch would need.
  - "Today" is computed in Pacific time, with a test at 11:30pm on Nov 30 (AC5b).
  - The scripted prose makes no claims.
  - `npm run mutate` breaks nine guards and confirms each named check fails, and it runs in CI.
  - `model-calls.log` opens with a summary of every replaced call.
  - SPEC.md is updated in place, with "(amended)" marks.
  - The README has an honest "How long it took", and Section B leads with my own three redirections.
- **What I didn't change:** the scope. The slice ran end to end at 09:10, 23 minutes after the repo started. Everything after came from reviews I'd have to answer for in front of a state agency, and the README says so instead of hiding it.

## 13. The mutation script caught a test that tested the wrong thing

- **What happened:** Extending `npm run mutate` to every acceptance criterion, one mutation survived. It changed the app's default time zone from Pacific to UTC, and AC5b still passed.
- **Why:** AC5b called `todayIn('America/Los_Angeles', ...)` with the time zone spelled out, so it proved the function works for Pacific when asked. It never proved the app asks for Pacific. That default is exactly the line that keeps Northline open on its last evening.
- **What changed:** AC5b now uses the app's own default. The mutation is caught, and every acceptance criterion has a guard that `npm run mutate` breaks on purpose.

## 14. The plan had two holes before any code was written (Sol 6.1, plan review, 2026-11-10)

- **Asked:** Sol 6.1 on high, read only, to attack the plan for the private note before a line of it was built: seal the note, add an advisor read path, leave the gateway alone, and test with a spy model.
- **What Sol produced:** Two reproduced leaks in code the plan said was fine. First, the gateway checked the object it was handed and then serialized it, so an object with a hidden `toJSON` passed the check and wrote the sentinel into the prompt. Second, posting a body that isn't JSON to `/api/handoff` returned the parser's error, which quotes the body, so the note came back in an error message. It also flagged that two requests could share a four-character code, that the plan broke AC8 without saying so, and that loading a detector from a CDN on a page holding the access code hands that page to a third party.
- **What changed:** The gateway now checks and sends a plain copy. Parser errors get a fixed reply. Codes are unique. AC8 reads the note the way an advisor does. The inbox loads nothing from another site, keeps the code in memory only, and a content security policy enforces it. Each of the five is a check, and each has a mutation.
- **What I rejected:** Dropping the contact-details switch from the inbox. It stays, on built-in patterns, because hiding a phone number until the advisor asks for it costs nothing and needs no outside code.
- **What I got wrong myself:** My first version of the hidden-getter check expected the gateway to refuse a field that answers truthfully once and lies afterwards. The gateway reads it once, for the copy it sends, so the right result is a clean call. The test was wrong, not the code.
- **What the mutation run caught:** One of the new mutations survived on the first run. It put the parser's error message back in the reply, and AC18 still passed, because the parser quotes only the first ten characters of what it read and the check looked for the whole sentinel. A partial echo of a note is still a leak. AC18 now requires the reply to be the fixed sentence, word for word.

## 15. The diff review: errors that quote what they refuse (Sol 6.1, 2026-11-10)

- **Asked:** Sol 6.1 on high, read only, to review the finished branch. The three-model panel was also due, but OpenCode Go had reached its monthly usage cap, so Sol reviewed alone.
- **What Sol produced:** The gateway refused the note in every position, and then quoted it in the error: `task: "<the note>" is not an allowed task`. AC19 only checked that an error was thrown. It also found that signing out of the inbox left the last note on the page and let a slow answer redraw it, that a local number like 555-0147 was shown unmasked, and that two replies in AC18 were never scanned for the sentinel.
- **What changed:** Rejections say where the problem is and never what was there. AC19 reads every rejection for the sentinel. Sign-out clears the page and drops answers that arrive late. The phone pattern covers local and international numbers, with dates and other numbers left alone. AC18 scans every reply.
- **What I didn't change:** The queue is still in memory, so on the live site a request can be missing from the inbox. That needs storage, which the spec rules out, and it is written up as its own decision.

## 16. "Incorporate Rampart, serve it from our own site" (David, 2026-11-10)

- **What I had shipped:** An inbox that hid phone numbers and emails with built-in patterns, and a note in the README that Rampart Edge would come to the inbox later. Sol had flagged the CDN import as third-party code on a page that holds notes, and I had answered by leaving the detector out.
- **What David said:** Rampart is key, and it should be served from our own site. Leaving it out fixed the third-party problem by dropping the feature.
- **What changed:** The package, its engine and its model are vendored into `public/vendor/rampart/` with a manifest of sizes and hashes, and both pages load that copy. The inbox hides every kind Rampart finds, names included. The policy on the inbox gained one allowance, for compiling WASM. `npm test` now runs the real model with no install.
- **The line I kept:** The server never runs the detector on a note. It runs in the student's browser and the advisor's browser, the two places that already hold the note in the clear. A model on the server reading notes, however small, is the thing this task rules out.
- **What Sol 6.1 found in the diff:** Four things, all fixed. With the real model, "My ID number is 1234567890" came back as an ID inside a phone number, the merge kept only the phone, and switching phones on showed the ID. A merged span now remembers every kind in it and shows only when all are on. The 4 second fallback covered loading but not reading, so a stalled read left the advisor on "Opening". The model test let any request that wasn't for a file through to the network, so a stray call to a model host would have passed; it now fails on any such request. And the rebuild script trusted whatever the registry served under the pinned version; it now checks the registry's checksum for each package before copying anything.

## 17. "Remember no passwords" (David, 2026-11-10)

- **AI built:** An advisor inbox behind a shared access code, set as a server variable and saved in the vault. It answered a real risk: the live site is public, so an open inbox shows any visitor's note to every other visitor.
- **What David said:** "Remember no passwords, so I don't know why the advisor inbox has a passcode."
- **What I built next:** A way to keep the protection with nothing to type. Each browser made a random key, sent it with a hand-off, and could read only the requests sent with it. Sol 6.1 reviewed it, found no way for one browser to read another's note and six gaps around that (sample requests crowding real ones out of the queue, a key lost when storage was off, a reused request code, and three weak spots in my checks), and all six were fixed.
- **What David said then:** "You can simply open the inbox, it is public, but this is all a test, we don't have real students. We don't need to make a random inbox key, but we can have that as a note in the guide for why it's a good idea."
- **Why he was right:** I was protecting data that does not exist. The reviewers are the audience, the students are invented, and every line of key handling was a line they would have to read to trust the part that matters, which is that the note never reaches a model. The right size for a demo is an honest label, not a mechanism.
- **What changed:** The inbox is open. The planner's note box and the foot of the inbox say it is public and that nothing real should be typed. The key is out of the code and into the walkthrough as the next step for a public demo. Three things from that work stayed because they are about the queue, not the key: the invented samples sit apart from it, it has a ceiling, and a request code is never given out twice.
- **What I got wrong in the process:** I changed the code before the checks, twice. The checks were rewritten in the same sitting and the mutation run covers them, but the order in AGENTS.md is check first.

## 18. "We should have reporting for Rampart" (David, 2026-11-10)

- **What David said:** Look at the Front Door model report. This slice should report on Rampart and its checks the same way.
- **What was built:** `/report`, a public page that reads only JSON: what the detector caught, partly caught and missed on 40 invented notes, the private notes it passes, each check that guards the note, and every mutation aimed at it. An Opus agent built it from Front Door's report as the model.
- **What Sol 6.1 found in it:** Six things, all fixed. Counts from the data went into the page unescaped. A mutation run that crashed partway left the last clean result in place, so the page would have kept saying everything was caught. A note with a missing fixture was labelled "wrongly blocked". New results could be paired with old note text. One sentence said details stay hidden when the detector misses some. And the checks proved the totals add up, not that the page shows the right number in the right column.
- **What changed:** Every value is escaped and counts are validated. The mutation script writes its file as it goes and marks it finished only at the end, and the page shows an unfinished run as unfinished. Results carry the hash of the notes they measured. The checks now read the rendered table.

## 20. "An inbox is useless unless they can respond" (David, 2026-11-10)

- **AI built:** An inbox where an advisor could open a request, read the note and set a status. The planner told the student "they answer within 2 business days", and nothing in the app could answer her.
- **What David said:** "An inbox is useless unless they can respond, right? Like, what is this?" Then: it needs to look better, it should simulate conversations, and a reviewer needs a panel to reach the model log, the report, the repo and the planner.
- **Why he was right:** The task says the note must be available "through the intended advisor workflow". Reading without answering is half a workflow. I had met the letter of the criterion and missed what an advisor is for.
- **What changed:** The advisor replies on the opened request and the student sees the answer on her own screen. A reply is sealed like the note, since it can quote it, and a sentinel check (AC25) holds it out of every model prompt, log and error. The inbox was redesigned through four rounds with a critic, the samples carry an invented conversation, and a collapsible panel links the pages a reviewer needs.
- **What was shipped fast:** David asked for this to ship at once, so it merged on green checks with the independent review running alongside, and the review's findings follow in their own change.
- **What Sol 6.1 found after the merge:** Seven things, none a path to a model. Five were fixed the same day: a student's crisis follow-up could leave a stale status and no warning in an open inbox; a student could fill the thread and block the advisor; opening a request with no note counted as a note open; a thread with only student messages read as answered; and the record of opens grew without limit. Two were left: anyone can read or answer any request, because the demo inbox is public by decision, and a retried send can duplicate a message.

