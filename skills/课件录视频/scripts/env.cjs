// 找工具和文件夹：工具包自带的（同目录 bin/、node_modules/）优先，其次本机已装的；Mac 和 Windows 都认。
const path = require('path'), fs = require('fs'), os = require('os');
const WIN = process.platform === 'win32';
const exe = n => WIN ? n + '.exe' : n;
const ok = p => { try { return !!p && fs.existsSync(p); } catch (e) { return false; } };

// ffmpeg / ffprobe：环境变量 KJ_FFMPEG 等 → 工具包 bin/ → PATH → Homebrew 常见位置
// 工具包模式（同目录有 bin/）只认自带的：同事电脑上装的别的版本 ffmpeg 不用，保证谁录都一样
function findBin(name) {
  const env = process.env['KJ_' + name.toUpperCase()];
  if (ok(env)) return env;
  const own = path.join(__dirname, 'bin', exe(name));
  if (ok(own)) return own;
  if (ok(path.join(__dirname, 'bin'))) return null;
  const dirs = (process.env.PATH || '').split(path.delimiter).concat(WIN ? [] : ['/opt/homebrew/bin', '/usr/local/bin']);
  for (const d of dirs) { const p = d && path.join(d, exe(name)); if (ok(p)) return p; }
  return null;
}

// 浏览器：CHROME_PATH → Google Chrome → Microsoft Edge（Windows 自带，同样是 Chromium 内核，录出来一样）
function findChrome() {
  if (ok(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const pf = process.env.ProgramFiles || 'C:\\Program Files', pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', lad = process.env.LOCALAPPDATA || '';
  const list = WIN ? [
    path.join(pf, 'Google\\Chrome\\Application\\chrome.exe'), path.join(pf86, 'Google\\Chrome\\Application\\chrome.exe'), lad && path.join(lad, 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(pf86, 'Microsoft\\Edge\\Application\\msedge.exe'), path.join(pf, 'Microsoft\\Edge\\Application\\msedge.exe'),
  ] : [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  return list.find(ok) || null;
}

function loadPlaywright() {
  const tries = [process.env.PLAYWRIGHT_MODULE, path.join(__dirname, 'node_modules', 'playwright-core'), 'playwright-core', 'playwright'].filter(Boolean); // 使用正常 Node 解析；可通过 NODE_PATH 或 PLAYWRIGHT_MODULE 配置依赖
  for (const t of tries) { try { return require(t); } catch (e) { } }
  throw Error('找不到 Playwright：请自行准备 playwright-core，并通过 NODE_PATH 或 PLAYWRIGHT_MODULE 指定模块位置');
}

// 桌面、下载、成品文件夹（Windows 的桌面可能被 OneDrive 挪走，启动器会用 KJ_DESKTOP 传进来）
function folder(kind) {
  if (kind === 'desktop') return process.env.KJ_DESKTOP || path.join(os.homedir(), 'Desktop');
  if (kind === 'downloads') return process.env.KJ_DOWNLOADS || path.join(os.homedir(), 'Downloads');
  return process.env.KJ_OUTPUT || path.join(os.homedir(), WIN ? 'Videos' : 'Movies', '课件录视频');
}

// 工具包版本（工具包里有 VERSION 文件；skill 里没有）
function version() { try { return fs.readFileSync(path.join(__dirname, 'VERSION'), 'utf8').trim(); } catch (e) { return ''; } }

module.exports = { WIN, findBin, findChrome, loadPlaywright, folder, version };
