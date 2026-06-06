const elements = {
  scanBtn: document.getElementById('scanBtn'),
  highlightBtn: document.getElementById('highlightBtn'),
  settingsToggle: document.getElementById('settingsToggle'),
  settingsPanel: document.getElementById('settingsPanel'),
  saveSettingsBtn: document.getElementById('saveSettingsBtn'),
  settingsStatus: document.getElementById('settingsStatus'),
  safeBrowsingKey: document.getElementById('safeBrowsingKey'),
  virusTotalKey: document.getElementById('virusTotalKey'),
  urlscanKey: document.getElementById('urlscanKey'),
  enableReputationChecks: document.getElementById('enableReputationChecks'),
  trustScore: document.getElementById('trustScore'),
  statusPill: document.getElementById('statusPill'),
  softwareName: document.getElementById('softwareName'),
  explanation: document.getElementById('explanation'),
  riskList: document.getElementById('riskList'),
  reasonList: document.getElementById('reasonList'),
  downloadLinks: document.getElementById('downloadLinks'),
  linkCount: document.getElementById('linkCount'),
  recommendation: document.getElementById('recommendation'),
  recommendedUrl: document.getElementById('recommendedUrl'),
  meter: document.querySelector('.meter')
};

const STATUS_CLASSES = ['low', 'medium', 'high', 'critical', 'official', 'neutral'];

elements.scanBtn.addEventListener('click', () => scanActiveTab());
elements.highlightBtn.addEventListener('click', () => highlightDownloads());
elements.settingsToggle.addEventListener('click', toggleSettings);
elements.saveSettingsBtn.addEventListener('click', saveSettings);
document.addEventListener('DOMContentLoaded', loadSettingsSummary);
loadSettingsSummary();

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:/.test(tab.url || '')) {
    throw new Error('Open an HTTP or HTTPS webpage before scanning.');
  }
  return tab;
}

async function scanActiveTab() {
  setBusy(true, 'Scanning…');
  try {
    const tab = await getActiveTab();
    const signalsResponse = await chrome.tabs.sendMessage(tab.id, { type: 'SDV_COLLECT_PAGE_SIGNALS' });
    if (!signalsResponse?.ok) throw new Error('Unable to collect page signals. Refresh the tab and try again.');
    const analysis = await chrome.runtime.sendMessage({ type: 'SDV_ANALYZE_PAGE', signals: signalsResponse.signals });
    if (!analysis?.ok) throw new Error(analysis?.error || 'Analysis failed.');
    renderAnalysis(analysis);
  } catch (error) {
    renderError(error.message);
  } finally {
    setBusy(false, 'Scan Page');
  }
}

async function highlightDownloads() {
  setButtonBusy(elements.highlightBtn, true, 'Highlighting…');
  try {
    const tab = await getActiveTab();
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'SDV_HIGHLIGHT_DOWNLOADS' });
    const count = response?.highlighted || 0;
    elements.highlightBtn.textContent = `${count} highlighted`;
    setTimeout(() => { elements.highlightBtn.textContent = 'Highlight Downloads'; }, 1800);
  } catch (error) {
    renderError(error.message);
  } finally {
    setButtonBusy(elements.highlightBtn, false, 'Highlight Downloads');
  }
}

function renderAnalysis(analysis) {
  const score = analysis.trust.score;
  elements.trustScore.textContent = String(score);
  elements.meter.style.setProperty('--score', score);
  elements.meter.setAttribute('aria-valuenow', String(score));
  const primary = analysis.detection.primary;
  elements.softwareName.textContent = primary?.name || 'Unknown software';
  elements.explanation.textContent = analysis.trust.explanation;
  setStatusPill(analysis.trust.status, analysis.trust.riskLevel);
  renderList(elements.riskList, analysis.trust.risks, '⚠');
  renderList(elements.reasonList, analysis.trust.reasons, '✓');
  renderDownloadLinks(analysis.pageSignals.downloadLinks || []);
  renderRecommendation(analysis.trust.recommendedUrl);
}

function setStatusPill(text, riskLevel) {
  elements.statusPill.classList.remove(...STATUS_CLASSES);
  elements.statusPill.classList.add(riskLevel || 'neutral');
  elements.statusPill.textContent = text;
}

function renderList(container, items, icon) {
  container.replaceChildren();
  const safeItems = items?.length ? items : ['No signals available yet.'];
  safeItems.forEach((item) => {
    const li = document.createElement('li');
    const iconSpan = document.createElement('span');
    iconSpan.textContent = icon;
    const textSpan = document.createElement('span');
    textSpan.textContent = item;
    li.append(iconSpan, textSpan);
    container.append(li);
  });
}

function renderDownloadLinks(links) {
  elements.linkCount.textContent = `${links.length} found`;
  elements.downloadLinks.replaceChildren();
  elements.downloadLinks.classList.toggle('empty', links.length === 0);
  if (!links.length) {
    elements.downloadLinks.textContent = 'No download-like links detected.';
    return;
  }
  links.forEach((link) => {
    const item = document.createElement('article');
    item.className = 'link-item';
    const title = document.createElement('div');
    title.className = 'link-title';
    title.textContent = link.text || 'Download link';
    const url = document.createElement('div');
    url.className = 'link-url';
    url.textContent = link.href || 'No URL available';
    const meta = document.createElement('div');
    meta.className = 'link-meta';
    meta.append(
      makeChip(link.protocol === 'https:' ? 'HTTPS' : (link.protocol || 'No URL'), link.protocol === 'https:' ? 'secure' : 'insecure'),
      makeChip(link.isCrossOrigin ? 'Cross-origin' : 'Same origin'),
      makeChip(link.keyword || 'download')
    );
    item.append(title, url, meta);
    elements.downloadLinks.append(item);
  });
}

function makeChip(text, variant = '') {
  const chip = document.createElement('span');
  chip.className = `chip ${variant}`.trim();
  chip.textContent = text;
  return chip;
}

function renderRecommendation(url) {
  elements.recommendation.classList.toggle('hidden', !url);
  if (!url) return;
  elements.recommendedUrl.href = url;
  elements.recommendedUrl.textContent = url;
}

function renderError(message) {
  elements.explanation.textContent = message;
  elements.trustScore.textContent = '--';
  elements.meter.style.setProperty('--score', 0);
  setStatusPill('Scan error', 'high');
}

function setBusy(isBusy, label) {
  setButtonBusy(elements.scanBtn, isBusy, label);
}

function setButtonBusy(button, isBusy, label) {
  button.disabled = isBusy;
  if (label) button.textContent = label;
}

function toggleSettings() {
  const isHidden = elements.settingsPanel.classList.toggle('hidden');
  elements.settingsToggle.setAttribute('aria-expanded', String(!isHidden));
}

async function loadSettingsSummary() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'SDV_GET_SETTINGS' });
    if (!response?.ok) return;
    elements.enableReputationChecks.checked = response.settings.enableReputationChecks;
    elements.safeBrowsingKey.placeholder = response.settings.hasSafeBrowsingKey ? 'Saved key configured' : 'Optional Google Safe Browsing API key';
    elements.virusTotalKey.placeholder = response.settings.hasVirusTotalKey ? 'Saved key configured' : 'Optional VirusTotal API key';
    elements.urlscanKey.placeholder = response.settings.hasUrlscanKey ? 'Saved key configured' : 'Optional URLScan API key';
  } catch (_error) {
    // Popup can still scan locally if settings are unavailable.
  }
}

async function saveSettings() {
  setButtonBusy(elements.saveSettingsBtn, true, 'Saving…');
  elements.settingsStatus.textContent = '';
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SDV_SAVE_SETTINGS',
      settings: {
        safeBrowsingKey: elements.safeBrowsingKey.value,
        virusTotalKey: elements.virusTotalKey.value,
        urlscanKey: elements.urlscanKey.value,
        enableReputationChecks: elements.enableReputationChecks.checked
      }
    });
    if (!response?.ok) throw new Error(response?.error || 'Unable to save settings.');
    elements.safeBrowsingKey.value = '';
    elements.virusTotalKey.value = '';
    elements.urlscanKey.value = '';
    elements.settingsStatus.textContent = 'Settings saved securely in extension storage.';
    await loadSettingsSummary();
  } catch (error) {
    elements.settingsStatus.textContent = error.message;
  } finally {
    setButtonBusy(elements.saveSettingsBtn, false, 'Save Settings');
  }
}
