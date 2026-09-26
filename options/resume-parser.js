// AutoFill Assistant — best-effort resume (PDF) -> profile field extraction.
//
// Everything here runs locally in the options page using a vendored copy of
// PDF.js (options/vendor/pdfjs/, Apache-2.0) — the PDF's bytes never leave
// the browser. There is no OCR and no language model: this is plain
// regex/keyword heuristics over the text PDF.js extracts, the same spirit as
// content/confidence.js's keyword scoring. Contact info (email/phone/links)
// is reliable. Job title/company/dates/education are best-effort guesses —
// the caller is expected to show them for review before saving, never
// silently overwrite a profile with them.
import * as pdfjsLib from './vendor/pdfjs/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('options/vendor/pdfjs/pdf.worker.min.mjs');

const EMAIL_RE = /[a-zA-Z0-9.+_-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9.-]{2,}/;
const PHONE_RE = /(\+\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}(?:[-.\s]?\d{2,4})?/;
const LINKEDIN_RE = /(https?:\/\/)?(www\.)?linkedin\.com\/\S+/i;
const GITHUB_RE = /(https?:\/\/)?(www\.)?github\.com\/\S+/i;
const WEBSITE_RE = /(https?:\/\/)?(www\.)?[a-z0-9-]+\.[a-z]{2,}(\/\S*)?/i;
const YEAR_RE = /\b(19|20)\d{2}\b/;
const DATE_RANGE_RE = /([A-Za-z]{3,9}\.?\s+\d{4}|\d{1,2}\/\d{4}|\d{4})\s*(?:-|–|—|to)\s*(Present|Current|Now|[A-Za-z]{3,9}\.?\s+\d{4}|\d{1,2}\/\d{4}|\d{4})/i;
const NAME_LIKE_RE = /^[A-Z][a-zA-Z.'-]+(\s+[A-Z][a-zA-Z.'-]+){1,3}$/;
const DEGREE_RE = /\b(bachelor|master|associate|b\.?tech|m\.?tech|b\.?sc|m\.?sc|b\.?e\.?|m\.?e\.?|b\.?a\.?|m\.?a\.?|mba|ph\.?d|doctorate|diploma)\b/i;
const SCHOOL_RE = /\b(university|college|institute|school of)\b/i;

const SECTION_HEADS = {
  experience: /^(work experience|professional experience|experience|employment history|career history)$/i,
  education: /^(education|academic background|academics)$/i,
  skills: /^(skills|technical skills|core competencies|key skills|skill set)$/i,
  summary: /^(summary|profile|objective|about me|professional summary)$/i
};

function firstMatch(re, text) {
  const m = text.match(re);
  return m ? m[0].trim() : '';
}

// PDF.js hands back positioned text fragments, not lines — hasEOL marks an
// explicit line break, and a jump in the y transform (a new baseline) is the
// fallback signal for wrapped/columnar text that lacks it. Multi-column
// resumes will still interleave column text in reading order; there's no
// general fix for that without layout analysis, which is out of scope here.
async function extractTextAndLayout(pdfDoc) {
  const lines = [];
  const firstPageGlyphs = [];
  let currentLine = '';
  let lastY = null;

  for (let p = 1; p <= pdfDoc.numPages; p++) {
    const page = await pdfDoc.getPage(p);
    const content = await page.getTextContent();
    lastY = null;
    content.items.forEach((item) => {
      if (!item.str) return;
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2 && currentLine) {
        lines.push(currentLine.trim());
        currentLine = '';
      }
      currentLine += item.str + (item.hasEOL ? '' : ' ');
      if (item.hasEOL) {
        lines.push(currentLine.trim());
        currentLine = '';
      }
      lastY = y;
      if (p === 1) {
        const fontSize = Math.hypot(item.transform[2], item.transform[3]);
        firstPageGlyphs.push({ text: item.str.trim(), size: fontSize, y });
      }
    });
  }
  if (currentLine.trim()) lines.push(currentLine.trim());

  return { lines: lines.filter(Boolean), firstPageGlyphs };
}

function splitSections(lines) {
  const heads = [];
  lines.forEach((line, i) => {
    const clean = line.trim();
    Object.keys(SECTION_HEADS).forEach((key) => {
      if (SECTION_HEADS[key].test(clean)) heads.push({ key, index: i });
    });
  });
  heads.sort((a, b) => a.index - b.index);
  const sections = {};
  heads.forEach((h, i) => {
    const end = i + 1 < heads.length ? heads[i + 1].index : lines.length;
    sections[h.key] = lines.slice(h.index + 1, end).filter(Boolean);
  });
  return sections;
}

function guessName(lines, firstPageGlyphs) {
  for (const line of lines.slice(0, 6)) {
    const clean = line.trim();
    if (NAME_LIKE_RE.test(clean) && !EMAIL_RE.test(clean) && clean.length < 50) return clean;
  }
  const byFontSize = firstPageGlyphs
    .filter((g) => g.text && /^[A-Za-z][A-Za-z .'-]{2,49}$/.test(g.text))
    .sort((a, b) => b.size - a.size);
  return byFontSize.length ? byFontSize[0].text : '';
}

function guessSkills(sections) {
  if (!sections.skills || !sections.skills.length) return '';
  const joined = sections.skills.join(', ');
  return joined
    .split(/[,;•|]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 40)
    .join(', ');
}

// First entry of the experience section only — matches this extension's
// single "current/most recent role" profile shape (see constants.js
// JOB_LOCATION/JOB_START_DATE/etc.), not a repeatable work-history list.
function guessCurrentRole(sections) {
  const result = { jobTitle: '', company: '', location: '', startDate: '', endDate: '', currentlyWorking: '', description: '' };
  const block = sections.experience;
  if (!block || !block.length) return result;

  const dateLineIdx = block.findIndex((l) => DATE_RANGE_RE.test(l));
  const dateMatch = dateLineIdx >= 0 ? block[dateLineIdx].match(DATE_RANGE_RE) : null;
  if (dateMatch) {
    result.startDate = dateMatch[1];
    const end = dateMatch[2];
    if (/present|current|now/i.test(end)) {
      result.currentlyWorking = 'Yes';
    } else {
      result.endDate = end;
    }
  }

  // The title/company header line is usually the first line that isn't
  // itself the date range (some templates put dates on the same line).
  const headerIdx = block.findIndex((l, i) => i !== dateLineIdx && l.trim().length > 0);
  if (headerIdx >= 0) {
    let header = block[headerIdx];
    if (dateMatch && header.includes(dateMatch[0])) header = header.replace(dateMatch[0], '').trim();
    const parts = header.split(/\s+at\s+|\s+[-–|]\s+/i).map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      result.jobTitle = parts[0];
      result.company = parts[1];
    } else if (parts.length === 1) {
      result.jobTitle = parts[0];
    }
  }

  const locationLine = block.find((l, i) => i !== headerIdx && i !== dateLineIdx && /^[A-Z][a-zA-Z.\s]+,\s*[A-Z][a-zA-Z.\s]{1,25}$/.test(l.trim()));
  if (locationLine) result.location = locationLine.trim();

  const descLines = block.filter((l, i) => i !== headerIdx && i !== dateLineIdx && l !== locationLine && l.trim().length > 15);
  if (descLines.length) result.description = descLines.slice(0, 6).join(' ').slice(0, 800);

  return result;
}

function guessEducation(sections) {
  const result = { degree: '', university: '', endYear: '' };
  const block = sections.education;
  if (!block || !block.length) return result;

  const degreeLine = block.find((l) => DEGREE_RE.test(l));
  if (degreeLine) result.degree = degreeLine.trim();

  const schoolLine = block.find((l) => SCHOOL_RE.test(l));
  if (schoolLine) result.university = schoolLine.trim();

  const years = block.join(' ').match(new RegExp(YEAR_RE, 'g'));
  if (years && years.length) result.endYear = String(Math.max(...years.map(Number)));

  return result;
}

// Returns a partial profile-shaped object — only keys it actually found
// non-empty values for. The caller merges this into the form and always
// requires an explicit Save, same as every other unresolved/guessed field
// in this extension.
async function parseResumeFile(file) {
  const buf = await file.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;
  const { lines, firstPageGlyphs } = await extractTextAndLayout(pdfDoc);
  const fullText = lines.join('\n');
  const sections = splitSections(lines);

  const role = guessCurrentRole(sections);
  const edu = guessEducation(sections);

  const fullName = guessName(lines, firstPageGlyphs);
  const nameParts = fullName ? fullName.split(/\s+/) : [];

  return {
    personal: {
      fullName,
      firstName: nameParts[0] || '',
      lastName: nameParts.length > 1 ? nameParts[nameParts.length - 1] : '',
      email: firstMatch(EMAIL_RE, fullText),
      phone: firstMatch(PHONE_RE, fullText)
    },
    professional: {
      jobTitle: role.jobTitle,
      company: role.company,
      location: role.location,
      startDate: role.startDate,
      endDate: role.endDate,
      currentlyWorking: role.currentlyWorking,
      description: role.description,
      skills: guessSkills(sections),
      summary: (sections.summary || []).join(' ').slice(0, 1000)
    },
    links: {
      linkedin: firstMatch(LINKEDIN_RE, fullText),
      github: firstMatch(GITHUB_RE, fullText)
    },
    education: {
      degree: edu.degree,
      university: edu.university,
      endYear: edu.endYear
    }
  };
}

window.JobFillResumeParser = { parseResumeFile };
