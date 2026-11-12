// node snaptest.cjs 成品.html [页序号0起] → 改宽/移动吸附（中轴、三分之一）、参考线名称、撤销（默认找第一张 rows 版式页）
const {launch,open,arg,clearCache}=require('./_lib.cjs');
(async()=>{const b=await launch();const errs=[];const p=await open(b,arg(2,'成品.html'),errs);
const pi=process.argv[3]!==undefined?+process.argv[3]:Math.max(0,await p.evaluate(()=>DATA.pages.findIndex(x=>x.layout==='rows'&&x.groups.length>=2)));
await p.selectOption('#pages',String(pi));await p.click('#edit');await p.waitForTimeout(300);
const sc=await p.evaluate(()=>scale);const info=await p.evaluate(()=>{const c=document.querySelector('.content'),el=document.querySelector('.content .groups > .group[data-group="0"]');const cr=c.getBoundingClientRect(),r=el.getBoundingClientRect();return {W:c.offsetWidth,left:(r.left-cr.left)/scale,right:(r.right-cr.left)/scale}});
const h=await p.locator('.content .groups > .group[data-group="0"] .ct-size').boundingBox();
const dx=(info.W/2+9-info.right)*sc;
await p.mouse.move(h.x+h.width/2,h.y+h.height/2);await p.mouse.down();await p.mouse.move(h.x+h.width/2+dx,h.y+h.height/2,{steps:12});
const mid=await p.evaluate(()=>{const g=document.querySelector('.v5-guide');return {visible:!!g&&!g.hidden,name:g&&g.dataset.name}});
await p.mouse.up();await p.waitForTimeout(150);const w=await p.evaluate(pi=>DATA.pages[pi].groups[0].geometry.width,pi);
const i2=await p.evaluate(()=>{const c=document.querySelector('.content'),el=document.querySelector('.content .groups > .group[data-group="1"]');return (el.getBoundingClientRect().left-c.getBoundingClientRect().left)/scale});
const m=await p.locator('.content .groups > .group[data-group="1"] .ct-move').boundingBox();const mdx=((info.W/3+10)-i2)*sc;
await p.mouse.move(m.x+m.width/2,m.y+m.height/2);await p.mouse.down();await p.mouse.move(m.x+m.width/2+mdx,m.y+m.height/2+3,{steps:12});const mid2=await p.evaluate(()=>{const g=document.querySelector('.v5-guide');return {visible:!g.hidden,name:g.dataset.name}});await p.mouse.up();
const after2=await p.evaluate(()=>{const c=document.querySelector('.content'),el=document.querySelector('.content .groups > .group[data-group="1"]');return Math.round((el.getBoundingClientRect().left-c.getBoundingClientRect().left)/scale)});
await p.click('#wbUndo');await p.click('#wbUndo');await p.waitForTimeout(150);const undone=await p.evaluate(pi=>[DATA.pages[pi].groups[0].geometry?.width,DATA.pages[pi].groups[1].geometry?.x],pi);
const expW=Math.round(info.W/2-info.left),expL=Math.round(info.W/3);
const pass=Math.abs(w-expW)<=1&&mid.name==='中轴'&&Math.abs(after2-expL)<=1&&mid2.name==='三分之一'&&!errs.length;
console.log(JSON.stringify({pass,page:pi+1,expectWidth:expW,gotWidth:w,guideDuringResize:mid,expectMoveLeft:expL,gotMoveLeft:after2,guideDuringMove:mid2,afterTwoUndo:undone,errs},null,1));await clearCache(p);await b.close();process.exit(pass?0:1);})();
