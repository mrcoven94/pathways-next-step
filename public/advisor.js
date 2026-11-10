// Advisor inbox: hand-off requests, one opened at a time, contact details masked until switched on.
// Every student-typed field (first_name, question, note) is untrusted: it only reaches the page through esc() or textContent.

import { esc, reasonWords, STATUS_WORDS, KIND_WORDS, builtinSpans, maskNote, kindsIn, when } from './advisor-client.js';

const $ = (s) => document.querySelector(s);
// The access code lives in this page's memory only. A reload asks for it again, and nothing on disk holds it.
let memory = '';
const codeStore = { get: () => memory, set: (v) => { memory = v; }, clear: () => { memory = ''; } };

const state = { session: 0, code: codeStore.get(), requests: [], open: null, spans: [], shown: new Set() };

class Stale extends Error {}
class Unauthorized extends Error {}
class Off extends Error {}
async function api(path, init = {}) {
  const session = state.session;
  const res = await fetch(path, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${state.code}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) } });
  if (session !== state.session) throw new Stale(); // signed out, or signed in again, while this was on its way
  if (res.status === 401) throw new Unauthorized();
  if (res.status === 404) throw new Off();
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

function view(name) {
  $('#gate').hidden = name !== 'gate';
  $('#off').hidden = name !== 'off';
  $('#inbox').hidden = name !== 'inbox';
  $('#sign-out').hidden = name !== 'inbox';
}

function fail(e) {
  if (e instanceof Stale) return; // an answer to a session that has ended is dropped, never shown
  if (e instanceof Unauthorized) {
    codeStore.clear();
    state.code = '';
    view('gate');
    $('#code-msg').textContent = 'That code didn’t work. Check it and try again.';
    $('#code').focus();
  } else if (e instanceof Off) {
    view('off');
  } else {
    $('#detail').innerHTML = '<p class="pick">That didn’t load. Refresh to try again.</p>';
  }
}

// ---------- Contact details ----------
// This page holds the access code and students' notes, so it loads no code from any other site (the server
// sends a policy that enforces it). The patterns here are built in. Rampart Edge runs on the student's
// send screen today; it comes to this page once its files are served from this site.
async function findSpans(text) {
  return builtinSpans(text);
}

// ---------- list ----------
function renderList() {
  const ul = $('#requests');
  if (!state.requests.length) { ul.innerHTML = '<li class="empty">No requests yet.</li>'; return; }
  ul.innerHTML = state.requests.map((r) => `
    <li><button type="button" data-code="${esc(r.code)}" aria-current="${state.open?.code === r.code}">
      <span class="name">${esc(r.first_name || 'No name given')}</span>
      <span class="at">${esc(when(r.at))}</span>
      <span class="why">${esc(r.crisis ? 'Crisis words in their message' : reasonWords(r.reasons?.[0]))}</span>
      <span class="state ${esc(r.status)}">${esc(STATUS_WORDS[r.status] ?? r.status)}</span>
    </button></li>`).join('');
}

async function loadList() {
  const { requests } = await api('/api/advisor/requests');
  state.requests = requests ?? [];
  view('inbox');
  renderList();
  if (!state.open) $('#detail').innerHTML = state.requests.length ? '<p class="pick">Pick a request to open it.</p>' : '';
}

// ---------- detail ----------
function noteHtml() {
  return maskNote(state.open.note, state.spans, state.shown)
    .map((s) => (s.masked ? `<span class="hidden-bit">${esc(KIND_WORDS[s.type]?.[1] ?? 'hidden')}</span>` : s.type ? `<span class="shown-bit">${esc(s.text)}</span>` : esc(s.text)))
    .join('');
}

function renderDetail() {
  const r = state.open;
  const kinds = kindsIn(state.spans);
  $('#detail').innerHTML = `
    <button class="link back" type="button" data-action="back">Back</button>
    <h2 tabindex="-1">${esc(r.first_name || 'No name given')}</h2>
    <p class="when">${esc(when(r.at))} · ${esc(r.code)}</p>
    ${r.crisis ? '<p class="crisis-line">Their message had crisis words. They were shown 988 and 911.</p>' : ''}
    ${r.question ? `<h3>They asked</h3><p class="q">${esc(r.question)}</p>` : ''}
    <h3>What the records can’t confirm</h3>
    <ul class="reasons">${(r.reasons ?? []).map((c) => `<li>${esc(reasonWords(c))}</li>`).join('')}</ul>
    <h3>Note</h3>
    ${r.note ? `<p class="note" id="note">${noteHtml()}</p>` : '<p class="none">No note.</p>'}
    ${kinds.length ? `<div class="switches">${kinds.map((k) => `
      <label class="switch">Show ${esc((KIND_WORDS[k]?.[0] ?? k).toLowerCase())}
        <input type="checkbox" role="switch" data-kind="${esc(k)}" ${state.shown.has(k) ? 'checked' : ''}>
      </label>`).join('')}</div>` : ''}
    <h3>Status</h3>
    <div class="status-row" role="group" aria-label="Status">
      ${Object.entries(STATUS_WORDS).map(([v, w]) => `<button class="button secondary" type="button" data-status="${v}" aria-pressed="${r.status === v}">${w}</button>`).join('')}
    </div>`;
}

async function openRequest(code) {
  document.body.dataset.view = 'detail';
  $('#detail').innerHTML = '<p class="pick">Opening…</p>';
  try {
    const ticket = (state.ticket = (state.ticket ?? 0) + 1);
    const { request } = await api(`/api/advisor/requests/${encodeURIComponent(code)}`);
    const spans = request.note ? await findSpans(request.note) : [];
    if (ticket !== state.ticket) return; // the advisor opened another request meanwhile
    Object.assign(state, { open: request, spans, shown: new Set() });
    renderList();
    renderDetail();
    $('#detail h2').focus?.();
  } catch (e) { fail(e); }
}

async function setStatus(status) {
  const code = state.open.code;
  try {
    const { request } = await api(`/api/advisor/requests/${encodeURIComponent(code)}/status`, { method: 'POST', body: JSON.stringify({ status }) });
    state.requests = state.requests.map((r) => (r.code === code ? { ...r, ...request } : r));
    if (state.open?.code === code) state.open = { ...state.open, ...request };
    renderList();
    renderDetail();
  } catch (e) { fail(e); }
}

// ---------- events ----------
$('#code-form').addEventListener('submit', (e) => {
  e.preventDefault();
  state.session++;
  state.code = $('#code').value.trim();
  if (!state.code) return;
  codeStore.set(state.code);
  $('#code-msg').textContent = '';
  $('#code').value = '';
  loadList().catch(fail);
});
$('#sign-out').addEventListener('click', () => {
  codeStore.clear();
  Object.assign(state, { session: state.session + 1, ticket: (state.ticket ?? 0) + 1, code: '', requests: [], open: null, spans: [], shown: new Set() });
  $('#requests').innerHTML = ''; // nothing a student wrote stays on the page after sign-out
  $('#detail').innerHTML = '';
  document.body.dataset.view = 'list';
  view('gate');
});
$('#requests').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-code]');
  if (b) openRequest(b.dataset.code);
});
$('#detail').addEventListener('click', (e) => {
  if (e.target.closest('[data-action=back]')) { document.body.dataset.view = 'list'; return; }
  const s = e.target.closest('button[data-status]');
  if (s && state.open && s.getAttribute('aria-pressed') !== 'true') setStatus(s.dataset.status);
});
$('#detail').addEventListener('change', (e) => {
  const k = e.target.dataset?.kind;
  if (!k) return;
  if (e.target.checked) state.shown.add(k); else state.shown.delete(k);
  const note = $('#note');
  if (note) note.innerHTML = noteHtml();
});

if (state.code) loadList().catch(fail);
else view('gate');
