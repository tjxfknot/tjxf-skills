// node phone.cjs 成品.html 输出目录 [选项] [页:重点[:all]]…
// 手机观感预览＋字号体检：截课件指定讲解状态（默认每页整页），量每段文字的实际字号，
// 按「课件 px → 手机 pt」换算分档，合成抖音信息流里的真机尺寸预览图。
// 选项：--video 4:3|16:9|9:16|3:4（成片画幅，默认 4:3）  --fill 100（课件占成片宽度%）
//       --phone ip16pro|ip16promax|ip13mini|android412|android360  --no-ui  --no-pip  --no-sub  --hint
//       --framed（另出带手机外框的 pN-示意图.png）
// 产出：pN-手机.png（与机型屏幕等大，发到手机相册全屏看）、pN-体检.png（小于15pt的字描框标pt）、
//       字号梯度卡-手机.png、字号体检.md、字号体检.json
// 不传课件（第一个参数写 -）时只出字号梯度卡。
const {launch,open,path,fs}=require('./_lib.cjs');
const PREVIEW=path.resolve(__dirname,'../../assets/phone-preview/phone-preview.html');
const args=process.argv.slice(2);
const file=args[0], outDir=path.resolve(args[1]||'.');
if(!file){console.error('用法：node phone.cjs 成品.html|- 输出目录 [选项] [页:重点[:all]]…');process.exit(2);}
const opt={video:'4:3',phone:'ip16pro',ui:true,pip:true,sub:true,hint:false,framed:false};const states=[];
for(let i=2;i<args.length;i++){const a=args[i];
  if(a==='--video')opt.video=args[++i];else if(a==='--fill')opt.fill=+args[++i];else if(a==='--phone')opt.phone=args[++i];
  else if(a==='--no-ui')opt.ui=false;else if(a==='--no-pip')opt.pip=false;else if(a==='--no-sub')opt.sub=false;else if(a==='--hint')opt.hint=true;else if(a==='--framed')opt.framed=true;
  else states.push(a);}
fs.mkdirSync(outDir,{recursive:true});
const png=(u,f)=>fs.writeFileSync(path.join(outDir,f),Buffer.from(u.split(',')[1],'base64'));

(async()=>{
  const b=await launch(); const errors=[];
  const pv=await b.newPage({viewport:{width:1400,height:1000}});pv.on('pageerror',e=>errors.push('预览页:'+e));
  await pv.goto('file://'+PREVIEW);await pv.evaluate(()=>document.fonts.ready);
  const base={video:opt.video,phone:opt.phone,ui:opt.ui,pip:opt.pip,sub:opt.sub,hint:opt.hint};
  const fillDefault={'4:3':100,'16:9':75,'9:16':100,'3:4':100}[opt.video]||100;
  const valign={'9:16':'top','3:4':'top'}[opt.video]||'center';
  const info=await pv.evaluate(o=>{PP.useCard();return PP.set(o);},{...base,fill:opt.fill||fillDefault,valign});
  png(await pv.evaluate(()=>PP.exportScreen()),'字号梯度卡-手机.png');
  const report={phone:info.phone,video:opt.video,fill:opt.fill||fillDefault,k:info.k,subPt:info.subPt,covered:info.covered,pages:[]};
  if(file!=='-'){
    const p=await open(b,path.resolve(file),errors);
    const total=await p.evaluate(()=>DATA.pages.length);
    const list=states.length?states:Array.from({length:total},(_,i)=>`${i+1}:0:all`);
    for(const sp of list){
      const [pg,f,all]=sp.split(':');
      const st=await p.evaluate(([pg,f,all])=>{
        DATA.reduceMotion=true;page=pg-1;detailStep=0;showAll=!!all;focus=all?-1:f-1;render();
        document.querySelector('.canvas').classList.remove('guides');
        const cvs=document.querySelector('.canvas'), cr=cvs.getBoundingClientRect(), k=1600/cr.width, items=[], seen=new Set();
        const tw=document.createTreeWalker(cvs,NodeFilter.SHOW_TEXT);
        while(tw.nextNode()){const t=tw.currentNode;if(!t.textContent.trim())continue;const el=t.parentElement;if(seen.has(el))continue;seen.add(el);
          if(el.closest('.guide'))continue;
          let o=el,hid=false;while(o&&o!==document.body){const c=getComputedStyle(o);if(c.display==='none'||c.visibility==='hidden'||+c.opacity===0){hid=true;break;}o=o.parentElement;}if(hid)continue;
          const r=el.getBoundingClientRect();if(r.width<2||r.height<2)continue;
          const cs=getComputedStyle(el);
          items.push({text:el.innerText.trim().replace(/\s+/g,' ').slice(0,30),fs:+parseFloat(cs.fontSize).toFixed(1),fw:cs.fontWeight,cls:String(el.className||'').split(' ')[0],
            x:+((r.x-cr.x)*k).toFixed(1),y:+((r.y-cr.y)*k).toFixed(1),w:+(r.width*k).toFixed(1),h:+(r.height*k).toFixed(1)});}
        return {title:(DATA.pages[pg-1]||{}).title||'',items};},[+pg,+f,all]);
      await p.waitForTimeout(120);
      const shot=(await p.locator('.canvas').screenshot()).toString('base64');
      const url='data:image/png;base64,'+shot;
      const inf=await pv.evaluate(u=>PP.setImage(u),url);
      const tag=`p${pg}${all?'':'-f'+f}`;
      png(await pv.evaluate(()=>PP.exportScreen()),`${tag}-手机.png`);
      if(opt.framed)png(await pv.evaluate(()=>PP.exportFramed()),`${tag}-示意图.png`);
      png(await pv.evaluate(([u,it,k])=>PP.annotate(u,it,k,1600),[url,st.items,inf.k]),`${tag}-体检.png`);
      // 被抖音界面挡住的文字：课件坐标 → 手机坐标
      const cw=inf.courseware, sc=cw.w/1600, boxes=Object.entries(inf.ui).filter(([,v])=>v);
      const items=st.items.map(it=>{const pt=+(it.fs*inf.k).toFixed(1);const band=pt<10?'太小':pt<12?'吃力':pt<15?'能读':pt<20?'舒服':pt<=28?'醒目':'很大';
        const r={x:cw.x+it.x*sc,y:cw.y+it.y*sc,w:it.w*sc,h:it.h*sc};
        const under=opt.ui?boxes.filter(([,u])=>r.x<u.x+u.w&&u.x<r.x+r.w&&r.y<u.y+u.h&&u.y<r.y+r.h).map(([n])=>n):[];
        return {...it,pt,band,under};});
      report.pages.push({state:sp,tag,title:st.title,items});
      console.log(tag,st.title.slice(0,20),'文字',items.length,'｜<10pt',items.filter(i=>i.pt<10).length,'｜10–12',items.filter(i=>i.pt>=10&&i.pt<12).length,'｜被挡',items.filter(i=>i.under.length).length);
    }
  }
  fs.writeFileSync(path.join(outDir,'字号体检.json'),JSON.stringify(report,null,1));
  // 汇总成 md：按字号归类，每档列出代表文字
  const UI={top:'顶部频道栏',right:'右侧点赞栏',text:'左下文案',pill:'全屏按钮'};
  let md=`# 字号体检\n\n机型 ${report.phone}，成片 ${report.video}，课件占成片宽 ${report.fill}%。换算：1 课件 px ≈ ${report.k.toFixed(3)} pt；剪辑字幕约 ${report.subPt.toFixed(1)} pt。\n\n分档：<10 太小｜10–12 吃力｜12–15 能读｜15–20 舒服｜20–28 醒目。\n\n`;
  if(report.pages.length){
    const byFs={};for(const pg of report.pages)for(const it of pg.items){const k=it.fs;(byFs[k]=byFs[k]||{fs:k,pt:it.pt,band:it.band,n:0,cls:new Set(),ex:[]});byFs[k].n++;byFs[k].cls.add(it.cls||'-');if(byFs[k].ex.length<3)byFs[k].ex.push(`${pg.tag}「${it.text}」`);}
    md+='## 全套字号分布\n\n| 课件 px | 手机 pt | 判断 | 处数 | 类名 | 例子 |\n|---:|---:|---|---:|---|---|\n';
    for(const r of Object.values(byFs).sort((a,b)=>b.fs-a.fs))md+=`| ${r.fs} | ${r.pt} | ${r.band} | ${r.n} | ${[...r.cls].join(' ')} | ${r.ex.join('；')} |\n`;
    md+='\n## 逐页：小于 12pt 或被界面挡住的文字\n\n';
    for(const pg of report.pages){const bad=pg.items.filter(i=>i.pt<12||i.under.length);if(!bad.length)continue;
      md+=`### ${pg.tag} ${pg.title}\n\n`;for(const i of bad)md+=`- ${i.pt}pt（${i.fs}px，${i.band}）${i.under.length?' 被'+i.under.map(u=>UI[u]).join('、')+'挡住':''}：${i.text}\n`;md+='\n';}
  }
  fs.writeFileSync(path.join(outDir,'字号体检.md'),md);
  console.log('换算 1px≈'+report.k.toFixed(3)+'pt，字幕≈'+report.subPt.toFixed(1)+'pt；界面挡住课件：'+(report.covered.map(c=>c.part).join(',')||'无'));
  if(errors.length)console.log('错误',errors);
  await b.close();
})();
