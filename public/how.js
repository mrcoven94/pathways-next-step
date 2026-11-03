// "How this works": the records and the model-call log, read from the same API the planner uses.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmt = (iso) => { if (!iso) return 'n/a'; const [y, m, d] = iso.split('-').map(Number); return `${MONTHS[m - 1]} ${d}, ${y}`; };

async function load() {
  const [records, calls] = await Promise.all([fetch('/api/records').then((r) => r.json()), fetch('/api/log').then((r) => r.json())]);

  document.querySelector('#records-body').innerHTML = records.map((r) => `
    <tr>
      <th scope="row" data-label="ID">${esc(r.id)}</th>
      <td data-label="Record">${esc(r.name)}</td>
      <td data-label="Facts"><ul>${r.facts.map((f) => `<li>${esc(f.text)}</li>`).join('')}</ul></td>
      <td data-label="Last checked">${esc(fmt(r.checked))}</td>
    </tr>`).join('');

  document.querySelector('#call-count').textContent = calls.length ? `(${calls.length})` : '';
  document.querySelector('#calls-body').innerHTML = calls.length
    ? calls.slice().reverse().map((c) => `
      <tr>
        <th scope="row" data-label="#">Call ${c.n}</th>
        <td data-label="Task">${c.task === 'explain_plan' ? 'Writing the plan' : 'Answering a question'}</td>
        <td data-label="Result"><span class="verdict ${c.verdict}">${c.verdict === 'used' ? 'Passed checks' : 'Replaced'}</span>${c.problems.length ? `<span class="problems">${esc(c.problems.map((p) => p.code).join(', '))}</span>` : ''}</td>
        <td data-label="Sent and received" class="io">
          <details><summary>Sent</summary><pre>${esc(c.sent)}</pre></details>
          <details><summary>Received</summary><pre>${esc(c.received)}</pre></details>
        </td>
      </tr>`).join('')
    : `<tr><td colspan="4" class="empty">No model calls on this server yet. <a href="/">Make a plan</a>, then come back.</td></tr>`;
}

const tabs = [...document.querySelectorAll('[role=tab]')];
function select(tab) {
  for (const t of tabs) {
    const on = t === tab;
    t.setAttribute('aria-selected', on);
    t.tabIndex = on ? 0 : -1;
    document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
  }
  tab.focus();
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => select(t));
  t.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') select(tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]);
  });
});
if (location.hash === '#calls') select(tabs[1]);

load().catch(() => {
  document.querySelector('#records-body').innerHTML = '<tr><td colspan="4" class="empty">This didn’t load. Refresh to try again.</td></tr>';
});
