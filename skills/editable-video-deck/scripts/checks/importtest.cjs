// node importtest.cjs 成品.html 输出目录 → 导出 JSON 备份，再从备份导入：版式、页/卡 id、宽度、opts、格子、章节导航、底图是否原样回来
const {launch,open,arg,clearCache,path,fs}=require('./_lib.cjs');
(async()=>{const file=arg(2,'成品.html'),ev=path.resolve(arg(3,'输出目录'));fs.mkdirSync(ev,{recursive:true});const b=await launch();const errs=[];const p=await open(b,file,errs);
p.removeAllListeners('dialog');p.on('dialog',d=>d.accept());
const pick=()=>p.evaluate(()=>JSON.stringify({nav:DATA.nav,bg:DATA.bg&&DATA.bg.kind,pages:DATA.pages.map(x=>({id:x.id,layout:x.layout,design:x.design,opts:x.opts,groups:x.groups.map(g=>({id:g.id,cell:g.cell,label:g.label,title:g.title,body:g.body}))}))}));
await p.evaluate(()=>{v5SetBg('dots',1.4);});const before=await pick();
await p.click('#edit');await p.click('#settingsBtn').catch(()=>{});
const dl=p.waitForEvent('download');await p.evaluate(()=>wbBackup());const f=path.join(ev,'备份.json');await (await dl).saveAs(f);
await p.evaluate(()=>{DATA.pages.forEach(x=>{x.layout='bh';delete x.opts;});render();});
await p.setInputFiles('#wbImport',f);await p.waitForTimeout(600);const after=await pick();
const A=JSON.parse(before),B=JSON.parse(after);const diffs=[];const canon=o=>o&&typeof o==='object'&&Object.keys(o).length?JSON.stringify(Object.keys(o).sort().reduce((r,k)=>(r[k]=o[k],r),{})):'{}'; /* 键序不同、空 opts 与没有 opts 都不算差异 */
A.pages.forEach((x,i)=>{const y=B.pages[i];for(const k of ['id','layout'])if(x[k]!==y[k])diffs.push(x.id+'.'+k+': '+x[k]+' → '+y[k]);if(canon(x.design)!==canon(y.design))diffs.push(x.id+'.design');if(canon(x.opts)!==canon(y.opts))diffs.push(x.id+'.opts');x.groups.forEach((g,j)=>{if(JSON.stringify(g)!==JSON.stringify(y.groups[j]))diffs.push(g.id+' 卡片');});});
if(JSON.stringify(A.nav)!==JSON.stringify(B.nav))diffs.push('nav');if(A.bg!==B.bg)diffs.push('bg: '+A.bg+' → '+B.bg);
await clearCache(p);const pass=!diffs.length&&!errs.length;console.log(JSON.stringify({pass,pages:A.pages.length,diffs:diffs.slice(0,30),errs},null,1));await b.close();process.exit(pass?0:1);})().catch(e=>{console.error(e);process.exit(1)});
