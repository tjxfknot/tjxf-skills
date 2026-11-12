// node dragtest.cjs 成品.html [页序号0起]  → 长按拖动换位、撤销、重做（默认找第一张 bh 版式且≥4张卡的页）
const {launch,open,arg,clearCache}=require('./_lib.cjs');
(async()=>{const b=await launch();const errs=[];const p=await open(b,arg(2,'成品.html'),errs);
const pi=process.argv[3]!==undefined?+process.argv[3]:await p.evaluate(()=>DATA.pages.findIndex(x=>x.layout==='bh'&&x.groups.length>=4));
if(pi<0){console.log('没有 bh 版式页，跳过');await b.close();return;}
await p.selectOption('#pages',String(pi));await p.click('#edit');await p.waitForTimeout(200);
const cells=()=>p.evaluate(pi=>DATA.pages[pi].groups.map(g=>g.id+'@'+(g.cell?g.cell.c+'-'+g.cell.r:'?')).join(' '),pi);   // 带 id：0.3.3 起换位后讲解顺序按格子重排，只看格子序列会看不出变化
const tgt=await p.evaluate(pi=>{const g=DATA.pages[pi].groups,i=g.findIndex(x=>x.cell&&g[0].cell&&x.cell.c!==g[0].cell.c);return i>0?i:3;},pi);   // 拖到另一列第一张（同列末张可能在窗口外）
const s0=await cells();
const c1=await p.locator('.content .groups > .group[data-group="0"]').boundingBox(),c2=await p.locator('.content .groups > .group[data-group="'+tgt+'"]').boundingBox();
await p.mouse.move(c1.x+8,c1.y+c1.height/2);await p.mouse.down();await p.waitForTimeout(650);await p.mouse.move(c2.x+c2.width/2,c2.y+c2.height/2,{steps:10});await p.mouse.up();await p.waitForTimeout(200);
const s1=await cells();await p.click('#wbUndo');await p.waitForTimeout(150);const s2=await cells();await p.click('#wbRedo');await p.waitForTimeout(150);const s3=await cells();
const pass=s1!==s0&&s2===s0&&s3===s1&&!errs.length;
console.log(JSON.stringify({pass,page:pi+1,before:s0,afterLongPress:s1,afterUndo:s2,afterRedo:s3,errs},null,1));await clearCache(p);await b.close();process.exit(pass?0:1);})();
