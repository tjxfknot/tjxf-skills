// node pictest.cjs 成品.html 输出目录 图片 → 卡片配图（0.3.9）：图已解码、图框高度＝数据、编辑台 图高±／换铺放／去掉＋撤销、
// 上传更换（压成 WebP 的体积）、保存刷新、导出后干净浏览器重开、JSON 备份导入后配图原样回来
const {launch,open,arg,clearCache,path,fs}=require('./_lib.cjs');
(async()=>{const file=arg(2,'成品.html'),ev=path.resolve(arg(3,'输出目录')),img=path.resolve(arg(4,'图片'));fs.mkdirSync(ev,{recursive:true});
const b=await launch();const errs=[];let p=await open(b,file,errs);p.removeAllListeners('dialog');p.on('dialog',d=>d.accept());const res={};
const loc=await p.evaluate(()=>{for(let i=0;i<DATA.pages.length;i++){const j=DATA.pages[i].groups.findIndex(g=>g.pic);if(j>=0)return {pi:i,gi:j};}return null;});
if(!loc){console.log(JSON.stringify({pass:false,why:'没有带配图的卡'}));process.exit(1);}res.loc=loc;
const pics=()=>p.evaluate(async ({pi})=>{await new Promise(r=>setTimeout(r,250));const figs=[...document.querySelectorAll('.content .v5-pic')];const o=[];for(const f of figs){const im=f.querySelector('img');try{await im.decode();}catch(e){}o.push({boxH:Math.round(f.getBoundingClientRect().height/scale),nat:im.naturalWidth+'x'+im.naturalHeight,fit:getComputedStyle(im).objectFit});}
 return {figs:o,data:DATA.pages[pi].groups.map(g=>g.pic?{h:g.pic.h,fit:g.pic.fit,kb:Math.round(g.pic.img.length*.75/1024),head:g.pic.img.slice(0,16)}:null)};},loc);
await p.evaluate(({pi})=>{page=pi;showAll=true;focus=-1;render();},loc);res.show=await pics();await p.locator('.screen').screenshot({path:path.join(ev,'配图-整页.png')});
const okShow=s=>s.figs.length===s.data.filter(Boolean).length&&s.figs.every((f,i)=>!f.nat.startsWith('0')&&f.boxH===s.data.filter(Boolean)[i].h);
await p.click('#edit');await p.waitForTimeout(300);
const btn=t=>p.locator('.content .groups > .group[data-group="'+loc.gi+'"] .v5-pic-ui button',{hasText:t});
res.buttons=await p.locator('.content .groups > .group[data-group="'+loc.gi+'"] .v5-pic-ui button').allTextContents();
const h0=res.show.data[loc.gi].h;
await btn('图高＋').click();res.taller=await pics();await p.click('#wbUndo');res.undoTaller=await pics();
await btn('改为铺满裁切').click();res.cover=await pics();await p.click('#wbUndo');
const fc=p.waitForEvent('filechooser');await btn('更换配图').click();await (await fc).setFiles(img);await p.waitForTimeout(2500);res.replaced=await pics();
await btn('去掉配图').click();res.removed=await pics();await p.click('#wbUndo');res.undoRemoved=await pics();
await p.click('#edit');await p.click('#save').catch(()=>{});await p.waitForTimeout(300);
await p.reload();await p.evaluate(()=>document.fonts.ready);await p.evaluate(({pi})=>{page=pi;showAll=true;focus=-1;render();},loc);res.reloaded=await pics();
const dl=p.waitForEvent('download');await p.click('#export');const ef=path.join(ev,'配图导出验证.html');await (await dl).saveAs(ef);
await p.click('#edit');const dj=p.waitForEvent('download');await p.evaluate(()=>wbBackup());const jf=path.join(ev,'配图备份.json');await (await dj).saveAs(jf);
await p.evaluate(()=>{DATA.pages.forEach(x=>x.groups.forEach(g=>delete g.pic));render();});await p.setInputFiles('#wbImport',jf);await p.waitForTimeout(800);
await p.click('#edit').catch(()=>{});await p.evaluate(({pi})=>{page=pi;showAll=true;focus=-1;render();},loc);res.imported=await pics();
await clearCache(p);await p.close();
const q=await open(b,ef,errs);q.removeAllListeners('dialog');q.on('dialog',d=>d.accept());await q.evaluate(({pi})=>{page=pi;showAll=true;focus=-1;render();},loc);
res.exported=await q.evaluate(async()=>{const f=document.querySelectorAll('.content .v5-pic');for(const x of f){try{await x.querySelector('img').decode();}catch(e){}}return [...f].map(x=>x.querySelector('img').naturalWidth);});await clearCache(q);await q.close();
const nPic=res.show.data.filter(Boolean).length;
const checks={show:okShow(res.show),buttons:res.buttons.includes('图高＋')&&res.buttons.includes('去掉配图'),taller:res.taller.data[loc.gi].h===h0+40&&okShow(res.taller),undoTaller:res.undoTaller.data[loc.gi].h===h0,
 cover:res.cover.figs[loc.gi]?.fit==='cover',replaced:res.replaced.data[loc.gi].head.startsWith('data:image/webp')&&res.replaced.data[loc.gi].h===h0&&okShow(res.replaced),
 removed:res.removed.figs.length===nPic-1&&!res.removed.data[loc.gi],undoRemoved:res.undoRemoved.figs.length===nPic,reloaded:res.reloaded.figs.length===nPic&&okShow(res.reloaded),
 imported:res.imported.figs.length===nPic&&okShow(res.imported),exported:res.exported.length===nPic&&res.exported.every(w=>w>0),noErrors:!errs.length};
const pass=Object.values(checks).every(Boolean);fs.writeFileSync(path.join(ev,'配图验证.json'),JSON.stringify({checks,...res,errs},null,1));
console.log(JSON.stringify({pass,checks,replacedKB:res.replaced.data[loc.gi].kb,errs},null,1));await b.close();process.exit(pass?0:1);})().catch(e=>{console.error(e);process.exit(1)});
