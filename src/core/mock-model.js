// A scripted stand-in for a language model. Not AI. It reads the prompt text the way a real
// model would, and writes warm wording from the facts it was handed. Swapping in a real model
// means replacing `complete`; the gateway's checks stay the same.

import { byRecord } from './templates.js';

export const MOCK_MODEL_NAME = 'scripted-demo-model (not a real AI)';

function payloadFrom(prompt) {
  return JSON.parse(prompt.slice(prompt.indexOf('PAYLOAD\n') + 'PAYLOAD\n'.length));
}

const textOf = (p, id, prefix) => p.facts.find((f) => f.record_id === id && f.text.startsWith(prefix))?.text;

function explainPlan(p) {
  const { action } = p.next_step;
  if (action === 'apply_by_deadline') {
    const close = textOf(p, 'PRG-02', 'Applications close').replace('Applications close ', '');
    return {
      text: `{first_name}, here's your move: apply to the Northline Electrical Apprenticeship. Applications close ${close}, so it comes first. It's paid, and it starts at 55% of journey-level wage.`,
      cites: ['PRG-02'],
    };
  }
  if (action === 'ask_advisor_then_apply') {
    const close = textOf(p, 'PRG-02', 'Applications close').replace('Applications close ', '');
    return {
      text: `{first_name}, Northline is worth a real look, and applications close ${close}. A couple of things about you aren't in the records, so ask an advisor first. They answer within 2 business days.`,
      cites: ['PRG-02', 'ADV-01'],
    };
  }
  const start = textOf(p, 'PRG-01', 'Next start').replace('Next start ', '');
  return {
    text: `{first_name}, here's your move: start the FAFSA or the state aid application. That's how you apply for the Evergreen Opportunity Grant. Cascade's next certificates start ${start}.`,
    cites: ['AID-A', 'PRG-01'],
  };
}


function answerTopic(p) {
  const lines = byRecord(p.facts);
  const open = p.open.includes('DIPLOMA_TIMING_UNKNOWN') ? " The records don't say when you need it by, so that one's for an advisor." : '';
  return { text: `{first_name}, here is what the records say. ${lines.join(' ')}${open}`, cites: [...new Set(p.facts.map((f) => f.record_id))] };
}

export const mockModel = {
  name: MOCK_MODEL_NAME,
  async complete(prompt) {
    const p = payloadFrom(prompt);
    const reply = p.task === 'explain_plan' ? explainPlan(p) : answerTopic(p);
    return JSON.stringify(reply);
  },
};
