// AutoFill Assistant — options page. Profile editor, profile manager, learned field
// mappings, application questions, privacy controls, and settings.
(function () {
  const { FIELD_TYPES, FIELD_LABELS, DEFAULT_SETTINGS } = window.JobFillConstants;
  const TRUTHY = new Set(['yes', 'true', 'y', '1']);

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
      professional: {
        jobTitle: '', company: '', experienceYears: '', summary: '', skills: '',
        currentSalary: '', expectedSalary: '', noticePeriod: '', employmentType: '',
        location: '', description: '', startDate: '', endDate: '', currentlyWorking: ''
      },
      links: { linkedin: '', github: '', portfolio: '', stackoverflow: '', website: '' },
      education: { degree: '', university: '', fieldOfStudy: '', startYear: '', endYear: '', gpa: '' },
      preferences: { workAuthorization: '', relocation: '', remotePreference: '', sponsorship: '' },
      resumes: [],
      defaultResumeId: null
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
    setFv('p_jobLocation', pr.location); setFv('p_jobDescription', pr.description);
    setFv('p_jobStartDate', pr.startDate); setFv('p_jobEndDate', pr.endDate);
    document.getElementById('p_currentlyWorking').checked = TRUTHY.has(String(pr.currentlyWorking || '').trim().toLowerCase());

    setFv('p_linkedin', l.linkedin); setFv('p_github', l.github); setFv('p_portfolio', l.portfolio);
    setFv('p_stackoverflow', l.stackoverflow); setFv('p_website', l.website);

    setFv('p_degree', e.degree); setFv('p_university', e.university); setFv('p_fieldOfStudy', e.fieldOfStudy);
    setFv('p_startYear', e.startYear); setFv('p_endYear', e.endYear); setFv('p_gpa', e.gpa);

    setFv('p_workAuthorization', pref.workAuthorization); setFv('p_relocation', pref.relocation);
    setFv('p_remotePreference', pref.remotePreference); setFv('p_sponsorship', pref.sponsorship);

    renderResumes(profile.resumes || []);
  }

  function formatBytes(n) {
    if (!n) return '';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  // Stores the raw base64 payload (no "data:...;base64," prefix — mimeType
  // is kept separately) so filler.js can rebuild a File and attach it to a
  // real <input type="file"> via DataTransfer when a site asks for a resume.
  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result);
        const commaIdx = result.indexOf(',');
        resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function renderResumes(resumes) {
    const container = document.getElementById('resumeList');
    container.innerHTML = '';
    const profile = profiles[editingProfileId];

    resumes.forEach((resume, idx) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.marginBottom = '8px';

      const row = document.createElement('div');
      row.className = 'card-row';

      const isDefault = profile.defaultResumeId ? profile.defaultResumeId === resume.id : idx === 0;
      const star = document.createElement('span');
      star.className = 'star' + (isDefault ? ' active' : '');
      star.textContent = '★';
      star.title = 'Use this resume when AutoFill Assistant fills a "Resume/CV upload" field';
      star.style.cursor = 'pointer';
      star.addEventListener('click', () => {
        profile.defaultResumeId = resume.id;
        renderResumes(resumes);
      });

      const label = document.createElement('input');
      label.type = 'text';
      label.placeholder = 'Resume label (e.g. MERN Developer Resume)';
      label.value = resume.label || '';
      label.className = 'grow';
      label.addEventListener('input', () => (resume.label = label.value));

      const fileBtn = document.createElement('label');
      fileBtn.className = 'pill-btn';
      fileBtn.style.cursor = 'pointer';
      fileBtn.textContent = resume.fileName ? 'Replace File' : 'Upload File';
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      fileInput.style.display = 'none';
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) return;
        resume.dataBase64 = await readFileAsBase64(file);
        resume.fileName = file.name;
        resume.mimeType = file.type;
        resume.sizeBytes = file.size;
        if (!resume.label) resume.label = file.name.replace(/\.[^.]+$/, '');
        if (!profile.defaultResumeId) profile.defaultResumeId = resume.id;
        renderResumes(resumes);
      });
      fileBtn.appendChild(fileInput);

      const del = document.createElement('button');
      del.className = 'pill-btn danger';
      del.textContent = 'Remove';
      del.addEventListener('click', () => {
        resumes.splice(idx, 1);
        if (profile.defaultResumeId === resume.id) profile.defaultResumeId = null;
        renderResumes(resumes);
      });

      row.appendChild(star);
      row.appendChild(label);
      row.appendChild(fileBtn);
      row.appendChild(del);
      card.appendChild(row);

      const info = document.createElement('div');
      info.className = 'card-sub';
      info.style.marginTop = '4px';
      info.textContent = resume.fileName
        ? `${resume.fileName} (${formatBytes(resume.sizeBytes)})${isDefault ? ' — used for autofill' : ''}`
        : 'No file attached yet — upload one so AutoFill Assistant can attach it to a "Resume/CV" field for you.';
      card.appendChild(info);

      container.appendChild(card);
    });
    container.__resumes = resumes;
  }

  document.getElementById('addResumeBtn').addEventListener('click', () => {
    const container = document.getElementById('resumeList');
    const resumes = container.__resumes || [];
    resumes.push({ id: uuid(), label: '' });
    renderResumes(resumes);
  });

  // ---------- resume (PDF) import ----------
  // Maps the parser's output shape (options/resume-parser.js) to the form
  // input ids above. Only fields the parser actually found land here, and
  // only into inputs that are currently blank — an import never clobbers
  // something the user already typed in.
  const RESUME_FIELD_MAP = [
    ['personal.fullName', 'p_fullName'],
    ['personal.firstName', 'p_firstName'],
    ['personal.lastName', 'p_lastName'],
    ['personal.email', 'p_email'],
    ['personal.phone', 'p_phone'],
    ['professional.jobTitle', 'p_jobTitle'],
    ['professional.company', 'p_company'],
    ['professional.location', 'p_jobLocation'],
    ['professional.startDate', 'p_jobStartDate'],
    ['professional.endDate', 'p_jobEndDate'],
    ['professional.description', 'p_jobDescription'],
    ['professional.skills', 'p_skills'],
    ['professional.summary', 'p_summary'],
    ['links.linkedin', 'p_linkedin'],
    ['links.github', 'p_github'],
    ['education.degree', 'p_degree'],
    ['education.university', 'p_university'],
    ['education.endYear', 'p_endYear']
  ];

  function getByDotPath(obj, dotPath) {
    return dotPath.split('.').reduce((o, k) => (o ? o[k] : undefined), obj);
  }

  document.getElementById('resumeFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const msg = document.getElementById('resumeImportMsg');
    msg.style.color = '';
    msg.textContent = 'Reading PDF…';
    try {
      if (!window.JobFillResumeParser) throw new Error('Resume parser is still loading — try again in a second.');
      const parsed = await window.JobFillResumeParser.parseResumeFile(file);

      let filledCount = 0;
      RESUME_FIELD_MAP.forEach(([path, id]) => {
        const value = getByDotPath(parsed, path);
        if (!value || fv(id)) return;
        setFv(id, value);
        filledCount++;
      });
      if (parsed.professional && parsed.professional.currentlyWorking === 'Yes') {
        const cb = document.getElementById('p_currentlyWorking');
        if (!cb.checked) {
          cb.checked = true;
          filledCount++;
        }
      }

      // The same PDF also becomes a stored resume attachment, so sites that
      // ask for a "Resume/CV upload" get this file auto-attached later too
      // (filler.js -> RESUME field type) — one upload covers both.
      const resumeContainer = document.getElementById('resumeList');
      const resumes = resumeContainer.__resumes || [];
      let resumeEntry = resumes.find((r) => r.fileName === file.name);
      if (!resumeEntry) {
        resumeEntry = { id: uuid(), label: file.name.replace(/\.[^.]+$/, '') };
        resumes.push(resumeEntry);
      }
      resumeEntry.dataBase64 = await readFileAsBase64(file);
      resumeEntry.fileName = file.name;
      resumeEntry.mimeType = file.type;
      resumeEntry.sizeBytes = file.size;
      const editingProfile = profiles[editingProfileId];
      if (!editingProfile.defaultResumeId) editingProfile.defaultResumeId = resumeEntry.id;
      renderResumes(resumes);

      msg.textContent = filledCount
        ? `Filled ${filledCount} field(s) and attached this file as your resume for upload fields — review below, then click Save Profile.`
        : 'Attached this file as your resume for upload fields, but could not confidently pull any profile fields from it — fill those in manually.';
    } catch (err) {
      console.error('[AutoFill Assistant] resume import failed', err);
      msg.style.color = '#c0392b';
      msg.textContent = `Couldn't read that PDF (${err.message || err}). Try a different export, or fill in manually.`;
    } finally {
      e.target.value = '';
    }
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
      skills: fv('p_skills'), summary: fv('p_summary'),
      location: fv('p_jobLocation'), description: fv('p_jobDescription'),
      startDate: fv('p_jobStartDate'), endDate: fv('p_jobEndDate'),
      currentlyWorking: document.getElementById('p_currentlyWorking').checked ? 'Yes' : 'No'
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
        alert('That file does not look like an AutoFill Assistant profiles export.');
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
      container.innerHTML = '<p class="hint">No learned mappings yet. Correct a field on any site and AutoFill Assistant will remember it here.</p>';
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
        alert('That file does not look like a valid AutoFill Assistant export.');
        return;
      }
      if (!confirm('This will overwrite your current AutoFill Assistant data with the imported file. Continue?')) return;
      chrome.storage.local.set(data, () => loadAll(() => activateTab(currentTab())));
      e.target.value = '';
    });
  });

  document.getElementById('clearAllBtn').addEventListener('click', () => {
    if (!confirm('Delete ALL AutoFill Assistant data (profiles, mappings, settings)? This cannot be undone.')) return;
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
    document.getElementById('s_autoFillOnDetect').checked = !!settings.autoFillOnDetect;
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
      autoFillOnDetect: document.getElementById('s_autoFillOnDetect').checked,
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
