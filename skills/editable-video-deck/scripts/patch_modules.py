#!/usr/bin/env python3
"""给已有的单页多版式课件加上（或更新）引擎附加模块：手机预览（phone.js）、主题包与挑风格（packs.js）、录成视频入口（record.js，0.4.3）、语音跟读（voice.js，0.5.0）。

用法：python3 patch_modules.py 原.html 新.html [--only record]
- `--only record` 只加／更新录成视频入口，不动其他模块（给不想加手机预览、主题包的老课件用）。
- `--only voice` 只加／更新语音跟读（主播照原稿讲、自动出卡，替换旧的「现场语音推进 · 试用」）和它用的拼音表（pinyin.js），不动其他模块。
- 只认 editable-video-deck 单页引擎做出来的课件（有 DECK_CFG）；分档画布等其他模板不适用。
- 每个模块夹在 /*EVD_XXX_START*/…/*EVD_XXX_END*/ 之间：已有就换成 skill 里的最新版，没有就追加（幂等）。
- 不动 DATA、缓存键、版本号，用户浏览器里没导出的修改照常接得上。不覆盖原件。
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULES = [('PHONE', 'phone.js'), ('PACKS', 'packs.js'), ('RECORD', 'record.js'), ('PINYIN', 'pinyin.js'), ('VOICE', 'voice.js')]   # 顺序有讲究：packs 的挑风格复用 phone 的副本模式


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    only = sys.argv[sys.argv.index('--only') + 1].upper() if '--only' in sys.argv else None
    if only: args = [a for a in args if a.upper() != only]
    if len(args) != 2:
        sys.exit(__doc__)
    src, dst = Path(args[0]), Path(args[1])
    if src.resolve() == dst.resolve():
        sys.exit('新文件不能和原件同名：先留着原件，验证过再替换')
    s = src.read_text(encoding='utf-8')
    if 'const DECK_CFG=' not in s:
        sys.exit('这不是单页多版式引擎做的课件（找不到 DECK_CFG），不打补丁')
    done = []
    # 语音跟读要带上拼音表（0.5.3 起按读音比对）
    for tag, fname in [m for m in MODULES if not only or m[0] == only or (only == 'VOICE' and m[0] == 'PINYIN')]:
        mod = (ROOT / 'assets/engine' / fname).read_text(encoding='utf-8')
        if re.search(r'</(script|style)', mod, re.I):
            sys.exit(f'{fname} 里出现了 </script> 或 </style>，会提前结束标签')
        pat = re.compile(r'/\*EVD_' + tag + r'_START\*/[\s\S]*?/\*EVD_' + tag + r'_END\*/\n?')
        if pat.search(s):
            s = pat.sub(lambda m: mod, s, count=1)
            done.append(f'更新 {fname}')
        else:
            pos = s.rfind('</script>')
            if pos < 0:
                sys.exit('找不到 </script>')
            s = s[:pos] + '\n' + mod + s[pos:]
            done.append(f'加上 {fname}')
    dst.write_text(s, encoding='utf-8')
    print('、'.join(done) + f'：{dst}（DATA 与缓存键未动）')


if __name__ == '__main__':
    main()
