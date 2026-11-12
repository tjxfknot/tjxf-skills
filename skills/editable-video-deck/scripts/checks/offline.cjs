// node offline.cjs 成品.html [更多.html…]   单文件离线检查：成品里不得引用 http(s) 或 // 开头的外链资源
// （src/href、CSS url()、@import）。页面里的普通文字链接（<a href>）不算资源，不报。
const fs=require('fs'),path=require('path');
const files=process.argv.slice(2);if(!files.length){console.error('用法：node offline.cjs 成品.html …');process.exit(2);}
const PAT=/<(?!a\b)[a-z]+[^>]*?\s(?:src|href)\s*=\s*["']((?:https?:)?\/\/[^"']+)|url\(\s*["']?((?:https?:)?\/\/[^)"']+)|@import\s+["']?((?:https?:)?\/\/[^"';\s]+)/gi;
let bad=0;
for(const f of files){const s=fs.readFileSync(f,'utf8');const hits=new Set();let m;
  while((m=PAT.exec(s)))hits.add((m[1]||m[2]||m[3]).slice(0,120));
  console.log(path.basename(f),hits.size?'✗ 外链 '+hits.size+' 处':'✓ 无外链');for(const h of hits)console.log('   ',h);bad+=hits.size;}
console.log(JSON.stringify({pass:bad===0}));process.exit(bad?1:0);
