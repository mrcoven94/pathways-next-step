// Starts the real HTTP app on a spare port. Tests talk to it the way the browser does.

import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.js';
import { askRequest } from '../public/client.js';
import { mockModel } from '../src/core/mock-model.js';
import { STUDENT_PROGRAMS, ANSWERS, LEANS, questionsFor } from '../src/core/planner.js';

export const LOG_FILE = fileURLToPath(new URL('../model-calls.log', import.meta.url));
export const TODAY = '2026-11-03';

export async function startApp({ model = mockModel, today = TODAY } = {}) {
  const app = createApp({ model, logFile: LOG_FILE, today: () => today });
  const server = createServer(app.handle);
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;

  const post = async (path, body) => {
    const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };

  return {
    app,
    base,
    post,
    plan: async (answers, asOf) => (await post('/api/plan', { answers, ...(asOf && { today: asOf }) })).body,
    // The browser's own request builder (public/client.js): the question is matched on the phone.
    ask: async (question, considering) => {
      const req = askRequest(question, considering);
      if (req.crisis) return { kind: 'crisis' };
      return (await post('/api/answer', req.body)).body;
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

// Dani is weighing Northline and community college. Tests pass only the taps that change.
export const dani = (taps = {}) => ({ considering: ['PRG-02', 'PRG-01', 'PRG-04'], ...taps });

// Every valid set of taps: each non-empty mix of programs, times every answer to the questions it asks.
const subsets = STUDENT_PROGRAMS.reduce((acc, id) => [...acc, ...acc.map((s) => [...s, id])], [[]]).filter((s) => s.length);
const OPTIONS = { age18: ANSWERS, diploma: ANSWERS, lean: LEANS };
export const ALL_ANSWERS = subsets.flatMap((considering) =>
  questionsFor(considering).reduce((combos, q) => combos.flatMap((c) => OPTIONS[q].map((v) => ({ ...c, [q]: v }))), [{ considering }]),
);

/** A stand-in for a model that misbehaves in one specific way. */
export const badModel = (name, reply) => ({ name: `bad-model:${name}`, complete: async () => (typeof reply === 'string' ? reply : JSON.stringify(reply)) });
