// node stable.cjs 成品.html → 每张卡从出现到讲完/整页预览，尺寸与断行是否完全不变
const {launch,open,arg}=require('./_lib.cjs');
(async()=>{const b=await launch();const p=await open(b,arg(2,'成品.html'));
const r=await p.evaluate(async()=>{DATA.reduceMotion=true;const bad=[];let checked=0;
function sig(el){const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);const tops=[];let s='';while(w.nextNode()){const n=w.currentNode;for(let i=0;i<n.length;i++){const rg=document.createRange();rg.setStart(n,i);rg.setEnd(n,i+1);const rc=rg.getClientRects()[0];if(!rc)continue;const t=Math.round(rc.top/scale);if(tops.length&&Math.abs(t-tops[tops.length-1])>4){s+='⏎';}tops.push(t);s+=n.nodeValue[i];}}return s;}
for(let i=0;i<DATA.pages.length;i++){page=i;detailStep=0;const n=DATA.pages[i].groups.length;const first={};
 const states=[...Array(n).keys()].map(f=>[false,f]).concat([[true,-1]]);
 for(const [all,f] of states){showAll=all;focus=f;render();await new Promise(r=>setTimeout(r,15));
  document.querySelectorAll('.content .groups > .group').forEach((el,j)=>{if(!el.getClientRects().length)return;const rc=el.getBoundingClientRect();
   const s={w:Math.round(rc.width/scale),h:Math.round(rc.height/scale),t:[...el.querySelectorAll('.label,.gtitle,.body-display')].filter(x=>x.getClientRects().length).map(sig).join(' | ')};
   if(DATA.pages[i].layout==='master')s.t=[...el.querySelectorAll('.label,.gtitle')].map(sig).join(' | '),s.h=Math.round(el.querySelector('.gtitle').getBoundingClientRect().height/scale);
   checked++;if(!first[j]){first[j]={...s,st:all?'整页':'第'+(f+1)+'步'};return;}
   const a=first[j];if(a.w!==s.w||a.h!==s.h||a.t!==s.t)bad.push({pg:DATA.pages[i].id,card:j+1,from:a.st,to:all?'整页':'第'+(f+1)+'步',before:[a.w,a.h,a.t.slice(0,60)],after:[s.w,s.h,s.t.slice(0,60)]});});}}
return {checked,bad};});
console.log('比对',r.checked,'次；变化',r.bad.length,'处');for(const x of r.bad)console.log(JSON.stringify(x));await b.close();})();
