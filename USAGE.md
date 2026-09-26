# Using JobFill on your system

This is a plain HTML/CSS/JS Chrome extension — there's no build step. You load the folder directly into Chrome.

## 1. Install it in Chrome

1. Open Chrome and go to `chrome://extensions`
2. Turn on **Developer mode** (toggle, top-right corner)
3. Click **Load unpacked**
4. Select this folder: `E:\Personal work\chrome-ex`
5. Chrome installs it, pins the ⚡ JobFill icon to the toolbar, and — on first install only — opens the Profile editor automatically

That's it. It's now a real extension running in your browser, exactly like one installed from the Chrome Web Store, except only you have it (unpacked/developer extensions aren't published anywhere).

## 2. Create your profile

1. Click the JobFill icon → **⚙ Profile** (or it's already open from step 1)
2. Fill in at least **First Name, Last Name, Email** — everything else is optional but the more you fill in, the more fields JobFill can autofill
3. Click **Save Profile**

You can create more profiles later (e.g. one for "Frontend roles", one for "Full Stack roles") from **📋 Profiles** → **+ New Profile**, and mark one as default with the ⭐.

## 3. Use it on a job application

1. Open any job application page
2. A small **⚡ JobFill** widget appears in the corner showing how many fields it found and how many it can fill confidently
3. Click **Autofill**
4. **Always review before submitting** — JobFill fills the form, it does not submit it. Check every field, especially ones marked ⚠ (filled but lower-confidence) or listed under "Needs Your Input"
5. For any field JobFill couldn't figure out, pick the right type from the dropdown next to it — JobFill remembers that choice for that exact website from then on

You can also trigger autofill from the toolbar popup (click the icon → **Autofill Current Page**) instead of the on-page widget.

## 4. Where things live

| You want to... | Go to |
|---|---|
| Edit your info | Popup → **⚙ Profile** |
| Manage multiple profiles | Popup → **📋 Profiles** |
| Fix a wrong guess permanently | Popup → **🧠 Field Mappings** |
| Save answers to recurring questions | Popup → **❓ Application Questions** |
| Export/delete all your data | Popup → **🔒 Privacy** |
| Turn the widget off, change confidence behavior, theme | Popup → **⚙ Settings** |

All of this data lives only in your browser (`chrome.storage.local`) — nothing is sent anywhere.

## 5. After you (or I) edit the code

Chrome doesn't hot-reload extensions. After any file change:

1. Go to `chrome://extensions`
2. Click the ↻ reload icon on the JobFill card
3. Refresh the job-application tab you're testing on (the widget only loads on page load)

If you edit `manifest.json` itself, Chrome may show a red "Errors" button on the card if something's invalid — click it to see why.

## 6. Troubleshooting

- **"JobFill cannot access this page"** in the popup — genuinely unsupported pages are `chrome://` pages, the Chrome Web Store, PDF files opened in Chrome's built-in viewer, and local `file://` pages (extensions can't run there; it's a Chrome restriction, not a bug). If you saw this on an ordinary `https://` job site, that was a permission-visibility bug that's now fixed — reload the extension in `chrome://extensions` (not just the page) and try again.
- **No widget appears on a real form** — open DevTools (F12) → Console on that page and look for `[JobFill]` messages or red errors. Also check Settings → "Automatically detect forms" and "Show floating autofill widget" are both on.
- **A field is filled with the wrong thing** — click the field's dropdown in the widget (if unresolved) or go to **Field Mappings** and change it there; it's remembered per-website from then on.
- **Nothing happens after clicking the icon → Autofill** — the content script may not have loaded yet if you just reloaded the extension; refresh the tab once.
- **Autofill fills nothing at all** — check you have a profile with data saved (Popup will say "No profile yet" if not).
