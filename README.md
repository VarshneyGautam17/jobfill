# AutoFill Assistant

Chrome extension (Manifest V3) that saves a reusable profile and autofills detected form fields — click-to-activate: it runs on a page only after you explicitly trigger it there from the popup, never automatically (AI/cloud/job-tracker features intentionally excluded — MVP scope only).

See **[USAGE.md](USAGE.md)** for step-by-step install/use/troubleshooting instructions.

## Load it in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select this folder (`chrome-ex`)
4. The AutoFill Assistant icon appears in the toolbar; first install opens the Profile editor automatically

No build step — it's plain HTML/CSS/JS, so any edit just needs a reload of the extension (and the target page).

## What's implemented

- **Click-to-activate**: no `content_scripts`, no broad host permission — the popup injects the detection/fill pipeline into the current tab on demand (`chrome.scripting.executeScript`, `activeTab`) only when you click "Detect Fields on This Page" (`popup/popup.js`)
- **Profile system**: multiple profiles, default selection, duplicate/delete, JSON export/import (`options/`)
- **Resume import + storage**: local PDF text extraction (vendored PDF.js) pre-fills profile fields from an uploaded resume, and stores the file itself so it can be attached to a site's file-upload field later (`options/resume-parser.js`, `options/options.js`)
- **Detection engine**: scans inputs/selects/textareas/radio-groups/file-inputs, extracts name/id/placeholder/label/aria/nearby-text/autocomplete (`content/detector.js`)
- **Confidence scoring**: weighted multi-signal scoring, 0–100 (`content/confidence.js`)
- **Mapping engine**: profile lookup + learned per-site overrides + select/radio option matching (`content/mapper.js`)
- **Autofill engine**: native-setter value injection so React/Vue/Angular-controlled inputs pick up the change, proper `input`/`change`/`click` events, a re-assert-on-next-tick pass for search/typeahead fields that try to revert an unmatched value, and `DataTransfer`-based file attachment for resume-upload fields (`content/filler.js`)
- **Dynamic + multi-step forms**: `MutationObserver`-based rescanning once active on a page, plus an optional "auto-fill on detect" setting so newly-discovered fields fill themselves without another click (`content/observer.js`, `content/content.js`)
- **Floating widget**: draggable, minimizable, dismissible, shadow-DOM isolated, unknown-field picker that teaches AutoFill Assistant your correction (`content/widget.js`)
- **Learning system**: per-domain field-key → field-type mappings, editable/removable from the options page
- **Sensitive-field blocklist**: passwords, OTP, CVV/CVC, card/bank/UPI numbers — never auto-filled, checked before anything else
- **Shadow DOM support**: many modern component libraries (SmartRecruiters, Workday, various design systems) render real fields inside a custom element's shadow root, invisible to plain `document.querySelectorAll` — detection, label lookup, dynamic-field observation, and event dispatch are all shadow-aware
- **Label-signal filtering**: a field only counts as detected if it has a real `<label>`, placeholder, aria-label, or meaningful autocomplete token — piercing shadow roots also reaches cookie banners/chat widgets/search boxes present on almost any site, and their internal inputs are usually completely unlabeled noise ("q", "w", etc.)
- **Safety caps**: a hard 50-field limit stops detection entirely (and disconnects the `MutationObserver`) on pathological pages, and a circuit breaker backs off if a page mutates unusually often — both added after a real incident where a component-heavy SPA froze the tab
- **Application Questions**, **Privacy** (export/import/delete all data, local stats), **Settings** (widget visibility, auto-detect, auto-fill on detect, confirm-before-autofill, confidence thresholds, theme)

## Deliberate MVP boundaries (per PRD non-goals)

No auto-submit, no auto-clicking Next/Continue, no AI features, no job tracker, no cloud sync — everything stays in `chrome.storage.local` on this device, and nothing runs on any page until you explicitly activate it there.

## Try it

1. Click the AutoFill Assistant icon → fill in your Profile (at least name + email) → Save
2. Visit any page with a form (a job application, or even a generic test form)
3. Click the toolbar icon → **Detect Fields on This Page** — this is the one moment it actually runs there
4. The floating widget appears with a field count — click **Autofill** (the same button now doubles as the Autofill trigger)
5. Review the result, fix any "Needs Your Input" fields via the dropdown (AutoFill Assistant remembers your choice for that site next time)

## CI / releases

`.github/workflows/ci.yml` runs on every push and PR: validates `manifest.json` (parses, every referenced file exists). It cannot reach into your local Chrome — there's no such thing as GitHub pushing an update into an unpacked/developer-mode extension, that's a Chrome platform limitation, not something CI can work around. What it *does* give you: broken manifests get caught before you ever reload the extension yourself, and on every push to `master`/`main` it packages the extension into a `.zip` and uploads it as a downloadable build artifact.

To cut a versioned release:

1. Bump `"version"` in `manifest.json`
2. `git tag v1.0.1 && git push origin v1.0.1`

`.github/workflows/release.yml` then validates, packages, and publishes a GitHub Release with the `.zip` attached — tag version and manifest version must match, or it fails on purpose rather than shipping a mislabeled build.
