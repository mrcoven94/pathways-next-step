// Rampart Edge, served from this site (public/vendor/rampart/, rebuilt by scripts/vendor-rampart.mjs).
// The student's send screen and the advisor inbox both load it from here. It runs only in the browser that
// already holds the note; the server never runs it. Engine and model come from the base below, never another host.

const BASE = new URL('./vendor/rampart/', import.meta.url);

let loading;
function start() {
  loading ??= import('./vendor/rampart/rampart-edge.mjs')
    .then((m) => m.createLocalGate(BASE))
    .catch(() => null);
  return loading;
}

/** The gate, created once. Resolves to null if it fails to load, or if it is not ready within `ms`. */
export function loadGate(ms = 4000) {
  let timer;
  const late = new Promise((resolve) => { timer = setTimeout(() => resolve(null), ms); });
  return Promise.race([start(), late]).finally(() => clearTimeout(timer));
}
