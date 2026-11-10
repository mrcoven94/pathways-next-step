// AC22: Rampart Edge is served from this site and used on both pages that hold a note in the clear
// (the student's phone and the advisor's browser). Nothing is fetched from another host, the vendored
// files match their manifest, and the real model runs here on invented notes with no install.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fromRampart, builtinSpans, mergeSpans, maskNote } from '../public/advisor-client.js';
import { startApp } from './helpers.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const PUBLIC = join(root, 'public');
const VENDOR = join(PUBLIC, 'vendor', 'rampart');
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const rel = (f, from = PUBLIC) => relative(from, f).split(sep).join('/');
const read = (f) => readFileSync(f, 'utf8');
const URLS = /https?:\/\/[^\s"'`)<>\\]+/g;

const POLICY = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

test('AC22 no page, script or style links to another host, and nothing names a CDN', () => {
  const ours = walk(PUBLIC).filter((f) => /\.(html|js|mjs|css)$/.test(f) && !rel(f).startsWith('vendor/'));
  assert.ok(ours.some((f) => rel(f) === 'app.js') && ours.some((f) => rel(f) === 'rampart.js'));
  const found = [];
  for (const f of ours) {
    const text = read(f);
    for (const m of text.matchAll(URLS)) {
      const url = m[0];
      if (url.startsWith('https://github.com/mrcoven94/pathways-next-step/')) continue; // links a person clicks on /how
      if (url === 'http://www.w3.org/2000/svg') continue; // an SVG namespace inside a CSS data URL, never fetched
      found.push(`${rel(f)}: ${url}`);
    }
    for (const word of ['jsdelivr', 'unpkg', 'huggingface', 'cdnjs', 'esm.sh', 'skypack']) {
      if (text.toLowerCase().includes(word)) found.push(`${rel(f)}: names ${word}`);
    }
  }
  assert.deepEqual(found, []);
});

test('AC22 the vendored code names only two remote hosts, and the loader always passes our own folder', async () => {
  const urls = new Set();
  for (const f of walk(VENDOR).filter((f) => /\.m?js$/.test(f))) for (const m of read(f).matchAll(URLS)) urls.add(`${rel(f, VENDOR)} ${new URL(m[0]).host}`);
  // huggingface.co is Rampart's default model URL, used only when no base URL is given; web.dev is text in an error message.
  assert.deepEqual([...urls].sort(), ['rampart-edge.mjs huggingface.co', 'rampart-edge.mjs web.dev']);

  const loader = read(join(PUBLIC, 'rampart.js'));
  assert.ok(!loader.includes('://'), 'public/rampart.js names no URL');
  assert.match(loader, /new URL\('\.\/vendor\/rampart\/', import\.meta\.url\)/, 'the base is this site’s own /vendor/rampart/');
  assert.match(loader, /createLocalGate\(BASE\)/, 'the loader always passes that base');
  assert.match(read(join(PUBLIC, 'app.js')), /import\('\.\/rampart\.js'\)/, 'the student page loads the same copy');
  assert.match(read(join(PUBLIC, 'advisor.js')), /from '\.\/rampart\.js'/, 'the inbox loads the same copy');

  const bundle = await import(pathToFileURL(join(VENDOR, 'rampart-edge.mjs')).href);
  await assert.rejects(() => bundle.createLocalGate(), /needs the URL/, 'without a base URL the bundle refuses, so the default host is never used');
});

test('AC22 every vendored file matches manifest.json, and nothing else is in the folder', () => {
  const manifest = JSON.parse(read(join(VENDOR, 'manifest.json')));
  const listed = manifest.files.map((f) => f.path).sort();
  const onDisk = walk(VENDOR).map((f) => rel(f, VENDOR)).filter((p) => p !== 'manifest.json').sort();
  assert.deepEqual(onDisk, listed);
  for (const f of manifest.files) {
    const file = join(VENDOR, f.path);
    assert.equal(statSync(file).size, f.bytes, f.path);
    assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'), f.sha256, f.path);
  }
  assert.equal(manifest.totalBytes, manifest.files.reduce((n, f) => n + f.bytes, 0));
  assert.ok(manifest.totalBytes < 20 * 1024 * 1024);
  assert.deepEqual(manifest.packages.map((p) => `${p.name}@${p.version} ${p.license}`),
    ['@nationaldesignstudio/rampart-edge@2.0.5 CC0-1.0', 'onnxruntime-web@1.30.0 MIT']);
  assert.ok(!existsSync(join(root, 'node_modules')), 'no install in the repo');
});

test('AC22 the inbox policy allows WASM and nothing else new, locally and on Vercel', async () => {
  const vercel = JSON.parse(read(join(root, 'vercel.json')));
  const rule = vercel.headers.find((h) => h.source === '/advisor').headers.find((h) => h.key === 'Content-Security-Policy');
  assert.equal(rule.value, POLICY);
  const app = await startApp({ advisorCode: 'x' });
  try {
    const page = await fetch(`${app.base}/advisor`);
    assert.equal(page.headers.get('content-security-policy'), POLICY);
    const types = {
      '/rampart.js': 'text/javascript',
      '/vendor/rampart/rampart-edge.mjs': 'text/javascript',
      '/vendor/rampart/ort-wasm-simd-threaded.mjs': 'text/javascript',
      '/vendor/rampart/ort-wasm-simd-threaded.wasm': 'application/wasm',
      '/vendor/rampart/model/onnx/model_q4.onnx': 'application/octet-stream',
      '/vendor/rampart/model/vocab.txt': 'text/plain; charset=utf-8',
      '/vendor/rampart/manifest.json': 'application/json',
    };
    for (const [path, type] of Object.entries(types)) {
      const res = await fetch(app.base + path);
      assert.equal(res.status, 200, path);
      assert.equal(res.headers.get('content-type'), type, path);
      await res.arrayBuffer();
    }
  } finally {
    await app.close();
  }
});

// The model test reads the vendored files from disk. public/rampart.js builds its URLs from import.meta.url, which is a
// file: URL under Node, and Node's fetch does not read file: URLs, so this shim answers fetch for files inside
// public/vendor/rampart only (the browser gets the same bytes over HTTP). Nothing is installed.
function serveVendorFromDisk() {
  const real = globalThis.fetch;
  const prefix = pathToFileURL(VENDOR + sep).href;
  const outside = []; // any request that is not for a vendored file. There must be none.
  globalThis.fetch = async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith('file:')) { outside.push(url); throw new Error(`AC22: the detector asked for ${url}`); }
    if (!url.startsWith(prefix)) return new Response(null, { status: 404 });
    try { return new Response(readFileSync(fileURLToPath(url))); } catch { return new Response(null, { status: 404 }); }
  };
  return { outside, restore: () => { globalThis.fetch = real; } };
}

const NOTES = Object.fromEntries(JSON.parse(read(join(root, 'test/fixtures/synthetic-notes.json'))).notes.map((n) => [n.id, n]));
const shownText = (segs) => segs.filter((s) => !s.masked).map((s) => s.text).join('');

test('AC22 the real model, loaded from the vendored files, finds and masks contact details and passes private notes it cannot see', async () => {
  const { outside, restore } = serveVendorFromDisk();
  try {
    const { loadGate } = await import('../public/rampart.js');
    const gate = await loadGate(60_000);
    assert.ok(gate, 'the vendored gate loaded in Node');

    const caught = {};
    for (const id of ['c01', 'c02', 'a01', 'n01']) {
      const { text, expect } = NOTES[id];
      const d = await gate.check(text);
      assert.equal(d.verdict, 'BLOCK', id);
      assert.equal(d.basis.includes('model'), true, `${id} was read by the model, not only the validators`);
      const spans = fromRampart(d.spans);
      caught[id] = d.spans.map((s) => s.type);
      const shown = shownText(maskNote(text, spans, new Set()));
      for (const e of expect) assert.ok(!shown.includes(e.value), `${id}: "${e.value}" is hidden`);
      assert.equal(maskNote(text, spans, new Set()).map((s) => s.text).join(''), text, `${id}: nothing else changes`);
    }
    assert.deepEqual(caught, { c01: ['PHONE'], c02: ['EMAIL'], a01: ['ADDRESS'], n01: ['NAME'] });

    // c04: Rampart covers only part of the phone number; merged with the built-in patterns, both details are hidden.
    const c04 = NOTES.c04;
    const merged = mergeSpans(fromRampart((await gate.check(c04.text)).spans), builtinSpans(c04.text));
    const shown = shownText(maskNote(c04.text, merged, new Set()));
    for (const e of c04.expect) assert.ok(!shown.includes(e.value), `c04: "${e.value}" is hidden`);

    // The point: these notes are as private as notes get and hold no identifier. A detector lets them through,
    // correctly, which is why the note itself never goes to a model.
    for (const id of ['s01', 's03', 's05']) {
      const d = await gate.check(NOTES[id].text);
      assert.equal(d.verdict, 'ALLOW', id);
      assert.deepEqual(fromRampart(d.spans), [], id);
      assert.ok(maskNote(NOTES[id].text, fromRampart(d.spans), new Set()).every((s) => !s.masked), `${id}: nothing to mask`);
    }
  } finally {
    restore();
  }
  assert.deepEqual(outside, [], 'loading the model and reading five notes asked no other host for anything');
});
