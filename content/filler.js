// JobFill — writes values into the DOM. Uses the native property setter
// trick so React/Vue/Angular-controlled inputs pick up the change instead
// of silently reverting it (PRD section 44 — "React / Vue / Angular Inputs").
(function () {
  const TRUTHY = new Set(['yes', 'true', 'y', '1']);

  function setNativeValue(el, value) {
    const proto = Object.getPrototypeOf(el);
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor && descriptor.set) {
      descriptor.set.call(el, value);
    } else {
      el.value = value;
    }
    // composed: true lets the event cross out of a Shadow DOM boundary,
    // matching how a real user-driven input event behaves — needed for
    // components (SmartRecruiters, Workday, etc.) whose field lives inside
    // a custom element's shadow root while the app's own listener sits
    // higher up in the light DOM.
    el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  // Search/typeahead/date-picker widgets (a text input with a search or
  // calendar icon, backed by their own async dropdown) often listen for
  // input/change like any other field, but some ALSO run their own
  // validator that clears or reverts the value a tick later if the user
  // didn't explicitly pick a suggestion from their dropdown. We always want
  // our value to stick regardless of whether that internal search resolved
  // a match, so re-assert once on the next tick before blurring — cheap,
  // and a no-op for ordinary inputs where nothing reverted it.
  function fillTextLike(el, value) {
    el.focus();
    setNativeValue(el, value);
    window.setTimeout(() => {
      if (document.contains(el) && el.value !== String(value)) {
        setNativeValue(el, value);
      }
      el.blur();
    }, 60);
  }

  // Rebuilds a File from the base64 bytes stored in profile.resumes[]
  // (see options/options.js). A content script can't hand a native
  // <input type="file"> an arbitrary filesystem path (browsers block that,
  // for good reason), but it CAN construct a File in memory from bytes it
  // already has and attach it via DataTransfer — the same mechanism testing
  // tools use to simulate a drag-and-drop file drop. This only reaches a
  // REAL <input type="file"> in the DOM; it can't help fully custom upload
  // widgets that never render one (rare among ATS sites, but it happens).
  function base64ToFile(base64, fileName, mimeType) {
    const byteChars = atob(base64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
    return new File([new Uint8Array(byteNumbers)], fileName || 'resume.pdf', { type: mimeType || 'application/octet-stream' });
  }

  function fillFileInput(el, resume) {
    const file = base64ToFile(resume.dataBase64, resume.fileName, resume.mimeType);
    const dt = new DataTransfer();
    dt.items.add(file);
    el.files = dt.files;
    el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  function setChecked(el, checked) {
    const proto = Object.getPrototypeOf(el);
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'checked');
    if (descriptor && descriptor.set) {
      descriptor.set.call(el, checked);
    } else {
      el.checked = checked;
    }
    el.dispatchEvent(new Event('click', { bubbles: true, composed: true }));
    el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  // Fills a single planned item (see mapper.js). Returns true on success.
  function fillItem(item) {
    const { record, value, optionMatch } = item;
    try {
      if (record.type === 'select') {
        const el = record.element;
        el.focus();
        setNativeValue(el, optionMatch.value);
        el.blur();
        return true;
      }

      if (record.type === 'radio-group') {
        const target = optionMatch && optionMatch.element;
        if (!target) return false;
        setChecked(target, true);
        return true;
      }

      if (record.type === 'checkbox') {
        const el = record.element;
        const truthy = TRUTHY.has(String(value).trim().toLowerCase());
        setChecked(el, truthy);
        return true;
      }

      if (record.type === 'file') {
        if (!value || !value.dataBase64) return false;
        fillFileInput(record.element, value);
        return true;
      }

      // text, email, tel, textarea, number, search/typeahead comboboxes,
      // custom "Pick a date" fields, etc.
      fillTextLike(record.element, value);
      return true;
    } catch (err) {
      console.warn('[JobFill] failed to fill field', record, err);
      return false;
    }
  }

  window.JobFillFiller = { fillItem, setNativeValue, setChecked };
})();
