importScripts('sites.js');

chrome.runtime.onInstalled.addListener(() => { syncScripts(); });
chrome.runtime.onStartup.addListener(() => { syncScripts(); });

// 授權視窗出現時彈出視窗可能會被關掉，所以授權成功後的處理放在這裡
chrome.permissions.onAdded.addListener(async ({ origins = [] }) => {
  const sites = await getSites();
  const add = origins.filter(o => /^https?:\/\//.test(o) && !isBlockedHost(hostOf(o)));
  if (!add.length) return;
  await setSites([...sites, ...add]);
  for (const o of add) await injectInto(o);
});

// 使用者從 Chrome 設定收回權限時，同步移出清單
chrome.permissions.onRemoved.addListener(async ({ origins = [] }) => {
  const sites = await getSites();
  const left = sites.filter(s => !origins.includes(s));
  if (left.length !== sites.length) await setSites(left);
  else await syncScripts();
});
