---
name: 编辑台配件
description: |
  在「HTML编辑台」核心层之上加三样可选件：参数滑块（字号/间距这类拖着试的数值）、
  条目清单（增、删、拖动排序、往右缩进编组）、快捷键登记。
  当用户说"字号能不能拖着调"、"想自己加一条/删一条"、"能不能排序"、"把这几条并成一组"、
  "加个滑块"、"加个侧栏清单"、"参数想现场调"、"加快捷键"时触发。
  也包括"像 Word 那样选中就能改格式"、"改字体字号颜色加粗"、"选中文字弹个工具条"、
  "同类文字一起改"、"同一级别/同等权重的文字一起调"、"改完字号选区就没了"、
  "要反复选中才能连着调"——那是本技能的第三件：格式条
  （data 模式用 fmtbar.js，静态页用 fmtbar-dom.js）。
  也适用于：做讲课课件、看板这类需要现场微调排版的 HTML；
  以及条目数量会变、顺序要调的内容（院校盘点、榜单、清单）。
  前提：页面已经装好核心层 editdesk.js。没装的话先用「HTML编辑台」。
  不适用：内容定死不动的页面——加了也没人用，白占地方。
---

# 编辑台配件

核心层只管"改字 / 存 / 导出"。这一层加的是**改版式**和**改条目**。

三个运行时，都依赖 `EditDesk` 已装好，都只在编辑模式下露面、导出时自动剥掉：
`assets/edpanel.js`（滑块 / 清单 / 快捷键）、
`assets/fmtbar.js`（格式条 · data 模式）、
`assets/fmtbar-dom.js`（格式条 · dom 模式）。

## 装

```html
<script>/* editdesk.js 全文 */</script>
<script>/* edpanel.js 全文 */</script>
<script>/* fmtbar.js 全文（要格式条才装） */</script>
<script>
  EditDesk.init({ … });                    // 核心层先装

  EditDeskPanel.slider({ path:'fs', label:'字号', min:.6, max:2,
    onInput:applyFS,        // 拖的过程中实时预览
    onDone:render });       // 松手后重排

  EditDeskPanel.list({ path:()=>'items', title:'院校',
    onApply:render,
    blank:n=>({ name:'新条目', note:'—' }) });
</script>
```

## 滑块

拖的时候走 `onInput` 实时预览，**松手才落盘**——不然每动一像素存一次，页面会卡。
值写进 DATA 的 `path`，导出时一起带走。

| 选项 | 说明 |
|---|---|
| `path` | 值存在 DATA 的哪（如 `'fs'`、`'cover/cueY'`） |
| `label` | 显示的名字 |
| `min` / `max` / `step` | 默认 `0.5` / `2` / `0.01` |
| `format` | 数值怎么显示，默认按百分比 |
| `onInput(v)` | 拖动中，只做便宜的事（改 CSS 变量） |
| `onDone(v)` | 松手后，做贵的事（重排、重新测量） |

**别在 `onInput` 里重排整页**，拖起来会卡成幻灯片。
只改 CSS 变量、留到 `onDone` 再重排。

## 条目清单

增、删、拖动排序、**往右拖一格 = 和上一条编成一组**（拖回去拆开）。

| 选项 | 说明 |
|---|---|
| `path` | **函数**，返回数组在 DATA 里的路径。写成函数是因为当前档/当前页会变 |
| `title` | 标题，可以是函数 `(items)=>'第一梯队'` |
| `label(item,i)` | 一行显示什么，默认 `item.name` |
| `blank(n)` | 新增的条目长什么样 |
| `onApply()` | 改完怎么重绘。**必填**，不然页面不动 |
| `onPick(item,i)` | 点一行做什么（比如把这张卡讲出来） |
| `group` | 设 `false` 关掉编组 |
| `groupKey` | 编组标志存哪个字段，默认 `grp` |

编组的数据长这样：跟着上一条的那条带 `grp:true`，头一条永远不带。
宿主渲染时按这个标志决定缩进/并排。

数据被外部换掉之后（切换档位、整树重建），调 `EditDeskPanel.refresh()` 让面板跟上。

## 格式条

**两个实现，按宿主是哪种模式挑**，别挑错：

| | `fmtbar.js` | `fmtbar-dom.js` |
|---|---|---|
| 宿主 | data 模式 | **dom 模式**（静态页） |
| 改什么 | `:root` 的 CSS 变量 | 元素的 inline style |
| 宿主要配合 | CSS 必须写成 `var(--sz-xxx)`、每块打 `data-sty` | **什么都不用改** |
| 作用域 | 这一处 / 同类全改 | **选中的字** / 这一处 / 同类全改 |
| 存哪 | `DATA.sty` + `DATA.ov` | 核心层的 dom 缓存（连 style 一起存） |

dom 模式那个多一档「选中的字」，因为静态页经常要只把一句话里的几个字改掉。

### fmtbar.js（data 模式）

选中一段字，头顶浮出 Word 式的工具条：**字体 / 字号 / 颜色 / 加粗**，
右边一个开关决定这次改**「这一处」**还是**「同类全改」**。

宿主要配合三件事，缺一不可：

1. 每个可改的文字块打两个属性：`data-e="数据路径"`（核心层要）、`data-sty="类名"`（这层要）
2. 这几类文字的 CSS **走变量**，变量名固定是 `--sz-/--col-/--ff-/--fw-` 加类名：

```css
.item .e{
  font-size:calc(var(--sz-ev,26px) * var(--fs));
  color:var(--col-ev,var(--ink2));
  font-family:var(--ff-ev,inherit);
  font-weight:var(--fw-ev,400);
}
```

3. 把类名表交进来：

```js
EditDeskFmt.init({
  kinds:{ ev:{nm:'事件正文', sz:26}, tag:{nm:'时间牌子', sz:26} },
  szExpr: v => 'calc(' + v + 'px * var(--fs))',   // 「这一处」写 inline 时的字号表达式
  onVars: (k,v,rt) => {                            // 有联动变量的话在这里补
    if(k==='ev') v.col ? rt.style.setProperty('--col-ev-on', v.col)
                       : rt.style.removeProperty('--col-ev-on');
  }
});
```

「同类全改」写进 `DATA.sty[类名]`（落到 `:root` 的变量上），
「这一处」写进 `DATA.ov[数据路径]`（落到那个元素的 inline style），两者都随导出带走。
元素重建之后（整树重绘），对新元素调一次 `EditDeskFmt.applyOne(el)` 把「这一处」贴回去。

| 选项 | 说明 |
|---|---|
| `kinds` | `{类名:{nm:面板上显示的名字, sz:默认字号}}` |
| `styKey` / `ovKey` | 存在 DATA 的哪两个字段，默认 `sty` / `ov` |
| `szExpr(v)` | 「这一处」的字号写成什么表达式，默认 `v+'px'` |
| `onVars(k,v,rt)` | 类样式变了，宿主还要联动设别的变量 |
| `fonts` | 字体下拉，默认 黑体/宋体/楷体/圆体/等线 |

**坑**：字号别直接写死 px，页面通常还有个整体缩放变量（`--fs`），
`szExpr` 就是为了让「这一处」也跟着整体缩放走。

### fmtbar-dom.js（dom 模式）

静态页用这个。**宿主零配合**——不用改 CSS，不用打 `data-sty`，
有 `data-e` 就够了（核心层本来就要求打）。

```html
<script>/* editdesk.js 全文 */</script>
<script>/* fmtbar-dom.js 全文 */</script>
<script>
  EditDesk.init({ mode:'dom', key:'…' });
  EditDeskFmtDom.init({
    container:'#wrap',                                  // 同类只在这个范围里找
    kinds:{ 'lead':'导语', 'tag':'标签', 'note':'注释' }   // 可省，省了就直接拿 class 名当名字
  });
</script>
```

工具条最左边那个按钮循环切三档作用域：

- **选中的字** —— 给选中的几个字包一层 `span.ed-fmt`
- **这一处** —— 写光标所在那个 `[data-e]` 块的 inline style
- **同类全改** —— 同一种 class 的全改，按钮上直接显示「同类 · 标签（6）」

| 选项 | 默认 | 说明 |
|---|---|---|
| `container` | `document` | 「同类」在哪个范围里找 |
| `kinds` | 自动 | `{class:显示名}`。不给就拿 class 名当名字 |
| `ui` | `true` | 自带工具条。`false` 时只给 API，宿主自己接按钮 |
| `fonts` | 内置 8 项 | 字体下拉 |
| `onChange(scope,el)` | — | 改完的回调（宿主还要另存东西时用） |

`ui:false` 时可用的 API：
`EditDeskFmtDom.apply({fontSize:'20px'})` · `.clear()` · `.setScope('all')` · `.state()`

**元素识别同类的顺序**：`data-sty` 属性 → `kinds` 里列的 class → 第一个不像状态类的 class → 标签名。
所以 `active` / `prev` / `anim` 这类状态类名会被跳过。

## 快捷键

```js
EditDeskPanel.keys({ 'ArrowDown':()=>step(1), 'm':()=>toggleWall() });
```

在输入框和可编辑区里自动不抢键；带 Cmd/Ctrl/Alt 的组合键也不抢
（那些留给核心层的 `Cmd+S` / `Cmd+E`）。

## 坑

- **改完字号别把选区弄丢**（`fmtbar-dom.js` 已经处理，自己写就要注意）：
  老实现是 `execCommand('fontSize')` 生成 `<font size=7>` 再 `replaceWith` 换成 span，
  **`replaceWith` 一执行，原来的 Range 指向的节点就没了，选区跟着失效**——
  用户每点一次「减小」都得重新选一遍字。
  正确做法：改完之后拿新节点重建选区（`selectNodeContents` + `addRange`）并回写 `savedRange`；
  再判断一下选区是不是正好整段覆盖某个已有的格式 span，是就直接改它的 style，
  免得点十次套十层 span。
- **加粗这类开关，取消时不能只清 inline style**。
  那类文字的 CSS 本身可能就是 `font-weight:900`，清掉 inline 后计算值还是 900，
  用户看不出任何变化，会以为按钮坏了。取消要显式写 `400` / `normal` / `none`。
- **类名别撞**：面板分区是 `.sec`，"与上一条同组"是 `.row.grp`。
  早先两个都叫 `.grp`，分区的 `flex-direction:column` 漏到行上，行被拉成三行高。
  改完拿 `getBoundingClientRect()` 量行高验，别只看截图。
- **`path` 写成函数**，别写成字符串。当前档会变，写死了就永远只能改第一档。
- **`onApply` 必填**。数组改了但页面不重绘，用户会以为没生效然后再点一次。
- 拖动排序用的是原生 HTML5 drag，**在缩放很小的页面上不好点**。
  条目多的话给面板留够高度（默认清单区最高 38vh，可以改 CSS）。

## 没做进来的

**取景框**（拖四角改变卡片墙布局区域）跟具体布局算法绑得太死，
每个页面的"布局区域"含义都不一样，做成通用件反而更难用。
需要该功能时，在当前项目中实现独立的布局区域选择器，并验证与宿主布局算法的关系。
