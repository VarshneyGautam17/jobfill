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

      // text, email, tel, textarea, number, etc.
      const el = record.element;
      el.focus();
      setNativeValue(el, value);
      el.blur();
      return true;
    } catch (err) {
      console.warn('[JobFill] failed to fill field', record, err);
      return false;
    }
  }

  window.JobFillFiller = { fillItem, setNativeValue, setChecked };
})();
