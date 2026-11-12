/*EVD_PHONE_START*/
/* evd-phone-preview 0.3.7 · 编辑台里的「手机预览」
   看当前讲解画面放进成片、再放进抖音信息流后，在手机上有多大；同时给这一屏做字号体检。
   做法：弹层里嵌一份同一个课件文件的只读副本（地址带 #evd-phone），副本切拍摄模式、关动画、禁写本地存储，
   按父页面发来的 DATA 和讲解状态渲染，所以手机里看到的就是录屏时的画面（伪元素、底图、字体都不走样）。
   字号体检在副本里量，回传父页面列清单。换算见 references/phone-legibility.md；与 assets/phone-preview/phone-preview.html 的
   界面绘制是同一套（改一处要同步另一处）。依赖骨架全局：DATA page focus detailStep showAll render resize applyStyle step turn。 */
(function(){
'use strict';
var MSG='evd-phone';
var FONT='"PingFang SC","Noto Sans SC","Microsoft YaHei","Heiti SC",sans-serif';
if(location.hash==='#'+MSG){frameMode();return;}

/* ================= 副本（iframe 里） ================= */
function frameMode(){
  try{var SP=Storage.prototype;SP.setItem=function(){};SP.removeItem=function(){};SP.clear=function(){};}catch(e){}
  try{if(window.EditDesk){EditDesk.save=function(){};EditDesk.saveNow=function(){return true;};}}catch(e){}
  var st=document.createElement('style');
  st.textContent='#wbPanel,#edToast,.guide,.pin-layer,.pins,[data-ed-ui]{display:none!important}*,*:before,*:after{animation:none!important;transition:none!important}'
    +'.evd-mark{position:absolute;z-index:99;border:3px solid;pointer-events:none;box-sizing:border-box}'
    +'.evd-mark b{position:absolute;left:-3px;top:-27px;font:700 20px/24px '+FONT+';color:#fff;padding:0 6px;white-space:nowrap}';
  document.head.appendChild(st);
  function shoot(){document.body.classList.add('capture');var c=document.querySelector('.canvas');if(c)c.classList.remove('guides');try{resize();}catch(e){}}
  try{DATA.reduceMotion=true;}catch(e){}
  shoot();
  window.addEventListener('message',function(e){var m=e.data;if(!m||m.type!==MSG+'-state')return;
    try{
      if(m.data){var d=JSON.parse(m.data);Object.keys(DATA).forEach(function(k){delete DATA[k];});Object.assign(DATA,d);DATA.reduceMotion=true;}
      page=m.page;focus=m.focus;detailStep=m.detailStep;showAll=m.showAll;
      render();if(typeof applyStyle==='function')applyStyle();shoot();
    }catch(err){parent.postMessage({type:MSG+'-error',msg:String(err),stack:String(err&&err.stack||'').slice(0,600)},'*');}
    setTimeout(function(){var items=audit();mark(items,m.mark,m.k);parent.postMessage({type:MSG+'-audit',items:items},'*');},150);
  });
  parent.postMessage({type:MSG+'-ready'},'*');
}
/* 量这一屏所有可见文字：渲染后的字号（课件 px，含元素自己的缩放）与位置 */
function audit(){
  var cv=document.querySelector('.canvas');if(!cv)return [];
  var cr=cv.getBoundingClientRect(),s=1600/cr.width,out=[],seen=new Set();
  var tw=document.createTreeWalker(cv,NodeFilter.SHOW_TEXT);
  while(tw.nextNode()){
    var node=tw.currentNode,el=node.parentElement;if(!node.nodeValue.trim()||seen.has(el))continue;seen.add(el);
    if(el.closest('.guide,.evd-mark'))continue;
    var r=el.getBoundingClientRect();if(r.width<2||r.height<2)continue;
    var o=el,hid=false;while(o&&o!==document.body){var c=getComputedStyle(o);if(c.display==='none'||c.visibility==='hidden'||+c.opacity===0){hid=true;break;}o=o.parentElement;}
    if(hid)continue;
    var fs=parseFloat(getComputedStyle(el).fontSize),own=el.offsetWidth?r.width/el.offsetWidth:cr.width/1600;
    out.push({t:(el.innerText||node.nodeValue).trim().replace(/\s+/g,' ').slice(0,28),px:+(fs*own*s).toFixed(1),
      x:+((r.left-cr.left)*s).toFixed(1),y:+((r.top-cr.top)*s).toFixed(1),w:+(r.width*s).toFixed(1),h:+(r.height*s).toFixed(1)});
  }
  return out;
}
function mark(items,on,k){
  document.querySelectorAll('.evd-mark').forEach(function(n){n.remove();});
  if(!on)return;var cv=document.querySelector('.canvas');
  items.forEach(function(it){var pt=it.px*k;if(pt>=12)return;var col=pt<10?'#d93025':'#e3a008';
    var d=document.createElement('div');d.className='evd-mark';d.style.cssText='left:'+it.x+'px;top:'+it.y+'px;width:'+it.w+'px;height:'+it.h+'px;border-color:'+col;
    var b=document.createElement('b');b.style.background=col;b.textContent=pt.toFixed(1)+'pt';d.appendChild(b);cv.appendChild(d);});
}

/* ================= 父页面：弹层 ================= */
var PHONES={
  ip16pro:{name:'iPhone 16 Pro',W:402,H:874,top:59,bottom:34,island:true,mmW:65.1},
  ip16promax:{name:'iPhone 16 Pro Max',W:440,H:956,top:59,bottom:34,island:true,mmW:71.5},
  ip13mini:{name:'iPhone 13 mini',W:375,H:812,top:50,bottom:34,island:false,mmW:57.7},
  android412:{name:'常见安卓（412 宽）',W:411.43,H:914.29,top:32,bottom:16,island:false,mmW:69.5},
  android360:{name:'小屏安卓（360 宽）',W:360,H:800,top:30,bottom:16,island:false,mmW:64.0}
};
var VIDEO={'4:3':{ar:4/3,fill:100,valign:'center'},'16:9':{ar:16/9,fill:75,valign:'center'},'9:16':{ar:9/16,fill:100,valign:'top'},'3:4':{ar:3/4,fill:100,valign:'top'}};
var PIP={x:1140/1600,y:780/1200,w:344/1600,h:340/1200};
var P_KEY='evd-phone-prefs';
var S={phone:'ip16pro',video:'4:3',fill:100,valign:'center',ui:true,pip:true,sub:true,mark:true,real:false,ppmm:5,
  subText:'剪辑字幕示例：这里是剪辑加的字幕',nick:'@账号名',caption:'这里是视频文案 #高考志愿'};
try{var saved=JSON.parse(localStorage.getItem(P_KEY)||'null');if(saved)Object.keys(saved).forEach(function(k){if(k in S)S[k]=saved[k];});}catch(e){}
function keep(){try{localStorage.setItem(P_KEY,JSON.stringify({phone:S.phone,video:S.video,fill:S.fill,valign:S.valign,ui:S.ui,pip:S.pip,sub:S.sub,mark:S.mark,real:S.real,ppmm:S.ppmm}));}catch(e){}}

var box=null,frame=null,ready=false,isOpen=false,L=null,lastItems=[],syncT=0;

function band(pt){if(pt<10)return['bad','太小'];if(pt<12)return['mid','吃力'];if(pt<15)return['fine','能读'];if(pt<20)return['ok','舒服'];if(pt<=28)return['big','醒目'];return['','很大'];}
function layout(){
  var P=PHONES[S.phone],V=VIDEO[S.video],tabH=49+P.bottom,feedB=P.H-tabH;
  var vw=P.W,vh=vw/V.ar,x0=0,y0=(feedB-vh)/2;if(vh>feedB){vh=feedB;vw=vh*V.ar;x0=(P.W-vw)/2;y0=0;}
  var cw=vw*S.fill/100,ch=cw*0.75,cx=x0+(vw-cw)/2,cy=S.valign==='top'?y0:y0+(vh-ch)/2,portrait=V.ar<1,pip=null;
  if(S.pip){if(portrait){var top=Math.min(cy+ch,y0+vh);if(y0+vh-top>40)pip={x:x0,y:top,w:vw,h:y0+vh-top};}
    else pip={x:cx+PIP.x*cw,y:cy+PIP.y*ch,w:PIP.w*cw,h:PIP.h*ch};}
  var gap=76,disc=feedB-46;
  return {P:P,tabH:tabH,feedB:feedB,video:{x:x0,y:y0,w:vw,h:vh},cw:{x:cx,y:cy,w:cw,h:ch},k:cw/1600,portrait:portrait,pip:pip,
    subPx:portrait?0.0625*vw:0.0347*vw,subY:portrait?y0+vh*0.80:y0+vh*0.935,colX:P.W-36,disc:disc,gap:gap,
    pill:portrait?null:{x:P.W/2-54,y:y0+vh+14,w:108,h:30}};
}

/* ---------- 界面绘制（与 phone-preview.html 同一套） ---------- */
var IC={heart:'M12 20.6s-7.6-4.7-9.9-9.2C.6 8 2.6 4.2 6.3 4.2c2.2 0 3.8 1.2 5.7 3.3 1.9-2.1 3.5-3.3 5.7-3.3 3.7 0 5.7 3.8 4.2 7.2-2.3 4.5-9.9 9.2-9.9 9.2z',
  bubble:'M12 3.2c-5.5 0-9.8 3.7-9.8 8.3 0 2.5 1.3 4.8 3.5 6.3l-.7 3.6 4.2-2.3c.9.2 1.8.3 2.8.3 5.5 0 9.8-3.7 9.8-8.3S17.5 3.2 12 3.2z',
  star:'M12 2.6l2.9 6 6.5.8-4.8 4.5 1.2 6.5L12 17.2l-5.8 3.2 1.2-6.5-4.8-4.5 6.5-.8z',
  share:'M13.6 4.2l8.2 7.4-8.2 7.4v-4.3c-5.6 0-9.2 1.8-11.4 5.5.7-6 3.8-10.9 11.4-11.8z'};
function drawOver(c,l,disp){
  var P=l.P,W=P.W,dpr=(window.devicePixelRatio||1)*disp;c.width=Math.round(W*dpr);c.height=Math.round(P.H*dpr);
  var x=c.getContext('2d');x.setTransform(dpr,0,0,dpr,0,0);x.clearRect(0,0,W,P.H);
  function rr(a,b,w,h,r){x.beginPath();x.moveTo(a+r,b);x.arcTo(a+w,b,a+w,b+h,r);x.arcTo(a+w,b+h,a,b+h,r);x.arcTo(a,b+h,a,b,r);x.arcTo(a,b,a+w,b,r);x.closePath();}
  function tx(s,a,b,size,wt,col,al){x.font=(wt||400)+' '+size+'px '+FONT;x.fillStyle=col||'#fff';x.textAlign=al||'left';x.textBaseline='middle';x.shadowColor='rgba(0,0,0,.45)';x.shadowBlur=3;x.fillText(s,a,b);x.shadowBlur=0;x.textAlign='left';}
  function ic(n,a,b,sz){x.save();x.translate(a-sz/2,b-sz/2);x.scale(sz/24,sz/24);x.shadowColor='rgba(0,0,0,.35)';x.shadowBlur=4;x.fillStyle='#fff';x.fill(new Path2D(IC[n]));x.restore();}
  var v=l.video;x.save();x.beginPath();x.rect(v.x,v.y,v.w,v.h);x.clip();
  if(l.pip){var p=l.pip,s=Math.min(p.w,p.h);x.save();rr(p.x,p.y,p.w,p.h,s*0.06);x.clip();var g=x.createLinearGradient(0,p.y,0,p.y+p.h);g.addColorStop(0,'#8a9894');g.addColorStop(1,'#5d6a67');x.fillStyle=g;x.fillRect(p.x,p.y,p.w,p.h);
    x.fillStyle='#2f3836';x.beginPath();x.arc(p.x+p.w/2,p.y+p.h-s*0.62,s*0.17,0,7);x.fill();x.beginPath();x.ellipse(p.x+p.w/2,p.y+p.h+s*0.02,s*0.36,s*0.36,0,Math.PI,0);x.fill();
    x.font='600 '+Math.min(15,Math.max(9,s*0.09))+'px '+FONT;x.fillStyle='rgba(255,255,255,.85)';x.textAlign='center';x.textBaseline='top';x.fillText('主播画面',p.x+p.w/2,p.y+s*0.06);x.textAlign='left';x.restore();}
  if(S.sub&&S.subText){x.font='700 '+l.subPx+'px '+FONT;x.textAlign='center';x.textBaseline='middle';x.lineJoin='round';x.lineWidth=l.subPx*0.16;x.strokeStyle='rgba(0,0,0,.85)';
    x.strokeText(S.subText,v.x+v.w/2,l.subY,v.w*0.94);x.fillStyle='#fff';x.fillText(S.subText,v.x+v.w/2,l.subY,v.w*0.94);x.textAlign='left';}
  x.restore();
  if(!S.ui)return;
  tx('9:41',P.island?52:28,P.island?30:P.top/2+2,17,600,'#fff','center');
  var bx=W-(P.island?44:34),by=P.island?30:P.top/2+2;x.fillStyle='#fff';rr(bx-12,by-6,25,12,3.5);x.strokeStyle='rgba(255,255,255,.9)';x.lineWidth=1;x.stroke();rr(bx-10,by-4,17,8,2);x.fill();
  for(var i=0;i<4;i++)x.fillRect(bx-46+i*5,by+4-(i+1)*2.6,3,(i+1)*2.6);
  if(P.island){x.fillStyle='#000';rr(W/2-62,11,124,36,18);x.fill();}
  var ty=P.top+20;x.strokeStyle='#fff';x.lineWidth=2;x.lineCap='round';[-6,0,6].forEach(function(d){x.beginPath();x.moveTo(14,ty+d);x.lineTo(30,ty+d);x.stroke();});
  ['同城','关注','商城','推荐'].forEach(function(t,i){var on=i===3,tx0=W/2-118+i*68;tx(t,tx0,ty,on?18:17,on?600:400,on?'#fff':'rgba(255,255,255,.72)','center');if(on){x.fillStyle='#fff';x.fillRect(tx0-12,ty+15,24,2.5);}});
  x.beginPath();x.arc(W-26,ty-2,7.5,0,7);x.stroke();x.beginPath();x.moveTo(W-20.5,ty+3.5);x.lineTo(W-15,ty+9);x.stroke();
  var cx=l.colX,d=l.disc,gp=l.gap,yH=d-gp*4,yA=yH-86;
  x.fillStyle='#fff';x.beginPath();x.arc(cx,yA,25,0,7);x.fill();x.fillStyle='#7d8c88';x.beginPath();x.arc(cx,yA,23,0,7);x.fill();
  x.fillStyle='#d9dedd';x.beginPath();x.arc(cx,yA-5,8,0,7);x.fill();x.beginPath();x.ellipse(cx,yA+14,14,10,0,Math.PI,0);x.fill();
  x.fillStyle='#fe2c55';x.beginPath();x.arc(cx,yA+25,10,0,7);x.fill();x.strokeStyle='#fff';x.lineWidth=2;x.beginPath();x.moveTo(cx-4.5,yA+25);x.lineTo(cx+4.5,yA+25);x.moveTo(cx,yA+20.5);x.lineTo(cx,yA+29.5);x.stroke();
  [['heart','1.2w',38],['bubble','856',36],['star','3.4w',36],['share','2.1w',36]].forEach(function(a,i){var yy=yH+gp*i;ic(a[0],cx,yy,a[2]);if(a[0]==='bubble'){x.fillStyle='rgba(0,0,0,.55)';[-6,0,6].forEach(function(dd){x.beginPath();x.arc(cx+dd,yy-1,1.8,0,7);x.fill();});}tx(a[1],cx,yy+30,13,500,'#fff','center');});
  x.fillStyle='#222';x.beginPath();x.arc(cx,d,21,0,7);x.fill();x.strokeStyle='#555';x.lineWidth=5;x.beginPath();x.arc(cx,d,15,0,7);x.stroke();x.fillStyle='#7d8c88';x.beginPath();x.arc(cx,d,9,0,7);x.fill();
  if(l.pill){var q=l.pill;rr(q.x,q.y,q.w,q.h,q.h/2);x.fillStyle='rgba(255,255,255,.12)';x.fill();x.strokeStyle='rgba(255,255,255,.45)';x.lineWidth=1;x.stroke();tx('全屏观看',q.x+q.w/2+8,q.y+q.h/2,13,500,'#fff','center');x.strokeStyle='#fff';x.lineWidth=1.5;x.strokeRect(q.x+12,q.y+q.h/2-5,12,10);}
  var fb=l.feedB,maxW=W-96;tx(S.nick,12,fb-84,17,600,'#fff');x.font='400 15px '+FONT;var lines=[],cur='';
  for(var j=0;j<S.caption.length;j++){var t=cur+S.caption[j];if(x.measureText(t).width>maxW){lines.push(cur);cur=S.caption[j];}else cur=t;}if(cur)lines.push(cur);lines=lines.slice(0,2);
  lines.forEach(function(s2,i){tx(s2,12,fb-58+i*21,15,400,'#fff');});tx('♫ 原声 - '+S.nick.replace(/^@/,''),12,fb-58+lines.length*21+4,13,400,'rgba(255,255,255,.9)');
  x.fillStyle='rgba(255,255,255,.28)';x.fillRect(0,fb-1.5,W,1.5);x.fillStyle='rgba(255,255,255,.9)';x.fillRect(0,fb-1.5,W*0.36,1.5);
  x.fillStyle='#000';x.fillRect(0,fb,W,l.tabH);
  ['首页','朋友','','消息','我'].forEach(function(t,i){var c0=W*(i+0.5)/5,cy=fb+24.5;
    if(!t){rr(c0-21,cy-14,42,28,8);x.fillStyle='#fff';x.fill();x.strokeStyle='#000';x.lineWidth=2.4;x.beginPath();x.moveTo(c0-7,cy);x.lineTo(c0+7,cy);x.moveTo(c0,cy-7);x.lineTo(c0,cy+7);x.stroke();return;}
    tx(t,c0,cy,16,i===0?600:400,i===0?'#fff':'rgba(255,255,255,.62)','center');});
  if(P.bottom>20){x.fillStyle='#fff';rr(W/2-67,P.H-13,134,5,2.5);x.fill();}
}

var CSS='#evdPhone{position:fixed;inset:0;z-index:2147483000;background:rgba(18,24,24,.9);display:flex;gap:28px;align-items:center;justify-content:center;padding:20px;font:14px/1.5 -apple-system,"PingFang SC","Noto Sans SC",sans-serif;color:#1f2b2a}'
 +'#evdPhone[hidden]{display:none}#evdPhone .ph{position:relative;flex:none;background:#000;overflow:hidden;box-shadow:0 0 0 9px #111,0 0 0 11px #3a3a3a,0 18px 50px rgba(0,0,0,.45)}'
 +'#evdPhone .vid{position:absolute;background:#0b0d0d;overflow:hidden}#evdPhone .cw{position:absolute;overflow:hidden;background:#fff}'
 +'#evdPhone iframe{position:absolute;left:0;top:0;width:1600px;height:1200px;border:0;transform-origin:0 0;pointer-events:none;background:#fff}'
 +'#evdPhone canvas.ov{position:absolute;left:0;top:0;pointer-events:none}#evdPhone .wait{position:absolute;inset:0;display:grid;place-items:center;color:#9fb0ad;font-size:13px}'
 +'#evdPhone aside{width:330px;max-height:calc(100vh - 40px);overflow:auto;background:#fff;border-radius:12px;padding:14px 16px;box-shadow:0 10px 40px rgba(0,0,0,.3)}'
 +'#evdPhone h3{margin:0 0 4px;font-size:16px}#evdPhone .x{float:right;border:0;background:#eef1f0;border-radius:6px;padding:2px 9px;font-size:16px;cursor:pointer}'
 +'#evdPhone label{display:flex;align-items:center;gap:8px;margin:5px 0}#evdPhone label>span{flex:none;width:64px;color:#5f6f6c}#evdPhone label.c>span{width:auto;color:inherit}'
 +'#evdPhone select{flex:1;min-width:0;padding:3px 5px;border:1px solid #d5dcda;border-radius:6px;font:inherit;background:#fff}#evdPhone input[type=range]{flex:1;min-width:0}'
 +'#evdPhone .nav{display:flex;gap:6px;margin:8px 0}#evdPhone .nav button{flex:1;padding:5px 0;border:1px solid #d5dcda;border-radius:6px;background:#fff;cursor:pointer;font:inherit}'
 +'#evdPhone .kv{font-size:12.5px;color:#3b4a48;background:#f3f6f4;border-radius:8px;padding:6px 8px;margin:6px 0}#evdPhone .kv b{font-variant-numeric:tabular-nums}'
 +'#evdPhone .hd{font-weight:600;margin:10px 0 4px}#evdPhone ol{margin:0;padding:0;list-style:none;font-size:12.5px}#evdPhone li{display:flex;gap:6px;padding:3px 0;border-bottom:1px solid #edf0ef}'
 +'#evdPhone li b{flex:none;width:58px;font-variant-numeric:tabular-nums}#evdPhone li span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#3b4a48}'
 +'#evdPhone .bad{color:#c0392b}#evdPhone .mid{color:#b7791f}#evdPhone .fine{color:#2f8f5b}#evdPhone .ok{color:#1d7a46}#evdPhone .big{color:#2c6db5}'
 +'#evdPhone .note{font-size:12px;color:#6b7a77;margin:6px 0 0}#evdPhone .card{height:10px;background:#17603a;border-radius:3px;margin:4px 0}'
 +'#evdPhoneBtn.on{background:#163e50;color:#fff}';

function build(){
  var st=document.createElement('style');st.textContent=CSS;document.head.appendChild(st);
  box=document.createElement('div');box.id='evdPhone';box.hidden=true;box.setAttribute('data-ed-ui','');
  var opts=function(o){return Object.keys(o).map(function(k){return '<option value="'+k+'">'+(o[k].name||k)+'</option>';}).join('');};
  box.innerHTML='<div class="ph"><div class="vid"></div><div class="cw"><div class="wait">正在载入课件副本…</div></div><canvas class="ov"></canvas></div>'
   +'<aside><button class="x" title="关闭（Esc）">✕</button><h3>手机预览</h3>'
   +'<div class="nav"><button data-go="pp">上一页</button><button data-go="p">上一重点</button><button data-go="n">下一重点</button><button data-go="nn">下一页</button></div>'
   +'<label><span>机型</span><select data-k="phone">'+opts(PHONES)+'</select></label>'
   +'<label><span>成片画幅</span><select data-k="video"><option value="4:3">4:3 横屏，课件铺满</option><option value="16:9">16:9 横屏</option><option value="9:16">9:16 竖屏，课件在上</option><option value="3:4">3:4 竖屏</option></select></label>'
   +'<label><span>课件占宽</span><input data-k="fill" type="range" min="40" max="100"><b data-v="fill"></b></label>'
   +'<label><span>显示大小</span><select data-k="real"><option value="0">适应窗口</option><option value="1">实物大小（和手机一样大）</option></select></label>'
   +'<div data-cal hidden><label><span>校准</span><input data-k="ppmm" type="range" min="2.5" max="8" step="0.05"></label><div class="card" data-card></div><p class="note">拿一张银行卡贴在屏幕上，拖滑块让绿条和卡的短边一样长（54 mm），之后显示的手机就是真实大小。</p></div>'
   +'<label class="c"><input type="checkbox" data-k="mark"><span>标出小于 12pt 的字</span></label>'
   +'<label class="c"><input type="checkbox" data-k="ui"><span>抖音界面（示意）</span></label>'
   +'<label class="c"><input type="checkbox" data-k="pip"><span>主播画面占位</span></label>'
   +'<label class="c"><input type="checkbox" data-k="sub"><span>剪辑字幕</span></label>'
   +'<div class="kv" data-info></div><div class="hd">这一屏的字（按手机上从小到大）</div><ol data-list></ol>'
   +'<p class="note">分档：<span class="bad">&lt;10 太小</span> · <span class="mid">10–12 吃力</span> · <span class="fine">12–15 能读</span> · <span class="ok">15–20 舒服</span>。抖音界面按常见布局画，位置以真机为准。导出发手机看的真机尺寸图用 phone.cjs 或 phone-preview.html。</p></aside>';
  document.body.appendChild(box);
  box.querySelector('.x').onclick=close;
  box.addEventListener('click',function(e){if(e.target===box)close();});
  box.querySelectorAll('[data-go]').forEach(function(b){b.onclick=function(){var g=b.dataset.go;try{if(g==='n')step(1);else if(g==='p')step(-1);else if(g==='nn')turn(1);else turn(-1);}catch(err){}};});
  box.querySelectorAll('[data-k]').forEach(function(inp){
    var k=inp.dataset.k,ev=inp.type==='range'?'input':'change';
    inp.addEventListener(ev,function(){
      if(inp.type==='checkbox')S[k]=inp.checked;else if(k==='real')S.real=inp.value==='1';
      else if(inp.type==='range')S[k]=+inp.value;else S[k]=inp.value;
      if(k==='video'){var V=VIDEO[S.video];S.fill=V.fill;S.valign=V.valign;}
      keep();form();paint();if(k==='mark'||k==='phone'||k==='video'||k==='fill')sync(0);
    });
  });
  window.addEventListener('message',function(e){if(!frame||e.source!==frame.contentWindow)return;var m=e.data||{};
    if(m.type===MSG+'-ready'){ready=true;var w=box.querySelector('.wait');if(w)w.remove();sync(0);}
    else if(m.type===MSG+'-audit'){lastItems=m.items||[];list();}
    else if(m.type===MSG+'-error'){var i=box.querySelector('[data-info]');if(i)i.textContent='副本渲染出错：'+m.msg;}});
  window.addEventListener('resize',function(){if(isOpen)paint();});
  document.addEventListener('keydown',function(e){if(isOpen&&e.key==='Escape'){e.stopPropagation();close();}},true);
}
function form(){
  box.querySelector('[data-k=phone]').value=S.phone;box.querySelector('[data-k=video]').value=S.video;
  box.querySelector('[data-k=fill]').value=S.fill;box.querySelector('[data-v=fill]').textContent=S.fill+'%';
  box.querySelector('[data-k=real]').value=S.real?'1':'0';box.querySelector('[data-cal]').hidden=!S.real;box.querySelector('[data-k=ppmm]').value=S.ppmm;
  box.querySelector('[data-card]').style.width=(53.98*S.ppmm)+'px';
  ['mark','ui','pip','sub'].forEach(function(k){box.querySelector('[data-k='+k+']').checked=S[k];});
}
function paint(){
  L=layout();var P=L.P,aside=box.querySelector('aside'),availH=window.innerHeight-48,availW=window.innerWidth-aside.offsetWidth-90;
  var disp=S.real?S.ppmm*P.mmW/P.W:Math.min(availH/P.H,availW/P.W,1.6);
  var ph=box.querySelector('.ph');ph.style.width=P.W*disp+'px';ph.style.height=P.H*disp+'px';ph.style.borderRadius=44*disp+'px';
  var v=L.video,vd=box.querySelector('.vid');vd.style.cssText='left:'+v.x*disp+'px;top:'+v.y*disp+'px;width:'+v.w*disp+'px;height:'+v.h*disp+'px';
  var c=L.cw,cl={x:Math.max(c.x,v.x),y:Math.max(c.y,v.y)};cl.r=Math.min(c.x+c.w,v.x+v.w);cl.b=Math.min(c.y+c.h,v.y+v.h);
  var cwEl=box.querySelector('.cw');cwEl.style.cssText='left:'+cl.x*disp+'px;top:'+cl.y*disp+'px;width:'+(cl.r-cl.x)*disp+'px;height:'+(cl.b-cl.y)*disp+'px';
  if(frame){frame.style.transform='translate('+(c.x-cl.x)*disp+'px,'+(c.y-cl.y)*disp+'px) scale('+(c.w*disp/1600)+')';}
  var cv=box.querySelector('canvas.ov');cv.style.width=P.W*disp+'px';cv.style.height=P.H*disp+'px';drawOver(cv,L,disp);
  var mmPt=P.mmW/P.W;
  box.querySelector('[data-info]').innerHTML='1 课件 px ≈ <b>'+L.k.toFixed(3)+' pt</b>　60px＝<b>'+(60*L.k).toFixed(1)+'pt</b>　44px＝<b>'+(44*L.k).toFixed(1)+'pt</b><br>剪辑字幕约 <b>'+L.subPx.toFixed(1)+' pt</b>（字高 '+(L.subPx*mmPt).toFixed(1)+' mm）';
  list();
}
function list(){
  if(!box||!L)return;var ol=box.querySelector('[data-list]');
  var items=lastItems.slice().sort(function(a,b){return a.px-b.px;});
  var seen={},rows=[];items.forEach(function(it){var key=it.px+'|'+it.t;if(seen[key])return;seen[key]=1;rows.push(it);});
  ol.innerHTML=rows.slice(0,40).map(function(it){var pt=it.px*L.k,b=band(pt);
    return '<li><b class="'+b[0]+'">'+pt.toFixed(1)+'pt</b><span title="'+it.t.replace(/"/g,'&quot;')+'">'+it.px+'px · '+it.t.replace(/</g,'&lt;')+'</span></li>';}).join('')||'<li><span>（等副本渲染）</span></li>';
}
function sync(delay){
  clearTimeout(syncT);syncT=setTimeout(function(){
    if(!isOpen||!ready||!frame)return;var k=layout().k;
    try{frame.contentWindow.postMessage({type:MSG+'-state',data:JSON.stringify(DATA),page:page,focus:focus,detailStep:detailStep,showAll:showAll,mark:S.mark,k:k},'*');}catch(e){}
  },delay==null?120:delay);
}
function open(){
  if(!box)build();
  if(window.EditDesk&&EditDesk.isEditing&&EditDesk.isEditing()){try{EditDesk.saveNow();}catch(e){}}
  if(!frame){frame=document.createElement('iframe');frame.setAttribute('aria-hidden','true');frame.setAttribute('tabindex','-1');
    frame.src=location.href.split('#')[0]+'#'+MSG;box.querySelector('.cw').appendChild(frame);}
  box.hidden=false;isOpen=true;var b=document.getElementById('evdPhoneBtn');if(b)b.classList.add('on');
  form();paint();sync(0);
}
function close(){if(!box)return;box.hidden=true;isOpen=false;var b=document.getElementById('evdPhoneBtn');if(b)b.classList.remove('on');}

/* 讲解状态一变就同步副本；编辑模式改字后也同步 */
if(typeof render==='function'){var phoneRender=render;render=function(){var r=phoneRender.apply(this,arguments);if(isOpen)sync();return r;};}
document.addEventListener('input',function(){if(isOpen)sync(600);},true);
document.addEventListener('focusout',function(){if(isOpen)sync(200);},true);

/* 入口：工具栏「手机预览」，放在「拍摄模式」后面 */
(function addButton(){
  var st0=document.createElement('style');st0.textContent='@media (max-width:1400px){header.toolbar{gap:6px;padding-left:14px;padding-right:14px}header.toolbar button{padding-left:9px;padding-right:9px}}';document.head.appendChild(st0);
  var bar=document.querySelector('header.toolbar')||document.querySelector('.toolbar');if(!bar||document.getElementById('evdPhoneBtn'))return;
  var b=document.createElement('button');b.id='evdPhoneBtn';b.textContent='手机预览';b.title='看这一屏在抖音、手机上的大小，并做字号体检';
  b.onclick=function(){isOpen?close():open();};
  var cap=document.getElementById('capture');if(cap&&cap.parentNode===bar)cap.after(b);else bar.appendChild(b);
})();
window.EVDPhone={open:open,close:close,state:function(){return {S:S,ready:ready,isOpen:isOpen,items:lastItems,layout:layout()};}};
})();
/*EVD_PHONE_END*/
