// Advisor inbox: hand-off requests, one opened at a time, personal details hidden until switched on.
// Every typed field (first_name, question, note, and replies, which anyone can type in this public demo) is untrusted:
// it only reaches the page through esc() or textContent.

import {
  esc, reasonWords, STATUS_WORDS, KIND_WORDS, builtinSpans, fromRampart, mergeSpans, maskNote, kindsIn, when,
  countByStatus, filterRequests, rowReason, rowMeta, nextStepWords, handlingWords, sentWords, mergeOpened,
} from './advisor-client.js';
import { loadGate } from './rampart.js';

const $ = (s) => document.querySelector(s);
const state = { requests: [], view: 'all', open: null, note: null, spans: [], full: true, shown: new Set(), ticket: 0, fromList: false };
const VIEWS = [['all', 'All'], ['new', 'New'], ['in_progress', 'In progress'], ['resolved', 'Resolved']];
const nameOf = (r) => r.first_name || 'No name given';

async function api(path, init = {}) {
  const res = await fetch(path, { ...init, headers: { ...(init.headers ?? {}), ...(init.body ? { 'Content-Type': 'application/json' } : {}) } });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}
const say = (text) => { $('#said').textContent = ''; requestAnimationFrame(() => { $('#said').textContent = text; }); };

// ---------- Personal details ----------
// This page shows students' notes, so it loads no code from any other site (the server
// sends a policy that enforces it). Rampart Edge is served from this site and runs here, in the advisor's
// browser; the server never runs it. The built-in patterns are merged in, and stand alone if the model
// is not ready within about 4 seconds, so the advisor is never kept waiting. `full` says whether Rampart ran.
async function findSpans(text) {
  const builtin = mergeSpans(builtinSpans(text));
  const alone = { spans: builtin, full: false };
  const detect = (async () => {
    const gate = await loadGate(4000);
    return gate ? { spans: mergeSpans(fromRampart((await gate.check(text)).spans), builtin), full: true } : alone;
  })().catch(() => alone);
  // One deadline for loading and for reading the note. A result that arrives after it is dropped.
  return Promise.race([detect, new Promise((resolve) => setTimeout(() => resolve(alone), 4000))]);
}

// ---------- list ----------
function renderViews() {
  const counts = countByStatus(state.requests);
  $('#views').innerHTML = VIEWS.map(([v, w]) => `
    <button type="button" data-view="${v}" aria-pressed="${state.view === v}">
      <span class="n">${counts[v]}</span><span class="w">${w}</span>
    </button>`).join('');
}

function rowHtml(r) {
  return `<li><button type="button" class="row${r.crisis && r.status !== 'resolved' ? ' urgent-row' : ''}" data-code="${esc(r.code)}" aria-current="${state.open?.code === r.code}">
    <span class="dot s-${esc(r.crisis && r.status !== 'resolved' ? 'crisis' : r.status)}" aria-hidden="true"></span>
    <span class="name">${esc(nameOf(r))}</span>
    <span class="at">${esc(r.sample ? 'Sample' : when(r.at))}</span>
    <span class="row-why">${esc(rowReason(r))}</span>
    <span class="row-meta">${esc(rowMeta(r))}</span>
  </button></li>`;
}

function renderList() {
  renderViews();
  const ul = $('#requests');
  ul.removeAttribute('aria-busy');
  const rows = filterRequests(state.requests, state.view);
  if (!state.requests.length) { ul.innerHTML = '<li class="empty">No requests yet.</li>'; return; }
  if (!rows.length) { ul.innerHTML = `<li class="empty">Nothing ${esc((STATUS_WORDS[state.view] ?? '').toLowerCase())} right now.</li>`; return; }
  ul.innerHTML = rows.map(rowHtml).join('');
}

function failList() {
  $('#requests').removeAttribute('aria-busy');
  $('#requests').innerHTML = '<li class="empty">The inbox didn’t load. <button class="link" type="button" data-action="retry">Try again</button></li>';
}

async function loadList() {
  $('#requests').setAttribute('aria-busy', 'true');
  const { requests } = await api('/api/advisor/requests');
  state.requests = requests ?? [];
  renderList();
  if (!state.open && !location.hash) idle();
}

function idle() {
  $('#detail').innerHTML = state.requests.length
    ? '<p class="pick">Open a request to read it. A private note stays sealed until you do.</p>'
    : '';
}

// ---------- detail ----------
// Opening a request shows what the list already holds. The note stays sealed on the server until the advisor
// asks for it with "Open the note"; that one read is the only thing that opens it, and the server counts it.
function noteHtml() {
  return maskNote(state.note.text, state.spans, state.shown).map((s) => {
    if (s.masked) {
      const [kind, hidden] = KIND_WORDS[s.type] ?? ['Details', 'hidden'];
      return `<button type="button" class="hidden-bit" data-show="${esc(s.type)}" aria-label="${esc(hidden)}. Show ${esc(kind.toLowerCase())}">${esc(hidden)}</button>`;
    }
    return s.type ? `<span class="shown-bit">${esc(s.text)}</span>` : esc(s.text);
  }).join('');
}

function switchesHtml() {
  const kinds = kindsIn(state.spans);
  const switches = kinds.map((k) => `
    <label class="switch"><input type="checkbox" role="switch" data-kind="${esc(k)}" ${state.shown.has(k) ? 'checked' : ''}>
      <span>Show ${esc((KIND_WORDS[k]?.[0] ?? k).toLowerCase())}</span></label>`).join('');
  const partial = state.full ? '' : '<p class="partial">Names and addresses could not be checked on this device. Only phone numbers and emails are hidden.</p>';
  return (kinds.length ? `<div class="switches" role="group" aria-label="Hidden details">${switches}</div>` : '') + partial;
}

const PROMISE = 'Only advisors can read this note. It is stored sealed and never sent to an AI model.';
const CHECKS = '<a href="/how#calls">What the model saw</a> · <a href="/report">How this is checked</a>';
const isRead = () => state.note?.phase === 'open';

function noteBody() {
  const n = state.note;
  if (n.phase === 'sealed' || n.phase === 'opening' || n.phase === 'failed') {
    const button = n.phase === 'opening'
      ? '<button class="button primary open-note" type="button" disabled>Opening…</button>'
      : `<button class="button primary open-note" type="button" data-action="open-note">${n.phase === 'failed' ? 'Try again' : 'Open the note'}</button>`;
    return `<p class="promise">${n.phase === 'failed' ? 'The note didn’t open. ' : ''}${PROMISE}</p>${button}<p class="handling">${CHECKS}</p>`;
  }
  if (n.phase === 'hiding') return '<div class="paper" aria-busy="true"><p class="note pending">Hiding names, addresses, phone numbers and emails…</p></div>';
  return `<div class="paper"><p class="note" id="note" tabindex="-1">${noteHtml()}</p>${switchesHtml()}</div>
    <p class="handling">${esc(PROMISE)} ${esc(handlingWords({ opens: n.opens, last: n.last }))} ${CHECKS}</p>`;
}

function noteSection(r) {
  if (!r.has_note) return '<section class="part note-part"><h3>Private note</h3><p class="none">They didn’t leave a note.</p></section>';
  return `<section class="part note-part" aria-labelledby="note-title"><h3 id="note-title">Private note</h3>${noteBody()}</section>`;
}

// ---------- reply ----------
// The answer is the end of the opened request. It shows once the request has been read: the note opened,
// or straight away when there is no note. Replies are sealed on the server like the note.
const MAX_ADVISOR_REPLIES = 10; // the server's own limit; the student's messages have their own room
function replySection(r) {
  if (!isRead()) {
    return r.replies ? `<section class="part reply-part"><h3>Conversation</h3><p class="none">${r.replies === 1 ? 'One message' : `${r.replies} messages`} after the note. Open the note to read ${r.replies === 1 ? 'it' : 'them'}.</p></section>` : '';
  }
  const replies = state.note.replies ?? [];
  const thread = replies.map((x) => `<li class="from-${x.from === 'student' ? 'student' : 'advisor'}"><p class="reply-text">${esc(x.text)}</p><p class="reply-at">${esc(x.from === 'student' ? nameOf(r) : 'Advisor')} · ${esc(sentWords(x.at).replace(/^Sent /, ''))}</p></li>`).join('');
  const full = replies.filter((x) => x.from === 'advisor').length >= MAX_ADVISOR_REPLIES;
  const resolve = !replies.some((x) => x.from !== 'student') && r.status !== 'resolved';
  return `<section class="part reply-part" aria-labelledby="reply-title">
    <h3 id="reply-title">${replies.length ? 'Conversation' : `Reply to ${esc(nameOf(r))}`}</h3>
    ${thread ? `<ol class="replies">${thread}</ol>` : ''}
    ${full ? `<p class="none">You have sent ${MAX_ADVISOR_REPLIES} messages here, the most a conversation holds.</p>` : `
    <form id="reply-form" class="reply-form" autocomplete="off">
      <label class="visually-hidden" for="reply-text">${replies.length ? 'Follow-up' : 'Reply'} to ${esc(nameOf(r))}</label>
      <textarea id="reply-text" rows="${replies.length ? 3 : 5}" maxlength="1000" placeholder="${replies.length ? `Write to ${esc(nameOf(r))}` : `Write to ${esc(nameOf(r))}. They read it in Pathways and can write back.`}"></textarea>
      <div class="reply-actions">
        ${r.status === 'resolved' ? '<span></span>' : `<label class="check"><input type="checkbox" id="reply-resolve" ${resolve ? 'checked' : ''}><span>Mark resolved</span></label>`}
        <button class="button primary send" type="submit" disabled>${replies.length ? 'Send follow-up' : 'Send reply'}</button>
      </div>
      <p class="save-error" id="reply-error" hidden>That didn’t send. Your words are still here. Try again.</p>
    </form>`}
  </section>`;
}

function statusSection(r) {
  return `<section class="part status-part" aria-labelledby="status-title">
      <h3 id="status-title">Status</h3>
      <div class="segments" role="group" aria-labelledby="status-title">
        ${Object.entries(STATUS_WORDS).map(([v, w]) => `<button type="button" data-status="${v}" aria-pressed="${r.status === v}">${w}</button>`).join('')}
      </div>
      <p class="save-error" id="save-error" hidden>That didn’t save. Try again.</p>
    </section>`;
}

function renderDetail() {
  const r = state.open;
  const next = nextStepWords(r.next_step);
  const reasons = (r.reasons ?? []).map((c) => `<li>${esc(reasonWords(c))}</li>`).join('');
  $('#detail').innerHTML = `
    <button class="link back" type="button" data-action="back">Back to inbox</button>
    <header class="who">
      <h2 id="who" tabindex="-1">${esc(nameOf(r))}</h2>
      <p class="when">${esc(r.sample ? 'Invented sample' : sentWords(r.at))} · ${esc(r.code)}</p>
    </header>
    ${r.crisis ? `<div class="crisis-panel"><h3>Reach ${esc(nameOf(r))} first</h3><p>Their message had words that mean they may not be safe. The app showed them 988 and 911 right away. Read their note before you contact them: it may say how to reach them safely.</p>${r.has_note ? '<button class="link" type="button" data-action="read-crisis-note">Read the note now</button>' : ''}</div>` : ''}
    ${r.question ? `<section class="part"><h3>They asked</h3><p class="q">${esc(r.question)}</p></section>` : ''}
    ${reasons ? `<section class="part"><h3>The records couldn’t confirm</h3><ul class="reasons">${reasons}</ul></section>` : ''}
    ${next ? `<section class="part"><h3>Next step they were given</h3><p class="next-step">${esc(next)}</p></section>` : ''}
    ${noteSection(r)}
    <div id="reply-slot">${replySection(r)}</div>
    ${statusSection(r)}`;
  $('#detail').setAttribute('aria-labelledby', 'who');
}

function renderNote() {
  const sec = document.querySelector('.note-part');
  if (sec) sec.outerHTML = noteSection(state.open);
  renderReply();
}
function renderReply() {
  const slot = $('#reply-slot');
  if (slot) slot.innerHTML = replySection(state.open);
}
function syncRow(request) {
  state.requests = state.requests.map((r) => (r.code === request.code ? { ...r, ...request } : r));
  if (state.open?.code === request.code) state.open = { ...state.open, ...request };
  renderList();
  for (const b of document.querySelectorAll('[data-status]')) b.setAttribute('aria-pressed', String(b.dataset.status === state.open?.status));
}

// What the server just sent replaces the cached row and the opened request, and the detail is drawn again from it,
// keeping any reply being typed and the focus.
function applyFresh(fresh) {
  const { requests, open } = mergeOpened(state.requests, fresh);
  state.requests = requests;
  state.open = open ?? mergeOpened([state.open], fresh).open ?? state.open;
  renderList();
  const draft = $('#reply-text')?.value ?? '';
  const focused = document.activeElement?.id;
  renderDetail();
  if (draft && $('#reply-text')) { $('#reply-text').value = draft; $('#reply-form .send').disabled = !draft.trim(); }
  if (focused) document.getElementById(focused)?.focus({ preventScroll: true });
}

// The list may be minutes old: a student may have written back since. Opening a request fetches its row again.
async function refreshRow(code, ticket) {
  try {
    const { requests } = await api('/api/advisor/requests');
    const row = (requests ?? []).find((r) => r.code === code);
    if (ticket === state.ticket && row) applyFresh(row);
  } catch {} // the opened request still shows what the list held
}

function openRequest(code) {
  const row = state.requests.find((r) => r.code === code);
  state.ticket++;
  document.body.dataset.view = 'detail';
  if (!row) {
    $('#detail').innerHTML = '<button class="link back" type="button" data-action="back">Back to inbox</button><p class="pick">This request isn’t in the inbox. It may have left the demo queue.</p>';
    return;
  }
  Object.assign(state, { open: row, note: { phase: 'sealed' }, spans: [], full: true, shown: new Set() });
  renderList();
  renderDetail();
  $('#who').focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
  if (!row.has_note) openNote({ quiet: true }); // nothing sealed to ask about: load the replies straight away
  else refreshRow(code, state.ticket);
}

async function openNote({ quiet = false } = {}) {
  const code = state.open.code;
  const ticket = state.ticket;
  state.note = { phase: 'opening' };
  if (!quiet) renderNote();
  try {
    const { request } = await api(`/api/advisor/requests/${encodeURIComponent(code)}`);
    if (ticket !== state.ticket) return; // the advisor moved to another request meanwhile
    state.note = { phase: request.note ? 'hiding' : 'open', text: request.note, replies: request.replies ?? [], opens: request.opens, last: request.last_opened_at };
    applyFresh(request);
    if (!request.note) return;
    const { spans, full } = await findSpans(request.note);
    if (ticket !== state.ticket) return;
    Object.assign(state, { spans, full });
    state.note.phase = 'open';
    renderNote();
    say('Note opened. Personal details are hidden.');
    $('#note')?.focus({ preventScroll: true });
  } catch {
    if (ticket !== state.ticket) return;
    state.note = { phase: 'failed' };
    renderNote();
  }
}

function showList() {
  state.ticket++;
  document.body.dataset.view = 'list';
  const code = state.open?.code;
  state.open = null;
  renderList();
  idle();
  if (code) document.querySelector(`#requests [data-code="${CSS.escape(code)}"]`)?.focus({ preventScroll: false });
}

async function setStatus(status) {
  const code = state.open.code;
  try {
    const { request } = await api(`/api/advisor/requests/${encodeURIComponent(code)}/status`, { method: 'POST', body: JSON.stringify({ status }) });
    syncRow(request);
    if (state.open?.code !== code) return;
    $('#save-error').hidden = true;
    say(`Marked ${STATUS_WORDS[request.status].toLowerCase()}.`);
  } catch {
    const err = $('#save-error');
    if (err) err.hidden = false;
  }
}

let sendingReply = false;
async function sendReply() {
  const box = $('#reply-text');
  const text = box.value.trim();
  if (!text || sendingReply) return;
  const code = state.open.code;
  const button = $('#reply-form .send');
  const status = $('#reply-resolve')?.checked ? 'resolved' : state.open.status;
  sendingReply = true;
  button.disabled = true;
  button.textContent = 'Sending…';
  try {
    const { request, reply } = await api(`/api/advisor/requests/${encodeURIComponent(code)}/reply`, { method: 'POST', body: JSON.stringify({ text, status }) });
    if (state.open?.code !== code) return;
    state.note.replies = [...(state.note.replies ?? []), { from: 'advisor', text, at: reply.at }];
    syncRow(request);
    renderReply();
    say(request.status === 'resolved' ? 'Reply sent. Marked resolved.' : 'Reply sent.');
    $('#reply-text')?.focus();
  } catch {
    if (state.open?.code !== code) return;
    button.disabled = false;
    button.textContent = state.note.replies?.length ? 'Send follow-up' : 'Send reply';
    $('#reply-error').hidden = false;
  } finally {
    sendingReply = false;
  }
}

function setShown(kind, on) {
  if (on) state.shown.add(kind); else state.shown.delete(kind);
  $('#note').innerHTML = noteHtml();
  const box = document.querySelector(`[data-kind="${CSS.escape(kind)}"]`);
  if (box) box.checked = on;
}

// ---------- routing ----------
// The opened request lives in the address (#ADV-XXXX), so Back on a phone and the browser's own Back agree.
function route() {
  const code = location.hash.slice(1);
  if (/^ADV-[A-Z2-9]{4}$/.test(code)) { if (state.open?.code !== code) openRequest(code); }
  else if (document.body.dataset.view === 'detail' || state.open) showList();
}
window.addEventListener('hashchange', route);

// ---------- events ----------
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.body.dataset.view === 'detail' && !e.target.closest?.('input, textarea')) $('[data-action=back]')?.click();
  // Up and down move between rows in the list.
  const row = e.target.closest?.('#requests .row');
  if (row && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    const rows = [...document.querySelectorAll('#requests .row')];
    rows[rows.indexOf(row) + (e.key === 'ArrowDown' ? 1 : -1)]?.focus();
    e.preventDefault();
  }
});
$('#views').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-view]');
  if (!b) return;
  state.view = b.dataset.view;
  renderList();
  $(`#views [data-view="${state.view}"]`).focus();
});
$('#requests').addEventListener('click', (e) => {
  if (e.target.closest('[data-action=retry]')) return loadList().catch(failList);
  const b = e.target.closest('button[data-code]');
  if (!b) return;
  state.fromList = true;
  if (location.hash === `#${b.dataset.code}`) openRequest(b.dataset.code);
  else location.hash = b.dataset.code;
});
$('#detail').addEventListener('click', (e) => {
  if (e.target.closest('[data-action=back]')) {
    if (state.fromList) history.back();
    else { history.replaceState(null, '', location.pathname); showList(); }
    return;
  }
  if (e.target.closest('[data-action=open-note]')) return openNote();
  if (e.target.closest('[data-action=read-crisis-note]')) {
    $('.note-part')?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    return state.note?.phase === 'sealed' || state.note?.phase === 'failed' ? openNote() : $('#note')?.focus({ preventScroll: true });
  }
  const bit = e.target.closest('[data-show]');
  if (bit) {
    const kind = bit.dataset.show;
    setShown(kind, true);
    say(`${KIND_WORDS[kind]?.[0] ?? 'Details'} shown.`);
    document.querySelector(`[data-kind="${CSS.escape(kind)}"]`)?.focus();
    return;
  }
  const s = e.target.closest('button[data-status]');
  if (s && state.open && s.getAttribute('aria-pressed') !== 'true') setStatus(s.dataset.status);
});
$('#detail').addEventListener('input', (e) => {
  if (e.target.id === 'reply-text') { $('#reply-form .send').disabled = !e.target.value.trim(); $('#reply-error').hidden = true; }
});
$('#detail').addEventListener('submit', (e) => {
  e.preventDefault();
  if (e.target.id === 'reply-form') sendReply();
});
$('#detail').addEventListener('change', (e) => {
  const k = e.target.dataset?.kind;
  if (k) setShown(k, e.target.checked);
});

loadGate(); // start loading the detector now, so it is ready when a note is opened
loadList().then(route).catch(failList);
