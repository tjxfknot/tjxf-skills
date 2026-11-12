// 口播课件 → 4K 视频，一条命令跑完：预检 → 分段并行渲染 → 无缝拼接 → 自检 → 放桌面 → 打印几行摘要。
// 用法：node record.cjs 课件.html [--fps 60] [--hold 3] [--frame 43|169] [--pages 3-5] [--workers 4] [--out 目录] [--no-desktop]
//       node record.cjs --newest [课件名]   录“下载”文件夹里最新导出的那份（编辑台点「录成视频」后用；给课件名就只在同名导出里找）
//   --frame 43＝2880×2160（课件原比例，默认）；169＝3840×2160（4:3 居中，两侧补底色）
//   --hold  每一步（页面出现、每讲一条）停几秒，默认 3
// 输出：<课件所在目录>/录制/（课件在下载文件夹时放 影片/课件录视频）<课件名>_<尺寸>_<帧率>帧_每步<秒>秒.mp4＋同名.csv（每步起始秒）＋同名_总览.png；
//       mp4 和 csv 另复制一份到桌面。进度写在同名_日志/ 里，屏幕上只打印摘要（省 token）。
// Mac 和 Windows 通用；工具、浏览器、文件夹怎么找见 env.cjs。
const path = require('path'), fs = require('fs'), os = require('os'), { spawn, spawnSync, execFileSync } = require('child_process');
const { findBin, findChrome, loadPlaywright, folder, version } = require('./env.cjs');
const argv = process.argv.slice(2), opt = k => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : null; };
if (argv.includes('--help') || argv.includes('-h')) {
  console.log('Usage: node record.cjs <deck.html> | --newest [name] [--hold 3] [--fps 60] [--frame 43|169] [--pages 1-2] [--workers 2] [--out directory] [--no-desktop]');
  console.log('Environment: NODE_PATH, PLAYWRIGHT_MODULE, CHROME_PATH, KJ_FFMPEG, KJ_FFPROBE, KJ_DOWNLOADS, KJ_DESKTOP, KJ_OUTPUT. No dependencies bundled.');
  process.exit(0);
}
const say = s => console.log(s), die = s => { console.log('✗ ' + s); process.exit(1); };

const dl = folder('downloads');
const stripN = f => f.replace(/ \(\d+\)(\.html?)$/i, '$1');
let file;
if (argv[0] === '--newest') {
  // 编辑台「录成视频」导出的那份：下载文件夹里最新的 HTML（给了课件名就只看同名的，浏览器重名会加 (1)(2)）
  const want = argv[1] && !argv[1].startsWith('--') ? argv[1].replace(/\.html?$/i, '') : '';
  let cand = [];
  try { cand = fs.readdirSync(dl).filter(f => /\.html?$/i.test(f) && (!want || stripN(f).replace(/\.html?$/i, '') === want)); } catch (e) { }
  cand = cand.map(f => path.join(dl, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  if (!cand.length) die(`下载文件夹里没找到${want ? '「' + want + '」的' : ''}导出 HTML：先在课件里点「录成视频」或「导出 HTML」`);
  file = cand[0];
  say(`录这份：${path.basename(file)}（${new Date(fs.statSync(file).mtimeMs).toLocaleString('zh-CN')} 导出）`);
} else {
  if (!argv[0] || argv[0].startsWith('--')) die('用法：node record.cjs 课件.html [--fps 60] [--hold 3] [--frame 43|169] [--pages 3-5]，或 node record.cjs --newest [课件名]');
  file = path.resolve(argv[0]);
}
if (!fs.existsSync(file)) die('找不到文件：' + file);
const FPS = +(opt('fps') || 60), HOLD = +(opt('hold') || 3), FRAME = opt('frame') === '169' ? '169' : '43';
if (!Number.isInteger(FPS) || FPS <= 0 || !Number.isFinite(HOLD) || HOLD <= 0) die('帧率须为正整数，每步秒数须为有限正数');
if (opt('frame') && !['43','169'].includes(opt('frame'))) die('frame 只能为 43 或 169');
const SIZE = FRAME === '169' ? '3840x2160' : '2880x2160';
const W = +(opt('workers') || Math.max(1, Math.min(4, Math.floor(os.cpus().length / 2))));

if (!Number.isInteger(W) || W < 1 || W > 32) die('workers 须为 1..32 的整数');

// ---------- 预检 ----------
const FFMPEG = findBin('ffmpeg'), FFPROBE = findBin('ffprobe');
if (!FFMPEG) die('没找到 ffmpeg（工具包不完整就重新解压一次；本机用 skill 时：brew install ffmpeg）');  // ffprobe 可有可无，没有就用 ffmpeg 读参数
if (!findChrome()) die('没找到 Google Chrome 或 Microsoft Edge：先安装 Google Chrome');
try { loadPlaywright(); } catch (e) { die(e.message); }
const html = fs.readFileSync(file, 'utf8');
const m = html.match(/\/\*DATA_START\*\/\s*let DATA = ([\s\S]*?);\s*\/\*DATA_END\*\//);
if (!m) die('这份 HTML 不是单页引擎口播课件（找不到 DATA），不支持');
let D; try { D = JSON.parse(m[1]); } catch (e) { die('课件里的 DATA 读不出来，不支持'); }
if (!Array.isArray(D.pages) || !D.pages.length) die('这份 HTML 不是单页引擎口播课件（DATA 里没有 pages），不支持');
const warn = [];
// 浏览器里改的东西只在本机，导出才进文件：下载文件夹里有同名的更新导出就提醒
const base = path.basename(file).replace(/\.html?$/i, '').replace(/ \(\d+\)$/, '');
try {
  const newer = fs.readdirSync(dl).filter(f => /\.html?$/i.test(f) && stripN(f).replace(/\.html?$/i, '') === base)
    .map(f => path.join(dl, f)).filter(f => fs.statSync(f).mtimeMs > fs.statSync(file).mtimeMs + 1000)
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  if (newer.length) warn.push(`下载文件夹里有比它更新的导出：${path.basename(newer[0])}（${new Date(fs.statSync(newer[0]).mtimeMs).toLocaleString('zh-CN')}）。要录那份就改选它`);
} catch (e) { }

// ---------- 分段：按步数均分 ----------
// 每页大约几步（只用来均分各段工作量；实际步数以按 → 走出来的为准）：页面出现 1 步＋每条（含子步骤）；整页一起出现的页只算 2 步
const steps = D.pages.map(p => (p.opts || {}).together ? 2 : 1 + (p.groups || []).reduce((n, g) => n + 1 + ((g.highlights || []).length), 0));
let [A, B] = (opt('pages') || `1-${D.pages.length}`).split('-').map(Number); B = Math.min(B || A, D.pages.length);
if (!Number.isInteger(A) || !Number.isInteger(B) || !(A >= 1) || A > B) die('页码范围不对：' + opt('pages'));
const total = steps.slice(A - 1, B).reduce((a, b) => a + b, 0);
const chunks = []; let start = A, acc = 0;
for (let i = A; i <= B; i++) {
  acc += steps[i - 1];
  if (chunks.length < W - 1 && acc >= total / W * (chunks.length + 1) && i < B) { chunks.push([start, i]); start = i + 1; }
}
chunks.push([start, B]);

// 成品默认放课件旁边的「录制」；课件在下载文件夹（编辑台导出的）就放「影片（Windows：视频）/课件录视频」，不往下载里堆
const outDir = path.resolve(opt('out') || (path.resolve(path.dirname(file)) === path.resolve(dl) ? folder('movies') : path.join(path.dirname(file), '录制')));
fs.mkdirSync(outDir, { recursive: true });
const name = `${base}_${SIZE}_${FPS}帧_每步${HOLD}秒` + (opt('pages') ? `_第${A}-${B}页` : '');
const out = path.join(outDir, name + '.mp4'), logDir = path.join(outDir, name + '_日志');
fs.rmSync(logDir, { recursive: true, force: true }); fs.mkdirSync(logDir);
const perStep = Math.max(1, Math.round(HOLD * FPS));
const ver = version();
say(`开始${ver ? '（工具包 ' + ver + '）' : ''}：${path.basename(file)}｜第${A}-${B}页 约${total}步｜${SIZE} ${FPS}帧 每步${HOLD}秒｜视频约 ${(total * HOLD).toFixed(0)} 秒｜分 ${chunks.length} 段并行`);
warn.forEach(w => say('⚠ ' + w));

// ---------- 并行渲染（每段一个 node 子进程，用的就是现在这个 node） ----------
const t0 = Date.now();
const runOne = ([a, b], i) => new Promise(ok => {
  const part = path.join(logDir, `part${i + 1}.mp4`), logf = path.join(logDir, `part${i + 1}.log`), log = fs.openSync(logf, 'w');
  const ch = spawn(process.execPath, [path.join(__dirname, 'worker.cjs'), file, part, '--pages', `${a}-${b}`, '--fps', String(FPS), '--hold', String(HOLD), '--frame', FRAME], { stdio: ['ignore', log, log], windowsHide: true });
  // 看门狗：一段 3 分钟没有新进度就停掉它，报错而不是一直卡着
  const dog = setInterval(() => { try { if (Date.now() - fs.statSync(logf).mtimeMs > 180000) { ch.kill('SIGKILL'); ch.stuck = true; } } catch (e) { } }, 15000);
  ch.on('close', code => {
    clearInterval(dog); try { fs.closeSync(log); } catch (e) { }
    let r = {}; try { r = JSON.parse(fs.readFileSync(part.replace(/\.mp4$/, '.json'), 'utf8')); } catch (e) { }
    if (ch.stuck) r.fatal = '3 分钟没有进度，已停下（重跑一次；还卡就把 _日志 文件夹发给维护的人）';
    ok({ part, code, r, pages: `${a}-${b}` });
  });
});
// 某段失败（偶发卡死等）自动重跑一次
const runs = chunks.map((c, i) => runOne(c, i).then(x => (x.code !== 0 || x.r.fatal) ? runOne(c, i).then(y => ({ ...y, retried: true })) : x));
// 屏幕上每 10 秒报一次进度（只一行，覆盖着写）
const prog = setInterval(() => {
  const done = chunks.map((c, i) => { try { const t = fs.readFileSync(path.join(logDir, `part${i + 1}.log`), 'utf8').match(/已出 [\d.]+ 秒/g) || []; return t.length ? parseFloat(t[t.length - 1].replace(/[^\d.]/g, '')) : 0; } catch (e) { return 0; } }).reduce((a, b) => a + b, 0);
  if (process.stdout.isTTY) process.stdout.write(`\r  进度：约 ${Math.min(99, Math.round(done / (total * HOLD) * 100))}%，已用 ${Math.round((Date.now() - t0) / 1000)} 秒   `);
}, 10000);

const ff = (args, opts) => execFileSync(FFMPEG, args, opts);
Promise.all(runs).then(res => {
  clearInterval(prog); if (process.stdout.isTTY) process.stdout.write('\r' + ' '.repeat(40) + '\r');
  const bad = res.find(x => x.code !== 0 || x.r.fatal);
  if (bad) die(`第 ${bad.pages} 页那段失败：${bad.r.fatal || '见 ' + path.join(logDir, path.basename(bad.part, '.mp4') + '.log')}`);
  // 拼接（concat 清单里的路径一律用正斜杠，Windows 也认）
  fs.writeFileSync(path.join(logDir, 'list.txt'), res.map(x => `file '${x.part.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'));
  ff(['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(logDir, 'list.txt'), '-c', 'copy', '-movflags', '+faststart', out]);
  // 时间表
  // 用各段 json 里的结构化时间表（不再解析文本 csv：标题里有换行、逗号会拆乱）；写出的 csv 按标准加引号
  const q = v => /[",\r\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
  let offset = 0, n = 0; const rows = ['序号,页,页id,讲到,视频起始秒'], pageEnd = {};
  for (const x of res) {
    for (const st of x.r.steps || []) {
      const t = offset + st.t; ++n;
      rows.push([n, st.page, st.id, String(st.title).replace(/[\r\n]+/g, ' '), t.toFixed(2)].map(q).join(','));
      pageEnd[st.page] = t;
    }
    offset += x.r.frames / FPS;
  }
  const csv = out.replace(/\.mp4$/, '.csv'); fs.writeFileSync(csv, '\ufeff' + rows.join('\r\n'));
  // 自检：规格、帧数、整片解码。整片解码一遍，顺带数帧；尺寸帧率有 ffprobe 用它，没有就读 ffmpeg 的信息行
  const size = (fs.statSync(out).size / 1e6).toFixed(0);
  const dec = spawnSync(FFMPEG, ['-v', 'error', '-stats', '-i', out, '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const lines = String(dec.stderr || '').split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
  const fr = lines.filter(l => /^frame=/.test(l)).pop() || '', frames = +((fr.match(/frame=\s*(\d+)/) || [])[1] || 0);
  const decErr = lines.filter(l => !/^(frame=|size=|video:|\[out#)/.test(l));
  let W0 = 0, H0 = 0, rate = '';
  if (FFPROBE) {
    const pr = JSON.parse(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'stream=width,height,r_frame_rate', '-of', 'json', out]).toString()).streams[0];
    W0 = pr.width; H0 = pr.height; rate = pr.r_frame_rate;
  } else {
    const info = String(spawnSync(FFMPEG, ['-hide_banner', '-i', out], { encoding: 'utf8' }).stderr || '');
    const wh = info.match(/Video: [^\n]*?(\d{2,5})x(\d{2,5})/), fp = info.match(/, ([\d.]+) fps/);
    if (wh) { W0 = +wh[1]; H0 = +wh[2]; } if (fp) rate = Math.round(+fp[1]) + '/1';
  }
  const checks = [];
  if (`${W0}x${H0}` !== SIZE) checks.push(`尺寸 ${W0}x${H0} 不对`);
  if (rate !== `${FPS}/1`) checks.push(`帧率 ${rate || '读不出'} 不对`);
  const expectFrames = n * perStep;  // 实际走出来的步数 × 每步帧数
  if (frames !== expectFrames) checks.push(`帧数 ${frames}，应为 ${expectFrames}`);
  if (res.some(x => x.r.frames % perStep)) checks.push('有一段的帧数不是每步帧数的整数倍');
  if (dec.status !== 0 || decErr.length) checks.push('解码有报错：' + (decErr[0] || '退出码 ' + dec.status));
  const relock = res.reduce((a, x) => a + (x.r.relock || 0), 0), pageErr = res.flatMap(x => x.r.errors || []);
  if (pageErr.length) checks.push(`页面报错 ${pageErr.length} 条：${pageErr[0].slice(0, 80)}`);
  // 总览图：每页最后一帧（按顺序编号，不用通配符，Windows 版 ffmpeg 不支持 glob）
  const thumbs = path.join(logDir, 'thumbs'); fs.mkdirSync(thumbs);
  const ends = Object.entries(pageEnd).filter(([pg, t]) => Number.isFinite(+pg) && Number.isFinite(t)).sort((a, b) => +a[0] - +b[0]);
  ends.forEach(([pg, t], i) => ff(['-v', 'error', '-y', '-ss', (t + HOLD - 0.1).toFixed(2), '-i', out, '-frames:v', '1', '-vf', 'scale=480:-1', path.join(thumbs, `p${String(i + 1).padStart(3, '0')}.png`)]));
  const sheet = out.replace(/\.mp4$/, '_总览.png'), cols = Math.min(6, ends.length), rowsN = Math.ceil(ends.length / cols);
  ff(['-v', 'error', '-y', '-start_number', '1', '-i', path.join(thumbs, 'p%03d.png'), '-vf', `tile=${cols}x${rowsN}:padding=6:color=white`, '-frames:v', '1', sheet]);
  // 放桌面（同名已存在就加时间后缀，不覆盖）
  let desk = '';
  if (!argv.includes('--no-desktop')) {
    const d = folder('desktop'); let tgt = path.join(d, name + '.mp4');
    if (fs.existsSync(tgt)) { const ts = new Date().toTimeString().slice(0, 5).replace(':', ''); tgt = path.join(d, `${name}_${ts}.mp4`); }
    fs.copyFileSync(out, tgt); fs.copyFileSync(csv, tgt.replace(/\.mp4$/, '.csv')); desk = tgt;
  }
  if (!checks.length) { for (const x of res) for (const ext of ['.mp4', '.json', '.csv']) fs.rmSync(x.part.replace(/\.mp4$/, ext), { force: true }); fs.rmSync(thumbs, { recursive: true, force: true }); }
  const mmss = t => `${Math.floor(t / 60)}分${String(Math.round(t % 60)).padStart(2, '0')}秒`;
  say(`${checks.length ? '✗ 自检没过' : '✓ 完成'}：${name}.mp4｜${SIZE} ${FPS}帧｜${mmss(offset)}｜${n} 步｜${size}MB｜用时 ${mmss((Date.now() - t0) / 1000)}`);
  const fb = res.reduce((a, x) => a + (x.r.recover || 0), 0), rt = res.filter(x => x.retried).length;
  say(`  自检：${checks.length ? checks.join('；') : '尺寸、帧率、帧数对；整片解码无错；页面无报错'}｜拦下误退出拍摄模式 ${relock} 次` + (fb ? `｜浏览器卡死后原地恢复 ${fb} 次` : '') + (rt ? `｜有 ${rt} 段失败后自动重跑成功` : ''));
  say(`  文件：${out}（另有 .csv 每步起始秒、_总览.png 每页最后一帧）`);
  if (desk) say(`  桌面：${path.basename(desk)} ＋ 同名 .csv`);
  warn.forEach(w => say('⚠ ' + w));
  process.exit(checks.length ? 2 : 0);
}).catch(e => die('出错：' + e.message));
