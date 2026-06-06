const DOWNLOAD_KEYWORDS = ['download', 'install', 'get now', 'free download', 'start download', 'download now', 'get app', 'setup'];
const HIGHLIGHT_CLASS = 'sdv-download-highlight';
const BADGE_CLASS = 'sdv-download-badge';

function parseSafeUrl(url, baseUrl = window.location.href) {
  try {
    const parsed = new URL(url, baseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed;
  } catch (_error) {
    return null;
  }
}

function normalizeHostname(hostname = '') {
  return hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
}

function getElementText(element) {
  if (element.value) return element.value;
  return element.innerText || element.textContent || element.getAttribute('aria-label') || '';
}

function getDownloadCandidates(limit = 40) {
  const candidates = Array.from(document.querySelectorAll('a[href], button, [role="button"], input[type="button"], input[type="submit"]'));
  const seen = new Set();
  return candidates.map((element, index) => {
    const text = getElementText(element).trim().replace(/\s+/g, ' ');
    const href = element.getAttribute('href') || element.dataset.href || element.formAction || '';
    const combined = `${text} ${element.getAttribute('aria-label') || ''} ${href}`.toLowerCase();
    const keyword = DOWNLOAD_KEYWORDS.find((item) => combined.includes(item));
    if (!keyword) return null;
    const parsed = href ? parseSafeUrl(href) : null;
    const fingerprint = `${text}|${parsed?.href || href}`;
    if (seen.has(fingerprint)) return null;
    seen.add(fingerprint);
    return {
      index,
      text: text || keyword,
      href: parsed?.href || href || null,
      hostname: parsed ? normalizeHostname(parsed.hostname) : null,
      protocol: parsed?.protocol || null,
      keyword,
      isCrossOrigin: parsed ? parsed.hostname !== window.location.hostname : false,
      hasDownloadAttribute: element.hasAttribute('download')
    };
  }).filter(Boolean).slice(0, limit);
}

function extractPageSignals() {
  const meta = Array.from(document.querySelectorAll('meta[name], meta[property]'))
    .filter((metaElement) => /description|keywords|og:title|og:description|twitter:title|twitter:description/i.test(
      `${metaElement.getAttribute('name') || ''} ${metaElement.getAttribute('property') || ''}`
    ))
    .map((metaElement) => metaElement.getAttribute('content') || '')
    .filter(Boolean);

  return {
    title: document.title || '',
    meta,
    visibleText: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 6000),
    url: window.location.href,
    hostname: normalizeHostname(window.location.hostname),
    downloadLinks: getDownloadCandidates()
  };
}

function injectHighlightStyle() {
  if (document.getElementById('sdv-highlight-style')) return;
  const style = document.createElement('style');
  style.id = 'sdv-highlight-style';
  style.textContent = `
    .${HIGHLIGHT_CLASS} {
      outline: 3px solid #38f8b9 !important;
      outline-offset: 3px !important;
      box-shadow: 0 0 0 6px rgba(56, 248, 185, 0.18), 0 0 22px rgba(56, 248, 185, 0.45) !important;
      position: relative !important;
      border-radius: 10px !important;
    }
    .${BADGE_CLASS} {
      position: absolute !important;
      z-index: 2147483647 !important;
      transform: translateY(-100%) !important;
      background: linear-gradient(135deg, #0f172a, #123b32) !important;
      color: #d1fae5 !important;
      border: 1px solid rgba(56, 248, 185, 0.65) !important;
      border-radius: 999px !important;
      padding: 4px 8px !important;
      font: 600 11px/1.2 Inter, system-ui, sans-serif !important;
      pointer-events: none !important;
      box-shadow: 0 8px 22px rgba(0, 0, 0, 0.28) !important;
    }
  `;
  document.documentElement.append(style);
}

function clearHighlights() {
  document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((element) => element.classList.remove(HIGHLIGHT_CLASS));
  document.querySelectorAll(`.${BADGE_CLASS}`).forEach((badge) => badge.remove());
}

function highlightDownloadButtons() {
  injectHighlightStyle();
  clearHighlights();
  let highlighted = 0;
  const candidates = Array.from(document.querySelectorAll('a[href], button, [role="button"], input[type="button"], input[type="submit"]'));
  candidates.forEach((element) => {
    const text = getElementText(element).trim();
    const href = element.getAttribute('href') || element.dataset.href || element.formAction || '';
    const combined = `${text} ${element.getAttribute('aria-label') || ''} ${href}`.toLowerCase();
    if (!DOWNLOAD_KEYWORDS.some((keyword) => combined.includes(keyword))) return;
    element.classList.add(HIGHLIGHT_CLASS);
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const badge = document.createElement('span');
      badge.className = BADGE_CLASS;
      badge.textContent = 'Download link detected';
      badge.style.left = `${Math.max(8, rect.left + window.scrollX)}px`;
      badge.style.top = `${Math.max(24, rect.top + window.scrollY)}px`;
      document.body.append(badge);
    }
    highlighted += 1;
  });
  return highlighted;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'SDV_COLLECT_PAGE_SIGNALS') {
    sendResponse({ ok: true, signals: extractPageSignals() });
    return true;
  }
  if (message?.type === 'SDV_HIGHLIGHT_DOWNLOADS') {
    sendResponse({ ok: true, highlighted: highlightDownloadButtons() });
    return true;
  }
  if (message?.type === 'SDV_CLEAR_HIGHLIGHTS') {
    clearHighlights();
    sendResponse({ ok: true });
    return true;
  }
  return false;
});
