// node flyaudit.cjs 成品.html → 开动画逐步推进，列出"已在画面上的卡片"被动画移动/改尺寸的情况，以及残影
const {launch,open,arg}=require('./_lib.cjs');
(async()=>{const b=await launch();const p=await open(b,arg(2,'成品.html'));
const r=await p.evaluate(async()=>{DATA.reduceMotion=false;const bad=[];let steps=0;
for(let i=0;i<DATA.pages.length;i++){stop();page=i;focus=-1;detailStep=0;showAll=false;render();await new Promise(r=>setTimeout(r,30));
 const seq=[...DATA.pages[i].groups.keys(),'all'];
 for(const f of seq){const existing=new Set([...document.querySelectorAll('.content .groups > .group:not(.pending)')].map(e=>e.dataset.group));
  if(f==='all'){showAll=true;focus=-1;}else{focus=f;}render();steps++;
  for(const a of document.getAnimations()){const el=a.effect?.target;if(!el||!el.closest)continue;const grp=el.closest('.groups > .group');if(!grp||!existing.has(grp.dataset.group))continue;
   const kf=a.effect.getKeyframes();if(kf.length<2)continue;const A=kf[0],B=kf[kf.length-1];const diffs=[];
   for(const k of ['transform','width','height','fontSize']){if(A[k]!==undefined&&A[k]!==B[k]){const na=parseFloat(String(A[k]).replace(/[^\d.-]+/g,' ').trim().split(' ').map(Number).reduce((x,y)=>x+Math.abs(y),0)),nb=parseFloat(String(B[k]).replace(/[^\d.-]+/g,' ').trim().split(' ').map(Number).reduce((x,y)=>x+Math.abs(y),0));if(Math.abs(na-nb)>1.5)diffs.push(k+': '+A[k]+' → '+B[k]);}}
   if(diffs.length)bad.push({pg:DATA.pages[i].id,step:f,card:+grp.dataset.group+1,diffs});}
  const ghosts=[...document.querySelectorAll('.outgoing-detail')].filter(g=>getComputedStyle(g).visibility!=='hidden').length;if(ghosts)bad.push({pg:DATA.pages[i].id,step:f,ghosts});
  await new Promise(r=>setTimeout(r,900));}}
return {steps,bad};});
console.log('推进',r.steps,'步；问题',r.bad.length,'处');for(const x of r.bad.slice(0,40))console.log(JSON.stringify(x));await b.close();})();
