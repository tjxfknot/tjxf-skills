// node spacing.cjs 成品.html [输出目录]
// 量化版面：每页整页状态下量 ① 卡片之间有没有互相压住（scrollHeight 查不出这种），② 卡底离安全底线还有多少、下半部空了多少，
// ③ 超出底线多少 px；按「修正阶梯」给出该怎么改（参考歸藏 validate-swiss-deck 的 M1/M2，换成口播课件的数值）。
// 安全底线 y1120；全宽卡片要在人物框上沿 y780 以上（人物框 x1140–1484、y780–1120）。
const {launch,open,arg,path,fs}=require('./_lib.cjs');
const SAFE=1120, PORTRAIT={x:1140,y:780,r:1484,b:1120}, SPARSE=600;
function ladder(over){ // 超出底线的修正阶梯
  if(over<=40)return '1–40px：只微调——收紧卡片间距（页面 → 间距滑块）或上移内容，不删字';
  if(over<=90)return '40–90px：压间距或顶距，说明字号可降一档（44→40），重点保持 60';
  if(over<=160)return '90–160px：压一段说明或标题改短；必要时拆页';
  return '160px 以上：换版式（如 rows→bh 两列）、拆成两页，或删内容';
}
(async()=>{const file=arg(2,'成品.html'),ev=process.argv[3]&&path.resolve(process.argv[3]);
 const b=await launch();const errs=[];const p=await open(b,file,errs);
 const res=await p.evaluate(async([SAFE,P,SPARSE])=>{DATA.reduceMotion=true;const out=[];
  for(let i=0;i<DATA.pages.length;i++){page=i;focus=-1;detailStep=0;showAll=true;render();await new Promise(r=>setTimeout(r,30));
   const c=document.querySelector('.canvas').getBoundingClientRect(),k=1600/c.width;
   const rect=el=>{const r=el.getBoundingClientRect();return {x:(r.left-c.left)*k,y:(r.top-c.top)*k,w:r.width*k,h:r.height*k};};
   const cards=[...document.querySelectorAll('.content .groups > .group')].filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden').map((el,j)=>({j,el,r:rect(el)}));
   const overlaps=[];
   for(let a=0;a<cards.length;a++)for(let bb=a+1;bb<cards.length;bb++){const A=cards[a].r,B=cards[bb].r;
     const w=Math.min(A.x+A.w,B.x+B.w)-Math.max(A.x,B.x),h=Math.min(A.y+A.h,B.y+B.h)-Math.max(A.y,B.y);
     if(w>2&&h>2&&!cards[a].el.contains(cards[bb].el)&&!cards[bb].el.contains(cards[a].el))overlaps.push({a:cards[a].j+1,b:cards[bb].j+1,w:Math.round(w),h:Math.round(h)});}
   const bottom=cards.length?Math.max(...cards.map(x=>x.r.y+x.r.h)):0;
   const top=cards.length?Math.min(...cards.map(x=>x.r.y)):0;
   const intoPortrait=cards.filter(x=>x.r.x+x.r.w>P.x+2&&x.r.y+x.r.h>P.y+2).map(x=>x.j+1);
   out.push({id:DATA.pages[i].id,title:DATA.pages[i].title,layout:DATA.pages[i].layout,cards:cards.length,top:Math.round(top),bottom:Math.round(bottom),
     over:Math.max(0,Math.round(bottom-SAFE)),free:Math.round(SAFE-bottom),sparse:cards.length>=2&&bottom<SPARSE,overlaps,intoPortrait});}
  return out;},[SAFE,PORTRAIT,SPARSE]);
 let bad=0;const lines=[];
 for(const r of res){const msg=[];
  if(r.overlaps.length){bad++;msg.push('✗ 卡片互相压住：'+r.overlaps.map(o=>`第${o.a}与第${o.b}张重叠${o.w}×${o.h}px`).join('；')+' → 检查格子位置（cells）、手动移动过的卡、改宽');}
  if(r.over){bad++;msg.push(`✗ 超出底线 ${r.over}px → ${ladder(r.over)}`);}
  if(r.intoPortrait.length)msg.push(`△ 第${r.intoPortrait.join('、')}张进入人物框区 → 改窄到 1072 或上移（verify 会报遮挡）`);
  if(r.sparse)msg.push(`△ 下半部空：卡底 y${r.bottom}，离底线还有 ${r.free}px → 调大重点/说明字号或间距（重点最大 72），全宽卡底仍在 y780 以上`);
  lines.push(`${r.id} ${r.layout.padEnd(7)} ${String(r.cards).padStart(2)}张 卡底${String(r.bottom).padStart(5)}/${SAFE} ${msg.length?msg.join('；'):'✓'}`);}
 console.log(lines.join('\n'));
 const sum={pages:res.length,overlapPages:res.filter(r=>r.overlaps.length).length,overPages:res.filter(r=>r.over).length,sparsePages:res.filter(r=>r.sparse).length,pass:bad===0,errs};
 console.log(JSON.stringify(sum));
 if(ev){fs.mkdirSync(ev,{recursive:true});fs.writeFileSync(path.join(ev,'版面量化.json'),JSON.stringify(res,null,1));}
 await b.close();process.exit(bad||errs.length?1:0);})().catch(e=>{console.error(e);process.exit(1)});
