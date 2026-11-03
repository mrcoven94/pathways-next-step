// A scripted stand-in for a language model. Not AI. It reads the prompt text the way a real
// model would, and writes warm wording from the facts it was handed. Swapping in a real model
// means replacing `complete`; the gateway's checks stay the same.

export const MOCK_MODEL_NAME = 'scripted-demo-model (not a real AI)';

function payloadFrom(prompt) {
  return JSON.parse(prompt.slice(prompt.indexOf('PAYLOAD\n') + 'PAYLOAD\n'.length));
}

// The headline already says what to do and by when. The message adds what she'd want to know next.
// Facts are slots; code writes their wording from the records.
function explainPlan(p) {
  const { action } = p.next_step;
  if (action === 'apply_by_deadline' || action === 'ask_advisor_then_apply') {
    return { text: '{first_name}, {fact:PRG-02:paid} Its deadline is the first on your road.' };
  }
  return { text: "{first_name}, {fact:AID-A:how_to_apply} That's how you apply for the Evergreen Opportunity Grant. {fact:AID-A:basis} {fact:AID-A:amount}" };
}

function answerTopic(p) {
  const slots = p.facts.map((f) => `{fact:${f.record_id}:${f.key}}`).join(' ');
  const open = p.open.includes('DIPLOMA_TIMING_UNKNOWN') ? " When you need it by is something the records can't confirm, so ask an advisor." : '';
  return { text: `{first_name}, ${slots}${open}` };
}

export const mockModel = {
  name: MOCK_MODEL_NAME,
  async complete(prompt) {
    const p = payloadFrom(prompt);
    const reply = p.task === 'explain_plan' ? explainPlan(p) : answerTopic(p);
    return JSON.stringify(reply);
  },
};
