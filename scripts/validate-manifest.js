// Validates manifest.json: it must parse, declare manifest_version 3, and
// every file it references (icons, popup, options page, background script,
// content scripts/css) must actually exist. Run via `npm run validate`.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'manifest.json');
const errors = [];

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
} catch (e) {
  console.error(`✗ manifest.json failed to parse: ${e.message}`);
  process.exit(1);
}

function requireFile(relPath, context) {
  if (!relPath) return;
  const full = path.join(ROOT, relPath);
  if (!fs.existsSync(full)) errors.push(`${context} references missing file: ${relPath}`);
}

if (manifest.manifest_version !== 3) errors.push(`manifest_version must be 3, got ${manifest.manifest_version}`);
if (!manifest.name) errors.push('missing "name"');
if (!manifest.version) errors.push('missing "version"');

Object.values(manifest.icons || {}).forEach((p) => requireFile(p, 'icons'));
if (manifest.action) {
  requireFile(manifest.action.default_popup, 'action.default_popup');
  Object.values(manifest.action.default_icon || {}).forEach((p) => requireFile(p, 'action.default_icon'));
}
requireFile(manifest.options_page, 'options_page');
if (manifest.background) requireFile(manifest.background.service_worker, 'background.service_worker');

(manifest.content_scripts || []).forEach((cs, i) => {
  (cs.js || []).forEach((p) => requireFile(p, `content_scripts[${i}].js`));
  (cs.css || []).forEach((p) => requireFile(p, `content_scripts[${i}].css`));
  if (!cs.matches || !cs.matches.length) errors.push(`content_scripts[${i}] has no "matches" patterns`);
});

if (errors.length) {
  console.error(`\n✗ manifest.json validation failed (${errors.length} issue(s)):\n`);
  errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}

console.log('✓ manifest.json is valid and every referenced file exists.');
