// The page list on the left: planner, inbox, model log, report, guide and the code. One script tag and one
// stylesheet add it to a page; it marks the current page from the address. Open or hidden is remembered on this
// device. On a phone it starts hidden and opens over the page.

const PAGES = [
  ['/', 'Planner'],
  ['/advisor', 'Advisor inbox'],
  ['/how', 'Model log'],
  ['/report', 'Report'],
  ['/guide', 'Guide'],
  ['https://github.com/mrcoven94/pathways-next-step/', 'Code on GitHub'],
];
const KEY = 'pathways.nav';
const phone = matchMedia('(max-width: 899px)');
const remembered = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const remember = (v) => { try { localStorage.setItem(KEY, v); } catch {} };

const here = location.pathname.replace(/\/+$/, '') || '/';
const nav = document.createElement('nav');
nav.className = 'sitenav';
nav.setAttribute('aria-label', 'Pathways pages');
const toggle = document.createElement('button');
toggle.type = 'button';
toggle.className = 'sitenav-toggle';
toggle.setAttribute('aria-controls', 'sitenav-links');
const list = document.createElement('ul');
list.id = 'sitenav-links';
for (const [href, label] of PAGES) {
  const li = document.createElement('li');
  const a = document.createElement('a');
  a.href = href;
  a.textContent = label;
  if (href === here) a.setAttribute('aria-current', 'page');
  li.append(a);
  list.append(li);
}
nav.append(toggle, list);
document.body.prepend(nav);

function set(open, { focus = false } = {}) {
  document.documentElement.classList.toggle('sitenav-open', open);
  toggle.setAttribute('aria-expanded', String(open));
  toggle.textContent = open ? 'Hide' : 'Menu';
  list.hidden = !open;
  if (focus) (open ? list.querySelector('a') : toggle).focus();
}

set(!phone.matches && remembered() !== 'hidden');
toggle.addEventListener('click', () => {
  const open = toggle.getAttribute('aria-expanded') !== 'true';
  if (!phone.matches) remember(open ? 'open' : 'hidden');
  set(open, { focus: open });
});
nav.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') { e.stopPropagation(); set(false, { focus: true }); }
});
// On a phone the open panel covers the page, so a tap on a link or outside it closes it.
document.addEventListener('click', (e) => {
  if (phone.matches && toggle.getAttribute('aria-expanded') === 'true' && !nav.contains(e.target)) set(false);
});
phone.addEventListener('change', () => set(!phone.matches && remembered() !== 'hidden'));
