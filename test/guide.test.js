// AC24: the walkthrough at /guide. It quotes the task and its four criteria word for word, every link on it
// goes somewhere this app serves or to this project's own repository, and it loads nothing from anywhere else.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startApp } from './helpers.js';

const PAGE = readFileSync(new URL('../public/guide.html', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../public/guide.css', import.meta.url), 'utf8');
const REPO = 'https://github.com/mrcoven94/pathways-next-step/';

const TASK = 'A student wants to leave a private note for their advisor. The note should be available through the intended advisor workflow but must never be sent to an AI model. Make the smallest safe change and show how you would verify it.';
const CRITERIA = [
  'Capture the note and make it available through the intended advisor workflow, or explicitly identify the missing infrastructure needed to do so.',
  'The note does not enter model request payloads; enforce this at a trustworthy boundary.',
  'Add an automated regression test (for example, a sentinel and model-calls.log inspection) that would fail on leakage.',
  'Explain what the test proves, what it misses, and how the behavior would differ in production.',
];

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
/** The page as a reader sees it: tags gone, entities decoded, whitespace collapsed. */
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&(amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e]).replace(/\s+/g, ' ');
const hrefs = [...PAGE.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

test('AC24 the app serves /guide and its stylesheet', async () => {
  const s = await startApp();
  try {
    const page = await fetch(`${s.base}/guide`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /^text\/html/);
    assert.equal(await page.text(), PAGE);
    const css = await fetch(`${s.base}/guide.css`);
    assert.equal(css.status, 200);
    assert.equal(css.headers.get('content-type'), 'text/css');
  } finally {
    await s.close();
  }
});

test('AC24 the page quotes the task and each of the four acceptance criteria word for word', () => {
  const shown = text(PAGE);
  assert.ok(shown.includes(TASK), 'the task');
  CRITERIA.forEach((c, i) => {
    assert.ok(shown.includes(c), `acceptance criterion ${i + 1}`);
    assert.ok(shown.includes(`Acceptance criterion ${i + 1}`), `a heading named for criterion ${i + 1}`);
    assert.ok(hrefs.includes(`#ac${i + 1}`) && PAGE.includes(`id="ac${i + 1}"`), `a link at the top jumps to criterion ${i + 1}`);
  });
});

test('AC24 every internal link is one the app serves, and every outside link is this project\'s own repository', async () => {
  const internal = [...new Set(hrefs.filter((h) => h.startsWith('/') && !h.startsWith('//')))];
  for (const path of ['/', '/advisor', '/how', '/report']) assert.ok(internal.includes(path), `the page links to ${path}`);
  for (const id of hrefs.filter((h) => h.startsWith('#'))) assert.ok(PAGE.includes(`id="${id.slice(1)}"`), `${id} has a target`);

  const s = await startApp();
  try {
    // /report merges separately; until it does, the page only has to link to it.
    for (const path of internal.filter((p) => p !== '/report')) {
      const res = await fetch(s.base + path);
      assert.equal(res.status, 200, path);
      await res.arrayBuffer();
    }
  } finally {
    await s.close();
  }

  const outside = hrefs.filter((h) => /^[a-z]+:/i.test(h) && !h.startsWith('tel:'));
  assert.ok(outside.length > 0);
  for (const h of outside) assert.ok(h.startsWith(REPO), `${h} is in ${REPO}`);
  for (const n of [8, 9, 10, 11]) assert.ok(hrefs.includes(`${REPO}pull/${n}`), `pull request ${n} is linked`);
});

test('AC24 the page names no other host and has no inline script or style', () => {
  for (const [name, file] of [['guide.html', PAGE], ['guide.css', CSS]]) {
    for (const m of file.matchAll(/https?:\/\/[^\s"'`)<>\\]+/g)) assert.ok(m[0].startsWith(REPO), `${name} names ${m[0]}`);
    assert.ok(!/\/\/[a-z0-9-]+\.[a-z]/i.test(file.replace(/https:\/\/github\.com\/mrcoven94\/pathways-next-step\/[^\s"'<]*/g, '')), `${name} names no other host`);
    assert.ok(!/localhost|vercel\.app/i.test(file), `${name} names no server`);
  }
  const scripts = PAGE.match(/<script\b[^>]*>/gi) ?? [];
  assert.deepEqual(scripts, ['<script type="module" src="/nav.js">'], 'the one script is the shared page list, from this site');
  assert.ok(!/<script\b[^>]*>\s*\S/i.test(PAGE.replace(/<script type="module" src="\/nav.js"><\/script>/, '')), 'no inline script');
  assert.ok(!/\sstyle\s*=/i.test(PAGE), 'no inline style attribute');
  assert.ok(!/<style\b/i.test(PAGE), 'no style element');
  assert.ok(!/\son[a-z]+\s*=/i.test(PAGE), 'no inline event handler');
  assert.ok(!/<(iframe|embed|object)\b/i.test(PAGE), 'nothing embedded from elsewhere');
});

test('AC24 no em dash appears in the page or its stylesheet', () => {
  for (const [name, file] of [['guide.html', PAGE], ['guide.css', CSS]]) {
    assert.ok(!file.includes('—'), `${name} has no em dash`);
    assert.ok(!/&mdash;|&#8212;|&#x2014;/i.test(file), `${name} has no em dash entity`);
  }
});
