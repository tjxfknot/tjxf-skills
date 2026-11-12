// node voice.cjs 成品.html [--rate 5.5] [--noise 0.08] [--lat 0.8] [--scene plain|adlib|manual|user] [--segs N]
// 语音跟读（voice.js）端到端：换上假的 SpeechRecognition，按语速把口播原文逐字“说”出来（掺错字、漏字），
// 中途模拟浏览器结束会话、no-speech、network；adlib 场景每 4 段插一句原稿外的话并整段跳过第 9 段；manual 场景 100 秒处手动按两下←；
// user 场景（用户 10-24 实测的情况）：每隔 3 句跳过一小句或换个说法。错字按真实识别的样子掺：六成同音字、一成半近音字（平翘舌、前后鼻音），其余乱字；
// --lat 模拟识别结果比嘴晚多少秒才出来（真实引擎 0.5～1.5 秒）。
// 量每一步：干净原稿讲到触发点的时刻 → 画面真的推进的时刻。真实麦克风和识别引擎不在这里测（见 release-20261023.md「未验」）。
// 通过：全部步骤都出了、没有提前 0.5 秒以上出的、照稿场景 90% 延迟 ≤1 秒。整套同济 14 页约 7 分钟，--segs 8 只跑前 8 段。
const { launch, path } = require('./_lib.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const argv = process.argv.slice(2), file = argv.find(a => !a.startsWith('--') && /\.html?$/i.test(a));
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const RATE = +opt('rate', 5.5), NOISE = +opt('noise', 0.08), SCENE = opt('scene', 'plain'), SEGS = +opt('segs', 0), LAT = +opt('lat', 0);
if (!file) { console.error('用法：node voice.cjs 成品.html [--rate 5.5] [--noise 0.08] [--scene plain|adlib|manual] [--segs N]'); process.exit(2); }
const POOL = '的一是了我不人在他有这个上们来到时大地为子中你说生国年着就那和要她出也得里后自以会家可下而过天去能对小多然于心学么之都好看起发当没成只如事把还用第样道想作种开美总从无情己面最女但现前些所同日手又行意动方期它头经长儿回位分爱老因很给名法间知世什两次使身者被高已亲其进此话常与活正感';
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
// 同音／近音字：拼音表在 ../../assets/engine/pinyin.js；只换成常用字（POOL）
const PYS = ((require('fs').readFileSync(path.join(__dirname, '../../assets/engine/pinyin.js'), 'utf8').match(/__EVD_PY="([^"]*)"/) || [])[1] || '').split('|').map(g => g.split(':'));
const CH2PY = new Map(); PYS.forEach(([y, cs], i) => { for (const c of cs || '') CH2PY.set(c, i); });
const COMMON = new Set(POOL.split(''));
const fz = y => y.replace(/^zh/, 'z').replace(/^ch/, 'c').replace(/^sh/, 's').replace(/ang$/, 'an').replace(/eng$/, 'en').replace(/ing$/, 'in');
function swapNoise(c) {
  const k = CH2PY.get(c), r = rnd();
  if (k != null && r < 0.6) { const same = PYS[k][1].split('').filter(x => x !== c && COMMON.has(x)); if (same.length) return same[Math.floor(rnd() * same.length)]; }
  if (k != null && r < 0.75) { const y = PYS[k][0]; const near = PYS.filter(([y2]) => y2 !== y && fz(y2) === fz(y)).flatMap(([, cs]) => cs.split('').filter(x => COMMON.has(x))); if (near.length) return near[Math.floor(rnd() * near.length)]; }
  return POOL[Math.floor(rnd() * POOL.length)];
}
const FAKE = `(()=>{const f=window.__fake={inst:null,results:[],ii:null,starts:0};
class FakeSR{constructor(){this.continuous=false;this.interimResults=false;this.lang='';this.processLocally=false;}
 start(){if(f.inst)throw new Error('InvalidStateError');f.inst=this;f.results=[];f.ii=null;f.starts++;setTimeout(()=>this.onstart&&this.onstart(),20);}
 stop(){this._end()} abort(){this._end()}
 _end(){if(f.inst!==this)return;f.inst=null;setTimeout(()=>this.onend&&this.onend(),15);}}
FakeSR.available=async()=>'available';FakeSR.install=async()=>true;
window.SpeechRecognition=FakeSR;window.webkitSpeechRecognition=FakeSR;
window.__fakeEmit=(t,fin)=>{const r=f.inst;if(!r)return false;if(f.ii==null){f.results.push({t,fin});f.ii=fin?null:f.results.length-1;}else{f.results[f.ii]={t,fin};if(fin)f.ii=null;}
 const list=f.results.map(x=>{const a=[{transcript:x.t,confidence:.9}];a.isFinal=x.fin;return a;});r.onresult&&r.onresult({resultIndex:list.length-1,results:list});return true;};
window.__fakeError=e=>{const r=f.inst;if(!r)return;r.onerror&&r.onerror({error:e});r._end();};
window.__fakeEnd=()=>{const r=f.inst;if(r)r._end();};})();`;
(async () => {
  const b = await launch(), errs = [];
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1400 } }); await ctx.addInitScript(FAKE);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e))); p.on('dialog', d => { errs.push('弹窗:' + d.message()); d.accept(); });
  await p.goto('file://' + path.resolve(file)); await p.evaluate(() => document.fonts.ready);
  if (!(await p.evaluate(() => !!window.__vf))) { console.log(JSON.stringify({ pass: false, error: '课件里没有语音跟读模块（voice.js）：python3 scripts/patch_modules.py 原.html 新.html --only voice' })); process.exit(1); }
  await p.evaluate(() => { const k = DECK.key; for (const x of Object.keys(localStorage)) if (x.includes(k) && !/voice-follow/.test(x)) localStorage.removeItem(x); });
  const data = await p.evaluate(() => ({ segs: (DATA.sourceSegments || []).filter(s => /^口播/.test(s.disposition || '') && s.text).map(s => s.text), steps: __vf.steps(), bounds: __vfState.T.bounds.map(b => [b.start, b.end]) }));
  if (!data.segs.length) { console.log(JSON.stringify({ pass: false, error: '没有口播原文（sourceSegments 里 disposition 以“口播”开头的段），这个脚本测不了' })); process.exit(1); }
  const segs = SEGS ? data.segs.slice(0, SEGS) : data.segs, lastPos = data.bounds[segs.length - 1][1];
  // 课件的「出卡提前」设成和模拟的识别延迟一样（真实使用时按引擎延迟调）
  await p.evaluate(l => { __vfState.latency = l; }, LAT);
  await p.click('#vcTop'); await sleep(300);
  if (!(await p.evaluate(() => __vf.state().on))) { console.log(JSON.stringify({ pass: false, error: '点「语音跟读」没开起来', status: await p.evaluate(() => __vf.state().status) })); process.exit(1); }
  const T0 = Date.now(), now = () => Date.now() - T0;
  const spoken = []; let normPos = 0; const fired = new Map(); let lastCur = -1, stop = false;
  const poll = (async () => { while (!stop) { const s = await p.evaluate(() => __vf.state()).catch(() => null); if (s && s.cur !== lastCur) { for (let k = lastCur + 1; k <= s.cur; k++) if (!fired.has(k)) fired.set(k, now()); lastCur = s.cur; } spoken.push([now(), normPos]); await sleep(60); } })();
  const nlen = t => p.evaluate(t => String(t).normalize('NFKC').toLowerCase().replace(/[零〇一二两三四五六七八九十百千]+/g, 'X').replace(/[\s\p{P}\p{S}]/gu, '').length, t);
  const emitNow = (t, fin) => p.evaluate(([t, fin]) => __fakeEmit(t, fin), [t, fin]).catch(() => false);
  // 识别延迟：话说出来 LAT 秒后结果才到
  const emit = (t, fin) => LAT ? (setTimeout(() => emitNow(t, fin), LAT * 1000), Promise.resolve(true)) : emitNow(t, fin);
  let sessionStart = 0, didNoSpeech = false, didNet = false, didManual = false;
  for (let si = 0; si < segs.length; si++) {
    const text = segs[si].replace(/【[^】]*】/g, '');
    if (SCENE === 'adlib' && si % 4 === 2) { const ad = '这个我多说一句啊大家一定要注意看清楚'; for (let k = 1; k <= ad.length; k++) { await emit(ad.slice(0, k), k === ad.length); await sleep(1000 / RATE); } await sleep(500); }
    if (SCENE === 'adlib' && si === 8) { normPos = data.bounds[si][1]; continue; }
    const sents = text.split(/(?<=[。！？!?；;])/).filter(x => x.trim());
    let off = 0, sn = 0;
    for (const sent of sents) {
      const at = text.indexOf(sent, off); off = at + sent.length; sn++;
      let cur = ''; const chars = [...sent];
      // user 场景：每 3 句挑一个 6～20 字的小句，一半跳过不念、一半换个说法（同样长的别的话）
      let skipA = -1, skipB = -1, para = false;
      if (SCENE === 'user' && (si * 7 + sn) % 3 === 0) { const cl = [...sent.matchAll(/[^，,、；;：:。！？!?]+[，,、；;：:。！？!?]?/g)].filter(m => m[0].length >= 6 && m[0].length <= 20); if (cl.length > 1) { const m = cl[1 + Math.floor(rnd() * (cl.length - 1))]; skipA = m.index; skipB = m.index + m[0].length; para = rnd() < 0.5; } }
      for (let k = 0; k < chars.length; k++) {
        const c = chars[k]; let o = c;
        if (k >= skipA && k < skipB) { if (!para) continue; o = POOL[Math.floor(rnd() * POOL.length)]; }
        else if (/[一-鿿]/.test(c)) { const r = rnd(); if (r < NOISE) o = swapNoise(c); else if (r < NOISE + 0.015) o = ''; }
        cur += o;
        if (k % 2 === 1 || k === chars.length - 1) { normPos = data.bounds[si][0] + Math.min(data.bounds[si][1] - data.bounds[si][0], await nlen(text.slice(0, at + k + 1))); if (!(await emit(cur, false))) await sleep(200); }
        await sleep(1000 / RATE);
      }
      await emit(cur, true); await sleep(450);
      if (now() - sessionStart > 50000) { await p.evaluate(() => __fakeEnd()); sessionStart = now(); await sleep(300); }
      if (!didNoSpeech && now() > 70000) { didNoSpeech = true; await p.evaluate(() => __fakeError('no-speech')); await sleep(400); }
      if (!didNet && now() > 140000) { didNet = true; await p.evaluate(() => __fakeError('network')); await sleep(1200); }
      if (SCENE === 'manual' && !didManual && now() > 100000) { didManual = true; await p.keyboard.press('ArrowLeft'); await sleep(150); await p.keyboard.press('ArrowLeft'); }
    }
    normPos = data.bounds[si][1]; await sleep(900);
  }
  await sleep(4000); stop = true; await poll;
  const fin = await p.evaluate(() => ({ state: __vf.state(), sessions: __fake.starts }));
  const rows = [], lat = [];
  for (let i = 1; i < data.steps.length; i++) {
    const s = data.steps[i]; if (s.trig > lastPos) break;
    const due = (spoken.find(x => x[1] >= s.trig) || [null])[0], f = fired.get(i), d = (f != null && due != null) ? (f - due) / 1000 : null;
    if (d != null) lat.push(d);
    rows.push({ step: i, page: s.page + 1, card: s.focus + 1, label: s.label.slice(0, 14), how: s.how, due: due != null ? +(due / 1000).toFixed(1) : null, fired: f != null ? +(f / 1000).toFixed(1) : null, delay: d != null ? +d.toFixed(2) : null });
  }
  lat.sort((a, b) => a - b); const q = k => lat.length ? +lat[Math.min(lat.length - 1, Math.floor(lat.length * k))].toFixed(2) : null;
  const missed = rows.filter(r => r.fired == null), early = rows.filter(r => r.delay != null && r.delay < -0.5);
  // 一步都没覆盖到（--segs 太小，开头几段都是短标题）不能算过
  if (!rows.length) errs.push('这几段原稿里没有讲解步骤，把 --segs 调大或去掉');
  const pass = !!rows.length && !missed.length && !early.length && !errs.length && (SCENE !== 'plain' || q(0.9) <= 1);
  console.log(JSON.stringify({ pass, scene: SCENE, rate: RATE, noise: NOISE, lat: LAT, steps: rows.length, missed: missed.length, early: early.length, delay: { median: q(0.5), p90: q(0.9), max: lat.length ? +lat.at(-1).toFixed(2) : null }, sessions: fin.sessions, errs }, null, 1));
  for (const r of rows) if (r.fired == null || r.delay < -0.5 || r.delay > 1) console.log(JSON.stringify(r));
  await b.close(); process.exit(pass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
