# Agents: start here

This repo is a small slice of Pathways (CampusEvolve) for one persona: Dani, 17, choosing between the Northline Electrical Apprenticeship and community college. **SPEC.md is the contract.** Read it before writing code. If the code and SPEC.md disagree, the code is wrong.

## Rules that never bend

- **Grounded or silent.** Only `src/core/records.js` may state facts. Anything else is "I can't confirm that" plus the advisor hand-off.
- **Code decides, the model words it.** Decisions live in `src/core/planner.js` and `src/core/topics.js`. Never move a decision into a prompt.
- **Nothing about a student reaches the model.** Every model call goes through `callModel` in `src/core/gateway.js`, which accepts only a closed set of strings. Never add a field to a payload without adding it to the schema there, and never add a field that carries typed text, a name or an age. Never open a sealed note anywhere but the advisor read path in `src/app.js`.
- **Never "eligible", "accepted", "enrolled", "approved" or "awarded".** A saved plan is never an application.
- **No dependencies, no paid services, no accounts.** `npm start` and `npm test` must work right after `git clone`.

## Map

| Path | What it is |
|---|---|
| `src/core/records.js` | The eight synthetic records. Canonical fact text. |
| `src/core/planner.js` | Every decision: which questions to ask, fit, ordering, deadlines, staleness, escalations. |
| `src/core/topics.js` | Typed question → topic code. Runs in the browser. Crisis words first, then unknowns. |
| `src/core/gateway.js` | Payload allowlist, reply checks, template fallback, `model-calls.log`. |
| `src/core/mock-model.js` | The scripted stand-in model. Not AI. |
| `src/core/private.js` | The sealed note. Prints as "[private]"; only the advisor read opens it, and every open is recorded. |
| `src/core/templates.js` | Code-written replies and every "can't confirm" answer. |
| `src/app.js` | HTTP API and static files. `api/index.js` wraps it for Vercel. |
| `public/client.js` | What the browser sends, without the DOM, so tests run the page's own logic. |
| `public/app.js` | The screens. |
| `public/advisor.js`, `public/advisor-client.js` | The advisor inbox at `/advisor`. Loads nothing from another site. No sign-in: it reads the requests sent with this browser's inbox key (`public/inbox-key.js`). |
| `public/rampart.js`, `public/vendor/rampart/` | Rampart Edge, served from this site. Rebuilt only by `scripts/vendor-rampart.mjs`; never edit the vendored files by hand. Runs in the browser only, never on the server. |
| `test/` | One test per acceptance criterion in SPEC.md, named `AC<n>`. |
| `docs/process.md` | Every time a person or a check corrected the AI. Append, never rewrite. |

## How work ships

1. Write the acceptance check first, as a test named for its SPEC.md criterion. Watch it fail.
2. Make it pass with the smallest change. Keep decisions in code.
3. Run `npm run verify` (tests plus a live smoke test of the app).
4. Look at the change in a browser at 375px wide.
5. Open a pull request using the template. Changes to the gateway, planner, topics or anything that touches student data get an independent model review (a different model from the one that wrote the code), and the PR says what it found and what was fixed or rejected.
6. Merge to `main`. Vercel deploys from GitHub; never deploy from a laptop.
7. Run `BASE_URL=<production url> npm run verify` and open the live page. It isn't done until the live URL works.
8. If someone or something corrected the AI along the way, add it to `docs/process.md`.

## Writing

Plain words a 17-year-old reads easily. No em dashes, no italics, no filler. Talk to her like a capable adult.
