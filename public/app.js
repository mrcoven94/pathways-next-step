// Dani's planner in the browser. Her name and anything she types stay on this phone unless she
// sends them to an advisor. Questions are matched here and only topic codes go to the server.

import { stepsFor, withName, askRequest, handoffRequest } from './client.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const store = {
  get(key) { try { return JSON.parse(localStorage.getItem(`pathways.${key}`)); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(`pathways.${key}`, JSON.stringify(value)); } catch {} },
};

let session = 0; // bumped by Start over, so a reply that arrives late is dropped
const state = { name: store.get('name') ?? '', answers: {}, step: 0, result: null, thread: [], asked: new Set(), pending: null, handoff: store.get('handoff') };

const PROGRAMS = [
  ['PRG-02', 'Northline Electrical Apprenticeship'],
  ['PRG-01', 'Cascade Community College, Medical Assistant Certificate'],
  ['PRG-04', 'Cascade Community College, IT Support Certificate'],
  ['PRG-03', 'Riverbend University, BS Computer Science'],
];
const NAME = Object.fromEntries(PROGRAMS);
const SHORT = { 'PRG-01': 'the Cascade Medical Assistant Certificate', 'PRG-02': 'Northline', 'PRG-03': 'Riverbend', 'PRG-04': 'the Cascade IT Support Certificate', 'AID-A': 'Evergreen grant' };

const QUESTIONS = {
  stage: {
    title: 'Where are you right now?',
    options: [['high_school', 'Finishing high school'], ['working', 'Out of school and looking for work'], ['other', 'Something else']],
  },
  considering: { title: 'What are you weighing?', why: 'Pick all that apply.', multi: true },
  age18: {
    title: 'Will you be 18 by March 1, 2027?',
    why: 'Northline starts that day, and you need to be 18 by then.',
    source: ['PRG-02', '2026-10-20'],
    options: [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']],
  },
  diploma: {
    title: 'Will you have your diploma or GED by then?',
    why: 'Northline requires one.',
    source: ['PRG-02', '2026-10-20'],
    options: [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']],
  },
  lean: {
    title: 'Earn right away, or start with classes?',
    why: 'We’ll put that path first.',
    options: [['earn', 'Earn right away'], ['classes', 'Classes first'], ['unsure', 'Not sure yet']],
  },
};

// ---------- dates and sources ----------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmt = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${MONTHS[m - 1]} ${d}, ${y}`; };
const short = (iso) => fmt(iso).replace(/, \d{4}$/, '');
const daysUntil = (iso, today) => Math.round((Date.parse(iso) - Date.parse(today)) / 86400000);
const source = (id, checked) => `<span class="source">${esc(id)} · ${checked ? `checked ${esc(fmt(checked))}` : 'no check date in the records'}</span>`;

// ---------- screens ----------
function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  document.body.dataset.screen = id;
  window.scrollTo({ top: 0 });
  const heading = $(`#${id} h1`);
  if (heading && id !== 'start') { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
}

function renderQuestion() {
  const steps = stepsFor(state.answers);
  const key = steps[state.step];
  const q = QUESTIONS[key];
  // Until she picks programs, show the longest path, so the bar only ever gets shorter.
  const total = state.answers.considering?.length || (state.answers.stage && state.answers.stage !== 'high_school') ? steps.length : 5;
  const picked = state.notSure ? [] : state.answers.considering ?? [];
  const choices = q.multi
    ? `${PROGRAMS.map(([id, name]) => `<button class="choice${picked.includes(id) ? ' picked' : ''}" type="button" aria-pressed="${picked.includes(id)}" data-toggle="${id}">${esc(name)}</button>`).join('')}
       <button class="choice${state.notSure ? ' picked' : ''}" type="button" aria-pressed="${!!state.notSure}" data-toggle="all">I’m not sure yet</button>`
    : q.options.map(([value, label]) => `<button class="choice${state.answers[key] === value ? ' picked' : ''}" type="button" data-answer="${value}">${esc(label)}</button>`).join('');

  $('#question').innerHTML = `
    <nav class="topbar">
      <button class="link" type="button" data-action="back">Back</button>
      <p class="progress" role="img" aria-label="Question ${state.step + 1} of ${total}">
        ${Array.from({ length: total }, (_, i) => `<span class="${i <= state.step ? 'on' : ''}"></span>`).join('')}
      </p>
    </nav>
    <h1>${esc(q.title)}</h1>
    ${q.why ? `<p class="why">${esc(q.why)}${q.source ? ` ${source(...q.source)}` : ''}</p>` : ''}
    <div class="choices" role="group" aria-label="${esc(q.title)}">${choices}</div>
    ${q.multi ? `<button class="button primary continue" type="button" data-action="next" ${state.answers.considering?.length ? '' : 'disabled'}>Continue</button>` : ''}`;
  show('question');
}

function advance() {
  const steps = stepsFor(state.answers);
  if (state.answers.stage && state.answers.stage !== 'high_school') return renderOutside();
  if (state.step < steps.length - 1) { state.step += 1; renderQuestion(); } else { makePlan(); }
}

function renderOutside() {
  $('#plan').innerHTML = `
    <nav class="topbar"><button class="link" type="button" data-action="back-to-stage">Back</button></nav>
    <h1>Pathways is set up for high school seniors for now.</h1>
    <p class="lede-ink">An advisor can help with where you are. They answer within 2 business days. ${source('ADV-01')}</p>
    <div class="actions">
      <button class="button primary" type="button" data-action="advisor">Ask an advisor</button>
    </div>`;
  state.result = null;
  show('plan');
}

async function api(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Request failed');
  return res.json();
}

async function makePlan() {
  $('#plan').innerHTML = `<p class="loading" role="status">Putting your plan together…</p>`;
  show('plan');
  try {
    const { stage, ...answers } = state.answers;
    // ?today=2026-12-05 replays the plan on another date, to see deadlines pass and records go stale.
    const asOf = new URLSearchParams(location.search).get('today');
    const mine = session;
    const result = await api('/api/plan', { answers, ...(/^\d{4}-\d{2}-\d{2}$/.test(asOf ?? '') && { today: asOf }) });
    if (mine !== session) return;
    state.result = result;
    renderPlan();
  } catch {
    $('#plan').innerHTML = `
      <nav class="topbar"><p class="wordmark ink">Pathways</p><button class="link" type="button" data-action="restart">Start over</button></nav>
      <h1>That didn’t load.</h1>
      <p class="lede-ink">Your answers are still here. Check your connection and try again.</p>
      <div class="actions"><button class="button primary" type="button" data-action="retry-plan">Try again</button></div>`;
    show('plan');
  }
}

// ---------- plan ----------
const OPEN_NORTHLINE = (reasons) => {
  const age = reasons.includes('AGE_UNCONFIRMED');
  const diploma = reasons.includes('DIPLOMA_TIMING_UNKNOWN');
  return age && diploma ? 'the age rule and when you need your diploma or GED' : age ? 'the age rule' : 'when you need your diploma or GED';
};

const STATUS = {
  fits_listed_rules: () => ['good', 'Nothing in your way so far'],
  unknown: (p) => ['ask', p.record_id === 'PRG-02' ? `Check ${OPEN_NORTHLINE(p.reasons)} first` : 'Ask an advisor first'],
  misses_a_listed_rule: (p) => ['miss', p.reasons.includes('DEADLINE_PASSED') ? 'Applications closed Nov 30, 2026' : 'Not for the Mar 1, 2027 start'],
};

function checkList(plan) {
  const items = [];
  const byCode = (code) => plan.escalations.filter((e) => e.code === code).map((e) => e.record_id);
  // When asking an advisor is the next step, the headline already names these two.
  const inHeadline = plan.next_step.action === 'ask_advisor_then_apply';
  if (!inHeadline && byCode('AGE_UNCONFIRMED').length) items.push('Will you be 18 by Mar 1, 2027? Northline needs that.');
  if (!inHeadline && byCode('DIPLOMA_TIMING_UNKNOWN').length) items.push('Do you need your diploma or GED when you apply, or only by the Mar 1 start? The records don’t say.');
  if (byCode('AGE_RULE_MISSED').length) items.push('When Northline starts again. You need to be 18 by the start date, and the records only list Mar 1, 2027.');
  for (const id of byCode('DEADLINE_PASSED')) items.push(id === 'PRG-02' ? 'Whether Northline opens again. Applications closed Nov 30, 2026.' : 'Whether Riverbend still takes applications after its Feb 1, 2027 priority deadline.');
  for (const id of byCode('START_DATE_PASSED')) items.push(`When ${SHORT[id]} starts next. The Jan 6, 2027 start has passed.`);
  const unlisted = byCode('APPLY_DEADLINE_UNLISTED');
  if (unlisted.length) {
    const schools = [...new Set(unlisted.map((id) => (id === 'PRG-03' ? 'Riverbend' : 'Cascade')))].join(' and ');
    items.push(`How and when to apply to ${schools}. The records don’t list an application deadline.`);
  }
  if (plan.aid.length) {
    const schools = [...new Set(plan.programs.filter((p) => p.record_id !== 'PRG-02').map((p) => (p.record_id === 'PRG-03' ? 'Riverbend' : 'Cascade')))].join(' or ');
    items.push(`Whether the Evergreen grant can help pay for ${schools}, and how much you’d get.`);
  }
  for (const id of byCode('STALE_RECORD')) items.push(`Whether the ${SHORT[id] ?? id} details are still current. They’re more than 45 days old.`);
  return items;
}

function headline(plan) {
  const { action } = plan.next_step;
  const when = plan.next_step.facts.find((f) => f.date);
  if (action === 'apply_by_deadline') return { h1: `Apply to Northline by <mark>${esc(short(when.date))}</mark>`, when };
  if (action === 'ask_advisor_then_apply') {
    return { h1: `Apply to Northline by <mark>${esc(short(when.date))}</mark>`, sub: `First, check ${OPEN_NORTHLINE(plan.programs[0].reasons)} with an advisor.`, when };
  }
  if (!when) return { h1: 'Start your FAFSA or state aid application', sub: 'Then ask an advisor about the next start date.' };
  const what = when.record_id === 'PRG-03' ? 'Riverbend’s priority deadline is' : 'Cascade starts';
  return { h1: 'Start your FAFSA or state aid application', sub: `${what} <mark>${esc(fmt(when.date))}</mark>.`, when, subHtml: true };
}

function actions(plan, when) {
  const calendar = when && when.date >= plan.today ? `Add ${esc(short(when.date))} to my calendar` : null;
  const advisorFirst = plan.next_step.action === 'ask_advisor_then_apply' || !calendar;
  const saved = store.get('saved');
  const save = saved && JSON.stringify(saved.answers) === JSON.stringify(plan.answers) ? 'Saved on this phone' : 'Save this plan';
  const primary = advisorFirst ? ['advisor', 'Ask an advisor now'] : ['calendar', calendar];
  const secondary = [advisorFirst && calendar ? ['calendar', 'Add to calendar'] : null, ['save', save], advisorFirst ? null : ['advisor', 'Ask an advisor']].filter(Boolean);
  return `<div class="actions">
    <button class="button primary" type="button" data-action="${primary[0]}">${primary[1]}</button>
    <div class="row">${secondary.map(([a, l]) => `<button class="button secondary" type="button" data-action="${a}">${l}</button>`).join('')}</div>
  </div>`;
}

function road(plan) {
  const label = { 'Applications close': 'Northline applications close', 'Program starts': 'Northline starts', 'Priority deadline': 'Riverbend priority deadline' };
  const stops = [{ date: plan.today, text: 'Today', today: true }];
  for (const p of plan.programs) {
    for (const f of p.facts.filter((x) => x.date)) {
      const kind = f.text.replace(/ [A-Z][a-z]{2} \d+, \d{4}$/, '');
      stops.push({ ...f, text: kind === 'Next start' ? 'Cascade starts' : label[kind] ?? kind });
    }
  }
  const seen = new Set();
  const target = plan.next_step.facts.find((f) => f.date)?.date;
  return stops
    .filter((s) => { const k = s.date + s.text; return !seen.has(k) && seen.add(k); })
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s, i, all) => {
      const past = !s.today && s.date < plan.today;
      // The stretch from today to her next step is drawn in pen: the part of the road she's on now.
      const walked = target && s.date >= plan.today && s.date < target && i < all.length - 1;
      return `<li class="${s.today ? 'today' : ''}${s.date === target ? ' target' : ''}${past ? ' past' : ''}${walked ? ' walked' : ''}">
        <time datetime="${s.date}">${esc(fmt(s.date))}</time>
        <span class="stop">${esc(s.text)}${past ? ', passed' : ''}</span>
        ${s.record_id ? source(s.record_id, s.checked) : ''}
      </li>`;
    }).join('');
}

function programBlock(p) {
  const [tone, words] = p.suggested ? ['good', 'Another path to look at'] : STATUS[p.outcome](p);
  const facts = p.facts.filter((f) => !f.date); // dates live on the road
  return `<article class="program">
    <h3>${esc(NAME[p.record_id])}</h3>
    <p class="status ${tone}"><span class="dot" aria-hidden="true"></span>${esc(words)}</p>
    <ul class="facts">${facts.map((f) => `<li>${esc(f.text)}</li>`).join('')}</ul>
    ${source(p.record_id, p.facts[0].checked)}
  </article>`;
}

function starters(plan) {
  const ids = plan.answers.considering;
  return [
    ids.includes('PRG-02') && 'How much does Northline pay?',
    (ids.includes('PRG-01') || ids.includes('PRG-04')) && 'What does Cascade cost?',
    ids.includes('PRG-03') && 'How long is Riverbend?',
    'Are there seats left?',
  ].filter((q) => q && !state.asked.has(q));
}

function renderPlan() {
  const { plan, summary } = state.result;
  const head = headline(plan);
  const days = head.when && head.when.date >= plan.today ? daysUntil(head.when.date, plan.today) : null;
  const check = checkList(plan);

  $('#plan').innerHTML = `
    <nav class="topbar">
      <p class="wordmark ink">Pathways</p>
      <button class="link" type="button" data-action="restart">Start over</button>
    </nav>

    <section class="next" aria-label="Your next step">
      <h1>${head.h1}</h1>
      ${head.sub ? `<p class="sub">${head.subHtml ? head.sub : esc(head.sub)}</p>` : ''}
      ${head.when ? `<p class="meta">${days ? `<span class="days">${days} days left</span>` : ''}${source(head.when.record_id, head.when.checked)}</p>` : ''}
      <p class="message">${esc(withName(summary.text, state.name))}</p>
      ${summary.cites.filter((id) => id !== head.when?.record_id).map((id) => source(id, plan.programs.find((p) => p.record_id === id)?.facts[0].checked ?? plan.aid.find((f) => f.record_id === id)?.checked)).join(' ')}
      ${actions(plan, head.when)}
      <p class="label">${esc(plan.label)}</p>
    </section>

    ${check.length ? `<section class="open" aria-labelledby="open-title">
      <h2 id="open-title">${plan.next_step.action === 'ask_advisor_then_apply' ? 'Your advisor can also check' : 'What an advisor will check'}</h2>
      <ul>${check.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    </section>` : ''}

    <section class="road-wrap" aria-labelledby="road-title">
      <h2 id="road-title">Your road</h2>
      <ol class="road">${road(plan)}</ol>
    </section>

    <section class="options" aria-labelledby="options-title">
      <h2 id="options-title">Your options</h2>
      ${plan.programs.map(programBlock).join('')}
      ${plan.aid.length ? `<article class="program aid">
        <h3>Evergreen Opportunity Grant (state)</h3>
        <ul class="facts">${plan.aid.map((f) => `<li>${esc(f.text)}</li>`).join('')}</ul>
        ${source('AID-A', plan.aid[0].checked)}
      </article>` : ''}
    </section>

    <section class="ask" aria-labelledby="ask-title">
      <h2 id="ask-title">Ask about these programs</h2>
      <div class="thread" id="thread" aria-live="polite">${state.thread.map(bubble).join('')}</div>
      <div class="starters" id="starters">${starters(plan).map((q) => `<button class="starter" type="button" data-ask="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      <form class="ask-form" id="ask-form" autocomplete="off">
        <label class="visually-hidden" for="ask-input">Your question</label>
        <input id="ask-input" type="text" maxlength="300" placeholder="Ask a question. It stays on this phone.">
        <button class="button primary small" type="submit">Ask</button>
      </form>
    </section>`;
  show('plan');
  // Restart the highlighter stroke every time a plan appears, from a painted empty state.
  const p = $('#plan');
  p.classList.remove('drawn');
  void p.offsetWidth;
  requestAnimationFrame(() => requestAnimationFrame(() => p.classList.add('drawn')));
}

function bubble(m, i) {
  if (m.from === 'me') return `<p class="bubble me">${esc(m.text)}</p>`;
  const sources = (m.facts ?? []).reduce((acc, f) => (acc.some((x) => x[0] === f.record_id) ? acc : [...acc, [f.record_id, f.checked]]), []);
  return `<div class="bubble them${m.kind === 'cannot_confirm' ? ' unsure' : ''}">
    <p>${esc(withName(m.text, state.name))}</p>
    ${sources.map((s) => source(...s)).join(' ')}
    ${m.kind === 'cannot_confirm' ? `<button class="link" type="button" data-action="advisor" data-thread="${i}">Ask an advisor about this</button>` : ''}
  </div>`;
}

async function ask(question) {
  const text = question.trim();
  if (!text) return;
  const req = askRequest(text, state.result?.plan.answers.considering);
  if (req.crisis) return showCrisis();
  state.asked.add(text);
  state.thread.push({ from: 'me', text });
  const mine = session;
  try {
    const r = await api('/api/answer', req.body);
    if (mine !== session) return;
    state.thread.push({ from: 'them', kind: r.kind, code: r.code, text: r.text, facts: r.facts, question: text });
  } catch {
    if (mine !== session) return;
    state.thread.push({ from: 'them', kind: 'cannot_confirm', text: 'That didn’t go through. Try again, or ask an advisor.', question: text });
  }
  $('#thread').innerHTML = state.thread.map(bubble).join('');
  $('#starters').innerHTML = starters(state.result.plan).map((q) => `<button class="starter" type="button" data-ask="${esc(q)}">${esc(q)}</button>`).join('');
  $('#thread').lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---------- Rampart Edge: only where text leaves the phone (the advisor note), and only as a suggestion ----------
let gate;
function loadGate() {
  gate ??= import('https://cdn.jsdelivr.net/npm/@nationaldesignstudio/rampart-edge@2.0.5/+esm')
    .then(async (m) => { try { return await m.createGate(); } catch { return m.createValidatorGate ? await m.createValidatorGate() : null; } })
    .catch(() => null);
  return gate;
}
const SPAN_WORDS = { ADDRESS: 'an address', PHONE: 'a phone number', EMAIL: 'an email address', GOV_ID: 'an ID number', FINANCIAL: 'a bank or card number', DOB_KEYED: 'a birthday', URL_HANDLE: 'a social handle', OTHER_ID: 'an ID number' };

async function contactDetails(text) {
  const g = await Promise.race([loadGate(), new Promise((r) => setTimeout(() => r(null), 3000))]);
  if (!g) return null;
  try {
    const d = await g.check(text);
    const spans = (d.spans ?? []).filter((s) => SPAN_WORDS[s.type]); // a name in a note to her own advisor is fine
    return d.verdict === 'BLOCK' && spans.length ? spans : null;
  } catch {
    return null;
  }
}

// ---------- actions ----------
function downloadCalendar() {
  const { plan } = state.result;
  const when = plan.next_step.facts.find((f) => f.date);
  const ymd = when.date.replaceAll('-', '');
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Pathways demo//EN', 'BEGIN:VEVENT',
    `UID:${ymd}-${when.record_id}@pathways-demo`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${ymd}`, `SUMMARY:${when.text}`,
    `DESCRIPTION:From your Pathways plan. Source ${when.record_id}\\, checked ${fmt(when.checked).replace(',', '\\,')}. An advisor can confirm the details.`,
    'BEGIN:VALARM', 'TRIGGER:-P7D', 'ACTION:DISPLAY', `DESCRIPTION:${when.text}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })), download: `pathways-${ymd}.ics` });
  a.click();
  URL.revokeObjectURL(a.href);
}

function renderAdvisor() {
  const plan = state.result?.plan;
  const check = plan ? checkList(plan) : [];
  const key = JSON.stringify([plan?.answers ?? state.answers.stage, state.pending?.question ?? null]);
  if (state.handoff && state.handoff.key === key) {
    $('#advisor').innerHTML = `
      <nav class="topbar"><button class="link" type="button" data-action="to-plan">Back</button></nav>
      <h1>Sent to an advisor</h1>
      <p class="lede-ink">Your request code is <strong>${esc(state.handoff.code)}</strong>. They answer within 2 business days. ${source('ADV-01')}</p>
      <p class="label">${esc(state.handoff.label)} Demo: no person receives this. In a pilot, the answer comes back here.</p>
      <div class="actions"><button class="button primary" type="button" data-action="to-plan">Back to my plan</button></div>`;
    return show('advisor');
  }
  $('#advisor').innerHTML = `
    <nav class="topbar"><button class="link" type="button" data-action="to-plan">Back</button></nav>
    <h1>Ask an advisor</h1>
    <p class="lede-ink">A person answers within 2 business days. ${source('ADV-01')}</p>
    ${state.pending || check.length ? `<h2>We’ll ask them</h2><ul class="ask-list">
      ${state.pending ? `<li>Your question: “${esc(state.pending.question)}”</li>` : ''}
      ${check.map((t) => `<li>${esc(t)}</li>`).join('')}
    </ul>` : ''}
    <form id="advisor-form" class="advisor-form" autocomplete="off">
      <label for="adv-name">Your first name</label>
      <input id="adv-name" type="text" maxlength="40" value="${esc(state.name)}" autocapitalize="words" spellcheck="false">
      <label for="adv-note">Anything else? <span class="optional">Optional</span></label>
      <textarea id="adv-note" rows="4" maxlength="1000"></textarea>
      <p class="hint-ink">Only your advisor reads this.</p>
      <div class="suggest" id="adv-suggest" hidden></div>
      <button class="button primary" type="submit">Send to an advisor</button>
    </form>`;
  show('advisor');
  (window.requestIdleCallback ?? setTimeout)(() => loadGate());
}

let sending = false;
async function sendHandoff({ skipScreen = false } = {}) {
  if (sending) return;
  sending = true;
  try {
    await sendHandoffOnce(skipScreen);
  } finally {
    sending = false;
  }
}

async function sendHandoffOnce(skipScreen) {
  const plan = state.result?.plan;
  const name = $('#adv-name').value;
  const note = $('#adv-note').value;
  const req = handoffRequest({
    name, note,
    question: state.pending?.question ?? '',
    reasons: [...(plan?.escalations.map((e) => e.code) ?? ['OUTSIDE_PREVIEW']), ...(state.pending?.code ? [state.pending.code] : [])],
    nextStep: plan?.next_step.action ?? null,
  });
  if (req.crisis) return showCrisis();

  const suggest = $('#adv-suggest');
  if (!skipScreen && note.trim()) {
    const spans = await contactDetails(note);
    if (spans) {
      const kinds = [...new Set(spans.map((s) => SPAN_WORDS[s.type]))].join(' and ');
      suggest.innerHTML = `<p>Your note has ${esc(kinds)} in it. Your advisor replies here, so you can leave that out.</p>
        <div class="row"><button class="button secondary" type="button" data-action="strip-note">Take it out</button><button class="button secondary" type="button" data-action="send-anyway">Send as is</button></div>`;
      suggest.hidden = false;
      suggest.dataset.spans = JSON.stringify(spans);
      return;
    }
  }
  suggest.hidden = true;
  if (name.trim()) { state.name = name.trim(); store.set('name', state.name); }
  const button = $('#advisor-form button[type=submit]');
  button.disabled = true;
  button.textContent = 'Sending…';
  try {
    const r = await api('/api/handoff', req.body);
    if (r.crisis) showCrisis();
    state.handoff = { code: r.code, label: r.label, key: JSON.stringify([plan?.answers ?? state.answers.stage, state.pending?.question ?? null]) };
    store.set('handoff', state.handoff);
    renderAdvisor();
  } catch {
    button.disabled = false;
    button.textContent = 'Send to an advisor';
    suggest.innerHTML = '<p>That didn’t go through. Check your connection and try again.</p>';
    suggest.hidden = false;
  }
}

function stripNote() {
  const el = $('#adv-note');
  let text = el.value;
  for (const s of JSON.parse($('#adv-suggest').dataset.spans).sort((a, b) => b.start - a.start)) text = text.slice(0, s.start) + text.slice(s.end);
  el.value = text.replace(/[ \t]{2,}/g, ' ').replace(/\s+([,.])/g, '$1').trim();
  $('#adv-suggest').hidden = true;
  el.focus();
}

function showCrisis() {
  const c = $('#crisis');
  c.hidden = false;
  c.querySelector('a').focus();
}

// ---------- wiring ----------
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-action], [data-answer], [data-ask], [data-toggle]');
  if (!t || t.disabled) return;
  if (t.dataset.answer) {
    state.answers[stepsFor(state.answers)[state.step]] = t.dataset.answer;
    return advance();
  }
  if (t.dataset.toggle) {
    const all = PROGRAMS.map(([id]) => id);
    const picked = new Set(state.notSure ? [] : state.answers.considering ?? []);
    if (t.dataset.toggle === 'all') {
      state.notSure = !state.notSure; // "not sure" means show every program, without ticking them for her
      state.answers.considering = state.notSure ? all : [];
    } else {
      state.notSure = false;
      picked.has(t.dataset.toggle) ? picked.delete(t.dataset.toggle) : picked.add(t.dataset.toggle);
      state.answers.considering = all.filter((id) => picked.has(id));
    }
    for (const k of ['age18', 'diploma', 'lean']) delete state.answers[k];
    return renderQuestion();
  }
  if (t.dataset.ask) return ask(t.dataset.ask);
  const actions = {
    next: advance,
    back: () => { if (state.step === 0) show('start'); else { state.step -= 1; renderQuestion(); } },
    'back-to-stage': () => { state.step = 0; renderQuestion(); },
    restart: () => { session += 1; state.result = null; state.answers = {}; state.notSure = false; state.step = 0; state.thread = []; state.asked.clear(); state.pending = null; show('start'); },
    'retry-plan': makePlan,
    calendar: downloadCalendar,
    save: () => {
      store.set('saved', { answers: state.result.plan.answers, savedAt: new Date().toISOString() });
      t.textContent = 'Saved on this phone';
      $('#resume').hidden = false;
    },
    advisor: () => {
      const m = t.dataset.thread ? state.thread[Number(t.dataset.thread)] : null;
      state.pending = m ? { question: m.question, code: m.code } : null;
      renderAdvisor();
    },
    'to-plan': () => (state.result ? show('plan') : renderOutside()),
    'open-saved': () => { state.answers = { stage: 'high_school', ...store.get('saved').answers }; makePlan(); },
    'close-crisis': () => { $('#crisis').hidden = true; },
    'strip-note': stripNote,
    'send-anyway': () => sendHandoff({ skipScreen: true }),
  };
  actions[t.dataset.action]?.();
});

document.addEventListener('submit', (e) => {
  e.preventDefault();
  if (e.target.id === 'start-form') {
    const name = $('#first-name').value.trim();
    if (handoffRequest({ name }).crisis) return showCrisis();
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

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#crisis').hidden) $('#crisis').hidden = true; });

$('#first-name').value = state.name;
$('#resume').hidden = !store.get('saved');
