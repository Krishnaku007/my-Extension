const MULTI_PART_TLDS = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'co.nz', 'com.br', 'com.cn', 'co.jp', 'co.in', 'com.mx'
]);

const TYPO_SUBSTITUTIONS = new Map([
  ['0', 'o'], ['1', 'l'], ['3', 'e'], ['5', 's'], ['7', 't'], ['@', 'a'], ['$', 's']
]);

export function normalizeHostname(input = '') {
  try {
    const hostname = input.includes('://') ? new URL(input).hostname : input;
    return hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  } catch (_error) {
    return String(input).toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  }
}

export function getRegistrableDomain(hostname = '') {
  const normalized = normalizeHostname(hostname);
  const parts = normalized.split('.').filter(Boolean);
  if (parts.length <= 2) return normalized;
  const lastTwo = parts.slice(-2).join('.');
  if (MULTI_PART_TLDS.has(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join('.');
  }
  return lastTwo;
}

export function isSameOrSubdomain(hostname, candidateDomain) {
  const host = normalizeHostname(hostname);
  const candidate = normalizeHostname(candidateDomain);
  return host === candidate || host.endsWith(`.${candidate}`);
}

export function domainMatchesAny(hostname, domains = []) {
  return domains.some((domain) => isSameOrSubdomain(hostname, domain));
}

export function getDomainRelationship(hostname, softwareEntry, trustedPlatforms = []) {
  if (!softwareEntry) return 'unknown';
  if (domainMatchesAny(hostname, softwareEntry.officialDomains)) return 'official';
  if (domainMatchesAny(hostname, softwareEntry.trustedMirrors || [])) return 'trusted-mirror';
  if (domainMatchesAny(hostname, trustedPlatforms)) return 'trusted-platform';
  if (findLikelyTyposquat(hostname, softwareEntry.officialDomains).length > 0) return 'suspicious-typosquat';
  return 'unverified';
}

export function levenshteinDistance(a = '', b = '') {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

function normalizeForTypo(value) {
  return value
    .toLowerCase()
    .split('')
    .map((char) => TYPO_SUBSTITUTIONS.get(char) || char)
    .join('')
    .replace(/[-_]/g, '')
    .replace(/^www\./, '');
}

export function findLikelyTyposquat(hostname, officialDomains = []) {
  const current = normalizeForTypo(getRegistrableDomain(hostname).split('.')[0] || '');
  if (!current) return [];

  return officialDomains.filter((domain) => {
    const officialBase = normalizeForTypo(getRegistrableDomain(domain).split('.')[0] || '');
    if (!officialBase || current === officialBase) return false;
    const distance = levenshteinDistance(current, officialBase);
    const containsBrand = current.includes(officialBase) || officialBase.includes(current);
    return distance <= 2 || containsBrand;
  });
}

export function parseSafeUrl(url, baseUrl) {
  try {
    const parsed = new URL(url, baseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed;
  } catch (_error) {
    return null;
  }
}

export function hasSuspiciousTld(hostname = '') {
  const suspiciousTlds = new Set(['zip', 'mov', 'click', 'country', 'gq', 'tk', 'ml', 'cf', 'work', 'download']);
  const tld = normalizeHostname(hostname).split('.').pop();
  return suspiciousTlds.has(tld);
}
