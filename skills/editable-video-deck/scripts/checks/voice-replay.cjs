// node voice-replay.cjs 成品.html 跟读记录.json [--speed 1]
// 回放用户在「标黄稿 → 设置与排查 → 导出这次跟读记录」导出的真实识别结果：按原来的时间把每一次识别结果喂给课件（假识别器），
// 列出每一步什么时候出、当时听到的字，以及“一直有字进来、位置却不动”的跟丢段（≥4 秒）——调定位算法用。
// 课件可以是改过算法的新版本：同一份真实记录，新旧版本各回放一次，比哪一版跟得好。
const { launch, path, fs } = require('./_lib.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const argv = process.argv.slice(2), files = argv.filter(a => !a.startsWith('--'));
const SPEED = +((argv[argv.indexOf('--speed') + 1]) || 1) || 1;
if (files.length < 2) { console.error('用法：node voice-replay.cjs 成品.html 跟读记录.json [--speed 1]'); process.exit(2); }
const rec = JSON.parse(fs.readFileSync(files[1], 'utf8'));
if (rec.kind !== 'evd-voice-trace') { console.error('不是跟读记录（kind≠evd-voice-trace）'); process.exit(2); }
const FAKE = `(()=>{const f=window.__fake={inst:null,list:[]};
class FakeSR{constructor(){this.processLocally=false;}
 start(){f.inst=this;f.list=[];setTimeout(()=>this.onstart&&this.onstart(),5);} stop(){this._end()} abort(){this._end()}
 _end(){if(f.inst!==this)return;f.inst=null;setTimeout(()=>this.onend&&this.onend(),5);}}
FakeSR.available=async()=>'available';FakeSR.install=async()=>true;
window.SpeechRecognition=FakeSR;window.webkitSpeechRecognition=FakeSR;
window.__replay=(ri,len,ch)=>{const r=f.inst;if(!r)return false;f.list.length=len;ch.forEach((c,k)=>{const a=[{transcript:c[0],confidence:.9}];a.isFinal=!!c[1];f.list[ri+k]=a;});
 for(let i=0;i<len;i++)if(!f.list[i]){const a=[{transcript:'',confidence:0}];a.isFinal=true;f.list[i]=a;}
 r.onresult&&r.onresult({resultIndex:ri,results:f.list.slice()});return true;};
window.__replayEnd=()=>{const r=f.inst;if(r)r._end();};})();`;
(async () => {
  const b = await launch(), errs = [];
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1300 } }); await ctx.addInitScript(FAKE);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e))); p.on('dialog', d => d.accept());
  await p.goto('file://' + path.resolve(files[0])); await p.evaluate(() => document.fonts.ready);
  const info = rec.info || {};
  if (info.latency != null) await p.evaluate(l => { __vfState.latency = l; }, info.latency);
  await p.evaluate(([pg, fc]) => { if (pg != null) { page = pg; focus = fc == null ? -1 : fc; render(); } }, [info.startPage, info.startFocus]);
  await p.click('#vcTop'); await sleep(300);
  const T0 = Date.now(), fired = [], stalls = []; let lastCur = -1, lastPos = -1, lastPosAt = 0, lastHeardAt = 0, stop = false, heard = '';
  const poll = (async () => { while (!stop) { const s = await p.evaluate(() => ({ st: __vf.state(), h: __vfState.heard })).catch(() => null);
    if (s) { const t = Date.now() - T0; heard = s.h || heard;
      if (s.st.cur !== lastCur) { for (let k = lastCur + 1; k <= s.st.cur; k++) fired.push([t, k, heard.slice(-14)]); lastCur = s.st.cur; }
      if (s.st.pos !== lastPos) { if (lastPosAt && t - lastPosAt > 4000 && lastHeardAt - lastPosAt > 3000) stalls.push([lastPosAt, t, heard.slice(-20)]); lastPos = s.st.pos; lastPosAt = t; } }
    await sleep(80); } })();
  let first = true;
  for (const ev of rec.trace) {
    const due = ev[1] / SPEED, wait = due - (Date.now() - T0); if (wait > 0) await sleep(wait);
    if (ev[0] === 's') { if (!first) { await p.evaluate(() => __replayEnd()); await sleep(150); } first = false; }
    if (ev[0] === 'r') { await p.evaluate(([ri, len, ch]) => __replay(ri, len, ch), [ev[2], ev[3], ev[4]]); lastHeardAt = Date.now() - T0; }
  }
  await sleep(3000); stop = true; await poll;
  const steps = await p.evaluate(() => __vf.steps());
  const orig = rec.trace.filter(e => e[0] === 'f');
  console.log(JSON.stringify({ deck: info.deck, engine: info.engine, mode: info.mode, latency: info.latency, events: rec.trace.length, firedReplay: fired.length, firedOriginal: orig.length, stalls: stalls.length, errs }, null, 1));
  console.log('\n回放出卡（时间｜第几页第几条｜当时听到的最后几个字）：');
  for (const [t, k, h] of fired) { const s = steps[k]; if (!s) continue; const o = orig.find(e => e[2] >= k); console.log((t / 1000).toFixed(1).padStart(6) + 's', (s.page + 1) + (s.focus >= 0 ? '-' + (s.focus + 1) : '页'), s.label.slice(0, 12).padEnd(12), '|', h, o ? (o[2] === k ? '｜原来 ' : '｜原来一起跳过，') + (o[1] / 1000).toFixed(1) + 's' : '｜原来没出'); }
  if (stalls.length) { console.log('\n跟丢段（一直有字进来、位置不动 ≥4 秒）：'); for (const [a, z, h] of stalls) console.log('  ' + (a / 1000).toFixed(1) + '–' + (z / 1000).toFixed(1) + 's，结束时听到：' + h); }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
