# JobFill — Architecture & Flow

JobFill is a Manifest V3 Chrome extension that detects form fields on a job
application page, matches them against a user-authored profile, and fills
them in with review controls for anything it isn't confident about. There is
no build step and no bundler — every file listed in `manifest.json` is
loaded by Chrome as-is.

## Top-level pieces

| Piece | Runs where | Role |
|---|---|---|
| `background/service-worker.js` | Extension background (MV3 service worker) | One-time storage init on install, opens options page for first-time users |
| `content/*.js` | Injected into every `http(s)://` page | Detection → confidence scoring → mapping → filling → floating widget |
| `popup/*` | Toolbar popup | At-a-glance profile/page status, one-click Autofill, links into Options |
| `options/*` | Full extension page (`chrome-extension://…/options.html`) | Profile editor, profile manager, learned mappings, saved Q&A, privacy/export, settings |

All persistent state lives in `chrome.storage.local` (see [Storage schema](#storage-schema)). There is no remote backend — everything is local to the browser profile.

## Load order (content scripts)

`manifest.json` injects these into every page, in this exact order, at `document_idle`:

```
constants.js → utils.js → detector.js → confidence.js → mapper.js → filler.js → widget.js → observer.js → content.js
```

Each file is an IIFE that hangs a namespace object off `window` (e.g. `window.JobFillDetector`), so later scripts in the list can call earlier ones directly — no imports/exports, no module system. `content.js` is the entry point and the only one that runs top-level logic on load; the rest just register their namespace and wait to be called.

## End-to-end flow

1. **Page loads.** `content.js` waits for `DOMContentLoaded` (or runs immediately if the document is already ready), then calls `init()`.
2. **Load profile + settings.** `init()` reads `profiles`, `activeProfileId`, `settings`, and this hostname's slice of `siteMappings` from `chrome.storage.local`. If there is no active profile yet, JobFill stays completely silent on the page (no widget, no scanning) — a deliberate first-run rule.
3. **First scan.** `JobFillDetector.scan(document)` walks the DOM (including open Shadow DOM subtrees) for fillable `input`/`select`/`textarea` elements, filters out anything without a real identifying signal, and returns field *records*.
4. **Build a fill plan.** `JobFillMapper.plan(records, ctx)` turns each record into a plan item: classify it via `JobFillConfidence.classify()` (or use a previously *learned* mapping for this site if one exists), look up the matching value in the active profile, and decide a `status` (`fill`, `fill-review`, `review`, `unresolved`, `empty`, `sensitive`).
5. **Show the widget.** If `settings.showWidget` and `settings.autoDetectForms` are on, `JobFillWidget.mount()` renders a draggable floating panel (inside its own closed-off Shadow DOM so page CSS can't touch it) summarizing detected/ready/needs-review counts, with an **Autofill** button and inline pickers for anything unresolved.
6. **Watch for new fields.** `JobFillObserver.start()` attaches a debounced, circuit-broken `MutationObserver` (including to shadow roots, including ones created later) so multi-step wizards/SPAs that add fields after the first scan get picked up automatically; each newly detected batch goes back through steps 4–5.
7. **User clicks Autofill** (from the widget, the popup, or a background message). `runAutofill()` filters the plan down to `fill`/`fill-review` items, optionally confirms via `window.confirm` if `settings.confirmBeforeAutofill` is set, then calls `JobFillFiller.fillItem()` per item. Results (per-field ✓/⚠/✕ marks) are shown back in the widget, and lifetime stats are bumped in storage.
8. **User corrects an unresolved field.** Picking a type from the widget's dropdown re-plans just that one record with the chosen type, fills it immediately if it now qualifies, and — importantly — **learns** the mapping: it's written to `siteMappings[hostname][fieldKey]` so the same field on the same site is recognized at `confidence: 100` on every future visit, no keyword guessing needed.
9. **Safety cap.** If total identifiably-labeled fields detected on the page ever reaches `MAX_DETECTED_FIELDS` (50), the detector short-circuits permanently, `content.js` disconnects the `MutationObserver` entirely, and the widget switches to a "stopped" message. This guards against pathological pages (a component library exposing hundreds of internal Shadow DOM inputs, or a page that never stops mutating).

## Module reference

### `content/constants.js` — shared vocabulary
Defines everything the rest of the pipeline agrees on, as a single frozen-in-spirit namespace (`window.JobFillConstants`):
- `FIELD_TYPES` — the closed set of field categories JobFill understands (`FIRST_NAME`, `EMAIL`, `WORK_AUTHORIZATION`, …).
- `PROFILE_PATHS` — maps each `FIELD_TYPE` to a dot-path into the profile object (e.g. `EMAIL → "personal.email"`).
- `FIELD_LABELS` — human-readable labels for the same types, used in the widget's picker and the options page's mapping editor.
- `FIELD_SIGNALS` — per-type weighted keyword lists (`words`), matching `autocomplete` tokens (`ac`), and matching native `type` attributes (`type`); this is the entire keyword corpus `confidence.js` scores against.
- `SENSITIVE_PATTERNS` — substrings (password, OTP, CVV, SSN, Aadhaar, …) that force a field to `status: 'sensitive'` and permanently exclude it from autofill regardless of confidence.
- `CONFIDENCE` — the `HIGH` (85) / `MEDIUM` (60) score thresholds.
- `MAX_DETECTED_FIELDS` — the hard 50-field safety cap.
- `DEFAULT_SETTINGS` — the settings object shape/defaults used everywhere state hasn't been saved yet.

### `content/utils.js` — DOM + data helpers
Small stateless helpers used across the pipeline:
- `normalize(str)` — turns any name/id/label text into lowercase, space-separated words (handles camelCase, snake_case, kebab-case, punctuation) so keyword matching is consistent.
- `containsPhrase(haystack, phrase)` — phrase-boundary-aware substring match, plus a concatenated fallback for longer phrases (so `"emailaddress"` still matches `"email address"`).
- `getByPath` / `setByPath` — dot-path get/set into the profile object (backs `PROFILE_PATHS`).
- `debounce(fn, wait)` — standard trailing debounce, used by the observer.
- `uuid()` — RFC4122-ish v4 ID generator, used for both field IDs and profile/question IDs.
- `getLabelText(el)` — resolves an element's visible label via `label[for]`, an ancestor `<label>`, or `aria-labelledby`, using `el.getRootNode()` so it also works for fields rendered inside a Shadow DOM (where `document.getElementById` can't see the label).
- `getNearbyText(el)` — walks up to 4 ancestor levels, strips out other form controls/scripts/styles, and collects leftover text — catches "pseudo-labels" (divs used as prompts instead of real `<label>` elements).
- `fireExtractionEvents(el)` — dispatches `input`+`change` (used incidentally; the main fill events are dispatched by `filler.js`).
- `deepQuerySelectorAll(root, selector)` — `querySelectorAll` that also recurses into every open shadow root under `root`, since native `querySelectorAll` never crosses a Shadow DOM boundary.
- `collectShadowRoots(root)` — recursively lists every open shadow root nested under `root`; used by the observer to attach a `MutationObserver` to each one individually.

### `content/detector.js` — field discovery
Owns the single source of truth for "what fields exist and haven't been seen yet."
- Marks every element it processes with `dataset.jobfillSeen` and a stable `dataset.jobfillId`, so re-running `scan()` after a DOM mutation only returns genuinely *new* fields.
- `isVisible` / `isRelevant` filter out hidden elements and irrelevant input types (`hidden`, `submit`, `button`, `reset`, `image`, `file`).
- `hasIdentifyingSignal` rejects candidates with no label, placeholder, aria-label, or meaningful `autocomplete` — this is what keeps cookie-banner/chat-widget/search-box inputs (common inside pierced Shadow DOM) out of the results.
- Groups same-`name` radio inputs into one `radio-group` record (`buildRadioGroupRecord`) instead of one record per radio button, using the nearest `<fieldset>`/`<legend>` or ancestor form for a label.
- Enforces `MAX_RAW_PER_SCAN` (300) as a per-call throughput cap (pure performance guard, unrelated to the safety cap — leftover candidates are just picked up on the next scan) and `MAX_DETECTED_FIELDS` (50) as the permanent, cross-call safety cap on genuinely labeled fields; once tripped, `scan()` short-circuits to `[]` on every subsequent call (`isStopped()` exposes this to `content.js`).

### `content/confidence.js` — keyword-based classification
Turns one field record into a best-guess `FIELD_TYPE` with a numeric confidence:
- `isSensitive(record)` checks the native `type="password"` and the `SENSITIVE_PATTERNS` list first — sensitive fields never get scored or filled.
- `scoreForType` sums weighted hits across five text sources (`name+id`, label, placeholder, aria-label, nearby text) plus bonuses for a matching `autocomplete` token and a matching native `type`; a `specificityBonus` rewards multi-word keyword matches over incidental single-word overlap (so "authorized to work in this **country**?" doesn't get misread as a `COUNTRY` field).
- `classify(record)` runs `scoreForType` for every known `FIELD_TYPE` and keeps the highest scorer, then buckets the result into `level`: `high` (≥85), `medium` (≥60), `low` (>0), or `unknown` (0).

### `content/mapper.js` — plan builder
Bridges detected fields to actual profile values and decides what to do with each one:
- `buildFieldKey(record)` derives a stable, storage-safe identity for a field (`name:`, else `id:`, else a truncated normalized `label:`, else `type:`) — this is the key learned mappings are stored under per-site.
- `findBestOption(options, desiredText)` matches a profile value (e.g. country "United States") to the closest `<select>`/radio-group option by exact match → substring containment → token-overlap score (≥0.5) — handles sites that spell things differently ("USA" vs "United States").
- `plan(records, ctx)` is the main entry point: for each record, prefer a previously **learned** site mapping (auto `confidence: 100`) over a fresh `confidence.classify()` call, look up the corresponding profile value, resolve select/radio option matches, and assign a final `status` based on confidence vs. the user's `fillHighConfidence`/`fillMediumConfidence`/`askBeforeMedium` settings.

### `content/filler.js` — DOM writer
The only file that actually mutates form elements:
- `setNativeValue(el, value)` calls the native HTMLInputElement/HTMLTextAreaElement property setter directly (bypassing any React/Vue/Angular-patched `.value` setter) so framework-controlled inputs actually register the change, then dispatches `input`+`change` with `composed: true` so the event can cross out of a Shadow DOM boundary into a listener sitting in the light DOM.
- `setChecked(el, checked)` does the same for checkboxes/radios via the native `checked` setter, plus a synthetic `click` (some frameworks listen for `click`, not `change`, on radios/checkboxes).
- `fillItem(item)` dispatches to the right strategy based on `record.type` (`select`, `radio-group`, `checkbox`, or plain text-like), wrapped in try/catch so one broken field can't abort the whole autofill run.

### `content/widget.js` — floating UI
A self-mounted, self-contained UI component:
- Renders entirely inside a closed-composition-mode-free (`mode: 'open'`) Shadow DOM host appended to `document.documentElement`, with `all: initial` on the shadow root so the host page's CSS can never leak in or be leaked to.
- Persists its position and minimized/expanded state to `chrome.storage.local` under `jobfill_widget_state` so it doesn't jump around on reload.
- Draggable via its header (mouse-based, clamped to non-negative offsets from top/right).
- Three render modes: **summary** (stat tiles + Autofill button, pre-fill), **result** (per-field ✓/⚠/✕ checklist, post-fill), **stopped** (safety-cap warning, replaces everything else).
- Always renders a "Needs Your Input" section for `unresolved`/`review` items with a `<select>` of every `FIELD_TYPE`; picking one calls back into `content.js` (`onFieldTypeAssigned`) to learn + immediately fill that field.
- Exposes `updatePlan`, `showResult`, `showStopped`, `destroy` to `content.js` — it never talks to storage or the DOM pipeline directly except for its own position/minimized state.

### `content/observer.js` — dynamic field discovery
Keeps detection working on SPAs, multi-step wizards, and modals that inject fields after first load:
- Attaches one `MutationObserver` per Shadow DOM root (native `MutationObserver` never sees mutations inside a shadow tree from an observer attached elsewhere), discovering new roots as they appear.
- Batches all raw mutation events into a single **debounced** (500 ms) pass — never does the expensive shadow-root-discovery walk synchronously per mutation.
- Circuit breaker: if a debounced flush has already run more than `MAX_RUNS_PER_WINDOW` (6) times in the trailing `WINDOW_MS` (5000 ms), it backs off — drops pending nodes and skips the scan entirely — rather than let a constantly-mutating page peg the CPU. Logs a one-time console warning when this kicks in and clears automatically once the page settles.
- On each non-backed-off flush, re-observes any newly discovered shadow roots and calls `JobFillDetector.scan(document)`; any new records are handed to the `onNewFields` callback supplied by `content.js`.

### `content/content.js` — orchestrator
Wires every other module together and is the only file with mutable top-level state (`profile`, `settings`, `siteMappings`, `plan`, `widget`, `observerHandle`, `stopped`):
- `loadAll` — pulls `profiles`/`activeProfileId`/`settings`/`siteMappings` from storage and picks the active profile (falls back to "first profile found" if `activeProfileId` is stale/missing).
- `saveLearnedMapping` / `bumpStats` — the two places content.js writes back to storage (learned field mappings, and lifetime usage stats: `applicationsAssisted`, `formsDetected`, `fieldsFilled`, `fieldsFailed`).
- `ensureWidget` — mounts the widget lazily, only once, only if `settings.showWidget` is on.
- `runAutofill` — the click handler behind both the widget's Autofill button and the popup's Autofill button (via message passing); computes fill/skip/review counts, calls `filler.fillItem` for each fillable item, and reports results back to the widget.
- `stopIfDetectorTripped` — the safety-cap enforcement point: once `JobFillDetector.isStopped()` is true, disconnects the MutationObserver and switches the widget to its stopped state, exactly once.
- `scanAndRender` — the shared "scan, plan, render" sequence used both on initial load and (via the observer's callback) on every subsequent dynamic batch.
- Runtime message listener — handles four message types sent from the popup/options pages:
  - `JOBFILL_PING` — liveness/profile-presence check.
  - `JOBFILL_GET_STATUS` — returns detected/ready/review counts + `stopped` flag (drives the popup's status line).
  - `JOBFILL_AUTOFILL` — triggers `runAutofill()` remotely (the popup's Autofill button).
  - `JOBFILL_SETTINGS_CHANGED` — broadcast by the options page after Save; reloads settings/profile/mappings in place and re-renders the widget without a page refresh.

### `background/service-worker.js` — install hook
The entire background script is a single `chrome.runtime.onInstalled` listener:
- Seeds `chrome.storage.local` with empty/default values for `profiles`, `settings`, `siteMappings`, `applicationQuestions`, and `stats` — but only for keys that don't already exist, so this is safe to run again on every extension update without clobbering user data.
- On a fresh **install** (not an update), opens the options page automatically so a first-time user isn't left staring at an empty popup.

### `popup/popup.js` — toolbar popup
Small, read-mostly controller for `popup/popup.html`:
- Loads the active profile and renders name/title/status ("✓ Profile Ready" or a warning to set one up).
- Queries the active tab and, if it's an `http(s)://` page, messages the content script (`JOBFILL_GET_STATUS`) to show a live "`N` fields detected · `M` ready to fill" line, or a stopped/no-content-script/unsupported-page message as appropriate. The Autofill button is disabled unless there's at least one field ready.
- Autofill button sends `JOBFILL_AUTOFILL` to the active tab's content script, then closes the popup.
- Nav buttons open (or focus, if already open) `options.html#<tab>` for each options-page section, rather than duplicating that UI inside the popup.

### `options/options.js` — full settings/profile UI
The largest UI surface, organized into six tab panels (`profile`, `profiles`, `mappings`, `questions`, `privacy`, `settings`), switched by `location.hash` and rendered on demand (`activateTab`):
- **Profile editor** (`profile` tab) — a flat form bound to one profile object's `personal`/`professional`/`links`/`education`/`preferences` sections, plus a free-form list of resume labels/notes (`resumes[]`, metadata only — no file upload/storage). Auto-creates a blank profile if none exists yet. Save writes the whole edited profile back to `profiles[editingProfileId]`.
- **Profiles manager** (`profiles` tab) — list/star-as-default/edit/duplicate/delete across multiple saved profiles (e.g. "Frontend Developer" vs "Backend Developer" personas), plus JSON export/import of just the `profiles`+`activeProfileId` slice.
- **Field mappings** (`mappings` tab) — a per-site, per-field-key editor over the same `siteMappings` object `content.js` reads/writes; lets a user manually fix or delete a learned mapping, or wipe all learned mappings for one domain.
- **Application questions** (`questions` tab) — a free-form list of saved Q&A pairs (`applicationQuestions`) for questions JobFill doesn't structurally understand (e.g. "Are you authorized to work in India?") — captured here for the user's own reference/reuse; not read by the autofill pipeline itself.
- **Privacy** (`privacy` tab) — read-only lifetime stats display (applications assisted, forms detected, fields filled, success rate), plus full-data JSON export/import (`chrome.storage.local.get(null)`/`.set(data)`) and a "Clear ALL JobFill data" nuke button (double-confirmed).
- **Settings** (`settings` tab) — toggles backing `DEFAULT_SETTINGS` (show widget, auto-detect forms, confirm before autofill, fill high/medium confidence, ask before medium, theme). Saving calls `broadcastSettingsChanged()`, which messages every open tab's content script (`JOBFILL_SETTINGS_CHANGED`) so changes apply live without reloading pages.

## Message-passing protocol (popup/options ↔ content script)

| Message type | Sent by | Handled by | Purpose |
|---|---|---|---|
| `JOBFILL_PING` | (available, unused by current UI) | `content.js` | Liveness + has-profile check |
| `JOBFILL_GET_STATUS` | `popup.js` | `content.js` | Detected/ready/review counts + stopped flag |
| `JOBFILL_AUTOFILL` | `popup.js`, widget button | `content.js` | Trigger `runAutofill()` |
| `JOBFILL_SETTINGS_CHANGED` | `options.js` (broadcast to all tabs) | `content.js` | Hot-reload settings/profile/mappings, re-render widget |

## Storage schema (`chrome.storage.local`)

| Key | Shape | Written by | Read by |
|---|---|---|---|
| `profiles` | `{ [profileId]: Profile }` | options.js | content.js, popup.js, options.js |
| `activeProfileId` | `string \| null` | options.js | content.js, popup.js, options.js |
| `settings` | `DEFAULT_SETTINGS` shape (see constants.js) | options.js | content.js, options.js |
| `siteMappings` | `{ [hostname]: { [fieldKey]: FIELD_TYPE } }` | content.js (learn), options.js (manual edit) | content.js, options.js |
| `applicationQuestions` | `[{ id, question, answer }]` | options.js | options.js only (reference; not read by the fill pipeline) |
| `stats` | `{ applicationsAssisted, formsDetected, fieldsFilled, fieldsFailed }` | content.js | options.js (privacy tab) |
| `jobfill_widget_state` | `{ position: {top, right}, minimized }` | widget.js | widget.js only |

`Profile` shape (see `options.js:blankProfile`): `{ id, name, personal, professional, links, education, preferences, resumes[] }`, with `PROFILE_PATHS` in `constants.js` defining exactly which dot-paths inside it the autofill pipeline reads from.

## Build / CI scripts (not part of the runtime extension)

- `scripts/validate-manifest.js` (`npm run validate`) — parses `manifest.json`, checks `manifest_version === 3`, and confirms every file it references (icons, popup, options page, background script, content scripts/css) actually exists on disk.
- `scripts/package-extension.js` (`npm run package`) — zips exactly `manifest.json`, `background/`, `content/`, `icons/`, `options/`, `popup/` (i.e. runtime files only) into `dist/jobfill-v<version>.zip`.
- `.github/workflows/ci.yml` — on every push/PR, runs `npm run validate`; on push to `master`/`main`, also runs `npm run package` and uploads the zip as a build artifact.
- `.github/workflows/release.yml` — on a `v*.*.*` tag push, validates, confirms the tag version matches `manifest.json`'s version, packages, and publishes a GitHub Release with the zip attached.

There is currently no automated test suite in this repo (removed).
