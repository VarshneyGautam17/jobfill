// Smoke-tests the real popup.html and options.html + their JS, with a
// mocked chrome.* API, to catch wiring bugs that unit tests on the pipeline
// alone would miss (storage round-trips, tab switching, DOM rendering).
// Run with: node tests/ui-smoke.test.js  (after `npm install`)
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const EXT_DIR = path.resolve(__dirname, '..');
const results = [];
function check(name, condition, detail) {
  results.push({ name, pass: !!condition, detail: detail || '' });
}

// ---- minimal chrome.* mock backed by an in-memory object ----
function makeChromeMock(initialStore) {
  const store = Object.assign({}, initialStore);
  const sentMessages = [];
  return {
    __store: store,
    __sentMessages: sentMessages,
    runtime: {
      lastError: undefined,
      getURL: (p) => `chrome-extension://fakeid/${p}`,
      openOptionsPage: () => {},
      onInstalled: { addListener: () => {} },
      onMessage: { addListener: () => {} }
    },
    storage: {
      local: {
        get(keys, cb) {
          let result = {};
          if (keys === null || keys === undefined) result = Object.assign({}, store);
          else if (Array.isArray(keys)) keys.forEach((k) => { if (store[k] !== undefined) result[k] = store[k]; });
          else if (typeof keys === 'string') { if (store[keys] !== undefined) result[keys] = store[keys]; }
          setTimeout(() => cb(result), 0);
        },
        set(obj, cb) {
          Object.assign(store, obj);
          if (cb) setTimeout(cb, 0);
        },
        clear(cb) {
          Object.keys(store).forEach((k) => delete store[k]);
          if (cb) setTimeout(cb, 0);
        }
      }
    },
    tabs: {
      query(info, cb) { setTimeout(() => cb([{ id: 1, url: 'https://example.com/apply', windowId: 1 }]), 0); },
      sendMessage(tabId, msg, cb) {
        sentMessages.push(msg);
        if (cb) setTimeout(() => cb({ ok: true, detected: 5, ready: 3, review: 2 }), 0);
      },
      create(opts) { sentMessages.push({ __tabsCreate: opts }); },
      update(id, opts) { sentMessages.push({ __tabsUpdate: opts }); }
    },
    windows: { update: () => {} }
  };
}

function loadPage(relHtmlPath, chromeMock, onLoad) {
  const fileUrl = 'file://' + path.join(EXT_DIR, relHtmlPath).replace(/\\/g, '/');
  const html = fs.readFileSync(path.join(EXT_DIR, relHtmlPath), 'utf8');
  const scriptErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (err) => scriptErrors.push(err.message));

  const dom = new JSDOM(html, {
    url: fileUrl,
    runScripts: 'dangerously',
    resources: 'usable',
    virtualConsole
  });
  dom.window.chrome = chromeMock;
  dom.window.alert = () => {};
  dom.window.confirm = () => true;
  dom.window.prompt = () => 'Test Profile';
  dom.window.addEventListener('error', (e) => scriptErrors.push(e.error ? e.error.message : e.message));

  dom.window.addEventListener('load', () => {
    // give queued storage.get callbacks (setTimeout 0) a chance to run
    setTimeout(() => onLoad(dom, scriptErrors), 30);
  });
}

// ================= OPTIONS PAGE =================
const optionsChrome = makeChromeMock({
  profiles: {},
  settings: undefined,
  siteMappings: { 'example.com': { 'name:annual_ctc': 'CURRENT_SALARY' } },
  applicationQuestions: [],
  stats: { applicationsAssisted: 3, formsDetected: 5, fieldsFilled: 40, fieldsFailed: 4 }
});

loadPage('options/options.html', optionsChrome, (dom, scriptErrors) => {
  const { document } = dom.window;
  check('options.html loads with no script errors', scriptErrors.length === 0, scriptErrors.join(' | '));
  check('Profile tab active by default', !document.getElementById('tab-profile').classList.contains('hidden'));

  // Fill out the profile form exactly like a real user would, then Save.
  document.getElementById('p_name').value = 'MERN Developer';
  document.getElementById('p_firstName').value = 'Gautam';
  document.getElementById('p_lastName').value = 'Varshney';
  document.getElementById('p_email').value = 'gautam@example.com';
  document.getElementById('saveProfileBtn').click();

  setTimeout(() => {
    const savedProfiles = Object.values(optionsChrome.__store.profiles || {});
    check('Save Profile persists to chrome.storage.local', savedProfiles.length === 1, JSON.stringify(savedProfiles));
    const saved = savedProfiles[0];
    check(
      'Saved profile has correct field values',
      saved && saved.personal.firstName === 'Gautam' && saved.personal.email === 'gautam@example.com',
      JSON.stringify(saved && saved.personal)
    );
    check('Full name auto-derived from first+last when left blank', saved && saved.personal.fullName === 'Gautam Varshney');

    // Switch to Profiles tab and verify the card renders.
    document.querySelector('.tab-btn[data-tab="profiles"]').click();
    const profilesListText = document.getElementById('profilesList').textContent;
    check('Profiles tab lists the saved profile', profilesListText.includes('MERN Developer'), profilesListText);

    // Field Mappings tab should show the pre-seeded learned mapping.
    document.querySelector('.tab-btn[data-tab="mappings"]').click();
    const mappingsText = document.getElementById('mappingsList').textContent;
    check('Mappings tab shows domain', mappingsText.includes('example.com'), mappingsText);
    check('Mappings tab shows the learned field key', mappingsText.includes('name:annual_ctc'), mappingsText);
    const mappingSelect = document.querySelector('#mappingsList .mapping-row select');
    check(
      'Learned mapping dropdown is pre-selected to the stored field type',
      mappingSelect && mappingSelect.value === 'CURRENT_SALARY',
      mappingSelect ? mappingSelect.value : 'select not found'
    );

    // Application Questions: add one and verify persistence.
    document.querySelector('.tab-btn[data-tab="questions"]').click();
    document.getElementById('addQuestionBtn').click();
    setTimeout(() => {
      const qRows = document.querySelectorAll('#questionsList .question-row');
      check('Add Question creates a new row', qRows.length === 1, `rows=${qRows.length}`);
      if (qRows.length) {
        const textareas = qRows[0].querySelectorAll('textarea');
        textareas[0].value = 'Are you authorized to work in India?';
        textareas[0].dispatchEvent(new dom.window.Event('input'));
        textareas[1].value = 'Yes';
        textareas[1].dispatchEvent(new dom.window.Event('input'));
      }
      setTimeout(() => {
        check(
          'Application question text persisted to storage',
          optionsChrome.__store.applicationQuestions &&
            optionsChrome.__store.applicationQuestions[0].question === 'Are you authorized to work in India?' &&
            optionsChrome.__store.applicationQuestions[0].answer === 'Yes',
          JSON.stringify(optionsChrome.__store.applicationQuestions)
        );

        // Privacy tab stats rendering.
        document.querySelector('.tab-btn[data-tab="privacy"]').click();
        const statsText = document.getElementById('statsBox').textContent;
        check('Privacy stats tile shows Applications Assisted count', statsText.includes('3'), statsText);

        // Settings tab: flip a toggle and Save.
        document.querySelector('.tab-btn[data-tab="settings"]').click();
        const showWidgetToggle = document.getElementById('s_showWidget');
        showWidgetToggle.checked = false;
        document.getElementById('saveSettingsBtn').click();
        setTimeout(() => {
          check(
            'Settings Save persists toggle change to storage',
            optionsChrome.__store.settings && optionsChrome.__store.settings.showWidget === false,
            JSON.stringify(optionsChrome.__store.settings)
          );
          finish('options');
        }, 30);
      }, 30);
    }, 30);
  }, 30);
});

// ================= POPUP PAGE =================
const popupChrome = makeChromeMock({
  profiles: {
    p1: { id: 'p1', name: 'MERN Developer', personal: { firstName: 'Gautam', lastName: 'Varshney' }, professional: { jobTitle: 'MERN Developer' } }
  },
  activeProfileId: 'p1'
});

loadPage('popup/popup.html', popupChrome, (dom, scriptErrors) => {
  const { document } = dom.window;
  check('popup.html loads with no script errors', scriptErrors.length === 0, scriptErrors.join(' | '));
  setTimeout(() => {
    check('Popup shows active profile name', document.getElementById('profileName').textContent === 'Gautam Varshney');
    check('Popup shows job title', document.getElementById('profileTitle').textContent === 'MERN Developer');
    check('Popup status shows Profile Ready', document.getElementById('profileStatus').textContent.includes('Ready'));
    check(
      'Popup page-status reflects content-script status response',
      document.getElementById('pageStatus').textContent.includes('5 fields detected'),
      document.getElementById('pageStatus').textContent
    );
    check('Autofill button enabled when fields are ready', document.getElementById('autofillBtn').disabled === false);

    document.getElementById('autofillBtn').click();
    setTimeout(() => {
      const sentAutofill = popupChrome.__sentMessages.find((m) => m.type === 'JOBFILL_AUTOFILL');
      check('Clicking Autofill sends JOBFILL_AUTOFILL to the active tab', !!sentAutofill);
      finish('popup');
    }, 30);
  }, 30);
});

// ================= report =================
let pending = 2;
function finish() {
  pending--;
  if (pending > 0) return;
  const failedTests = results.filter((r) => !r.pass);
  console.log(`\nJobFill UI smoke test: ${results.length - failedTests.length}/${results.length} passed\n`);
  results.forEach((r) => console.log(`${r.pass ? '✓' : '✗'} ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`));
  if (failedTests.length) {
    console.log(`\n${failedTests.length} FAILURE(S)`);
    process.exitCode = 1;
  } else {
    console.log('\nAll checks passed.');
  }
}
