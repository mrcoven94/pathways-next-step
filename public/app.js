// Dani's planner in the browser. Her name and anything she types stay here:
// questions are matched on this phone and only topic codes go to the server.

import { matchQuestion, isCrisis } from '/core/topics.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const store = {
  get(key) { try { return JSON.parse(localStorage.getItem(`pathways.${key}`)); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(`pathways.${key}`, JSON.stringify(value)); } catch {} },
  clear() { try { ['name', 'saved', 'handoff'].forEach((k) => localStorage.removeItem(`pathways.${k}`)); } catch {} },
};

const state = { name: store.get('name') ?? '', answers: {}, step: 0, result: null, thread: [], handoff: store.get('handoff') };

const QUESTIONS = [
  {
    key: 'age18',
    title: 'Will you be 18 by March 1, 2027?',
    why: 'Northline starts that day, and applicants must be 18 by the program start date.',
    source: ['PRG-02', '2026-10-20'],
    options: [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']],
  },
  {
    key: 'diploma',
    title: 'Will you have your diploma or GED by then?',
    why: 'Northline requires an HS diploma or GED.',
    source: ['PRG-02', '2026-10-20'],
    options: [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']],
  },
  {
    key: 'lean',
    title: 'Do you want to start earning right away, or start with classes?',
    why: 'Either answer works. It decides which path we put first.',
    options: [['earn', 'Earn right away'], ['classes', 'Classes first'], ['unsure', 'Not sure yet']],
  },
];

const OPEN_COPY = {
  AGE_UNCONFIRMED: 'Whether you’ll be 18 by Mar 1, 2027. Northline says applicants must be 18 by the program start date.',
  DIPLOMA_TIMING_UNKNOWN: 'When you need your diploma or GED. Northline requires one, but the records don’t say if you need it when you apply or when you start.',
  AGE_RULE_MISSED: 'Northline’s Mar 1, 2027 start won’t fit, because applicants must be 18 by then. The records don’t list the next start.',
  DEADLINE_PASSED: 'Northline applications closed Nov 30, 2026. The records don’t list another round.',
  APPLY_DEADLINE_UNLISTED: 'How and when to apply to Cascade. The records list the Jan 6, 2027 start, but no application deadline.',
};

const STATUS = {
  fits_listed_rules: ['good', 'Nothing listed rules you out'],
  unknown: ['ask', 'Needs an advisor to confirm'],
  misses_a_listed_rule: ['miss', 'A listed rule rules this out for now'],
};

// ---------- dates ----------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmt = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${MONTHS[m - 1]} ${d}, ${y}`; };
const daysUntil = (iso, today) => Math.round((Date.parse(iso) - Date.parse(today)) / 86400000);
const source = (id, checked) => `<span class="source">${esc(id)} · checked ${esc(fmt(checked))}</span>`;

// The model writes {first_name}; her name is filled in here, after the reply comes back.
function withName(text) {
  if (state.name) return text.replaceAll('{first_name}', state.name);
  const t = text.replace(/^\{first_name\},\s*/, '').replace(/,\s*\{first_name\}/g, '').replaceAll('{first_name}', 'you');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ---------- screens ----------
function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  document.body.dataset.screen = id;
  window.scrollTo({ top: 0 });
  const heading = $(`#${id} h1`);
  if (heading && id !== 'start') { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
}

function renderQuestion() {
  const q = QUESTIONS[state.step];
  const el = $('#question');
  el.innerHTML = `
    <nav class="topbar">
      <button class="link" type="button" data-action="back">Back</button>
      <p class="progress" aria-label="Question ${state.step + 1} of 3">
        ${QUESTIONS.map((_, i) => `<span class="${i <= state.step ? 'on' : ''}"></span>`).join('')}
      </p>
    </nav>
    <p class="step-count">${state.step + 1} of 3</p>
    <h1>${esc(q.title)}</h1>
    <p class="why">${esc(q.why)}${q.source ? ` ${source(...q.source)}` : ''}</p>
    <div class="choices" role="group" aria-label="${esc(q.title)}">
      ${q.options.map(([value, label]) => `<button class="choice${state.answers[q.key] === value ? ' picked' : ''}" type="button" data-answer="${value}">${esc(label)}</button>`).join('')}
    </div>`;
  show('question');
}

async function api(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Request failed');
  return res.json();
}

async function makePlan() {
  const el = $('#plan');
  el.innerHTML = `<p class="loading" role="status">Putting your plan together…</p>`;
  show('plan');
  try {
    // ?today=2026-12-05 replays the plan on another date, to see deadlines pass and records go stale.
    const asOf = new URLSearchParams(location.search).get('today');
    state.result = await api('/api/plan', { answers: state.answers, ...(/^\d{4}-\d{2}-\d{2}$/.test(asOf ?? '') && { today: asOf }) });
    renderPlan();
  } catch {
    el.innerHTML = `<h1>That didn’t load.</h1><p class="lede-ink">Your answers are still here. Check your connection and try again.</p><button class="button" type="button" data-action="retry-plan">Try again</button>`;
  }
}

function stepCopy(plan) {
  const { action } = plan.next_step;
  const open = plan.escalations.filter((e) => e.code !== 'STALE_RECORD').length;
  if (action === 'apply_by_deadline') return { title: 'Apply to the Northline Electrical Apprenticeship', datePrefix: 'Applications close' };
  if (action === 'ask_advisor_then_apply') return { title: `Check ${open === 1 ? 'one thing' : open === 2 ? 'two things' : 'a few things'} with an advisor, then apply to Northline`, datePrefix: 'Applications close' };
  return { title: 'Start your FAFSA or state aid application', datePrefix: 'Cascade certificates start' };
}

function calendarDate(plan) {
  return plan.next_step.facts.find((f) => f.date) ?? plan.programs.flatMap((p) => p.facts).find((f) => f.date);
}

function road(plan) {
  const stops = [
    { date: plan.today, label: 'Today', today: true },
    ...plan.programs.flatMap((p) => p.facts.filter((f) => f.date).map((f) => ({ ...f, label: f.text.replace(/ [A-Z][a-z]{2} \d+, \d{4}$/, '') }))),
  ];
  const seen = new Set();
  const unique = stops.filter((s) => { const k = s.date + s.label; return !seen.has(k) && seen.add(k); }).sort((a, b) => a.date.localeCompare(b.date));
  const target = calendarDate(plan)?.date;
  const names = { 'PRG-01': 'Cascade', 'PRG-04': 'Cascade', 'PRG-02': 'Northline' };
  return unique.map((s) => {
    const past = !s.today && s.date < plan.today;
    const who = s.record_id ? `${names[s.record_id] ?? ''} ` : '';
    const label = s.today ? 'Today' : `${who}${s.label.charAt(0).toLowerCase()}${s.label.slice(1)}`.replace('Cascade next start', 'Cascade certificates start').replace('Northline program starts', 'Northline starts');
    return `<li class="${s.today ? 'today' : ''}${s.date === target ? ' target' : ''}${past ? ' past' : ''}">
      <time datetime="${s.date}">${esc(fmt(s.date))}</time>
      <span class="stop">${esc(label)}${past ? ' (closed)' : ''}</span>
      ${s.record_id ? source(s.record_id, s.checked) : ''}
    </li>`;
  }).join('');
}

function programBlock(p) {
  const [tone, words] = STATUS[p.outcome];
  const names = { 'PRG-01': 'Cascade Community College, Medical Assistant Certificate', 'PRG-02': 'Northline Electrical Apprenticeship', 'PRG-04': 'Cascade Community College, IT Support Certificate' };
  return `<article class="program">
    <h3>${esc(names[p.record_id])}</h3>
    <p class="status ${tone}"><span class="dot" aria-hidden="true"></span>${esc(words)}</p>
    <ul class="facts">${p.facts.map((f) => `<li>${esc(f.text)}</li>`).join('')}</ul>
    ${source(p.record_id, p.facts[0].checked)}
  </article>`;
}

function renderPlan() {
  const { plan, summary } = state.result;
  const copy = stepCopy(plan);
  const when = calendarDate(plan);
  const days = when ? daysUntil(when.date, plan.today) : null;
  const open = plan.escalations.filter((e) => OPEN_COPY[e.code]);
  const stale = plan.escalations.filter((e) => e.code === 'STALE_RECORD');
  const saved = store.get('saved');
  const isSaved = saved && JSON.stringify(saved.answers) === JSON.stringify(plan.answers);

  $('#plan').innerHTML = `
    <nav class="topbar">
      <p class="wordmark ink">Pathways</p>
      <button class="link" type="button" data-action="restart">Start over</button>
    </nav>
    <h1>${state.name ? `${esc(state.name)}, here’s` : 'Here’s'} your next step</h1>

    <section class="next" aria-label="Your next step">
      <h2>${esc(copy.title)}</h2>
      ${when ? `<p class="deadline">${esc(copy.datePrefix)} <mark>${esc(fmt(when.date))}</mark>${days > 0 ? `<span class="days">${days} days from today</span>` : ''}</p>${source(when.record_id, when.checked)}` : ''}
      <p class="message">${esc(withName(summary.text))}</p>
      <p class="written">Written by the scripted demo model, then checked against the records by code.</p>
      <div class="actions">
        <button class="button primary" type="button" data-action="calendar">Add ${esc(fmt(when.date).replace(/, \d{4}$/, ''))} to my calendar</button>
        <div class="row">
          <button class="button secondary" type="button" data-action="save">${isSaved ? 'Saved on this phone' : 'Save this plan'}</button>
          <button class="button secondary" type="button" data-action="advisor">Ask an advisor</button>
        </div>
      </div>
      <p class="label">${esc(plan.label)}</p>
    </section>

    ${open.length || stale.length ? `<section class="open" aria-labelledby="open-title">
      <h2 id="open-title">What we can’t confirm yet</h2>
      <ul>
        ${open.map((e) => `<li>${esc(OPEN_COPY[e.code])}</li>`).join('')}
        ${stale.map((e) => `<li>The ${esc(e.record_id)} record is more than 45 days old, so it may have changed.</li>`).join('')}
      </ul>
      <p>An advisor checks these with you. <button class="link" type="button" data-action="advisor">Ask an advisor</button></p>
    </section>` : ''}

    <section class="road-wrap" aria-labelledby="road-title">
      <h2 id="road-title">Your road</h2>
      <ol class="road">${road(plan)}</ol>
    </section>

    <section class="options" aria-labelledby="options-title">
      <h2 id="options-title">Your options</h2>
      ${plan.programs.map(programBlock).join('')}
      <article class="program aid">
        <h3>Evergreen Opportunity Grant (state)</h3>
        <ul class="facts">${plan.aid.map((f) => `<li>${esc(f.text)}</li>`).join('')}</ul>
        <p class="aside">Whether it covers Cascade, and how much you’d get, is something an advisor confirms.</p>
        ${source('AID-A', plan.aid[0].checked)}
      </article>
    </section>

    <section class="ask" aria-labelledby="ask-title">
      <h2 id="ask-title">Ask about these programs</h2>
      <p class="hint-ink">Your question stays on this phone. Only the topic is used to look up the answer.</p>
      <div class="thread" id="thread" aria-live="polite">${state.thread.map(bubble).join('')}</div>
      <div class="starters">${['How much does Northline pay?', 'What does Cascade cost?', 'Are there seats left?'].map((q) => `<button class="starter" type="button" data-ask="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      <form class="ask-form" id="ask-form" autocomplete="off">
        <label class="visually-hidden" for="ask-input">Your question</label>
        <input id="ask-input" type="text" maxlength="300" placeholder="Ask a question">
        <button class="button primary small" type="submit">Ask</button>
      </form>
      <p class="nudge" id="ask-nudge" hidden></p>
    </section>`;
  show('plan');
  requestAnimationFrame(() => $('#plan').classList.add('drawn'));
  (window.requestIdleCallback ?? setTimeout)(() => loadGate());
}

function bubble(m) {
  if (m.from === 'me') return `<p class="bubble me">${esc(m.text)}</p>`;
  const sources = (m.facts ?? []).reduce((acc, f) => (acc.some((x) => x[0] === f.record_id) ? acc : [...acc, [f.record_id, f.checked]]), []);
  return `<div class="bubble them${m.kind === 'cannot_confirm' ? ' unsure' : ''}">
    <p>${esc(withName(m.text))}</p>
    ${sources.map((s) => source(...s)).join(' ')}
    ${m.kind === 'cannot_confirm' ? `<button class="link" type="button" data-action="advisor">Ask an advisor</button>` : ''}
  </div>`;
}

async function ask(question) {
  const text = question.trim();
  if (!text) return;
  if (isCrisis(text)) return showCrisis();
  const clean = await screenText(text, $('#ask-nudge'), 'question');
  state.thread.push({ from: 'me', text: clean });
  const m = matchQuestion(text);
  try {
    const r = m.kind === 'cannot_confirm' ? await api('/api/answer', { cannot_confirm: m.code }) : await api('/api/answer', { topic: m.topic, record_ids: m.record_ids });
    state.thread.push({ from: 'them', kind: r.kind, text: r.text, facts: r.facts });
  } catch {
    state.thread.push({ from: 'them', kind: 'cannot_confirm', text: 'That didn’t go through. Try again, or ask an advisor.' });
  }
  $('#thread').innerHTML = state.thread.map(bubble).join('');
  $('#thread').lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---------- Rampart Edge: the third layer, a kind nudge before text is kept ----------
let gate;
function loadGate() {
  gate ??= import('https://cdn.jsdelivr.net/npm/@nationaldesignstudio/rampart-edge@2.0.5/+esm')
    .then(async (m) => { try { return await m.createGate(); } catch { return m.createValidatorGate ? await m.createValidatorGate() : null; } })
    .catch(() => null);
  return gate;
}
const SPAN_WORDS = { NAME: 'a full name', ADDRESS: 'an address', PHONE: 'a phone number', EMAIL: 'an email address', GOV_ID: 'an ID number', FINANCIAL: 'a bank or card number', DOB_KEYED: 'a birthday', URL_HANDLE: 'a social handle', OTHER_ID: 'an ID number' };

async function screenText(text, nudgeEl, where) {
  nudgeEl.hidden = true;
  const g = await Promise.race([loadGate(), new Promise((r) => setTimeout(() => r(null), 3000))]);
  if (!g) return text;
  try {
    const d = await g.check(text);
    if (d.verdict !== 'BLOCK' || !d.spans?.length) return text;
    const kinds = [...new Set(d.spans.map((s) => SPAN_WORDS[s.type] ?? 'personal details'))];
    let out = text;
    for (const s of [...d.spans].sort((a, b) => b.start - a.start)) out = out.slice(0, s.start) + '[removed]' + out.slice(s.end);
    nudgeEl.textContent = where === 'question'
      ? `That looked like it had ${kinds.join(' and ')} in it. You don’t need to share that to ask, so I took it out.`
      : `That looks like it has ${kinds.join(' and ')} in it. Your advisor replies through Pathways, so you don’t need to add contact details.`;
    nudgeEl.hidden = false;
    return out;
  } catch {
    return text;
  }
}

// ---------- actions ----------
function downloadCalendar() {
  const { plan } = state.result;
  const when = calendarDate(plan);
  const title = stepCopy(plan).title;
  const ymd = when.date.replaceAll('-', '');
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Pathways demo//EN', 'BEGIN:VEVENT',
    `UID:${ymd}-${when.record_id}@pathways-demo`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${ymd}`, `SUMMARY:${when.text}`,
    `DESCRIPTION:${title}. Source ${when.record_id}\\, checked ${fmt(when.checked).replace(',', '\\,')}. An advisor can confirm the details.`,
    'BEGIN:VALARM', 'TRIGGER:-P7D', 'ACTION:DISPLAY', `DESCRIPTION:${when.text}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })), download: `pathways-${ymd}.ics` });
  a.click();
  URL.revokeObjectURL(a.href);
}

function renderAdvisor() {
  const { plan } = state.result;
  const open = plan.escalations.filter((e) => OPEN_COPY[e.code]);
  const el = $('#advisor');
  if (state.handoff && state.handoff.forAnswers === JSON.stringify(plan.answers)) {
    el.innerHTML = `
      <nav class="topbar"><button class="link" type="button" data-action="to-plan">Back to my plan</button></nav>
      <h1>Sent. Your request code is <span class="code">${esc(state.handoff.code)}</span></h1>
      <p class="lede-ink">An advisor will answer within 2 business days. <span class="source">ADV-01</span></p>
      <p>Keep this code. It’s saved on this phone too.</p>
      <p class="label">${esc(state.handoff.label)} In this demo, nothing is actually sent to a person.</p>
      <button class="button primary" type="button" data-action="to-plan">Back to my plan</button>`;
    return show('advisor');
  }
  el.innerHTML = `
    <nav class="topbar"><button class="link" type="button" data-action="to-plan">Back</button></nav>
    <h1>Ask an advisor</h1>
    <p class="lede-ink">A person checks what the records can’t: eligibility, seats and award amounts. They answer within 2 business days. <span class="source">ADV-01</span></p>
    ${open.length ? `<h2>We’ll ask them about</h2><ul class="ask-list">${open.map((e) => `<li>${esc(OPEN_COPY[e.code])}</li>`).join('')}</ul>` : '<h2>We’ll share your plan with them</h2>'}
    <form id="advisor-form" class="advisor-form" autocomplete="off">
      <label for="adv-name">Your first name</label>
      <input id="adv-name" type="text" maxlength="40" value="${esc(state.name)}" autocapitalize="words" spellcheck="false">
      <label for="adv-note">Anything else they should know?</label>
      <textarea id="adv-note" rows="4" maxlength="1000" placeholder="Optional"></textarea>
      <p class="hint-ink">Only your advisor reads this. It never goes to the planning model.</p>
      <p class="nudge" id="adv-nudge" hidden></p>
      <button class="button primary" type="submit">Send to an advisor</button>
    </form>`;
  show('advisor');
}

async function sendHandoff() {
  const { plan } = state.result;
  const name = $('#adv-name').value.trim();
  const rawNote = $('#adv-note').value.trim();
  if (isCrisis(rawNote)) showCrisis();
  const note = rawNote ? await screenText(rawNote, $('#adv-nudge'), 'note') : '';
  if (note !== rawNote) { $('#adv-note').value = note; return; } // let her see what changed before sending
  if (name) { state.name = name; store.set('name', name); }
  const button = $('#advisor-form button[type=submit]');
  button.disabled = true;
  button.textContent = 'Sending…';
  try {
    const r = await api('/api/handoff', { first_name: name, note, reasons: plan.escalations.map((e) => e.code), next_step: plan.next_step.action });
    state.handoff = { code: r.code, label: r.label, forAnswers: JSON.stringify(plan.answers) };
    store.set('handoff', state.handoff);
    renderAdvisor();
  } catch {
    button.disabled = false;
    button.textContent = 'Send to an advisor';
    $('#adv-nudge').textContent = 'That didn’t go through. Check your connection and try again.';
    $('#adv-nudge').hidden = false;
  }
}

function showCrisis() {
  const c = $('#crisis');
  c.hidden = false;
  c.querySelector('a').focus();
}

// ---------- wiring ----------
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-action], [data-answer], [data-ask]');
  if (!t) return;
  if (t.dataset.answer) {
    state.answers[QUESTIONS[state.step].key] = t.dataset.answer;
    if (state.step < QUESTIONS.length - 1) { state.step += 1; renderQuestion(); } else { makePlan(); }
    return;
  }
  if (t.dataset.ask) return ask(t.dataset.ask);
  const actions = {
    back: () => { if (state.step === 0) show('start'); else { state.step -= 1; renderQuestion(); } },
    restart: () => { state.answers = {}; state.step = 0; state.thread = []; show('start'); },
    'retry-plan': makePlan,
    calendar: downloadCalendar,
    save: () => {
      store.set('saved', { answers: state.result.plan.answers, savedAt: new Date().toISOString() });
      t.textContent = 'Saved on this phone';
      $('#resume').hidden = false;
    },
    advisor: renderAdvisor,
    'to-plan': () => show('plan'),
    'open-saved': () => { state.answers = store.get('saved').answers; state.name = $('#first-name').value.trim() || state.name; makePlan(); },
    'close-crisis': () => { $('#crisis').hidden = true; },
  };
  actions[t.dataset.action]?.();
});

document.addEventListener('submit', (e) => {
  e.preventDefault();
  if (e.target.id === 'start-form') {
    const name = $('#first-name').value.trim();
    if (isCrisis(name)) return showCrisis();
    state.name = name;
    store.set('name', name);
    state.step = 0;
    state.answers = {};
    renderQuestion();
  }
  if (e.target.id === 'ask-form') {
    const input = $('#ask-input');
    ask(input.value);
    input.value = '';
  }
  if (e.target.id === 'advisor-form') sendHandoff();
});

document.addEventListener('focusin', (e) => { if (e.target.matches('#ask-input, #adv-note')) loadGate(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#crisis').hidden) $('#crisis').hidden = true; });

$('#first-name').value = state.name;
$('#resume').hidden = !store.get('saved');
