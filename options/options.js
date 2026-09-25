// JobFill — options page. Profile editor, profile manager, learned field
// mappings, application questions, privacy controls, and settings.
(function () {
  const { FIELD_TYPES, FIELD_LABELS, DEFAULT_SETTINGS } = window.JobFillConstants;

  let profiles = {};
  let activeProfileId = null;
  let editingProfileId = null;
  let settings = Object.assign({}, DEFAULT_SETTINGS);
  let siteMappings = {};
  let applicationQuestions = [];
  let stats = { applicationsAssisted: 0, formsDetected: 0, fieldsFilled: 0, fieldsFailed: 0 };

  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function blankProfile(name) {
    return {
      id: uuid(),
      name: name || 'New Profile',
      personal: { firstName: '', middleName: '', lastName: '', fullName: '', email: '', phone: '', country: '', city: '', state: '', address: '', zip: '' },
      professional: { jobTitle: '', company: '', experienceYears: '', summary: '', skills: '', currentSalary: '', expectedSalary: '', noticePeriod: '', employmentType: '' },
      links: { linkedin: '', github: '', portfolio: '', stackoverflow: '', website: '' },
      education: { degree: '', university: '', fieldOfStudy: '', startYear: '', endYear: '', gpa: '' },
      preferences: { workAuthorization: '', relocation: '', remotePreference: '', sponsorship: '' },
      resumes: []
    };
  }

  // ---------- storage ----------
  function loadAll(cb) {
    chrome.storage.local.get(
      ['profiles', 'activeProfileId', 'settings', 'siteMappings', 'applicationQuestions', 'stats'],
      (res) => {
        profiles = res.profiles || {};
        activeProfileId = res.activeProfileId || Object.keys(profiles)[0] || null;
        editingProfileId = activeProfileId;
        settings = Object.assign({}, DEFAULT_SETTINGS, res.settings || {});
        siteMappings = res.siteMappings || {};
        applicationQuestions = res.applicationQuestions || [];
        stats = Object.assign(
          { applicationsAssisted: 0, formsDetected: 0, fieldsFilled: 0, fieldsFailed: 0 },
          res.stats || {}
        );
        cb();
      }
    );
  }

  function persistProfiles(cb) {
    chrome.storage.local.set({ profiles, activeProfileId }, cb || (() => {}));
  }

  function broadcastSettingsChanged() {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        chrome.tabs.sendMessage(tab.id, { type: 'JOBFILL_SETTINGS_CHANGED' }, () => void chrome.runtime.lastError);
      });
    });
  }

  function download(filename, dataObj) {
    const blob = new Blob([JSON.stringify(dataObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function readFileAsJSON(file, cb) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        cb(null, JSON.parse(reader.result));
      } catch (e) {
        cb(e);
      }
    };
    reader.readAsText(file);
  }

  // ---------- tabs ----------
  function activateTab(tab) {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('hidden', p.id !== `tab-${tab}`));
    location.hash = tab;
    if (tab === 'profiles') renderProfilesList();
    if (tab === 'mappings') renderMappings();
    if (tab === 'questions') renderQuestions();
    if (tab === 'privacy') renderStats();
    if (tab === 'settings') renderSettings();
    if (tab === 'profile') renderProfileForm();
  }

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  });

  // ---------- profile editor ----------
  function fv(id) {
    return document.getElementById(id).value.trim();
  }
  function setFv(id, val) {
    document.getElementById(id).value = val || '';
  }

  function renderProfileForm() {
    let profile = profiles[editingProfileId];
    if (!profile) {
      const id = uuid();
      profile = blankProfile('My Profile');
      profile.id = id;
      profiles[id] = profile;
      editingProfileId = id;
      if (!activeProfileId) activeProfileId = id;
      persistProfiles();
    }
    setFv('p_name', profile.name);
    const p = profile.personal, pr = profile.professional, l = profile.links, e = profile.education, pref = profile.preferences;
    setFv('p_firstName', p.firstName); setFv('p_middleName', p.middleName); setFv('p_lastName', p.lastName);
    setFv('p_fullName', p.fullName); setFv('p_email', p.email); setFv('p_phone', p.phone);
    setFv('p_address', p.address); setFv('p_city', p.city); setFv('p_state', p.state);
    setFv('p_country', p.country); setFv('p_zip', p.zip);

    setFv('p_jobTitle', pr.jobTitle); setFv('p_company', pr.company); setFv('p_experienceYears', pr.experienceYears);
    setFv('p_employmentType', pr.employmentType); setFv('p_currentSalary', pr.currentSalary);
    setFv('p_expectedSalary', pr.expectedSalary); setFv('p_noticePeriod', pr.noticePeriod);
    setFv('p_skills', pr.skills); setFv('p_summary', pr.summary);

    setFv('p_linkedin', l.linkedin); setFv('p_github', l.github); setFv('p_portfolio', l.portfolio);
    setFv('p_stackoverflow', l.stackoverflow); setFv('p_website', l.website);

    setFv('p_degree', e.degree); setFv('p_university', e.university); setFv('p_fieldOfStudy', e.fieldOfStudy);
    setFv('p_startYear', e.startYear); setFv('p_endYear', e.endYear); setFv('p_gpa', e.gpa);

    setFv('p_workAuthorization', pref.workAuthorization); setFv('p_relocation', pref.relocation);
    setFv('p_remotePreference', pref.remotePreference); setFv('p_sponsorship', pref.sponsorship);

    renderResumes(profile.resumes || []);
  }

  function renderResumes(resumes) {
    const container = document.getElementById('resumeList');
    container.innerHTML = '';
    resumes.forEach((resume, idx) => {
      const row = document.createElement('div');
      row.className = 'card-row';
      row.style.marginBottom = '8px';

      const label = document.createElement('input');
      label.type = 'text';
      label.placeholder = 'Resume label (e.g. MERN Developer Resume)';
      label.value = resume.label || '';
      label.style.flex = '1';
      label.addEventListener('input', () => (resume.label = label.value));

      const note = document.createElement('input');
      note.type = 'text';
      note.placeholder = 'Note / filename / link';
      note.value = resume.note || '';
      note.style.flex = '1';
      note.addEventListener('input', () => (resume.note = note.value));

      const del = document.createElement('button');
      del.className = 'pill-btn danger';
      del.textContent = 'Remove';
      del.addEventListener('click', () => {
        resumes.splice(idx, 1);
        renderResumes(resumes);
      });

      row.appendChild(label);
      row.appendChild(note);
      row.appendChild(del);
      container.appendChild(row);
    });
    container.dataset.resumes = '1';
    container.__resumes = resumes;
  }

  document.getElementById('addResumeBtn').addEventListener('click', () => {
    const container = document.getElementById('resumeList');
    const resumes = container.__resumes || [];
    resumes.push({ id: uuid(), label: '', note: '' });
    renderResumes(resumes);
  });

  document.getElementById('saveProfileBtn').addEventListener('click', () => {
    const profile = profiles[editingProfileId];
    profile.name = fv('p_name') || profile.name;
    profile.personal = {
      firstName: fv('p_firstName'), middleName: fv('p_middleName'), lastName: fv('p_lastName'),
      fullName: fv('p_fullName') || [fv('p_firstName'), fv('p_lastName')].filter(Boolean).join(' '),
      email: fv('p_email'), phone: fv('p_phone'), address: fv('p_address'), city: fv('p_city'),
      state: fv('p_state'), country: fv('p_country'), zip: fv('p_zip')
    };
    profile.professional = {
      jobTitle: fv('p_jobTitle'), company: fv('p_company'), experienceYears: fv('p_experienceYears'),
      employmentType: fv('p_employmentType'), currentSalary: fv('p_currentSalary'),
      expectedSalary: fv('p_expectedSalary'), noticePeriod: fv('p_noticePeriod'),
      skills: fv('p_skills'), summary: fv('p_summary')
    };
    profile.links = {
      linkedin: fv('p_linkedin'), github: fv('p_github'), portfolio: fv('p_portfolio'),
      stackoverflow: fv('p_stackoverflow'), website: fv('p_website')
    };
    profile.education = {
      degree: fv('p_degree'), university: fv('p_university'), fieldOfStudy: fv('p_fieldOfStudy'),
      startYear: fv('p_startYear'), endYear: fv('p_endYear'), gpa: fv('p_gpa')
    };
    profile.preferences = {
      workAuthorization: fv('p_workAuthorization'), relocation: fv('p_relocation'),
      remotePreference: fv('p_remotePreference'), sponsorship: fv('p_sponsorship')
    };
    profile.resumes = document.getElementById('resumeList').__resumes || [];

    persistProfiles(() => {
      const msg = document.getElementById('saveProfileMsg');
      msg.textContent = 'Saved ✓';
      setTimeout(() => (msg.textContent = ''), 2000);
    });
  });

  // ---------- profiles manager ----------
  function renderProfilesList() {
    const container = document.getElementById('profilesList');
    container.innerHTML = '';
    const ids = Object.keys(profiles);
    if (!ids.length) {
      container.innerHTML = '<p class="hint">No profiles yet. Create one to get started.</p>';
      return;
    }
    ids.forEach((id) => {
      const profile = profiles[id];
      const card = document.createElement('div');
      card.className = 'card';
      const row = document.createElement('div');
      row.className = 'card-row';

      const star = document.createElement('span');
      star.className = 'star' + (id === activeProfileId ? ' active' : '');
      star.textContent = '★';
      star.title = 'Set as default profile';
      star.addEventListener('click', () => {
        activeProfileId = id;
        persistProfiles(renderProfilesList);
      });

      const info = document.createElement('div');
      info.className = 'grow';
      const title = document.createElement('div');
      title.className = 'card-title';
      title.textContent = profile.name || 'Untitled';
      const sub = document.createElement('div');
      sub.className = 'card-sub';
      sub.textContent = (profile.professional && profile.professional.jobTitle) || '';
      info.appendChild(title);
      info.appendChild(sub);

      const editBtn = pill('Edit', () => {
        editingProfileId = id;
        activateTab('profile');
      });
      const dupBtn = pill('Duplicate', () => {
        const copy = JSON.parse(JSON.stringify(profile));
        copy.id = uuid();
        copy.name = `${profile.name} (Copy)`;
        profiles[copy.id] = copy;
        persistProfiles(renderProfilesList);
      });
      const delBtn = pill('Delete', () => {
        if (!confirm(`Delete profile "${profile.name}"? This cannot be undone.`)) return;
        delete profiles[id];
        if (activeProfileId === id) activeProfileId = Object.keys(profiles)[0] || null;
        persistProfiles(renderProfilesList);
      }, true);

      row.appendChild(star);
      row.appendChild(info);
      row.appendChild(editBtn);
      row.appendChild(dupBtn);
      row.appendChild(delBtn);
      card.appendChild(row);
      container.appendChild(card);
    });
  }

  function pill(text, onClick, danger) {
    const btn = document.createElement('button');
    btn.className = 'pill-btn' + (danger ? ' danger' : '');
    btn.textContent = text;
    btn.addEventListener('click', onClick);
    return btn;
  }

  document.getElementById('newProfileBtn').addEventListener('click', () => {
    const name = prompt('Profile name (e.g. Frontend Developer):', 'New Profile');
    if (name === null) return;
    const profile = blankProfile(name || 'New Profile');
    profiles[profile.id] = profile;
    if (!activeProfileId) activeProfileId = profile.id;
    editingProfileId = profile.id;
    persistProfiles(() => activateTab('profile'));
  });

  document.getElementById('exportProfilesBtn').addEventListener('click', () => {
    download('jobfill-profiles.json', { profiles, activeProfileId });
  });

  document.getElementById('importProfilesInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    readFileAsJSON(file, (err, data) => {
      if (err || !data || !data.profiles) {
        alert('That file does not look like a JobFill profiles export.');
        return;
      }
      Object.values(data.profiles).forEach((incoming) => {
        const copy = Object.assign({}, incoming, { id: uuid() });
        profiles[copy.id] = copy;
      });
      persistProfiles(renderProfilesList);
      e.target.value = '';
    });
  });

  // ---------- field mappings ----------
  function fieldTypeSelect(selectedType, onChange) {
    const select = document.createElement('select');
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = '(unmapped)';
    select.appendChild(blank);
    Object.keys(FIELD_TYPES).forEach((ft) => {
      const opt = document.createElement('option');
      opt.value = ft;
      opt.textContent = FIELD_LABELS[ft] || ft;
      if (ft === selectedType) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener('change', () => onChange(select.value));
    return select;
  }

  function renderMappings() {
    const container = document.getElementById('mappingsList');
    container.innerHTML = '';
    const domains = Object.keys(siteMappings);
    if (!domains.length) {
      container.innerHTML = '<p class="hint">No learned mappings yet. Correct a field on any job site and JobFill will remember it here.</p>';
      return;
    }
    domains.forEach((domain) => {
      const heading = document.createElement('div');
      heading.className = 'mapping-domain card-row';
      const domainName = document.createElement('span');
      domainName.className = 'grow';
      domainName.textContent = domain;
      const resetBtn = pill('Reset Domain', () => {
        if (!confirm(`Remove all learned mappings for ${domain}?`)) return;
        delete siteMappings[domain];
        chrome.storage.local.set({ siteMappings }, renderMappings);
      }, true);
      heading.appendChild(domainName);
      heading.appendChild(resetBtn);
      container.appendChild(heading);

      Object.keys(siteMappings[domain]).forEach((fieldKey) => {
        const row = document.createElement('div');
        row.className = 'mapping-row';
        const keyEl = document.createElement('span');
        keyEl.className = 'key';
        keyEl.textContent = fieldKey;
        const select = fieldTypeSelect(siteMappings[domain][fieldKey], (val) => {
          if (!val) return;
          siteMappings[domain][fieldKey] = val;
          chrome.storage.local.set({ siteMappings });
        });
        const del = pill('Delete', () => {
          delete siteMappings[domain][fieldKey];
          if (!Object.keys(siteMappings[domain]).length) delete siteMappings[domain];
          chrome.storage.local.set({ siteMappings }, renderMappings);
        }, true);
        row.appendChild(keyEl);
        row.appendChild(select);
        row.appendChild(del);
        container.appendChild(row);
      });
    });
  }

  // ---------- application questions ----------
  function renderQuestions() {
    const container = document.getElementById('questionsList');
    container.innerHTML = '';
    applicationQuestions.forEach((q, idx) => {
      const row = document.createElement('div');
      row.className = 'question-row';

      const question = document.createElement('textarea');
      question.placeholder = 'Question (e.g. Are you authorized to work in India?)';
      question.value = q.question || '';
      question.addEventListener('input', () => {
        q.question = question.value;
        chrome.storage.local.set({ applicationQuestions });
      });

      const answer = document.createElement('textarea');
      answer.placeholder = 'Your answer';
      answer.value = q.answer || '';
      answer.addEventListener('input', () => {
        q.answer = answer.value;
        chrome.storage.local.set({ applicationQuestions });
      });

      const del = pill('Delete', () => {
        applicationQuestions.splice(idx, 1);
        chrome.storage.local.set({ applicationQuestions }, renderQuestions);
      }, true);

      row.appendChild(question);
      row.appendChild(answer);
      row.appendChild(del);
      container.appendChild(row);
    });
  }

  document.getElementById('addQuestionBtn').addEventListener('click', () => {
    applicationQuestions.push({ id: uuid(), question: '', answer: '' });
    chrome.storage.local.set({ applicationQuestions }, renderQuestions);
  });

  // ---------- privacy ----------
  function renderStats() {
    const box = document.getElementById('statsBox');
    const successRate = stats.fieldsFilled + stats.fieldsFailed > 0
      ? Math.round((stats.fieldsFilled / (stats.fieldsFilled + stats.fieldsFailed)) * 100)
      : 0;
    box.innerHTML = '';
    [
      ['Applications Assisted', stats.applicationsAssisted],
      ['Forms Detected', stats.formsDetected],
      ['Fields Filled', stats.fieldsFilled],
      ['Success Rate', `${successRate}%`]
    ].forEach(([label, value]) => {
      const tile = document.createElement('div');
      tile.className = 'stat-tile';
      tile.innerHTML = '';
      const b = document.createElement('b');
      b.textContent = String(value);
      const span = document.createElement('span');
      span.textContent = label;
      tile.appendChild(b);
      tile.appendChild(span);
      box.appendChild(tile);
    });
  }

  document.getElementById('exportAllBtn').addEventListener('click', () => {
    chrome.storage.local.get(null, (all) => download('jobfill-data.json', all));
  });

  document.getElementById('importAllInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    readFileAsJSON(file, (err, data) => {
      if (err || typeof data !== 'object') {
        alert('That file does not look like a valid JobFill export.');
        return;
      }
      if (!confirm('This will overwrite your current JobFill data with the imported file. Continue?')) return;
      chrome.storage.local.set(data, () => loadAll(() => activateTab(currentTab())));
      e.target.value = '';
    });
  });

  document.getElementById('clearAllBtn').addEventListener('click', () => {
    if (!confirm('Delete ALL JobFill data (profiles, mappings, settings)? This cannot be undone.')) return;
    chrome.storage.local.clear(() => {
      profiles = {};
      activeProfileId = null;
      editingProfileId = null;
      settings = Object.assign({}, DEFAULT_SETTINGS);
      siteMappings = {};
      applicationQuestions = [];
      stats = { applicationsAssisted: 0, formsDetected: 0, fieldsFilled: 0, fieldsFailed: 0 };
      chrome.storage.local.set({ settings, profiles, siteMappings, applicationQuestions, stats });
      activateTab(currentTab());
    });
  });

  // ---------- settings ----------
  function renderSettings() {
    document.getElementById('s_showWidget').checked = !!settings.showWidget;
    document.getElementById('s_autoDetectForms').checked = !!settings.autoDetectForms;
    document.getElementById('s_confirmBeforeAutofill').checked = !!settings.confirmBeforeAutofill;
    document.getElementById('s_fillHighConfidence').checked = !!settings.fillHighConfidence;
    document.getElementById('s_fillMediumConfidence').checked = !!settings.fillMediumConfidence;
    document.getElementById('s_askBeforeMedium').checked = !!settings.askBeforeMedium;
    document.getElementById('s_theme').value = settings.theme || 'system';
  }

  document.getElementById('saveSettingsBtn').addEventListener('click', () => {
    settings = {
      showWidget: document.getElementById('s_showWidget').checked,
      autoDetectForms: document.getElementById('s_autoDetectForms').checked,
      confirmBeforeAutofill: document.getElementById('s_confirmBeforeAutofill').checked,
      fillHighConfidence: document.getElementById('s_fillHighConfidence').checked,
      fillMediumConfidence: document.getElementById('s_fillMediumConfidence').checked,
      askBeforeMedium: document.getElementById('s_askBeforeMedium').checked,
      theme: document.getElementById('s_theme').value
    };
    chrome.storage.local.set({ settings }, () => {
      broadcastSettingsChanged();
      const msg = document.getElementById('saveSettingsMsg');
      msg.textContent = 'Saved ✓';
      setTimeout(() => (msg.textContent = ''), 2000);
    });
  });

  // ---------- boot ----------
  function currentTab() {
    const fromHash = location.hash.replace('#', '');
    const valid = ['profile', 'profiles', 'mappings', 'questions', 'privacy', 'settings'];
    return valid.includes(fromHash) ? fromHash : 'profile';
  }

  loadAll(() => activateTab(currentTab()));
  window.addEventListener('hashchange', () => activateTab(currentTab()));
})();
