// JobFill — maps detected field records to profile data, respecting
// learned site-specific mappings (section 18/19) and confidence levels.
(function () {
  const { PROFILE_PATHS, FIELD_LABELS } = window.JobFillConstants;
  const { normalize, getByPath } = window.JobFillUtils;

  function buildFieldKey(record) {
    if (record.name) return `name:${record.name}`;
    if (record.id) return `id:${record.id}`;
    if (record.labelText) return `label:${normalize(record.labelText).slice(0, 60)}`;
    return `type:${record.type}`;
  }

  function tokenOverlapScore(a, b) {
    const ta = new Set(normalize(a).split(' ').filter(Boolean));
    const tb = new Set(normalize(b).split(' ').filter(Boolean));
    if (!ta.size || !tb.size) return 0;
    let overlap = 0;
    ta.forEach((t) => {
      if (tb.has(t)) overlap++;
    });
    return overlap / Math.max(ta.size, tb.size);
  }

  // Finds the option (select <option> or radio choice) that best matches
  // the desired text value, e.g. profile.country "United States" -> option "USA".
  function findBestOption(options, desiredText) {
    if (!desiredText) return null;
    const desiredNorm = normalize(desiredText);
    if (!desiredNorm) return null;

    let exact = options.find((o) => normalize(o.text) === desiredNorm || normalize(o.value) === desiredNorm);
    if (exact) return exact;

    let contains = options.find(
      (o) => normalize(o.text).includes(desiredNorm) || desiredNorm.includes(normalize(o.text))
    );
    if (contains) return contains;

    let best = null;
    let bestScore = 0;
    options.forEach((o) => {
      const score = tokenOverlapScore(o.text, desiredText);
      if (score > bestScore) {
        bestScore = score;
        best = o;
      }
    });
    return bestScore >= 0.5 ? best : null;
  }

  // Builds a fill plan for every detected record.
  // ctx: { profile, siteMappings (for this hostname), settings }
  function plan(records, ctx) {
    const { profile, siteMappings, settings } = ctx;

    return records.map((record) => {
      const fieldKey = buildFieldKey(record);
      const learnedType = siteMappings && siteMappings[fieldKey];

      let fieldType = null;
      let confidence = 0;
      let source = 'detected';
      let sensitive = false;

      if (learnedType) {
        fieldType = learnedType;
        confidence = 100;
        source = 'learned';
      } else {
        const result = window.JobFillConfidence.classify(record);
        sensitive = result.sensitive;
        fieldType = result.fieldType;
        confidence = result.confidence;
      }

      const item = {
        record,
        fieldKey,
        fieldType,
        confidence,
        source,
        status: 'unresolved',
        value: null,
        optionMatch: null,
        label: fieldType ? FIELD_LABELS[fieldType] : null
      };

      if (sensitive) {
        item.status = 'sensitive';
        return item;
      }

      if (!fieldType) {
        item.status = 'unresolved';
        return item;
      }

      const path = PROFILE_PATHS[fieldType];
      const rawValue = path ? getByPath(profile, path) : null;

      if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') {
        item.status = 'empty';
        return item;
      }

      if (record.type === 'select' || record.type === 'radio-group') {
        const optionMatch = findBestOption(record.options || [], String(rawValue));
        if (!optionMatch) {
          item.status = 'unresolved';
          return item;
        }
        item.optionMatch = optionMatch;
        item.value = String(rawValue);
      } else {
        item.value = String(rawValue);
      }

      const highConfidence = source === 'learned' || confidence >= window.JobFillConstants.CONFIDENCE.HIGH;
      const mediumConfidence = confidence >= window.JobFillConstants.CONFIDENCE.MEDIUM;

      if (highConfidence && (!settings || settings.fillHighConfidence !== false)) {
        item.status = 'fill';
      } else if (mediumConfidence && (!settings || settings.fillMediumConfidence !== false)) {
        item.status = settings && settings.askBeforeMedium ? 'review' : 'fill-review';
      } else {
        item.status = 'unresolved';
      }

      return item;
    });
  }

  window.JobFillMapper = { buildFieldKey, findBestOption, plan };
})();
