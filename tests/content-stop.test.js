// Integration test for the full stop sequence: loads the actual
// content.js orchestrator (not just detector.js in isolation) against a
// 60-field fixture, with a mocked chrome.storage API, and proves that once
// the field cap trips, the REAL MutationObserver gets disconnected and the
// widget shows the stopped message — the two things that actually protect
// the page from further cost, not just an internal flag.
// Run with: node tests/content-stop.test.js  (after `npm install`)
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

const store = {
  profiles: {
    p1: {
      id: 'p1', name: 'Test',
      personal: { firstName: 'A', lastName: 'B', email: 'a@b.com' },
      professional: {}, links: {}, education: {}, preferences: {}
    }
  },
  activeProfileId: 'p1',
  settings: undefined,
  siteMappings: {}
};
let messageListener = null;
window.chrome = {
  storage: {
    local: {
      get(keys, cb) {
        const result = {};
        (Array.isArray(keys) ? keys : [keys]).forEach((k) => { if (store[k] !== undefined) result[k] = store[k]; });
        setTimeout(() => cb(result), 0);
      },
      set(obj, cb) {
        Object.assign(store, obj);
        if (cb) setTimeout(cb, 0);
      }
    }
  },
  runtime: {
    lastError: undefined,
    onMessage: { addListener: (fn) => { messageListener = fn; } }
  }
};

// Start under the cap so the observer actually starts up normally (as it
// would on a real page's initial render), then add more fields later to
// cross the cap via the OBSERVER's callback path — this is the path where
// observerHandle already exists and disconnect() must actually fire,
// unlike the initial scan tripping the cap before the observer even starts.
const app = document.getElementById('app');
for (let i = 0; i < 10; i++) {
  const input = document.createElement('input');
  input.name = `field${i}`;
  input.placeholder = `Field ${i}`;
  app.appendChild(input);
}

// Spy on the real MutationObserver.disconnect to prove content.js actually
// calls it on the instance it received from JobFillObserver.start(), not
// just that detector.js flips an internal flag.
let disconnectCalls = 0;
const realDisconnect = window.MutationObserver.prototype.disconnect;
window.MutationObserver.prototype.disconnect = function (...args) {
  disconnectCalls++;
  return realDisconnect.apply(this, args);
};

[
  'content/constants.js', 'content/utils.js', 'content/detector.js', 'content/confidence.js',
  'content/mapper.js', 'content/filler.js', 'content/widget.js', 'content/observer.js', 'content/content.js'
].forEach((f) => window.eval(fs.readFileSync(path.join(EXT_DIR, f), 'utf8')));

setTimeout(() => {
  // Confirm the observer actually started normally while under the cap,
  // before we push it over the edge.
  check('MutationObserver was not disconnected while still under the cap', disconnectCalls === 0, `disconnect() called ${disconnectCalls} time(s)`);

  for (let i = 10; i < 65; i++) {
    const input = document.createElement('input');
    input.name = `field${i}`;
    input.placeholder = `Field ${i}`;
    app.appendChild(input);
  }

  // Observer debounce is 500ms; give it room to fire.
  setTimeout(runAssertions, 700);
}, 100);

function runAssertions() {
  check('the real MutationObserver was disconnected once the cap tripped', disconnectCalls >= 1, `disconnect() called ${disconnectCalls} time(s)`);

  const widgetHost = document.getElementById('jobfill-widget-host');
  check('widget is mounted', !!widgetHost);
  const widgetText = widgetHost && widgetHost.shadowRoot ? widgetHost.shadowRoot.textContent : '';
  check(
    'widget displays the stopped message to the user',
    widgetText.includes('JobFill stopped') && widgetText.includes('50+'),
    widgetText
  );

  check('messageListener was registered', typeof messageListener === 'function');
  messageListener({ type: 'JOBFILL_GET_STATUS' }, {}, (response) => {
    check('popup status query reports stopped: true', response && response.stopped === true, JSON.stringify(response));

    messageListener({ type: 'JOBFILL_AUTOFILL' }, {}, (autofillResponse) => {
      check(
        'popup Autofill request is refused once stopped',
        autofillResponse && autofillResponse.ok === false && autofillResponse.error === 'stopped',
        JSON.stringify(autofillResponse)
      );

      window.MutationObserver.prototype.disconnect = realDisconnect;

      const failed = results.filter((r) => !r.pass);
      console.log(`\nJobFill content-stop integration test suite: ${results.length - failed.length}/${results.length} passed\n`);
      results.forEach((r) => console.log(`${r.pass ? '✓' : '✗'} ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`));
      if (failed.length) {
        console.log(`\n${failed.length} FAILURE(S)`);
        process.exit(1);
      } else {
        console.log('\nAll checks passed.');
      }
    });
  });
}
