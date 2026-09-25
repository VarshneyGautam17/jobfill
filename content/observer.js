// JobFill — watches for dynamically-added form fields (React/Vue apps,
// multi-step wizards, modals) and reports newly detected fields.
// PRD sections 20/21: multi-step + dynamic forms.
(function () {
  const RELEVANT_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'FORM', 'FIELDSET']);

  function nodeLooksRelevant(node) {
    if (node.nodeType !== 1) return false;
    if (RELEVANT_TAGS.has(node.tagName)) return true;
    if (node.querySelector && node.querySelector('input, select, textarea')) return true;
    return false;
  }

  function start(onNewFields) {
    const debouncedScan = window.JobFillUtils.debounce(() => {
      const newRecords = window.JobFillDetector.scan(document);
      if (newRecords.length) onNewFields(newRecords);
    }, 500);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type !== 'childList') continue;
        let relevant = false;
        mutation.addedNodes.forEach((node) => {
          if (nodeLooksRelevant(node)) relevant = true;
        });
        if (relevant) {
          debouncedScan();
          break;
        }
      }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
    return observer;
  }

  window.JobFillObserver = { start };
})();
