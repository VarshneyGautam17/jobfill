// Regression test for a real bug report: after Shadow DOM support was
// added, JobFill started reporting "50+ fields" on ordinary pages and
// detecting garbage entries like "q" or "w". Root cause: piercing every
// shadow root also reaches into things present on almost any site (cookie
// banners, chat widgets, search boxes, third-party embeds), and their
// internal inputs are often completely unlabeled. This proves two things:
// unlabeled noise is never detected at all, and it never counts toward the
// 50-field safety cap even when there's a lot of it.
// Run with: node tests/label-signal.test.js  (after `npm install`)
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const EXT_DIR = path.resolve(__dirname, '..');
const results = [];
function check(name, condition, detail) {
  results.push({ name, pass: !!condition, detail: detail || '' });
}

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>', { runScripts: 'dangerously' });
const { window } = dom;
global.window = window;
global.document = window.document;

['content/constants.js', 'content/utils.js', 'content/detector.js']
  .forEach((f) => window.eval(fs.readFileSync(path.join(EXT_DIR, f), 'utf8')));

const app = document.getElementById('app');

// Simulate a realistic page: 200 completely unlabeled internal inputs
// (single/short cryptic names, no label/placeholder/aria-label — exactly
// what a cookie-consent widget, chat launcher, or minified component
// library's internal state inputs look like) mixed with 5 real,
// well-labeled job-application fields.
const noiseNames = [];
for (let i = 0; i < 200; i++) {
  const el = document.createElement('input');
  el.name = i < 26 ? String.fromCharCode(97 + i) : `n${i}`; // "a".."z", then n26, n27, ...
  noiseNames.push(el.name);
  app.appendChild(el);
}

function labeledField(name, labelText) {
  const wrapper = document.createElement('div');
  const label = document.createElement('label');
  label.setAttribute('for', name);
  label.textContent = labelText;
  const input = document.createElement('input');
  input.name = name;
  input.id = name;
  wrapper.appendChild(label);
  wrapper.appendChild(input);
  app.appendChild(wrapper);
  return input;
}
labeledField('firstName', 'First Name');
labeledField('lastName', 'Last Name');
labeledField('email', 'Email');
labeledField('phone', 'Phone');
labeledField('company', 'Current Company');

const records = window.JobFillDetector.scan(document);

check('200 unlabeled noise inputs are not detected at all', !records.some((r) => noiseNames.includes(r.name)));
check('all 5 real labeled fields are still detected', records.length === 5, `got ${records.length}: ${records.map((r) => r.name).join(',')}`);
check(
  'the safety cap does NOT trip despite 200+ raw candidates on the page',
  window.JobFillDetector.isStopped() === false
);
check(
  'none of the detected records are unnamed/unlabeled garbage',
  records.every((r) => r.labelText && r.labelText.trim().length > 0),
  JSON.stringify(records.map((r) => ({ name: r.name, labelText: r.labelText })))
);

// ---- report ----
const failed = results.filter((r) => !r.pass);
console.log(`\nJobFill label-signal test suite: ${results.length - failed.length}/${results.length} passed\n`);
results.forEach((r) => console.log(`${r.pass ? '✓' : '✗'} ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`));
if (failed.length) {
  console.log(`\n${failed.length} FAILURE(S)`);
  process.exit(1);
} else {
  console.log('\nAll checks passed.');
}
