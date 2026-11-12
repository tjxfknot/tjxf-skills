/* 编辑台 · 格式条 ————————————————————————————————————————
   选中一段文字，头顶浮出一条 Word 式的工具条：字体 / 字号 / 颜色 / 加粗。
   两种作用范围：「这一处」写进 DATA.ov[数据路径]，「同类全改」写进 DATA.sty[类名]。
   依赖 EditDesk（核心层）。只在编辑模式下露面，导出时自动剥掉。

   宿主要做的三件事：
   1. 每个可改的文字块打两个属性：data-e="数据路径"（核心层用）、data-sty="类名"（本层用）
   2. CSS 里这几类文字的字号/颜色/字体/粗细走变量：
        font-size:calc(var(--sz-ev,26px) * var(--fs)); color:var(--col-ev,var(--ink2));
        font-family:var(--ff-ev,inherit); font-weight:var(--fw-ev,400);
   3. init 时把类名表交进来：{ ev:{nm:'事件正文', sz:26}, … }
   —————————————————————————————————————————————————————— */
(function (root) {
'use strict';
if (!root.EditDesk) { console.error('[格式条] 请先装核心层 editdesk.js'); return; }

var ED = root.EditDesk, F = {}, C = null, bar = null, target = null, scope = 'one';

var FONTS = [
  ['', '字体'],
  ['"PingFang SC","Microsoft YaHei",sans-serif', '黑体'],
  ['"Songti SC","SimSun",serif', '宋体'],
  ['"Kaiti SC","KaiTi",serif', '楷体'],
  ['"Yuanti SC","YouYuan",sans-serif', '圆体'],
  ['"DengXian","Microsoft YaHei",sans-serif', '等线']
];

var CSS = [
  '#edFmt{position:fixed;z-index:99999;display:none;align-items:center;gap:8px;',
  'padding:7px 10px;border-radius:12px;background:rgba(30,32,38,.95);backdrop-filter:blur(10px);',
  'border:1px solid rgba(140,140,150,.34);box-shadow:0 12px 34px rgba(0,0,0,.5);',
  'font:13px/1.4 system-ui,-apple-system,"PingFang SC",sans-serif;color:#eceef2}',
  '#edFmt.on{display:flex}',
  '#edFmt select,#edFmt button,#edFmt input[type=color]{font:inherit;color:inherit;',
  'background:rgba(255,255,255,.08);border:1px solid rgba(140,140,150,.3);border-radius:7px;',
  'padding:4px 7px;cursor:pointer}',
  '#edFmt button:hover,#edFmt select:hover{background:rgba(255,255,255,.16)}',
  '#edFmt button.on{background:#3d7ddd;border-color:#5b9dff;color:#fff}',
  '#edFmt input[type=color]{width:34px;height:27px;padding:2px}',
  '#edFmt .sz{display:flex;align-items:center;gap:4px}',
  '#edFmt .sz b{min-width:30px;text-align:center;font-weight:600;font-variant-numeric:tabular-nums}',
  '#edFmt .sp{width:1px;height:22px;background:rgba(140,140,150,.32)}',
  '#edFmt .tgt{max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.7;font-size:12px}',
  '@media print{#edFmt{display:none!important}}'
].join('');

function build() {
  if (!document.getElementById('edFmtCSS')) {
    var st = document.createElement('style'); st.id = 'edFmtCSS'; st.textContent = CSS;
    document.head.appendChild(st);
  }
  bar = document.createElement('div'); bar.id = 'edFmt'; bar.setAttribute('data-ed-ui', '');
  bar.innerHTML =
    '<span class="tgt"></span><span class="sp"></span>' +
    '<select class="ff">' + (C.fonts || FONTS).map(function (f) {
      return '<option value=\'' + f[0] + '\'>' + f[1] + '</option>';
    }).join('') + '</select>' +
    '<span class="sz"><button class="dec" title="小一点">A−</button><b>16</b>' +
    '<button class="inc" title="大一点">A+</button></span>' +
    '<button class="bold" title="加粗">B</button>' +
    '<input type="color" class="col" title="文字颜色">' +
    '<button class="clr" title="恢复默认">⟲</button>' +
    '<span class="sp"></span><button class="scope" title="改这一处，还是改全页同类文字">这一处</button>';
  document.body.appendChild(bar);

  bar.addEventListener('mousedown', function (e) {          // 别让工具条抢走选区
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') e.preventDefault();
  });
  bar.querySelector('.inc').onclick = function () { set('sz', Math.min(200, Math.round(eff().sz) + 2)); };
  bar.querySelector('.dec').onclick = function () { set('sz', Math.max(8, Math.round(eff().sz) - 2)); };
  bar.querySelector('.bold').onclick = function () { set('b', eff().b ? null : true); };
  bar.querySelector('.ff').onchange = function (e) { set('ff', e.target.value || null); };
  bar.querySelector('.col').oninput = function (e) { set('col', e.target.value); };
  bar.querySelector('.clr').onclick = function () {
    if (!target) return;
    var d = ED.data();
    if (scope === 'one') delete d[C.ovKey][ovKey(target)];
    else delete d[C.styKey][target.getAttribute('data-sty')];
    F.apply(); ED.save(); sync();
  };
  bar.querySelector('.scope').onclick = function () { scope = scope === 'one' ? 'all' : 'one'; sync(); };
}

function kindOf(el) { return el.getAttribute('data-sty'); }
/* 同一条数据可能同时出现在两处（比如卡片大标题和环上的小牌子），
   所以「这一处」的键要带上类名，不然改一个会连累另一个 */
function ovKey(el) { return el.getAttribute('data-e') + '#' + kindOf(el); }
function eff() {
  if (!target) return { sz: 16 };
  var d = ED.data(), k = kindOf(target);
  var all = d[C.styKey][k] || {}, one = d[C.ovKey][ovKey(target)] || {};
  var base = { sz: (C.kinds[k] && C.kinds[k].sz) || 16 };
  var out = {}, src = scope === 'one' ? [base, all, one] : [base, all];
  src.forEach(function (o) { Object.keys(o).forEach(function (x) { out[x] = o[x]; }); });
  return out;
}
function set(key, val) {
  if (!target) return;
  var d = ED.data(), bag;
  if (scope === 'one') {
    var p = ovKey(target);
    bag = d[C.ovKey][p] = d[C.ovKey][p] || {};
  } else {
    var k = kindOf(target);
    bag = d[C.styKey][k] = d[C.styKey][k] || {};
  }
  if (val === null || val === '') delete bag[key]; else bag[key] = val;
  if (scope === 'one' && !Object.keys(bag).length) delete d[C.ovKey][ovKey(target)];
  F.apply(); ED.save(); sync();
}

/* 类样式写到 :root 的变量上；「这一处」写成元素自己的 inline */
F.apply = function () {
  var d = ED.data(), rt = document.documentElement;
  Object.keys(C.kinds).forEach(function (k) {
    var v = (d[C.styKey] || {})[k] || {}, K = C.kinds[k];
    rt.style.setProperty('--sz-' + k, (v.sz || K.sz) + 'px');
    v.col ? rt.style.setProperty('--col-' + k, v.col) : rt.style.removeProperty('--col-' + k);
    v.ff ? rt.style.setProperty('--ff-' + k, v.ff) : rt.style.removeProperty('--ff-' + k);
    v.b ? rt.style.setProperty('--fw-' + k, '700') : rt.style.removeProperty('--fw-' + k);
    if (C.onVars) C.onVars(k, v, rt);          // 宿主还有联动变量（比如展开态另一套）
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-sty]'), function (el) {
    F.applyOne(el);
  });
};
F.applyOne = function (el) {
  if (!C) return;                                  // 还没 init（宿主先渲染后装配）就先不管
  var o = (ED.data()[C.ovKey] || {})[ovKey(el)];
  el.style.fontSize = ''; el.style.color = ''; el.style.fontFamily = ''; el.style.fontWeight = '';
  if (!o) return;
  if (o.sz) el.style.fontSize = C.szExpr ? C.szExpr(o.sz) : (o.sz + 'px');
  if (o.col) el.style.color = o.col;
  if (o.ff) el.style.fontFamily = o.ff;
  if (o.b) el.style.fontWeight = '700';
};

function sync() {
  if (!target) return;
  var v = eff(), k = kindOf(target);
  bar.querySelector('.tgt').textContent = (C.kinds[k] && C.kinds[k].nm) || k;
  bar.querySelector('.sz b').textContent = Math.round(v.sz);
  bar.querySelector('.ff').value = v.ff || '';
  bar.querySelector('.bold').classList.toggle('on', !!v.b);
  bar.querySelector('.col').value = v.col || '#c8d2de';
  var sc = bar.querySelector('.scope');
  sc.textContent = scope === 'one' ? '这一处' : '同类全改';
  sc.classList.toggle('on', scope === 'all');
}
function showAt(rect) {
  bar.classList.add('on');
  var w = bar.offsetWidth || 520, h = bar.offsetHeight || 40;
  var x = rect.left + rect.width / 2 - w / 2, y = rect.top - h - 12;
  if (y < 8) y = rect.bottom + 12;
  bar.style.left = Math.max(8, Math.min(innerWidth - w - 8, x)) + 'px';
  bar.style.top = Math.max(8, Math.min(innerHeight - h - 8, y)) + 'px';
}
F.hide = function () { if (bar) bar.classList.remove('on'); target = null; };
F.update = function () {
  if (!ED.isEditing()) { F.hide(); return; }
  var sel = getSelection(), node = sel && sel.anchorNode;
  var el = node && (node.nodeType === 1 ? node : node.parentElement);
  var t = el && el.closest && el.closest('[data-sty]');
  if (!t) { F.hide(); return; }
  target = t;
  var r = (sel.rangeCount && !sel.isCollapsed) ? sel.getRangeAt(0).getBoundingClientRect()
                                              : t.getBoundingClientRect();
  showAt(r); sync();
};

F.init = function (o) {
  C = Object.assign({ kinds: {}, styKey: 'sty', ovKey: 'ov', szExpr: null, onVars: null, fonts: null }, o || {});
  var d = ED.data();
  if (!d[C.styKey]) d[C.styKey] = {};
  if (!d[C.ovKey]) d[C.ovKey] = {};
  build();
  F.apply();
  document.addEventListener('mouseup', function (e) {
    if (bar && bar.contains(e.target)) return;
    setTimeout(F.update, 0);
  });
  document.addEventListener('keyup', function (e) {
    if (e.target && e.target.isContentEditable) setTimeout(F.update, 0);
  });
  root.addEventListener('editdesk:mode', function (e) { if (!e.detail.editing) F.hide(); });
  return F;
};

root.EditDeskFmt = F;
})(window);
