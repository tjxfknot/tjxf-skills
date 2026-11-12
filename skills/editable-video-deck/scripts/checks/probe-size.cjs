// 试字号：node probe-size.cjs 成品.html 标题 重点 正文（0=不改）→ 报告每页溢出的步骤 → 报告每页溢出的步骤
const {launch,open}=require('./_lib.cjs');
const [file,title,card,body]=[process.argv[2],+process.argv[3],+process.argv[4],+process.argv[5]];
(async()=>{const b=await launch();const p=await open(b,file);
const r=await p.evaluate(async([t,c,bo])=>{DATA.reduceMotion=true;const out=[];for(let i=0;i<DATA.pages.length;i++){const d=DATA.pages[i].design;if(t)d.titleSize=t;if(c)d.cardSize=c;if(bo)d.bodySize=bo;page=i;focus=-1;detailStep=0;showAll=false;render();const bad=[];for(let j=0;j<DATA.pages[i].groups.length;j++){focus=j;detailStep=0;render();for(let k=0;k<detailCount();k++){detailStep=k;render();await new Promise(r=>setTimeout(r,20));if(overflow)bad.push((j+1)+(k?'.'+k:''));}}showAll=true;focus=-1;render();await new Promise(r=>setTimeout(r,20));out.push({id:DATA.pages[i].id,layout:DATA.pages[i].layout,steps:bad.join(','),all:overflow,status:overflow?document.querySelector('#status').textContent.slice(0,14):''});}return out;},[title,card,body]);
for(const x of r)console.log(x.id,x.layout.padEnd(10),'逐步溢出:',x.steps||'-','整页:',x.all?'溢出 '+x.status:'ok');await b.close();})();
