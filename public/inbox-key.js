// Each browser makes its own inbox key: 128 random bits, kept on this device. The student page sends it with a
// hand-off, and the advisor inbox in the same browser uses it to read that browser's requests. Nobody types
// anything. It stands in for the district's sign-in, which is what says who the advisor is in production.

const NAME = 'pathways.inbox';
const SHAPE = /^[0-9a-f]{32}$/;
let memory = '';

export function inboxKey() {
  try {
    const saved = localStorage.getItem(NAME);
    if (SHAPE.test(saved ?? '')) return saved;
  } catch { /* storage is off: the key lasts as long as this page */ }
  memory ||= [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  try { localStorage.setItem(NAME, memory); } catch { /* same */ }
  return memory;
}
