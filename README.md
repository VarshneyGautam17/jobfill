# JobFill

Chrome extension (Manifest V3) that saves a reusable job-application profile and autofills detected form fields on job sites, per the JobFill PRD (AI/cloud/job-tracker features intentionally excluded — MVP scope only).

See **[USAGE.md](USAGE.md)** for step-by-step install/use/troubleshooting instructions.

## Load it in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select this folder (`chrome-ex`)
4. The JobFill icon appears in the toolbar; first install opens the Profile editor automatically

No build step — it's plain HTML/CSS/JS, so any edit just needs a reload of the extension (and the target page).

## What's implemented

- **Profile system**: multiple profiles, default selection, duplicate/delete, JSON export/import (`options/`)
- **Detection engine**: scans inputs/selects/textareas/radio-groups, extracts name/id/placeholder/label/aria/nearby-text/autocomplete (`content/detector.js`)
- **Confidence scoring**: weighted multi-signal scoring, 0–100 (`content/confidence.js`)
- **Mapping engine**: profile lookup + learned per-site overrides + select/radio option matching (`content/mapper.js`)
- **Autofill engine**: native-setter value injection so React/Vue/Angular-controlled inputs pick up the change, proper `input`/`change`/`click` events (`content/filler.js`)
- **Dynamic + multi-step forms**: `MutationObserver`-based rescanning (`content/observer.js`)
- **Floating widget**: draggable, minimizable, dismissible, shadow-DOM isolated, unknown-field picker that teaches JobFill your correction (`content/widget.js`)
- **Learning system**: per-domain field-key → field-type mappings, editable/removable from the options page
- **Sensitive-field blocklist**: passwords, OTP, CVV/CVC, card/bank/UPI numbers — never auto-filled, checked before anything else
- **Application Questions**, **Privacy** (export/import/delete all data, local stats), **Settings** (widget visibility, auto-detect, confirm-before-autofill, confidence thresholds, theme)

## Deliberate MVP boundaries (per PRD non-goals)

No auto-submit, no auto-clicking Next/Continue, no file-input automation (browsers block scripted file uploads), no AI features, no job tracker, no cloud sync — everything stays in `chrome.storage.local` on this device.

## Try it

1. Click the JobFill icon → fill in your Profile (at least name + email) → Save
2. Visit any page with a form (a job application, or even a generic test form)
3. The floating JobFill widget appears with a field count — click **Autofill**
4. Review the result, fix any "Needs Your Input" fields via the dropdown (JobFill remembers your choice for that site next time)

## Automated tests

`tests/` loads the real extension source into a simulated DOM (jsdom) and exercises detection, confidence scoring, autofill, and the popup/options UI end-to-end — no real browser needed.

```
npm install
npm test
```

Currently 58/58 checks pass (38 pipeline tests + 20 UI smoke tests).

## CI / releases

`.github/workflows/ci.yml` runs on every push and PR: validates `manifest.json` (parses, every referenced file exists) and runs the full test suite. It cannot reach into your local Chrome — there's no such thing as GitHub pushing an update into an unpacked/developer-mode extension, that's a Chrome platform limitation, not something CI can work around. What it *does* give you: broken code gets caught before you ever reload the extension yourself, and on every push to `master`/`main` it packages the extension into a `.zip` and uploads it as a downloadable build artifact.

To cut a versioned release:

1. Bump `"version"` in `manifest.json`
2. `git tag v1.0.1 && git push origin v1.0.1`

`.github/workflows/release.yml` then validates, tests, packages, and publishes a GitHub Release with the `.zip` attached — tag version and manifest version must match, or it fails on purpose rather than shipping a mislabeled build.
