// node lines.cjs 成品.html → 列出所有多行文字的实际断行，并标记"非词组边界断行"和"孤字行"
const {launch,open,arg}=require('./_lib.cjs');
(async()=>{const b=await launch();const p=await open(b,arg(2,'成品.html'));
const r=await p.evaluate(async()=>{DATA.reduceMotion=true;const out=[];const SEP='、／，；：＋。）｜ ';
function lines(el){const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);const res=[];let cur='',top=null;while(w.nextNode()){const n=w.currentNode;for(let i=0;i<n.length;i++){const rg=document.createRange();rg.setStart(n,i);rg.setEnd(n,i+1);const rc=rg.getClientRects()[0];if(!rc)continue;const t=Math.round(rc.top);if(top!==null&&Math.abs(t-top)>4){res.push(cur);cur='';}top=t;cur+=n.nodeValue[i];}}if(cur)res.push(cur);return res;}
for(let i=0;i<DATA.pages.length;i++){page=i;detailStep=0;
 const states=[['all',true,-1],...DATA.pages[i].groups.map((g,j)=>['f'+(j+1),false,j])];
 const seen=new Set();
 for(const [st,all,f] of states){showAll=all;focus=f;render();await new Promise(r=>setTimeout(r,15));
  document.querySelectorAll('.content .title,.content .lead,.content .label,.content .gtitle,.content .body-display .detail-row,.content .body-display .college-row').forEach(el=>{if(!el.getClientRects().length||getComputedStyle(el).visibility==='hidden')return;const L=lines(el);if(L.length<2)return;const key=el.className+L.join('|');if(seen.has(key))return;seen.add(key);
   const bad=L.slice(0,-1).some(l=>!SEP.includes(l.trim().slice(-1)));const lead=L.slice(1).some(l=>'、，；：。）'.includes(l.trim()[0]));const orphan=L.some(l=>l.trim().length<=2);
   out.push({pg:DATA.pages[i].id,st,cls:el.className.split(' ')[0],lines:L,flag:(bad?'断在词中 ':'')+(lead?'标点在行首 ':'')+(orphan?'孤字':'')});});}}
return out;});
for(const x of r)console.log((x.flag?'⚠ '+x.flag:'  ').padEnd(12),x.pg,x.st.padEnd(3),x.cls.padEnd(10),x.lines.join(' ⏎ '));await b.close();})();
