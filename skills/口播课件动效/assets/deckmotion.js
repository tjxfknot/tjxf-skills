/* ============================================================
   口播课件动效 · deckmotion.js
   ------------------------------------------------------------
   翻页课件的三件事：逐层浮现、数字滚上来、以及一堆兜底。
   无依赖，直接内联。CSS 由 init() 按配置生成，不用手写 delay。

   用法：
     DeckMotion.init({
       slide: '.slide',
       rise: ['.rank-title', '.rank-desc', {sel:'.card', stagger:.11}],
       roll: '.rank-title',
       editingClass: 'editing'
     });
     // 宿主每次翻页后调一次：
     DeckMotion.enter(slideEl);
   ============================================================ */
(function (root) {
  var M = {}, C = null, total = 0;

  var DEF = {
    slide: '.slide',
    active: 'active',
    doneClass: 'dm-done',
    rise: [],
    roll: null,
    dur: .72,            /* 单个元素的浮现时长（秒） */
    gap: .14,            /* 相邻层之间的间隔（秒） */
    lead: .06,           /* 第一层的起始延迟（秒） */
    shift: 26,           /* 从下方多少 px 浮上来 */
    blur: 5,             /* 起始模糊，0 就是不模糊 */
    ease: 'cubic-bezier(.2,.8,.25,1)',
    rollDur: 820,
    editingClass: 'editing',
    maxStagger: 8        /* 同级元素最多错开几个（nth-child 展开上限） */
  };

  function css(text) {
    var st = document.createElement('style');
    st.id = 'dmCSS'; st.setAttribute('data-ed-ui', '');   /* 编辑台导出时会剥掉带这个属性的节点 */
    st.textContent = text;
    document.head.appendChild(st);
  }

  function build() {
    var S = C.slide + '.' + C.active + ':not(.' + C.doneClass + ')';
    var out = ['@keyframes dmRise{from{opacity:0;transform:translateY(' + C.shift + 'px);' +
               (C.blur ? 'filter:blur(' + C.blur + 'px)' : '') + '}' +
               'to{opacity:1;transform:none;filter:none}}'];
    var sels = [], t = C.lead;

    C.rise.forEach(function (item) {
      var sel = typeof item === 'string' ? item : item.sel;
      var stag = (typeof item === 'object' && item.stagger) || 0;
      sels.push(S + ' ' + sel);
      if (stag) {
        for (var i = 1; i <= C.maxStagger; i++) {
          out.push(S + ' ' + sel + ':nth-child(' + i + '){animation-delay:' +
                   (t + (i - 1) * stag).toFixed(3) + 's}');
        }
        total = Math.max(total, t + (C.maxStagger - 1) * stag + C.dur);
        t += stag * 2 + C.gap;
      } else {
        out.push(S + ' ' + sel + '{animation-delay:' + t.toFixed(3) + 's}');
        total = Math.max(total, t + C.dur);
        t += C.gap;
      }
    });

    out.unshift(sels.join(',') + '{animation:dmRise ' + C.dur + 's ' + C.ease + ' both}');

    /* 编辑模式下整个关掉：不然每改一个字就闪一次 */
    out.push('body.' + C.editingClass + ' ' + C.slide + ' *,' +
             'body.' + C.editingClass + ' ' + C.slide +
             '{animation:none!important;opacity:1!important;transform:none!important;filter:none!important}');
    out.push('@media (prefers-reduced-motion:reduce){' + C.slide + '.' + C.active +
             ' *{animation:none!important}' + C.slide + '{transition:none!important}}');
    css(out.join('\n'));
  }

  /* ---------- 数字滚上来 ---------- */
  function roll(el) {
    if (!el) return;
    if (C.editingClass && document.body.classList.contains(C.editingClass)) return;
    var raw = el.innerHTML;
    var m = el.textContent.replace(/\s/g, '').match(/(\d[\d,]*)/);
    if (!m) return;
    var target = parseInt(m[1].replace(/,/g, ''), 10);
    if (!target || target > 1e7) return;
    /* 数字后面挂的单位（「分」「%」这类）原样留着，只滚数字 */
    var unit = el.querySelector('.unit, small');
    var tail = unit ? unit.outerHTML : '';
    var dur = C.rollDur, t0 = performance.now(), done = false, timer = null;

    function fin() {
      if (done) return;
      done = true;
      if (timer) clearInterval(timer);
      el.innerHTML = raw;                 /* 动画绝不留痕：原样贴回去 */
    }
    /* 用 setInterval 而不是 rAF —— 标签页不在前台时 rAF 一帧都不跑，
       数字会僵在起点；setInterval 顶多被限流，最后总能走完。25fps 够用。 */
    timer = setInterval(function () {
      if (done) return;
      var p = Math.min(1, (performance.now() - t0) / dur);
      if (p >= 1) { fin(); return; }
      el.innerHTML = Math.round(target * (1 - Math.pow(1 - p, 3))) + tail;
    }, 40);
    setTimeout(fin, dur + 600);
    el._dmRoll = fin;
  }

  /* ---------- 宿主翻页后调这个 ---------- */
  M.enter = function (slide) {
    if (!slide) return;
    slide.classList.remove(C.doneClass);
    clearTimeout(slide._dmT);
    /* 到点把动画整个卸掉。
       页面不在前台时 CSS 动画根本不播，而 fill-mode:both 会把元素摁在 from 态
       （opacity:0）—— 整页就白了。直播采集隐藏窗口、后台标签都会中招。
       这个超时是唯一能让内容露出来的保险，别删。 */
    slide._dmT = setTimeout(function () {
      slide.classList.add(C.doneClass);
    }, Math.round(total * 1000) + 600);
    if (C.roll) setTimeout(function () { roll(slide.querySelector(C.roll)); }, 120);
  };

  M.roll = roll;
  M.total = function () { return total; };

  M.init = function (opt) {
    C = {};
    for (var k in DEF) C[k] = DEF[k];
    for (var k2 in (opt || {})) C[k2] = opt[k2];
    build();
    return M;
  };

  root.DeckMotion = M;
})(window);
