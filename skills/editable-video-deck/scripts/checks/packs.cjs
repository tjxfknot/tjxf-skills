// node packs.cjs 成品.html [输出目录] [主题包,…]
// 主题包“只换皮不动骨”检查：以经典学院为基准，逐套换上主题包，逐页逐讲解状态比对每张卡的位置尺寸、每行断点、标题字号与连线
// （与 compare.cjs 同一套采集），期望 0 差异；给了输出目录就每套每页截整页图（文件名 套名-第N页.png），便于拼总览目测。
const {launch,open,arg,path,fs}=require('./_lib.cjs');
async function collect(p){return p.evaluate(async()=>{DATA.reduceMotion=true;const out={};
 function sig(el){const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let s='',top=null;while(w.nextNode()){const n=w.currentNode;for(let i=0;i<n.length;i++){const rg=document.createRange();rg.setStart(n,i);rg.setEnd(n,i+1);const rc=rg.getClientRects()[0];if(!rc)continue;const t=Math.round(rc.top/scale);if(n.nodeValue[i]==='⁠')continue;if(top!==null&&Math.abs(t-top)>4)s+='⏎';top=t;s+=n.nodeValue[i];}}return s;}
 const cr=()=>document.querySelector('.canvas').getBoundingClientRect();
 const box=el=>{const r=el.getBoundingClientRect(),c=cr();return [Math.round((r.left-c.left)/scale),Math.round((r.top-c.top)/scale),Math.round(r.width/scale),Math.round(r.height/scale)].join(',');};
 for(let i=0;i<DATA.pages.length;i++){page=i;detailStep=0;const n=DATA.pages[i].groups.length;
  for(const [all,f] of [...Array(n).keys()].map(f=>[false,f]).concat([[true,-1]])){showAll=all;focus=f;render();await new Promise(r=>setTimeout(r,15));
   const st={overflow,title:[box(document.querySelector('.content .title')),getComputedStyle(document.querySelector('.content .title')).fontSize,sig(document.querySelector('.content .title'))].join('|'),cards:[]};
   document.querySelectorAll('.content .groups > .group').forEach(el=>{if(!el.getClientRects().length||getComputedStyle(el).visibility==='hidden'){st.cards.push('-');return;}
    st.cards.push(box(el)+'|'+[...el.querySelectorAll('.label,.gtitle,.body-display')].filter(x=>x.getClientRects().length&&getComputedStyle(x).display!=='none').map(x=>getComputedStyle(x).fontSize+':'+sig(x)).join(' / '));});
   const link=document.querySelector('.content .v5-link path');if(link)st.link=link.getAttribute('d');
   out[DATA.pages[i].id+(all?'@整页':'@第'+(f+1)+'步')]=st;}}return out;});}
(async()=>{const file=arg(2,'成品.html'),ev=process.argv[3]&&process.argv[3]!=='-'?path.resolve(process.argv[3]):null;
 const b=await launch();const errs=[];const p=await open(b,file,errs);
 const ids=process.argv[4]?process.argv[4].split(','):await p.evaluate(()=>EVDPacks.ORDER.slice());
 await p.evaluate(()=>EVDPacks.apply('classic'));await p.waitForTimeout(100);
 const base=await collect(p);const report={states:Object.keys(base).length,packs:{}};
 if(ev)fs.mkdirSync(ev,{recursive:true});
 for(const id of ids){
  const info=await p.evaluate(id=>{EVDPacks.apply(id);return {pack:document.body.dataset.pack,theme:DATA.theme,bg:DATA.bg&&DATA.bg.kind,paper:getComputedStyle(document.querySelector('.canvas')).backgroundColor};},id);
  await p.waitForTimeout(100);const now=await collect(p);const diffs=[];
  for(const k of Object.keys(base)){const x=base[k],y=now[k];if(!y){diffs.push({state:k,missing:true});continue;}
   if(x.overflow!==y.overflow)diffs.push({state:k,overflow:[x.overflow,y.overflow]});if(x.title!==y.title)diffs.push({state:k,title:[x.title,y.title]});if(x.link!==y.link)diffs.push({state:k,link:true});
   x.cards.forEach((v,j)=>{if(v!==y.cards[j])diffs.push({state:k,card:j+1,old:v,new:y.cards[j]});});}
  report.packs[id]={...info,diffs:diffs.length,sample:diffs.slice(0,5)};
  if(ev){const n=await p.evaluate(()=>DATA.pages.length);for(let i=0;i<n;i++){await p.evaluate(i=>{page=i;focus=-1;showAll=true;render();},i);await p.waitForTimeout(60);
   await p.locator('.canvas').screenshot({path:path.join(ev,`${id}-第${String(i+1).padStart(2,'0')}页.png`)});}}
 }
 await p.evaluate(()=>EVDPacks.apply('classic'));
 report.errs=errs;console.log(JSON.stringify(report,null,1));
 const bad=Object.values(report.packs).some(r=>r.diffs)||errs.length;await b.close();process.exit(bad?1:0);})().catch(e=>{console.error(e);process.exit(1)});
