/*EVD_PACKS_START*/
/* evd-packs 0.3.8 · 主题包＋挑风格
   主题包只换「皮」：配色、底纹、卡片底色/圆角/阴影/色条颜色、章节导航样式、顶部色条。凡是会改卡片尺寸和断行的
   （字号、字重、边框宽度、内边距）一律不碰，所以换主题包不破坏「讲解中排版稳定」，也不影响手机字号体检。
   讲到时的高亮底色（.focus）不覆盖，逐条讲解的提示照常。DATA.pack 记当前主题包，DATA.packPick 记推荐的三套，
   DATA.baseTheme / baseBg 记“经典学院”要回到的原配色和底纹。
   挑风格：弹层里嵌三份只读副本（复用 phone.js 的 #evd-phone 副本模式），同一页同一讲解状态并排显示三套，点「用这套」生效、可撤销。
   依赖骨架全局：DATA render applyStyle wbChange wbValidate wbRenderPalette step turn page focus detailStep showAll EditDesk。 */
(function(){
'use strict';
var PACKS={
  classic:{name:'经典学院',mood:'稳妥',desc:'浅底或暖纸、卡片左侧色条、胶囊导航。课件原来的样子。',suits:'院校盘点、分档讲解，什么题材都压得住',theme:null,bg:null},
  clean:{name:'白卡投影',mood:'清爽',desc:'浅灰底、纯白圆角卡片带柔和投影，导航改成下划线。',suits:'就业、薪酬、职业这类偏商务的话题',theme:'navy',bg:{kind:'none',a:1}},
  swiss:{name:'瑞士网格',mood:'理性',desc:'直角、无投影、黑色结构线加一个蓝色强调，网格底。',suits:'排名、数据、规则和政策讲解',theme:'ibmBlue',bg:{kind:'grid',a:1.2}},
  stage:{name:'深色舞台',mood:'醒目',dark:true,desc:'深色底、卡片微微发光，讲到的卡片描亮边。',suits:'开场、结尾、悬念和“爆点”页；暗光拍摄',theme:'dark',bg:{kind:'dots',a:0.6}},
  editorial:{name:'杂志暖纸',mood:'人文',desc:'纸纹底、卡片去掉底色，用上下细线分隔，像杂志排版。',suits:'专业介绍、学科故事、人物和城市',theme:'warm',bg:{kind:'paper',a:1}},
  photo:{name:'照片衬底',mood:'有现场感',desc:'半透明毛玻璃卡片，适合铺一张学校实景照片做底图。',suits:'有校园照片时（通用那种），先在底图里上传照片',theme:null,bg:null}
};
var ORDER=['classic','clean','swiss','stage','editorial','photo'];
var DEFAULT_PICK=['classic','swiss','stage'];
var B='body[data-pack=';
var CSS=''
 /* 所有主题包共用：原来写死的深色页码、白色步骤序号，换成跟随配色（深色配色下才看得见） */
 +'body[data-pack] .foot{color:color-mix(in srgb,var(--ink) 85%,transparent)}'
 +'body[data-pack] .content.content[data-page-id].layout-steps .group::before{color:var(--card)}'
 /* 白卡投影 */
 +B+'clean] .content .group:not(.focus){background:#fff}'
 +B+'clean] .content.content[data-page-id] .group{border-radius:16px;box-shadow:0 10px 28px color-mix(in srgb,var(--ink) 9%,transparent),0 1px 3px color-mix(in srgb,var(--ink) 8%,transparent)}'
 +B+'clean] .tier-nav button{background:transparent;border-radius:0;color:var(--muted);box-shadow:inset 0 -2px 0 color-mix(in srgb,var(--ink) 10%,transparent)}'
 +B+'clean] .tier-nav button.active{background:transparent;color:var(--accent);box-shadow:inset 0 -5px 0 var(--accent)}'
 +B+'clean] .canvas::before{background:transparent}'
 /* 瑞士网格 */
 +B+'swiss] .content .group:not(.focus){background:#fff}'
 +B+'swiss] .content.content[data-page-id] .group{border-radius:0;box-shadow:none;border-left-color:var(--ink);border-top-color:var(--ink)}'
 +B+'swiss] .content.content[data-page-id] .group.focus{border-left-color:var(--accent);border-top-color:var(--accent)}'
 +B+'swiss] .tier-nav button{border-radius:0;background:#fff;color:var(--ink);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--ink) 18%,transparent)}'
 +B+'swiss] .tier-nav button.active{background:var(--ink);color:#fff;box-shadow:none}'
 +B+'swiss] .canvas::before{height:14px;background:var(--ink)}'
 /* 深色舞台 */
 +B+'stage] .canvas{box-shadow:inset 0 0 280px rgba(0,0,0,.45)}'
 +B+'stage] .content .group:not(.focus){background:color-mix(in srgb,var(--card) 90%,#fff 6%)}'
 +B+'stage] .content.content[data-page-id] .group{border-radius:12px;box-shadow:0 0 0 1px color-mix(in srgb,var(--accent) 22%,transparent),0 14px 34px rgba(0,0,0,.35)}'
 +B+'stage] .content.content[data-page-id] .group.focus{box-shadow:0 0 0 3px var(--accent),0 14px 40px rgba(0,0,0,.45)}'
 +B+'stage] .tier-nav button{background:transparent;color:var(--muted);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 30%,transparent)}'
 +B+'stage] .tier-nav button.active{background:var(--accent);color:var(--paper)}'
 +B+'stage] .canvas::before{background:linear-gradient(90deg,var(--accent),transparent)}'
 +B+'stage]:not(.ed-editing) .content.content[data-page-id].layout-master .group.focus .body{background:var(--card);box-shadow:0 0 0 1px color-mix(in srgb,var(--accent) 30%,transparent),0 14px 34px rgba(0,0,0,.35)}'
 /* 杂志暖纸 */
 +B+'editorial] .content .group:not(.focus){background:transparent}'
 +B+'editorial] .content.content[data-page-id] .group{border-radius:0;border-left-color:transparent;border-top-color:transparent;box-shadow:inset 0 3px 0 var(--ink),inset 0 -1px 0 color-mix(in srgb,var(--ink) 22%,transparent)}'
 +B+'editorial] .content.content[data-page-id] .group.focus{box-shadow:inset 0 3px 0 var(--accent),inset 0 -1px 0 color-mix(in srgb,var(--ink) 22%,transparent)}'
 +B+'editorial] .tier-nav button{background:transparent;border-radius:0;color:var(--muted);box-shadow:inset 0 -1px 0 color-mix(in srgb,var(--ink) 25%,transparent)}'
 +B+'editorial] .tier-nav button.active{background:transparent;color:var(--ink);box-shadow:inset 0 -4px 0 var(--accent)}'
 +B+'editorial] .canvas::before{height:8px;background:linear-gradient(var(--ink) 0 3px,transparent 3px 5px,var(--ink) 5px 6px)}'
 /* 照片衬底 */
 +B+'photo] .content .group:not(.focus){background:color-mix(in srgb,var(--card) 80%,transparent)}'
 /* 毛玻璃会让卡片成为绝对定位子元素的参照（同踩坑第 4 条）：master 的详情面板挂在卡片里，所以 master 不加 */
 +B+'photo] .content:not(.layout-master) .group{-webkit-backdrop-filter:blur(10px) saturate(1.15);backdrop-filter:blur(10px) saturate(1.15)}'
 +B+'photo] .content.content[data-page-id] .group{border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.12)}'
 +B+'photo] .tier-nav button{background:color-mix(in srgb,var(--card) 70%,transparent);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}'
 /* 编辑台面板里的主题包列表 */
 +'#pkBox{margin:4px 0 10px}#pkList{display:grid;grid-template-columns:1fr 1fr;gap:7px}#pkList button{text-align:left;min-height:42px;line-height:1.25}'
 +'#pkList button small{display:block;color:#6b7a77;font-size:11.5px}#pkList button.selected{outline:2px solid #527383}#pkPick{width:100%;margin-top:8px}'
 /* 挑风格弹层 */
 +'#evdPick{position:fixed;inset:0;z-index:2147482999;background:rgba(18,24,24,.96);display:flex;flex-direction:column;gap:12px;padding:16px 20px;font:14px/1.5 -apple-system,"PingFang SC","Noto Sans SC",sans-serif;color:#1f2b2a}'
 +'#evdPick[hidden]{display:none}#evdPick .top{display:flex;gap:8px;align-items:center;color:#e8eeec}#evdPick .top h3{margin:0 10px 0 0;font-size:18px;color:#fff}'
 +'#evdPick .top button,#evdPick .top select{font:inherit;padding:5px 10px;border-radius:6px;border:1px solid #5d6e6b;background:#24302e;color:#e8eeec;cursor:pointer}#evdPick .top .sp{flex:1}'
 +'#evdPick .row{flex:1;display:flex;gap:16px;align-items:flex-start;justify-content:center;min-height:0;overflow:auto}'
 +'#evdPick .cand{background:#fff;border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:6px;box-shadow:0 10px 30px rgba(0,0,0,.35)}#evdPick .cand.cur{outline:3px solid #5fc28a}'
 +'#evdPick .view{position:relative;overflow:hidden;background:#f2f4f3;border-radius:6px}#evdPick .view iframe{position:absolute;left:0;top:0;width:1600px;height:1200px;border:0;transform-origin:0 0;pointer-events:none}'
 +'#evdPick .view .wait{position:absolute;inset:0;display:grid;place-items:center;color:#7d8c88;font-size:13px}'
 +'#evdPick .nm{display:flex;align-items:baseline;gap:8px}#evdPick .nm b{font-size:17px}#evdPick .nm i{font-style:normal;font-size:12px;color:#17603a;background:#e3f1e8;border-radius:10px;padding:0 8px}'
 +'#evdPick .ds{font-size:12.5px;color:#4b5a57;margin:0}#evdPick .use{margin-top:2px;padding:7px 0;border:0;border-radius:8px;background:#17603a;color:#fff;font:600 14px/1 inherit;cursor:pointer}#evdPick .cand.cur .use{background:#9fb0ad}'
 +'#evdPick .tip{color:#b7c4c1;font-size:12px;text-align:center}#evdPick .kp{display:flex;gap:6px;align-items:center;font-size:13px;color:#d6e0dd;margin-right:6px}';

function cur(){return PACKS[DATA.pack]?DATA.pack:'classic';}
var lastTheme=null;
function mark(){document.body.dataset.pack=cur();if(DATA.theme!==lastTheme){lastTheme=DATA.theme;if(typeof applyStyle==='function'){try{applyStyle();}catch(e){}}}}
var st=document.createElement('style');st.id='evd-packs';st.textContent=CSS;document.head.appendChild(st);
mark();
if(typeof render==='function'){var packRender=render;render=function(){var r=packRender.apply(this,arguments);mark();return r;};}
if(typeof wbValidate==='function'){var packValidate=wbValidate;wbValidate=function(input){var out=packValidate(input),src=input&&input.kind==='evd-deck'?input.data:input;
  if(src&&PACKS[src.pack])out.pack=src.pack;
  if(src&&Array.isArray(src.packPick))out.packPick=src.packPick.filter(function(k){return PACKS[k];}).slice(0,3);
  if(src&&typeof src.baseTheme==='string')out.baseTheme=src.baseTheme;
  if(src&&src.baseBg&&typeof src.baseBg==='object')out.baseBg={kind:String(src.baseBg.kind||'grid'),a:+src.baseBg.a||1};
  return out;};}
if(location.hash==='#evd-phone')return; /* 副本只负责按 DATA.pack 显示，不要面板和弹层 */

/* 给某套主题包算出要写进 DATA 的字段（预览和生效用同一套算法） */
function patchFor(id,d,keep){
  var P=PACKS[id],o={pack:id},isBase=!PACKS[d.pack]||d.pack==='classic';
  var baseTheme=d.baseTheme||(isBase?d.theme:null)||'ibmBlue';
  var baseBg=d.baseBg||(isBase?{kind:(d.bg&&d.bg.kind)||'grid',a:(d.bg&&d.bg.a)!=null?d.bg.a:1}:{kind:'grid',a:1});
  o.baseTheme=baseTheme;o.baseBg=baseBg;
  /* 没指定配色/底纹的主题包（经典学院、照片衬底）回到课件原来的配色和底纹 */
  /* keep＝保留课件原配色（学校主色），只换版面风格；深色舞台必须配深色，不受影响 */
  o.theme=(keep&&!P.dark)?baseTheme:(P.theme||baseTheme);o.bgKind=P.bg?P.bg.kind:baseBg.kind;o.bgA=P.bg?P.bg.a:baseBg.a;
  return o;
}
function patchInto(d,o){d.pack=o.pack;d.baseTheme=o.baseTheme;d.baseBg=o.baseBg;if(o.theme)d.theme=o.theme;
  if(o.bgKind){d.bg=Object.assign({},d.bg||{},{kind:o.bgKind,a:o.bgA});}}
function apply(id,keep){
  if(!PACKS[id])return;if(keep===undefined)keep=keepTheme;var o=patchFor(id,DATA,keep);
  var go=function(){patchInto(DATA,o);};
  if(typeof wbChange==='function')wbChange(go);else{go();render();}
  try{applyStyle();}catch(e){}try{wbRenderPalette();}catch(e){}
  panelSync();
  if(window.EditDesk&&EditDesk.toast)EditDesk.toast('已换成「'+PACKS[id].name+'」，可撤销；导出 HTML 才会带走');
}

/* ---------- 编辑台「页面」分区里的主题包列表 ---------- */
function panelSync(){var l=document.getElementById('pkList');if(!l)return;l.querySelectorAll('button').forEach(function(b){b.classList.toggle('selected',b.dataset.pk===cur());});}
(function panel(){
  var pal=document.getElementById('wbPalettes');if(!pal||document.getElementById('pkBox'))return;
  var anchor=pal.previousElementSibling&&pal.previousElementSibling.tagName==='B'?pal.previousElementSibling:pal;
  var box=document.createElement('div');box.id='pkBox';
  box.innerHTML='<b>主题包</b><div id="pkList"></div><button id="pkPick" type="button">挑风格：三套并排对比</button><small>主题包只换颜色、底纹、卡片和导航的样子，不改字号和排版。</small>';
  anchor.before(box);
  var l=box.querySelector('#pkList');
  ORDER.forEach(function(id){var b=document.createElement('button');b.type='button';b.dataset.pk=id;b.innerHTML=PACKS[id].name+'<small>'+PACKS[id].mood+'</small>';b.title=PACKS[id].desc+'\n适合：'+PACKS[id].suits;b.onclick=function(){apply(id);};l.appendChild(b);});
  box.querySelector('#pkPick').onclick=function(){openPick();};
  panelSync();
})();

/* ---------- 挑风格弹层 ---------- */
var pk=null,frames=[],showing=[],batch=0,phoneSize=false,syncT=0,keepTheme=false;
try{keepTheme=localStorage.getItem('evd-pick-keep')==='1';}catch(e){}
function pickList(){var p=(DATA.packPick||[]).filter(function(k){return PACKS[k];});if(p.length)return p;
  /* 没指定推荐时：课件已上传实景照片做底图，就把照片衬底放进来 */
  return DATA.bg&&DATA.bg.img?['classic','photo','clean']:DEFAULT_PICK.slice();}
function buildPick(){
  pk=document.createElement('div');pk.id='evdPick';pk.hidden=true;pk.setAttribute('data-ed-ui','');
  pk.innerHTML='<div class="top"><h3>挑风格</h3><button data-go="pp">上一页</button><button data-go="p">上一重点</button><button data-go="n">下一重点</button><button data-go="nn">下一页</button>'
   +'<span class="sp"></span><label class="kp"><input type="checkbox" data-act="keep"> 保留课件原配色（学校主色），只换版面风格</label><button data-act="size">按手机大小看</button><button data-act="more">换一批</button><button data-act="close">关闭（Esc）</button></div>'
   +'<div class="row"></div><div class="tip">同一页、同一讲解状态，三套并排。点「用这套」立刻换上，可撤销；满意后记得导出 HTML。</div>';
  document.body.appendChild(pk);
  pk.querySelectorAll('[data-go]').forEach(function(b){b.onclick=function(){var g=b.dataset.go;try{if(g==='n')step(1);else if(g==='p')step(-1);else if(g==='nn')turn(1);else turn(-1);}catch(e){}};});
  pk.querySelector('[data-act=close]').onclick=closePick;
  pk.querySelector('[data-act=more]').onclick=function(){batch++;fill();};
  var kp=pk.querySelector('[data-act=keep]');kp.checked=keepTheme;kp.onchange=function(){keepTheme=kp.checked;try{localStorage.setItem('evd-pick-keep',keepTheme?'1':'0');}catch(e){}frames.forEach(function(f,i){send(i);});};
  pk.querySelector('[data-act=size]').onclick=function(){phoneSize=!phoneSize;this.textContent=phoneSize?'按大图看':'按手机大小看';sizeAll();};
  document.addEventListener('keydown',function(e){if(!pk.hidden&&e.key==='Escape'){e.stopPropagation();closePick();}},true);
  window.addEventListener('resize',function(){if(!pk.hidden)sizeAll();});
  window.addEventListener('message',function(e){var i=frames.findIndex(function(f){return f.el.contentWindow===e.source;});if(i<0)return;var m=e.data||{};
    if(m.type==='evd-phone-ready'){frames[i].ready=true;var w=frames[i].box.querySelector('.wait');if(w)w.remove();send(i);}});
}
function candidates(){var base=pickList();if(!batch)return base;var rest=ORDER.filter(function(k){return base.indexOf(k)<0;});
  var all=base.concat(rest),start=(batch*3)%all.length,out=[];for(var i=0;i<3;i++)out.push(all[(start+i)%all.length]);return out;}
function fill(){
  showing=candidates();var row=pk.querySelector('.row');
  if(!frames.length){for(var i=0;i<3;i++){var c=document.createElement('div');c.className='cand';
    c.innerHTML='<div class="view"><div class="wait">正在载入课件副本…</div></div><div class="nm"><b></b><i></i></div><p class="ds"></p><p class="ds su"></p><button class="use" type="button">用这套</button>';
    var f=document.createElement('iframe');f.setAttribute('tabindex','-1');f.setAttribute('aria-hidden','true');f.src=location.href.split('#')[0]+'#evd-phone';c.querySelector('.view').appendChild(f);
    row.appendChild(c);frames.push({el:f,box:c,ready:false});
    (function(k){c.querySelector('.use').onclick=function(){apply(showing[k],keepTheme);label();};})(i);}}
  label();sizeAll();frames.forEach(function(f,i){send(i);});
}
function label(){frames.forEach(function(f,i){var id=showing[i],P=PACKS[id];f.box.classList.toggle('cur',id===cur());
  f.box.querySelector('.nm b').textContent=P.name;f.box.querySelector('.nm i').textContent=P.mood;
  f.box.querySelector('.ds').textContent=P.desc;f.box.querySelector('.su').textContent='适合：'+P.suits;
  f.box.querySelector('.use').textContent=id===cur()?'当前在用':'用这套';});}
function sizeAll(){
  var n=frames.length||3,w;
  if(phoneSize){var pr={};try{pr=JSON.parse(localStorage.getItem('evd-phone-prefs')||'{}');}catch(e){}w=(pr.ppmm||5)*65.1;}
  else w=Math.min((window.innerWidth-40-16*(n-1))/n-20,(window.innerHeight-260)*4/3);
  w=Math.max(220,Math.floor(w));
  frames.forEach(function(f){var v=f.box.querySelector('.view');v.style.width=w+'px';v.style.height=Math.round(w*0.75)+'px';f.el.style.transform='scale('+(w/1600)+')';f.box.style.width=(w+20)+'px';});
}
function send(i){var f=frames[i];if(!f||!f.ready)return;var d=JSON.parse(JSON.stringify(DATA));patchInto(d,patchFor(showing[i],DATA,keepTheme));
  try{f.el.contentWindow.postMessage({type:'evd-phone-state',data:JSON.stringify(d),page:page,focus:focus,detailStep:detailStep,showAll:showAll,mark:false,k:0.25},'*');}catch(e){}}
function sendAll(){clearTimeout(syncT);syncT=setTimeout(function(){frames.forEach(function(f,i){send(i);});},120);}
function openPick(){
  if(!pk)buildPick();
  if(window.EditDesk&&EditDesk.isEditing&&EditDesk.isEditing()){try{EditDesk.saveNow();}catch(e){}}
  batch=0;pk.hidden=false;fill();
}
function closePick(){if(pk)pk.hidden=true;}
if(typeof render==='function'){var pickRender=render;render=function(){var r=pickRender.apply(this,arguments);if(pk&&!pk.hidden){label();sendAll();}return r;};}
window.EVDPacks={PACKS:PACKS,ORDER:ORDER,apply:apply,current:cur,openPick:openPick,closePick:closePick,patchFor:patchFor,
  state:function(){return {showing:showing.slice(),ready:frames.map(function(f){return f.ready;}),open:!!(pk&&!pk.hidden)};}};
})();
/*EVD_PACKS_END*/
