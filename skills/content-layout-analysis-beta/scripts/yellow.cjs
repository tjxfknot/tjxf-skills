#!/usr/bin/env node
// 规划时标黄（测试版 0.6.0-beta）：把内容.json 里每张卡、每次翻页标的黄底（从口播原文逐字照抄的几个字）
// 核对一遍，再换算成课件 DATA.voiceMarks（语音跟读的触发点）；也能出一份「展板标黄版」样式的标黄稿给人过目。
//
// 用法：
//   node yellow.cjs 内容.json                 # 只核对，打印报告；有问题退出码 1
//   node yellow.cjs 内容.json --json          # 打印 {ok, marks, problems, warnings, stats}（build_deck.py 用）
//   node yellow.cjs 内容.json --draft 标黄稿.html [--title 标题] [--plan 规划.json]
//
// 内容.json 里怎么写（见 references/plan-schema.md「标黄」）：
//   页：  "turnYellow": {"seg": "S20", "text": "再往后"}            翻到这一页的触发点（第一页可省）
//   卡：  "yellow": {"seg": "S21", "text": "入学不分专业"}          念到这几个字出这张卡
//         "yellow": {"follow": true}                                原稿里没讲到，紧跟上一处出
//   高亮："highlights": [{..., "yellow": {...}}]
//   可选 "nth": 2 —— 同一段里第几次出现（默认：同一段里接着上一处往后找第一次）
//
// 归一（norm）取自本集合跟读引擎，随本技能独立提供。
const fs = require('fs'), path = require('path');
const argv = process.argv.slice(2);
const file = argv.find(a => !a.startsWith('--') && /\.json$/i.test(a));
const opt = k => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : null; };
const has = k => argv.includes('--' + k);
if (!file) { console.error('用法：node yellow.cjs 内容.json [--json] [--draft 标黄稿.html --title 标题 --plan 规划.json]'); process.exit(2); }

// Same normalization as this collection’s voice-follow engine, bundled locally.
const norm = require('./voice-normalize.cjs');

const d = JSON.parse(fs.readFileSync(file, 'utf8'));
const pages = Array.isArray(d) ? d : d.pages;
const segsAll = (d.sourceSegments || []);
const segById = new Map(segsAll.map(s => [s.id, s]));
const ids = new Set(pages.map(p => p.id));

// ---- 原稿全文：和 voice.js buildScript() 一样（口播段、去【】、归一） ----
// 另记 raw→txt 的位置换算（txt＝去掉【…】换成空格后的文字，norm 的 map 指向 txt）
function strip(raw) {
  let txt = '', r2t = new Int32Array(raw.length + 1), i = 0;
  const re = /【[^】]*】/g; let m, last = 0;
  while ((m = re.exec(raw))) {
    for (; i < m.index; i++) { r2t[i] = txt.length; txt += raw[i]; }
    for (; i < m.index + m[0].length; i++) r2t[i] = -1;      // 【】里的字：不在跟读原稿里
    txt += ' '; last = re.lastIndex;
  }
  for (; i < raw.length; i++) { r2t[i] = txt.length; txt += raw[i]; }
  r2t[raw.length] = txt.length;
  return { txt, r2t };
}
const T = { S: '', bounds: [] };
for (const seg of segsAll) {
  if (!/^口播/.test(seg.disposition || '') || !seg.text) continue;
  const raw = String(seg.text), st = strip(raw), n = norm(st.txt, true);
  if (!n.s) continue;
  T.bounds.push({ id: seg.id, screen: ids.has(seg.screenId) ? seg.screenId : null, start: T.S.length, end: T.S.length + n.s.length, raw, st, n });
  T.S += n.s;
}
const bound = new Map(T.bounds.map(b => [b.id, b]));

// ---- 讲解步骤：和 voice.js buildSteps() 同序（每页：翻页 → 每张卡 → 卡里的高亮） ----
const steps = [];
const plain = s => String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
pages.forEach((p, pi) => {
  if (p.voiceSkip) return;
  steps.push({ key: p.id + '/_turn', kind: 'turn', pi, tag: '▶' + (pi + 1), name: '翻到第' + (pi + 1) + '页 · ' + plain(p.title), spec: p.turnYellow, page: p });
  (p.groups || []).forEach((g, gi) => {
    steps.push({ key: p.id + '/' + g.id, kind: 'card', pi, gi, tag: (pi + 1) + '-' + (gi + 1), name: '第' + (pi + 1) + '页第' + (gi + 1) + '条 · ' + plain(g.title || g.label), spec: g.yellow, page: p, g });
    (g.highlights || []).forEach((h, j) => steps.push({ key: p.id + '/' + g.id + '/h' + (j + 1), kind: 'highlight', pi, gi, tag: (pi + 1) + '-' + (gi + 1) + '·亮' + (j + 1), name: '高亮 ' + (h.terms || []).join('、'), spec: h.yellow, page: p, g }));
  });
});

const problems = [], warnings = [], marks = {};
const anyYellow = steps.some(s => s.spec);
const cursor = new Map();          // 段 id → 上一处标黄在 raw 里的结束位置（同一段里接着往后找）
let prevPos = -1, prevStep = null;
for (const s of steps) {
  const sp = s.spec, where = s.name;
  if (!sp) {
    if (anyYellow && !(s.kind === 'turn' && s.pi === 0)) problems.push(`${where}：没标黄（标触发的那几个字；原稿里没讲到的写 {"follow": true}）`);
    continue;
  }
  if (sp.follow === true) { marks[s.key] = { follow: true }; s.follow = true; continue; }
  const seg = segById.get(sp.seg), b = bound.get(sp.seg), text = String(sp.text || '');
  if (!seg) { problems.push(`${where}：段落 ${sp.seg} 不存在`); continue; }
  if (!b) { problems.push(`${where}：段落 ${sp.seg} 不是口播原文（disposition 要以“口播”开头），跟读的原稿里没有它`); continue; }
  if (!text) { problems.push(`${where}：黄底文字是空的`); continue; }
  // 逐字照抄：必须是原文里的一段
  const occ = []; for (let k = b.raw.indexOf(text); k >= 0; k = b.raw.indexOf(text, k + 1)) occ.push(k);
  if (!occ.length) { problems.push(`${where}：${sp.seg} 原文里找不到「${text}」（要从口播原文逐字照抄，标点、数字写法都照原文）`); continue; }
  let ri;
  if (sp.nth) { ri = occ[sp.nth - 1]; if (ri == null) { problems.push(`${where}：「${text}」在 ${sp.seg} 里只出现 ${occ.length} 次，没有第 ${sp.nth} 次`); continue; } }
  else { const c = cursor.get(sp.seg) || 0; ri = occ.find(k => k >= c); if (ri == null) ri = occ[0]; }
  const ti = b.st.r2t[ri];
  if (ti < 0 || b.st.r2t[ri + text.length - 1] < 0) { problems.push(`${where}：「${text}」在【】里，【】里的字不进跟读原稿（不口播）`); continue; }
  const nt = norm(text);
  if (!nt) { problems.push(`${where}：「${text}」只有标点或空白`); continue; }
  // 原文位置 → 归一位置：找归一文字在本段里、落在这个原文位置上的那一次（中文数字整串转换，起点可能前移到数字串开头）
  const ns = b.n.s, map = b.n.map; let off = -1;
  for (let k = ns.indexOf(nt); k >= 0; k = ns.indexOf(nt, k + 1)) { if (map[k] >= ti - 8 && map[k] < ti + text.length) { off = k; break; } }
  if (off < 0) { problems.push(`${where}：「${text}」归一后是「${nt}」，在 ${sp.seg} 里对不上（多半是起点切在中文数字中间，如“一百三十”只标了“三十”；把整个数字标进去）`); continue; }
  const pos = b.start + off;
  marks[s.key] = { seg: sp.seg, off, len: nt.length, text: nt };
  Object.assign(s, { at: pos, len: nt.length, seg: sp.seg, rawAt: ri, rawLen: text.length, text });
  cursor.set(sp.seg, ri + text.length);
  if (pos < prevPos) problems.push(`顺序倒了：${where}「${text}」在原稿里比上一处 ${prevStep.name}「${prevStep.text}」还靠前（出场顺序要和原稿先后一致；同一段里重复出现的词可以写 nth）`);
  else if (pos === prevPos) warnings.push(`${where}和${prevStep.name}标在同一个字上，会一起出`);
  if (b.screen && b.screen !== s.page.id) warnings.push(`${where}：标在 ${sp.seg}（第${pages.findIndex(p => p.id === b.screen) + 1}页的口播段）里，不是本页的段——确认这句话讲的就是这张卡`);
  if (nt.length > 16) warnings.push(`${where}：黄底「${text}」有 ${nt.length} 个字，标触发的那几个字就行（2–8 字）`);
  if (nt.length < 2 && s.kind !== 'turn') warnings.push(`${where}：黄底只有 1 个字「${text}」，太短，跟读时认不准`);
  prevPos = pos; prevStep = s;
}
const stats = {
  steps: steps.length, marked: steps.filter(s => s.at != null).length, follow: steps.filter(s => s.follow).length,
  turns: steps.filter(s => s.kind === 'turn' && s.at != null).length, missing: steps.filter(s => !s.spec && !(s.kind === 'turn' && s.pi === 0)).length,
  scriptChars: T.S.length, anyYellow
};

if (has('json')) { process.stdout.write(JSON.stringify({ ok: !problems.length, marks, problems, warnings, stats })); process.exit(problems.length ? 1 : 0); }

if (opt('draft')) writeDraft(opt('draft'));
console.log(`标黄核对：${stats.steps} 处动画（含翻页）；标在原稿上 ${stats.marked} 处（翻页 ${stats.turns}），紧跟上一处 ${stats.follow} 处，没标 ${stats.missing} 处`);
if (!anyYellow) console.log('△ 内容里没有标黄：构建后跟读按自动猜的位置（触发词／标题词），建议回到规划补标黄');
problems.forEach(x => console.log('✗ ' + x));
warnings.forEach(x => console.log('△ ' + x));
if (!problems.length && anyYellow) console.log('✓ 每处黄底都在它那段口播原文里找到了，先后顺序和出场顺序一致');
process.exit(problems.length ? 1 : 0);

// ---- 标黄稿（展板标黄版样式）：整篇口播按顺序，【展板 03 页标题】标页，黄底＝念到就出，右上小字＝第几页第几条 ----
function writeDraft(out) {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const title = opt('title') || (pages[0] ? plain(pages[0].title).split(/[｜|]/)[0] : '') + '｜完整口播提示稿（展板标黄版）';
  // 每段里要插的东西：黄底（起止 raw 位置）、翻页标记、紧跟的虚线框
  const bySeg = new Map(), follows = new Map();
  let lastMarked = null;
  for (const s of steps) {
    if (s.at != null) { (bySeg.get(s.seg) || bySeg.set(s.seg, []).get(s.seg)).push(s); lastMarked = s; }
    else if (s.follow || !s.spec) { const k = lastMarked ? lastMarked.key : '_start'; (follows.get(k) || follows.set(k, []).get(k)).push(s); }
  }
  const boardOf = p => {
    const pi = pages.indexOf(p), items = [];
    steps.filter(s => s.page === p && s.kind !== 'turn').forEach(s => items.push(`<span class="it${s.follow ? ' fo' : ''}${!s.spec ? ' miss' : ''}"><b>${esc(s.tag)}</b> ${esc(plain(s.g && (s.g.title || s.g.label) || s.name))}${s.text ? ' <i>←「' + esc(s.text) + '」</i>' : s.follow ? ' <i>← 紧跟上一处</i>' : ' <i>← 没标</i>'}</span>`));
    return `<p class="board">【展板 ${String(pi + 1).padStart(2, '0')} ${esc(plain(p.title))}】</p>` + (items.length ? `<p class="items">${items.join('')}</p>` : '');
  };
  const chip = s => `<span class="follow" title="${esc(s.name)}">＋${esc(s.tag)} ${esc(plain(s.g && (s.g.title || s.g.label) || '').slice(0, 14))}</span>`;
  const turnsAt = new Map();      // 翻页在某段 raw 位置之前插【展板】
  steps.filter(s => s.kind === 'turn').forEach(s => { if (s.at != null) turnsAt.set(s.key, s); });
  let html = '';
  // 第一页（没标翻页时）展板标记放最前
  const first = steps.find(s => s.kind === 'turn');
  if (first && first.at == null) html += boardOf(first.page) + (follows.get(first.key) || []).map(chip).join('');
  for (const seg of segsAll) {
    const isVoice = /^口播/.test(seg.disposition || '') && seg.text;
    if (!isVoice) { html += `<p class="note"><span>${esc(seg.disposition || '备注')}</span>${esc(seg.text || '')}</p>`; continue; }
    const raw = String(seg.text), list = (bySeg.get(seg.id) || []).slice().sort((x, y) => x.rawAt - y.rawAt || steps.indexOf(x) - steps.indexOf(y));
    let para = '<p>', o = 0;
    for (const s of list) {
      if (s.rawAt > o) { para += esc(raw.slice(o, s.rawAt)); o = s.rawAt; }
      if (s.kind === 'turn') {
        // 翻页：在这儿断段、插【展板】标记
        if (para !== '<p>') html += para + '</p>';
        html += boardOf(s.page) + (follows.get(s.key) || []).map(chip).join('');
        para = '<p>';
      }
      const a = Math.max(o, s.rawAt), e = s.rawAt + s.rawLen;
      if (e > a) { para += `<mark class="${s.kind}" title="${esc(s.name)}">${esc(raw.slice(a, e))}</mark>`; o = e; }
      para += `<sup class="${s.kind}">${esc(s.tag)}</sup>`;
      if (s.kind !== 'turn') para += (follows.get(s.key) || []).map(chip).join('');
    }
    para += esc(raw.slice(o)) + '</p>';
    html += para;
  }
  const sum = `共 ${pages.length} 页、${stats.steps} 处动画（含翻页）：黄底 ${stats.marked} 处（其中翻页 ${stats.turns} 处），紧跟上一处 ${stats.follow} 处` + (stats.missing ? `，<b class="bad">没标 ${stats.missing} 处</b>` : '') + '。';
  const prob = problems.length ? `<div class="prob"><b>核对没通过（构建会停下）：</b><br>${problems.map(esc).join('<br>')}</div>` : '';
  const warn = warnings.length ? `<div class="warn"><b>提醒：</b><br>${warnings.map(esc).join('<br>')}</div>` : '';
  const doc = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{--ink:#1f2329;--sub:#646a73;--line:#dee0e3;--yellow:rgb(255,233,40);--red:#d83931;--blue:#245bdb;--bg:#fff}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--ink:#e6e6e6;--sub:#a3a8b0;--line:#3a3d42;--bg:#1b1c1e}}
html{background:var(--bg)}body{max-width:820px;margin:0 auto;padding:32px 20px 80px;color:var(--ink);background:var(--bg);font:17px/1.9 "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;text-spacing-trim:normal;text-autospace:normal;line-break:strict}
h1{font-size:26px;line-height:1.4;margin:0 0 12px}
.lead{color:var(--sub);font-size:15px;line-height:1.75;border-left:3px solid var(--line);padding:2px 0 2px 12px;margin:0 0 20px}
p{margin:0 0 12px}
mark{background:var(--yellow);color:#1f2329;padding:0 1px;border-radius:2px}
sup{font-size:11px;font-weight:700;color:var(--red);margin:0 3px 0 1px;vertical-align:super;line-height:0;white-space:nowrap}
sup.turn{color:var(--blue)}
.board{font-weight:700;margin:26px 0 4px}
.items{font-size:13px;line-height:1.7;color:var(--sub);margin:0 0 10px;display:flex;flex-wrap:wrap;gap:2px 14px}
.items b{color:var(--red)}.items i{font-style:normal;opacity:.85}.items .fo i,.items .miss i{color:var(--red)}
.follow{display:inline-block;border:1px dashed var(--red);color:var(--red);font-size:12px;line-height:1.5;padding:0 6px;border-radius:4px;margin:0 3px;vertical-align:1px}
.note{font-size:13px;line-height:1.7;color:var(--sub);background:color-mix(in srgb,var(--line) 35%,transparent);padding:8px 12px;border-radius:6px}
.note span{font-weight:700;margin-right:8px}
.prob{border:2px solid var(--red);padding:10px 14px;border-radius:6px;margin:0 0 16px;font-size:14px;line-height:1.7}
.warn{border:1px solid var(--line);padding:10px 14px;border-radius:6px;margin:0 0 16px;font-size:13px;line-height:1.7;color:var(--sub)}
.bad{color:var(--red)}
@media print{body{max-width:none}.items{break-inside:avoid}}
</style></head><body>
<h1>${esc(title)}</h1>
<p class="lead">${sum}黄色是展板对应词句：<b>念到黄底这几个字，就出下一处动画</b>（语音跟读替你按一下）；黄底后面的小红字是第几页第几条，蓝字 ▶ 是翻页；【展板 03 …】这样的标记是页码提示，不口播；红虚线框＝原稿里没讲到、紧跟上一处出的卡。灰底是原稿备注，不口播。<br>这份稿用于检查规划时标注的触发点。导入课件引擎前须核对目标版本是否支持 voiceMarks；稳定版仍需填写 cue.phrases。位置不对，可指出第几页第几条应改到哪几个字。</p>
${prob}${warn}${html}
</body></html>`;
  fs.writeFileSync(out, doc);
  console.log('标黄稿：' + out);
}
