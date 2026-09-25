// JobFill — watches for dynamically-added form fields (React/Vue apps,
// multi-step wizards, modals) and reports newly detected fields.
// PRD sections 20/21: multi-step + dynamic forms.
//
// A plain MutationObserver never sees changes happening inside a Shadow
// DOM subtree — each shadow root needs its own .observe() call. Modern
// component libraries (SmartRecruiters, Workday, many design systems)
// wrap every field in a custom element with its own open shadow root, so
// this file also has to discover and attach to those roots, including
// ones that appear later as the page keeps rendering.
(function () {
  const RELEVANT_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'FORM', 'FIELDSET']);

  function nodeLooksRelevant(node) {
    if (node.nodeType !== 1) return false;
    if (RELEVANT_TAGS.has(node.tagName)) return true;
    if (node.shadowRoot) return true;
    if (node.tagName.includes('-')) return true; // custom element (Web Components require a hyphen)
    if (node.querySelector && node.querySelector('input, select, textarea')) return true;
    return false;
  }

  // Observes `root`, then recursively observes every open shadow root
  // already nested inside it, so pre-existing shadow trees are covered
  // from the start.
  function observeDeep(observer, root) {
    observer.observe(root, { childList: true, subtree: true });
    window.JobFillUtils.collectShadowRoots(root).forEach((shadowRoot) => {
      observer.observe(shadowRoot, { childList: true, subtree: true });
    });
  }

  function start(onNewFields) {
    const debouncedScan = window.JobFillUtils.debounce(() => {
      const newRecords = window.JobFillDetector.scan(document);
      if (newRecords.length) onNewFields(newRecords);
    }, 500);

    const observer = new MutationObserver((mutations) => {
      let relevant = false;
      mutations.forEach((mutation) => {
        if (mutation.type !== 'childList') return;
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          if (nodeLooksRelevant(node)) relevant = true;
          // A newly-inserted custom element may already carry its own
          // shadow root (attached synchronously in its constructor) —
          // start observing it too so fields added inside it later are
          // still caught.
          if (node.shadowRoot) observeDeep(observer, node.shadowRoot);
          window.JobFillUtils.collectShadowRoots(node).forEach((shadowRoot) => {
            observer.observe(shadowRoot, { childList: true, subtree: true });
          });
        });
      });
      if (relevant) debouncedScan();
    });

    observeDeep(observer, document.documentElement);
    return observer;
  }

  window.JobFillObserver = { start };
})();
