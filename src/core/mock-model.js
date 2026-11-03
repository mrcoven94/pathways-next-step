// A scripted stand-in for a language model. Not AI. It reads the prompt text the way a real
// model would, and writes warm wording from the facts it was handed. Swapping in a real model
// means replacing `complete`; the gateway's checks stay the same.

import { sayFact } from './templates.js';

export const MOCK_MODEL_NAME = 'scripted-demo-model (not a real AI)';

function payloadFrom(prompt) {
  return JSON.parse(prompt.slice(prompt.indexOf('PAYLOAD\n') + 'PAYLOAD\n'.length));
}

// The headline already says what to do and by when. The message adds what she'd want to know next.
function explainPlan(p) {
  const { action, record_id } = p.next_step;
  if (action === 'apply_by_deadline') {
    return {
      text: "{first_name}, Northline is paid, and it starts at 55% of journey-level wage. It's the first deadline on your road, so it comes first.",
      cites: ['PRG-02'],
    };
  }
  if (action === 'ask_advisor_then_apply') {
    const open = p.programs.find((x) => x.record_id === 'PRG-02').reasons.length;
    return {
      text: `{first_name}, Northline is paid, and it starts at 55% of journey-level wage. Get the ${open === 1 ? 'question' : 'questions'} below answered before you apply. An advisor answers within 2 business days.`,
      cites: ['PRG-02', 'ADV-01'],
    };
  }
  return {
    text: "{first_name}, the FAFSA or state aid application is how you apply for the Evergreen Opportunity Grant. It's income-based, and the award amount varies.",
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
