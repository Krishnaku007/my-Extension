import { normalizeHostname, parseSafeUrl } from './domain-checker.js';

export const DEFAULT_DOWNLOAD_KEYWORDS = ['download', 'install', 'get now', 'free download', 'start download', 'download now', 'setup'];

export function detectSoftware(pageSignals, database) {
  const haystacks = buildHaystacks(pageSignals);
  const scored = database.software
    .map((entry) => ({ entry, score: scoreSoftwareEntry(entry, haystacks) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return {
    primary: scored[0]?.entry || null,
    matches: scored.slice(0, 5).map(({ entry, score }) => ({
      id: entry.id,
      name: entry.name,
      score,
      officialDownloadUrl: entry.officialDownloadUrl
    }))
  };
}

function buildHaystacks(pageSignals = {}) {
  const title = pageSignals.title || '';
  const meta = Array.isArray(pageSignals.meta) ? pageSignals.meta.join(' ') : '';
  const buttons = Array.isArray(pageSignals.downloadLinks) ? pageSignals.downloadLinks.map((link) => link.text).join(' ') : '';
  const visibleText = pageSignals.visibleText || '';
  const url = pageSignals.url || '';
  return [
    { value: title.toLowerCase(), weight: 9 },
    { value: meta.toLowerCase(), weight: 6 },
    { value: buttons.toLowerCase(), weight: 5 },
    { value: url.toLowerCase().replace(/[-_/?.=&]/g, ' '), weight: 5 },
    { value: visibleText.toLowerCase(), weight: 2 }
  ];
}

function scoreSoftwareEntry(entry, haystacks) {
  const terms = [entry.name, ...(entry.aliases || [])].map((term) => term.toLowerCase());
  let score = 0;
  for (const term of terms) {
    for (const haystack of haystacks) {
      if (haystack.value.includes(term)) score += haystack.weight + Math.min(term.length / 6, 4);
    }
  }
  return Math.round(score);
}

export function detectDownloadLinks(documentLike, keywords = DEFAULT_DOWNLOAD_KEYWORDS, limit = 30) {
  const anchors = Array.from(documentLike.querySelectorAll('a[href], button, [role="button"], input[type="button"], input[type="submit"]'));
  const normalizedKeywords = keywords.map((keyword) => keyword.toLowerCase());
  const seen = new Set();

  return anchors
    .map((element, index) => {
      const text = getElementText(element).trim().replace(/\s+/g, ' ');
      const aria = element.getAttribute?.('aria-label') || '';
      const href = element.getAttribute?.('href') || element.dataset?.href || element.formAction || '';
      const combined = `${text} ${aria} ${href}`.toLowerCase();
      const matchedKeyword = normalizedKeywords.find((keyword) => combined.includes(keyword));
      const parsed = href ? parseSafeUrl(href, globalThis.location?.href) : null;
      const fingerprint = `${text}|${parsed?.href || href}|${index}`;
      if (!matchedKeyword || seen.has(fingerprint)) return null;
      seen.add(fingerprint);

      return {
        index,
        text: text || aria || matchedKeyword,
        href: parsed?.href || href || null,
        hostname: parsed ? normalizeHostname(parsed.hostname) : null,
        protocol: parsed?.protocol || null,
        keyword: matchedKeyword,
        isCrossOrigin: parsed ? parsed.hostname !== globalThis.location?.hostname : false,
        hasDownloadAttribute: Boolean(element.hasAttribute?.('download'))
      };
    })
    .filter(Boolean)
    .slice(0, limit);
}

export function extractPageSignals(documentLike = document, maxTextLength = 6000) {
  const meta = Array.from(documentLike.querySelectorAll('meta[name], meta[property]'))
    .filter((metaElement) => /description|keywords|og:title|og:description|twitter:title|twitter:description/i.test(
      `${metaElement.getAttribute('name') || ''} ${metaElement.getAttribute('property') || ''}`
    ))
    .map((metaElement) => metaElement.getAttribute('content') || '')
    .filter(Boolean);

  const visibleText = (documentLike.body?.innerText || '').replace(/\s+/g, ' ').slice(0, maxTextLength);
  return {
    title: documentLike.title || '',
    meta,
    visibleText,
    url: globalThis.location?.href || '',
    hostname: normalizeHostname(globalThis.location?.hostname || ''),
    downloadLinks: detectDownloadLinks(documentLike)
  };
}

function getElementText(element) {
  if (element.value) return element.value;
  return element.innerText || element.textContent || '';
}

export function detectSuspiciousKeywords(text = '', suspiciousKeywords = []) {
  const normalized = text.toLowerCase();
  return suspiciousKeywords.filter((keyword) => normalized.includes(keyword.toLowerCase()));
}
