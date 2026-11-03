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
