// JobFill — popup script. Shows active profile + page status and routes
// to the options page sections.
(function () {
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

  function refreshPageStatus() {
    if (!activeProfile) return;
    withActiveTab((tab) => {
      if (!tab || !tab.id || !/^https?:/.test(tab.url || '')) {
        pageStatusEl.textContent = 'JobFill cannot access this page.';
        autofillBtn.disabled = true;
        return;
      }
      chrome.tabs.sendMessage(tab.id, { type: 'JOBFILL_GET_STATUS' }, (response) => {
        if (chrome.runtime.lastError || !response) {
          pageStatusEl.textContent = 'No form detected on this page yet.';
          autofillBtn.disabled = true;
          return;
        }
        pageStatusEl.textContent = `${response.detected} fields detected · ${response.ready} ready to fill`;
        autofillBtn.disabled = response.ready === 0;
      });
    });
  }

  autofillBtn.addEventListener('click', () => {
    withActiveTab((tab) => {
      if (!tab || !tab.id) return;
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
