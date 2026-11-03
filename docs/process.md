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
