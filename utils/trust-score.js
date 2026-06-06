import { domainMatchesAny, getDomainRelationship, hasSuspiciousTld, normalizeHostname, parseSafeUrl } from './domain-checker.js';
import { detectSuspiciousKeywords } from './detector.js';

const RELATIONSHIP_LABELS = {
  official: 'Verified Official Source',
  'trusted-mirror': 'Trusted Mirror',
  'trusted-platform': 'Trusted Platform',
  'suspicious-typosquat': 'Suspicious Source',
  unverified: 'Unverified Source',
  unknown: 'Unknown Software'
};

export function calculateTrustScore({ pageSignals, softwareEntry, database, reputation = {}, apiStatus = {} }) {
  const reasons = [];
  const risks = [];
  let score = 50;
  const currentUrl = parseSafeUrl(pageSignals.url || '', pageSignals.url || '');
  const hostname = normalizeHostname(pageSignals.hostname || currentUrl?.hostname || '');
  const relationship = getDomainRelationship(hostname, softwareEntry, database.trustedDownloadPlatforms);
  const textForKeywordScan = [
    pageSignals.title,
    ...(pageSignals.meta || []),
    pageSignals.visibleText,
    ...(pageSignals.downloadLinks || []).map((link) => `${link.text} ${link.href || ''}`)
  ].join(' ');
  const suspiciousKeywords = detectSuspiciousKeywords(textForKeywordScan, database.suspiciousKeywords || []);

  if (currentUrl?.protocol === 'https:') {
    score += 12;
    reasons.push('HTTPS enabled on the current page.');
  } else {
    score -= 20;
    risks.push('The current page is not loaded over HTTPS.');
  }

  switch (relationship) {
    case 'official':
      score += 30;
      reasons.push('Current domain matches the official vendor domain.');
      break;
    case 'trusted-mirror':
      score += 18;
      reasons.push('Current domain is a known trusted mirror for the detected software.');
      break;
    case 'trusted-platform':
      score += 8;
      reasons.push('Current domain is a commonly trusted software hosting platform.');
      break;
    case 'suspicious-typosquat':
      score -= 35;
      risks.push('Domain looks similar to the official vendor and may be typosquatting.');
      break;
    case 'unverified':
      score -= 8;
      risks.push('Current domain is not listed as official or trusted for the detected software.');
      break;
    default:
      score -= 5;
      risks.push('The software vendor could not be confidently identified.');
  }

  if (hasSuspiciousTld(hostname)) {
    score -= 10;
    risks.push('The page uses a top-level domain frequently abused in download scams.');
  }

  const linkAssessment = assessDownloadLinks(pageSignals.downloadLinks || [], softwareEntry, database);
  score += linkAssessment.scoreDelta;
  reasons.push(...linkAssessment.reasons);
  risks.push(...linkAssessment.risks);

  if (suspiciousKeywords.length) {
    score -= Math.min(22, suspiciousKeywords.length * 6);
    risks.push(`Suspicious wording detected: ${suspiciousKeywords.slice(0, 5).join(', ')}.`);
  } else {
    score += 5;
    reasons.push('No high-risk download scam keywords were found in scanned content.');
  }

  applyReputationSignals({ reputation, apiStatus, reasons, risks, addScore: (delta) => { score += delta; } });

  const boundedScore = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score: boundedScore,
    status: RELATIONSHIP_LABELS[relationship] || 'Unverified Source',
    riskLevel: getRiskLevel(boundedScore),
    relationship,
    reasons: unique(reasons).slice(0, 8),
    risks: unique(risks).slice(0, 8),
    recommendedUrl: softwareEntry?.officialDownloadUrl || null,
    explanation: buildExplanation({ score: boundedScore, softwareEntry, relationship, reasons, risks, apiStatus })
  };
}

function assessDownloadLinks(downloadLinks, softwareEntry, database) {
  const reasons = [];
  const risks = [];
  let scoreDelta = 0;
  if (!downloadLinks.length) {
    return { scoreDelta: -4, reasons, risks: ['No obvious download buttons were detected on the page.'] };
  }

  const secureLinks = downloadLinks.filter((link) => link.protocol === 'https:');
  const insecureLinks = downloadLinks.filter((link) => link.protocol === 'http:');
  if (secureLinks.length) {
    scoreDelta += Math.min(8, secureLinks.length * 2);
    reasons.push('Detected download links use secure HTTPS destinations.');
  }
  if (insecureLinks.length) {
    scoreDelta -= Math.min(18, insecureLinks.length * 6);
    risks.push(`${insecureLinks.length} detected download link(s) use insecure HTTP.`);
  }

  const knownGoodLinks = downloadLinks.filter((link) => {
    if (!link.hostname) return false;
    return softwareEntry && (
      domainMatchesAny(link.hostname, softwareEntry.officialDomains) ||
      domainMatchesAny(link.hostname, softwareEntry.trustedMirrors || []) ||
      domainMatchesAny(link.hostname, database.trustedDownloadPlatforms || [])
    );
  });
  if (knownGoodLinks.length) {
    scoreDelta += 8;
    reasons.push('At least one download link points to an official, mirror, or trusted hosting domain.');
  }

  const thirdPartyLinks = downloadLinks.filter((link) => link.isCrossOrigin && !knownGoodLinks.includes(link));
  if (thirdPartyLinks.length >= 3) {
    scoreDelta -= 12;
    risks.push('Multiple download buttons point to unrelated third-party domains.');
  }
  if (downloadLinks.length >= 6) {
    scoreDelta -= 8;
    risks.push('The page contains many download-like buttons, which is common on ad-heavy pages.');
  }

  return { scoreDelta, reasons, risks };
}

function applyReputationSignals({ reputation, apiStatus, reasons, risks, addScore }) {
  if (reputation.safeBrowsing?.threats?.length) {
    addScore(-45);
    risks.push('Google Safe Browsing reported a threat for this page.');
  } else if (apiStatus.safeBrowsing === 'ok') {
    addScore(10);
    reasons.push('Google Safe Browsing returned no threat matches.');
  }

  const vt = reputation.virusTotal?.stats;
  if (vt) {
    const malicious = Number(vt.malicious || 0) + Number(vt.suspicious || 0);
    if (malicious > 0) {
      addScore(-Math.min(40, malicious * 12));
      risks.push(`VirusTotal reported ${malicious} malicious or suspicious engine result(s).`);
    } else {
      addScore(8);
      reasons.push('VirusTotal reputation did not report malicious detections.');
    }
  } else if (apiStatus.virusTotal === 'missing-key') {
    risks.push('VirusTotal was not checked because no API key is configured.');
  }

  const urlscan = reputation.urlscan;
  if (urlscan?.verdict === 'malicious') {
    addScore(-35);
    risks.push('URLScan verdict indicates malicious behavior.');
  } else if (urlscan?.verdict === 'benign') {
    addScore(6);
    reasons.push('URLScan verdict appears benign.');
  } else if (apiStatus.urlscan === 'missing-key') {
    risks.push('URLScan was not checked because no API key is configured.');
  }
}

function buildExplanation({ score, softwareEntry, relationship, reasons, risks, apiStatus }) {
  const softwareName = softwareEntry?.name || 'the software on this page';
  if (score >= 80) {
    return `This page appears likely safe for ${softwareName}. The score is high because ${reasons.slice(0, 2).join(' ').toLowerCase()}`;
  }
  if (score >= 55) {
    return `This page needs caution. It has positive signals, but ${risks.slice(0, 2).join(' ').toLowerCase() || 'some verification signals are incomplete.'}`;
  }
  const missingApis = Object.values(apiStatus).filter((status) => status === 'missing-key').length;
  const suffix = missingApis ? ' Additional reputation APIs are not fully configured, so manual verification is recommended.' : '';
  return `This page is risky for ${softwareName}. The domain relationship is ${relationship}, and ${risks.slice(0, 3).join(' ').toLowerCase()}${suffix}`;
}

function getRiskLevel(score) {
  if (score >= 80) return 'low';
  if (score >= 55) return 'medium';
  if (score >= 30) return 'high';
  return 'critical';
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}
