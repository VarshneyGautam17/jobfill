// JobFill — scans the DOM for fillable form fields and extracts metadata
// used later by confidence.js / mapper.js. Designed to be re-run safely
// on newly-added subtrees (see observer.js) without reprocessing elements.
(function () {
  const SKIP_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'file']);

  // Piercing every shadow root on a component-heavy page also surfaces
  // internal implementation-detail inputs (a dropdown's hidden filter box,
  // a combobox's shadow-internal <select>, etc.) that aren't real
  // user-facing fields. Skip anything not actually visible/exposed.
  function isVisible(el) {
    if (el.hidden || el.getAttribute('aria-hidden') === 'true') return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function isRelevant(el) {
    const tag = el.tagName.toLowerCase();
    if (!isVisible(el)) return false;
    if (tag === 'select' || tag === 'textarea') return true;
    if (tag === 'input') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      return !SKIP_TYPES.has(type);
    }
    return false;
  }

  function extractOptions(selectEl) {
    return Array.from(selectEl.options || []).map((o) => ({ value: o.value, text: o.textContent.trim() }));
  }

  function buildRecord(el) {
    const tag = el.tagName.toLowerCase();
    const type = tag === 'input' ? (el.getAttribute('type') || 'text').toLowerCase() : tag;
    const record = {
      fieldId: el.dataset.jobfillId,
      tag,
      type,
      name: el.getAttribute('name') || '',
      id: el.getAttribute('id') || '',
      placeholder: el.getAttribute('placeholder') || '',
      autocomplete: (el.getAttribute('autocomplete') || '').toLowerCase(),
      ariaLabel: el.getAttribute('aria-label') || '',
      className: el.getAttribute('class') || '',
      labelText: window.JobFillUtils.getLabelText(el),
      nearbyText: window.JobFillUtils.getNearbyText(el),
      required: el.hasAttribute('required'),
      element: el
    };
    if (tag === 'select') record.options = extractOptions(el);
    return record;
  }

  function buildRadioGroupRecord(name, radios) {
    const first = radios[0];
    const container = first.closest('fieldset') || first.closest('form') || first.parentElement;
    const legend = container ? container.querySelector('legend') : null;
    return {
      fieldId: first.dataset.jobfillId,
      tag: 'input',
      type: 'radio-group',
      name,
      id: '',
      placeholder: '',
      autocomplete: '',
      ariaLabel: '',
      className: '',
      labelText: legend ? legend.textContent.trim() : '',
      nearbyText: window.JobFillUtils.getNearbyText(first),
      required: radios.some((r) => r.hasAttribute('required')),
      elements: radios,
      options: radios.map((r) => ({
        value: r.value,
        text: window.JobFillUtils.getLabelText(r) || window.JobFillUtils.getNearbyText(r),
        element: r
      }))
    };
  }

  const MAX_FIELDS = window.JobFillConstants.MAX_DETECTED_FIELDS;
  let totalReturned = 0;
  let stopped = false;

  // Scans `root` (default document) for unseen fillable fields.
  // Returns an array of field records (see buildRecord/buildRadioGroupRecord).
  //
  // Hard-capped at MAX_FIELDS total per page: past that, this page is
  // almost certainly not a real form (see constants.js), so scanning
  // short-circuits immediately — no DOM query at all — on every call from
  // then on, and the expensive per-field metadata extraction (label/nearby
  // text lookups) is bounded to the remaining budget even on the call that
  // crosses the threshold, rather than only stopping *after* processing an
  // unbounded burst.
  function scan(root) {
    if (stopped) return [];
    root = root || document;

    const remainingBudget = MAX_FIELDS - totalReturned;
    const allCandidates = window.JobFillUtils.deepQuerySelectorAll(root, 'input, select, textarea').filter(
      (el) => isRelevant(el) && !el.dataset.jobfillSeen
    );
    const candidates = allCandidates.slice(0, remainingBudget);

    const records = [];
    const radioGroups = new Map();

    candidates.forEach((el) => {
      el.dataset.jobfillSeen = '1';
      if (!el.dataset.jobfillId) el.dataset.jobfillId = window.JobFillUtils.uuid();

      const type = el.tagName.toLowerCase() === 'input' ? (el.getAttribute('type') || 'text').toLowerCase() : null;
      if (type === 'radio' && el.name) {
        const key = el.name;
        if (!radioGroups.has(key)) radioGroups.set(key, []);
        radioGroups.get(key).push(el);
      } else {
        records.push(buildRecord(el));
      }
    });

    radioGroups.forEach((radios, name) => {
      records.push(buildRadioGroupRecord(name, radios));
    });

    totalReturned += records.length;
    if (totalReturned >= MAX_FIELDS || allCandidates.length > candidates.length) {
      stopped = true;
      console.warn(
        `[JobFill] This page has an unusually large number of fields (50+) — stopping detection here for safety. ` +
          `Use the extension popup if you still want to try filling what was found.`
      );
    }

    return records;
  }

  function isStopped() {
    return stopped;
  }

  window.JobFillDetector = { scan, isStopped };
})();
