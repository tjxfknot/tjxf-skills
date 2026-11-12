// 渲染一段（record.cjs 调用，一般不直接用）：node worker.cjs 课件.html 输出.mp4 --pages a-b --fps 60 --hold 3 --frame 43|169
// 原理：无头 Chrome 打开课件进拍摄模式，按 → 的顺序推进；每帧把所有动画（Web Animations）暂停并拨到准确时刻再截图，
// 经管道交给 ffmpeg。不是实时录屏，不掉帧；动画结束后的停留时间复用最后一帧。
// 几个 Chrome 同时渲染时偶尔整页卡死（截图等不到画面）：重启浏览器，恢复到卡住的那一步那一帧，接着录（最多 5 次）。
// 结果写到 输出.json：{frames, relock, recover, errors}；输出.csv：每一步的起始秒。
const path = require('path'), fs = require('fs'), { spawn } = require('child_process'), { pathToFileURL } = require('url');
const { loadPlaywright, findChrome, findBin } = require('./env.cjs');
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Internal worker: node worker.cjs <deck.html> <output.mp4> --pages a-b --fps 60 --hold 3 --frame 43|169');
  process.exit(0);
}
const CHROME = findChrome(), FFMPEG = findBin('ffmpeg');

const argv = process.argv.slice(2), opt = k => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : null; };
const file = path.resolve(argv[0]), out = path.resolve(argv[1]);
const FPS = +(opt('fps') || 60), HOLD = +(opt('hold') || 3), FRAME = opt('frame') || '43';
const [P0, P1] = (opt('pages') || '1-999').split('-').map(Number);
const DT = 1000 / FPS;
const VP = FRAME === '169' ? { width: 1920, height: 1080, dpr: 2 } : { width: 1600, height: 1200, dpr: 1.8 };
const result = { frames: 0, relock: 0, recover: 0, errors: [] };
const limit = (pr, ms, what = '超时') => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(Error(what)), ms))]);
let S = null;   // 当前浏览器会话 {b, p, cdp, clip, rect, ref}
const fail = async msg => { result.fatal = msg; fs.writeFileSync(out.replace(/\.mp4$/, '.json'), JSON.stringify(result)); console.error(msg); if (S) await limit(S.b.close(), 5000).catch(() => { }); process.exit(3); };

// 页面里装好：逐帧拨动画的 __vtTick、锁住拍摄模式
function install() {
  window.__vt = { seen: new Map(), relock: 0 };
  // 课件的溢出检查在卡片滑入半途会误判“超出画面”并退出拍摄模式：录制期间锁住
  const _check = check;
  check = function () { const had = document.body.classList.contains('capture'); _check(); if (had && !document.body.classList.contains('capture')) { document.body.classList.add('capture'); __vt.relock++; } };
  // 每帧：先等“待启动”的动画真正启动（在它待启动时暂停，会和截图互相等待而卡死），
  // 再把这一步的动画拨到准确时刻：登记过的按登记时刻算，新出现的按 origin（缺省＝现在）算
  window.__vtTick = async (now, origin) => {
    if (!document.body.classList.contains('capture')) { document.body.classList.add('capture'); resize(); __vt.relock++; }
    const pend = document.getAnimations().filter(a => a.pending);
    if (pend.length) await Promise.race([Promise.all(pend.map(a => a.ready.catch(() => { }))), new Promise(r => setTimeout(r, 1000))]);
    let running = 0;
    for (const a of document.getAnimations()) {
      let st = __vt.seen.get(a);
      if (st === undefined) { if (a.playState === 'finished') continue; st = origin ?? now; __vt.seen.set(a, st); }
      const end = a.effect.getComputedTiming().endTime, t = now - st;
      if (t >= end) { if (a.playState !== 'finished') { try { a.finish(); } catch (e) { a.cancel(); } } }
      else { a.pause(); a.currentTime = t; running++; }   // 现实时间里已经播完的也拨回来，开头几帧才每次一样
    }
    return running;
  };
  // 刚 render／按 → 之后立刻调用：这一步的动画都从“这一步开头”（0 毫秒）算起。只登记、不暂停
  window.__vtFreeze = () => {
    __vt.seen = new Map();
    for (const a of document.getAnimations()) if (a.playState !== 'finished') __vt.seen.set(a, 0);
  };
}

// 开一个浏览器，摆到 at 状态（{page,focus,detailStep}，页码从 1 起）刚按下 → 的那一刻；at=null 表示整段开头
async function boot(at) {
  const { chromium } = loadPlaywright();
  // 几段同时渲染时，无头 Chrome 偶尔把页面当后台节流：显式关掉。（试过关 GPU，卡死反而更多，默认开着；KJ_NOGPU=1 可关）
  const args = ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-features=CalculateNativeWinOcclusion'].concat(process.env.KJ_NOGPU ? ['--disable-gpu'] : []);
  if (!CHROME) { S = null; await fail('没找到 Google Chrome 或 Microsoft Edge：先装 Google Chrome'); }
  const b = await chromium.launch({ executablePath: CHROME, headless: true, args });
  const ctx = await b.newContext({ viewport: { width: VP.width, height: VP.height }, deviceScaleFactor: VP.dpr });
  const p = await ctx.newPage();
  p.on('pageerror', e => result.errors.push(String(e)));
  p.on('dialog', d => d.dismiss());
  await p.goto(pathToFileURL(file).href); await p.evaluate(() => document.fonts.ready);
  const ok = await p.evaluate(() => ['step', 'capture', 'render', 'check', 'resize', 'detailCount', 'cancelMotion'].every(f => typeof window[f] === 'function') && typeof DATA === 'object' && Array.isArray(DATA.pages));
  if (!ok) { S = { b }; await fail('这份 HTML 不是单页引擎口播课件（缺 step/capture/render 等），不支持'); }
  await p.evaluate(install);
  await p.evaluate(([p0, at]) => {
    showAll = false;
    if (at ? (at.page === 1 && at.focus === -1) : p0 <= 1) {        // 第一页开头：走入场动画
      DATA.reduceMotion = false; page = 0; focus = -1; detailStep = 0; lastPage = -1; render(); __vtFreeze(); capture(true);
    } else if (at) {                                                  // 恢复：先摆到目标状态，退一步得到上一状态，再按 →
      DATA.reduceMotion = true; page = at.page - 1; focus = at.focus; detailStep = at.detailStep; render();
      step(-1); capture(true); cancelMotion(); DATA.reduceMotion = false; step(1); __vtFreeze();
    } else {                                                          // 分段开头：上一页摆成“讲完”，再按 →
      DATA.reduceMotion = true; page = p0 - 2; focus = DATA.pages[page].groups.length - 1; detailStep = 0; render(); detailStep = detailCount() - 1; render();
      capture(true); cancelMotion(); DATA.reduceMotion = false; step(1); __vtFreeze();
    }
  }, [P0, at]);
  if (!await p.evaluate(() => document.body.classList.contains('capture'))) { S = { b }; await fail(`进不了拍摄模式（第 ${P0} 页内容超出画面？先在浏览器里按 F 试试）`); }
  const cdp = await ctx.newCDPSession(p);
  const rect = async () => JSON.stringify(await p.evaluate(() => { const e = document.querySelector('.screen').getBoundingClientRect(); return { x: e.left, y: e.top, width: e.width, height: e.height }; }));
  const ref = await rect();
  const clip = FRAME === '169' ? { x: 0, y: 0, width: VP.width, height: VP.height } : JSON.parse(ref);
  return { b, p, cdp, clip, rect, ref };
}

// 截图走 CDP 快速 PNG（无损；有照片底图时比 Playwright 默认截图快 5 倍），按设备像素比放大到 4K；限时 8 秒
const shot = () => limit(S.cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, clip: { ...S.clip, scale: VP.dpr } }), 8000, '截图超时')
  .then(r => Buffer.from(r.data, 'base64'));

(async () => {
  S = await boot(null);
  if (!FFMPEG) return fail('没找到 ffmpeg（工具包不完整？重新解压一次）');
  const enc = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const write = async buf => { if (!enc.stdin.write(buf)) await new Promise(r => enc.stdin.once('drain', r)); };
  const ev = (fn, arg) => limit(S.p.evaluate(fn, arg), 10000, '页面无响应');
  const N = await ev(() => DATA.pages.length), last = Math.min(P1, N);

  const rows = [['序号', '页', '页id', '讲到', '视频起始秒']];
  let idx = 0;
  while (true) {
    const st = await ev(() => ({ page: page + 1, focus, detailStep, id: DATA.pages[page].id, title: focus >= 0 ? EditDesk.plain(DATA.pages[page].groups[focus].title || DATA.pages[page].groups[focus].label || '').replace(/[\r\n]+/g, ' ').replace(/,/g, '，').trim() : '（页面出现）' }));  // 标题里的换行、逗号会把时间表拆乱（2026-10-14 电子信息课件出过）
    if (st.page > last) break;
    rows.push([++idx, st.page, st.id, st.title, (result.frames / FPS).toFixed(2)]);
    (result.steps ||= []).push({ page: st.page, id: st.id, title: st.title, t: result.frames / FPS });   // 给 record.cjs 用的结构化时间表
    const total = Math.max(1, Math.round(HOLD * FPS));
    let k = 0, buf = null, resumed = false;
    for (; k < total; k++) {
      let running;
      try {
        running = await ev(([now, o]) => __vtTick(now, o), [k * DT, resumed ? 0 : null]); resumed = false;
        buf = await shot();
      } catch (e) {
        // 卡死：重启浏览器，恢复到这一步刚按 → 的状态，新出现的动画从这一步开头算起，重拍这一帧
        if (++result.recover > 5) return fail(`第 ${st.page} 页反复卡死（已重启浏览器 5 次），放弃`);
        await limit(S.b.close(), 5000).catch(() => { });
        S = await boot({ page: st.page, focus: st.focus, detailStep: st.detailStep });
        resumed = true; k--; continue;
      }
      await write(buf); result.frames++;
      if (!running && k > 2) { k++; break; }
    }
    for (; k < total; k++) { await write(buf); result.frames++; }
    if (await limit(S.rect(), 10000, '页面无响应') !== S.ref) { enc.stdin.end(); return fail(`第 ${st.page} 页画面位置变了（退出了拍摄模式？）`); }
    process.stdout.write(`\r已出 ${(result.frames / FPS).toFixed(1)} 秒（第${st.page}页）`);
    // 先把没播完的动画拨到结尾（停留比动画短时），再按 →
    const done = await ev(() => { for (const a of document.getAnimations()) { try { a.finish(); } catch (e) { a.cancel(); } } const before = [page, focus, detailStep].join(); step(1); __vtFreeze(); return before === [page, focus, detailStep].join(); });
    if (done) break;
  }
  enc.stdin.end(); await new Promise(r => enc.on('close', r));
  result.relock = await ev(() => __vt.relock).catch(() => result.relock);
  fs.writeFileSync(out.replace(/\.mp4$/, '.csv'), rows.map(r => r.join(',')).join('\n'));
  fs.writeFileSync(out.replace(/\.mp4$/, '.json'), JSON.stringify(result));
  await limit(S.b.close(), 5000).catch(() => { });
})().catch(e => fail('渲染出错：' + e.message));
