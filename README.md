# 停机修复 · tjxf Skills

停机修复（tjxf）与 AI 助手在实际工作中共同整理、迭代的 14 个 Skill。Skill 是给助手使用的方法说明，部分附带脚本、模板或示例。本次公开范围由维护者逐项选定。

这里是经过脱敏的公开副本。私人路径、账号、群消息、内部文档、真实业务素材和历史备份不在仓库中。下载的完整第三方 Skill 不随本仓库重新分发；[排除清单](EXCLUDED.md)与[来源署名](ATTRIBUTIONS.md)分别记录。

## 选择安装

下载或克隆本仓库，在仓库目录查看清单：

```bash
python3 tools/install.py --list
```

选择需要的文件夹复制到当前助手的技能目录；也可用安装器，例如：

```bash
python3 tools/install.py --skill HTML编辑台 --skill 编辑台配件 --target ~/.codex/skills
python3 tools/install.py --skill editable-video-deck --skill content-layout-analysis --target ~/.claude/skills
```

安装器遇到同名现有技能会停止，不覆盖。它不会安装依赖、登录账号、启用同步、创建定时任务或修改权限。中文技能名称沿用已有形式，某些宿主可能需要兼容入口；读取到文件不代表具备相应工具和账号能力。

## 本次发布的技能

### 课件与可编辑页面

| 名称 | 中文功能 |
|---|---|
| [HTML编辑台](skills/HTML编辑台/SKILL.md) | 给独立 HTML 加上就地改字、浏览器保存与导出 |
| [编辑台配件](skills/编辑台配件/SKILL.md) | 为编辑台增加参数滑块、条目清单和快捷键 |
| [content-layout-analysis](skills/content-layout-analysis/SKILL.md) | 把原稿拆成分页与版式规划，检查容量 |
| [content-layout-analysis-beta](skills/content-layout-analysis-beta/SKILL.md) | 测试版：规划时同步标出原稿触发词 |
| [editable-video-deck](skills/editable-video-deck/SKILL.md) | 制作 4:3 口播课件，支持编辑、逐条讲解与跟读 |
| [分档卡片课件](skills/分档卡片课件/SKILL.md) | 把分档盘点做成同位置切换的可缩放卡片课件 |
| [口播课件动效](skills/口播课件动效/SKILL.md) | 为讲解内容增加逐条出现、转场和动画兜底 |
| [课件录视频](skills/课件录视频/SKILL.md) | 用逐帧渲染把课件导出为 MP4 |
| [html-content-showcase](skills/html-content-showcase/SKILL.md) | 管理自己准备的 HTML 模板、来源和试用记录 |

### 信息整理

| 名称 | 中文功能 |
|---|---|
| [企微群书签](skills/企微群书签/SKILL.md) | 经授权读取指定群，整理并写入指定飞书文档 |
| [digsik](skills/digsik/SKILL.md) | 把值得深挖的问题存成候选，再筛为学习卡片 |

### 聊天与设备协作

| 名称 | 中文功能 |
|---|---|
| [compact-thread-handoff](skills/compact-thread-handoff/SKILL.md) | 把长聊天整理成可独立续接的交接包 |
| [long-job-monitor](skills/long-job-monitor/SKILL.md) | 用状态差异检查长任务的进展和停滞 |
| [iPhone镜像操作](skills/iPhone镜像操作/SKILL.md) | 使用当前宿主的电脑工具操作已连接的 iPhone 镜像 |

## 配套关系与能力边界

- **口播课件**：`content-layout-analysis` 输出规划，`editable-video-deck` 构建稳定版课件。课件内已内联所需编辑运行时；`HTML编辑台` 和 `编辑台配件` 也能用于其他 HTML 项目。
- **标黄规划**：`content-layout-analysis-beta` 附独立校验脚本和合成示例，可直接生成标黄稿。未发布整套 `editable-video-deck-beta`。与稳定版课件配合时仍需填写 `cue.phrases`；不能把规划标黄误认为稳定版自动具备测试版的精确触发构建能力。
- **分档与动效**：`分档卡片课件` 面向专门的分档展示；`口播课件动效` 可给已有页面补动画，与主课件引擎存在部分重合。
- **录视频**：自带录制源码，需使用者准备 Node.js、兼容 Playwright、浏览器和 FFmpeg。静态检查不能替代实际视频编码验收。
- **模板库管理**：`html-content-showcase` 提供自建管理脚本和空目录；未捆绑下载的第三方模板，需要自行登记有权使用的资源。
- **企微群书签**：依赖 macOS、企业微信、Swift/系统 Vision、用户授予的权限及兼容飞书工具。读取仅使用包内受控脚本，写飞书须有明确目标和授权；不自动发送群消息。
- **digsik**：公开版只含本地候选、卡片方法、示例和校验，不含维护者自己的手机、网页同步后台。
- **长任务与 iPhone**：监控技能是状态检查方法，不附后台服务；镜像操作依赖当前宿主具备电脑操作工具。账号、登录和系统权限不会随技能迁移。
- **语音与素材**：语音是否本地处理取决于浏览器和模式，云端识别需具体授权。使用系统字体和合成示例，不附未确认分发许可的字体、校徽或学校原稿；系统字体可能改变换行。

## 许可证与来源

自身新增内容采用 [MIT License](LICENSE)，允许使用、修改和再分发，须保留版权与许可文本。第三方拼音数据仍归 mozillazg 与其贡献者，使用原 MIT 许可，完整文本同时保留在课件技能、根目录和独立输出 HTML 的源码中。其余外部产品和仅引用资源不由本许可重新授权。

详细文件归属、内部复用与工具依赖见 [ATTRIBUTIONS.md](ATTRIBUTIONS.md)。

## 本地验证

```bash
python3 tools/verify.py
```

该检查只读本地文件，核对授权的 14 项目录、语法、相对链接、隐私规则、许可证与 `SHA256SUMS`。验证范围和真实环境尚未实测的部分见 [VALIDATION.md](VALIDATION.md)。
