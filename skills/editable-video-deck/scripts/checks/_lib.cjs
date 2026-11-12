// 验证脚本公用：找 playwright、开 Chrome、打开课件等字体就绪
// playwright 找不到时：设 PLAYWRIGHT_MODULE=/绝对路径/node_modules/playwright
const path = require('path'), fs = require('fs');
function loadPlaywright() {
  const tries = [process.env.PLAYWRIGHT_MODULE, 'playwright'].filter(Boolean);
  for (const t of tries) { try { return require(t); } catch (e) {} }
  throw Error('找不到 playwright：npm i playwright，或设 PLAYWRIGHT_MODULE');
}
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
async function launch() {
  const { chromium } = loadPlaywright();
  return chromium.launch(fs.existsSync(CHROME) ? { executablePath: CHROME, headless: true } : { headless: true });
}
// 画布 1600×1200，视口留出工具栏
async function open(browser, file, errors = []) {
  const p = await browser.newPage({ viewport: { width: 1600, height: 1400 } });
  p.on('pageerror', e => errors.push(String(e)));
  // 离开页面提示（有未导出改动时刷新）是正常行为，直接确认，不算错误；其他弹窗记为错误
  p.on('dialog', d => { if (d.type() === 'beforeunload') return d.accept(); errors.push('弹窗[' + d.type() + ']:' + d.message()); d.dismiss(); });
  await p.goto('file://' + path.resolve(file));
  await p.evaluate(() => document.fonts.ready);
  return p;
}
// 清掉本课件的浏览器缓存（保存/批注），避免测试改动留在用户浏览器里
async function clearCache(p) {
  await p.evaluate(() => { const k = (typeof DECK !== 'undefined' && DECK.key) || ''; for (const key of Object.keys(localStorage)) if (k && key.includes(k)) localStorage.removeItem(key); });
}
function arg(i, name) { const v = process.argv[i]; if (!v) { console.error('缺少参数：' + name); process.exit(2); } return v; }
module.exports = { launch, open, clearCache, arg, path, fs };
