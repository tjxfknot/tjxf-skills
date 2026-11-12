// Shared normalization extracted from this collection’s voice-follow engine.
const DIG = { '零': 0, '〇': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
  function num(w) {
    if (!/[十百千]/.test(w)) return [...w].map(c => DIG[c]).join('');
    let t = 0, n = 0;
    for (const c of w) { if (c in DIG) n = DIG[c]; else { t += (n || 1) * ({ '十': 10, '百': 100, '千': 1000 }[c]); n = 0; } }
    return String(t + n);
  }
  // 中文数字转阿拉伯数字，全半角、大小写统一，去标点空白；逐字做，withMap 时 map[i]＝第 i 个字在原文里的位置（标黄稿显示原文要用）
  function norm(s, withMap) {
    s = String(s || '');
    let out = ''; const map = [];
    const re = /[零〇一二两三四五六七八九十百千]+|[\s\S]/gu; let m;
    while ((m = re.exec(s))) {
      const w = m[0];
      if (/^[零〇一二两三四五六七八九十百千]+$/.test(w)) { for (const ch of num(w)) { out += ch; map.push(m.index); } continue; }
      const n = w.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
      for (let k = 0; k < n.length; k++) { out += n[k]; map.push(m.index); }
    }
    return withMap ? { s: out, map, src: s } : out;
  }

module.exports = norm;
