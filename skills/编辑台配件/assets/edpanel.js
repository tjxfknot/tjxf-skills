/* 编辑台 · 可选层 ————————————————————————————————————————
   核心层只管「改字 / 存 / 导出」。这一层加的是：
     slider  参数滑块——拖着试大小，值写进 DATA，导出时一起带走
     list    条目清单——增、删、拖动排序、向右缩进编组
     keys    快捷键登记
   依赖 EditDesk（核心层）已装好。所有面板只在编辑模式下露面。
   —————————————————————————————————————————————————————— */
(function (root) {
'use strict';
if (!root.EditDesk) { console.error('[编辑台配件] 请先装核心层 editdesk.js'); return; }

var ED = root.EditDesk, P = {}, box = null, sliders = [], lists = [];

function el(t, c, x) { var n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

var CSS = [
  '#edPanel{position:fixed;right:14px;bottom:62px;z-index:99998;width:250px;max-height:72vh;overflow:auto;',
  'display:none;flex-direction:column;gap:12px;padding:13px;border-radius:12px;',
  'background:rgba(28,28,32,.93);backdrop-filter:blur(10px);border:1px solid rgba(128,128,128,.3);',
  'color:#e8e8ea;font:13px/1.5 system-ui,-apple-system,"PingFang SC",sans-serif}',
  'body.ed-editing #edPanel{display:flex}',
  '#edPanel .sec{display:flex;flex-direction:column;gap:6px}',
  '#edPanel .lab{display:flex;justify-content:space-between;align-items:baseline;opacity:.82;font-size:12px}',
  '#edPanel .lab b{font-weight:600;opacity:.95}',
  '#edPanel input[type=range]{width:100%;accent-color:#5b9dff}',
  '#edPanel .hd{display:flex;justify-content:space-between;align-items:center;font-size:12px;opacity:.82}',
  '#edPanel .hd button{padding:3px 9px;border-radius:6px;border:1px solid rgba(128,128,128,.4);',
  'background:transparent;color:inherit;cursor:pointer;font:inherit}',
  '#edPanel .rows{display:flex;flex-direction:column;gap:3px;max-height:38vh;overflow:auto}',
  '#edPanel .row{display:flex;align-items:center;gap:6px;padding:5px 7px;border-radius:7px;cursor:grab;',
  'background:rgba(255,255,255,.055);border:1px solid transparent}',
  '#edPanel .row:hover{background:rgba(255,255,255,.1)}',
  '#edPanel .row.over{border-color:#5b9dff}',
  '#edPanel .row.drag{opacity:.4}',
  '#edPanel .row.grp{margin-left:17px;background:rgba(91,157,255,.11)}',
  '#edPanel .row .nm{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '#edPanel .row .gi{font-size:11px;opacity:.6;flex:none}',
  '#edPanel .row .del{flex:none;opacity:.4;cursor:pointer;padding:0 3px}',
  '#edPanel .row .del:hover{opacity:1;color:#ff7a6b}',
  '#edPanel .tip{font-size:11px;opacity:.5;line-height:1.5}',
  '@media print{#edPanel{display:none!important}}'
].join('');

function panel() {
  if (box) return box;
  if (!document.getElementById('edPanelCSS')) {
    var st = el('style'); st.id = 'edPanelCSS'; st.textContent = CSS; document.head.appendChild(st);
  }
  box = el('div'); box.id = 'edPanel'; box.setAttribute('data-ed-ui', '');
  document.body.appendChild(box);
  return box;
}

/* ---------- 滑块 ————————————————————————————————
   拖的时候实时预览（onInput），松手才落盘（change→save）——
   不然每动一像素存一次，页面会卡。 */
P.slider = function (o) {
  var d = ED.data(), cur = ED.getP(o.path, d);
  if (typeof cur !== 'number') { cur = o.value != null ? o.value : (o.min + o.max) / 2; ED.setP(o.path, cur, d); }
  var wrap = el('div', 'sec'), lab = el('div', 'lab');
  var name = el('span', '', o.label), val = el('b');
  var fmt = o.format || function (v) { return Math.round(v * 100) + '%'; };
  lab.appendChild(name); lab.appendChild(val);
  var inp = el('input'); inp.type = 'range';
  inp.min = o.min != null ? o.min : 0.5; inp.max = o.max != null ? o.max : 2;
  inp.step = o.step != null ? o.step : 0.01; inp.value = cur;
  val.textContent = fmt(cur);
  inp.addEventListener('input', function () {
    var v = +inp.value; ED.setP(o.path, v, ED.data());
    val.textContent = fmt(v);
    if (o.onInput) o.onInput(v);
  });
  inp.addEventListener('change', function () { ED.save(); if (o.onDone) o.onDone(+inp.value); });
  wrap.appendChild(lab); wrap.appendChild(inp);
  panel().appendChild(wrap);
  var api = { el: wrap, input: inp, set: function (v) { inp.value = v; ED.setP(o.path, +v, ED.data()); val.textContent = fmt(+v); if (o.onInput) o.onInput(+v); } };
  sliders.push(api);
  return api;
};

/* ---------- 条目清单 ————————————————————————————————
   增删 + 拖动排序 + 往右拖一格 = 和上一条编成一组。
   宿主只需说清：数组在哪（path）、一行显示什么（label）、新增长什么样（blank）、改完怎么重绘（onApply）。 */
P.list = function (o) {
  var wrap = el('div', 'sec'), hd = el('div', 'hd'), rows = el('div', 'rows');
  var ttl = el('span'), add = el('button', '', o.addText || '＋ 新增');
  hd.appendChild(ttl); hd.appendChild(add);
  wrap.appendChild(hd); wrap.appendChild(rows);
  if (o.group !== false) { var tip = el('div', 'tip', '拖动排序；往右拖一格 = 和上一条编成一组'); wrap.appendChild(tip); }
  panel().appendChild(wrap);

  function arr() { var a = ED.getP(o.path(), ED.data()); return a || []; }
  function apply() { ED.save(); render(); if (o.onApply) o.onApply(); }

  function render() {
    var its = arr();
    ttl.textContent = (typeof o.title === 'function' ? o.title(its) : (o.title || '条目')) + ' · ' + its.length;
    var inG = its.map(function (it, i) { return i > 0 && !!it[o.groupKey || 'grp']; });
    var head = its.map(function (it, i) { return !inG[i] && !!inG[i + 1]; });
    rows.innerHTML = its.map(function (it, i) {
      var cls = inG[i] ? ' grp' : '';
      var size = 0; if (head[i]) { size = 1; while (inG[i + size]) size++; }
      var gi = head[i] ? size + ' 条一组' : (inG[i] ? '同组' : '');
      return '<div class="row' + cls + '" draggable="true" data-idx="' + i + '">' +
        '<span class="nm">' + esc(o.label ? o.label(it, i) : (it.name || '未命名')) + '</span>' +
        (gi ? '<span class="gi">' + gi + '</span>' : '') +
        '<span class="del" title="删掉这条">✕</span></div>';
    }).join('');
  }

  add.onclick = function () {
    var its = arr();
    its.push(o.blank ? o.blank(its.length) : { name: '新条目' });
    apply();
  };

  var dragIdx = null, dragX = 0;
  rows.addEventListener('dragstart', function (e) {
    var r = e.target.closest('.row'); if (!r) return;
    dragIdx = +r.dataset.idx; dragX = e.clientX; r.classList.add('drag');
    e.dataTransfer.effectAllowed = 'move';
  });
  rows.addEventListener('dragover', function (e) {
    e.preventDefault();
    var r = e.target.closest('.row'); if (!r) return;
    Array.prototype.forEach.call(rows.querySelectorAll('.row'), function (x) { x.classList.remove('over'); });
    r.classList.add('over');
  });
  rows.addEventListener('drop', function (e) {
    e.preventDefault();
    var r = e.target.closest('.row');
    Array.prototype.forEach.call(rows.querySelectorAll('.row'), function (x) { x.classList.remove('drag', 'over'); });
    if (dragIdx == null || !r) return;
    var to = +r.dataset.idx, its = arr(), gk = o.groupKey || 'grp';
    var moved = its.splice(dragIdx, 1)[0];
    its.splice(to, 0, moved);
    if (o.group !== false) {
      var dx = e.clientX - dragX;
      if (dx > 26) moved[gk] = true; else if (dx < -26) delete moved[gk];
      if (its.indexOf(moved) === 0) delete moved[gk];   // 头一条没法跟谁同组
    }
    dragIdx = null; apply();
  });
  rows.addEventListener('dragend', function () {
    Array.prototype.forEach.call(rows.querySelectorAll('.row'), function (x) { x.classList.remove('drag', 'over'); });
    dragIdx = null;
  });
  rows.addEventListener('click', function (e) {
    var r = e.target.closest('.row'); if (!r) return;
    var i = +r.dataset.idx, its = arr();
    if (e.target.classList.contains('del')) {
      var nm = o.label ? o.label(its[i], i) : (its[i].name || '这条');
      if (!confirm('删掉「' + ED.plain(nm) + '」？')) return;
      its.splice(i, 1);
      if (its[0]) delete its[0][o.groupKey || 'grp'];
      apply(); return;
    }
    if (o.onPick) o.onPick(its[i], i);
  });

  var api = { el: wrap, render: render };
  lists.push(api); render();
  return api;
};

/* 数据被外部换掉（切换梯队、整树重建）后，让面板跟上 */
P.refresh = function () { lists.forEach(function (l) { l.render(); }); };

/* ---------- 快捷键 ————————————————————————————————
   在输入框/可编辑区里一律不抢键。 */
P.keys = function (map) {
  document.addEventListener('keydown', function (e) {
    if (e.target && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var fn = map[e.key];
    if (fn) { e.preventDefault(); fn(e); }
  });
};

P.panel = panel;
root.EditDeskPanel = P;
})(window);
