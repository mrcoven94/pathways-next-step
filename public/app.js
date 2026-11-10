// Dani's planner in the browser. Her name and anything she types stay on this phone unless she
// sends them to an advisor. Questions are matched here and only topic codes go to the server.

import { stepsFor, withName, askRequest, handoffRequest, suggestionsFor, matchSuggestions, previewQuestion } from './client.js';
import { sentWords } from './advisor-client.js';

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
    title: 'Learn by doing, or start in a classroom?',
    why: 'We’ll put that path first.',
    options: [['earn', 'Learn by doing, and get paid'], ['classes', 'Start in a classroom'], ['unsure', 'Not sure yet']],
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
    state.asOf = /^\d{4}-\d{2}-\d{2}$/.test(asOf ?? '') ? asOf : null;
    const mine = session;
    const result = await api('/api/plan', { answers, ...(state.asOf && { today: state.asOf }) });
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
    const adv = plan.next_step.advisor;
    const by = adv && esc(fmt(adv.answer_by).replace(/, \d{4}$/, ''));
    const timing = !adv ? '' : adv.before_deadline ? ` You’ll hear back by ${by}, before the deadline.` : ` You may not hear back until ${by}, after the deadline, so ask today.`;
    return { h1: `Apply to Northline by <mark>${esc(short(when.date))}</mark>`, sub: `This week, check ${OPEN_NORTHLINE(plan.programs[0].reasons)} with an advisor.${timing}`, when, subHtml: true };
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

// With nothing typed: a few starters. While she types: the questions that match, with her words in bold.
function suggestions(text = '') {
  const bank = suggestionsFor(state.result.plan.answers.considering).filter((q) => !state.asked.has(q));
  const STARTERS = ['How much does Northline pay?', 'What does Cascade cost?', 'How long is Riverbend?', 'Are there seats left?'];
  const list = text.trim() ? matchSuggestions(bank, text) : STARTERS.filter((q) => bank.includes(q));
  const typed = String(text).toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const bold = (q) => esc(q).replace(/[A-Za-z0-9]+/g, (w) => {
    const t = typed.find((x) => w.toLowerCase().startsWith(x));
    return t ? `<b>${w.slice(0, t.length)}</b>${w.slice(t.length)}` : w;
  });
  state.suggest = { list, active: -1 };
  return list.map((q, i) => `<button class="starter" type="button" role="option" id="suggest-${i}" aria-selected="false" data-ask="${esc(q)}">${bold(q)}</button>`).join('');
}

function renderThread() {
  $('#thread').innerHTML = state.thread.map(bubble).join('');
  for (const m of state.thread) m.seen = true; // only new bubbles animate in
  $('#thread').lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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

    ${state.asOf ? `<p class="replay">Showing this plan as of ${esc(fmt(state.asOf))}, to see how dates change it. <a href="/">Back to today</a></p>` : ''}
    <section class="next" aria-label="Your next step">
      <h1>${head.h1}</h1>
      ${head.sub ? `<p class="sub">${head.subHtml ? head.sub : esc(head.sub)}</p>` : ''}
      ${head.when ? `<p class="meta">${days ? `<span class="days">${days} days left</span>` : ''}${source(head.when.record_id, head.when.checked)}</p>` : ''}
      ${plan.next_step.why.includes('SHE_PREFERS_LEARNING_BY_DOING') ? '<p class="why-first">You said you’d rather learn by doing, and Northline’s deadline is the first one on your road.</p>' : ''}
      <p class="message">${esc(withName(summary.text, state.name))}</p>
      ${summary.cites.filter((id) => id !== head.when?.record_id).map((id) => source(id, plan.programs.find((p) => p.record_id === id)?.facts[0].checked ?? plan.aid.find((f) => f.record_id === id)?.checked)).join(' ')}
      ${actions(plan, head.when)}
      <p class="label">${esc(plan.label)}</p>
      ${state.handoff ? `<p class="label">You asked an advisor (${esc(state.handoff.code)}). <button class="link inline" type="button" data-action="my-request">See your request and answer</button></p>` : ''}
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
      <div class="thread" id="thread" aria-live="polite"></div>
      <div class="starters" id="starters" role="listbox" aria-label="Suggested questions"></div>
      <form class="ask-form" id="ask-form" autocomplete="off">
        <label class="visually-hidden" for="ask-input">Your question</label>
        <input id="ask-input" type="text" maxlength="300" placeholder="Ask a question" role="combobox" aria-autocomplete="list" aria-controls="starters" aria-expanded="true" aria-describedby="ask-hint">
        <button class="button small" type="submit" disabled>Ask</button>
      </form>
      <p class="ask-hint" id="ask-hint" aria-live="polite">${HINT_EMPTY}</p>
    </section>`;
  $('#starters').innerHTML = suggestions();
  for (const m of state.thread) m.seen = true;
  $('#thread').innerHTML = state.thread.map(bubble).join('');
  show('plan');
  // Restart the highlighter stroke every time a plan appears, from a painted empty state.
  const p = $('#plan');
  p.classList.remove('drawn');
  void p.offsetWidth;
  requestAnimationFrame(() => requestAnimationFrame(() => p.classList.add('drawn')));
}

function bubble(m, i) {
  const fresh = m.seen ? '' : ' fresh';
  if (m.from === 'me') return `<p class="bubble me${fresh}">${esc(m.text)}</p>`;
  if (m.typing) return `<div class="bubble them typing${fresh}" role="status" aria-label="Looking that up"><span></span><span></span><span></span></div>`;
  const sources = (m.facts ?? []).reduce((acc, f) => (acc.some((x) => x[0] === f.record_id) ? acc : [...acc, [f.record_id, f.checked]]), []);
  return `<div class="bubble them${m.kind === 'cannot_confirm' ? ' unsure' : ''}${fresh}">
    <p>${esc(withName(m.text, m.greet ? state.name : ''))}</p>
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
  // Her name opens the first reply only, the way a person would use it.
  const greet = !state.thread.some((m) => m.from === 'them' && !m.typing);
  const typing = { from: 'them', typing: true };
  state.thread.push({ from: 'me', text }, typing);
  $('#starters').innerHTML = suggestions();
  $('#ask-hint').textContent = HINT_EMPTY;
  renderThread();
  const mine = session;
  // The answer is ready in milliseconds; a short beat of dots reads as a reply, not a page reload.
  const beat = new Promise((r) => setTimeout(r, 600 + Math.random() * 400));
  let reply;
  try {
    const [r] = await Promise.all([api('/api/answer', req.body), beat]);
    reply = { from: 'them', kind: r.kind, code: r.code, text: r.text, facts: r.facts, question: text, greet };
  } catch {
    reply = { from: 'them', kind: 'cannot_confirm', text: 'That didn’t go through. Try again, or ask an advisor.', question: text };
  }
  if (mine !== session) return;
  state.thread[state.thread.indexOf(typing)] = reply;
  renderThread();
}

const HINT_EMPTY = 'Your question stays on this phone.';

function onType(input) {
  const text = input.value;
  $('#starters').innerHTML = suggestions(text);
  input.removeAttribute('aria-activedescendant');
  input.form.querySelector('button').disabled = !text.trim();
  const p = previewQuestion(text, state.result.plan.answers.considering);
  $('#ask-hint').textContent = !text.trim() ? HINT_EMPTY : !p ? '' : p.kind === 'records' ? `About ${p.about}. The answer comes from the records.` : p.kind === 'advisor' ? 'Only an advisor can answer that one. Ask anyway and we’ll set it up.' : '';
}

function moveSuggestion(input, step) {
  const { list } = state.suggest;
  if (!list.length) return;
  state.suggest.active = (state.suggest.active + step + list.length) % list.length;
  document.querySelectorAll('#starters .starter').forEach((b, i) => b.setAttribute('aria-selected', i === state.suggest.active));
  input.setAttribute('aria-activedescendant', `suggest-${state.suggest.active}`);
}

// ---------- Rampart Edge: only where text leaves the phone (the advisor note), and only as a suggestion ----------
let gate;
function loadGate() {
  gate ??= import('./rampart.js'); // served from this site, the same copy the advisor inbox uses
  return gate.then((m) => m.loadGate()).catch(() => null);
}
const SPAN_WORDS = { ADDRESS: 'an address', PHONE: 'a phone number', EMAIL: 'an email address', GOV_ID: 'an ID number', FINANCIAL: 'a bank or card number', DOB_KEYED: 'a birthday', URL_HANDLE: 'a social handle', OTHER_ID: 'an ID number' };

async function contactDetails(text) {
  const g = await Promise.race([loadGate(), new Promise((r) => setTimeout(() => r(null), 3000))]);
  if (!g) return null;
  try {
    const d = await Promise.race([g.check(text), new Promise((r) => setTimeout(() => r(null), 3000))]); // never keep her waiting to send
    if (!d) return null;
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
  if (state.handoff && state.handoff.key === key) return renderSent();
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
      <p class="hint-ink">Demo: the advisor inbox is public. Don’t type anything real.</p>
      <div class="suggest" id="adv-suggest" hidden></div>
      <button class="button primary" type="submit">Send to an advisor</button>
    </form>`;
  show('advisor');
  (window.requestIdleCallback ?? setTimeout)(() => loadGate());
}

// ---------- her request and its answer ----------
// The request code kept on this phone is what lets her read the answer. The server sends back only the status
// and the replies, never her note. It is checked when this screen opens and when she asks, never on a timer.
function renderSent() {
  const h = state.handoff;
  $('#advisor').innerHTML = `
    <nav class="topbar"><button class="link" type="button" data-action="from-request">Back</button></nav>
    <h1>Sent to an advisor</h1>
    <p class="lede-ink">Your request code is <strong>${esc(h.code)}</strong>.</p>
    <div class="answer" id="answer" aria-live="polite"><p class="hint-ink">Checking for an answer…</p></div>
    <div class="actions" id="answer-actions"></div>
    <p class="label">${esc(h.label ?? '')} <a href="/advisor#${esc(h.code)}">See what the advisor sees</a>.</p>`;
  answerActions(false);
  show('advisor');
  checkAnswer();
}

// No answer yet: checking is the thing to do. Once there is one, going back is, and checking again stays at hand.
function answerActions(answered) {
  const back = `<button class="button ${answered ? 'primary' : 'secondary'}" type="button" data-action="from-request">${state.result ? 'Back to my plan' : 'Back to the start'}</button>`;
  const check = `<button class="button ${answered ? 'secondary' : 'primary'}" type="button" data-action="check-answer">${answered ? 'Check for new replies' : 'Check for an answer'}</button>`;
  $('#answer-actions').innerHTML = answered ? `${back}<div class="row">${check}</div>` : `${check}<div class="row">${back}</div>`;
}

let checking = 0;
async function checkAnswer() {
  const box = $('#answer');
  const button = $('[data-action=check-answer]');
  if (!box || !state.handoff) return;
  const ticket = ++checking;
  if (button) { button.disabled = true; button.textContent = 'Checking…'; }
  let html;
  let answered = false;
  try {
    const res = await fetch(`/api/handoff/${encodeURIComponent(state.handoff.code)}`);
    if (res.status === 404) html = '<h2>This request isn’t in the demo inbox anymore</h2><p>Demo requests are cleared when the server restarts. You can send a new one from your plan.</p>';
    else if (!res.ok) throw new Error(String(res.status));
    else {
      const { replies } = await res.json();
      answered = replies.some((r) => r.from !== 'student');
      const mine = (r) => r.from === 'student';
      html = replies.length
        ? `<h2>${answered ? 'Your conversation' : 'No answer yet'}</h2>
          <div class="thread">${replies.map((r) => `<div class="bubble ${mine(r) ? 'me' : 'them'}"><p class="reply-text">${esc(r.text)}</p><span class="source">${mine(r) ? 'You' : 'From the advisor inbox'} · ${esc(sentWords(r.at).replace(/^Sent /, ''))}</span></div>`).join('')}</div>
          <p class="label">Demo: anyone can type a reply in the public inbox, so this is not from a real advisor.</p>
          ${answered && replies.filter(mine).length < 5 ? `<form id="answer-form" class="ask-form answer-form" autocomplete="off">
            <label class="visually-hidden" for="answer-input">Write back</label>
            <input id="answer-input" type="text" maxlength="1000" placeholder="Write back">
            <button class="button small" type="submit">Send</button>
          </form>` : ''}`
        : `<h2>No answer yet</h2><p>They answer within 2 business days. ${source('ADV-01')}</p>`;
    }
  } catch {
    html = '<h2>We couldn’t check just now</h2><p>Check your connection, then try again.</p>';
  }
  if (ticket !== checking || !$('#answer')) return;
  $('#answer').innerHTML = html;
  answerActions(answered);
}

// She writes back on the same thread. Crisis words show the help card first, like everywhere else.
let writing = false;
async function writeBack() {
  const input = $('#answer-input');
  const text = input?.value.trim();
  if (!text || writing || !state.handoff) return;
  if (handoffRequest({ note: text }).crisis) showCrisis();
  writing = true;
  const button = $('#answer-form button');
  button.disabled = true;
  try {
    const res = await fetch(`/api/handoff/${encodeURIComponent(state.handoff.code)}/reply`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
    if (!res.ok) throw new Error(String(res.status));
    await checkAnswer();
  } catch {
    button.disabled = false;
    button.textContent = 'Try again';
  } finally {
    writing = false;
  }
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
  if (t.dataset.ask) { const input = $('#ask-input'); if (input) { input.value = ''; input.form.querySelector('button').disabled = true; } return ask(t.dataset.ask); }
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
    'from-request': () => (state.result ? show('plan') : show('start')),
    'my-request': renderSent,
    'check-answer': checkAnswer,
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
    const picked = state.suggest?.list[state.suggest.active];
    ask(picked ?? input.value);
    input.value = '';
    onType(input);
  }
  if (e.target.id === 'advisor-form') sendHandoff();
  if (e.target.id === 'answer-form') writeBack();
});

document.addEventListener('input', (e) => { if (e.target.id === 'ask-input') onType(e.target); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#crisis').hidden) $('#crisis').hidden = true;
  if (e.target.id !== 'ask-input') return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); moveSuggestion(e.target, e.key === 'ArrowDown' ? 1 : -1); }
  if (e.key === 'Escape') { e.target.value = ''; onType(e.target); }
});

$('#first-name').value = state.name;
$('#resume').hidden = !store.get('saved');
$('#my-request').hidden = !state.handoff?.code;
