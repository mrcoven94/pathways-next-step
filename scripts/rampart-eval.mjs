#!/usr/bin/env node
// Opt-in evaluation of Rampart Edge on invented advisor notes (test/fixtures/synthetic-notes.json).
// Installs the packages into os.tmpdir(), never into this repo, so npm start and npm test stay install-free.
// Writes what it measured to docs/rampart-eval.json. Rampart is a third layer, not the boundary that keeps
// a note away from a model; the "sensitive, no identifiers" row is the evidence for that.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PKG = '@nationaldesignstudio/rampart-edge';
const VERSION = '2.0.5';
const ORT = 'onnxruntime-web@1.30.0'; // the version whose trimmed engine the package bundles
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/synthetic-notes.json'), 'utf8')).notes;
const outFile = path.join(root, 'docs/rampart-eval.json');

// 1. Install outside the repo (cached between runs).
const dir = path.join(os.tmpdir(), `rampart-eval-${VERSION}`);
const pkgDir = path.join(dir, 'node_modules', PKG);
if (!fs.existsSync(path.join(pkgDir, 'package.json')) || !fs.existsSync(path.join(dir, 'node_modules/onnxruntime-web'))) {
  fs.mkdirSync(dir, { recursive: true });
  console.log(`Installing ${PKG}@${VERSION} and ${ORT} into ${dir}`);
  execFileSync('npm', ['install', '--prefix', dir, '--no-audit', '--no-fund', '--ignore-scripts', `${PKG}@${VERSION}`, ORT], { stdio: 'inherit' });
}
const installed = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')).version;
const rampart = await import(pathToFileURL(path.join(pkgDir, 'dist/index.js')).href);

// 2. Serve the model files the package ships (pinned by size and SHA-256 in model/config.json) from
//    127.0.0.1, so nothing is fetched from Hugging Face and no note text leaves this machine.
const modelDir = path.join(pkgDir, 'model');
const server = http.createServer((req, res) => {
  const file = path.join(modelDir, path.normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (!file.startsWith(modelDir + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (err, buf) => (err ? res.writeHead(404).end() : res.end(buf)));
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));

let gate;
let basis = 'model';
let fallbackReason = null;
try {
  gate = await rampart.createGate({ modelBaseUrl: `http://127.0.0.1:${server.address().port}/` });
} catch (err) {
  fallbackReason = `${err?.name ?? 'Error'}: ${err?.message ?? err}`;
  try {
    gate = rampart.createValidatorGate();
    basis = 'validators-only';
  } catch (err2) {
    server.close();
    console.error(`Could not create any Rampart gate: ${err2?.message ?? err2}`);
    process.exit(1);
  }
}
if (basis === 'validators-only') {
  const bar = '!'.repeat(72);
  console.log(`\n${bar}\nVALIDATORS ONLY. The model gate did not load in Node, so these are NOT model numbers.\nReason: ${fallbackReason}\n${bar}`);
}

// 3. Run every note.
const results = [];
for (const note of fixtures) {
  const t0 = performance.now();
  const d = await gate.check(note.text);
  const ms = performance.now() - t0;
  results.push({ note, d, ms });
}
server.close();

// 4. Score. A value is caught when every character of it sits inside some returned span (any span type);
//    partial means a span touched it but did not cover it.
const TYPES = ['phone', 'email', 'address', 'name', 'dob', 'id', 'handle'];
const byType = Object.fromEntries(TYPES.map((t) => [t, { caught: 0, partial: 0, total: 0, missed: [] }]));
for (const { note, d } of results) {
  for (const e of note.expect) {
    const start = note.text.indexOf(e.value);
    if (start < 0) throw new Error(`fixture ${note.id}: "${e.value}" is not in the text`);
    const end = start + e.value.length;
    let covered = 0;
    for (let i = start; i < end; i++) if (d.spans.some((s) => s.start <= i && i < s.end)) covered++;
    const row = byType[e.type];
    row.total++;
    if (covered === end - start) row.caught++;
    else {
      if (covered > 0) row.partial++;
      row.missed.push(note.id);
    }
  }
}
const group = (g) => results.filter((r) => r.note.group === g);
const sensitive = group('sensitive');
const harmless = group('harmless');
const sensitiveAllowed = sensitive.filter((r) => r.d.verdict === 'ALLOW');
const harmlessBlocked = harmless.filter((r) => r.d.verdict === 'BLOCK');
const times = results.map((r) => r.ms).sort((a, b) => a - b);
const mid = times.length >> 1;
const median = times.length % 2 ? times[mid] : (times[mid - 1] + times[mid]) / 2;
const basesSeen = [...new Set(results.map((r) => r.d.basis))];

// 5. Print.
const pad = (s, n) => String(s).padEnd(n);
console.log(`\nRampart Edge ${installed}, gate basis: ${basis.toUpperCase()}, ${results.length} invented notes\n`);
console.log(`${pad('type', 9)}${pad('caught', 9)}${pad('partial', 9)}missed notes`);
for (const t of TYPES) {
  const r = byType[t];
  if (r.total) console.log(`${pad(t, 9)}${pad(`${r.caught}/${r.total}`, 9)}${pad(r.partial, 9)}${r.missed.join(' ') || '-'}`);
}
console.log(`\nSensitive notes with no identifiers that got ALLOW: ${sensitiveAllowed.length}/${sensitive.length}`);
console.log('  (a detector passing these is correct for a detector; they still must never reach a model)');
console.log(`Harmless notes wrongly blocked: ${harmlessBlocked.length}/${harmless.length}${harmlessBlocked.length ? ' (' + harmlessBlocked.map((r) => r.note.id).join(' ') + ')' : ''}`);
console.log(`Median time per note: ${median.toFixed(2)} ms (min ${times[0].toFixed(2)}, max ${times.at(-1).toFixed(2)})`);
if (basis === 'validators-only') console.log('\nREMINDER: validators only, not the model.');

// 6. Write what was measured.
const report = {
  date: new Date().toISOString(),
  package: PKG,
  version: installed,
  runtime: `node ${process.version}, ${ORT}`,
  basis,
  fallbackReason,
  decisionBasesSeen: basesSeen,
  notes: results.length,
  coverageRule: 'caught = every character of the expected value lies inside a returned span of any type',
  byType: Object.fromEntries(TYPES.filter((t) => byType[t].total).map((t) => [t, byType[t]])),
  sensitiveNoIdentifiers: { allowed: sensitiveAllowed.length, total: sensitive.length, blocked: sensitive.filter((r) => r.d.verdict === 'BLOCK').map((r) => r.note.id) },
  harmlessWronglyBlocked: { blocked: harmlessBlocked.length, total: harmless.length, ids: harmlessBlocked.map((r) => r.note.id) },
  medianMsPerNote: Number(median.toFixed(3)),
  perNote: results.map(({ note, d, ms }) => ({ id: note.id, group: note.group, verdict: d.verdict, basis: d.basis, spanTypes: d.spans.map((s) => s.type), ms: Number(ms.toFixed(3)) })),
};
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(report, null, 2) + '\n');
console.log(`\nWrote ${path.relative(root, outFile)}`);
