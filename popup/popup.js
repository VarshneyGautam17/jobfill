// AutoFill Assistant — popup script. Shows active profile + page status and
// routes to the options page sections.
//
// AutoFill Assistant is click-to-activate: content/*.js is never
// auto-injected (see manifest.json — no content_scripts, no broad host
// permission), so a page has nothing running on it until this popup injects
// it there via chrome.scripting.executeScript, using activeTab access from
// the user's click that opened this very popup. That's the "Detect Fields
// on This Page" button below; once activated the same button becomes
// "Autofill Current Page" for the rest of this tab's lifetime (a reload
// resets it).
(function () {
  const CONTENT_SCRIPT_FILES = [
    'content/constants.js',
    'content/utils.js',
    'content/detector.js',
    'content/confidence.js',
    'content/mapper.js',
    'content/filler.js',
    'content/widget.js',
    'content/observer.js',
    'content/content.js'
  ];

  const profileNameEl = document.getElementById('profileName');
  const profileTitleEl = document.getElementById('profileTitle');
  const statusEl = document.getElementById('profileStatus');
  const autofillBtn = document.getElementById('autofillBtn');
  const pageStatusEl = document.getElementById('pageStatus');

  let activeProfile = null;

  function displayName(profile) {
    const p = profile.personal || {};
    return p.fullName || [p.firstName, p.lastName].filter(Boolean).join(' ') || profile.name || 'Untitled Profile';
  }

  function loadProfile(cb) {
    chrome.storage.local.get(['profiles', 'activeProfileId'], (res) => {
      const profiles = res.profiles || {};
      const activeId = res.activeProfileId;
      activeProfile = (activeId && profiles[activeId]) || Object.values(profiles)[0] || null;
      cb();
    });
  }

  function renderProfile() {
    if (!activeProfile) {
      profileNameEl.textContent = 'No profile yet';
      profileTitleEl.textContent = 'Create one to start autofilling';
      statusEl.textContent = '⚠ Set up your profile first';
      statusEl.className = 'status warn';
      autofillBtn.disabled = true;
      return;
    }
    profileNameEl.textContent = displayName(activeProfile);
    profileTitleEl.textContent = (activeProfile.professional && activeProfile.professional.jobTitle) || '';
    statusEl.textContent = '✓ Profile Ready';
    statusEl.className = 'status';
  }

  function withActiveTab(cb) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      cb(tabs && tabs[0]);
    });
  }

  // mode: 'detect' (not yet injected here — button will activate it),
  // 'autofill' (already active, ready to fill), 'disabled' (active but
  // nothing to do / stopped).
  function setButtonMode(mode, disabled) {
    autofillBtn.dataset.mode = mode;
    autofillBtn.textContent = mode === 'detect' ? 'Detect Fields on This Page' : 'Autofill Current Page';
    autofillBtn.disabled = !!disabled;
  }

  function showStatusForActiveTab(tab) {
    chrome.tabs.sendMessage(tab.id, { type: 'JOBFILL_GET_STATUS' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        // Nothing has been injected into this tab yet — that's the normal,
        // expected state, not an error.
        pageStatusEl.textContent = 'Not active on this page yet.';
        setButtonMode('detect', false);
        return;
      }
      if (response.stopped) {
        pageStatusEl.textContent = 'Stopped: too many fields on this page (50+). Autofill disabled here for safety.';
        setButtonMode('autofill', true);
        return;
      }
      pageStatusEl.textContent = `${response.detected} fields detected · ${response.ready} ready to fill`;
      setButtonMode('autofill', response.ready === 0);
    });
  }

  function refreshPageStatus() {
    if (!activeProfile) return;
    withActiveTab((tab) => {
      if (!tab || !tab.id || !/^https?:/.test(tab.url || '')) {
        pageStatusEl.textContent = 'AutoFill Assistant cannot access this page.';
        autofillBtn.disabled = true;
        return;
      }
      showStatusForActiveTab(tab);
    });
  }

  function activateOnTab(tab) {
    pageStatusEl.textContent = 'Detecting fields…';
    autofillBtn.disabled = true;
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: CONTENT_SCRIPT_FILES }, () => {
      if (chrome.runtime.lastError) {
        pageStatusEl.textContent = `Couldn't run here: ${chrome.runtime.lastError.message}`;
        setButtonMode('autofill', true);
        return;
      }
      showStatusForActiveTab(tab);
    });
  }

  autofillBtn.addEventListener('click', () => {
    withActiveTab((tab) => {
      if (!tab || !tab.id) return;
      if (autofillBtn.dataset.mode === 'detect') {
        activateOnTab(tab);
        return;
      }
      autofillBtn.disabled = true;
      chrome.tabs.sendMessage(tab.id, { type: 'JOBFILL_AUTOFILL' }, () => {
        window.close();
      });
    });
  });

  function openOptionsTab(tab) {
    const url = chrome.runtime.getURL(`options/options.html#${tab}`);
    chrome.tabs.query({ url: chrome.runtime.getURL('options/options.html*') }, (tabs) => {
      if (tabs && tabs.length) {
        chrome.tabs.update(tabs[0].id, { active: true, url });
        chrome.windows.update(tabs[0].windowId, { focused: true });
      } else {
        chrome.tabs.create({ url });
      }
      window.close();
    });
  }

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => openOptionsTab(btn.dataset.tab));
  });

  loadProfile(() => {
    renderProfile();
    refreshPageStatus();
  });
})();
