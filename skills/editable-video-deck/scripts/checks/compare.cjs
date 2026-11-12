// node compare.cjs 旧.html 新.html [输出目录]  → 两份课件逐页、逐讲解状态比对：每张卡位置尺寸、每行断点、页面层文字字号；可选输出两边整页截图
// 用途：改引擎/换构建脚本后的回归（新构建应与已验收版本画面一致）
const {launch,open,arg,path,fs}=require('./_lib.cjs');
async function collect(p){return p.evaluate(async()=>{DATA.reduceMotion=true;const out={};
 function sig(el){const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let s='',top=null;while(w.nextNode()){const n=w.currentNode;for(let i=0;i<n.length;i++){const rg=document.createRange();rg.setStart(n,i);rg.setEnd(n,i+1);const rc=rg.getClientRects()[0];if(!rc)continue;const t=Math.round(rc.top/scale);if(n.nodeValue[i]==='\u2060')continue;if(top!==null&&Math.abs(t-top)>4)s+='⏎';top=t;s+=n.nodeValue[i];}}return s;}
 const cr=()=>document.querySelector('.canvas').getBoundingClientRect();
 const box=el=>{const r=el.getBoundingClientRect(),c=cr();return [Math.round((r.left-c.left)/scale),Math.round((r.top-c.top)/scale),Math.round(r.width/scale),Math.round(r.height/scale)].join(',');};
 for(let i=0;i<DATA.pages.length;i++){page=i;detailStep=0;const n=DATA.pages[i].groups.length;
  for(const [all,f] of [...Array(n).keys()].map(f=>[false,f]).concat([[true,-1]])){showAll=all;focus=f;render();await new Promise(r=>setTimeout(r,15));
   const st={overflow,title:[box(document.querySelector('.content .title')),getComputedStyle(document.querySelector('.content .title')).fontSize,sig(document.querySelector('.content .title'))].join('|'),cards:[]};
   document.querySelectorAll('.content .groups > .group').forEach(el=>{if(!el.getClientRects().length||getComputedStyle(el).visibility==='hidden'){st.cards.push('-');return;}
    st.cards.push(box(el)+'|'+[...el.querySelectorAll('.label,.gtitle,.body-display')].filter(x=>x.getClientRects().length&&getComputedStyle(x).display!=='none').map(x=>getComputedStyle(x).fontSize+':'+sig(x)).join(' / '));});
   const link=document.querySelector('.content .v5-link path');if(link)st.link=link.getAttribute('d');
   out[DATA.pages[i].id+(all?'@整页':'@第'+(f+1)+'步')]=st;}}return out;});}
(async()=>{const A=arg(2,'旧.html'),B=arg(3,'新.html'),ev=process.argv[4]&&path.resolve(process.argv[4]);const b=await launch();const errs=[];
const pa=await open(b,A,errs),pb=await open(b,B,errs);const a=await collect(pa),c=await collect(pb);const diffs=[];
for(const k of new Set([...Object.keys(a),...Object.keys(c)])){const x=a[k],y=c[k];if(!x||!y){diffs.push({state:k,missing:!x?'旧':'新'});continue;}
 if(x.overflow!==y.overflow)diffs.push({state:k,overflow:[x.overflow,y.overflow]});if(x.title!==y.title)diffs.push({state:k,title:[x.title,y.title]});if(x.link!==y.link)diffs.push({state:k,link:[x.link,y.link]});
 x.cards.forEach((v,j)=>{if(v!==y.cards[j])diffs.push({state:k,card:j+1,old:v,new:y.cards[j]});});if(x.cards.length!==y.cards.length)diffs.push({state:k,cardCount:[x.cards.length,y.cards.length]});}
if(ev){fs.mkdirSync(ev,{recursive:true});for(const [p,tag] of [[pa,'旧'],[pb,'新']]){const n=await p.evaluate(()=>DATA.pages.length);for(let i=0;i<n;i++){await p.evaluate(i=>{page=i;focus=-1;showAll=true;render();},i);await p.waitForTimeout(60);await p.locator('.screen').screenshot({path:path.join(ev,`第${i+1}页-${tag}.png`)});}}}
console.log(JSON.stringify({states:Object.keys(a).length,diffs:diffs.length,errs},null,1));for(const d of diffs.slice(0,40))console.log(JSON.stringify(d));await b.close();process.exit(diffs.length||errs.length?1:0);})().catch(e=>{console.error(e);process.exit(1)});
