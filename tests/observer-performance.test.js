// Regression test for a real incident: on a Web-Components-heavy SPA
// (SmartRecruiters), the shadow-DOM-aware MutationObserver did expensive
// recursive shadow-root discovery SYNCHRONOUSLY on every raw mutation
// event (not debounced), which froze the tab. This proves the fix: all
// heavy work is now batched into a single debounced pass per burst, and a
// circuit breaker backs off entirely if a page mutates unusually often.
// Run with: node tests/observer-performance.test.js  (after `npm install`)
// Not included in `npm test`'s fast path — run manually when touching
// content/observer.js, since the circuit-breaker check needs several
// real seconds of wall-clock time.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const EXT_DIR = path.resolve(__dirname, '..');
const results = [];
function check(name, condition, detail) {
  results.push({ name, pass: !!condition, detail: detail || '' });
}

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>', {
  url: 'https://example.com/apply',
  runScripts: 'dangerously'
});
const { window } = dom;
global.window = window;
global.document = window.document;

['content/constants.js', 'content/utils.js', 'content/detector.js', 'content/confidence.js', 'content/mapper.js', 'content/filler.js', 'content/observer.js']
  .forEach((f) => window.eval(fs.readFileSync(path.join(EXT_DIR, f), 'utf8')));

const app = document.getElementById('app');

// Spy on the real scan() so we can count how many times the expensive
// full-document pass actually runs, without changing its behavior.
let scanCalls = 0;
const realScan = window.JobFillDetector.scan;
window.JobFillDetector.scan = function (...args) {
  scanCalls++;
  return realScan.apply(this, args);
};

const warnings = [];
const realWarn = console.warn;
console.warn = (...args) => { warnings.push(args.join(' ')); realWarn(...args); };

window.JobFillObserver.start(() => {});

// ---- 1. Debounce compaction: a burst of synchronous mutations must
// collapse into a small, bounded number of scans, not one per mutation. ----
for (let i = 0; i < 80; i++) {
  const el = document.createElement('sr-widget-' + i);
  app.appendChild(el);
}

setTimeout(() => {
  check(
    '80 rapid-fire DOM insertions collapse into a small bounded number of scans (debounced), not 80',
    scanCalls > 0 && scanCalls <= 3,
    `scan() was called ${scanCalls} time(s)`
  );

  // ---- 2. Circuit breaker: sustained bursts spaced past the debounce
  // window must eventually trigger backoff instead of scanning forever. ----
  scanCalls = 0;
  let burstsSent = 0;
  const BURSTS = 14;
  const GAP_MS = 550; // > the 500ms debounce, so each burst gets its own settled flush

  const sendBurst = () => {
    burstsSent++;
    const el = document.createElement('sr-burst-' + burstsSent);
    app.appendChild(el);
    if (burstsSent < BURSTS) {
      setTimeout(sendBurst, GAP_MS);
    } else {
      // give the final debounce + circuit-breaker check time to settle
      setTimeout(finishCircuitBreakerCheck, GAP_MS + 100);
    }
  };

  function finishCircuitBreakerCheck() {
    check(
      'sustained mutation bursts eventually trigger the circuit breaker (console.warn)',
      warnings.some((w) => w.includes('pausing automatic re-scans')),
      `warnings: ${JSON.stringify(warnings)}`
    );
    check(
      'circuit breaker caps total scans well below one-per-burst',
      scanCalls < BURSTS,
      `scan() called ${scanCalls} times across ${BURSTS} bursts`
    );

    console.warn = realWarn;

    const failed = results.filter((r) => !r.pass);
    console.log(`\nJobFill observer performance test suite: ${results.length - failed.length}/${results.length} passed\n`);
    results.forEach((r) => console.log(`${r.pass ? '✓' : '✗'} ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`));
    if (failed.length) {
      console.log(`\n${failed.length} FAILURE(S)`);
      process.exit(1);
    } else {
      console.log('\nAll checks passed.');
    }
  }

  sendBurst();
}, 700);
