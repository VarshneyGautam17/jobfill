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
//
// IMPORTANT: all of that discovery work is expensive (recursive DOM
// walks), so it must never run synchronously per raw mutation event on a
// component-heavy page that mutates constantly — that pegs the CPU and
// can freeze the tab. Everything heavy is batched into a single debounced
// pass, with a circuit breaker that backs off entirely if the page is
// mutating unusually often.
(function () {
  const DEBOUNCE_MS = 500;
  // The debounce itself already caps the max sustained flush rate to
  // ~WINDOW_MS/DEBOUNCE_MS (~10 per 5s here), so this must be set well
  // below that ceiling or it can never actually trigger. This backs off
  // once a page has needed a rescan unusually often for a few seconds
  // straight, rather than only reacting to a single instantaneous burst
  // (which the debounce alone already handles).
  const MAX_RUNS_PER_WINDOW = 6;
  const WINDOW_MS = 5000;

  function start(onNewFields) {
    const observedRoots = new WeakSet();
    let pendingNodes = [];
    let runTimestamps = [];
    let backingOff = false;

    function observeIfNew(root) {
      if (observedRoots.has(root)) return;
      observedRoots.add(root);
      observer.observe(root, { childList: true, subtree: true });
    }

    const flush = window.JobFillUtils.debounce(() => {
      const now = Date.now();
      runTimestamps = runTimestamps.filter((t) => now - t < WINDOW_MS);
      runTimestamps.push(now);

      if (runTimestamps.length > MAX_RUNS_PER_WINDOW) {
        if (!backingOff) {
          backingOff = true;
          console.warn(
            '[JobFill] This page is mutating very frequently — pausing automatic re-scans to avoid slowing it down. ' +
              'Use the extension popup to Autofill manually instead.'
          );
        }
        pendingNodes = [];
        return;
      }
      backingOff = false;

      const nodesToCheck = pendingNodes;
      pendingNodes = [];
      nodesToCheck.forEach((node) => {
        if (node.shadowRoot) observeIfNew(node.shadowRoot);
        window.JobFillUtils.collectShadowRoots(node).forEach(observeIfNew);
      });

      const newRecords = window.JobFillDetector.scan(document);
      if (newRecords.length) onNewFields(newRecords);
    }, DEBOUNCE_MS);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type !== 'childList') return;
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) pendingNodes.push(node);
        });
      });
      if (pendingNodes.length) flush();
    });

    observeIfNew(document.documentElement);
    window.JobFillUtils.collectShadowRoots(document.documentElement).forEach(observeIfNew);

    return observer;
  }

  window.JobFillObserver = { start };
})();
