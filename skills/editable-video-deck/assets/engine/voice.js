/*EVD_VOICE_START*/
/* 语音跟读（0.5.0）：主播照原稿讲，讲到哪张卡就出哪张，不用人按键。整体接管骨架里旧的「现场语音推进 · 试用」。
   旧版在拍摄里用不了（2026-10-23 实测：念完同济前 4 页原稿一下没翻）：整句说完才对触发词（晚 8 秒以上）、只认下一条（漏一条就卡死）、
   停顿几秒浏览器报 no-speech 就关麦、手动按一下就停、默认的本机识别没装中文包直接报错、联网识别要能连谷歌。
   做法：
   ① 原稿定位：sourceSegments 里“口播…”段拼成全文（去标点、中文数字转阿拉伯数字），识别结果最后十几个字在当前位置附近模糊对齐（容同音错字），位置只进不退；
   ② 每个讲解动作（翻页、出卡、高亮）在原稿里有触发点：翻页＝本页第一段口播的开头；出卡＝卡片触发词或标题词在本页口播里第一次出现；
      本页没有口播的，出卡只认和标题有关的词；都找不到就紧跟上一条（编辑台「原稿」页的触发表里标黄，可补触发词）；
   ③ 边说边认，不等整句说完；落后几条依次补上（每条间隔 0.45 秒，落后太多直接跳到位）；翻页后至少停 1.5 秒；手动按键随时接管，之后从新位置接着跟；
   ④ 识别断了自动重连；本机识别（Chrome 自带，离线、音频不出电脑）优先，第一次自动下载中文识别包；没原稿的课件退回按触发词／标题词认。
   测试钩子：window.__vf（start / stop / feed / state / steps / rehearse）。 */
(function () {
  if (typeof DATA === 'undefined' || typeof render !== 'function' || typeof EditDesk === 'undefined') return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const $q = s => document.querySelector(s);
  const plain = s => (EditDesk.plain ? EditDesk.plain(s) : String(s || '').replace(/<[^>]*>/g, ''));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // 点完按钮把焦点移走：不然焦点留在按钮上，按空格想手动推进会变成再点一次按钮（把跟读关了），按 F 也进不了拍摄模式
  const unfocus = () => { const a = document.activeElement; if (a && a !== document.body && a.blur && !a.closest('input,select,textarea,[contenteditable="true"]')) a.blur(); };
  const GAP = 400, DWELL = 1000, JUMP = 3, WIN = 700;
  const KEY = ((typeof DECK !== 'undefined' && DECK.key) || 'deck') + '-voice-follow';

  // ---------- 归一与对齐 ----------
  const DIG = { '零': 0, '〇': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
  function num(w) {
    if (!/[十百千]/.test(w)) return [...w].map(c => DIG[c]).join('');
    let t = 0, n = 0;
    for (const c of w) { if (c in DIG) n = DIG[c]; else { t += (n || 1) * ({ '十': 10, '百': 100, '千': 1000 }[c]); n = 0; } }
    return String(t + n);
  }
  // 中文数字转阿拉伯数字，全半角、大小写统一，去标点空白；逐字做，withMap 时 map[i]＝第 i 个字在原文里的位置（标黄稿显示原文要用）
  function norm(s, withMap) {
    s = String(s || '');
    let out = ''; const map = [];
    const re = /[零〇一二两三四五六七八九十百千]+|[\s\S]/gu; let m;
    while ((m = re.exec(s))) {
      const w = m[0];
      if (/^[零〇一二两三四五六七八九十百千]+$/.test(w)) { for (const ch of num(w)) { out += ch; map.push(m.index); } continue; }
      const n = w.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
      for (let k = 0; k < n.length; k++) { out += n[k]; map.push(m.index); }
    }
    return withMap ? { s: out, map, src: s } : out;
  }
  // 读音：汉字转成不带声调的拼音再比（0.5.3，用户 10-24 实测：同音字一多就对不上、停在原地）。
  // 同一个音＝不算错；平翘舌、前后鼻音、n/l 这类口音差别＝算 0.35 个错；其他字＝1 个错。拼音表在 pinyin.js（window.__EVD_PY）
  let PY = null;
  const fuzzyPy = y => y.replace(/^zh/, 'z').replace(/^ch/, 'c').replace(/^sh/, 's').replace(/^n(?=[aeiouv])/, 'l').replace(/ang$/, 'an').replace(/eng$/, 'en').replace(/ing$/, 'in');
  function pyInit() {
    if (PY) return PY;
    PY = { ch: new Map(), fz: [] }; const fzIdx = {};
    String(window.__EVD_PY || '').split('|').forEach((g, i) => {
      const k = g.indexOf(':'); if (k < 0) return;
      const f = fuzzyPy(g.slice(0, k)); if (!(f in fzIdx)) fzIdx[f] = Object.keys(fzIdx).length;
      PY.fz[i] = fzIdx[f]; for (const c of g.slice(k + 1)) PY.ch.set(c, i);
    });
    return PY;
  }
  function tk(s) {
    const P = pyInit(), n = s.length, t = new Int32Array(n), f = new Int32Array(n);
    for (let i = 0; i < n; i++) { const c = s[i], k = P.ch.get(c); if (k != null) { t[i] = 100000 + k; f[i] = 200000 + P.fz[k]; } else t[i] = f[i] = c.charCodeAt(0); }
    return { t, f, length: n };
  }
  // hay 里按读音（模糊音也算）第一次出现 needle 的位置，没有就 -1
  function pyIndex(hay, needle) {
    const i0 = hay.indexOf(needle); if (i0 >= 0) return i0;
    const H = tk(hay), N = tk(needle);
    outer: for (let i = 0; i + N.length <= H.length; i++) { for (let j = 0; j < N.length; j++) if (H.f[i + j] !== N.f[j]) continue outer; return i; }
    return -1;
  }
  // 在 S[lo,hi) 里找与 Q 最像的一段（开头随意，Q、S 都是 tk() 的读音序列）。first=k 时返回第一个代价≤k 的位置，否则返回最优（同代价取 pos 往后最近）
  function align(Q, S, lo, hi, pos, first) {
    if (typeof Q === 'string') Q = tk(Q);
    const m = Q.length; if (!m) return null;
    lo = Math.max(0, lo); hi = Math.min(S.length, hi); if (hi <= lo) return null;
    const col = new Float64Array(m + 1); for (let i = 0; i <= m; i++) col[i] = i;
    const qt = Q.t, qf = Q.f, st = S.t, sf = S.f;
    let best = null;
    for (let j = lo; j < hi; j++) {
      const t = st[j], f = sf[j]; let diag = col[0]; col[0] = 0;
      for (let i = 1; i <= m; i++) { const up = col[i]; const sub = qt[i - 1] === t ? 0 : qf[i - 1] === f ? 0.35 : 1; const v = Math.min(diag + sub, up + 1, col[i - 1] + 1); diag = up; col[i] = v; }
      const c = col[m], end = j + 1;
      if (first != null) { if (c <= first) return { end, cost: c }; continue; }
      const sc = c + (end >= pos ? (end - pos) / (hi - pos + 1) * 0.9 : 1.5 + (pos - end) / 50);
      if (!best || sc < best.sc) best = { end, cost: c, sc };
    }
    return best;
  }
  const maxCost = n => Math.floor(n * 0.28);

  // ---------- 原稿与触发点 ----------
  function buildScript() {
    const ids = new Set(DATA.pages.map(p => p.id));
    const segs = (DATA.sourceSegments || []).filter(s => /^口播/.test(s.disposition || '') && s.text);
    const T = { S: '', src: '', map: [], owner: [], sent: [], clause: [], bounds: [] };
    for (const seg of segs) {
      const txt = String(seg.text).replace(/【[^】]*】/g, ' ');
      const n = norm(txt, true); if (!n.s) continue;
      const start = T.S.length, base = T.src.length, own = ids.has(seg.screenId) ? seg.screenId : null;
      for (let k = 0; k < n.s.length; k++) {
        const gap = k ? n.src.slice(n.map[k - 1] + 1, n.map[k]) : '。';
        if (/[。！？!?；;…\n]/.test(gap)) T.sent.push(start + k);
        if (/[。！？!?；;…\n，,、：:／/—]/.test(gap)) T.clause.push(start + k);
        T.map.push(base + n.map[k]); T.owner.push(own);
      }
      T.S += n.s; T.src += n.src + '\n';
      T.bounds.push({ id: seg.id, screen: own, start, end: T.S.length, srcStart: base, srcEnd: base + n.src.length });
    }
    T.tk = tk(T.S);
    return T;
  }
  const nextSent = (T, x) => { for (const s of T.sent) if (s > x) return s; return T.S.length; };
  const clauseStart = (T, x) => { let r = 0; for (const s of T.clause) { if (s > x) break; r = s; } return r; };

  // 一张卡（或一个高亮）的候选词：触发词 → 标题 → 标题词（同页多张卡共有的词不算）
  function cands(g, h, generic) {
    const list = [], title = norm(plain(g.title));
    const add = (t, src, rel) => { const n = norm(t); if (n.length >= 2 && !list.some(x => x.n === n)) list.push({ n, src, raw: String(t).trim(), rel: rel || (n.length >= 3 && (title.includes(n) || n.includes(title))) }); };
    if (h) { (h.phrases || []).forEach(p => add(p, '短语')); (h.terms || []).forEach(p => add(p, '词', true)); return list; }
    (g.cue && g.cue.phrases || []).forEach(p => add(p, '短语'));
    const t = plain(g.title).replace(/\s+/g, ' ').trim();
    if (title.length >= 2 && title.length <= 14) add(t, '标题', true);
    for (const part of titleParts(t)) if (!generic.has(norm(part))) add(part, '标题词', true);
    return list;
  }
  const titleParts = t => t.split(/[（）()【】\[\]、，,：:；;｜|\/·\s—–]+/).filter(p => norm(p).length >= 3);

  // 找最早出现的候选：只在本页口播或没分给任何页的口播里找；本页没有口播的，可以在别页口播里找“和标题有关”的词
  function findOcc(T, list, lo, hi, pid, ownSegs) {
    let best = null;
    const ok = (at, c) => { const ow = T.owner[at]; return ow == null || ow === pid || (!ownSegs && c.rel); };
    for (const c of list) {
      let from = lo;
      for (;;) { const at = T.S.indexOf(c.n, from); if (at < 0 || at >= hi) break; if (ok(at, c)) { if (!best || at < best.at) best = { at, len: c.n.length, c }; break; } from = at + 1; }
    }
    if (best) return best;
    for (const c of list) {
      if (c.n.length < 5) continue;
      let from = lo;
      for (let tries = 0; tries < 8; tries++) {
        const r = align(c.n, T.tk, from, hi, from, 1); if (!r) break;
        const at = Math.max(lo, r.end - c.n.length);
        if (ok(at, c)) { if (!best || at < best.at) best = { at, len: r.end - at, c, fuzzy: true }; break; }
        from = r.end;
      }
    }
    return best;
  }

  // 标黄稿里手动标的位置存在 DATA.voiceMarks：键＝页id/卡id（翻页是 页id/_turn，高亮加 /hN），值＝{seg 段落id, off 段内位置, len, text} 或 {follow:true}
  const markKey = (p, g, d) => p.id + '/' + (g ? g.id : '_turn') + (d ? '/h' + d : '');
  function markAt(T, mk, lo) {
    if (!mk || mk.follow || !mk.text) return null;
    const b = T.bounds.find(b => b.id === mk.seg);
    if (b && b.start + mk.off + mk.len <= b.end && T.S.substr(b.start + mk.off, mk.len) === mk.text) return { at: b.start + mk.off, len: mk.len };
    const at = T.S.indexOf(mk.text, Math.max(0, lo - 300));   // 原稿改过：按字找
    return at >= 0 ? { at, len: mk.text.length } : null;
  }
  function buildSteps(T) {
    const pages = DATA.pages, steps = [], has = T.S.length > 0, marks = DATA.voiceMarks || {};
    const pstart = {}; let c0 = 0;
    if (has) pages.forEach(p => { const b = T.bounds.find(b => b.screen === p.id && b.start >= c0); if (b) { pstart[p.id] = b.start; c0 = b.start; } });
    let cur = 0;
    pages.forEach((p, pi) => {
      if (p.voiceSkip) return;
      let hi = T.S.length;
      for (let k = pi + 1; k < pages.length; k++) { const s = pstart[pages[k].id]; if (s != null && s >= cur) { hi = s; break; } }
      const ownSegs = has && T.bounds.some(b => b.screen === p.id);
      const turn = { page: pi, focus: -1, detail: 0, kind: 'turn', label: '翻到第' + (pi + 1) + '页', cands: [], key: markKey(p) };
      steps.push(turn);
      let lo = cur;
      const tm = has ? markAt(T, marks[turn.key], cur) : null;
      if (tm) { turn.at = tm.at; turn.len = tm.len; turn.how = '你标的位置'; turn.mine = true; lo = turn.at; }
      else if (pstart[p.id] != null && pstart[p.id] >= cur) { turn.at = pstart[p.id]; turn.len = 2; turn.how = '本页口播开头'; lo = turn.at; }
      // 同页两张以上卡片标题都有的词（如“国豪精英班”“工科试验班”）不拿来定位
      const cnt = {}; p.groups.forEach(g => new Set(titleParts(plain(g.title)).map(norm)).forEach(n => { cnt[n] = (cnt[n] || 0) + 1; }));
      const generic = new Set(Object.keys(cnt).filter(n => cnt[n] > 1));
      const mine = [];
      p.groups.forEach((g, gi) => {
        const subs = [[null, 0]]; (g.highlights || []).forEach((h, j) => subs.push([h, j + 1]));
        for (const [h, d] of subs) {
          const st = { page: pi, focus: gi, detail: d, kind: d ? 'highlight' : 'card', label: d ? '高亮：' + (h.terms || []).join('、') : plain(g.title).replace(/\s+/g, ' '), cands: cands(g, h, generic), key: markKey(p, g, d) };
          const mk = marks[st.key], put = has ? markAt(T, mk, lo) : null;
          if (mk && mk.follow) { st.how = '你设成紧跟上一条'; st.mine = true; }
          else if (put) { st.at = put.at; st.len = put.len; st.how = '你标的位置'; st.mine = true; lo = put.at + put.len; }
          else {
            const o = has ? findOcc(T, st.cands, lo, hi, p.id, ownSegs) : null;
            if (o) { st.at = o.at; st.len = o.len; st.how = (o.c.src === '短语' ? '触发词' : o.c.src) + '「' + o.c.raw + '」' + (o.fuzzy ? '（近似）' : ''); lo = o.at + o.len; }
            if (mk) st.how = '你标的位置在原稿里找不到了，' + (st.how ? '改用' + st.how : '紧跟上一条');
          }
          steps.push(st); mine.push(st);
        }
      });
      if (turn.at == null && has) {
        const f = mine.find(s => s.at != null);
        if (f) { turn.at = Math.max(cur, clauseStart(T, f.at)); turn.len = 2; turn.how = '按卡片推断的分句开头'; }
        else { turn.at = Math.min(hi, nextSent(T, cur)); turn.len = 0; turn.how = '上一句讲完（本页没有口播）'; }
      }
      cur = Math.max(cur, lo, turn.at || 0);
    });
    // 触发位置：讲到触发词的前几个字就出（不等整句）；没找到的紧跟上一条；保持不倒退
    let prev = 0, prevStep = null;
    steps.forEach((s, i) => {
      if (!has) {
        if (s.cands.length) { s.trig = i; s.how = '触发词／标题词'; }
        else if (s.kind === 'turn') { const f = steps.slice(i + 1).find(x => x.page === s.page && x.cands.length); s.trig = f ? steps.indexOf(f) : prev; s.how = f ? '和本页第一张有词的卡一起' : '紧跟上一条'; }
        else { s.trig = prev; s.how = '紧跟上一条（没有触发词）'; s.weak = true; }
      }
      else if (s.at != null) s.trig = s.at;
      else { s.trig = prev; s.how = s.mine ? s.how : '紧跟上一条（原稿里没找到触发词）'; s.weak = true; }
      if (s.trig < prev) { s.trig = prev; if (s.at != null) s.early = true; }   // 标的位置比上一处还早：和上一处一起出
      prev = s.trig; prevStep = s;
    });
    if (steps.length) steps[0].trig = 0;
    return steps;
  }

  // ---------- 状态 ----------
  const VF = window.__vfState = {
    on: false, mode: 'auto', engine: '', gen: 0, rec: null, T: null, steps: [], pos: 0, cur: 0, timer: null, internal: false,
    lastState: '', lastStepAt: 0, pageAt: 0, carry: '', sessTail: '', kwUsed: 0, restarts: [], netErr: 0, lastGlobal: 0,
    heard: '', status: '未开启', sim: null, paused: false, notice: '', busy: false, stage: '', soundAt: 0, gotText: false, warned: false, dog: null, log: [], latency: 0.8, rate: 0, lost: false, lastMatchAt: 0, lastMoveAt: 0, trace: [], traceInfo: null
  };
  function rebuild() { VF.T = buildScript(); VF.steps = buildSteps(VF.T); }
  const stateKey = () => page + '/' + focus + '/' + (typeof detailStep !== 'undefined' ? detailStep : 0);
  function indexOfState() {
    const d = typeof detailStep !== 'undefined' ? detailStep : 0; let best = -1;
    VF.steps.forEach((s, i) => { if (s.page < page || (s.page === page && (s.focus < focus || (s.focus === focus && s.detail <= d)))) best = i; });
    return Math.max(0, best);
  }
  function syncFromState() { VF.cur = indexOfState(); VF.pos = VF.steps[VF.cur] ? VF.steps[VF.cur].trig : 0; VF.lastState = stateKey(); VF.pageAt = Date.now(); clearTimeout(VF.timer); VF.timer = null; VF.carry = ''; VF.sessTail = ''; VF.skipLen = VF.lastFullLen || 0; VF.kwUsed = VF.skipLen; VF.feedFull = ''; }

  function apply(st) {
    if (EditDesk.isEditing()) return;
    VF.internal = true;
    try { if (typeof stop === 'function') stop(); page = st.page; focus = st.focus; if (typeof detailStep !== 'undefined') detailStep = st.detail || 0; showAll = false; if (typeof CT !== 'undefined' && CT) CT.collapsed = false; render(); }
    finally { VF.internal = false; }
    VF.lastState = stateKey();
  }
  // 提前量：识别结果比嘴慢（引擎 0.5～1.5 秒＋传输），按语速×设定的秒数，提前这么多字就出（用户 10-24：大部分时候比说到的晚）
  const lead = () => VF.engine === 'sim' || !VF.T || !VF.T.S.length ? 0 : Math.round(Math.min(12, (VF.rate || 5) * VF.latency));
  // 提前量不跨句号：句末人会停一下，跨过去就会在停顿时把下一句的卡提前出（10-24 模拟：早 1～1.4 秒）；翻页可以跨——停顿时翻页本来就自然
  function target() {
    let t = VF.cur; const L = lead(), B = VF.T && VF.T.S.length ? nextSent(VF.T, VF.pos - 1) : Infinity;   // 刚好念完一句时 B＝下一句开头，不是再下一句
    for (let k = VF.cur + 1; k < VF.steps.length; k++) {
      const s = VF.steps[k], p = s.trig <= B || (s.kind === 'turn' && s.trig <= B + 2) ? VF.pos + L : VF.pos;
      if (s.trig <= p) t = k; else break;
    }
    return t;
  }
  function schedule() {
    if (VF.timer || !VF.on) return;
    const t = target(); if (t <= VF.cur) return;
    // 落后太多就跳，但一次最多跨一页：原稿里没讲到的页（同济“所有班型”）和下一页的翻页常在同一个位置，直接跳到最后会把整页跳过去
    const now = Date.now(), C = VF.steps[VF.cur];
    let dest = VF.cur + 1;
    if (t - VF.cur > JUMP) {
      const pg = VF.steps[VF.cur + 1].page; dest = VF.cur + 1;
      while (dest + 1 <= t && VF.steps[dest + 1].page === pg) dest++;
    }
    const D = VF.steps[dest];
    let wait = Math.max(0, VF.lastStepAt + GAP - now);
    if (C && D.page !== C.page) wait = Math.max(wait, VF.pageAt + DWELL - now);
    VF.timer = setTimeout(() => {
      VF.timer = null; if (!VF.on) return;
      const turned = !VF.steps[VF.cur] || VF.steps[VF.cur].page !== D.page;
      VF.cur = dest; apply(D); VF.lastStepAt = Date.now(); if (turned) VF.pageAt = VF.lastStepAt;
      if (VF.trace.length < 30000 && VF.T0) VF.trace.push(['f', VF.lastStepAt - VF.T0, dest, VF.pos, lead()]);
      say(); schedule();
    }, wait);
  }

  // 每次听到新内容：tail 是（上次会话尾巴＋本次会话全部识别文字）归一后的最后 40 字，full 是本次会话归一全文
  function onHeard(tail, full, utter) {
    const T = VF.T; if (!T || !VF.on) return;
    let moved = false; const now = Date.now();
    if (T.S.length && !VF.locked) {
      const qs = tail.slice(-16);
      if (qs.length >= 10) {
        const r = align(qs, T.tk, 0, T.S.length, 0);
        if (r && r.cost <= 2 && (r.end < VF.pos - 40 || r.end > VF.pos + WIN)) {
          VF.locked = true; VF.pos = r.end; VF.lastMatchAt = now; VF.lastMoveAt = now; let t = 0;
          for (let k = 0; k < VF.steps.length; k++) { if (VF.steps[k].trig <= VF.pos) t = k; else break; }
          clearTimeout(VF.timer); VF.timer = null; VF.cur = t; apply(VF.steps[t]); VF.lastStepAt = VF.pageAt = now;
          note('从你念的地方接上：第' + (VF.steps[t].page + 1) + '页'); say(); return;
        }
      }
    }
    if (T.S.length) {
      // 先在当前位置附近找（16 字容 4 个错、24 字容 6 个）；跟丢 2.5 秒以上就往后 3000 字大范围找（更严）；再不行全稿找
      const lost = now - (VF.lastMatchAt || now) > 2500;
      const tryQ = (L, lo, hi, rate, cut) => { const qs = cut ? tail.slice(-L - cut, -cut) : tail.slice(-L); if (qs.length < Math.min(L, 8)) return null; const r = align(qs, T.tk, lo, hi, VF.pos); return r && r.cost <= qs.length * rate ? r : null; };
      // 10 字最多错 1 个：跳一句、换个说法之后，念到 10 个对得上的字就接上（以前要 16 个，晚 1～2 秒）
      // 8 字读音全对、就在后面 300 字以内：最快接上（跳一小句、换个说法之后）
      let r = tryQ(16, VF.pos - 40, VF.pos + WIN, 0.28) || tryQ(24, VF.pos - 40, VF.pos + WIN, 0.25) || tryQ(10, VF.pos - 20, VF.pos + WIN, 0.12) || tryQ(8, VF.pos - 10, VF.pos + 300, 0.05) || tryQ(16, VF.pos - 40, VF.pos + WIN, 0.28, 4);
      // 停顿后新起的一句：人跳过一小句或换了说法之后，多半从下一个整句接着念——新一句开头 5～10 个字和后面两句的开头比，最多错 1 个就接上
      if (!r && utter && utter.length >= 5 && utter.length <= 10 && (VF.lost || now - (VF.lastMoveAt || now) > 1200)) {
        const U = tk(utter); let B = VF.pos - 1;
        for (let n = 0; n < 2 && !r; n++) {
          B = nextSent(T, B); if (B >= T.S.length || B > VF.pos + 240) break;
          let c = 0; for (let i = 0; i < U.length && c <= 1; i++) { const j = B + i; if (j >= T.S.length) { c = 9; break; } c += U.t[i] === T.tk.t[j] ? 0 : U.f[i] === T.tk.f[j] ? 0.35 : 1; }
          if (c <= 1) { r = { end: B + U.length, cost: c }; note('新一句接上：' + utter); }
        }
      }
      if (!r && lost) r = tryQ(24, VF.pos, VF.pos + 3000, 0.2) || tryQ(16, VF.pos, VF.pos + 3000, 0.16);
      if (!r && tail.length >= 16 && now - VF.lastGlobal > 1000) { VF.lastGlobal = now; r = tryQ(24, VF.pos + 3000, T.S.length, 0.16) || tryQ(16, VF.pos + WIN, T.S.length, 0.13); }
      if (r) { VF.locked = true; if (VF.lost) { VF.lost = false; note('找回位置'); } VF.lastMatchAt = now; }
      else if (lost && !VF.lost && tail.length >= 16) { VF.lost = true; note('跟丢：最近的话在原稿里对不上'); }
      if (r && r.end > VF.pos) {
        // 语速（每秒归一字数），给提前出卡用
        const dt = (now - (VF.lastMoveAt || now)) / 1000, dp = r.end - VF.pos;
        if (dt > 0.15 && dt < 4 && dp < 60) { const v = Math.max(2, Math.min(10, dp / dt)); VF.rate = VF.rate ? VF.rate * 0.85 + v * 0.15 : v; }
        VF.lastMoveAt = now; VF.pos = r.end; moved = true;
      }
    }
    // 兜底：接下来两条的触发词／标题词（≥3 字）刚刚被说到，也算到了（主播没照稿讲时靠这个）。
    // 有原稿时只认在原稿里定过位的卡，而且这个词从当前位置往后第一次出现就是那张卡的位置——
    // 否则同济第 4 页讲“机器人里面可以读自动化”会把第 5 页“机器人”卡提前叫出来（2026-10-23 模拟测试）
    if (!moved && full != null) {
      const from = Math.max(VF.kwUsed, full.length - 14), fresh = full.slice(from);
      for (let k = VF.cur + 1, n = 0; k < VF.steps.length && n < 2; k++) {
        const s = VF.steps[k]; if (s.trig <= VF.pos) continue;
        if (!s.cands.length || (T.S.length && s.at == null)) continue; n++;
        // 按读音找（“人工智能”认成“人工只能”也算），原稿里从当前位置往后第一次出现得是这张卡的位置
        const c = s.cands.find(c => c.n.length >= (T.S.length ? 3 : 2) && pyIndex(fresh, c.n) >= 0 && (!T.S.length || T.S.indexOf(c.n, Math.max(0, VF.pos - 10)) >= s.at - 2));
        if (c) { VF.kwUsed = from + pyIndex(fresh, c.n) + c.n.length; VF.pos = Math.max(VF.pos, s.trig); moved = true; break; }
      }
    }
    if (moved) schedule();
  }

  // ---------- 识别 ----------
  function say(text) {
    if (text != null) VF.status = text;
    const st = VF.steps[VF.cur], where = st ? '第' + (st.page + 1) + '页' + (st.focus >= 0 ? '第' + (st.focus + 1) + '条' : '') : '';
    const line = VF.on ? VF.status + (where ? ' · 现在：' + where : '') : VF.status;
    const el = $q('#vfStatus'); if (el) el.textContent = line;
    // 右下角状态条：跟读中、准备中、出错都显示（2026-10-24 用户实测“完全没反应”——旧版出错只写在编辑台里，平时看不见）
    const pill = $q('#vfPill');
    if (pill) {
      pill.hidden = !VF.on && !VF.notice;
      pill.classList.toggle('vf-idle', !VF.on);
      pill.querySelector('b').textContent = VF.on ? (VF.engine === 'sim' ? '预演中' : '跟读中') : (VF.busy ? '准备中' : '语音跟读');
      pill.querySelector('span').textContent = VF.on ? (VF.lost ? '跟丢了，接着照稿念会自动接上 · ' : '') + (VF.heard ? '听到：' + VF.heard.slice(-16) : (VF.stage || VF.status)) : VF.notice;
    }
    const lg = $q('#vfLog'); if (lg) lg.textContent = VF.log.slice(-12).map(x => x[0] + ' ' + x[1]).join('\n');
    if (typeof scriptView === 'function' && $q('#vfDrawer') && !$q('#vfDrawer').hidden) scriptView();
    const top = $q('#vcTop'); if (top) { top.textContent = VF.on ? (VF.engine === 'sim' ? '停止预演' : '停止跟读') : '语音跟读'; top.classList.toggle('vf-live', VF.on); }
    const tg = $q('#vfToggle'); if (tg) tg.textContent = VF.on && VF.engine !== 'sim' ? '停止跟读' : '开始跟读';
    const rh = $q('#vfRehearse'); if (rh) rh.textContent = VF.on && VF.engine === 'sim' ? '停止预演' : '不出声预演';
    const nx = $q('#vcNext'); if (nx) { const c = VF.on ? VF.cur : indexOfState(), n = VF.steps[c + 1]; nx.textContent = n ? '下一处：' + (n.kind === 'turn' ? '翻到第' + (n.page + 1) + '页' : '第' + (n.page + 1) + '页第' + (n.focus + 1) + '条 ' + n.label.slice(0, 14)) + (n.weak ? '（紧跟上一处）' : '') : '已经是最后一处'; }
  }
  function note(t) { const d = new Date(); VF.log.push([d.toTimeString().slice(0, 8), t]); if (VF.log.length > 200) VF.log.shift(); }
  // isError：出错停下时把原因留在右下角，点一下才消失；手动停就不留
  function off(msg, isError) {
    VF.on = false; VF.gen++; clearTimeout(VF.timer); VF.timer = null; clearInterval(VF.sim); VF.sim = null; clearInterval(VF.dog); VF.dog = null;
    VF.busy = false; VF.notice = isError ? msg : ''; note((isError ? '停止（出错）：' : '停止：') + (msg || ''));
    const r = VF.rec; VF.rec = null; if (r) { r.onresult = r.onerror = r.onend = r.onstart = null; try { r.abort(); } catch (e) { } }
    VF.engine = ''; VF.paused = false; say(msg || '已停止');
  }
  function begin(engine) {
    rebuild(); syncFromState(); VF.on = true; VF.engine = engine; VF.carry = ''; VF.sessTail = ''; VF.restarts = []; VF.netErr = 0; VF.heard = ''; VF.lastStepAt = 0; VF.skipLen = 0; VF.lastFullLen = 0; VF.feedFull = '';
    if (EditDesk.isEditing()) EditDesk.setEditing(false);
    if (typeof stop === 'function') stop();
    VF.busy = false; VF.notice = ''; VF.stage = ''; VF.soundAt = 0; VF.gotText = false; VF.warned = false; VF.locked = engine === 'sim';
    VF.rate = 0; VF.lost = false; VF.lastMatchAt = VF.lastMoveAt = 0; VF.T0 = Date.now();
    VF.trace = []; VF.traceInfo = { deck: (typeof DECK !== 'undefined' && DECK.key) || '', engine, mode: VF.mode, latency: VF.latency, startPage: page, startFocus: focus, at: new Date().toISOString(), ua: navigator.userAgent };
    clearInterval(VF.dog); VF.dog = engine === 'sim' ? null : setInterval(watchdog, 1000);
  }
  // 听到声音却一直认不出字：Chrome 本机识别在有的电脑上会这样——服务起来了、收到声音，但不出结果也不报错
  function watchdog() {
    if (!VF.on || VF.warned || !VF.soundAt || VF.gotText || Date.now() - VF.soundAt < 8000) return;
    VF.warned = true;
    if (VF.engine === 'local') {
      note('本机识别听到声音 8 秒没出字');
      if (VF.mode === 'auto' && confirm('本机识别听到了声音，但 8 秒没认出一个字（这台电脑的 Chrome 本机识别可能不工作）。\n\n改用联网识别吗？麦克风声音会发到谷歌语音服务，要能连上谷歌；课件不录制音频；识别文字暂存在本页内存，可手动导出跟读记录。')) {
        VF.engine = 'remote'; VF.soundAt = 0; VF.warned = false; note('改用联网识别'); listen(); say('已改用联网识别');
      } else say('听到声音但本机识别认不出字：编辑台「原稿」页把识别方式换成「联网识别」再试');
    } else { note('联网识别听到声音 8 秒没出字'); say('听到声音但联网识别没返回文字：可能连不上谷歌（要开代理）'); }
  }
  async function localReady() {
    let probe; try { probe = new SR(); } catch (e) { return '语音识别建不起来'; }
    if (!('processLocally' in probe) || !SR.install || !SR.available) return '这个浏览器没有本机识别，请把 Chrome 升到最新版';
    // Chrome 的本机识别服务启动前检查的是「实时字幕」设置里那个语言的包（默认英文，源码 chrome_speech_recognition_service.cc
    // LaunchIfNotRunning）；只装中文包、实时字幕又是英文的电脑，服务起不来也不报错。所以中文、英文两个包一起装
    const zh = { langs: ['zh-CN'], processLocally: true }, en = { langs: ['en-US'], processLocally: true };
    let inst; try { inst = SR.install({ langs: ['zh-CN', 'en-US'], processLocally: true }); } catch (e) { inst = Promise.resolve(false); }   // 要在点击里直接调，晚了会被浏览器当成非用户操作
    try {
      let a = await SR.available(zh), b = await SR.available(en);
      note('本机识别包：中文 ' + a + '，英文 ' + b);
      if (a === 'unavailable') return '这台电脑的 Chrome 不支持中文本机识别';
      if (a === 'available' && b !== 'downloading' && b !== 'downloadable') return true;
      const t0 = Date.now(); let done = false; inst.then(v => { done = v === false ? 'fail' : true; }, () => { done = 'fail'; });
      while (Date.now() - t0 < 300000) {
        a = await SR.available(zh); b = await SR.available(en);
        if (a === 'available' && (b === 'available' || b === 'unavailable')) { note('识别包就绪'); return true; }
        if (done === 'fail') return '识别包下载失败（要能连上谷歌更新服务器，下好以后断网也能用）';
        VF.notice = '第一次用：正在下载识别包（中文' + (a === 'available' ? '✓' : '下载中') + '，英文' + (b === 'available' ? '✓' : '下载中') + '，共约 150MB，只下这一次）… ' + Math.round((Date.now() - t0) / 1000) + ' 秒';
        say(); await sleep(2000);
      }
      return '识别包五分钟还没下完，稍后再点一次';
    } catch (e) { return '本机识别出错：' + (e && e.message || e); }
  }
  async function start(mode) {
    if (VF.on) return;
    mode = mode || VF.mode;
    const fail = t => { VF.busy = false; VF.notice = t; note(t); say(t); };
    if (!SR) { fail('这个浏览器不支持语音识别，请用 Chrome 打开课件'); return; }
    if (VF.busy) return;
    let engine = 'remote';
    note('开始，识别方式：' + ({ auto: '自动', local: '只用本机', remote: '联网' }[mode] || mode));
    if (mode !== 'remote') {
      VF.busy = true; VF.notice = '正在准备本机识别…'; say();
      const r = await localReady();
      if (r === true) engine = 'local';
      else if (mode === 'local') { fail('本机识别用不了：' + r); return; }
      else {
        if (!confirm('本机识别用不了：' + r + '\n\n改用联网识别吗？麦克风声音会发到谷歌语音服务（拍摄电脑要能连上谷歌），课件不录制音频；识别文字暂存在本页内存，可手动导出跟读记录。')) { fail('没有开启：' + r); return; }
        engine = 'remote';
      }
    }
    begin(engine); VF.stage = '正在打开麦克风…'; listen(); say();
  }
  function listen() {
    if (!VF.on || VF.engine === 'sim') return;
    const gen = ++VF.gen; let r;
    if (VF.T0 && VF.trace.length < 30000) VF.trace.push(['s', Date.now() - VF.T0, VF.engine]);
    const old = VF.rec; if (old) { old.onresult = old.onerror = old.onend = old.onstart = null; try { old.abort(); } catch (e) { } }
    try { r = new SR(); } catch (e) { off('语音识别建不起来', true); return; }
    VF.rec = r; VF.carry = VF.sessTail; VF.kwUsed = 0; VF.skipLen = 0; VF.lastFullLen = 0;
    r.lang = 'zh-CN'; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
    if ('processLocally' in r) r.processLocally = VF.engine === 'local';
    r.onstart = () => { if (gen === VF.gen) { note('识别开始（' + (VF.engine === 'local' ? '本机' : '联网') + '）'); say('正在跟读 · ' + (VF.engine === 'local' ? '本机识别' : '联网识别')); } };
    r.onaudiostart = () => { if (gen === VF.gen && !VF.gotText) { VF.stage = '麦克风已打开，请开始讲'; say(); } };
    const heardSound = () => { if (gen !== VF.gen) return; if (!VF.soundAt) { VF.soundAt = Date.now(); note('听到声音'); } if (!VF.gotText) { VF.stage = '听到声音，正在认字…'; say(); } };
    r.onsoundstart = heardSound; r.onspeechstart = heardSound;
    r.onresult = e => {
      if (gen !== VF.gen || !VF.on) return;
      VF.netErr = 0; let raw = '';
      if (VF.trace.length < 30000) { const ch = []; for (let i = e.resultIndex; i < e.results.length; i++) ch.push([e.results[i][0].transcript, e.results[i].isFinal ? 1 : 0]); VF.trace.push(['r', Date.now() - VF.T0, e.resultIndex, e.results.length, ch]); }
      for (let i = 0; i < e.results.length; i++) raw += e.results[i][0].transcript;
      const full = norm(raw); VF.lastFullLen = full.length; const tail = (VF.carry + full.slice(VF.skipLen)).slice(-40);
      const lastRes = e.results[e.results.length - 1], utter = lastRes && !lastRes.isFinal ? norm(lastRes[0].transcript) : '';
      VF.sessTail = tail; VF.heard = raw.slice(-40) || VF.heard;
      if (raw && !VF.gotText) { VF.gotText = true; note('认出第一段字：' + raw.slice(0, 20)); }
      if (!VF.paused) onHeard(tail, full, utter);
      say();
    };
    r.onerror = e => {
      if (gen !== VF.gen) return;
      const fatal = {
        'not-allowed': '麦克风没给权限：点地址栏左边的图标，把麦克风改成“允许”，再开跟读',
        'service-not-allowed': '浏览器不让用语音识别（可能被策略关了）',
        'audio-capture': '找不到麦克风：看看麦克风接好没有、系统设置里输入设备选对没有',
        'language-not-supported': VF.engine === 'local' ? '本机中文识别包用不了，换「联网识别」试试' : '这个识别方式不支持中文'
      }[e.error];
      note('识别报错：' + e.error);
      if (fatal) { off(fatal, true); return; }
      if (e.error === 'network') { VF.netErr++; say('联网识别连不上，正在重连（第 ' + VF.netErr + ' 次）' + (VF.netErr >= 3 ? '。拍摄电脑连不上谷歌的话，请改用本机识别' : '')); }
      // no-speech（一阵没声音）、aborted 等：交给 onend 自动重连
    };
    r.onend = () => {
      if (gen !== VF.gen || !VF.on) return;
      const now = Date.now(); VF.restarts = VF.restarts.filter(t => now - t < 60000); VF.restarts.push(now);
      if (VF.restarts.length > 40) { off('识别一分钟内断了 40 次，已停止：检查麦克风和网络后再开', true); return; }
      setTimeout(() => { if (gen === VF.gen && VF.on) listen(); }, VF.netErr ? Math.min(8000, 1000 * 2 ** (VF.netErr - 1)) : 120);
    };
    try { r.start(); } catch (e) { setTimeout(() => { if (gen === VF.gen && VF.on) listen(); }, 600); }
  }
  // 不开麦克风，按原稿语速把全文“念”一遍，看每一步什么时候出
  function rehearse(speed) {
    if (VF.on) { off(VF.engine === 'sim' ? '预演已停止' : '跟读已停止'); return; }
    rebuild();
    if (!VF.T.S.length) { say('这份课件没有口播原稿（sourceSegments），预演不了；跟读时按触发词和标题词认'); return; }
    begin('sim'); say('预演中：按原稿语速假装在讲');
    let i = VF.pos; const per = Math.max(1, Math.round(5.5 * (speed || 1) / 5));
    VF.sim = setInterval(() => {
      if (!VF.on) return;
      i = Math.max(i, VF.pos) + per; const tail = VF.T.S.slice(Math.max(0, i - 40), i);
      VF.heard = VF.T.src.slice(Math.max(0, VF.T.map[Math.min(i, VF.T.S.length) - 1] - 15), VF.T.map[Math.min(i, VF.T.S.length) - 1] + 1);
      onHeard(tail, null); say();
      if (i >= VF.T.S.length && VF.cur >= VF.steps.length - 1) off('预演完毕');
      else if (i >= VF.T.S.length + 60) off('预演完毕（后面几步原稿里没有，靠手动）');
    }, 200);
  }

  // ---------- 接管旧界面 ----------
  // 手动操作（方向键、点按钮、选页）后：取消排队的动作，从当前画面接着跟
  const renderBase = render;
  render = function () { const r = renderBase.apply(this, arguments); if (VF.on && !VF.internal && stateKey() !== VF.lastState) { syncFromState(); VF.locked = true; say('手动接管 · 从这里接着跟'); } return r; };
  if (typeof vcSay === 'function') vcSay = function () { };   // 旧版状态字和按钮已换掉
  if (typeof VC !== 'undefined' && VC.active && typeof vcStop === 'function') vcStop();
  window.addEventListener('editdesk:mode', e => { if (e.detail && e.detail.editing && VF.on) off('进入编辑，跟读已停止'); });
  document.addEventListener('visibilitychange', () => {
    if (!VF.on || VF.engine === 'sim') return;
    if (document.hidden) { VF.paused = true; } else if (VF.paused) { VF.paused = false; VF.sessTail = ''; say('回到课件，继续跟读'); }
  });
  window.addEventListener('pagehide', () => { if (VF.on) off(); });
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey || (e.target.closest && e.target.closest('input,select,textarea,[contenteditable="true"]'))) return;
    if (e.key === 'v' || e.key === 'V') { e.preventDefault(); VF.on ? off(VF.engine === 'sim' ? '预演已停止' : '跟读已停止') : start(); return; }
    // 翻页笔：大多数发 PageDown / PageUp
    if (e.key === 'PageDown' && typeof step === 'function') { e.preventDefault(); step(1); }
    if (e.key === 'PageUp' && typeof step === 'function') { e.preventDefault(); step(-1); }
  });

  const css = document.createElement('style');
  css.textContent = '#vfPill{position:fixed;right:14px;bottom:12px;z-index:60;display:flex;gap:8px;align-items:center;max-width:46vw;padding:6px 12px;border-radius:999px;background:#1d1d1fde;color:#fff;font:13px/1.4 -apple-system,"PingFang SC",sans-serif;box-shadow:0 4px 16px #0003;cursor:pointer}'
    + '#vfPill[hidden]{display:none}#vfPill.vf-idle::before{background:#ff9f0a;animation:none}#vfPill::before{content:"";width:9px;height:9px;border-radius:50%;background:#ff453a;animation:vfBlink 1.4s infinite}#vfPill span{opacity:.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '@keyframes vfBlink{50%{opacity:.25}}body.capture #vfPill,body.capture #vfDrawer{display:none}#vcTop.vf-live{color:#c0392b;font-weight:600}'
    + '#vfDrawer{position:fixed;top:64px;right:0;bottom:0;width:400px;max-width:92vw;z-index:58;background:#fffdf7;border-left:1px solid #e3dccb;box-shadow:-8px 0 24px #0002;display:flex;flex-direction:column;font:14px/1.6 -apple-system,"PingFang SC",sans-serif;color:#222}'
    + '#vfDrawer[hidden]{display:none}#vfDrawer header{padding:10px 14px 8px;border-bottom:1px solid #eee5d2;background:#fffaf0}#vfDrawer h3{margin:0 0 4px;font-size:16px}'
    + '#vfDrawer .vf-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:6px 0}#vfDrawer button,#vfDrawer select{font:13px -apple-system,"PingFang SC",sans-serif;padding:4px 10px;border:1px solid #cfc6b2;border-radius:6px;background:#fff;cursor:pointer}'
    + '#vfDrawer button.vf-main{background:#c0392b;color:#fff;border-color:#c0392b}#vfDrawer .vf-x{margin-left:auto}'
    + '.vf-tip{color:#777;font-size:12.5px;margin:2px 0}#vfStatus{font-weight:600;font-size:13px}#vcNext{font-size:12.5px;color:#555;margin:2px 0}'
    + '#vfScript{flex:1;overflow:auto;padding:6px 16px 40vh;font-size:15px;line-height:2}#vfScript p{margin:0 0 10px}'
    + '#vfScript mark{background:#ffe928;color:inherit;border-radius:3px;padding:1px 1px;cursor:pointer}#vfScript mark.mine{box-shadow:inset 0 -2px #c0392b}#vfScript mark.next{animation:vfNext 1s infinite}'
    + '@keyframes vfNext{50%{background:#fff4a8}}#vfScript .vf-read{color:#aaa}#vfScript .vf-read mark,#vfScript mark.done{background:#f1e9a6}'
    + '#vfScript .vf-tag{font-size:11px;color:#a5301f;font-weight:600;margin:0 2px;cursor:pointer;vertical-align:super;line-height:1}'
    + '#vfScript .vf-turn{display:inline-block;font-size:12px;font-weight:600;color:#1f5fa8;background:#e8f0fb;border-radius:4px;padding:0 6px;margin:0 4px 0 0;cursor:pointer;line-height:1.7}'
    + '#vfScript .vf-follow{display:inline-block;font-size:11.5px;color:#8a6d00;background:#fff3c4;border:1px dashed #e0c25a;border-radius:4px;padding:0 5px;margin:0 2px;cursor:pointer;line-height:1.6}'
    + '#vfScript .vf-follow.mine{border-style:solid}#vfScript .now{outline:2px solid #2e9e5b;outline-offset:1px}'
    + '#vfCaret{display:inline-block;width:2px;height:1.2em;background:#e33;vertical-align:middle;margin:0 1px;animation:vfBlink 1s infinite}'
    + '#vfPop{position:absolute;z-index:3;left:14px;right:14px;background:#fff;border:1px solid #d8cfba;border-radius:8px;box-shadow:0 8px 24px #0003;padding:10px 12px;font-size:13px}#vfPop[hidden]{display:none}#vfPop select{max-width:100%;margin:6px 0}'
    + '#vfDrawer details{padding:0 14px 6px;font-size:12.5px}#vfDrawer details pre{white-space:pre-wrap;font-size:12px;margin:4px 0}#vfDrawer .vf-body{position:relative;flex:1;display:flex;flex-direction:column;min-height:0}';
  document.head.append(css);
  const pill = document.createElement('div'); pill.id = 'vfPill'; pill.hidden = true; pill.setAttribute('data-ed-ui', ''); pill.title = '跟读中点一下停止（V 键也行）；出错提示点一下关掉';
  pill.innerHTML = '<b>跟读中</b><span></span>'; pill.onclick = () => { if (VF.on) off(VF.engine === 'sim' ? '预演已停止' : '跟读已停止'); else if (!VF.busy) { VF.notice = ''; say(); } unfocus(); };
  document.body.append(pill);

  // ---------- 标黄稿（2026-10-24 用户：编辑台看不懂；他们平时用「展板标黄版」原稿——黄底＝读到这儿按一下）----------
  // 右侧抽屉，不进编辑模式也能开，跟读、预演时开着能看到念到哪儿；拍摄模式自动藏
  const dr = document.createElement('div'); dr.id = 'vfDrawer'; dr.hidden = true; dr.setAttribute('data-ed-ui', '');
  dr.innerHTML = '<header><div class="vf-row"><h3>标黄稿</h3><button class="vf-x" id="vfClose">收起</button></div>'
    + '<p class="vf-tip">和展板标黄版一样：<b>念到黄底，就出那一处动画</b>（黄底后面的小字＝第几页第几条）。蓝色是翻页。要改位置：用鼠标选中几个字，点「这里出」。</p>'
    + '<div class="vf-row"><button id="vfToggle" class="vf-main">开始跟读</button><button id="vfRehearse">不出声预演</button><select id="vfSpeed"><option value="1">正常语速</option><option value="2">2 倍速</option><option value="4">4 倍速</option></select></div>'
    + '<p id="vfStatus" role="status">未开启</p><p id="vcNext"></p><p id="vfSum" class="vf-tip"></p></header>'
    + '<div class="vf-body"><div id="vfScript"></div><div id="vfPop" hidden></div></div>'
    + '<details><summary>设置与排查</summary><label>识别方式 <select id="vfMode"><option value="auto">自动：优先本机识别（离线，声音不出电脑）</option><option value="local">只用本机识别</option><option value="remote">联网识别（要能连上谷歌）</option></select></label>'
    + '<label>出卡提前 <select id="vfLead"><option value="0">不提前</option><option value="0.4">0.4 秒</option><option value="0.8">0.8 秒（默认）</option><option value="1.2">1.2 秒</option><option value="1.6">1.6 秒</option><option value="2">2 秒</option></select></label><p class="vf-tip">识别结果总比嘴慢一点。出得晚就调大，出得早就调小；按你的语速自动换算成提前几个字。</p>'
    + '<p><button id="vfExport">导出这次跟读记录</button> <span class="vf-tip">（可能含口播原文和识别文字，请在分享前检查）</span></p>'
    + '<p class="vf-tip">识别过程记录（含诊断信息，分享前请检查）：</p><pre id="vfLog"></pre>'
    + '<p class="vf-tip">本机识别用 Chrome 自带的识别包（第一次自动下载）；联网识别会把麦克风声音发到谷歌语音服务。课件不录制音频；识别文字暂存在本页内存，可手动导出跟读记录。</p></details>';
  document.body.append(dr);
  const pop = dr.querySelector('#vfPop');
  function drawer(open) { dr.hidden = open === undefined ? !dr.hidden : !open; if (!dr.hidden) { rebuildIfIdle(); scriptView(true); } }
  const rebuildIfIdle = () => { if (!VF.on) rebuild(); };
  dr.querySelector('#vfClose').onclick = () => drawer(false);
  try { const m = localStorage.getItem(KEY + '-mode'); if (m) VF.mode = m; } catch (e) { }
  dr.querySelector('#vfMode').value = VF.mode;
  try { const l = parseFloat(localStorage.getItem(KEY + '-lead')); if (l >= 0 && l <= 3) VF.latency = l; } catch (e) { }
  dr.querySelector('#vfLead').value = String(VF.latency);
  dr.querySelector('#vfLead').onchange = e => { VF.latency = +e.target.value; try { localStorage.setItem(KEY + '-lead', String(VF.latency)); } catch (er) { } note('出卡提前改成 ' + VF.latency + ' 秒'); };
  dr.querySelector('#vfExport').onclick = () => {
    if (!VF.trace.length) { EditDesk.toast && EditDesk.toast('还没有跟读记录：先开跟读念一段'); return; }
    const data = { kind: 'evd-voice-trace', version: 1, info: VF.traceInfo, endedAt: new Date().toISOString(), log: VF.log, steps: VF.steps.map(s => [s.page, s.focus, s.detail, s.kind, s.trig, s.at == null ? null : s.at, s.how || '']), scriptLength: VF.T ? VF.T.S.length : 0, trace: VF.trace };
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    const d = new Date(), pad = n => String(n).padStart(2, '0');
    a.download = '跟读记录_' + (VF.traceInfo && VF.traceInfo.deck || 'deck') + '_' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + '.json';
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    note('导出跟读记录 ' + VF.trace.length + ' 条');
  };
  dr.querySelector('#vfMode').onchange = e => { VF.mode = e.target.value; try { localStorage.setItem(KEY + '-mode', VF.mode); } catch (er) { } };
  dr.querySelector('#vfToggle').onclick = () => { unfocus(); VF.on && VF.engine !== 'sim' ? off('跟读已停止') : (VF.on && off(), start()); };
  dr.querySelector('#vfRehearse').onclick = () => { unfocus(); rehearse(+dr.querySelector('#vfSpeed').value); };

  // 工具栏：「语音跟读」开关＋「标黄稿」
  const top = $q('#vcTop');
  if (top) {
    top.textContent = '语音跟读'; top.title = '照原稿讲，念到黄底就出动画（V 键开关）';
    top.onclick = () => { unfocus(); VF.on ? off(VF.engine === 'sim' ? '预演已停止' : '跟读已停止') : start(); };
    const tb = document.createElement('button'); tb.id = 'vfTop'; tb.textContent = '标黄稿'; tb.title = '看原稿里每处动画在哪儿出、改位置';
    tb.onclick = () => { unfocus(); drawer(); }; top.parentNode.insertBefore(tb, top);
  }
  // 编辑台「原稿」页：只留一句话＋按钮，旧的段落编号、触发短语收进折叠栏
  const pane = $q('#wbPanel [data-pane="cue"]');
  if (pane) {
    const h = [...pane.querySelectorAll('h3')].find(x => /现场语音推进/.test(x.textContent));
    if (h) { let n = h; while (n) { const nx = n.nextSibling; if (n.id !== 'vcNext') n.remove(); else n.remove(); n = nx; } }
    const old = document.createElement('details'); old.innerHTML = '<summary>旧版设置：段落编号、触发短语（一般不用，改位置请用标黄稿）</summary>';
    while (pane.firstChild) old.append(pane.firstChild);
    const box = document.createElement('div'); box.id = 'vfBox';
    box.innerHTML = '<h3>语音跟读</h3><p class="vf-tip">每处动画在原稿里的位置都在「标黄稿」里：黄底＝念到这儿就出。看位置、改位置都在那儿。</p><p><button id="vfOpen">打开标黄稿</button></p>';
    pane.append(box, old);
    box.querySelector('#vfOpen').onclick = () => { if (EditDesk.isEditing()) EditDesk.setEditing(false); drawer(true); };
    // 旧的“保存触发设置”要求 4 字以上，放宽到 2 字
    const save = $q('#vcSaveCue');
    if (save && typeof vcSelected === 'function' && typeof wbChange === 'function') save.onclick = () => {
      const g = vcSelected(); if (!g) return;
      const phrases = $q('#vcPhrases').value.split('\n').map(s => s.trim()).filter(Boolean);
      if (phrases.some(s => norm(s).length < 2 || s.length > 100)) { EditDesk.toast('每条触发词 2—100 字'); return; }
      wbChange(() => { g.cue = g.cue || {}; g.cue.phrases = phrases; });
    };
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  const tagOf = s => s.kind === 'turn' ? '第' + (s.page + 1) + '页' : (s.page + 1) + '-' + (s.focus + 1) + (s.detail ? '·亮' + s.detail : '');
  const nameOf = s => s.kind === 'turn' ? '翻到第' + (s.page + 1) + '页 · ' + plain(DATA.pages[s.page].title).replace(/\s+/g, ' ').slice(0, 16) : '第' + (s.page + 1) + '页第' + (s.focus + 1) + '条 · ' + s.label.slice(0, 18);
  let lastView = 0, viewTimer = null;
  function scriptView(force) {
    const box = $q('#vfScript'); if (!box || dr.hidden) return;
    const now = Date.now();
    if (!force && now - lastView < 400) { if (!viewTimer) viewTimer = setTimeout(() => { viewTimer = null; scriptView(true); }, 400); return; }
    lastView = now;
    const T = VF.T; if (!T) return;
    const S = VF.steps, cur = VF.on ? VF.cur : indexOfState();
    const weak = S.filter(s => s.weak && !s.mine).length, mine = S.filter(s => s.mine).length;
    $q('#vfSum').textContent = T.S.length ? '共 ' + S.length + ' 处动画（含翻页）；' + (S.length - S.filter(s => s.weak).length) + ' 处标在原稿上' + (weak ? '，' + weak + ' 处原稿里没讲到、紧跟上一处出（虚线框）' : '') + (mine ? '；其中 ' + mine + ' 处是你改过的（红下划线）' : '') : '';
    if (!T.S.length) { box.innerHTML = '<p class="vf-tip">这份课件没有口播原稿，标黄稿用不了；跟读时按卡片标题词认。</p>'; return; }
    const marks = [], follow = {}; let lastMarked = -1;
    S.forEach((s, i) => {
      if (s.at != null) { const a = s.at < T.S.length ? T.map[s.at] : T.src.length; const b = s.kind === 'turn' || !s.len ? a : T.map[Math.min(T.S.length - 1, s.at + s.len - 1)] + 1; marks.push({ a, b, i }); lastMarked = i; }
      else (follow[lastMarked] = follow[lastMarked] || []).push(i);
    });
    marks.sort((x, y) => x.a - y.a || x.i - y.i);
    const readTo = VF.on && VF.pos > 0 ? T.map[Math.min(T.S.length, VF.pos) - 1] + 1 : -1;
    let caretDone = false;
    const run = (a, b, inMark) => {
      let h = '', x = a;
      const cuts = [b]; if (readTo > a && readTo < b) cuts.unshift(readTo);
      for (const y of cuts) {
        if (y <= x) continue;
        const read = readTo >= y; let off = x;
        T.src.slice(x, y).split('\n').forEach((part, k) => { if (k) h += inMark ? ' ' : '</p><p>'; if (part) h += '<span data-o="' + off + '"' + (read ? ' class="vf-read"' : '') + '>' + esc(part) + '</span>'; off += part.length + 1; });
        if (y === readTo && !caretDone) { h += '<i id="vfCaret"></i>'; caretDone = true; }
        x = y;
      }
      return h;
    };
    const chip = i => { const s = S[i]; return '<span class="vf-follow' + (s.mine ? ' mine' : '') + (i === cur ? ' now' : '') + '" data-i="' + i + '" title="' + esc(s.how || '') + '">＋' + esc(tagOf(s) + ' ' + s.label.slice(0, 10)) + '</span>'; };
    let html = '<p>', o = 0;
    if (follow[-1]) html += follow[-1].map(chip).join('');
    for (const m of marks) {
      const s = S[m.i], cls = (s.mine ? ' mine' : '') + (m.i === cur ? ' now' : '') + (m.i === cur + 1 && VF.on ? ' next' : '') + (m.i < cur ? ' done' : '');
      if (m.a > o) { html += run(o, m.a); o = m.a; }
      if (s.kind === 'turn') html += '<span class="vf-turn' + cls + '" data-i="' + m.i + '" title="' + esc(s.how || '') + '">▶ ' + esc(nameOf(s)) + '</span>';
      else if (m.a >= o && m.b > m.a) { html += '<mark class="' + cls + '" data-i="' + m.i + '" title="' + esc(nameOf(s) + ' · ' + (s.how || '')) + '">' + run(m.a, m.b, true) + '</mark><span class="vf-tag" data-i="' + m.i + '">' + esc(tagOf(s)) + '</span>'; o = m.b; }
      else html += '<span class="vf-tag" data-i="' + m.i + '" title="' + esc(s.how || '') + '">' + esc(tagOf(s)) + '</span>';
      if (follow[m.i]) html += follow[m.i].map(chip).join('');
    }
    html += run(o, T.src.length) + (readTo >= T.src.length && !caretDone ? '<i id="vfCaret"></i>' : '') + '</p>';
    const keep = box.scrollTop; box.innerHTML = html; box.scrollTop = keep;
    const c = $q('#vfCaret') || box.querySelector('.now');
    if (c && (VF.on || force === true)) { const br = box.getBoundingClientRect(), cr = c.getBoundingClientRect(); if (cr.top < br.top + 40 || cr.bottom > br.bottom - 80) box.scrollTop += cr.top - br.top - br.height * 0.35; }
  }
  // 点黄底／标签：看这一处、跳过去、改成紧跟上一处、恢复自动
  function stepPop(i, y) {
    const s = VF.steps[i]; if (!s) return;
    pop.innerHTML = '<b>' + esc(nameOf(s)) + '</b><div class="vf-tip">' + esc(s.how || '') + (s.early ? '（比上一处还早，会和上一处一起出）' : '') + '</div>'
      + '<div class="vf-row"><button data-a="go">在课件里跳到这一处</button>' + (s.kind !== 'turn' && !(s.mine && s.weak) ? '<button data-a="follow">不在这里出，紧跟上一处</button>' : '') + (s.mine ? '<button data-a="auto">恢复自动找的位置</button>' : '') + '<button data-a="x">关闭</button></div>'
      + '<div class="vf-tip">要换位置：先关掉这个框，在原稿里选中几个字，点「这里出」。</div>';
    showPop(y);
    pop.onclick = e => {
      const a = e.target.dataset.a; if (!a) return;
      if (a === 'go') { if (EditDesk.isEditing()) EditDesk.setEditing(false); apply(s); if (VF.on) { syncFromState(); VF.locked = true; } }
      if (a === 'follow') saveMark(s, { follow: true });
      if (a === 'auto') saveMark(s, null);
      hidePop(); scriptView(true);
    };
  }
  function showPop(y) { const body = dr.querySelector('.vf-body'); pop.hidden = false; pop.style.top = Math.max(4, Math.min(y - body.getBoundingClientRect().top + 8, body.clientHeight - pop.offsetHeight - 8)) + 'px'; }
  function hidePop() { pop.hidden = true; pop.onclick = null; }
  function saveMark(s, mk) {
    const fn = () => { DATA.voiceMarks = DATA.voiceMarks || {}; if (mk) DATA.voiceMarks[s.key] = mk; else delete DATA.voiceMarks[s.key]; };
    if (typeof wbChange === 'function') wbChange(fn); else fn();
    rebuild(); if (VF.on) VF.cur = Math.min(VF.cur, VF.steps.length - 1); scriptView(true); say();
  }
  // 选中几个字：这里出哪一处
  function selPop() {
    const sel = window.getSelection(); if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const r = sel.getRangeAt(0), box = $q('#vfScript'); if (!box.contains(r.commonAncestorContainer)) return;
    const pos = (node, off) => { const el = (node.nodeType === 3 ? node.parentElement : node).closest('[data-o]'); return el ? +el.dataset.o + (node.nodeType === 3 ? off : 0) : null; };
    const a = pos(r.startContainer, r.startOffset), b = pos(r.endContainer, r.endOffset); if (a == null || b == null || b <= a) return;
    const T = VF.T; let na = -1, nb = -1;
    for (let k = 0; k < T.S.length; k++) { if (na < 0 && T.map[k] >= a) na = k; if (T.map[k] < b) nb = k; }
    if (na < 0 || nb < na) { EditDesk.toast && EditDesk.toast('选中的都是标点，多选几个字'); return; }
    const len = nb - na + 1, bd = T.bounds.find(x => na >= x.start && na < x.end); if (!bd || nb >= bd.end) { EditDesk.toast && EditDesk.toast('一次只能选一段里的字'); return; }
    // 候选：这个位置所在页和下一页的每一处动画；默认选这个位置之后第一处（没标上的优先）
    const S = VF.steps; let pi = 0; S.forEach(s => { if (s.kind === 'turn' && s.at != null && s.at <= na) pi = s.page; });
    const opts = S.map((s, i) => ({ s, i })).filter(x => x.s.page === pi || x.s.page === pi + 1 || (pi === 0 && x.s.page <= 1));
    const def = (opts.find(x => x.s.weak && !x.s.mine && x.s.page === pi) || opts.find(x => x.s.at != null ? x.s.at > na : x.s.trig > na) || opts[0] || {}).i;
    pop.innerHTML = '<b>选中「' + esc(String(sel).slice(0, 20)) + '」</b><div class="vf-tip">念到这几个字时出：</div><select id="vfPick">' + opts.map(x => '<option value="' + x.i + '"' + (x.i === def ? ' selected' : '') + '>' + esc(nameOf(x.s)) + (x.s.weak ? '（现在紧跟上一处）' : '') + '</option>').join('') + '</select>'
      + '<div class="vf-row"><button data-a="ok" class="vf-main">这里出</button><button data-a="x">取消</button></div>';
    showPop(r.getBoundingClientRect().bottom);
    pop.onclick = e => {
      const act = e.target.dataset.a; if (!act) return;
      if (act === 'ok') { const s = S[+pop.querySelector('#vfPick').value]; saveMark(s, { seg: bd.id, off: na - bd.start, len, text: T.S.substr(na, len) }); window.getSelection().removeAllRanges(); }
      hidePop();
    };
  }
  $q('#vfScript').addEventListener('mouseup', () => setTimeout(selPop, 0));
  $q('#vfScript').addEventListener('click', e => { const t = e.target.closest('[data-i]'); if (!t || String(window.getSelection())) return; stepPop(+t.dataset.i, t.getBoundingClientRect().bottom); });
  // 手动标的位置存进 DATA：导入备份、刷新后不丢
  if (typeof wbValidate === 'function') {
    const vb = wbValidate;
    wbValidate = function (input) {
      const out = vb.apply(this, arguments), src = input && input.kind === 'evd-deck' ? input.data : input, vm = src && src.voiceMarks;
      if (vm && typeof vm === 'object') {
        out.voiceMarks = {};
        for (const [k, v] of Object.entries(vm).slice(0, 2000)) {
          if (typeof k !== 'string' || k.length > 200 || !v || typeof v !== 'object') continue;
          if (v.follow === true) out.voiceMarks[k] = { follow: true };
          else if (typeof v.seg === 'string' && typeof v.text === 'string' && v.text) out.voiceMarks[k] = { seg: v.seg.slice(0, 60), off: Math.max(0, v.off | 0), len: Math.max(1, Math.min(200, v.len | 0)), text: v.text.slice(0, 200) };
        }
      }
      return out;
    };
  }
  function table() { scriptView(); }
  if (typeof vcRefresh === 'function') { const base = vcRefresh; vcRefresh = function () { base.apply(this, arguments); try { rebuildIfIdle(); scriptView(true); say(); } catch (e) { } }; }
  const renderVF = render; render = function () { const r = renderVF.apply(this, arguments); if (!dr.hidden) { try { rebuildIfIdle(); scriptView(); } catch (e) { } } return r; };
  rebuild(); say();

  window.__vf = {
    start, stop: () => off('已停止'), rehearse,
    feed(text) { if (!VF.on) return; VF.feedFull = (VF.feedFull || '') + norm(text); onHeard(VF.feedFull.slice(-40), VF.feedFull); say(); },
    state: () => ({ on: VF.on, engine: VF.engine, pos: VF.pos, cur: VF.cur, steps: VF.steps.length, status: VF.status, notice: VF.notice, stage: VF.stage, page, focus, rate: VF.rate, lead: lead(), lost: VF.lost }),
    trace: () => ({ info: VF.traceInfo, trace: VF.trace }),
    log: () => VF.log.map(x => x.join(' ')).join('\n'),
    steps: () => { if (!VF.on) rebuild(); return VF.steps.map(s => ({ page: s.page, focus: s.focus, detail: s.detail, kind: s.kind, label: s.label, how: s.how, trig: s.trig, at: s.at, weak: !!s.weak })); },
    script: () => (VF.T || buildScript()).S
  };
})();
/*EVD_VOICE_END*/
