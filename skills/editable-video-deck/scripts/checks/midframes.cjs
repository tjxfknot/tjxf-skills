// node midframes.cjs 成品.html 输出目录 页码:从第几条 …   动画放慢3倍，连拍 150/700/1400ms 三帧（人工复核用）
const {launch,open,arg,path,fs}=require('./_lib.cjs');
(async()=>{const file=arg(2,'成品.html'),ev=path.resolve(arg(3,'输出目录'));fs.mkdirSync(ev,{recursive:true});const b=await launch();const p=await open(b,file);
await p.evaluate(()=>{const A=Element.prototype.animate;Element.prototype.animate=function(k,o){if(o&&typeof o==='object'&&o.duration)o={...o,duration:o.duration*3};return A.call(this,k,o);};DATA.reduceMotion=false;});
for(const sp of process.argv.slice(4)){const [pg,from]=sp.split(':').map(Number);await p.evaluate(([pg,f])=>{stop();page=pg-1;showAll=false;detailStep=0;focus=f-1;render();},[pg,from]);await p.waitForTimeout(3000);
 await p.evaluate(()=>{focus++;render();});let t0=0;for(const t of [150,700,1400]){await p.waitForTimeout(t-t0);t0=t;await p.locator('.screen').screenshot({path:path.join(ev,`第${pg}页-第${from}到${from+1}条-${t}ms.png`)});}}
await b.close();})();
