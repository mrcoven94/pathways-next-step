// Starts the real HTTP app on a spare port. Tests talk to it the way the browser does.

import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.js';
import { matchQuestion } from '../src/core/topics.js';
import { mockModel } from '../src/core/mock-model.js';

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
    // Mirrors public/app.js: the question is matched on the device and only codes are sent.
    ask: async (question) => {
      const m = matchQuestion(question);
      if (m.kind === 'crisis') return { kind: 'crisis' };
      if (m.kind === 'cannot_confirm') return (await post('/api/answer', { cannot_confirm: m.code })).body;
      return (await post('/api/answer', { topic: m.topic, record_ids: m.record_ids })).body;
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

export const ALL_ANSWERS = ['yes', 'no', 'unsure'].flatMap((age18) =>
  ['yes', 'no', 'unsure'].flatMap((diploma) => ['earn', 'classes', 'unsure'].map((lean) => ({ age18, diploma, lean }))),
);

/** A stand-in for a model that misbehaves in one specific way. */
export const badModel = (name, reply) => ({ name: `bad-model:${name}`, complete: async () => (typeof reply === 'string' ? reply : JSON.stringify(reply)) });
