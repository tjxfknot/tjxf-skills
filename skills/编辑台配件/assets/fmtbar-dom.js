/* ============================================================
   编辑台配件 · 格式条（dom 模式）
   ------------------------------------------------------------
   跟 fmtbar.js 的分工：
     fmtbar.js      data 模式。改 CSS 变量，宿主的 CSS 必须写成 var(--sz-xxx)。
     fmtbar-dom.js  dom 模式。直接写元素 inline style，宿主零配合。

   三档作用域（工具条最左边那个按钮循环切换）：
     sel  改选中的那几个字 —— 包一层 span.ed-fmt，连续调整时复用同一个 span，
          所以点完「减小」选区还在，可以一直点（旧实现每次 replaceWith 都把选区弄丢）
     one  改光标所在的这一块 —— 写元素 inline style，压根不碰选区
     all  改全篇同类文字 —— 同一种 class 的一起改

   持久化靠 editdesk.js 的 dom 模式（它会连 [data-e] 元素的 style 一起存）。
   ============================================================ */
(function (root) {
  var ED = root.EditDesk;
  if (!ED) { console.error('[格式条] 要先装 editdesk.js'); return; }

  var F = {}, C = null, bar = null;
  var SCOPE = 'sel', target = null, savedRange = null;
  var SCOPES = ['sel', 'one', 'all'];
  var FONTS = [
    { v: '', n: '字体…' },
    { v: '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif', n: '系统默认' },
    { v: '"PingFang SC", sans-serif', n: '苹方' },
    { v: '"Songti SC", serif', n: '宋体' },
    { v: '"Kaiti SC", KaiTi, serif', n: '楷体' },
    { v: '"Microsoft YaHei", sans-serif', n: '雅黑' },
    { v: 'Georgia, serif', n: 'Georgia' },
    { v: 'ui-monospace, Menlo, monospace', n: '等宽' }
  ];

  function $(q, r) { return (r || document).querySelector(q); }
  function $$(q, r) { return [].slice.call((r || document).querySelectorAll(q)); }
  function box() { return (C.container ? $(C.container) : null) || document.body; }
  function toast(m) { ED.toast ? ED.toast(m) : console.log(m); }

  /* ---------- 同类识别 ---------- */
  function kindOf(el) {
    if (!el) return null;
    if (el.dataset && el.dataset.sty) return el.dataset.sty;      // 宿主指定优先
    var cs = String(el.className || '').split(/\s+/);
    for (var i = 0; i < cs.length; i++) {
      if (!cs[i]) continue;
      if (C.kinds) { if (C.kinds[cs[i]]) return cs[i]; }
      else if (!/^(ed-|is-|active|prev|anim)$/.test(cs[i])) return cs[i];
    }
    return el.tagName.toLowerCase();
  }
  function kindName(k) { return (C.kinds && C.kinds[k]) || k || '这一类'; }
  function sameKind(k) {
    if (!k) return [];
    return $$('[data-e]', box()).filter(function (n) { return kindOf(n) === k; });
  }

  /* ---------- 选区 ---------- */
  function liveRange() {
    var s = root.getSelection();
    if (s.rangeCount && !s.getRangeAt(0).collapsed) return s.getRangeAt(0);
    if (savedRange && !savedRange.collapsed) return savedRange;
    return null;
  }
  /* 选区正好整段覆盖某个已有的格式 span？是就直接改它，免得层层嵌套 */
  function fmtHost(r) {
    var n = r.startContainer, el = n.nodeType === 1 ? n : n.parentNode;
    var host = el && el.closest ? el.closest('span.ed-fmt') : null;
    if (!host) return null;
    var t = document.createRange(); t.selectNodeContents(host);
    return (r.compareBoundaryPoints(Range.START_TO_START, t) === 0 &&
            r.compareBoundaryPoints(Range.END_TO_END, t) === 0) ? host : null;
  }
  function wrapSel(fn) {
    var r = liveRange();
    if (!r) { toast('先选中要改的文字，或把范围切到「这一处」'); return false; }
    var span = fmtHost(r);
    if (!span) {
      span = document.createElement('span');
      span.className = 'ed-fmt';
      try { span.appendChild(r.extractContents()); r.insertNode(span); }
      catch (e) { toast('这段跨了标签，选小一点再试'); return false; }
    }
    fn(span);
    var nr = document.createRange();
    nr.selectNodeContents(span);
    var s = root.getSelection();
    s.removeAllRanges(); s.addRange(nr);
    savedRange = nr.cloneRange();          /* ← 把选区放回去，可以接着点 */
    done();
    return true;
  }

  function done() {
    try { ED.save(); } catch (e) { }
    if (C.onChange) C.onChange(SCOPE, target);
  }

  /* ---------- 落样式 ---------- */
  F.apply = function (props) {
    if (SCOPE === 'sel') {
      return wrapSel(function (sp) {
        for (var k in props) sp.style[k] = props[k] === null ? '' : props[k];
      });
    }
    if (!target) { toast('先点一下要改的文字'); return false; }
    var list = SCOPE === 'all' ? sameKind(kindOf(target)) : [target];
    if (!list.length) list = [target];
    list.forEach(function (n) {
      for (var k in props) n.style[k] = props[k] === null ? '' : props[k];
    });
    done();
    if (SCOPE === 'all') toast('已改全篇「' + kindName(kindOf(target)) + '」共 ' + list.length + ' 处');
    return true;
  };

  function curEl() {
    if (SCOPE === 'sel') {
      var r = liveRange();
      if (r) {
        var h = fmtHost(r); if (h) return h;
        var n = r.startContainer;
        return n.nodeType === 1 ? n : n.parentNode;
      }
    }
    return target;
  }
  function curSize() {
    var el = curEl();
    return el ? (Math.round(parseFloat(getComputedStyle(el).fontSize)) || 16) : 16;
  }

  F.clear = function () {
    if (SCOPE === 'sel') {
      var r = liveRange();
      if (!r) { toast('先选中要清的文字'); return; }
      var s = root.getSelection(); s.removeAllRanges(); s.addRange(r);
      document.execCommand('removeFormat', false, null);
      document.execCommand('hiliteColor', false, 'transparent');
      done(); return;
    }
    if (!target) { toast('先点一下要清的文字'); return; }
    var list = SCOPE === 'all' ? sameKind(kindOf(target)) : [target];
    if (SCOPE === 'all' && !confirm('清掉全篇「' + kindName(kindOf(target)) +
        '」共 ' + list.length + ' 处的自定义格式？')) return;
    list.forEach(function (n) {
      n.removeAttribute('style');
      $$('span.ed-fmt', n).forEach(function (sp) { sp.replaceWith.apply(sp, sp.childNodes); });
    });
    done();
    toast('已清掉 ' + list.length + ' 处的自定义格式');
  };

  F.setScope = function (s) { if (SCOPES.indexOf(s) >= 0) { SCOPE = s; sync(); } };
  F.state = function () {
    var k = kindOf(target);
    return { scope: SCOPE, target: target, kind: k, count: SCOPE === 'all' ? sameKind(k).length : 1 };
  };

  /* ---------- 自带工具条 ---------- */
  var CSS =
    '#edFmt{position:fixed;top:14px;left:50%;transform:translateX(-50%) translateY(-140%);z-index:99997;' +
    'display:flex;gap:6px;align-items:center;padding:7px 9px;border-radius:12px;' +
    'background:#fff;border:1px solid rgba(0,0,0,.1);box-shadow:0 8px 30px rgba(0,0,0,.14);' +
    'font:500 13px/1 -apple-system,"PingFang SC",sans-serif;color:#222;transition:transform .22s}' +
    'body.ed-editing #edFmt{transform:translateX(-50%) translateY(0)}' +
    '#edFmt button{appearance:none;font:inherit;cursor:pointer;background:#f4f4f1;border:1px solid rgba(0,0,0,.08);' +
    'border-radius:8px;height:30px;min-width:30px;padding:0 8px;color:#222}' +
    '#edFmt button:hover{background:#e9e9e4}' +
    '#edFmt button.on{background:#222;color:#fff;border-color:#222}' +
    '#edFmt .sc{font-weight:700;min-width:126px;white-space:nowrap}' +
    '#edFmt .sc.all{background:#c8503c;color:#fff;border-color:#c8503c}' +
    '#edFmt select,#edFmt input[type=number]{font:inherit;height:30px;border-radius:8px;' +
    'border:1px solid rgba(0,0,0,.12);background:#fff;color:#222;padding:0 6px}' +
    '#edFmt input[type=number]{width:56px;text-align:center}' +
    '#edFmt input[type=color]{width:30px;height:30px;padding:2px;border:1px solid rgba(0,0,0,.12);' +
    'border-radius:8px;background:#fff;cursor:pointer}' +
    '#edFmt .sep{width:1px;height:20px;background:rgba(0,0,0,.1);margin:0 2px}';

  function build() {
    var st = document.createElement('style');
    st.id = 'edFmtCSS'; st.setAttribute('data-ed-ui', ''); st.textContent = CSS;
    document.head.appendChild(st);

    bar = document.createElement('div');
    bar.id = 'edFmt'; bar.setAttribute('data-ed-ui', '');
    bar.innerHTML =
      '<button class="sc" title="点一下换范围：选中的字 / 这一处 / 全篇同类">范围：选中的字</button>' +
      '<span class="sep"></span>' +
      '<select class="ff">' + (C.fonts || FONTS).map(function (f) {
        return '<option value="' + f.v + '">' + f.n + '</option>';
      }).join('') + '</select>' +
      '<button class="dec" title="减小字号">A−</button>' +
      '<input type="number" class="sz" min="8" max="200" step="1" value="16">' +
      '<button class="inc" title="增大字号">A＋</button>' +
      '<span class="sep"></span>' +
      '<button class="b" title="加粗"><b>B</b></button>' +
      '<input type="color" class="col" value="#222222" title="文字颜色">' +
      '<input type="color" class="bg" value="#fff3c4" title="底色">' +
      '<button class="clr" title="清除格式">⌫</button>';
    document.body.appendChild(bar);

    bar.addEventListener('mousedown', function (e) {          // 别让工具条抢走选区
      if (e.target.tagName === 'BUTTON') e.preventDefault();
    });
    bar.querySelector('.sc').onclick = function () {
      SCOPE = SCOPES[(SCOPES.indexOf(SCOPE) + 1) % SCOPES.length]; sync();
    };
    bar.querySelector('.dec').onclick = function () { setSize(curSize() - 2); };
    bar.querySelector('.inc').onclick = function () { setSize(curSize() + 2); };
    bar.querySelector('.sz').onchange = function (e) { setSize(parseInt(e.target.value, 10) || 16); };
    bar.querySelector('.ff').onchange = function (e) {
      if (e.target.value) F.apply({ fontFamily: e.target.value });
      e.target.value = '';
    };
    bar.querySelector('.col').oninput = function (e) { F.apply({ color: e.target.value }); };
    bar.querySelector('.bg').oninput = function (e) { F.apply({ background: e.target.value }); };
    bar.querySelector('.clr').onclick = function () { F.clear(); };
    bar.querySelector('.b').onclick = function () {
      if (SCOPE === 'sel') {
        var r = liveRange();
        if (!r) { toast('先选中要改的文字，或把范围切到「这一处」'); return; }
        var s = root.getSelection(); s.removeAllRanges(); s.addRange(r);
        document.execCommand('bold', false, null); done(); sync(); return;
      }
      if (!target) { toast('先点一下要改的文字'); return; }
      /* 取消时不能只清 inline —— 这类文字的 CSS 本身可能就是粗体，清了看不出变化 */
      var cur = target.style.fontWeight || getComputedStyle(target).fontWeight;
      F.apply({ fontWeight: parseInt(cur, 10) >= 700 ? '400' : '900' });
      sync();
    };
  }

  function setSize(px) {
    px = Math.max(8, Math.min(200, px | 0));
    if (bar) bar.querySelector('.sz').value = px;
    F.apply({ fontSize: px + 'px' });
  }

  function sync() {
    if (!bar) return;
    var sc = bar.querySelector('.sc'), k = kindOf(target);
    sc.textContent = SCOPE === 'sel' ? '范围：选中的字'
      : SCOPE === 'one' ? '范围：这一处'
      : '范围：同类 · ' + kindName(k) + (k ? '（' + sameKind(k).length + '）' : '');
    sc.classList.toggle('all', SCOPE === 'all');
    var el = curEl();
    if (el) bar.querySelector('.sz').value = Math.round(parseFloat(getComputedStyle(el).fontSize)) || 16;
    try { bar.querySelector('.b').classList.toggle('on', SCOPE === 'sel' && document.queryCommandState('bold')); }
    catch (e) { }
  }

  document.addEventListener('selectionchange', function () {
    if (!ED.isEditing()) return;
    var s = root.getSelection(), n = s.anchorNode;
    if (!n) return;
    var el = n.nodeType === 1 ? n : n.parentElement;
    if (!el || !el.closest || !el.closest('[contenteditable="true"]')) return;
    if (s.rangeCount && !s.isCollapsed) savedRange = s.getRangeAt(0).cloneRange();
    var host = el.closest('[data-e]');
    if (host) target = host;
    sync();
  });

  F.init = function (opt) {
    C = opt || {};
    if (C.ui !== false) build();
    sync();
    return F;
  };
  root.EditDeskFmtDom = F;
})(window);
