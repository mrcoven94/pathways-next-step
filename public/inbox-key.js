// Each browser makes its own inbox key: 128 random bits, kept on this device. The student page sends it with a
// hand-off, and the advisor inbox in the same browser uses it to read that browser's requests. Nobody types
// anything. It stands in for the district's sign-in, which is what says who the advisor is in production.
// It shows that this browser sent the request. It does not show who is sitting at it.

const NAME = 'pathways.inbox';
const SHAPE = /^[0-9a-f]{32}$/;
let memory = '';
let kept = false; // true once the key is known to be in storage

function fromLink() {
  // When storage is off, the planner hands the key to the inbox in the link's fragment, which is never sent to a server.
  const key = /^#k=([0-9a-f]{32})$/.exec(globalThis.location?.hash ?? '')?.[1];
  if (key) globalThis.history?.replaceState(null, '', globalThis.location.pathname);
  return key;
}

export function inboxKey() {
  if (memory) return memory;
  const linked = fromLink();
  try {
    const saved = localStorage.getItem(NAME);
    if (!linked && SHAPE.test(saved ?? '')) { kept = true; return (memory = saved); }
  } catch { /* storage is off: the key lasts as long as this page, and travels in the link */ }
  memory = linked ?? [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  try { localStorage.setItem(NAME, memory); kept = localStorage.getItem(NAME) === memory; } catch { kept = false; }
  return memory;
}

/** The link from the planner to the inbox. It carries the key only when this browser could not keep it. */
export function inboxLink() {
  const key = inboxKey();
  return kept ? '/advisor' : `/advisor#k=${key}`;
}
