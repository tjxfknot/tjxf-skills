// node shot.cjs 成品.html 输出目录 "页:重点[:all]" …   截图指定页的指定讲解状态（带人物框辅助线）
const {launch,open,arg,path,fs}=require('./_lib.cjs');
(async()=>{const file=arg(2,'成品.html'),outDir=path.resolve(arg(3,'输出目录'));fs.mkdirSync(outDir,{recursive:true});const b=await launch();const p=await open(b,file);
for(const sp of process.argv.slice(4)){const [pg,f,all]=sp.split(':');
 const st=await p.evaluate(([pg,f,all])=>{DATA.reduceMotion=true;page=pg-1;detailStep=0;showAll=!!all;focus=all?-1:f-1;render();document.querySelector('.canvas').classList.add('guides');return {overflow,status:document.querySelector('#status').textContent.slice(0,20)};},[+pg,+f,all]);
 await p.waitForTimeout(80);await p.locator('.screen').screenshot({path:path.join(outDir,`p${pg}-${all?'all':'f'+f}.png`)});console.log(sp,JSON.stringify(st));}
await b.close();})();
