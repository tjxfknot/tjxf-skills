/* editable-video-deck 0.4.2 · 单页多版式引擎 JS（源自原版课件引擎，去掉页码/文字特例）
   注入位置：骨架最后一个 script 结束标签之前；build_deck.py 会在它前面写 const DECK_CFG={...}。
   render 包装顺序：v5Pre（版式前置样式）→ 骨架 render 链 → v5Post（人物框收窄记录、master 连线）→ 章节导航 → 拖动手柄 → 底图 → 批注。 */
const DECK=typeof DECK_CFG==='object'&&DECK_CFG?DECK_CFG:{};
const LAYOUTS=['tree','steps','flow','fork','rows','proj','college','grid2','sum','master','bh','htree','chips','podium'];

/* 章节导航：DATA.nav=[{name,start:页id}]，按页 id 定位，增删页面后仍对得上；没有 nav 就不显示 */
function pagedNav(){const secs=(DATA.nav||[]).map(s=>({name:s.name,at:DATA.pages.findIndex(p=>p.id===s.start)})).filter(s=>s.at>=0).sort((a,b)=>a.at-b.at);
 let n=document.querySelector('.tier-nav');if(!secs.length){if(n)n.remove();return;}
 if(!n){n=document.createElement('nav');n.className='tier-nav';n.setAttribute('aria-label',DECK.navLabel||'章节');document.querySelector('.canvas').append(n);}n.replaceChildren();
 secs.forEach((s,i)=>{const end=i+1<secs.length?secs[i+1].at:DATA.pages.length;const b=document.createElement('button');b.textContent=s.name;b.className=page>=s.at&&page<end?'active':'';b.onclick=()=>{if(EditDesk.isEditing())wbFlush();stop();page=s.at;focus=-1;detailStep=0;showAll=false;render();};n.append(b);});}

/* 正文显示：按行拆分，键值对标出，词组边界可断行，【待核】醒目标出。只改显示，不改保存的文字 */
const V5SEP=/([、／，；：＋。）｜ ])(?![、，；：。）])/g;
bodyView=function(text,path){
 const gp=/^pages\/(\d+)\/groups\/(\d+)\//.exec(path||'');const lab=gp&&DATA.pages[+gp[1]].layout==='college'?EditDesk.plain(DATA.pages[+gp[1]].groups[+gp[2]].label||''):'';
 if(lab){if(String(text).trim()===lab)text='';else if(String(text).startsWith(lab+'；'))text=String(text).slice(lab.length+1);}
 if(/<(?:span|b|strong|em|i)\b/i.test(text))return '<div class="detail-lines">'+EditDesk.clean(text).replace(/\n/g,'<br>')+'</div>';
 const wb=t=>EditDesk.clean(String(t)).replace(V5SEP,'$1<wbr>').replace(/＋/g,'\u2060＋').replace(/（/g,'\u2060（').replace(/【待核】([^<]*(?:<wbr>[^<]*)*)/g,'<mark class="todo">待核｜$1</mark>');
 const pg=gp&&DATA.pages[+gp[1]];const chipsOf=t=>v5Chips(t).map(x=>'<span class="chip">'+wb(x)+'</span>').join('');
 if(pg&&(pg.layout==='chips'||(pg.opts&&pg.opts.chips))){
  /* 0.4.2：有一行是“键：标签、标签”（键 1–14 字），就一行一组：键加粗在前、后面是标签；否则照旧（有换行一行一个标签） */
  const L=String(text||'').split('\n').map(t=>t.trim()).filter(Boolean),key=l=>{const i=l.indexOf('：');return i>0&&i<=14?i:-1;};
  if(L.some(l=>key(l)>0))return '<div class="chip-rows">'+L.map(l=>{const i=key(l);return '<div class="chip-list">'+(i>0?'<b class="chip-key">'+wb(l.slice(0,i))+'</b>'+chipsOf(l.slice(i+1)):chipsOf(l))+'</div>';}).join('')+'</div>';
  return '<div class="chip-list">'+chipsOf(text)+'</div>';}
 /* 卡片 chips:true（0.4.1）：只把第一行拆成标签（专业名单），后面各行照常显示——“标签行＋说明行” */
 let lines=String(text||'').split(/\n/).filter(Boolean),head='';const grp=pg&&pg.groups[+gp[2]];if(grp&&grp.chips===true&&lines.length){head='<div class="chip-list">'+v5Chips(lines[0]).map(t=>'<span class="chip">'+wb(t)+'</span>').join('')+'</div>';lines=lines.slice(1);}
 return head+'<div class="detail-lines">'+lines.map(line=>{const at=line.indexOf('：');
  if(DATA.pages[page].layout==='bit-majors'||at<=0||at>=8)return '<div class="detail-row">'+wb(line)+'</div>';
  return '<div class="detail-row"><strong class="detail-key">'+wb(line.slice(0,at))+'</strong><span>'+wb(line.slice(at+1))+'</span></div>';}).join('')+'</div>';
};
/* 标签块（0.4.0）：有换行按行拆；否则按顿号拆，括号里的顿号不拆（“政治学、哲学与经济学（PPE）”这种整项要写成一行一项） */
function v5Chips(text){const s=String(text||'');if(s.includes('\n'))return s.split('\n').map(t=>t.trim()).filter(Boolean);const out=[];let d=0,cur='';for(const ch of s){if(ch==='（'||ch==='(')d++;if(ch==='）'||ch===')')d=Math.max(0,d-1);if(ch==='、'&&!d){out.push(cur);cur='';}else cur+=ch;}out.push(cur);return out.map(t=>t.trim()).filter(Boolean);}
/* 标题/标签：生成时就在词组边界放 <wbr>（让页面动画一开始量到的就是最终排版）；进入编辑前移除，不写进数据 */
const v5Field=field;field=function(tag,cl,path,text){const h=v5Field(tag,cl,path,text);if(cl==='body'||EditDesk.isEditing())return h;
 return h.replace(/>([^<]+)</g,(m,t)=>'>'+t.replace(/＋/g,'⁠＋').replace(/（/g,'⁠（').replace(/([、／，；：＋。）｜ ])(?![、，；：。）])/g,'$1<wbr>')+'<');};
function v5Unwbr(){document.querySelectorAll('.content wbr').forEach(x=>{if(!x.closest('.body-display'))x.remove();});document.querySelectorAll('.content [data-e]').forEach(e=>{const w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);while(w.nextNode())if(w.currentNode.nodeValue.includes('⁠'))w.currentNode.nodeValue=w.currentNode.nodeValue.replace(/⁠/g,'');e.normalize();});}
const v5SetEditing=EditDesk.setEditing;EditDesk.setEditing=function(v){if(v)v5Unwbr();const r=v5SetEditing.apply(this,arguments);if(v)setTimeout(()=>window.v5AddHandles&&window.v5AddHandles());return r;};
const v5Export=EditDesk.exportHTML;EditDesk.exportHTML=function(){v5Unwbr();return v5Export.apply(this,arguments);};

/* 卡片格子位置、同列重复标签、人物框收窄：都在生成卡片之前写成样式，页面动画不会先按错误位置飞一圈 */
const v5Style=document.createElement('style');v5Style.id='v5-pre';document.head.append(v5Style);
const v5Avoid={}; /* bh：讲解顺序＝画面顺序（先左列从上到下，再右列）；打开时、拖动换位后、导入后都按格子重排 */ function v5ColOrder(p){if(!p||p.layout!=='bh'||!p.groups.length||!p.groups.every(g=>g.cell))return false;const k=g=>g.cell.c*1000+g.cell.r,s=[...p.groups].sort((a,b)=>k(a)-k(b));if(s.every((g,i)=>g===p.groups[i]))return false;const av=(v5Avoid[p.id]||[]).map(i=>p.groups[i]);p.groups.splice(0,p.groups.length,...s);if(v5Avoid[p.id])v5Avoid[p.id]=av.map(g=>p.groups.indexOf(g)).filter(i=>i>=0);return true;} DATA.pages.forEach(v5ColOrder); function v5Pre(){const p=DATA.pages[page];if(!p){v5Style.textContent='';return;}v5ColOrder(p);const sel=i=>'.content[data-page-id="'+p.id+'"] .groups > .group[data-group="'+i+'"]';let css='';
 p.groups.forEach((g,i)=>{if(g.cell)css+=sel(i)+'{grid-column:'+g.cell.c+';grid-row:'+g.cell.r+'}';});
 if(p.layout==='bh'||p.layout==='chips'){const byCol={};p.groups.forEach((g,i)=>{if(g.cell)(byCol[g.cell.c] ||= []).push([g.cell.r,i]);});
  Object.values(byCol).forEach(list=>{list.sort((a,b)=>a[0]-b[0]);for(let k=1;k<list.length;k++){const a=p.groups[list[k-1][1]],b=p.groups[list[k][1]];
   if(b.label&&b.label===a.label)css+='body:not(.ed-editing) '+sel(list[k][1])+' .label{display:none}';if(b.body&&b.body===a.body)css+='body:not(.ed-editing) '+sel(list[k][1])+' .body{display:none}';}});}
 (v5Avoid[p.id]||[]).forEach(i=>css+=sel(i)+'{max-width:calc(1072px - var(--indent,0px))}');
 css+=v5OptsCSS(p);
 v5Style.textContent=css;}
/* 页面特例由 DATA.pages[i].opts 生成（v5 里是写死页码的 CSS）：
   labelw 类别标签栏宽(px)；root tree 版式第一张卡做母卡；cols/maxWidth/compact 用于 bh 两列卡片 */
function v5OptsCSS(p){const o=p.opts||{},Q='.content.content[data-page-id]',pid='[data-page-id="'+p.id+'"]';let c='';
 if(o.labelw)c+='.content'+pid+'{--labelw:'+o.labelw+'px}';
 if(o.root&&p.layout==='tree'){const R=Q+pid+' .group:first-child';
  c+=R+'{margin-left:-60px;display:flex;align-items:baseline;gap:28px;background:color-mix(in srgb,var(--accent) 10%,var(--card))}'+R+' .group-copy{display:flex;align-items:baseline;gap:28px}'+R+' .gtitle{margin:0}'+R+'::before,'+R+'::after{display:none}';}
 if(p.layout==='bh'&&(o.cols||o.maxWidth))c+='.content.layout-bh'+pid+' .groups{grid-template-columns:repeat('+(o.cols||2)+',minmax(0,1fr))'+(o.maxWidth?';max-width:'+o.maxWidth+'px':'')+'}';
 if(p.layout==='bh'&&o.compact){const B=Q+'.layout-bh'+pid;c+=B+' .group{--pad:12px 18px}'+B+' .group .gtitle,'+B+' .group.focus .gtitle,'+B+' .group.done .gtitle{margin-bottom:2px}'+B+' .label{margin-bottom:2px}';}
 if(p.layout==='htree'){c+=Q+'.layout-htree'+pid+' .groups > .group:first-child{grid-row:1 / span '+Math.max(1,p.groups.length-1)+'}';if(o.rootw)c+='.content'+pid+'{--rootw:'+o.rootw+'px}';}
 if(p.layout==='chips'&&(o.cols||o.maxWidth))c+=Q+'.layout-chips'+pid+' .groups{grid-template-columns:repeat('+(o.cols||1)+',minmax(0,1fr))'+(o.maxWidth?';max-width:'+o.maxWidth+'px':'')+'}';
 if(p.layout==='podium'){if(o.podw)c+='.content'+pid+'{--podw:'+o.podw+'px}';if(o.podh)c+='.content'+pid+'{--podh:'+o.podh+'px}';}
 return c;}
function v5Post(){const p=DATA.pages[page];v5Avoid[p.id]=[...document.querySelectorAll('.content .groups > .group.portrait-avoid')].map(e=>+e.dataset.group);v5Link();}
/* htree 是两列，骨架的人物框收窄（portraitLayout）只管单列：包一层，分支卡底边过 y780 也标 portrait-avoid（宽度扣掉根节点列，见 engine.css 的 --indent）。
   和单列同一时机：每次重排先清后量，状态之间一致 */
if(typeof portraitLayout==='function'){const v5PortraitBase=portraitLayout;portraitLayout=function(){v5PortraitBase();const p=DATA.pages[page];if(!p||p.layout!=='htree')return;const cv=document.querySelector('.canvas').getBoundingClientRect(),k=cv.width/1600;document.querySelectorAll('.content .groups > .group:not(:first-child)').forEach(el=>{if((el.getBoundingClientRect().bottom-cv.top)/k>780)el.classList.add('portrait-avoid');});};}
/* master：正在讲的对象与右侧详情之间连一根线，线和详情都跟着这张卡一起出现 */
function v5Link(){document.querySelectorAll('.content .v5-link').forEach(x=>x.remove());const p=DATA.pages[page];if(p.layout!=='master'||EditDesk.isEditing())return;
 const g=document.querySelector('.content .groups > .group.focus'),b=g&&g.querySelector('.body');if(!b||!b.offsetParent)return;
 const x1=g.offsetLeft+g.offsetWidth,y1=g.offsetTop+g.offsetHeight/2,x2=b.offsetLeft,top=b.offsetTop,bot=b.offsetTop+b.offsetHeight,y2=Math.max(top+36,Math.min(bot-36,y1)),mx=(x1+x2)/2;
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('class','v5-link');svg.setAttribute('width',x2+8);svg.setAttribute('height',Math.max(y1,bot)+8);
 const path=document.createElementNS(ns,'path');path.setAttribute('d','M'+x1+' '+y1+' H'+mx+' V'+y2+' H'+x2);svg.append(path);
 const dot=document.createElementNS(ns,'circle');dot.setAttribute('cx',x1);dot.setAttribute('cy',y1);dot.setAttribute('r',7);svg.append(dot);g.append(svg);}
/* master 版式卡片不做位移动画（位移动画期间卡片会变成详情面板的定位参照，面板被挤窄），只淡入 */
const v5Anim=animate;animate=function(el,frames,opt){if(DATA.pages[page]&&DATA.pages[page].layout==='master'&&el&&el.classList&&el.classList.contains('group'))frames=frames.map(f=>{const c={...f};delete c.transform;return c;});return v5Anim(el,frames,opt);};
const pagedRenderBase=render;render=function(){v5Pre();pagedRenderBase();v5Post();pagedNav();};

/* 编辑模式：拖动卡片换位。换画面位置（cell），讲解顺序随之按画面重排（先左列从上到下，再右列）；可撤销 */
(function(){
 function snapshot(p){const els=[...document.querySelectorAll('.content .groups > .group')];const xs=[...new Set(els.map(e=>Math.round(e.offsetLeft/8)))].sort((a,b)=>a-b);const rows={};
  els.forEach((e,i)=>{if(p.groups[i].cell)return;const c=xs.indexOf(Math.round(e.offsetLeft/8))+1;rows[c]=(rows[c]||0)+1;});
  const used={};p.groups.forEach(g=>{if(g.cell)used[g.cell.c]=Math.max(used[g.cell.c]||0,g.cell.r);});
  els.forEach((e,i)=>{const g=p.groups[i];if(g.cell)return;const c=xs.indexOf(Math.round(e.offsetLeft/8))+1;used[c]=(used[c]||0)+1;g.cell={c,r:used[c]};});}
 let drag=null;const ghost=document.createElement('div');ghost.id='cellGhost';ghost.hidden=true;document.body.append(ghost);
 function addHandles(){if(!EditDesk.isEditing())return;document.querySelectorAll('.content .groups > .group').forEach(el=>{if(el.querySelector('.cell-drag'))return;const b=document.createElement('button');b.className='cell-drag';b.type='button';b.textContent='⇄ 拖动换位';b.dataset.edUi='';b.setAttribute('contenteditable','false');el.prepend(b);});}
 const base=render;render=function(){base();addHandles();};window.v5AddHandles=addHandles;
 const content=document.querySelector('.content');
 function start(el,e){drag={from:+el.dataset.group,el};el.classList.add('cell-source');ghost.textContent='拖到要交换的卡片上松开';ghost.hidden=false;move(e);}
 function move(e){if(!drag)return;ghost.style.left=e.clientX+14+'px';ghost.style.top=e.clientY+14+'px';document.querySelectorAll('.cell-target').forEach(x=>x.classList.remove('cell-target'));const t=document.elementFromPoint(e.clientX,e.clientY)?.closest('.content .groups > .group');if(t&&t!==drag.el)t.classList.add('cell-target');}
 function end(e){if(!drag)return;const t=document.querySelector('.cell-target');document.querySelectorAll('.cell-target,.cell-source').forEach(x=>x.classList.remove('cell-target','cell-source'));ghost.hidden=true;const from=drag.from;drag=null;if(!t)return;const to=+t.dataset.group;
  wbChange(()=>{const p=DATA.pages[page];snapshot(p);const a=p.groups[from].cell,b=p.groups[to].cell;p.groups[from].cell=b;p.groups[to].cell=a;v5ColOrder(p);});}
 let hold=null;
 content.addEventListener('pointerdown',e=>{if(!EditDesk.isEditing())return;const el=e.target.closest('.groups > .group');if(!el)return;
  if(e.target.closest('.cell-drag')){e.preventDefault();e.stopPropagation();start(el,e);return;}
  if(e.target.closest('.ct-move,.ct-size'))return;const x=e.clientX,y=e.clientY;clearTimeout(hold);hold=setTimeout(()=>{getSelection()?.removeAllRanges();start(el,{clientX:x,clientY:y});},450);
  const cancel=ev=>{if(Math.hypot(ev.clientX-x,ev.clientY-y)>6){clearTimeout(hold);}};content.addEventListener('pointermove',cancel,{once:false});setTimeout(()=>content.removeEventListener('pointermove',cancel),460);},true);
 addEventListener('pointermove',move);addEventListener('pointerup',e=>{clearTimeout(hold);end(e);});
 window.v5Swap=(a,b)=>{wbChange(()=>{const p=DATA.pages[page];snapshot(p);const x=p.groups[a].cell;p.groups[a].cell=p.groups[b].cell;p.groups[b].cell=x;});};
 const cellValidate=wbValidate;wbValidate=function(input){const out=cellValidate(input),src=input.kind==='evd-deck'?input.data:input;out.pages.forEach((p,i)=>p.groups.forEach((g,j)=>{const c=src.pages[i]?.groups?.[j]?.cell;if(c&&Number.isInteger(c.c)&&Number.isInteger(c.r)&&c.c>0&&c.c<=6&&c.r>0&&c.r<=12)g.cell={c:c.c,r:c.r};}));return out;};
})();
/* JSON 备份导入：骨架的校验会把版式全改成 bh、重发 id、宽度卡在 1216（v5 实测的坑）。这里把版式、id、宽度、opts、章节导航按白名单带回来 */
(function(){
 const idOK=v=>typeof v==='string'&&/^[\w-]{1,80}$/.test(v),num=(v,min,max)=>Number.isFinite(+v)&&+v>=min&&+v<=max?+v:undefined;
 const engValidate=wbValidate;wbValidate=function(input){const out=engValidate(input),src=input.kind==='evd-deck'?input.data:input;
  out.pages.forEach((p,i)=>{const s=src.pages[i]||{};if(LAYOUTS.includes(s.layout))p.layout=s.layout;if(idOK(s.id))p.id=s.id;
   const w=num(s.design?.width,800,1472);if(w)p.design.width=w;const t=num(s.design?.top,24,300);if(t)p.design.top=t;
   const o=s.opts,q={};if(o&&typeof o==='object'){const lw=num(o.labelw,40,400);if(lw)q.labelw=lw;if(o.root===true)q.root=true;const c=num(o.cols,1,4);if(c)q.cols=Math.round(c);const mw=num(o.maxWidth,400,1472);if(mw)q.maxWidth=mw;if(o.compact===true)q.compact=true;if(o.together===true)q.together=true;if(o.chips===true)q.chips=true;const rw=num(o.rootw,200,700);if(rw)q.rootw=rw;const pw=num(o.podw,200,420);if(pw)q.podw=pw;const ph=num(o.podh,300,800);if(ph)q.podh=ph;}
   if(Object.keys(q).length)p.opts=q;
   p.groups.forEach((g,j)=>{const sg=s.groups?.[j];if(idOK(sg?.id))g.id=sg.id;if(sg&&sg.chips===true)g.chips=true;});});
  if(Array.isArray(src.nav))out.nav=src.nav.filter(x=>x&&typeof x.name==='string'&&idOK(x.start)).slice(0,12).map(x=>({name:x.name.slice(0,20),start:x.start}));
  return out;};
 /* 页面参数“宽度”滑块：骨架上限 1216，本引擎默认 1472（左右各留 64） */
 const wr=document.querySelector('[data-design="width"]');if(wr)wr.max=1472;
 /* 新建页面：用本套课件的统一字号层级和默认版式，而不是骨架旧默认 */
 const np=document.querySelector('#wbNewPage');if(np)np.onclick=()=>wbChange(()=>{DATA.pages.splice(page+1,0,{id:wbID(),layout:DECK.newPageLayout||'rows',title:'新页面',tag:DECK.newPageTag||'',lead:'',note:'',design:{...(DECK.defaultDesign||{})},groups:[{id:wbID(),label:'01',title:'新重点',body:''}]});page++;focus=-1;});
})();
/* 卡片配图（0.3.9）：g.pic={img:dataURL,h:图框高px,fit:'contain'|'cover'}。图框跟正文一起生成、高度写定（不等图片解码），讲解中卡片尺寸不变；
   截图/表格用 contain（完整显示），照片用 cover（铺满裁切）。编辑模式卡片右下有「配图」：上传或更换、图高±40、换铺放、去掉；可撤销；导入备份按白名单带回 */
(function(){
 const ok=v=>typeof v==='string'&&/^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(v)&&v.length<4e6,H=v=>Math.max(120,Math.min(900,Math.round(+v||480)));
 const picOf=path=>{const m=/^pages\/(\d+)\/groups\/(\d+)\/body$/.exec(path||'');const g=m&&DATA.pages[+m[1]]&&DATA.pages[+m[1]].groups[+m[2]];return g&&g.pic&&ok(g.pic.img)?g.pic:null;};
 const picField=field;field=function(tag,cl,path,text){const h=picField(tag,cl,path,text);if(cl!=='body')return h;const p=picOf(path);if(!p)return h;
  return h+'<figure class="v5-pic" contenteditable="false" data-fit="'+(p.fit==='cover'?'cover':'contain')+'" style="height:'+H(p.h)+'px"><img src="'+p.img+'" alt="" draggable="false"></figure>';};
 function compress(file){return new Promise((res,rej)=>{const fr=new FileReader();fr.onerror=()=>rej(Error('读取失败'));fr.onload=()=>{const img=new Image();img.onerror=()=>rej(Error('不是可用的图片'));img.onload=()=>{const k=Math.min(1,1600/Math.max(img.width,img.height));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*k));c.height=Math.max(1,Math.round(img.height*k));const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(img,0,0,c.width,c.height);let q=.88,url=c.toDataURL('image/webp',q);while(url.length>900000&&q>.4){q-=.08;url=c.toDataURL('image/webp',q);}res({url,w:c.width,h:c.height});};img.src=fr.result;};fr.readAsDataURL(file);});}
 const file=document.createElement('input');file.type='file';file.id='v5PicFile';file.accept='image/*';file.hidden=true;document.body.append(file);let target=-1;
 file.onchange=async()=>{const f=file.files[0];file.value='';const i=target;target=-1;if(!f||i<0)return;try{const {url,w,h}=await compress(f);wbChange(()=>{const g=DATA.pages[page].groups[i];const o=g.pic||{};g.pic={img:url,h:H(o.h||480),fit:o.fit==='cover'?'cover':'contain'};});EditDesk.toast('已放进卡片（'+w+'×'+h+'，约'+Math.round(url.length*0.75/1024)+'KB）');}catch(e){alert('图片没能用上：'+e.message);}};
 function ui(){if(!EditDesk.isEditing())return;const p=DATA.pages[page];document.querySelectorAll('.content .groups > .group').forEach(el=>{if(el.querySelector('.v5-pic-ui'))return;const i=+el.dataset.group,g=p.groups[i];if(!g)return;
  const bar=document.createElement('div');bar.className='v5-pic-ui'+(g.pic?' has':'');bar.dataset.edUi='';bar.setAttribute('contenteditable','false');
  const mk=(t,f)=>{const b=document.createElement('button');b.type='button';b.textContent=t;b.onpointerdown=e=>e.stopPropagation();b.onclick=e=>{e.preventDefault();e.stopPropagation();f();};bar.append(b);};
  const edit=f=>wbChange(()=>{const x=DATA.pages[page].groups[i];if(x&&x.pic)f(x);});
  mk(g.pic?'更换配图':'配图',()=>{target=i;file.click();});
  if(g.pic){mk('图高－',()=>edit(x=>{x.pic.h=H((x.pic.h||480)-40);}));mk('图高＋',()=>edit(x=>{x.pic.h=H((x.pic.h||480)+40);}));
   mk(g.pic.fit==='cover'?'改为完整显示':'改为铺满裁切',()=>edit(x=>{x.pic.fit=x.pic.fit==='cover'?'contain':'cover';}));mk('去掉配图',()=>edit(x=>{delete x.pic;}));}
  el.append(bar);});}
 const base=render;render=function(){base();ui();};const pSet=EditDesk.setEditing;EditDesk.setEditing=function(v){const r=pSet.apply(this,arguments);if(v)setTimeout(ui);return r;};
 const picValidate=wbValidate;wbValidate=function(input){const out=picValidate(input),src=input.kind==='evd-deck'?input.data:input;
  out.pages.forEach((p,i)=>p.groups.forEach((g,j)=>{const s=src.pages[i]&&src.pages[i].groups&&src.pages[i].groups[j]&&src.pages[i].groups[j].pic;if(s&&ok(s.img))g.pic={img:s.img,h:H(s.h),fit:s.fit==='cover'?'cover':'contain'};}));return out;};
})();
render();resize();
/* 改宽/移动吸附：左右边线、中轴、三分之一、人物框左侧、其他卡片的边 */
(function(){
 let info=null;const guide=document.createElement('div');guide.className='v5-guide';guide.hidden=true;const content=document.querySelector('.content');
 content.addEventListener('pointerdown',e=>{if(!EditDesk.isEditing())return;const h=e.target.closest('.ct-move,.ct-size');if(!h)return;const el=h.closest('[data-group]');const g=DATA.pages[page].groups[+el.dataset.group];
  const s=scale,cr=content.getBoundingClientRect(),r=el.getBoundingClientRect(),W=content.offsetWidth;
  info={el,g,left:(r.left-cr.left)/s-(g.geometry?.x||0),top:(r.top-cr.top)/s-(g.geometry?.y||0),W};
  const others=[...content.querySelectorAll('.groups > .group')].filter(x=>x!==el&&x.getClientRects().length&&getComputedStyle(x).visibility!=='hidden').map(x=>{const q=x.getBoundingClientRect();return {l:(q.left-cr.left)/s,r:(q.right-cr.left)/s,t:(q.top-cr.top)/s,b:(q.bottom-cr.top)/s};});
  info.xs=[[0,'左边线'],[W,'右边线'],[W/2,'中轴'],[W/3,'三分之一'],[W*2/3,'三分之二'],[1072,'人物框左侧']].concat(others.flatMap(o=>[[o.l,'对齐卡片左边'],[o.r,'对齐卡片右边']]));
  info.ys=others.flatMap(o=>[[o.t,'对齐卡片顶边'],[o.b,'对齐卡片底边']]);content.append(guide);},true);
 const near=(list,v,T)=>{let best=null;for(const [x,n] of list){const d=Math.abs(x-v);if(d<T&&(!best||d<best.d))best={x,n,d};}return best;};
 document.addEventListener('pointermove',e=>{const d=CT.drag;if(!d||!info||d.kind==='pan')return;const T=14;let hit=null;
  if(d.kind==='width'){const raw=d.width+(e.clientX-d.startX)/scale;const b=near(info.xs,info.left+raw,T);d.g.geometry.width=Math.round(Math.max(200,Math.min(info.W-info.left,b?b.x-info.left:raw)));hit=b;}
  else if(d.kind==='move'){const rx=d.x+(e.clientX-d.startX)/scale,ry=d.y+(e.clientY-d.startY)/scale,Wd=info.el.offsetWidth;let b=null;
   const fixedW=!!d.g.geometry.width;for(const off of (fixedW?[0,Wd/2,Wd]:[0])){const c=near(info.xs,info.left+rx+off,T);if(c&&(!b||c.d<b.d))b={...c,off};}
   const x=b?b.x-b.off-info.left:rx;d.g.geometry.x=Math.round(Math.max(-info.left,Math.min(info.W-info.left-(fixedW?Wd:200),x)));const by=near(info.ys,info.top+ry,T);d.g.geometry.y=Math.round(by?by.x-info.top:ry);hit=b;}
  ctStyle();if(hit){guide.hidden=false;guide.style.left=hit.x+'px';guide.dataset.name=hit.n;}else guide.hidden=true;});
 document.addEventListener('pointerup',()=>{info=null;guide.hidden=true;});
})();

/* 底图：存进 DATA.bg，随保存/撤销/导出走；可上传图片（压缩为 WebP 存在课件里） */
(function(){
 const BGS=[['grid','细网格'],['graph','坐标纸'],['dots','点阵'],['lines','横线'],['diag','细斜纹'],['band','左侧色带'],['frame','细边框'],['paper','纸纹'],['none','纯色']];
 const FITS=[['cover','铺满（裁切）'],['contain','完整显示'],['repeat','平铺'],['center','原大居中']];
 const canvas=document.querySelector('.canvas');
 function layer(){const b=DATA.bg||{};let L=canvas.querySelector('.v5-bgimg');if(!b.img){if(L)L.remove();return;}
  if(!L){L=document.createElement('div');L.className='v5-bgimg';canvas.prepend(L);}
  if(L._img!==b.img){L.style.backgroundImage='url("'+b.img+'")';L._img=b.img;}
  const fit=b.fit||'cover';L.style.backgroundSize=fit==='cover'?'cover':fit==='contain'?'contain':'auto';L.style.backgroundRepeat=fit==='repeat'?'repeat':'no-repeat';L.style.backgroundPosition='center';
  const blur=+b.blur||0;L.style.inset=blur?(-blur*2)+'px':'0';L.style.filter=(blur?'blur('+blur+'px) ':'')+(b.gray?'grayscale(1)':'');L.style.opacity=String(b.op??.35);}
 function apply(){const b=DATA.bg||{};const k=BGS.some(x=>x[0]===b.kind)?b.kind:'grid';BGS.forEach(([n])=>canvas.classList.toggle('bg-'+n,n===k));canvas.style.setProperty('--bg-a',String(b.a??1));layer();ui();}
 function compress(file){return new Promise((res,rej)=>{const fr=new FileReader();fr.onerror=()=>rej(Error('读取失败'));fr.onload=()=>{const img=new Image();img.onerror=()=>rej(Error('不是可用的图片'));img.onload=()=>{const k=Math.min(1,2000/Math.max(img.width,img.height));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*k));c.height=Math.max(1,Math.round(img.height*k));c.getContext('2d').drawImage(img,0,0,c.width,c.height);let q=.85,url=c.toDataURL('image/webp',q);while(url.length>900000&&q>.35){q-=.1;url=c.toDataURL('image/webp',q);}res({url,w:c.width,h:c.height});};img.src=fr.result;};fr.readAsDataURL(file);});}
 function ui(){const pal=wbq('#wbPalettes');if(!pal)return;let box=wbq('#v5Bgs');
  if(!box){const t=document.createElement('b');t.textContent='底图';box=document.createElement('div');box.id='v5Bgs';
   const lab=document.createElement('label');lab.id='v5BgA';lab.innerHTML='底纹浓淡<input type="range" min="0.3" max="2.5" step="0.1"><output></output>';
   const up=document.createElement('div');up.id='v5BgUp';up.innerHTML='<button type="button" id="v5BgUpBtn">上传图片作底图</button><input type="file" accept="image/*" hidden><div id="v5BgImgCtl"><label>图片透明度<input data-k="op" type="range" min="0" max="1" step="0.01"><output></output></label><label>铺放方式<select data-k="fit">'+FITS.map(f=>'<option value="'+f[0]+'">'+f[1]+'</option>').join('')+'</select></label><label>模糊<input data-k="blur" type="range" min="0" max="20" step="1"><output></output></label><label class="v5-row"><input data-k="gray" type="checkbox">去色（黑白）</label><button type="button" id="v5BgDel">移除图片</button><small>图片叠在底纹上方；透明度调低可透出底纹。图片压缩后存进课件，导出的文件里也带着。</small></div>';
   (pal.nextElementSibling||pal).after(t,box,lab,up);
   const r=lab.querySelector('input');r.oninput=()=>{(DATA.bg ||= {}).a=+r.value;canvas.style.setProperty('--bg-a',r.value);lab.querySelector('output').textContent=Math.round(r.value*100)+'%';};r.onchange=()=>{EditDesk.save();wbRecord();};
   const file=up.querySelector('input[type=file]');up.querySelector('#v5BgUpBtn').onclick=()=>file.click();
   file.onchange=async()=>{const f=file.files[0];file.value='';if(!f)return;try{const {url,w,h}=await compress(f);wbChange(()=>{DATA.bg={...(DATA.bg||{}),img:url,fit:(DATA.bg&&DATA.bg.fit)||'cover',op:(DATA.bg&&DATA.bg.op)??.35};});EditDesk.toast('已设为底图（'+w+'×'+h+'，约'+Math.round(url.length*0.75/1024)+'KB）');}catch(e){alert('图片没能用上：'+e.message);}};
   up.querySelectorAll('#v5BgImgCtl input[type=range]').forEach(el=>{el.oninput=()=>{(DATA.bg ||= {})[el.dataset.k]=+el.value;layer();ui();};el.onchange=()=>{EditDesk.save();wbRecord();};});
   up.querySelector('select').onchange=e=>wbChange(()=>{DATA.bg.fit=e.target.value;});
   up.querySelector('input[type=checkbox]').onchange=e=>wbChange(()=>{DATA.bg.gray=e.target.checked;});
   up.querySelector('#v5BgDel').onclick=()=>wbChange(()=>{const b=DATA.bg||{};delete b.img;delete b.fit;delete b.op;delete b.blur;delete b.gray;});}
  const b=DATA.bg||{};const cur=b.kind||'grid';box.replaceChildren(...BGS.map(([k,n])=>{const bt=document.createElement('button');bt.type='button';bt.textContent=n;bt.className='bgsw bg-'+k+(k===cur?' selected':'');bt.style.setProperty('--bg-a','1.8');bt.onclick=()=>wbChange(()=>{DATA.bg={...(DATA.bg||{}),kind:k};});return bt;}));
  const r=wbq('#v5BgA input');if(r){r.value=b.a||1;wbq('#v5BgA output').textContent=Math.round(r.value*100)+'%';}
  const ctl=wbq('#v5BgImgCtl');if(ctl){ctl.hidden=!b.img;wbq('#v5BgUpBtn').textContent=b.img?'更换底图图片':'上传图片作底图';
   const op=ctl.querySelector('[data-k=op]');op.value=b.op??.35;op.nextElementSibling.textContent=Math.round(op.value*100)+'%';
   const bl=ctl.querySelector('[data-k=blur]');bl.value=b.blur||0;bl.nextElementSibling.textContent=bl.value+'px';
   ctl.querySelector('select').value=b.fit||'cover';ctl.querySelector('[data-k=gray]').checked=!!b.gray;}}
 const base=render;render=function(){base();apply();};
 const bgValidate=wbValidate;wbValidate=function(input){const out=bgValidate(input),src=input.kind==='evd-deck'?input.data:input;const b=src.bg;if(b&&typeof b==='object'){const o={};if(BGS.some(x=>x[0]===b.kind))o.kind=b.kind;o.a=Math.max(.3,Math.min(2.5,Number(b.a)||1));
   if(typeof b.img==='string'&&/^data:image\/(webp|png|jpeg);base64,/.test(b.img)&&b.img.length<4e6){o.img=b.img;o.fit=FITS.some(f=>f[0]===b.fit)?b.fit:'cover';o.op=Math.max(0,Math.min(1,Number(b.op)??.35));o.blur=Math.max(0,Math.min(20,Number(b.blur)||0));o.gray=b.gray===true;}out.bg=o;}return out;};
 window.v5SetBg=(kind,a)=>{DATA.bg={...(DATA.bg||{}),kind,a:a??1};apply();};
 apply();
})();
/* 审阅批注：只存浏览器本地，不进 DATA、不进导出，不影响编辑缓存 */
(function(){
const KEY=(DECK.key||'deck')+'-review-pins';let pins={};try{pins=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(pins))}catch(e){alert('批注未能保存：'+e.message)}};
let on=false;const btn=document.createElement('button');btn.id='pinBtn';btn.textContent='批注';
document.querySelector('header.toolbar').insertBefore(btn,document.querySelector('#settingsBtn'));
btn.onclick=()=>{on=!on;document.body.classList.toggle('pin-mode',on);btn.classList.toggle('active',on);btn.textContent=on?'批注中（点画面加点）':'批注';};
const canvas=document.querySelector('.canvas');
const pop=document.createElement('div');pop.id='pinPop';pop.hidden=true;pop.innerHTML='<div id="pinPopTitle"></div><textarea rows="4" placeholder="这里要改什么？"></textarea><div><button data-a="ok">保存</button><button data-a="del">删除</button><button data-a="no">取消</button></div>';document.body.append(pop);
let cur=null;
function layer(){let l=canvas.querySelector('.pin-layer');if(!l){l=document.createElement('div');l.className='pin-layer';canvas.append(l);}return l;}
function draw(){const l=layer();l.replaceChildren();const id=DATA.pages[page].id;(pins[id]||[]).forEach((p,i)=>{const d=document.createElement('div');d.className='pin';d.style.left=p.x+'px';d.style.top=p.y+'px';const b=document.createElement('b');b.textContent=i+1;const t=document.createElement('span');t.textContent=p.text||'（未填写）';d.append(b,t);d.onclick=e=>{e.stopPropagation();open(id,i,e)};l.append(d);});}
function open(id,i,e){cur={id,i};const p=pins[id][i];pop.querySelector('#pinPopTitle').textContent='第'+(page+1)+'页 · 批注 '+(i+1)+(p.step>=0?'（讲到第'+(p.step+1)+'条时）':p.all?'（整页预览）':'（开页）');pop.querySelector('textarea').value=p.text||'';pop.hidden=false;pop.style.left=Math.min(innerWidth-360,e.clientX+12)+'px';pop.style.top=Math.min(innerHeight-220,e.clientY+12)+'px';pop.querySelector('textarea').focus();}
pop.onclick=e=>{const a=e.target.dataset.a;if(!a||!cur)return;const list=pins[cur.id];if(a==='ok')list[cur.i].text=pop.querySelector('textarea').value.trim();if(a==='del'||(a==='no'&&!list[cur.i].text))list.splice(cur.i,1);if(!list.length)delete pins[cur.id];save();pop.hidden=true;cur=null;draw();};
canvas.addEventListener('click',e=>{if(!on||e.target.closest('.pin'))return;e.preventDefault();e.stopPropagation();const r=canvas.getBoundingClientRect();const id=DATA.pages[page].id;(pins[id] ||= []).push({x:Math.round((e.clientX-r.left)/scale),y:Math.round((e.clientY-r.top)/scale),text:'',step:showAll?-1:focus,all:showAll,title:EditDesk.plain(DATA.pages[page].title),at:new Date().toISOString()});save();draw();open(id,pins[id].length-1,e);},true);
window.reviewPins=()=>pins;
const base=render;render=function(){base();draw();};draw();
})();

/* opts.together：整页一起出现——翻到该页先只有标题，按一次全部卡片同时出现（整页状态），再按进下一页；往回翻同理。 */
(function(){if(typeof step!=='function')return;const orig=step,tog=i=>!!DATA.pages[i]?.opts?.together;
 step=function(d,automatic=false){
  if(tog(page)&&!EditDesk.isEditing()){
   if(d>0&&!showAll){if(!automatic)stop();showAll=true;focus=-1;detailStep=0;render();return;}
   if(d>0){if(page<DATA.pages.length-1){if(!automatic)stop();showAll=false;page++;focus=-1;detailStep=0;render();}else stop();return;}
   if(d<0&&showAll){if(!automatic)stop();showAll=false;focus=-1;detailStep=0;render();return;}
  }
  const before=page;orig(d,automatic);
  if(d<0&&page!==before&&tog(page)){focus=-1;detailStep=0;showAll=true;render();}
 };})();
