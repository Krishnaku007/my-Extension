import { detectSoftware } from '../utils/detector.js';
import { calculateTrustScore } from '../utils/trust-score.js';

const SETTINGS_KEY = 'sdv_api_settings';
const CACHE_KEY = 'sdv_reputation_cache';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMITS = { safeBrowsing: 25, virusTotal: 4, urlscan: 10 };
const rateBuckets = new Map();
let databasePromise;

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    [SETTINGS_KEY]: {
      safeBrowsingKey: '',
      virusTotalKey: '',
      urlscanKey: '',
      enableReputationChecks: true
    }
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'SDV_ANALYZE_PAGE') {
    analyzePage(message.signals).then(sendResponse).catch((error) => {
      sendResponse({ ok: false, error: sanitizeError(error) });
    });
    return true;
  }
  if (message?.type === 'SDV_GET_SETTINGS') {
    getSettings().then((settings) => sendResponse({ ok: true, settings: maskSettings(settings) }));
    return true;
  }
  if (message?.type === 'SDV_SAVE_SETTINGS') {
    saveSettings(message.settings).then(() => sendResponse({ ok: true })).catch((error) => {
      sendResponse({ ok: false, error: sanitizeError(error) });
    });
    return true;
  }
  return false;
});

async function analyzePage(pageSignals) {
  if (!pageSignals?.url) throw new Error('Missing page signals. Refresh the tab and try again.');
  const [database, settings] = await Promise.all([loadDatabase(), getSettings()]);
  const detection = detectSoftware(pageSignals, database);
  const reputationBundle = settings.enableReputationChecks
    ? await collectReputation(pageSignals.url, settings)
    : { reputation: {}, apiStatus: { safeBrowsing: 'disabled', virusTotal: 'disabled', urlscan: 'disabled' } };
  const trust = calculateTrustScore({
    pageSignals,
    softwareEntry: detection.primary,
    database,
    reputation: reputationBundle.reputation,
    apiStatus: reputationBundle.apiStatus
  });

  return {
    ok: true,
    analyzedAt: new Date().toISOString(),
    detection,
    trust,
    pageSignals: {
      title: pageSignals.title,
      url: pageSignals.url,
      hostname: pageSignals.hostname,
      downloadLinks: pageSignals.downloadLinks || []
    },
    apiStatus: reputationBundle.apiStatus
  };
}

async function loadDatabase() {
  if (!databasePromise) {
    databasePromise = fetch(chrome.runtime.getURL('data/software-database.json')).then((response) => {
      if (!response.ok) throw new Error('Unable to load software database.');
      return response.json();
    });
  }
  return databasePromise;
}

async function getSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return {
    safeBrowsingKey: '',
    virusTotalKey: '',
    urlscanKey: '',
    enableReputationChecks: true,
    ...(stored[SETTINGS_KEY] || {})
  };
}

async function saveSettings(settings = {}) {
  const existing = await getSettings();
  const cleanSettings = {
    safeBrowsingKey: mergeSecret(existing.safeBrowsingKey, settings.safeBrowsingKey),
    virusTotalKey: mergeSecret(existing.virusTotalKey, settings.virusTotalKey),
    urlscanKey: mergeSecret(existing.urlscanKey, settings.urlscanKey),
    enableReputationChecks: Boolean(settings.enableReputationChecks)
  };
  await chrome.storage.local.set({ [SETTINGS_KEY]: cleanSettings });
}

function mergeSecret(existingValue, nextValue) {
  const normalized = String(nextValue || '').trim();
  return normalized || existingValue || '';
}

function maskSettings(settings) {
  return {
    enableReputationChecks: settings.enableReputationChecks,
    hasSafeBrowsingKey: Boolean(settings.safeBrowsingKey),
    hasVirusTotalKey: Boolean(settings.virusTotalKey),
    hasUrlscanKey: Boolean(settings.urlscanKey)
  };
}

async function collectReputation(url, settings) {
  const cacheKey = await sha256(url);
  const cache = await getCache();
  const cached = cache[cacheKey];
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return { reputation: cached.reputation, apiStatus: { ...cached.apiStatus, cache: 'hit' } };
  }

  const apiStatus = {};
  const reputation = {};
  const checks = [
    querySafeBrowsing(url, settings.safeBrowsingKey, apiStatus).then((result) => { reputation.safeBrowsing = result; }),
    queryVirusTotal(url, settings.virusTotalKey, apiStatus).then((result) => { reputation.virusTotal = result; }),
    queryUrlscan(url, settings.urlscanKey, apiStatus).then((result) => { reputation.urlscan = result; })
  ];
  await Promise.allSettled(checks);
  await saveCacheEntry(cacheKey, { reputation, apiStatus, createdAt: Date.now() });
  return { reputation, apiStatus };
}

async function querySafeBrowsing(url, apiKey, apiStatus) {
  if (!apiKey) {
    apiStatus.safeBrowsing = 'missing-key';
    return null;
  }
  if (!consumeRateLimit('safeBrowsing')) {
    apiStatus.safeBrowsing = 'rate-limited';
    return null;
  }
  const endpoint = `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client: { clientId: 'smart-download-link-verifier', clientVersion: '1.0.0' },
      threatInfo: {
        threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
        platformTypes: ['ANY_PLATFORM'],
        threatEntryTypes: ['URL'],
        threatEntries: [{ url }]
      }
    })
  });
  if (!response.ok) {
    apiStatus.safeBrowsing = `error-${response.status}`;
    return null;
  }
  const data = await response.json();
  apiStatus.safeBrowsing = 'ok';
  return { threats: data.matches || [] };
}

async function queryVirusTotal(url, apiKey, apiStatus) {
  if (!apiKey) {
    apiStatus.virusTotal = 'missing-key';
    return null;
  }
  if (!consumeRateLimit('virusTotal')) {
    apiStatus.virusTotal = 'rate-limited';
    return null;
  }
  const encodedUrl = btoa(url).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const response = await fetch(`https://www.virustotal.com/api/v3/urls/${encodedUrl}`, {
    headers: { 'x-apikey': apiKey }
  });
  if (response.status === 404) {
    apiStatus.virusTotal = 'not-found';
    return null;
  }
  if (!response.ok) {
    apiStatus.virusTotal = `error-${response.status}`;
    return null;
  }
  const data = await response.json();
  apiStatus.virusTotal = 'ok';
  return { stats: data.data?.attributes?.last_analysis_stats || null };
}

async function queryUrlscan(url, apiKey, apiStatus) {
  if (!apiKey) {
    apiStatus.urlscan = 'missing-key';
    return null;
  }
  if (!consumeRateLimit('urlscan')) {
    apiStatus.urlscan = 'rate-limited';
    return null;
  }
  const searchUrl = `https://urlscan.io/api/v1/search/?q=${encodeURIComponent(`page.url:${url}`)}`;
  const response = await fetch(searchUrl, { headers: { 'API-Key': apiKey } });
  if (!response.ok) {
    apiStatus.urlscan = `error-${response.status}`;
    return null;
  }
  const data = await response.json();
  const latest = data.results?.[0];
  apiStatus.urlscan = latest ? 'ok' : 'not-found';
  const malicious = latest?.verdicts?.overall?.malicious;
  return latest ? {
    verdict: malicious ? 'malicious' : 'benign',
    score: latest.verdicts?.overall?.score || 0,
    scanUrl: latest.result || null
  } : null;
}

function consumeRateLimit(service) {
  const now = Date.now();
  const bucket = rateBuckets.get(service) || [];
  const fresh = bucket.filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);
  if (fresh.length >= RATE_LIMITS[service]) {
    rateBuckets.set(service, fresh);
    return false;
  }
  fresh.push(now);
  rateBuckets.set(service, fresh);
  return true;
}

async function getCache() {
  const stored = await chrome.storage.local.get(CACHE_KEY);
  return stored[CACHE_KEY] || {};
}

async function saveCacheEntry(key, entry) {
  const cache = await getCache();
  cache[key] = entry;
  const keys = Object.keys(cache).sort((a, b) => cache[b].createdAt - cache[a].createdAt).slice(0, 100);
  const trimmed = Object.fromEntries(keys.map((cacheKey) => [cacheKey, cache[cacheKey]]));
  await chrome.storage.local.set({ [CACHE_KEY]: trimmed });
}

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sanitizeError(error) {
  return error?.message ? String(error.message).slice(0, 180) : 'Unexpected extension error.';
}
