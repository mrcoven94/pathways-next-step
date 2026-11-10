// /report: reads public/data/*.json and fills the page. The HTML is built and escaped in report-client.js;
// this file only assigns it. Each section renders on its own, so bad data in one never stops the other.

import { runsOf, fixturesMatch, rampartView, checksView, criteriaView } from './report-client.js';

const $ = (s) => document.querySelector(s);
const getText = (url) => fetch(url).then((r) => (r.ok ? r.text() : null)).catch(() => null);
const parse = (text) => { try { return JSON.parse(text); } catch { return null; } };

const [rampartText, fixturesText, mutationsText] = await Promise.all([getText('/data/rampart-eval.json'), getText('/data/synthetic-notes.json'), getText('/data/mutations.json')]);

try {
  $('#criteria-body').innerHTML = criteriaView(parse(mutationsText));
} catch {
  $('#criteria-body').textContent = 'This data could not be read.';
}

try {
  const data = parse(rampartText);
  const v = rampartView(data, parse(fixturesText), await fixturesMatch(runsOf(data)[0], fixturesText));
  $('#headline').textContent = v.headline;
  $('#rampart-run').textContent = v.runText;
  if (v.noteCount !== null) for (const id of ['#method-notes', '#method-count']) $(id).textContent = String(v.noteCount);
  $('.kinds .before-col').hidden = !v.showBefore;
  $('#kinds-body').innerHTML = v.kinds;
  $('#key-body').innerHTML = v.key;
  $('#key-why').textContent = v.keyWhy;
  $('#timing').textContent = v.timing;
  $('#notes-body').innerHTML = v.notes;
} catch {
  $('#headline').textContent = 'The detector results could not be read.';
}

try {
  const c = checksView(parse(mutationsText));
  $('#checks-run').textContent = c.runText;
  $('#checks-body').innerHTML = c.body;
  $('.checks').hidden = c.hideTable;
} catch {
  $('#checks-run').textContent = 'This data could not be read.';
}
