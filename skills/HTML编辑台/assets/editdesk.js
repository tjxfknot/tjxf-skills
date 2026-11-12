/* 编辑台 · 核心层 ————————————————————————————————————————
   给任何 HTML 加上「就地改字 / 存住 / 导出成新文件」三件事。
   两种宿主，装的时候选一种：
     data 模式：页面由一个 DATA 对象渲染出来。改字写回 DATA 的路径，再让宿主重绘。
     dom  模式：页面就是静态 HTML，没有数据源。改字直接改 DOM，导出整页快照。
   契约只有一条：想让人改的元素，data 模式标 data-e="a/b/0/c"，dom 模式标 data-e 或 class="ed"。
   —————————————————————————————————————————————————————— */
(function (root) {
'use strict';

var ED = {}, C = null, DATA = null, editing = false, dirty = false, saveT = null;

/* ---------- 小工具 ---------- */
function $(s, r) { return (r || document).querySelector(s); }
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }

/* 只留 b / em / br，别的标签一律扒掉 —— 从别处粘进来的富文本会带一堆 span style */
function clean(html) {
  return String(html)
    .replace(/<div><br\s*\/?><\/div>/gi, '<br>')
    .replace(/<\/div>\s*<div>/gi, '<br>')
    .replace(/<\/?div[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '<br>')
    .replace(/<(?!\/?(b|br|em)\b)[^>]*>/gi, '')
    .replace(/&nbsp;| /g, ' ')
    .trim();
}
function plain(html) { return String(html).replace(/<[^>]*>/g, '').replace(/&nbsp;| /g, ' ').trim(); }

/* 路径读写：'tiers/0/items/3/name' */
function getP(p, o) {
  var ks = String(p).split('/'), cur = o || DATA;
  for (var i = 0; i < ks.length; i++) { if (cur == null) return undefined; cur = cur[ks[i]]; }
  return cur;
}
function setP(p, v, o) {
  var ks = String(p).split('/'), last = ks.pop(), cur = o || DATA;
  for (var i = 0; i < ks.length; i++) {
    if (cur[ks[i]] == null) cur[ks[i]] = /^\d+$/.test(ks[i + 1] || last) ? [] : {};
    cur = cur[ks[i]];
  }
  cur[last] = v;
}

/* ---------- 提示条 ---------- */
var toastT;
function toast(msg, ms) {
  var t = $('#edToast');
  if (!t) { t = el('div'); t.id = 'edToast'; t.setAttribute('data-ed-ui', ''); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, ms || 2600);
}
ED.toast = toast;

/* ---------- 缓存 ————————————————————————————————
   血的教训：版本号对不上就 removeItem，会把用户没导出的修改直接抹掉。
   这里默认改成「保留」——照样把缓存读出来用，只是弹条提示让用户自己决定。   */
function lsKey(k) { return 'editdesk.' + encodeURIComponent(k || document.title || 'page').slice(0, 60); }
/* 给一份数据算个短指纹：同一个缓存键下换了别的文件（比如打开历史备份），靠它认出来 */
function fp(o) {
  var s = JSON.stringify(o), h = 5381, i = s.length;
  while (i) h = (h * 33) ^ s.charCodeAt(--i);
  return (h >>> 0).toString(36);
}

ED.boot = function (defaults, opts) {
  opts = opts || {};
  var key = lsKey(opts.key), ver = opts.ver != null ? opts.ver : (defaults && defaults.ver);
  var stale = opts.onStaleCache || 'keep';      // keep | ask | drop
  var mine = fp(defaults);
  ED._key = key; ED._ver = ver; ED._defaults = defaults; ED._fp = mine;

  /* 「只看一眼这份文件原本的内容」——不读缓存也不写缓存，刷新就回到用户自己的稿 */
  try {
    if (sessionStorage.getItem(key + '.peek') === '1') {
      sessionStorage.removeItem(key + '.peek');
      ED._peek = true;
      return defaults;
    }
  } catch (e) { }

  var out = defaults, raw = null;
  try { raw = localStorage.getItem(key); } catch (e) { }
  if (raw) {
    var d = null;
    try { d = JSON.parse(raw); } catch (e) { }
    if (d) {
      var sameVer = (ver == null) || (d.ver === ver);
      var sameSrc = !d._fp || d._fp === mine;    // 老缓存没记指纹，就当它是同一份
      if (sameVer && sameSrc) out = d;
      else if (stale === 'drop') { try { localStorage.removeItem(key); } catch (e) { } }
      else {
        out = d;                                 // 先保住用户的稿，别急着丢
        ED._staleWarn = { key: key, oldVer: d.ver, newVer: ver, defaults: defaults, mode: stale,
                          why: sameVer ? 'file' : 'ver' };
      }
    }
  }
  return out;
};

function stalePrompt() {
  if (ED._peek) {                                  // 正在「只看一眼」
    var pb = el('div', '', ''); pb.id = 'edStale'; pb.setAttribute('data-ed-ui', '');
    pb.innerHTML = '<span><b>现在看的是这份文件原本的内容</b>，你本机的修改一个字都没动，也不会被覆盖。刷新页面就回到你的修改。</span>';
    var pb1 = el('button', 'ghost', '刷新，回到我的修改');
    pb1.onclick = function () { location.reload(); };
    pb.appendChild(pb1); document.body.appendChild(pb);
    return;
  }
  var w = ED._staleWarn; if (!w) return;
  var bar = el('div', '', ''); bar.id = 'edStale'; bar.setAttribute('data-ed-ui', '');
  bar.innerHTML = w.why === 'file'
    ? '<span>这份文件的内容和你本机存着的那份对不上（多半是换了一份文件、或打开了历史备份）。<b>现在显示的是你本机的修改</b>，文件里的内容还没生效。</span>'
    : '<span>这份文件是新版（v' + w.newVer + '），你本机存着旧版（v' + w.oldVer +
      '）的修改。<b>现在显示的是你的修改</b>，新版的默认内容还没生效。</span>';
  var b1 = el('button', '', '先导出我的修改');
  var b2 = el('button', '', '用这份文件的内容（丢弃我的修改）');
  var b3 = el('button', '', '只看一眼文件内容（不动我的稿）');
  var b4 = el('button', 'ghost', '知道了');
  b1.onclick = function () { ED.exportHTML(); };
  b2.onclick = function () {
    if (!confirm('确定丢弃本机存的修改，改用这份文件自带的内容？此操作不可撤销。')) return;
    try { localStorage.removeItem(w.key); } catch (e) { }
    location.reload();
  };
  b3.onclick = function () {
    try { sessionStorage.setItem(w.key + '.peek', '1'); } catch (e) { }
    location.reload();
  };
  b4.onclick = function () { bar.remove(); };
  bar.appendChild(b1); bar.appendChild(b2); bar.appendChild(b3); bar.appendChild(b4);
  document.body.appendChild(bar);
  ED._staleWarn = null;
}

function persist() {
  if (C.mode !== 'data' || ED._peek) return;       // 只看一眼时不落盘，免得污染用户自己的稿
  try {
    DATA.ver = ED._ver != null ? ED._ver : DATA.ver;
    DATA._fp = ED._fp;                             // 记下这份稿是从哪份文件来的
    localStorage.setItem(ED._key, JSON.stringify(DATA));
  } catch (e) { toast('存不下了（浏览器缓存已满），赶紧导出'); }
}
function persistDom() {
  if (C.mode !== 'dom' || ED._peek) return;
  var m = {}, st = {};
  $$('[data-e]').forEach(function (n) {
    var k = n.getAttribute('data-e');
    m[k] = n.innerHTML;
    var sv = n.getAttribute('style');          // 格式条改的是元素自己的 style，不在 innerHTML 里
    if (sv) st[k] = sv;
  });
  var pack = { ver: ED._ver, dom: m };
  if (Object.keys(st).length) pack.sty = st;
  try { localStorage.setItem(ED._key, JSON.stringify(pack)); }
  catch (e) { toast('存不下了（浏览器缓存已满），赶紧导出'); }
}
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(function () { C.mode === 'dom' ? persistDom() : persist(); }, 250);
  markDirty(true);
}
/* dom 模式：把存过的片段贴回去。宿主在页面渲染完后调一次。 */
ED.restoreDom = function (key) {
  var k = lsKey(key), raw = null;
  try { raw = localStorage.getItem(k); } catch (e) { }
  if (!raw) return false;
  var d = null; try { d = JSON.parse(raw); } catch (e) { }
  if (!d || !d.dom) return false;
  Object.keys(d.dom).forEach(function (p) {
    var n = document.querySelector('[data-e="' + p.replace(/"/g, '\\"') + '"]');
    if (n) n.innerHTML = d.dom[p];
  });
  if (d.sty) Object.keys(d.sty).forEach(function (p) {       // 把 inline 格式贴回去
    var n = document.querySelector('[data-e="' + p.replace(/"/g, '\\"') + '"]');
    if (n) n.setAttribute('style', d.sty[p]);
  });
  ED._key = k;
  return true;
};

/* ---------- 没导出就等于没存 ---------- */
function markDirty(v) {
  dirty = v;
  var b = $('#edExport');
  if (b) { b.classList.toggle('dirty', v); b.textContent = v ? '导出 HTML ●' : '导出 HTML'; }
  if (C && C.onDirty) C.onDirty(v);
}
ED.isDirty = function () { return dirty; };
window.addEventListener('beforeunload', function (e) {
  if (!dirty) return;
  e.preventDefault(); e.returnValue = '改动只存在这台电脑的浏览器里，没导出就换台电脑打开会看不到。确定离开？';
  return e.returnValue;
});

/* ---------- 导出 ————————————————————————————————
   template：宿主在第一个 script 顶部存了原始骨架（见装配指南），导出最干净。
   snapshot：直接把当前整棵 DOM 克隆下来，谁都能用，代价是会带上运行时生成的节点。 */
/* 标记必须拼接生成 —— 本文件常被内联进宿主 script，再被整段取走做导出。
   源码里只要出现字面的标记，替换正则就会先匹配到这儿，把编辑台自己切断。 */
var MK_S = '/*DATA' + '_START*/', MK_E = '/*DATA' + '_END*/';
var MK_RE = new RegExp('\\/\\*DATA_START\\*\\/[\\s\\S]*?\\/\\*DATA_END\\*\\/');
function dataBlock() {
  var c = {}, k;                                   // 指纹是内部记号，别写进导出的文件
  for (k in DATA) if (Object.prototype.hasOwnProperty.call(DATA, k) && k !== '_fp') c[k] = DATA[k];
  var s = 'let DATA = ' + JSON.stringify(c, null, 1) + ';';
  return s.replace(/<\/script/gi, '<\\/script');
}
function swapData(src) { return src.replace(MK_RE, MK_S + '\n' + dataBlock() + '\n' + MK_E); }
function exportTemplate() {
  var js = swapData(root.__ED_SELF__);
  js = js.replace(/<\/script/gi, '<\\/script');
  var head = document.head.innerHTML.replace(/<style id="edCSS"[\s\S]*?<\/style>/i, '');
  var th = document.documentElement.dataset.theme;
  return '<!DOCTYPE html>\n<html lang="zh-CN"' + (th ? ' data-theme="' + th + '"' : '') + '>\n<head>\n'
    + head + '\n</head>\n<body>\n' + root.__ED_BODY__ + '\n<script>\n' + js + '\n<\/script>\n</body>\n</html>';
}
function exportSnapshot() {
  var doc = document.documentElement.cloneNode(true);
  $$('[data-ed-ui]', doc).forEach(function (n) { n.remove(); });
  $$('#edCSS', doc).forEach(function (n) { n.remove(); });
  $$('[contenteditable]', doc).forEach(function (n) { n.removeAttribute('contenteditable'); n.removeAttribute('spellcheck'); });
  var b = doc.querySelector('body'); if (b) b.classList.remove('ed-editing');
  if (C.mode === 'data') {
    $$('script', doc).forEach(function (s) {
      if (s.textContent.indexOf(MK_S) >= 0) s.textContent = swapData(s.textContent);
    });
  }
  return '<!DOCTYPE html>\n' + doc.outerHTML;
}
function download(name, text) {
  var b = new Blob([text], { type: 'text/html;charset=utf-8' }), a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
}
ED.exportHTML = function () {
  var useTpl = C.exportMode === 'template' || (C.exportMode === 'auto' && root.__ED_SELF__ && root.__ED_BODY__);
  if (C.exportMode === 'template' && !(root.__ED_SELF__ && root.__ED_BODY__)) {
    console.warn('[编辑台] 指定了 template 导出，但页面没存 __ED_SELF__/__ED_BODY__，自动改用 snapshot');
    useTpl = false;
  }
  var name = (typeof C.exportName === 'function' ? C.exportName() : C.exportName) ||
    (plain(document.title) || 'page') + '.html';
  if (!/\.html?$/i.test(name)) name += '.html';
  download(name, useTpl ? exportTemplate() : exportSnapshot());
  markDirty(false);
  toast('已导出「' + name + '」，用它覆盖原文件即可');
};

ED.reset = function () {
  if (!confirm('把所有修改还原成文件自带的原始内容？本机存的改动会被清掉，不可撤销。')) return;
  try { localStorage.removeItem(ED._key); } catch (e) { }
  markDirty(false);
  location.reload();
};

/* ---------- 编辑模式 ---------- */
function editableNodes() { return $$(C.selector); }

ED.setEditing = function (v) {
  editing = !!v;
  document.body.classList.toggle('ed-editing', editing);
  var b = $('#edToggle'); if (b) b.textContent = editing ? '退出编辑' : '编辑模式';
  ['#edExport', '#edReset'].forEach(function (s) { var n = $(s); if (n) n.style.display = editing ? '' : 'none'; });
  if (editing && C.onEnter) C.onEnter();
  if (!editing && C.onExit) C.onExit();
  editableNodes().forEach(function (n) {
    if (editing) { n.setAttribute('contenteditable', 'true'); n.spellcheck = false; }
    else { n.removeAttribute('contenteditable'); n.removeAttribute('spellcheck'); }
  });
  if (C.panels) C.panels.forEach(function (s) { var n = $(s); if (n) n.style.display = editing ? '' : 'none'; });
  toast(editing ? '点任意文字直接改，改完按「导出 HTML」才算落盘' : '已退出编辑');
  root.dispatchEvent(new CustomEvent('editdesk:mode', { detail: { editing: editing } }));
};
ED.isEditing = function () { return editing; };
/* 宿主有自己的编辑模式开关（要管面板显隐、状态复原）时，装配时传 toggleEditing 接管 */
ED.toggle = function () {
  if (C && C.toggleEditing) C.toggleEditing(!editing);
  else ED.setEditing(!editing);
};
/* 宿主自己开的编辑模式，调这个把标志同步过来 */
ED.syncEditing = function (v) { editing = !!v; markDirty(dirty); };
ED.data = function () { return DATA; };
ED.save = save;
ED.getP = getP; ED.setP = setP; ED.clean = clean; ED.plain = plain;

/* 改完一格 —— 失焦才写回，免得每敲一个字就重绘一次 */
document.addEventListener('focusout', function (e) {
  var n = e.target;
  if (!n || !n.hasAttribute || !n.hasAttribute('data-e') || !n.isContentEditable) return;
  var val = clean(n.innerHTML);
  if (C.mode === 'data') {
    var p = n.getAttribute('data-e');
    if (val === String(getP(p) == null ? '' : getP(p))) return;
    setP(p, val);
    save();
    if (C.onChange) C.onChange(p, val);
  } else {
    if (n.innerHTML !== val) n.innerHTML = val;
    save();
    if (C.onChange) C.onChange(n.getAttribute('data-e'), val);
  }
}, true);

/* 粘贴一律转纯文本；回车给 <br> 不给 <div> */
document.addEventListener('paste', function (e) {
  if (!e.target || !e.target.isContentEditable) return;
  e.preventDefault();
  var t = (e.clipboardData || root.clipboardData).getData('text/plain');
  document.execCommand('insertText', false, t);
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && e.target && e.target.isContentEditable && !e.shiftKey) {
    e.preventDefault(); document.execCommand('insertLineBreak');
  }
  if (e.key === 'Escape' && document.activeElement && document.activeElement.isContentEditable)
    document.activeElement.blur();
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); ED.exportHTML(); }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'e') { e.preventDefault(); ED.toggle(); }
});

/* ---------- 工具条 ---------- */
var CSS = [
  '#edBar{position:fixed;right:14px;bottom:14px;z-index:99999;display:flex;gap:8px;align-items:center;',
  'font:13px/1.4 system-ui,-apple-system,"PingFang SC",sans-serif}',
  '#edBar button{padding:7px 13px;border-radius:8px;border:1px solid rgba(128,128,128,.35);cursor:pointer;',
  'background:rgba(30,30,34,.86);color:#eee;backdrop-filter:blur(8px);font:inherit;line-height:1}',
  '#edBar button:hover{border-color:rgba(128,128,128,.75)}',
  '#edBar button.dirty{background:#b4560f;border-color:#e07a28;color:#fff}',
  '#edToast{position:fixed;left:50%;bottom:64px;transform:translate(-50%,12px);z-index:99999;',
  'padding:10px 18px;border-radius:10px;background:rgba(20,20,24,.92);color:#fff;pointer-events:none;',
  'font:14px/1.5 system-ui,-apple-system,"PingFang SC",sans-serif;opacity:0;transition:.28s}',
  '#edToast.on{opacity:1;transform:translate(-50%,0)}',
  '#edStale{position:fixed;left:0;right:0;top:0;z-index:99999;display:flex;gap:10px;align-items:center;',
  'flex-wrap:wrap;padding:11px 16px;background:#7a3b06;color:#fff;',
  'font:13px/1.6 system-ui,-apple-system,"PingFang SC",sans-serif}',
  '#edStale b{color:#ffd9a8}',
  '#edStale button{padding:5px 11px;border-radius:7px;border:1px solid rgba(255,255,255,.5);',
  'background:rgba(255,255,255,.14);color:#fff;cursor:pointer;font:inherit}',
  '#edStale button.ghost{border-color:transparent;background:transparent;opacity:.8}',
  'body.ed-editing [data-e]{outline:1px dashed rgba(120,170,255,.42);outline-offset:2px;border-radius:3px;min-width:1em}',
  'body.ed-editing [data-e]:hover{outline-color:rgba(120,170,255,.9)}',
  'body.ed-editing [data-e]:focus{outline:2px solid #5b9dff;background:rgba(91,157,255,.1)}',
  '@media print{#edBar,#edToast,#edStale{display:none!important}}'
].join('');

/* 样式总要注入：就算宿主自带工具条（ui:false），提示条和 toast 也得有样子 */
function injectCSS() {
  if ($('#edCSS')) return;
  var st = el('style'); st.id = 'edCSS'; st.textContent = CSS; document.head.appendChild(st);
}
function buildBar() {
  if ($('#edBar')) return;
  var bar = el('div'); bar.id = 'edBar'; bar.setAttribute('data-ed-ui', '');
  function btn(id, txt, fn, hide) {
    var b = el('button', '', txt); b.id = id; b.onclick = fn; if (hide) b.style.display = 'none';
    bar.appendChild(b); return b;
  }
  btn('edReset', '还原', ED.reset, true);
  btn('edExport', '导出 HTML', ED.exportHTML, true);
  btn('edToggle', '编辑模式', function () { ED.setEditing(!editing); });
  document.body.appendChild(bar);
}
ED.bar = function () { return $('#edBar'); };

/* ---------- 装配 ---------- */
ED.init = function (opts) {
  C = Object.assign({
    mode: 'data',            // data | dom
    selector: '[data-e]',    // 哪些元素可改
    exportMode: 'auto',      // auto | template | snapshot
    exportName: null,
    onChange: null,          // (path, value) 数据变了，宿主自己重绘
    onEnter: null, onExit: null,
    panels: null,            // 编辑模式下要一并显隐的面板选择器
    onDirty: null,           // (bool) 有未导出的改动 / 已导出
    toggleEditing: null,     // 宿主自己的编辑模式开关
    ui: true
  }, opts || {});
  DATA = C.data || root.DATA || null;
  if (C.mode === 'data' && !DATA) { console.error('[编辑台] data 模式必须传 data'); return ED; }
  if (ED._key == null) ED._key = lsKey(C.key);
  injectCSS();
  if (C.ui) buildBar();
  stalePrompt();
  if (C.mode === 'dom' && !ED._restored && C.autoRestore !== false) { ED.restoreDom(C.key); ED._restored = true; }
  return ED;
};

root.EditDesk = ED;
})(window);
