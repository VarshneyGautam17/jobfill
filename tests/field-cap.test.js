// Regression test for the hard 50-field safety cap (constants.js
// MAX_DETECTED_FIELDS), added after a real incident: on a pathological
// page, detection kept finding dozens of internal implementation-detail
// inputs and the page hung. Past the cap, detection must stop immediately
// and stay stopped — no further DOM querying at all, not even a cheap one.
// Run with: node tests/field-cap.test.js  (after `npm install`)
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
for (let i = 0; i < 60; i++) {
  const input = document.createElement('input');
  input.name = `field${i}`;
  input.placeholder = `Field ${i}`;
  app.appendChild(input);
}

const MAX = window.JobFillConstants.MAX_DETECTED_FIELDS; // 50

// ---- 1. First scan stops exactly at the cap, not at 60 ----
const first = window.JobFillDetector.scan(document);
check('first scan returns exactly MAX_DETECTED_FIELDS records, not all 60', first.length === MAX, `got ${first.length}`);
check('detector reports itself stopped once the cap is hit', window.JobFillDetector.isStopped() === true);

// ---- 2. Any further scan call short-circuits completely (no DOM query) ----
// Prove "no DOM query" by spying on document.querySelectorAll — if scan()
// is truly short-circuiting, it must not call it at all on a stopped page.
let queryCallsAfterStop = 0;
const realQSA = document.querySelectorAll.bind(document);
document.querySelectorAll = (...args) => {
  queryCallsAfterStop++;
  return realQSA(...args);
};
const second = window.JobFillDetector.scan(document);
check('scan() after being stopped returns an empty array', second.length === 0, `got ${second.length}`);
check(
  'scan() after being stopped does not touch the DOM at all',
  queryCallsAfterStop === 0,
  `document.querySelectorAll was called ${queryCallsAfterStop} time(s)`
);
document.querySelectorAll = realQSA;

// ---- report ----
const failed = results.filter((r) => !r.pass);
console.log(`\nJobFill field-cap test suite: ${results.length - failed.length}/${results.length} passed\n`);
results.forEach((r) => console.log(`${r.pass ? '✓' : '✗'} ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`));
if (failed.length) {
  console.log(`\n${failed.length} FAILURE(S)`);
  process.exit(1);
} else {
  console.log('\nAll checks passed.');
}
