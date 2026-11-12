// node bgimg.cjs 成品.html 输出目录 图片 [更多图片…]
// 第一张图：上传、透明度/铺放/模糊/去色、保存刷新、导出重开、移除与撤销；每张图：压缩后尺寸、体积、透明角落、本地存储体积
const {launch,open,arg,clearCache,path,fs}=require('./_lib.cjs');
(async()=>{const file=arg(2,'成品.html'),ev=path.resolve(arg(3,'输出目录')),imgs=process.argv.slice(4);if(!imgs.length){console.error('缺少图片');process.exit(2);}fs.mkdirSync(ev,{recursive:true});
const b=await launch();const errs=[];let p=await open(b,file,errs);const res={};
await p.click('#settingsBtn');await p.waitForTimeout(300);
res.hiddenBefore=await p.evaluate(()=>document.querySelector('#v5BgImgCtl').hidden);
await p.setInputFiles('#v5BgUp input[type=file]',path.resolve(imgs[0]));await p.waitForTimeout(3000);
res.up=await p.evaluate(()=>{const L=document.querySelector('.canvas .v5-bgimg');return {has:!!L,op:L&&L.style.opacity,fit:DATA.bg.fit,kb:Math.round(DATA.bg.img.length*0.75/1024),ctlShown:!document.querySelector('#v5BgImgCtl').hidden}});
await p.locator('#v5BgImgCtl [data-k=op]').fill('0.6');await p.locator('#v5BgImgCtl [data-k=op]').dispatchEvent('change');
await p.selectOption('#v5BgImgCtl select','contain');await p.locator('#v5BgImgCtl [data-k=blur]').fill('4');await p.locator('#v5BgImgCtl [data-k=blur]').dispatchEvent('change');await p.check('#v5BgImgCtl [data-k=gray]');await p.waitForTimeout(200);
res.adj=await p.evaluate(()=>{const L=document.querySelector('.canvas .v5-bgimg');return {op:L.style.opacity,size:L.style.backgroundSize,filter:L.style.filter,data:{op:DATA.bg.op,fit:DATA.bg.fit,blur:DATA.bg.blur,gray:DATA.bg.gray}}});
await p.locator('.screen').screenshot({path:path.join(ev,'上传底图示例.png')});
await p.click('#save');await p.waitForTimeout(300);await p.reload();await p.evaluate(()=>document.fonts.ready);
res.reloaded=await p.evaluate(()=>({has:!!document.querySelector('.canvas .v5-bgimg'),op:DATA.bg&&DATA.bg.op,fit:DATA.bg&&DATA.bg.fit,gray:DATA.bg&&DATA.bg.gray}));
const dl=p.waitForEvent('download');await p.click('#export');const f=path.join(ev,'上传底图导出验证.html');await (await dl).saveAs(f);
await p.click('#settingsBtn');await p.waitForTimeout(200);await p.click('#v5BgDel');await p.waitForTimeout(150);res.removed=await p.evaluate(()=>!document.querySelector('.canvas .v5-bgimg')&&!DATA.bg.img);
await p.click('#wbUndo');await p.waitForTimeout(150);res.undoRestores=await p.evaluate(()=>!!document.querySelector('.canvas .v5-bgimg'));
await clearCache(p);await p.close();
p=await open(b,f,errs);res.exported=await p.evaluate(()=>({has:!!document.querySelector('.canvas .v5-bgimg'),op:DATA.bg.op,fit:DATA.bg.fit,blur:DATA.bg.blur,gray:DATA.bg.gray}));await p.close();
res.images={};
for(const im of imgs){const q=await open(b,file,errs);await q.click('#settingsBtn');await q.waitForTimeout(200);await q.setInputFiles('#v5BgUp input[type=file]',path.resolve(im));await q.waitForTimeout(3000);await q.click('#save');await q.waitForTimeout(300);
 res.images[path.basename(im)]=await q.evaluate(async()=>{const s=DATA.bg&&DATA.bg.img;if(!s)return {fail:true};const img=new Image();img.src=s;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);const k=Object.keys(localStorage).find(k=>k.includes(DECK.key));return {w:img.width,h:img.height,kb:Math.round(s.length*0.75/1024),cornerAlpha:g.getImageData(2,2,1,1).data[3],storedKB:Math.round((localStorage.getItem(k)||'').length/1024)};});
 await clearCache(q);await q.close();}
res.errs=errs;const pass=res.up.has&&res.reloaded.has&&res.exported.has&&res.removed&&res.undoRestores&&res.exported.fit==='contain'&&res.exported.gray===true&&!errs.length;
fs.writeFileSync(path.join(ev,'底图验证.json'),JSON.stringify(res,null,2));console.log(JSON.stringify({pass,...res},null,1));await b.close();process.exit(pass?0:1);})().catch(e=>{console.error(e);process.exit(1)});
