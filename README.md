# Smart Download Link Verifier

A production-ready Manifest V3 Chrome Extension that helps users evaluate software download pages before they click. It detects software names, scans download buttons, checks official vendor domains, identifies suspicious patterns, and presents a human-readable trust score.

## Core capabilities

- **Software detection** from title, metadata, URL, visible content, and download-button text.
- **Official source verification** using a local vendor database in `data/software-database.json`.
- **Download button scanner** that finds common download/install call-to-action links and highlights them in-page.
- **Trust score engine** from 0–100 with explanations for positive signals and risks.
- **Risk detection** for typosquatting, insecure HTTP links, suspicious keywords, excessive fake buttons, and unverified sources.
- **Reputation API support** for Google Safe Browsing, VirusTotal, and URLScan.
- **Modern dark glassmorphism UI** with responsive dashboard, score meter, risk indicators, and API settings.

## Project structure

```text
smart-download-verifier/
├── manifest.json
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── content/
│   └── content.js
├── background/
│   └── service-worker.js
├── data/
│   └── software-database.json
├── utils/
│   ├── trust-score.js
│   ├── domain-checker.js
│   └── detector.js
├── assets/
└── docs/
```

## Installation for local testing

1. Open `chrome://extensions` in Google Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this repository folder.
5. Open a software download page and click the extension icon.
6. Click **Scan Page**.

## API key configuration

The extension can work without API keys using local heuristics. For stronger reputation checks:

1. Open the popup.
2. Click **API Settings**.
3. Paste any keys you want to enable:
   - Google Safe Browsing API key
   - VirusTotal API key
   - URLScan API key
4. Click **Save Settings**.

Keys are stored in `chrome.storage.local` and are only used by the extension service worker. They are never injected into webpage DOM or content scripts.

## Testing guide

Manual tests:

- Visit `https://code.visualstudio.com/` and expect a high score with **Verified Official Source**.
- Visit `https://www.python.org/downloads/` and expect a high score with HTTPS and official-domain signals.
- Visit a trusted GitHub release page and expect a trusted platform or mirror explanation.
- Visit a deliberately untrusted demo page or local HTML page containing phrases such as `free full version crack` and multiple fake download buttons; expect a lower score.
- Click **Highlight Downloads** and verify detected buttons receive a green outline and badge.

Programmatic checks used in this repository:

```bash
node --check background/service-worker.js
node --check popup/popup.js
node --check content/content.js
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); JSON.parse(require('fs').readFileSync('data/software-database.json','utf8')); console.log('json ok')"
```

## Deployment guide

1. Update `manifest.json` version.
2. Confirm the software database is current and does not include untrusted mirrors.
3. Run syntax and JSON validation checks.
4. Test in a fresh Chrome profile.
5. Remove screenshots, local scratch files, and any private API keys.
6. Zip the extension root contents, not the parent folder.

Example:

```bash
zip -r smart-download-verifier.zip manifest.json popup content background data utils assets README.md docs
```

## Pull request guide

If GitHub does not show a **Create pull request** button, follow the troubleshooting checklist in [`docs/pull-request-guide.md`](docs/pull-request-guide.md). This is especially useful when the local checkout has no `origin` remote configured yet.

If your PR tool says **binary files are not supported**, see [`docs/binary-free-pr-guide.md`](docs/binary-free-pr-guide.md). This repository keeps generated PNG icons out of source control and uses Chrome's generic extension icon during binary-free development builds.

## Chrome Web Store publishing guide

1. Create or open a Chrome Web Store Developer account.
2. For a production store package, export PNG icons from the SVG source artwork and add the release-only `icons` manifest block described in [`docs/binary-free-pr-guide.md`](docs/binary-free-pr-guide.md).
3. Upload the ZIP package.
4. Complete listing metadata:
   - Name: **Smart Download Link Verifier**
   - Category: **Productivity** or **Developer Tools**
   - Single-purpose description: verifies software download sources and link trust.
5. Add screenshots of the popup and the in-page highlight feature.
6. Provide a privacy policy explaining that page URLs may be sent to reputation providers only when users configure API keys and reputation checks are enabled.
7. Justify permissions:
   - `activeTab`, `tabs`, and `scripting` are needed to scan the active page.
   - `storage` is needed for user settings, API keys, and bounded reputation cache.
   - host permissions are needed for webpage scanning and optional reputation API calls.
8. Submit for review and monitor Chrome Web Store feedback.

## Security notes

- UI rendering uses `textContent` and DOM node creation instead of unsafe HTML injection.
- API keys stay in extension storage and background context.
- Content scripts collect page signals only; they do not receive API secrets.
- External reputation requests are rate-limited and cached.
- URLs are parsed with `URL` and restricted to HTTP/HTTPS.
- The extension uses Manifest V3 and a module service worker.
