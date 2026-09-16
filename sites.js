// 啟用網站清單的共用函式（背景程式與彈出視窗共用）
const SCRIPT_ID = 'katex-to-notion';

// Notion 是貼上的地方，不在這裡啟用，避免 Notion 內部複製被改掉
const BLOCKED_HOSTS = [/(^|\.)notion\.so$/, /(^|\.)notion\.site$/, /(^|\.)notion\.com$/];

function isBlockedHost(hostname) {
  return BLOCKED_HOSTS.some(re => re.test(hostname));
}

function patternFor(url) {
  const u = new URL(url);
  return `${u.protocol}//${u.hostname}/*`;
}

function hostOf(pattern) {
  return pattern.replace(/^https?:\/\//, '').replace(/\/\*$/, '');
}

async function getSites() {
  const { sites = [] } = await chrome.storage.sync.get('sites');
  return sites;
}

async function setSites(sites) {
  await chrome.storage.sync.set({ sites: [...new Set(sites)].sort() });
  await syncScripts();
}

// 依清單（且仍有權限的網站）更新自動載入的內容腳本
async function syncScripts() {
  const sites = await getSites();
  const allowed = [];
  for (const p of sites) {
    if (await chrome.permissions.contains({ origins: [p] })) allowed.push(p);
  }
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  if (allowed.length === 0) {
    if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
    return;
  }
  const def = {
    id: SCRIPT_ID,
    matches: allowed,
    js: ['content.js'],
    runAt: 'document_idle',
    persistAcrossSessions: true
  };
  if (existing.length) await chrome.scripting.updateContentScripts([def]);
  else await chrome.scripting.registerContentScripts([def]);
}

// 已開著的分頁不用重新整理，直接注入
async function injectInto(pattern) {
  const tabs = await chrome.tabs.query({ url: pattern });
  for (const t of tabs) {
    chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['content.js'] }).catch(() => {});
  }
}
