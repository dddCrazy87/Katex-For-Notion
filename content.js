// 公式複製到 Notion
// 在已啟用的網站上按 Ctrl+C / Cmd+C 時，如果選取範圍含有公式，
// 就把 KaTeX 還原成 LaTeX（包成 $…$），其餘內容轉成 Markdown 放進剪貼簿。
(() => {
  'use strict';

  // 從彈出視窗啟用時會直接注入，避免同一頁重複載入
  if (globalThis.__katexToNotionLoaded) return;
  globalThis.__katexToNotionLoaded = true;

  // 在彈出視窗停用後立即生效，不用重新整理頁面
  let enabled = true;
  const hasChrome = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged;
  if (hasChrome) {
    const mine = `${location.protocol}//${location.hostname}/*`;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.sites) {
        enabled = (changes.sites.newValue || []).includes(mine);
      }
    });
  }

  // ===== 可自行調整的設定 =====
  const CONFIG = {
    inline: ['$', '$'],          // 行內公式的前後符號（Notion 貼上後變成文字內公式）
    display: ['$', '$'],         // 原本獨立一行的公式：一樣用行內公式，只是自己佔一行
    onlyWhenMath: true,          // 選取範圍沒有公式時，不攔截，走瀏覽器預設複製
    listIndent: '    ',          // 巢狀清單每層的縮排
    blankLineBetweenBlocks: false // false：段落之間只換一行，避免 Notion 多出空白區塊
  };
  // ===========================

  const TEXT = 3, ELEM = 1, FRAG = 11;

  // 選取的起點或終點落在公式裡面時，往外擴到整個公式
  function mathRoot(node) {
    const el = node.nodeType === ELEM ? node : node.parentElement;
    if (!el) return null;
    return el.closest('.katex-display') || el.closest('.katex');
  }

  function expandRange(range) {
    const s = mathRoot(range.startContainer);
    if (s) range.setStartBefore(s);
    const e = mathRoot(range.endContainer);
    if (e) range.setEndAfter(e);
  }

  function texOf(katexEl, ctx) {
    const ann = katexEl.querySelector('annotation[encoding="application/x-tex"]');
    if (!ann) return null;
    let tex = ann.textContent.trim();
    // 表格裡的 | 會被當成欄位分隔，換成等價的指令
    if (ctx.inTable) tex = tex.replace(/\\\|/g, '\\Vert ').replace(/\|/g, '\\vert ');
    return tex;
  }

  function children(node, ctx) {
    let out = '';
    for (const c of node.childNodes) out += render(c, ctx);
    return out;
  }

  function block(s) {
    return '\n\n' + s.trim() + '\n\n';
  }

  function oneLine(s) {
    return s.trim().replace(/\s*\n\s*/g, ' ');
  }

  function renderList(listEl, depth, ctx) {
    const ordered = listEl.tagName === 'OL';
    const start = parseInt(listEl.getAttribute('start') || '1', 10);
    let out = '', i = 0;
    for (const li of listEl.children) {
      if (li.tagName !== 'LI') continue;
      out += renderItem(li, depth, ordered ? `${start + i}. ` : '- ', ctx);
      i++;
    }
    return out;
  }

  function renderItem(li, depth, marker, ctx) {
    const indent = CONFIG.listIndent.repeat(depth);
    let head = '', nested = '';
    for (const c of li.childNodes) {
      if (c.nodeType === ELEM && (c.tagName === 'UL' || c.tagName === 'OL')) {
        nested += renderList(c, depth + 1, ctx);
      } else {
        head += render(c, ctx);
      }
    }
    return indent + marker + oneLine(head) + '\n' + nested;
  }

  function renderTable(table, ctx) {
    const tctx = { ...ctx, inTable: true };
    const rows = [...table.querySelectorAll('tr')].map(tr =>
      [...tr.children].map(cell => oneLine(children(cell, tctx)))
    );
    if (!rows.length) return '';
    const n = Math.max(...rows.map(r => r.length));
    const line = r => '| ' + [...r, ...Array(n - r.length).fill('')].join(' | ') + ' |';
    const lines = [line(rows[0]), '|' + ' --- |'.repeat(n), ...rows.slice(1).map(line)];
    return block(lines.join('\n'));
  }

  function render(node, ctx) {
    if (node.nodeType === TEXT) {
      let t = node.nodeValue.replace(/\s+/g, ' ');
      if (ctx.inTable) t = t.replace(/\|/g, '\\|');
      return t;
    }
    if (node.nodeType === FRAG) return children(node, ctx);
    if (node.nodeType !== ELEM) return '';

    const el = node;

    if (el.classList.contains('katex-display')) {
      const k = el.querySelector('.katex');
      const tex = k && texOf(k, ctx);
      if (tex !== null && tex !== undefined) {
        return block(CONFIG.display[0] + tex + CONFIG.display[1]);
      }
    }
    if (el.classList.contains('katex')) {
      const tex = texOf(el, ctx);
      if (tex !== null) return CONFIG.inline[0] + tex + CONFIG.inline[1];
    }

    const tag = el.tagName;
    switch (tag) {
      case 'BUTTON': case 'SVG': case 'svg': case 'STYLE': case 'SCRIPT':
        return '';
      case 'BR':
        return '\n';
      case 'STRONG': case 'B': {
        const s = children(el, ctx);
        return s.trim() ? `**${s.trim()}**` : s;
      }
      case 'EM': case 'I': {
        const s = children(el, ctx);
        return s.trim() ? `*${s.trim()}*` : s;
      }
      case 'CODE':
        if (el.closest('pre')) return el.textContent;
        return '`' + el.textContent + '`';
      case 'PRE': {
        const code = el.querySelector('code');
        const m = code && /language-(\S+)/.exec(code.className);
        const body = (code || el).textContent.replace(/\n$/, '');
        return '\n\n```' + (m ? m[1] : '') + '\n' + body + '\n```\n\n';
      }
      case 'H1': case 'H2': case 'H3': case 'H4': case 'H5': case 'H6':
        return block('#'.repeat(+tag[1]) + ' ' + oneLine(children(el, ctx)));
      case 'UL': case 'OL':
        return block(renderList(el, 0, ctx));
      case 'LI':
        // 選取從清單中間開始時，片段最外層會直接是 <li>
        return renderItem(el, 0, '- ', ctx);
      case 'HR':
        return block('---');
      case 'TABLE':
        return renderTable(el, ctx);
      case 'BLOCKQUOTE':
        return block(children(el, ctx).trim().split('\n').map(l => '> ' + l).join('\n'));
      case 'P': case 'DIV': case 'SECTION': case 'ARTICLE':
        return block(children(el, ctx));
      default:
        return children(el, ctx);
    }
  }

  function tidy(s) {
    s = s
      .split('\n').map(l => l.replace(/[ \t]+$/, '')).join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (!CONFIG.blankLineBetweenBlocks) {
      // 程式碼區塊內的空行保留
      s = s.split(/(```[\s\S]*?```)/).map((part, i) =>
        i % 2 ? part : part.replace(/\n{2,}/g, '\n')
      ).join('');
    }
    return s;
  }

  function convertSelection(sel) {
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0).cloneRange();
    expandRange(range);
    const frag = range.cloneContents();
    const maths = frag.querySelectorAll('.katex');
    if (CONFIG.onlyWhenMath && maths.length === 0) return null;
    // 有公式讀不到 LaTeX 原始碼（網站沒輸出 annotation）時，不要亂轉，交給瀏覽器預設複製
    for (const k of maths) {
      if (!k.querySelector('annotation[encoding="application/x-tex"]')) return null;
    }
    const md = tidy(render(frag, { depth: 0, inTable: false }));
    return md || null;
  }

  document.addEventListener('copy', (e) => {
    if (!enabled) return;
    let md;
    try {
      md = convertSelection(window.getSelection());
    } catch (err) {
      console.warn('[公式複製到 Notion] 轉換失敗，改用預設複製', err);
      return;
    }
    if (!md || !e.clipboardData) return;
    e.clipboardData.setData('text/plain', md);
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
})();
