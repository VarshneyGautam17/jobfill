// AutoFill Assistant — shared helper functions for content scripts.
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

  // Resolves the visible label text associated with a form element. Uses
  // getRootNode() rather than `document` so this also works for fields
  // rendered inside a Shadow DOM component, where the <label> usually
  // lives in the same shadow root, not the top-level document.
  function getLabelText(el) {
    const root = el.getRootNode();
    const texts = [];
    if (el.id && root.querySelector) {
      const labelFor = root.querySelector(`label[for="${cssEscape(el.id)}"]`);
      if (labelFor) texts.push(labelFor.textContent);
    }
    const closestLabel = el.closest('label');
    if (closestLabel) texts.push(closestLabel.textContent);

    const ariaLabelledBy = el.getAttribute('aria-labelledby');
    if (ariaLabelledBy && root.getElementById) {
      ariaLabelledBy.split(/\s+/).forEach((id) => {
        const node = root.getElementById(id);
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

  // document.querySelectorAll never looks inside a Shadow DOM (used
  // heavily by modern component libraries, e.g. SmartRecruiters/Workday
  // wrap every field in a custom element with its own open shadow root).
  // This walks into every open shadow root under `root` and collects
  // matches from all of them, so detection works the same either way.
  function deepQuerySelectorAll(root, selector) {
    const results = Array.from(root.querySelectorAll(selector));
    root.querySelectorAll('*').forEach((el) => {
      if (el.shadowRoot) results.push(...deepQuerySelectorAll(el.shadowRoot, selector));
    });
    return results;
  }

  // Recursively finds every open shadow root nested under `root`
  // (root itself included if it is already a shadow root).
  function collectShadowRoots(root) {
    const roots = [];
    root.querySelectorAll('*').forEach((el) => {
      if (el.shadowRoot) {
        roots.push(el.shadowRoot);
        roots.push(...collectShadowRoots(el.shadowRoot));
      }
    });
    return roots;
  }

  // Picks which stored resume (profile.resumes[]) a RESUME-type field should
  // be filled with: the one explicitly marked default, else the first one.
  function getActiveResume(profile) {
    if (!profile || !Array.isArray(profile.resumes) || !profile.resumes.length) return null;
    if (profile.defaultResumeId) {
      const marked = profile.resumes.find((r) => r.id === profile.defaultResumeId);
      if (marked) return marked;
    }
    return profile.resumes[0];
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
    cssEscape,
    deepQuerySelectorAll,
    collectShadowRoots,
    getActiveResume
  };
})();
