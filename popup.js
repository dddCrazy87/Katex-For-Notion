const $ = s => document.querySelector(s);
const toggle = $('#toggle');
let tab = null;
let pattern = null;
let sites = [];

function note(text) {
  $('#note').textContent = text;
  $('#note').hidden = !text;
}

async function removeSite(p) {
  try { await chrome.permissions.remove({ origins: [p] }); } catch (e) {}
  await setSites(sites.filter(s => s !== p));
}

async function render() {
  sites = await getSites();

  if (pattern) {
    const on = sites.includes(pattern);
    $('#status').textContent = on ? '已啟用：複製含公式的內容時會自動轉換' : '未啟用';
    $('#status').className = 'status' + (on ? ' on' : '');
    toggle.textContent = on ? '在這個網站停用' : '在這個網站啟用';
    toggle.className = on ? 'on' : '';
    toggle.hidden = false;
  }

  const list = $('#list');
  list.replaceChildren();
  for (const p of sites) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = hostOf(p);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '移除';
    btn.addEventListener('click', async () => {
      await removeSite(p);
      render();
    });
    li.append(name, btn);
    list.append(li);
  }
  $('#empty').hidden = sites.length > 0;
}

toggle.addEventListener('click', async () => {
  note('');
  if (sites.includes(pattern)) {
    await removeSite(pattern);
    render();
    return;
  }
  // 必須在按下按鈕的當下直接要求權限
  const granted = await chrome.permissions.request({ origins: [pattern] });
  if (!granted) {
    note('沒有取得這個網站的權限，所以無法啟用。');
    return;
  }
  await setSites([...sites, pattern]);
  await injectInto(pattern);
  render();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.sites) render();
});

(async () => {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let url = null;
  try { url = new URL(tab.url); } catch (e) {}

  if (!url || !/^https?:$/.test(url.protocol)) {
    $('#host').textContent = '這個頁面不能啟用';
    $('#status').textContent = '只支援一般網頁（http、https）。';
  } else if (isBlockedHost(url.hostname)) {
    $('#host').textContent = url.hostname;
    $('#status').textContent = 'Notion 是貼上公式的地方，不在這裡啟用，以免 Notion 內部的複製貼上被改成純文字。';
  } else {
    $('#host').textContent = url.hostname;
    pattern = patternFor(tab.url);
  }
  render();
})();
