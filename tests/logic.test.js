// Regression tests for the detection -> confidence -> mapping -> autofill
// pipeline. Loads the REAL content-script files into a simulated DOM
// (jsdom) and exercises them exactly as the browser would.
// Run with: node tests/logic.test.js  (after `npm install`)
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const EXT_DIR = path.resolve(__dirname, '..');
const results = [];

function check(name, condition, detail) {
  results.push({ name, pass: !!condition, detail: detail || '' });
}

const html = fs.readFileSync(path.join(__dirname, 'fixture.html'), 'utf8');
const dom = new JSDOM(html, { url: 'https://example.com/apply', runScripts: 'dangerously' });
const { window } = dom;
global.window = window;
global.document = window.document;

// Load the actual extension content-script files, in the same order
// declared in manifest.json, into the jsdom window context.
const files = [
  'content/constants.js',
  'content/utils.js',
  'content/detector.js',
  'content/confidence.js',
  'content/mapper.js',
  'content/filler.js'
];
files.forEach((f) => {
  const code = fs.readFileSync(path.join(EXT_DIR, f), 'utf8');
  window.eval(code);
});

const { DEFAULT_SETTINGS } = window.JobFillConstants;

const profile = {
  personal: {
    firstName: 'Gautam', lastName: 'Varshney', fullName: '', email: 'gautam@example.com',
    phone: '9999999999', country: 'India', city: 'Delhi', state: 'California', address: '221B Baker St', zip: '110001'
  },
  professional: {
    jobTitle: 'MERN Developer', company: 'Acme Corp', experienceYears: '3', summary: 'Full stack developer.',
    skills: 'React, Node.js, MongoDB', currentSalary: '12 LPA', expectedSalary: '18 LPA', noticePeriod: '30 Days',
    employmentType: 'Full-time'
  },
  links: { linkedin: 'linkedin.com/in/gautam', github: 'github.com/gautam', portfolio: '', stackoverflow: '', website: '' },
  education: { degree: 'B.Tech', university: 'DTU', fieldOfStudy: 'CS', startYear: '2016', endYear: '2020', gpa: '8.5' },
  preferences: { workAuthorization: 'Yes', relocation: 'Yes', remotePreference: 'Remote', sponsorship: 'No' }
};

const settings = Object.assign({}, DEFAULT_SETTINGS);

// ---- 1. Initial detection + mapping ----
const records = window.JobFillDetector.scan(document);
check('detector finds all top-level fields', records.length >= 15, `found ${records.length}`);

let plan = window.JobFillMapper.plan(records, { profile, siteMappings: {}, settings });
const byName = (n) => plan.find((p) => p.record.name === n || p.record.id === n);

const expectHigh = {
  firstName: 'FIRST_NAME',
  last_name: 'LAST_NAME',
  candidateEmail: 'EMAIL',
  mobile_number: 'PHONE',
  linkedinUrl: 'LINKEDIN',
  githubProfile: 'GITHUB',
  summary: 'SUMMARY',
  country: 'COUNTRY',
  state: 'STATE',
  workAuth: 'WORK_AUTHORIZATION',
  relocate: 'RELOCATION',
  stackoverflowUrl: 'STACKOVERFLOW'
};
Object.entries(expectHigh).forEach(([field, type]) => {
  const item = byName(field);
  check(`${field} -> ${type}`, item && item.fieldType === type, item ? `got ${item.fieldType} (${item.confidence})` : 'not found');
});

// ---- 2. Sensitive fields never touched ----
const pwd = byName('accountPassword');
check('password field flagged sensitive', pwd && pwd.status === 'sensitive');
const upi = byName('upi_pin');
check('UPI PIN field flagged sensitive', upi && upi.status === 'sensitive', upi ? upi.status : 'missing');

// ---- 3. Unknown field stays unresolved ----
const q7 = byName('q7');
check('unrecognizable field (q7) is unresolved, not guessed', q7 && q7.status === 'unresolved', q7 ? q7.status : 'missing');

// ---- 4. Medium-confidence field lands in the 60-84 band ----
const salaryGuess = byName('field_x1');
check(
  'label+aria-only match (no name/id signal) scores in medium band',
  salaryGuess && salaryGuess.confidence >= 60 && salaryGuess.confidence < 85 && salaryGuess.fieldType === 'EXPECTED_SALARY',
  salaryGuess ? `confidence=${salaryGuess.confidence} type=${salaryGuess.fieldType} status=${salaryGuess.status}` : 'missing'
);
check('medium-confidence field is fillable by default settings', salaryGuess && salaryGuess.status === 'fill-review');

// ---- 5. Empty profile value -> 'empty' status, not filled ----
const soItem = byName('stackoverflowUrl');
check('blank profile value -> status empty (not filled)', soItem && soItem.status === 'empty', soItem ? soItem.status : 'missing');

// ---- 6. Select option fuzzy matching ----
const countryItem = byName('country');
check('country select resolves exact text match (India)', countryItem && countryItem.optionMatch && countryItem.optionMatch.value === 'IN');
const stateItem = byName('state');
check(
  'state select resolves partial/contains match (California -> "CA - California")',
  stateItem && stateItem.optionMatch && stateItem.optionMatch.value === 'CA',
  stateItem ? JSON.stringify(stateItem.optionMatch) : 'missing'
);

// ---- 7. Actually fill the DOM and verify values landed ----
let filled = 0, failed = 0;
plan.filter((p) => p.status === 'fill' || p.status === 'fill-review').forEach((item) => {
  if (window.JobFillFiller.fillItem(item)) filled++; else failed++;
});
check('fill pass had zero failures', failed === 0, `filled=${filled} failed=${failed}`);

check('firstName DOM value updated', document.querySelector('[name=firstName]').value === 'Gautam');
check('email DOM value updated', document.querySelector('[name=candidateEmail]').value === 'gautam@example.com');
check('country select DOM value updated to IN', document.getElementById('countrySelect').value === 'IN');
check('state select DOM value updated to CA', document.getElementById('stateSelect').value === 'CA');
check('workAuth radio Yes is checked', document.getElementById('workAuthYes').checked === true);
check('workAuth radio No is NOT checked', document.getElementById('workAuthNo').checked === false);
check('relocate checkbox is checked (Yes)', document.getElementById('relocate').checked === true);
check('password field left blank', document.querySelector('[name=accountPassword]').value === '');
check('upi pin field left blank', document.querySelector('[name=upi_pin]').value === '');
check('unresolved q7 left blank', document.getElementById('q7').value === '');

// ---- 8. React-controlled-input compatibility: dispatched events are observed ----
const reactLikeInput = document.createElement('input');
reactLikeInput.name = 'reactEmail';
reactLikeInput.type = 'email';
reactLikeInput.placeholder = 'Email Address';
document.getElementById('jobForm').appendChild(reactLikeInput);
let observedByListener = null;
reactLikeInput.addEventListener('input', (e) => { observedByListener = e.target.value; });
window.JobFillFiller.setNativeValue(reactLikeInput, 'observed@example.com');
check(
  'native-setter fill fires a real input event a React listener would see',
  observedByListener === 'observed@example.com',
  `listener saw: ${observedByListener}`
);

// ---- 9. Dynamic form detection: new field added after initial scan ----
const newField = document.createElement('input');
newField.name = 'newDynamicPhone';
newField.type = 'tel';
newField.placeholder = 'Phone';
document.getElementById('jobForm').appendChild(newField);
const rescanRecords = window.JobFillDetector.scan(document);
check(
  'rescan only returns the newly-added field, not previously-seen ones',
  rescanRecords.length === 2 && rescanRecords.some((r) => r.name === 'newDynamicPhone'),
  `rescan returned ${rescanRecords.length}: ${rescanRecords.map((r) => r.name).join(',')}`
);
const dynPlan = window.JobFillMapper.plan(rescanRecords, { profile, siteMappings: {}, settings });
const dynPhoneItem = dynPlan.find((p) => p.record.name === 'newDynamicPhone');
check('dynamically-added phone field also classified correctly', dynPhoneItem && dynPhoneItem.fieldType === 'PHONE');

// ---- 10. Learning: manual mapping override forces resolution next time ----
const learnedSiteMappings = { [window.JobFillMapper.buildFieldKey(q7.record)]: 'NOTICE_PERIOD' };
const relearned = window.JobFillMapper.plan([q7.record], { profile, siteMappings: learnedSiteMappings, settings });
check(
  'learned site mapping overrides classifier with 100% confidence',
  relearned[0].fieldType === 'NOTICE_PERIOD' && relearned[0].confidence === 100 && relearned[0].source === 'learned',
  JSON.stringify({ type: relearned[0].fieldType, conf: relearned[0].confidence, src: relearned[0].source })
);
check('after learning, field becomes fillable', relearned[0].status === 'fill');
window.JobFillFiller.fillItem(relearned[0]);
check('learned field filled correctly (Notice Period)', document.getElementById('q7').value === '30 Days');

// ---- report ----
const failedTests = results.filter((r) => !r.pass);
console.log(`\nJobFill logic test suite: ${results.length - failedTests.length}/${results.length} passed\n`);
results.forEach((r) => {
  console.log(`${r.pass ? '✓' : '✗'} ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`);
});
if (failedTests.length) {
  console.log(`\n${failedTests.length} FAILURE(S)`);
  process.exit(1);
} else {
  console.log('\nAll checks passed.');
}
