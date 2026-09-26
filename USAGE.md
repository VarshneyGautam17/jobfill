# Using AutoFill Assistant on your system

This is a plain HTML/CSS/JS Chrome extension — there's no build step. You load the folder directly into Chrome.

## 1. Install it in Chrome

1. Open Chrome and go to `chrome://extensions`
2. Turn on **Developer mode** (toggle, top-right corner)
3. Click **Load unpacked**
4. Select this folder: `E:\Personal work\chrome-ex`
5. Chrome installs it, pins the ⚡ AutoFill Assistant icon to the toolbar, and — on first install only — opens the Profile editor automatically

That's it. It's now a real extension running in your browser, exactly like one installed from the Chrome Web Store, except only you have it (unpacked/developer extensions aren't published anywhere).

## 2. Create your profile

1. Click the AutoFill Assistant icon → **⚙ Profile** (or it's already open from step 1)
2. Optional shortcut: under **Import from Resume (PDF)**, pick your resume — it's read locally (nothing is uploaded anywhere) and pre-fills what it can find, and the same file is also stored so it can be attached to a site's "Resume/CV upload" field later. Name/email/phone/links are usually accurate; job title/company/dates/education are best-effort guesses, so **check them before saving**. It never overwrites a field you've already typed something into.
3. Fill in at least **First Name, Last Name, Email** — everything else is optional but the more you fill in, the more fields it can autofill
4. Click **Save Profile**

You can create more profiles later (e.g. one for "Frontend roles", one for "Full Stack roles") from **📋 Profiles** → **+ New Profile**, and mark one as default with the ⭐.

## 3. Use it on a page

AutoFill Assistant is **click-to-activate** — it does nothing on any page until you explicitly turn it on there. There's no broad "run on every website" permission behind the scenes; each activation is a one-time, per-page action you take yourself.

1. Open the page with the form you want filled
2. Click the toolbar icon → the button reads **Detect Fields on This Page** — click it. This is the one moment it actually starts running on that page.
3. A small **⚡ AutoFill Assistant** widget appears in the corner showing how many fields it found and how many it can fill confidently, and the popup button switches to **Autofill Current Page**
4. Click **Autofill** (from the widget or the popup — either works)
5. **Always review before submitting** — it fills the form, it does not submit it. Check every field, especially ones marked ⚠ (filled but lower-confidence) or listed under "Needs Your Input"
6. For any field it couldn't figure out, pick the right type from the dropdown next to it — that choice is remembered for that exact website from then on

Activation only lasts for that page load — reload the page (or navigate away and back) and you'll need to click **Detect Fields on This Page** again. If you'd rather not click twice, turn on Settings → **"Automatically fill fields as soon as they're detected"**: once you've activated a page, newly-discovered fields fill themselves without a second click.

## 4. Where things live

| You want to... | Go to |
|---|---|
| Edit your info | Popup → **⚙ Profile** |
| Manage multiple profiles | Popup → **📋 Profiles** |
| Fix a wrong guess permanently | Popup → **🧠 Field Mappings** |
| Save answers to recurring questions | Popup → **❓ Application Questions** |
| Export/delete all your data | Popup → **🔒 Privacy** |
| Turn the widget off, change confidence behavior, auto-fill-on-detect, theme | Popup → **⚙ Settings** |

All of this data lives only in your browser (`chrome.storage.local`) — nothing is sent anywhere.

## 5. After you (or I) edit the code

Chrome doesn't hot-reload extensions. After any file change:

1. Go to `chrome://extensions`
2. Click the ↻ reload icon on the AutoFill Assistant card
3. Close and reopen the popup on the tab you're testing, then click **Detect Fields on This Page** again (a reload of the extension does not re-activate tabs that were already active — each tab needs a fresh click)

If you edit `manifest.json` itself, Chrome may show a red "Errors" button on the card if something's invalid — click it to see why.

## 6. Troubleshooting

- **"AutoFill Assistant cannot access this page"** in the popup — genuinely unsupported pages are `chrome://` pages, the Chrome Web Store, PDF files opened in Chrome's built-in viewer, and local `file://` pages (extensions can't run there; it's a Chrome restriction, not a bug).
- **Button says "Not active on this page yet" / "Detect Fields on This Page"** — this is the normal starting state, not an error. Click it. It only turns into "Autofill Current Page" after that click succeeds.
- **No widget appears after clicking "Detect Fields on This Page"** — open DevTools (F12) → Console on that page and look for `[AutoFill Assistant]` messages or red errors. Also check Settings → "Show floating autofill widget" is on. If you just reloaded the extension in `chrome://extensions`, close and reopen the popup before clicking (an in-flight popup can be pointed at a stale extension context).
- **A field is filled with the wrong thing** — click the field's dropdown in the widget (if unresolved) or go to **Field Mappings** and change it there; it's remembered per-website from then on.
- **Autofill fills nothing at all** — check you have a profile with data saved (popup will say "No profile yet" if not), and that you clicked "Detect Fields on This Page" first — Autofill only acts on fields already found.
