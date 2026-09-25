// JobFill — shared helper functions for content scripts.
(function () {
  // "candidateEmail" / "candidate_email" / "candidate-email" -> "candidate email"
  function normalize(str) {
    if (!str) return '';
    return String(str)
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_\-]+/g, ' ')
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function containsPhrase(haystack, phrase) {
    if (!haystack || !phrase) return false;
    const h = ` ${haystack} `;
    const p = ` ${phrase} `;
    if (h.includes(p)) return true;
    // also allow concatenated-without-space match for longer phrases (e.g. "emailaddress")
    if (phrase.length >= 5 && haystack.replace(/\s+/g, '').includes(phrase.replace(/\s+/g, ''))) {
      return true;
    }
    return false;
  }

  function getByPath(obj, path) {
    if (!obj || !path) return undefined;
    return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
  }

  function setByPath(obj, path, value) {
    const keys = path.split('.');
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (typeof cur[keys[i]] !== 'object' || cur[keys[i]] == null) cur[keys[i]] = {};
      cur = cur[keys[i]];
    }
    cur[keys[keys.length - 1]] = value;
  }

  function debounce(fn, wait) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // Resolves the visible label text associated with a form element.
  function getLabelText(el) {
    const texts = [];
    if (el.id) {
      const labelFor = document.querySelector(`label[for="${cssEscape(el.id)}"]`);
      if (labelFor) texts.push(labelFor.textContent);
    }
    const closestLabel = el.closest('label');
    if (closestLabel) texts.push(closestLabel.textContent);

    const ariaLabelledBy = el.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
      ariaLabelledBy.split(/\s+/).forEach((id) => {
        const node = document.getElementById(id);
        if (node) texts.push(node.textContent);
      });
    }
    return texts.join(' ').replace(/\s+/g, ' ').trim();
  }

  function cssEscape(value) {
    if (window.CSS && CSS.escape) return CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  // Walks a few DOM levels up to grab nearby text (question text, hints)
  // that isn't captured by a <label>, e.g. divs used as pseudo-labels.
  function getNearbyText(el) {
    let node = el.parentElement;
    let depth = 0;
    const collected = [];
    while (node && depth < 4) {
      const clone = node.cloneNode(true);
      clone.querySelectorAll('input, select, textarea, button, script, style').forEach((n) => n.remove());
      const text = clone.textContent.replace(/\s+/g, ' ').trim();
      if (text && text.length < 200) collected.push(text);
      node = node.parentElement;
      depth++;
    }
    return collected.join(' ').trim();
  }

  function fireExtractionEvents(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  window.JobFillUtils = {
    normalize,
    containsPhrase,
    getByPath,
    setByPath,
    debounce,
    uuid,
    getLabelText,
    getNearbyText,
    fireExtractionEvents,
    cssEscape
  };
})();
