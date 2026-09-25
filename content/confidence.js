// JobFill — confidence scoring. Combines several weak signals (name, id,
// placeholder, label, aria-label, nearby text, autocomplete, input type)
// into a 0-100 confidence score per candidate FIELD_TYPE, per PRD section 11.
(function () {
  const { FIELD_SIGNALS, SENSITIVE_PATTERNS, CONFIDENCE } = window.JobFillConstants;
  const { normalize, containsPhrase } = window.JobFillUtils;

  const WEIGHTS = {
    nameId: 40,
    label: 35,
    autocomplete: 45,
    inputType: 35,
    placeholder: 25,
    aria: 25,
    nearby: 15
  };

  function isSensitive(record) {
    if (record.type === 'password') return true;
    const haystack = [record.name, record.id, record.placeholder, record.labelText, record.ariaLabel]
      .map(normalize)
      .join(' ');
    return SENSITIVE_PATTERNS.some((pattern) => containsPhrase(haystack, pattern));
  }

  // Generic single-word keywords (e.g. "country") are common inside
  // unrelated question text ("...authorized to work in this country?"),
  // so a longer, more specific keyword match ("authorized to work") earns
  // a specificity bonus to avoid losing to incidental short-word overlap.
  function specificityBonus(wordCount) {
    return Math.min(12, (wordCount - 1) * 4);
  }

  function scoreForType(record, signals, norm) {
    let score = 0;
    let bestWords = 0;
    const nameIdHaystack = `${norm.name} ${norm.id}`;
    const sources = [
      [nameIdHaystack, WEIGHTS.nameId],
      [norm.label, WEIGHTS.label],
      [norm.placeholder, WEIGHTS.placeholder],
      [norm.aria, WEIGHTS.aria],
      [norm.nearby, WEIGHTS.nearby]
    ];
    sources.forEach(([haystack, weight]) => {
      const matched = signals.words.filter((w) => containsPhrase(haystack, w));
      if (matched.length) {
        score += weight;
        bestWords = Math.max(bestWords, ...matched.map((w) => w.split(' ').filter(Boolean).length));
      }
    });
    if (signals.ac && record.autocomplete && signals.ac.some((token) => record.autocomplete.includes(token))) {
      score += WEIGHTS.autocomplete;
    }
    if (signals.type && signals.type.includes(record.type)) {
      score += WEIGHTS.inputType;
    }
    if (score > 0 && bestWords > 1) score += specificityBonus(bestWords);
    return Math.min(100, score);
  }

  // Returns { fieldType, confidence, sensitive, level }
  function classify(record) {
    if (isSensitive(record)) {
      return { fieldType: null, confidence: 0, sensitive: true, level: 'sensitive' };
    }

    const norm = {
      name: normalize(record.name),
      id: normalize(record.id),
      placeholder: normalize(record.placeholder),
      label: normalize(record.labelText),
      aria: normalize(record.ariaLabel),
      nearby: normalize(record.nearbyText).slice(0, 400)
    };

    let best = { fieldType: null, confidence: 0 };
    Object.keys(FIELD_SIGNALS).forEach((fieldType) => {
      const score = scoreForType(record, FIELD_SIGNALS[fieldType], norm);
      if (score > best.confidence) best = { fieldType, confidence: score };
    });

    let level = 'unknown';
    if (best.confidence >= CONFIDENCE.HIGH) level = 'high';
    else if (best.confidence >= CONFIDENCE.MEDIUM) level = 'medium';
    else if (best.confidence > 0) level = 'low';

    return { fieldType: best.confidence > 0 ? best.fieldType : null, confidence: best.confidence, sensitive: false, level };
  }

  window.JobFillConfidence = { classify };
})();
