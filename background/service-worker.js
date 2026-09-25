// JobFill — background service worker. Initializes default storage on
// install and opens the profile editor so first-time users aren't dropped
// into an empty popup.
const DEFAULT_SETTINGS = {
  showWidget: true,
  autoDetectForms: true,
  confirmBeforeAutofill: false,
  fillHighConfidence: true,
  fillMediumConfidence: true,
  askBeforeMedium: false,
  theme: 'system'
};

chrome.runtime.onInstalled.addListener((details) => {
  chrome.storage.local.get(['profiles', 'settings', 'siteMappings', 'applicationQuestions', 'stats'], (res) => {
    const updates = {};
    if (!res.profiles) updates.profiles = {};
    if (!res.settings) updates.settings = DEFAULT_SETTINGS;
    if (!res.siteMappings) updates.siteMappings = {};
    if (!res.applicationQuestions) updates.applicationQuestions = [];
    if (!res.stats) {
      updates.stats = { applicationsAssisted: 0, formsDetected: 0, fieldsFilled: 0, fieldsFailed: 0 };
    }
    if (Object.keys(updates).length) chrome.storage.local.set(updates);
  });

  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});
