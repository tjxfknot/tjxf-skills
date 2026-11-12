// node styles.cjs 成品.html 输出目录 [--packs classic,swiss,stage] [--pages 1,4,8] [--video 4:3] [--phone ip16pro] [--keep 1]
// --keep 1：保留课件原配色（学校主色），只换版面风格（深色舞台除外）
// 风格对比图：同一套课件的几页代表页，按候选主题包各截一张整页图，拼成「风格对比.png」（行＝主题包，列＝页），
// 再用手机预览工具把每套的第一张代表页合成抖音信息流里的样子，拼成「风格对比-手机.png」。
// 不打开课件也能看、能发给同事一起挑；在课件里挑用编辑台的「挑风格」。默认主题包取课件的推荐（DATA.packPick），
// 没有就按 挑风格 的默认；默认代表页取第 1 页、卡片最多的一页、最后一页。
const {launch,open,arg,path,fs}=require('./_lib.cjs');
const PREVIEW=path.resolve(__dirname,'../../assets/phone-preview/phone-preview.html');
const a=process.argv.slice(2),file=arg(2,'成品.html'),out=path.resolve(arg(3,'输出目录'));
const opt={};for(let i=2;i<a.length;i++){if(a[i].startsWith('--'))opt[a[i].slice(2)]=a[++i];}
fs.mkdirSync(out,{recursive:true});
const b64=f=>'data:image/png;base64,'+fs.readFileSync(f).toString('base64');
(async()=>{const b=await launch();const errs=[];const p=await open(b,path.resolve(file),errs);
 const info=await p.evaluate(()=>{const n=DATA.pages.map(x=>x.groups.length);let dense=n.indexOf(Math.max(...n));
   const pick=(DATA.packPick&&DATA.packPick.length?DATA.packPick:(DATA.bg&&DATA.bg.img?['classic','photo','clean']:['classic','swiss','stage']));
   return {pages:DATA.pages.length,dense,pick,title:document.title,PACKS:Object.fromEntries(Object.entries(EVDPacks.PACKS).map(([k,v])=>[k,{name:v.name,mood:v.mood,desc:v.desc,suits:v.suits}]))};});
 const packs=(opt.packs?opt.packs.split(','):info.pick).filter(k=>info.PACKS[k]);
 let pages=opt.pages?opt.pages.split(',').map(x=>+x-1):[0,info.dense,info.pages-1];pages=[...new Set(pages.filter(x=>x>=0&&x<info.pages))];
 const shots={};
 for(const id of packs){await p.evaluate(([id,k])=>EVDPacks.apply(id,k),[id,opt.keep==='1']);shots[id]=[];
  for(const i of pages){await p.evaluate(i=>{DATA.reduceMotion=true;page=i;focus=-1;detailStep=0;showAll=true;render();},i);await p.waitForTimeout(80);
   const f=path.join(out,`${id}-第${i+1}页.png`);await p.locator('.canvas').screenshot({path:f});shots[id].push(f);}}
 await p.evaluate(()=>EVDPacks.apply('classic'));
 // 手机版：每套第一张代表页
 const pv=await b.newPage({viewport:{width:1400,height:1000}});await pv.goto('file://'+PREVIEW);await pv.evaluate(()=>document.fonts.ready);
 const video=opt.video||'4:3',fill={'4:3':100,'16:9':75,'9:16':100,'3:4':100}[video]||100,valign={'9:16':'top','3:4':'top'}[video]||'center';
 await pv.evaluate(o=>PP.set(o),{video,fill,valign,phone:opt.phone||'ip16pro',ui:true,pip:true,sub:true,caption:String(info.title||'').split(/ · /)[0]+' #高考志愿'});
 const phones={};for(const id of packs){await pv.evaluate(u=>PP.setImage(u),b64(shots[id][0]));const u=await pv.evaluate(()=>PP.exportFramed());
  const f=path.join(out,`${id}-手机.png`);fs.writeFileSync(f,Buffer.from(u.split(',')[1],'base64'));phones[id]=f;}
 // 拼图：用一张临时网页排版再截图（中文标题、说明都在图里）
 const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
 const card=id=>`<div class="hd"><b>${esc(info.PACKS[id].name)}</b><i>${esc(info.PACKS[id].mood)}</i><span>${esc(info.PACKS[id].desc)}　适合：${esc(info.PACKS[id].suits)}</span></div>`;
 const css='body{margin:0;background:#eef1f0;font:16px/1.5 -apple-system,"PingFang SC",sans-serif;color:#1f2b2a}.wrap{padding:24px;display:flex;flex-direction:column;gap:22px}h1{margin:0;font-size:24px}.sub{color:#5f6f6c;margin:-14px 0 0}'
  +'.hd{display:flex;align-items:baseline;gap:10px;margin:0 0 8px}.hd b{font-size:20px}.hd i{font-style:normal;font-size:13px;color:#17603a;background:#e3f1e8;border-radius:10px;padding:0 9px}.hd span{color:#4b5a57;font-size:14px}'
  +'.row{background:#fff;border-radius:12px;padding:14px;box-shadow:0 4px 18px rgba(0,0,0,.08)}.imgs{display:flex;gap:12px}.imgs img{width:520px;border-radius:6px;box-shadow:0 0 0 1px #dde3e1}.ph{display:flex;gap:28px;align-items:flex-start}.ph figure{margin:0;text-align:center}.ph img{width:340px}.ph figcaption{margin-top:6px;font-weight:600}';
 const head=`<h1>风格对比：${esc(info.title)}</h1><p class="sub">同样的内容和排版，只换主题包（颜色、底纹、卡片和导航样式）；字号、断行不变。代表页：${pages.map(i=>'第'+(i+1)+'页').join('、')}。</p>`;
 const grid=`<!doctype html><meta charset="utf-8"><style>${css}</style><div class="wrap">${head}${packs.map(id=>`<div class="row">${card(id)}<div class="imgs">${shots[id].map(f=>`<img src="${b64(f)}">`).join('')}</div></div>`).join('')}</div>`;
 const phoneHtml=`<!doctype html><meta charset="utf-8"><style>${css}</style><div class="wrap"><h1>手机上看（${esc(video)} 成片，抖音界面为示意）</h1><div class="ph">${packs.map(id=>`<figure><img src="${b64(phones[id])}"><figcaption>${esc(info.PACKS[id].name)}</figcaption></figure>`).join('')}</div></div>`;
 for(const [html,name] of [[grid,'风格对比.png'],[phoneHtml,'风格对比-手机.png']]){const g=await b.newPage({viewport:{width:pages.length*532+60,height:900},deviceScaleFactor:1});
  await g.setContent(html);await g.waitForTimeout(200);await g.screenshot({path:path.join(out,name),fullPage:true});await g.close();}
 console.log(JSON.stringify({packs,pages:pages.map(i=>i+1),out,files:['风格对比.png','风格对比-手机.png'],errs}));
 await b.close();})().catch(e=>{console.error(e);process.exit(1)});
