// node verify.cjs 成品.html 输出目录 [内容.json]
// 整页＋逐步（含子步骤）溢出/人物框；滑块；单字段字号颜色；编辑台；保存刷新；导出后干净浏览器重开；与内容源的文字差异
// 注意：溢出判断在关动画后读（check() 在动画运行时会提前返回旧值）
const { launch, open, clearCache, arg, path, fs } = require('./_lib.cjs');
(async () => {
  const file = arg(2, '成品.html'), ev = path.resolve(arg(3, '输出目录')), srcFile = process.argv[4];
  fs.mkdirSync(ev, { recursive: true });
  const browser = await launch(); const errors = [];
  let p = await open(browser, file, errors);
  let contentDiffs = null;
  if (srcFile) {
    const src = JSON.parse(fs.readFileSync(srcFile, 'utf8'));
    contentDiffs = await p.evaluate(src => { const bad = []; (src.pages || src).forEach((sp, i) => { const dp = DATA.pages[i]; if (!dp || dp.id !== sp.id) { bad.push(sp.id + ' 页缺失或顺序变了'); return; } for (const k of ['title', 'lead']) if ((dp[k] || '') !== (sp[k] || '')) bad.push(sp.id + '.' + k); sp.groups.forEach((g, j) => { const h = dp.groups[j]; for (const k of ['label', 'title', 'body']) if (!h || h[k] !== g[k]) bad.push(g.id + '.' + k); }); }); return bad; }, src);
  }
  const N = await p.evaluate(() => DATA.pages.length);
  const rows = [];
  for (let i = 0; i < N; i++) {
    await p.evaluate(i => { cancelMotion(); DATA.reduceMotion = true; page = i; focus = -1; showAll = true; render(); resize(); }, i);
    await p.waitForTimeout(130);
    rows.push(await p.evaluate(() => { const q = s => document.querySelector(s); const fs = s => q(s) ? getComputedStyle(q(s)).fontSize : null; return { page: page + 1, id: DATA.pages[page].id, layout: DATA.pages[page].layout, overflow, status: q('#status').textContent, titleSize: fs('.content .title'), cardSize: fs('.content .group .gtitle'), bodySize: fs('.content .group .body'), width: getComputedStyle(q('.content')).width, top: getComputedStyle(q('.content')).top }; }));
    await p.evaluate(() => document.querySelector('.canvas').classList.add('guides'));
    await p.locator('.screen').screenshot({ path: path.join(ev, `第${i + 1}页-整页.png`) });
    await p.evaluate(() => document.querySelector('.canvas').classList.remove('guides'));
  }
  const steps = []; let stepCount = 0;
  for (let i = 0; i < N; i++) {
    await p.evaluate(i => { page = i; focus = -1; detailStep = 0; showAll = false; render(); }, i);
    const n = await p.evaluate(() => DATA.pages[page].groups.length);
    for (let j = 0; j < n; j++) {
      const dc = await p.evaluate(j => { focus = j; detailStep = 0; render(); return detailCount(); }, j);
      for (let k = 0; k < dc; k++) { await p.evaluate(k => { detailStep = k; render(); }, k); await p.waitForTimeout(40); stepCount++; if (await p.evaluate(() => overflow)) steps.push({ page: i + 1, group: j + 1, detail: k }); }
    }
  }
  const probe = [...new Set([Math.min(3, N - 1), Math.floor(N / 2), N - 1])];
  const sliders = await p.evaluate(list => { const out = {}; for (const i of list) { page = i; focus = -1; showAll = true; render(); const d = DATA.pages[i].design, old = { ...d }; const g = document.querySelector('.content .group .gtitle'), b = document.querySelector('.content .group .body'), t = document.querySelector('.content .title'); const fz = e => e ? getComputedStyle(e).fontSize : null; const before = [fz(g), fz(b)]; d.cardSize = 30; d.bodySize = 24; d.titleSize = 64; wbApplyPage(); const after = [fz(g), fz(b)];
      /* 重点/正文按版式换算（college 的专业列表走正文字号，sum 的数字×1.33），所以只判“跟着滑块变了”，页标题判精确值 */
      out[DATA.pages[i].id] = { before, after, title: fz(t), ok: fz(t) === '64px' && after[0] !== before[0] && after[1] !== before[1] }; Object.assign(d, old); wbApplyPage(); } return out; }, probe);
  const fieldStyle = await p.evaluate(list => { const out = {}; for (const i of list) { page = i; focus = -1; showAll = true; render(); const pa = 'pages/' + i + '/groups/0/title'; const st = wbFieldStyle(pa, true); st.fontSize = 50; st.color = '#0000ff'; wbApplyFieldStyles(); const el = document.querySelector('[data-e="' + pa + '"]'); const cs = getComputedStyle(el); out[DATA.pages[i].id] = { fontSize: cs.fontSize, color: cs.color, ok: cs.fontSize === '50px' && cs.color === 'rgb(0, 0, 255)' }; delete st.fontSize; delete st.color; wbApplyFieldStyles(); } render(); return out; }, probe);
  // 编辑 → 保存 → 刷新 → 导出 → 干净浏览器重开 → 再进编辑
  const pi = Math.min(5, N - 1);
  await p.evaluate(() => { DATA.reduceMotion = false; });
  await p.selectOption('#pages', String(pi)); await p.click('#next');
  await p.click('#edit'); const editor = await p.locator('#wbPanel').isVisible();
  await p.locator('.content .title').fill('保存验证'); await p.click('#save');
  await p.reload(); await p.evaluate(() => document.fonts.ready);
  const saved = await p.evaluate(pi => DATA.pages[pi].title === '保存验证', pi);
  const expFile = path.join(ev, '导出重开验证.html');
  const dl = p.waitForEvent('download'); await p.click('#export'); await (await dl).saveAs(expFile);
  await clearCache(p); await p.close();
  p = await open(browser, expFile, errors);
  const reopenInfo = await p.evaluate(pi => ({ pages: DATA.pages.length, layouts: DATA.pages.map(x => x.layout).join(','), title: DATA.pages[pi].title }), pi);
  await p.evaluate(pi => { page = pi; focus = -1; showAll = true; render(); }, pi); await p.waitForTimeout(100);
  const reopenOverflow = await p.evaluate(() => overflow);
  await p.click('#edit'); const reopenEditor = await p.locator('#wbPanel').isVisible();
  await p.screenshot({ path: path.join(ev, '导出重开-编辑台.png') });
  await clearCache(p);
  const report = { file, pages: N, contentDiffs, rows, stepCount, stepOverflows: steps, pageOverflows: rows.filter(r => r.overflow).map(r => r.id), sliders, fieldStyle, errors, editor, saved, reopenInfo, reopenOverflow, reopenEditor };
  fs.writeFileSync(path.join(ev, '验证.json'), JSON.stringify(report, null, 2));
  const pass = !steps.length && !report.pageOverflows.length && !errors.length && editor && saved && reopenEditor && reopenInfo.title === '保存验证' && Object.values(sliders).every(x => x.ok) && Object.values(fieldStyle).every(x => x.ok);
  console.log(JSON.stringify({ pass, pages: N, stepCount, stepOverflows: steps.length, pageOverflows: report.pageOverflows, contentDiffs: contentDiffs && contentDiffs.length, sliders, fieldStyle, editor, saved, reopenInfo, reopenOverflow, reopenEditor, errors }, null, 1));
  await browser.close(); process.exit(pass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
