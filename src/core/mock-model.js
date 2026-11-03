// A scripted stand-in for a language model. Not AI. It reads the prompt text the way a real
// model would, and writes warm wording from the facts it was handed. Swapping in a real model
// means replacing `complete`; the gateway's checks stay the same.

import { sayFact } from './templates.js';

export const MOCK_MODEL_NAME = 'scripted-demo-model (not a real AI)';

function payloadFrom(prompt) {
  return JSON.parse(prompt.slice(prompt.indexOf('PAYLOAD\n') + 'PAYLOAD\n'.length));
}

const textOf = (p, id, prefix) => p.facts.find((f) => f.record_id === id && f.text.startsWith(prefix))?.text;
const after = (text, prefix) => text.slice(prefix.length);

function explainPlan(p) {
  const { action, record_id } = p.next_step;
  if (action === 'apply_by_deadline') {
    const close = after(textOf(p, 'PRG-02', 'Applications close '), 'Applications close ');
    return {
      text: `{first_name}, apply to the Northline Electrical Apprenticeship before applications close ${close}. It's paid, and it starts at 55% of journey-level wage.`,
      cites: ['PRG-02'],
    };
  }
  if (action === 'ask_advisor_then_apply') {
    const close = after(textOf(p, 'PRG-02', 'Applications close '), 'Applications close ');
    const open = p.programs.find((x) => x.record_id === 'PRG-02').reasons.length;
    return {
      text: `{first_name}, Northline applications close ${close}. There ${open === 1 ? 'is one thing' : 'are a couple of things'} the records can't confirm for you, so ask an advisor first. They answer within 2 business days.`,
      cites: ['PRG-02', 'ADV-01'],
    };
  }
  const deadline = textOf(p, 'PRG-03', 'Priority deadline ');
  const start = textOf(p, record_id, 'Next start ');
  const when = record_id === 'PRG-03' && deadline ? ` Riverbend's priority deadline is ${after(deadline, 'Priority deadline ')}.`
    : start ? ` Cascade's next start is ${after(start, 'Next start ')}.` : '';
  return {
    text: `{first_name}, start the FAFSA or the state aid application. That's how you apply for the Evergreen Opportunity Grant.${when}`,
    cites: ['AID-A', record_id],
  };
}

function answerTopic(p) {
  const open = p.open.includes('DIPLOMA_TIMING_UNKNOWN') ? " When you need it by is something the records can't confirm, so ask an advisor." : '';
  const said = p.facts.map(sayFact).join(' ').replace(/^(The|You|An|They|Pay) /, (w) => w.toLowerCase());
  return { text: `{first_name}, ${said}${open}`, cites: [...new Set(p.facts.map((f) => f.record_id))] };
}

export const mockModel = {
  name: MOCK_MODEL_NAME,
  async complete(prompt) {
    const p = payloadFrom(prompt);
    const reply = p.task === 'explain_plan' ? explainPlan(p) : answerTopic(p);
    return JSON.stringify(reply);
  },
};
