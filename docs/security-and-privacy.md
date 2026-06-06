# Security and privacy design

## Data flow

1. The popup asks the active tab content script for page signals.
2. The content script returns title, selected meta content, visible text excerpt, current URL, and detected download links.
3. The background service worker loads the local software database and computes detection plus trust score.
4. Optional reputation providers are queried only when enabled and API keys are configured.
5. The popup receives a summarized analysis and renders it with safe DOM APIs.

## API key handling

- Keys are stored in `chrome.storage.local` under an extension-only key.
- Keys are never sent to content scripts.
- Keys are never written to webpage DOM.
- Popup fields are password inputs and show only masked configured-state placeholders after saving.

## Extension hardening

- No remote code execution.
- No `eval` or dynamic script injection.
- No `innerHTML` rendering for untrusted page content.
- Reputation responses are reduced to compact verdict/stat objects before scoring.
- Rate limits protect users and providers from accidental repeated calls.
