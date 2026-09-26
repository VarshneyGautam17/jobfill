// AutoFill Assistant — floating draggable widget (shadow DOM, isolated from page CSS).
// Renders detection summary, an Autofill button, the review list for
// unresolved fields, and the post-autofill result checklist.
(function () {
  const { FIELD_TYPES, FIELD_LABELS } = window.JobFillConstants;
  const STORAGE_KEY = 'jobfill_widget_state';

  const STYLE = `
    :host { all: initial; }
    .jf-root {
      position: fixed;
      z-index: 2147483647;
      width: 300px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      color: #1f2430;
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 8px 30px rgba(20, 20, 40, 0.25);
      border: 1px solid #e4e4ef;
      overflow: hidden;
    }
    .jf-root.minimized { width: auto; }
    .jf-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      background: linear-gradient(135deg, #5b3cc4, #7b5cf0);
      color: #fff;
      cursor: grab;
      user-select: none;
    }
    .jf-header:active { cursor: grabbing; }
    .jf-title { font-weight: 600; flex: 1; font-size: 13px; }
    .jf-iconbtn {
      background: rgba(255,255,255,0.18);
      border: none;
      color: #fff;
      width: 22px;
      height: 22px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .jf-iconbtn:hover { background: rgba(255,255,255,0.32); }
    .jf-body { padding: 12px; max-height: 420px; overflow-y: auto; }
    .jf-stats { display: flex; gap: 8px; margin-bottom: 10px; }
    .jf-stat { flex: 1; background: #f4f3fb; border-radius: 8px; padding: 8px; text-align: center; }
    .jf-stat b { display: block; font-size: 16px; color: #5b3cc4; }
    .jf-stat span { font-size: 10px; color: #6b6b7a; }
    .jf-btn {
      width: 100%;
      padding: 9px 10px;
      background: #5b3cc4;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      font-size: 13px;
    }
    .jf-btn:hover { background: #4c30a8; }
    .jf-btn:disabled { background: #c9c3e8; cursor: default; }
    .jf-btn.secondary { background: #eeecf9; color: #5b3cc4; margin-top: 8px; }
    .jf-btn.secondary:hover { background: #e1ddf5; }
    .jf-section-title { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #8a8a99; margin: 12px 0 6px; }
    .jf-item { display: flex; align-items: center; gap: 6px; padding: 6px 0; border-bottom: 1px solid #f0f0f5; font-size: 12px; }
    .jf-item:last-child { border-bottom: none; }
    .jf-item .jf-mark { width: 16px; text-align: center; }
    .jf-item .jf-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .jf-unresolved { padding: 8px 0; border-bottom: 1px solid #f0f0f5; }
    .jf-unresolved:last-child { border-bottom: none; }
    .jf-unresolved .jf-q { font-size: 12px; color: #33333f; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .jf-select {
      width: 100%;
      padding: 5px 6px;
      border-radius: 6px;
      border: 1px solid #d9d9e6;
      font-size: 12px;
      background: #fff;
    }
    .jf-minibar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; }
    .jf-empty { color: #8a8a99; font-size: 12px; padding: 6px 0; }
  `;

  function saveState(state) {
    try {
      chrome.storage.local.set({ [STORAGE_KEY]: state });
    } catch (e) {}
  }

  function loadState(cb) {
    try {
      chrome.storage.local.get([STORAGE_KEY], (res) => cb((res && res[STORAGE_KEY]) || {}));
    } catch (e) {
      cb({});
    }
  }

  function fieldTypeOptionsSelect(selected) {
    const select = document.createElement('select');
    select.className = 'jf-select';
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = 'Select field type…';
    select.appendChild(blank);
    Object.keys(FIELD_TYPES).forEach((ft) => {
      const opt = document.createElement('option');
      opt.value = ft;
      opt.textContent = FIELD_LABELS[ft] || ft;
      if (ft === selected) opt.selected = true;
      select.appendChild(opt);
    });
    const other = document.createElement('option');
    other.value = '__OTHER__';
    other.textContent = 'Other / Skip';
    select.appendChild(other);
    return select;
  }

  function mount(handlers) {
    const host = document.createElement('div');
    host.id = 'jobfill-widget-host';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    shadow.appendChild(style);

    const root = document.createElement('div');
    root.className = 'jf-root';
    shadow.appendChild(root);

    let minimized = false;
    let position = { top: 90, right: 20 };
    let lastPlan = [];
    let lastResult = null;
    let stoppedMessage = null;

    document.documentElement.appendChild(host);

    loadState((state) => {
      if (state.position) position = state.position;
      if (state.minimized) minimized = state.minimized;
      applyPosition();
      render();
    });

    function applyPosition() {
      root.style.top = `${position.top}px`;
      root.style.right = `${position.right}px`;
      root.style.left = '';
    }

    function makeDraggable(handleEl) {
      let dragging = false;
      let startX, startY, startTop, startRight;
      handleEl.addEventListener('mousedown', (e) => {
        if (e.target.closest('.jf-iconbtn')) return;
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startTop = position.top;
        startRight = position.right;
        e.preventDefault();
      });
      window.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        position = { top: Math.max(0, startTop + dy), right: Math.max(0, startRight - dx) };
        applyPosition();
      });
      window.addEventListener('mouseup', () => {
        if (dragging) saveState({ position, minimized });
        dragging = false;
      });
    }

    function counts(plan) {
      const total = plan.length;
      const fillable = plan.filter((p) => p.status === 'fill' || p.status === 'fill-review').length;
      const review = plan.filter((p) => p.status === 'review' || p.status === 'empty' || p.status === 'unresolved').length;
      return { total, fillable, review };
    }

    // Header is built once so drag listeners are attached exactly once;
    // only its minimize icon needs to change across renders.
    const header = document.createElement('div');
    header.className = 'jf-header';
    const title = document.createElement('div');
    title.className = 'jf-title';
    title.textContent = '⚡ AutoFill Assistant';
    const minBtn = document.createElement('button');
    minBtn.className = 'jf-iconbtn';
    minBtn.addEventListener('click', () => {
      minimized = !minimized;
      saveState({ position, minimized });
      render();
    });
    const closeBtn = document.createElement('button');
    closeBtn.className = 'jf-iconbtn';
    closeBtn.textContent = '✕';
    closeBtn.title = 'Dismiss';
    closeBtn.addEventListener('click', () => host.remove());
    header.appendChild(title);
    header.appendChild(minBtn);
    header.appendChild(closeBtn);
    root.appendChild(header);
    makeDraggable(header);

    const contentArea = document.createElement('div');
    root.appendChild(contentArea);

    function render() {
      root.classList.toggle('minimized', minimized);
      minBtn.textContent = minimized ? '▢' : '—';
      minBtn.title = minimized ? 'Expand' : 'Minimize';
      contentArea.innerHTML = '';

      if (minimized) {
        const bar = document.createElement('div');
        bar.className = 'jf-minibar';
        const c = counts(lastPlan);
        const label = document.createElement('div');
        label.textContent = `${c.total} fields`;
        bar.appendChild(label);
        contentArea.appendChild(bar);
        return;
      }

      const body = document.createElement('div');
      body.className = 'jf-body';
      contentArea.appendChild(body);

      if (stoppedMessage) {
        renderStopped(body, stoppedMessage);
        return;
      }

      if (lastResult) {
        renderResult(body, lastResult);
      } else {
        renderSummary(body, lastPlan);
      }
      renderUnresolvedList(body, lastPlan);
    }

    function renderStopped(body, message) {
      const warning = document.createElement('div');
      warning.className = 'jf-empty';
      warning.style.color = '#b8860b';
      warning.textContent = message;
      body.appendChild(warning);
    }

    function renderSummary(body, plan) {
      const c = counts(plan);
      const stats = document.createElement('div');
      stats.className = 'jf-stats';
      stats.appendChild(statBox(c.total, 'Detected'));
      stats.appendChild(statBox(c.fillable, 'Ready'));
      stats.appendChild(statBox(c.review, 'Need Review'));
      body.appendChild(stats);

      const btn = document.createElement('button');
      btn.className = 'jf-btn';
      btn.textContent = 'Autofill';
      btn.disabled = c.fillable === 0;
      btn.addEventListener('click', () => handlers.onAutofillClick && handlers.onAutofillClick());
      body.appendChild(btn);
    }

    function statBox(n, label) {
      const box = document.createElement('div');
      box.className = 'jf-stat';
      const b = document.createElement('b');
      b.textContent = String(n);
      const span = document.createElement('span');
      span.textContent = label;
      box.appendChild(b);
      box.appendChild(span);
      return box;
    }

    function renderResult(body, result) {
      const stats = document.createElement('div');
      stats.className = 'jf-stats';
      stats.appendChild(statBox(result.detected, 'Detected'));
      stats.appendChild(statBox(result.filled, 'Filled'));
      stats.appendChild(statBox(result.skipped + result.review, 'Skipped/Review'));
      body.appendChild(stats);

      const list = document.createElement('div');
      result.items.forEach((it) => {
        const row = document.createElement('div');
        row.className = 'jf-item';
        const mark = document.createElement('span');
        mark.className = 'jf-mark';
        mark.textContent = it.mark;
        const label = document.createElement('span');
        label.className = 'jf-label';
        label.textContent = it.label;
        row.appendChild(mark);
        row.appendChild(label);
        list.appendChild(row);
      });
      body.appendChild(list);

      const rescan = document.createElement('button');
      rescan.className = 'jf-btn secondary';
      rescan.textContent = 'Re-run Autofill';
      rescan.addEventListener('click', () => handlers.onAutofillClick && handlers.onAutofillClick());
      body.appendChild(rescan);
    }

    function renderUnresolvedList(body, plan) {
      const needsInput = plan.filter(
        (p) => (p.status === 'unresolved' || p.status === 'review') && !p.record.__jfAssigned
      );
      if (!needsInput.length) return;

      const title = document.createElement('div');
      title.className = 'jf-section-title';
      title.textContent = 'Needs Your Input';
      body.appendChild(title);

      needsInput.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'jf-unresolved';
        const q = document.createElement('div');
        q.className = 'jf-q';
        const hint = item.record.labelText || item.record.placeholder || item.record.name || item.record.id || 'Unnamed field';
        q.textContent = item.status === 'review' ? `${hint} (guess: ${item.label})` : hint;
        q.title = hint;
        row.appendChild(q);
        const select = fieldTypeOptionsSelect(item.status === 'review' ? item.fieldType : null);
        select.addEventListener('change', () => {
          if (!select.value || select.value === '__OTHER__') return;
          item.record.__jfAssigned = true;
          handlers.onFieldTypeAssigned && handlers.onFieldTypeAssigned(item, select.value);
        });
        row.appendChild(select);
        body.appendChild(row);
      });
    }

    return {
      updatePlan(plan) {
        if (stoppedMessage) return;
        lastPlan = plan;
        lastResult = null;
        render();
      },
      showResult(result) {
        lastResult = result;
        render();
      },
      showStopped(message) {
        stoppedMessage = message;
        minimized = false;
        render();
      },
      destroy() {
        host.remove();
      }
    };
  }

  window.JobFillWidget = { mount };
})();
