// Regression test for Shadow DOM support, added after a real-world bug
// report: SmartRecruiters' "oneclick-ui" apply forms (and many modern
// component libraries — Workday, design systems built on Web Components)
// wrap every field in a custom element with an OPEN shadow root, which
// document.querySelectorAll cannot see through. JobFill reported "0
// fields detected" on a real ixigo/SmartRecruiters job page as a result.
// This builds a similar shadow-DOM-heavy fixture programmatically (jsdom
// supports attachShadow) and verifies detection, filling, and dynamic
// (mid-session) shadow-hosted field discovery all work.
// Run with: node tests/shadow-dom.test.js  (after `npm install`)
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const EXT_DIR = path.resolve(__dirname, '..');
const results = [];
function check(name, condition, detail) {
  results.push({ name, pass: !!condition, detail: detail || '' });
}

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>', {
  url: 'https://jobs.smartrecruiters.com/oneclick-ui/company/example',
  runScripts: 'dangerously'
});
const { window } = dom;
global.window = window;
global.document = window.document;

['content/constants.js', 'content/utils.js', 'content/detector.js', 'content/confidence.js', 'content/mapper.js', 'content/filler.js', 'content/observer.js']
  .forEach((f) => window.eval(fs.readFileSync(path.join(EXT_DIR, f), 'utf8')));

// Build a field wrapped in its own open shadow root, mimicking a
// component-library <sr-input> custom element with a real <input> inside.
function makeShadowField({ tag, name, id, labelText, type }) {
  const host = document.createElement(tag);
  const shadow = host.attachShadow({ mode: 'open' });
  const label = document.createElement('label');
  label.setAttribute('for', id);
  label.textContent = labelText;
  const input = document.createElement('input');
  input.type = type || 'text';
  input.name = name;
  input.id = id;
  shadow.appendChild(label);
  shadow.appendChild(input);
  return { host, input };
}

const app = document.getElementById('app');
const firstName = makeShadowField({ tag: 'sr-input', name: 'firstName', id: 'fn', labelText: 'First name' });
const lastName = makeShadowField({ tag: 'sr-input', name: 'lastName', id: 'ln', labelText: 'Last name' });
const email = makeShadowField({ tag: 'sr-input', name: 'email', id: 'em', labelText: 'Email', type: 'email' });
app.appendChild(firstName.host);
app.appendChild(lastName.host);
app.appendChild(email.host);

const profile = {
  personal: { firstName: 'Gautam', lastName: 'Varshney', email: 'gautam@example.com', fullName: '' },
  professional: {}, links: {}, education: {}, preferences: {}
};
const settings = window.JobFillConstants.DEFAULT_SETTINGS;

// ---- 1. Initial detection must see fields nested in shadow roots ----
const records = window.JobFillDetector.scan(document);
check('detector finds fields nested inside shadow roots', records.length === 3, `found ${records.length}`);

const plan = window.JobFillMapper.plan(records, { profile, siteMappings: {}, settings: Object.assign({}, settings) });
const byName = (n) => plan.find((p) => p.record.name === n);
check('shadow-hosted firstName classified correctly', byName('firstName') && byName('firstName').fieldType === 'FIRST_NAME');
check(
  'label text resolved via getRootNode (same shadow root), not document',
  byName('firstName') && byName('firstName').record.labelText === 'First name',
  byName('firstName') ? byName('firstName').record.labelText : 'missing'
);
check('shadow-hosted email classified correctly', byName('email') && byName('email').fieldType === 'EMAIL');

// ---- 2. Filling must reach into the shadow root and update the real input ----
plan.forEach((item) => {
  if (item.status === 'fill' || item.status === 'fill-review') window.JobFillFiller.fillItem(item);
});
check('shadow-hosted firstName input actually updated', firstName.input.value === 'Gautam', firstName.input.value);
check('shadow-hosted email input actually updated', email.input.value === 'gautam@example.com', email.input.value);

// ---- 3. A composed:true input event should escape the shadow boundary,
// which is how an outer app's own listener (sitting in the light DOM,
// outside the component's shadow root) would observe our fill. ----
let composedPathSawIt = false;
document.addEventListener('input', (e) => {
  if (e.composed && e.composedPath().includes(lastName.input)) composedPathSawIt = true;
}, true);
window.JobFillFiller.setNativeValue(lastName.input, 'Varshney2');
check('outer light-DOM listener can trace a composed event back to the shadow-hosted input', composedPathSawIt);

// ---- 4. Dynamically-added shadow-hosted field (new form step) must be observed ----
let capturedNewFields = [];
window.JobFillObserver.start((newRecords) => { capturedNewFields = capturedNewFields.concat(newRecords); });
const phone = makeShadowField({ tag: 'sr-input', name: 'phone', id: 'ph', labelText: 'Phone', type: 'tel' });
app.appendChild(phone.host);
// The observer's own debounce (500ms) needs to fire and call back into
// onNewFields before we can check what it found.
setTimeout(() => {
  check(
    'newly-added shadow-hosted field (added after observer start) is detected via the observer callback',
    capturedNewFields.some((r) => r.name === 'phone'),
    `observer reported: ${capturedNewFields.map((r) => r.name).join(',')}`
  );

  // ---- report ----
  const failed = results.filter((r) => !r.pass);
  console.log(`\nJobFill Shadow DOM test suite: ${results.length - failed.length}/${results.length} passed\n`);
  results.forEach((r) => console.log(`${r.pass ? '✓' : '✗'} ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`));
  if (failed.length) {
    console.log(`\n${failed.length} FAILURE(S)`);
    process.exit(1);
  } else {
    console.log('\nAll checks passed.');
  }
}, 600);
