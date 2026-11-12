# 来源与署名

本集合由停机修复（tjxf）在实际工作中提出需求，与 AI 助手共同整理、迭代。共同维护不改变上游作者与素材权利。本次只发布维护者选定的 14 个技能；已下载的第三方完整技能不重新分发，见 [EXCLUDED.md](EXCLUDED.md)。

## 随包包含的第三方数据

| 文件或输出 | 原作者及来源 | 使用与改动 | 许可 |
|---|---|---|---|
| `skills/editable-video-deck/assets/data/pinyin-data.txt` | [mozillazg/pinyin-data](https://github.com/mozillazg/pinyin-data)，文件标记版本 0.15.0 | 汉字拼音数据，源文件保留版本和来源头 | © 2016 mozillazg，MIT；见 `skills/editable-video-deck/LICENSE.pinyin-data` 和 `third_party/licenses/pinyin-data-MIT.txt` |
| 同技能的 `assets/engine/pinyin.js` 与构建、导出的独立 HTML | 同上 | 由拼音数据生成无声调检索表，用于同音字匹配 | 派生代码和 HTML 源码内保留完整上游版权与 MIT 文本 |

## 本集合内部复用

- `editable-video-deck` 的编辑、保存、导出与面板代码来自本集合的 `HTML编辑台`、`编辑台配件` 及其本地迭代。相关技能是同一套工具的不同使用入口，不冒称不同独立作者。
- `content-layout-analysis-beta/scripts/yellow.cjs`、`voice-normalize.cjs`、格式说明和合成示例由本集合课件测试分支中抽取。为了只发布使用者所选的 14 项，本次将标黄规划所需部分独立打包，没有附带未选中的整套测试版课件引擎。归一函数与课件跟读方法保持同源，独立工具只承诺标黄规划和校验。
- `分档卡片课件`、`口播课件动效` 与 `课件录视频` 是围绕口播课件形成的专门流程。内部复用仍适用本集合自身内容的 MIT 许可。

## 外部依赖与仅引用服务

Playwright/Playwright Core、Chrome/Chromium/Edge、Node.js、Python、FFmpeg/FFprobe、Apple Vision/Swift/iPhone Mirroring、企业微信与飞书/Lark 是部分技能使用或面向的外部运行时、产品与接口。仓库不附它们的二进制、账号、登录、授权或字体，不声称其作者参与或认可本集合。使用者按各产品现有许可与具体授权准备环境。

`企微群书签` 的飞书适配器使用使用者自备的兼容 `lark-cli` 接口；未捆绑该 CLI，未据名称猜造作者与公共下载地址。`分档卡片课件/scripts/fetch_logos.py` 可访问 [Wikimedia MediaWiki API](https://www.mediawiki.org/wiki/API:Main_page) 查找使用者指定的图标；本包不带下载图片，后续素材仍需逐项核验权利和来源。`html-content-showcase` 不包含第三方下载库，来源字段示例只是虚构示例。

## 公开副本的范围

移除了私人路径、内部链接、真实群名和业务记录；课件使用合成示例与系统字体。MIT 许可不覆盖使用者后续提供的文稿、图片、商标或外部软件。只安装在本机、曾做本地修改或存在相同目录名，均不能据此把他人作品声明为原创。

来源路径和哈希仅用于追踪本地副本，不能单独证明原始创作权。如发现遗漏来源，请提供可核验的作者、原作品链接和对应文件，维护者会补充署名或先移除争议部分。
