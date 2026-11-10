// /report: reads public/data/*.json and fills the page. Every string from the data goes through esc().

import { esc, fmtDate, ms, runsOf, kindRows, kindTotals, keyRows, timing, headline, noteRows, checkRows, mutationSummary, compareKinds } from './report-client.js';

const $ = (s) => document.querySelector(s);
const get = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const pct = (n, total) => (total ? (100 * n) / total : 0);

function bar(r) {
  return `<span class="bar" aria-hidden="true"><span class="b-good" style="width:${pct(r.caught, r.total)}%"></span><span class="b-ask" style="width:${pct(r.partial, r.total)}%"></span><span class="b-miss" style="width:${pct(r.missed, r.total)}%"></span></span>`;
}

function renderRampart(runs, fixtures) {
  const run = runs[0];
  $('#headline').textContent = headline(run);
  const before = runs[1];
  $('#rampart-run').textContent = `Run on ${fmtDate(run.date)}, ${run.package?.split('/').pop() ?? 'rampart-edge'} ${run.version}, ${run.runtime}.${run.basis === 'model' ? '' : ' The model did not load, so these are the simple pattern checks only.'}${before ? ` The run before was on ${fmtDate(before.date)}.` : ''}`;
  for (const id of ['#method-notes', '#method-count']) $(id).textContent = String(run.notes);

  const rows = kindRows(run);
  const t = kindTotals(rows);
  const compare = compareKinds(runs);
  const prev = new Map((compare ?? []).map((c) => [c.kind, c.before]));
  if (compare) $('.kinds .before-col').hidden = false;
  const beforeCell = (b) => (compare ? `<td data-label="Run before">${b ? `${b.caught} of ${b.total} caught` : 'Not measured'}</td>` : '');
  $('#kinds-body').innerHTML = [...rows, { label: 'All kinds', ...t, all: true }].map((r) => `
    <tr${r.all ? ' class="total"' : ''}>
      <th scope="row" data-label="Kind">${esc(r.label)}</th>
      <td data-label="Caught">${r.caught}</td>
      <td data-label="Partly caught">${r.partial}</td>
      <td data-label="Missed">${r.missed}</td>
      <td data-label="Out of">${r.total}</td>
      ${beforeCell(r.all ? kindTotals(kindRows(before)) : prev.get(r.kind))}
      <td class="bar-cell">${bar(r)}</td>
    </tr>`).join('');

  const k = keyRows(run);
  const blockedIds = k.harmlessBlocked.ids.length ? ` (${esc(k.harmlessBlocked.ids.join(', '))})` : '';
  $('#key-body').innerHTML = `
    <tr><th scope="row" data-label="Notes">Very private notes with no contact details, passed by the detector</th><td data-label="Result" class="big">${k.sensitivePassed.count} of ${k.sensitivePassed.total}</td></tr>
    <tr><th scope="row" data-label="Notes">Everyday notes wrongly blocked</th><td data-label="Result" class="big">${k.harmlessBlocked.count} of ${k.harmlessBlocked.total}${blockedIds}</td></tr>`;
  $('#key-why').textContent = k.sensitivePassed.count
    ? 'That is right for a detector: a note about a parent in prison or sleeping in a car has no phone number in it. It is also why the detector can never be what keeps a note away from a model. The note is sealed when it arrives, and the gateway refuses it, whatever the detector says.'
    : 'The detector blocked every one of these, but it is still not what keeps a note away from a model. The note is sealed when it arrives, and the gateway refuses it.';

  const tm = timing(run);
  $('#timing').textContent = tm ? `Half the notes took ${ms(tm.median)} or less. The fastest took ${ms(tm.min)} and the slowest ${ms(tm.max)}, in Node on a laptop.` : 'No timings in this run.';

  $('#notes-body').innerHTML = noteRows(run, fixtures).map((n) => `
    <tr>
      <th scope="row" data-label="Note">${esc(n.id)}</th>
      <td data-label="Kind">${esc(n.group)}</td>
      <td data-label="Result"><span class="verdict ${esc(n.tone)}">${esc(n.result)}</span></td>
      <td data-label="Details">
        <details><summary>Open</summary>
          <p class="note-text">${esc(n.text)}</p>
          <dl>
            <dt>Expected</dt><dd>${n.expected.length ? n.expected.map((e) => `${esc(e.kind)}: ${esc(e.value)}. ${esc(e.status)}`).join('<br>') : 'Nothing for the detector to find'}</dd>
            <dt>Found</dt><dd>${n.found.length ? esc(n.found.join(', ')) : 'Nothing'}</dd>
            <dt>Detector said</dt><dd>${esc(n.gate)}, in ${esc(ms(n.ms))}</dd>
          </dl>
        </details>
      </td>
    </tr>`).join('');
}

function renderChecks(runs) {
  const run = runs[0];
  if (!run) {
    $('#checks-run').textContent = 'No mutation run has been saved yet. Run npm run mutate to make one.';
    $('#checks-body').innerHTML = '';
    $('.checks').hidden = true;
    return;
  }
  const s = mutationSummary(run);
  const prev = runs[1] ? mutationSummary(runs[1]) : null;
  $('#checks-run').textContent = `Run on ${fmtDate(run.date)} with Node ${run.node}. ${s.noteCaught} of ${s.noteTotal} breaks aimed at the note were caught, and ${s.caught} of ${s.total} across the whole app.${prev ? ` The run before, on ${fmtDate(runs[1].date)}, caught ${prev.caught} of ${prev.total}.` : ''}`;
  $('#checks-body').innerHTML = checkRows(run).map((c) => `
    <tr>
      <th scope="row" data-label="Check">${esc(c.check)}</th>
      <td data-label="What it proves">${esc(c.proves)}</td>
      <td data-label="Broken on purpose">${c.mutations.length ? `<ul>${c.mutations.map((m) => `<li>${esc(m.what)} <span class="file">${esc(m.file)}</span> <span class="verdict ${m.caught ? 'good' : 'miss'}">${m.caught ? 'Caught' : 'Not caught'}</span></li>`).join('')}</ul>` : 'No break targets this check yet'}</td>
    </tr>`).join('');
}

const [rampart, fixtures, mutations] = await Promise.all([get('/data/rampart-eval.json'), get('/data/synthetic-notes.json'), get('/data/mutations.json')]);
const rRuns = runsOf(rampart);
if (rRuns.length) renderRampart(rRuns, fixtures?.notes ?? []);
else $('#headline').textContent = 'The detector results did not load. Refresh to try again.';
renderChecks(runsOf(mutations));
