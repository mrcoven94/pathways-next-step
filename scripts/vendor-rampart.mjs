#!/usr/bin/env node
// Maintenance script: rebuilds public/vendor/rampart/ from pinned package versions. Never run by npm start or npm test.
// It installs into os.tmpdir(), never into this repo, bundles Rampart Edge with onnxruntime-web's WASM-only build
// into one ES module with no bare imports, copies the trimmed engine and the model files Rampart ships, and writes
// manifest.json with each file's size and SHA-256. Run: node scripts/vendor-rampart.mjs
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAMPART = '@nationaldesignstudio/rampart-edge';
const RAMPART_VERSION = '2.0.5';
const ORT = 'onnxruntime-web';
const ORT_VERSION = '1.30.0'; // the version whose trimmed engine Rampart ships in runtime/
const ESBUILD = 'esbuild@0.25.12';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public/vendor/rampart');
const work = path.join(os.tmpdir(), `rampart-vendor-${RAMPART_VERSION}`);
const nm = path.join(work, 'node_modules');

fs.mkdirSync(work, { recursive: true });
console.log(`Installing ${RAMPART}@${RAMPART_VERSION} and ${ORT}@${ORT_VERSION} into ${work}`);
execFileSync('npm', ['install', '--prefix', work, '--no-audit', '--no-fund', '--ignore-scripts', '--no-save', `${RAMPART}@${RAMPART_VERSION}`, `${ORT}@${ORT_VERSION}`], { stdio: 'inherit' });
const pkg = (name) => JSON.parse(fs.readFileSync(path.join(nm, name, 'package.json'), 'utf8'));
for (const [name, want] of [[RAMPART, RAMPART_VERSION], [ORT, ORT_VERSION]]) {
  if (pkg(name).version !== want) throw new Error(`${name} installed ${pkg(name).version}, expected ${want}`);
}
// The registry's own checksum for each package that ends up in the bundle. A package swapped under the same version
// number changes its checksum, and the rebuild stops here before anything is copied.
const INTEGRITY = {
  '@nationaldesignstudio/rampart-edge': 'sha512-0xPMwbDbG3FEuJfbVDr6PQgi3s/76I7fRerTEqG6yRp8Ra9GLmlKEr2Xx+/9StQIL7lXr3b0WqZpmY8nFYLypQ==',
  'onnxruntime-web': 'sha512-q0y+JrrtukXSzsBWEMccVfqX25LRmosXHF+CaRJmg8pZClzcV7svNc4rKY3jL02Vb7QmRMDs1SigqR4CXAfKYQ==',
  'onnxruntime-common': 'sha512-7fdVWjAID1dVhH/G8qK3APARunV4VkBFoCQAP7qp4Wkab0mrorvmc+sqiT+mKXOzDqdjN5j+/Z9nb4gzNPWcyA==',
};
const lock = JSON.parse(fs.readFileSync(path.join(nm, '.package-lock.json'), 'utf8')).packages;
for (const [name, want] of Object.entries(INTEGRITY)) {
  const got = Object.entries(lock).find(([where]) => where.endsWith(`node_modules/${name}`))?.[1].integrity; // --prefix installs get long relative keys
  if (got !== want) throw new Error(`${name}: the registry checksum is ${got}, expected ${want}. Stop and find out why before vendoring.`);
}
const rampartDir = path.join(nm, RAMPART);

// The entry: one function that always takes a base URL, so the package's default Hugging Face model URL is never used.
// onnxruntime-web is aliased to its WASM-only build that loads the engine from wasmPaths (no inlined engine, no WebGL).
const entry = path.join(work, 'entry.mjs');
fs.writeFileSync(entry, `// Rampart Edge ${RAMPART_VERSION} with onnxruntime-web ${ORT_VERSION} (WASM only, one thread), bundled by scripts/vendor-rampart.mjs.
import * as ort from '${ORT}';
import { createGate as create, createValidatorGate } from '${RAMPART}';

export { createValidatorGate };
export const versions = { rampart: '${RAMPART_VERSION}', ort: '${ORT_VERSION}' };

// base: the URL of this folder. Engine and model are read from under it, never from another host.
// modelBase overrides only where the model files come from (tests serve them over 127.0.0.1).
export async function createLocalGate(base, { modelBase } = {}) {
  if (!base) throw new Error('createLocalGate needs the URL of the vendored folder');
  const at = new URL(base, globalThis.location?.href);
  ort.env.wasm.wasmPaths = { wasm: new URL('ort-wasm-simd-threaded.wasm', at).href, mjs: new URL('ort-wasm-simd-threaded.mjs', at).href };
  ort.env.wasm.numThreads = 1; // no worker threads, so no blob workers
  ort.env.wasm.proxy = false;
  return create({ ort, modelBaseUrl: new URL(modelBase ?? 'model/', at).href });
}
`);

const bundle = path.join(out, 'rampart-edge.mjs');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'model/onnx'), { recursive: true });
execFileSync('npx', ['--yes', ESBUILD, entry, '--bundle', '--format=esm', '--platform=browser', '--target=es2022', '--minify',
  '--legal-comments=inline', `--alias:${ORT}=${path.join(nm, ORT, 'dist/ort.wasm.min.mjs')}`, `--outfile=${bundle}`], { cwd: work, stdio: 'inherit' });

const copies = [
  ['runtime/ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.mjs'],
  ['runtime/ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.wasm'],
  ['model/onnx/model_q4.onnx', 'model/onnx/model_q4.onnx'],
  ['model/vocab.txt', 'model/vocab.txt'],
];
for (const [from, to] of copies) fs.copyFileSync(path.join(rampartDir, from), path.join(out, to));

// Rampart checks the model files against model/config.json itself; check them here too before writing the manifest.
const config = JSON.parse(fs.readFileSync(path.join(rampartDir, 'model/config.json'), 'utf8'));
const sha = (f) => createHash('sha256').update(fs.readFileSync(f)).digest('hex');
for (const [name, want] of Object.entries(config.files)) {
  const f = path.join(out, 'model', name);
  if (!fs.existsSync(f)) continue;
  const got = { bytes: fs.statSync(f).size, sha256: sha(f) };
  if ((want.bytes ?? want.size) !== got.bytes || (want.sha256 && want.sha256 !== got.sha256)) throw new Error(`model/${name} does not match model/config.json`);
}

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = walk(out).map((f) => ({ path: path.relative(out, f).split(path.sep).join('/'), bytes: fs.statSync(f).size, sha256: sha(f) }))
  .sort((a, b) => a.path.localeCompare(b.path));
const manifest = {
  about: 'Rampart Edge served from this site. Rebuild with node scripts/vendor-rampart.mjs; test/rampart.test.js checks every file against this list.',
  packages: [
    { name: RAMPART, version: RAMPART_VERSION, license: pkg(RAMPART).license },
    { name: ORT, version: ORT_VERSION, license: pkg(ORT).license },
  ],
  bundler: ESBUILD,
  totalBytes: files.reduce((n, f) => n + f.bytes, 0),
  files,
};
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
for (const f of files) console.log(`${String(f.bytes).padStart(9)}  ${f.path}`);
console.log(`${String(manifest.totalBytes).padStart(9)}  total (plus manifest.json)`);
