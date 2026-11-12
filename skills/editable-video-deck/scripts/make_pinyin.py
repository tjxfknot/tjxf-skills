#!/usr/bin/env python3
"""生成 assets/engine/pinyin.js：常用汉字 → 不带声调的拼音，给语音跟读按读音比对用（同音字不算错）。

数据：assets/data/pinyin-data.txt，来自 github.com/mozillazg/pinyin-data（MIT 许可），每字取第一个读音。
用法：python3 scripts/make_pinyin.py   （改了数据才需要重跑）
"""
import re, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
src = (ROOT / 'assets/data/pinyin-data.txt').read_text(encoding='utf-8')
groups = {}
for line in src.splitlines():
    m = re.match(r'U\+([0-9A-F]+):\s*([^#\s]+)', line)
    if not m:
        continue
    code = int(m.group(1), 16)
    if not 0x4E00 <= code <= 0x9FFF:      # 基本区两万多字够用
        continue
    py = m.group(2).split(',')[0]
    py = py.replace('ü', 'v').replace('ǖ', 'v').replace('ǘ', 'v').replace('ǚ', 'v').replace('ǜ', 'v')
    py = ''.join(c for c in unicodedata.normalize('NFD', py) if unicodedata.category(c) != 'Mn')
    if not re.fullmatch(r'[a-z]+', py):
        continue
    groups.setdefault(py, []).append(chr(code))
table = '|'.join(k + ':' + ''.join(v) for k, v in sorted(groups.items()))
js = ('/*EVD_PINYIN_START*/\n/* 汉字→不带声调拼音（' + str(sum(map(len, groups.values()))) + ' 字，' + str(len(groups)) + ' 个音节），语音跟读按读音比对用。'
      '数据 github.com/mozillazg/pinyin-data（MIT），scripts/make_pinyin.py 生成，别手改。 */\n'
      'window.__EVD_PY=' + repr(table).replace("'", '"') + ';\n/*EVD_PINYIN_END*/\n')
license_text = (ROOT / 'LICENSE.pinyin-data').read_text(encoding='utf-8')
js = js.replace('/*EVD_PINYIN_START*/\n', '/*EVD_PINYIN_START*/\n/* Third-party data: mozillazg/pinyin-data, version 0.15.0.\nSource: https://github.com/mozillazg/pinyin-data\n' + license_text + '\n*/\n', 1)
(ROOT / 'assets/engine/pinyin.js').write_text(js, encoding='utf-8')
print('pinyin.js', len(js.encode('utf-8')) // 1024, 'KB,', len(groups), '音节')
