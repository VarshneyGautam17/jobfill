// JobFill — content script entry point. Wires detector -> mapper -> filler
// -> widget together, listens for popup messages, and persists learning.
(function () {
  const { DEFAULT_SETTINGS } = window.JobFillConstants;
  const hostname = location.hostname;

  let profile = null;
  let settings = Object.assign({}, DEFAULT_SETTINGS);
  let siteMappings = {};
  let plan = [];
  let widget = null;
  let observerHandle = null;
  let stopped = false;

  function loadAll(cb) {
    chrome.storage.local.get(['profiles', 'activeProfileId', 'settings', 'siteMappings'], (res) => {
      const profiles = res.profiles || {};
      const activeId = res.activeProfileId;
      profile = (activeId && profiles[activeId]) || Object.values(profiles)[0] || null;
      settings = Object.assign({}, DEFAULT_SETTINGS, res.settings || {});
      siteMappings = (res.siteMappings && res.siteMappings[hostname]) || {};
      cb();
    });
  }

  function saveLearnedMapping(fieldKey, fieldType) {
    chrome.storage.local.get(['siteMappings'], (res) => {
      const all = res.siteMappings || {};
      if (!all[hostname]) all[hostname] = {};
      all[hostname][fieldKey] = fieldType;
      chrome.storage.local.set({ siteMappings: all });
      siteMappings = all[hostname];
    });
  }

  function bumpStats(delta) {
    chrome.storage.local.get(['stats'], (res) => {
      const stats = Object.assign(
        { applicationsAssisted: 0, formsDetected: 0, fieldsFilled: 0, fieldsFailed: 0 },
        res.stats || {}
      );
      Object.keys(delta).forEach((k) => (stats[k] = (stats[k] || 0) + delta[k]));
      chrome.storage.local.set({ stats });
    });
  }

  function rebuildPlan(records) {
    if (!profile) return [];
    return window.JobFillMapper.plan(records, { profile, siteMappings, settings });
  }

  function ensureWidget() {
    if (widget || !settings.showWidget) return;
    widget = window.JobFillWidget.mount({
      onAutofillClick: runAutofill,
      onFieldTypeAssigned: (item, fieldType) => {
        // Update the in-memory mapping first so the immediate re-plan below
        // picks it up; saveLearnedMapping persists it (async) in parallel.
        siteMappings = Object.assign({}, siteMappings, { [item.fieldKey]: fieldType });
        saveLearnedMapping(item.fieldKey, fieldType);
        // Re-plan just this item with the newly learned type and fill it.
        const [updated] = rebuildPlan([item.record]);
        plan = plan.map((p) => (p.record.fieldId === item.record.fieldId ? updated : p));
        if (updated.status === 'fill' || updated.status === 'fill-review') {
          window.JobFillFiller.fillItem(updated);
        }
        widget.updatePlan(plan);
      }
    });
  }

  // Fills every fill/fill-review item in `items` and reports the outcome.
  // Shared by the manual Autofill button/message (full plan, confirm-gated)
  // and auto-fill-on-detect (just the newly-discovered delta, never
  // confirm-gated — the entire point of that mode is "no click needed").
  function fillAndReport(items, opts) {
    opts = opts || {};
    const toFill = items.filter((p) => p.status === 'fill' || p.status === 'fill-review');
    if (!opts.skipConfirm && settings.confirmBeforeAutofill && toFill.length) {
      const ok = confirm(`JobFill will fill ${toFill.length} field(s) on this page. Continue?`);
      if (!ok) return;
    }
    let filled = 0;
    let failed = 0;
    const resultItems = [];

    toFill.forEach((item) => {
      const ok = window.JobFillFiller.fillItem(item);
      if (ok) {
        filled++;
        resultItems.push({ mark: item.status === 'fill-review' ? '⚠' : '✓', label: item.label || item.fieldKey });
      } else {
        failed++;
        resultItems.push({ mark: '✕', label: item.label || item.fieldKey });
      }
    });

    const skipped = plan.filter((p) => p.status === 'sensitive' || p.status === 'empty').length;
    const review = plan.filter((p) => p.status === 'unresolved' || p.status === 'review').length;

    plan.filter((p) => p.status === 'unresolved' || p.status === 'empty' || p.status === 'review').forEach((item) => {
      resultItems.push({ mark: statusMark(item.status), label: item.label || fieldHint(item.record) });
    });

    bumpStats({
      formsDetected: opts.countAsNewForm ? 1 : 0,
      fieldsFilled: filled,
      fieldsFailed: failed,
      applicationsAssisted: filled > 0 ? 1 : 0
    });

    if (widget) {
      widget.showResult({ detected: plan.length, filled, skipped, review, items: resultItems });
    }
  }

  // Manual trigger — widget button, popup button, or JOBFILL_AUTOFILL message.
  function runAutofill() {
    if (!profile) return;
    fillAndReport(plan, { countAsNewForm: true });
  }

  // Automatic trigger — only ever fills the newly-discovered delta from this
  // scan/observer batch, never the whole accumulated plan, so re-detecting
  // a growing SPA page doesn't stomp on fields the user already edited by
  // hand after an earlier auto-fill pass. Returns true if it actually filled
  // something (and therefore already rendered a result into the widget), so
  // callers know not to immediately overwrite that with a plain summary.
  function autoFillDelta(newPlanItems) {
    if (!profile || !settings.autoFillOnDetect || !newPlanItems.length) return false;
    const hasFillable = newPlanItems.some((p) => p.status === 'fill' || p.status === 'fill-review');
    if (!hasFillable) return false;
    fillAndReport(newPlanItems, { skipConfirm: true, countAsNewForm: false });
    return true;
  }

  function statusMark(status) {
    if (status === 'empty') return '⚠';
    if (status === 'sensitive') return '🔒';
    if (status === 'review') return '❔';
    return '?';
  }

  function fieldHint(record) {
    return record.labelText || record.placeholder || record.name || record.id || 'Unnamed field';
  }

  // Hard safety cap (see constants.js MAX_DETECTED_FIELDS / detector.js):
  // once tripped, stop scanning AND fully disconnect the MutationObserver
  // — not just the detector — so a pathological page (a component library
  // exposing hundreds of internal inputs through Shadow DOM, or one that
  // mutates constantly) can't keep costing CPU after we've given up on it.
  function stopIfDetectorTripped() {
    if (stopped || !window.JobFillDetector.isStopped()) return;
    stopped = true;
    if (observerHandle) observerHandle.disconnect();
    ensureWidget();
    if (widget) {
      widget.showStopped(
        `⚠ JobFill stopped: this page has an unusually large number of fields (50+), ` +
          `more than can be handled safely. Detection has been turned off here.`
      );
    }
  }

  function scanAndRender() {
    const records = window.JobFillDetector.scan(document);
    const newPlan = records.length ? rebuildPlan(records) : [];
    if (newPlan.length) plan = plan.concat(newPlan);
    stopIfDetectorTripped();
    if (stopped) return;
    if (settings.autoDetectForms) ensureWidget();
    const autoFilled = autoFillDelta(newPlan);
    if (settings.autoDetectForms && widget && !autoFilled) widget.updatePlan(plan);
  }

  function init() {
    loadAll(() => {
      if (!profile) return; // no profile configured yet — stay silent
      scanAndRender();
      if (stopped) return;
      observerHandle = window.JobFillObserver.start((newRecords) => {
        if (stopped) return;
        const newPlan = rebuildPlan(newRecords);
        plan = plan.concat(newPlan);
        stopIfDetectorTripped();
        if (stopped) return;
        if (settings.autoDetectForms) ensureWidget();
        const autoFilled = autoFillDelta(newPlan);
        if (settings.autoDetectForms && widget && !autoFilled) widget.updatePlan(plan);
      });
    });
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'JOBFILL_PING') {
      sendResponse({ ok: true, hasProfile: !!profile });
      return;
    }
    if (msg && msg.type === 'JOBFILL_GET_STATUS') {
      const fillable = plan.filter((p) => p.status === 'fill' || p.status === 'fill-review').length;
      const review = plan.filter((p) => p.status === 'unresolved' || p.status === 'empty' || p.status === 'review').length;
      sendResponse({ ok: true, detected: plan.length, ready: fillable, review, hasProfile: !!profile, stopped });
      return;
    }
    if (msg && msg.type === 'JOBFILL_AUTOFILL') {
      if (!profile) {
        sendResponse({ ok: false, error: 'no-profile' });
        return;
      }
      if (stopped) {
        sendResponse({ ok: false, error: 'stopped' });
        return;
      }
      ensureWidget();
      runAutofill();
      sendResponse({ ok: true });
      return;
    }
    if (msg && msg.type === 'JOBFILL_SETTINGS_CHANGED') {
      loadAll(() => {
        if (widget) widget.updatePlan(plan);
      });
      return;
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
