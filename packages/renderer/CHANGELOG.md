# @open-feishu-card/renderer

## 0.8.11

### Patch Changes

- 5985780: - `ai-common_colorful`（AI 星芒）改用真机客户端 SVG：字体 glyph `\f128` 在四角星右上角多画一颗小星，渲染出来比真机多一个「右上角小十字」。现在按客户端 `AiCommonColorful` 的 24×24 SVG（#4752E6→#CF5ECF，dark #7B83F7→#B54AB5）以 data URI 画，`theme-dark` 覆盖暗色；同时删掉被它取代的 `background-clip:text` 渐变裁切兜底（`COLORFUL_ICON_GRADIENTS` → `SVG_COLORFUL_ICONS`）。
- 5985780: - `button` 的 `primary_filled` / `danger_filled` 悬停色用成了真机的 **pressed** 值（#0442d2 / #e22e28），悬停反而变深。改回真机 ud 变量 light 档：hover `#336df4` / `#ff7570`（变浅一档），并补 `:active` pressed `#0442d2` / `#e22e28`。

## 0.8.10

### Patch Changes

- - `button` 的 `size` 之前只用来算前置图标像素，按钮盒子恒按 medium 渲染（32px / 14px）：`size:"large"` 比真机矮 8px、字小 2px（真机 40px / 16px），`small` / `tiny` 则偏高偏大。现补 `--tiny/--small/--medium/--large` 尺寸类，按真机 `ud__button` 的 xs/sm/md/lg 分档：盒子 24/28/32/40px、字号 12/12/14/16px。高度仍由 padding + line-height + 描边决定（对齐卡片外壳 `.universal-card-button .ud__button{height:auto}`）。

## 0.8.9

### Patch Changes

- 1dd57a7: - 补 `note` 备注块与 `text` 文本叶子：`note` 按真机 12px/N600 行内流式渲染，`is_footer` 出顶部 16px + 分割线；`text` 兼容 v1/简化卡片内容里的 `{tag:'text',text:'...'}`。
  - 容器直接子项补 `position: relative`（等价真机 `.universal-card-element-shell__container > .universal-card-element-shell`）：负 margin 面板叠到图片上时按 DOM 顺序压在上层，不再被图片内部 `position:relative` 的 wrapper 反盖。
  - `background_style` / `background_color` 支持真机 fallbackStyle 的 `bg-white` → `bg-body`、`white` → `static-white`，白底块不再透明；`propertyBackgroundColor` 同时读取 `backgroundColor` / `background_color`。

## 0.8.8

### Patch Changes

- c45693a: `IconTokenSchema` 改为由仓库内清单 `src/common/icon-tokens.list.ts`（`ICON_TOKENS`，1167 个）生成，能通过校验的 token 与清单严格一一对应：
  
  - **新增 13 个**前缀图标 token：`chat-loading_outlined`、`feishuclip_filled`、`headphone-solid_outlined`、`inline-view_outlined`、`jira-filter_outlined`、`original_outlined`、`port-export_outlined`、`rename_outlined`、`trello_outlined`、`up-top-round_outlined`、`meeting-ai_filled`、`calendar-disable_colorful`，以及 `ai-common_colorful`（此前只作为客户端补充，现已在清单内）。
  - **移除 10 个**不在清单内的客户端私有 AI token（`ai-search_colorful`、`ai-doc_colorful`、`ai-video_outlined`、`ai-update_filled` 等）。这些 token 在客户端字体里存在，但不在有效值清单里，现在与臆造 token 一样被判非法——若既有卡片用到，需要换成清单内的图标。
  - **renderer**：`COLORFUL_ICON_GRADIENTS` 同步收敛到 `ai-common_colorful`，不再为已移除的 AI 彩色图标注入渐变。
  - **validator**：新增回归用例——清单内 token 全部通过校验、清单外 token（含被移除的 AI 图标）报错，且 `IconTokenSchema.options` 与 `ICON_TOKENS` 严格相等。
- @open-feishu-card/adapter@0.4.5

## 0.8.7

### Patch Changes

- 0d84582: 对齐真机前缀图标的尺寸与间距：
  
  - `markdown.icon`：默认尺寸改用引擎 `j(字号)`（14px 正文 → 16px 图标，不再 1:1 跟随字号），右侧间距 4px → 8px；首元素为 heading 时按 `Aa(level)` 给图标尺寸，wrapper 跟随标题行高/上边距。
  - `div.icon` / `person_list.icon`：默认尺寸同样走 `j(字号)`，wrapper 的 font-size/高度跟随正文/头像；`custom_icon` 补齐默认尺寸与宽高解析。

## 0.8.6

### Patch Changes

- Updated dependencies [3f5e630]
  - @open-feishu-card/adapter@0.4.5

## 0.8.5

### Patch Changes

- d197c59: 修复「容器里的整行元素不撑满」：分栏 / 按钮行在预览里比真机窄一截。
  
  真机给每个元素外面都套了一层 `.universal-card-element-shell { width: 100% }`，所以块级子元素永远占满容器宽度，容器上的 `horizontal_align`（→ `align-items`）只对 `width: auto` 的元素生效。渲染器没有这层壳，此前只给 `.universal-card-body` 的直接子元素补了 `width: 100%`，其余容器（`column` / `interactive_container` / `collapsible_panel` 内容区）里只要写了 `horizontal_align: left`（→ `align-items: flex-start`），里层 `column_set`、按钮行就缩成内容宽——真机整行撑满，预览里却窄一块，看着像「每个交互容器自带一个默认宽度」。
  
  - `styles.css`：把「子元素默认撑满」从 `.universal-card-body` 扩到 `column` / `interactive_container` / `collapsible_panel__content`，用 `:where()` 归零特异性（组件自己声明的宽度仍然优先），并排除按钮、inline 语音条（`markdown_audio`）与横排容器（新增 `--row` 修饰类）。
  - `interactive_container` 宽度对齐真机 `useSize()`：`widthValue` 是唯一真值来源——缺省 → `width: 100%`、`fill` → `100%`、`auto` → `auto`、`pixels` → `Npx`。此前缺省不写宽度，会被父级 `align-items` 缩成内容宽。

## 0.8.4

### Patch Changes

- 7624ccc: 修复彩色图标（`*_colorful`）的两处不一致：
  
  - **schema**：`IconTokenSchema` 补上客户端内置的 AI 图标（`ai-common_colorful`、`ai-search_colorful` 等 11 个）与官方文档里漏收的 `approval_colorful`，避免合法卡片被校验判为非法。
  - **renderer**：这些彩色图标在真机上是自带渐变的彩色图形，而 `ud-icons` 字体是单色轮廓（原始 woff2 无 COLR/CPAL），此前会继承父级颜色（header 里就是模板蓝）。现在命 `COLORFUL_ICON_GRADIENTS` 的 token 改用 `background-clip:text` 渐变着色（AI 系列：`#4752E6 → #CF5ECF`，暗色 `#7B83F7 → #B54AB5`），header 也不再给彩色图标注入标题色。
- @open-feishu-card/adapter@0.4.4

## 0.8.3

### Patch Changes

- 9b9b855: chart：水合时补上真机 VChart 主题的默认内边距 `12/12/12/0`（含 SSR hydrate 脚本与 VS Code 预览）。此前不注入，落回 VChart 缺省 `padding: 20`，四边都比真机大——现在与真机一致；`chart_spec` 显式写了 `padding` 仍以调用方为准。

## 0.8.2

### Patch Changes

- 0519357: table：宽表格的横向滚动条对齐真机——默认透明隐藏，鼠标移入表格才显示；滚动条改为 8px 细条，隐藏两端箭头按钮。Firefox 走 `scrollbar-color`，WebKit/Blink 走 `::-webkit-scrollbar`。

## 0.8.1

### Patch Changes

- e26baf1: table：修复翻页时表格与分页器之间的分割线显示为 2px 粗线的问题。
  
  翻页时 DOM 最后一行并不是可见的最后一行（后面还有 hidden 行），`tbody tr:last-child` 的去底边规则失效；可见页尾行的 `border-bottom` 与翻页器的 `border-top` 叠在一起。现在每页最后一行加 `--page-last` 类并去掉底边，分割线恢复为真机的 1px。

## 0.8.0

### Minor Changes

- dce04a3: table：按飞书卡片 JSON 2.0 表格文档补齐全部参数，并对齐真机翻页器外观。
  
  - 参数：`page_size` 按 [1,10] 夹紧；`row_height` 支持 low/middle/high/auto/自定义 px（[32,124]）；`row_max_height` 支持 [32,999]；`margin`、`freeze_first_column`（首列 sticky）落地；最多渲染 50 列。
  - 列：`vertical_align`、`date_format` 生效；`width` 按 auto / [80,600]px / [1,100]% 夹紧；`display_name` 为空时与真机一致展示 `--`。
  - 数据类型：新增 `date`（Unix 毫秒 / RAW `{type,value,format}`，YYYY/MM/DD/HH/mm/ss，缺省 RFC 3339 本地时区）；`number` 支持 `format.symbol` / `separator` / `precision`(0–10)；`markdown` / `lark_md` 支持 `![](image)`；空单元格展示 `--`。
  - 翻页器：翻页区回到表格同一道外边框内，表格与翻页区间加分割线；按钮去掉描边/底色，仅保留 hover 背景；箭头按真机 `rotate(90deg)` 显示为上/下。
  - adapter：RAW→DSL 补投影 `vertical_align` / `date_format` / `row_max_height` / `margin` / 像素 `row_height`；markdown 解析支持图片。

### Patch Changes

- Updated dependencies [dce04a3]
  - @open-feishu-card/adapter@0.4.4

## 0.7.0

### Minor Changes

- 577bdc4: table：支持真实分页。`page_size` 缺省按真机 5 行/页，单页不渲染翻页器（hideOnSinglePage）；翻页器对齐 antd small pagination，只输出「当前/总页数 + 上一页/下一页」，其余行以 `hidden` 留在 DOM。浏览器 `renderCard` 自动水合，SSR 可用 `feishuTablePagerHydrateScript()`。
  
  另外把表格 1px 边框从最外层 `.universal-card-table` 移到 `.universal-card-table__scroll`，让翻页器位于边框之外（与真机结构一致）。

## 0.6.1

### Patch Changes

- 0d32266: 表格渲染对齐真机：单元格长文本默认不换行、超出用省略号截断。
  
  - 行高换算单元格文本行数（客户端 `al()`/`Wi`）：`low` 1 行、`middle` 2 行、`high` 3 行，
    自定义像素行高按 `<54:1 <88:2 <110:3 <132:4 else 5` 阈值；1 行使用 nowrap + ellipsis，
    多行使用 `-webkit-line-clamp`。此前单元格只有 `word-break: break-word`，长文本全部换行、
    行高被撑开，与真机完全不同。
  - 行高映射修正为 `low:32 / middle:54 / high:88`（客户端 `fallbackStyle.table.row_height_map`），
    缺省行高改为 `low`（真机默认单行 + 省略号）；`td`/`th` 不再自带内边距，改由内容层
    （表体 `0 8px`、表头 `6px 8px`）承担，行高才等于真机的 32/54/88。
  - `row_height=auto`（RAW `builtin_table_row_height_extension`）不截断文本，内容最大
    `row_max_height`（缺省 124px）并可滚动。
  - 列宽改为固定布局：`table-layout: fixed`，未写宽度的列最小 128px（客户端 `columnDefaultWidth`
    下限），空间不够时表格横向滚动；列宽全为 px/% 时表宽收紧到「列宽之和 + 每列 1px」
    （客户端 `Fl()`），不再把固定列拉满整卡、导致截断位置比真机靠后。
  - 表头默认 1 行省略（`header_style.lines` 缺省 1，支持多行截断 / `full_displayed` 不限行数）。
  - `lark_md` 单元格把行数写回 `markdown.property.lines`（拷贝 property，不改原卡片对象），由 markdown 的
    `children_wrapper` 做多行截断；`markdown` 单元格与真机一致不强制写 lines（避免截断图片/图表）。

## 0.6.0

### Minor Changes

- 77f0ec4: 补齐 audio 组件的渲染属性：此前只有最基本的播放条，`style` / `time_display` /
  `time_position` / `border` / `margin` / `padding` / `background_style` / `fill_color` /
  `width` / `disabled` / `fallback` 大部分没有落地。
  
  - `style`：`normal` 块级用 PlayRoundFilled/PauseRoundFilled，`flat` 与 inline 用
    PlayFilled/PauseFilled，`speak` 用 SpeakingOutlined（对齐飞书网页版 xn 的图标分支）。
  - `time_display` × `time_position`：`default` 单槽（auto：未播放显示总时长），`both` +
    `both_sides` 拆成「当前 / 总时长」双槽，`both` + `start`/`end` 单槽并带 `--both` 宽度类；
    时间槽带 `data-audio-time` 供水合更新，≥1h 自动切 `HH:MM:SS`（`--long`）。
  - `border`：`color` / `corner_radius`（兼容 RAW 的 `hasBorder`、`borderColor`、
    `customBorderColor`、`border.cornerRadius`）。
  - `margin` / `padding`：兼容 RAW 四向对象与 DSL CSS 简写字符串。
  - `background_style` / `fill_color`：支持 `customBackgroundStyle` / `customFillColor` 主题色。
  - `width`：`fill` / 像素 / `default`（进度条 + 时长时 `min-width:164px`）。
  - `disabled`：改为真机同款白色半透明蒙层（不再是整体 opacity）；`disabled_tips` 走 title。
  - `fallback`：无媒体时 `drop` 不渲染，`fallback_text` 输出兜底文案。
  - 顺带修复 markdown 内嵌 `<audio style='speak'>` 的 round-trip：`audioStyle` 现在会被
    `rawToDsl` 投影回 `style`，渲染器也同时读 `style` / `audioStyle`。

### Patch Changes

- Updated dependencies [77f0ec4]
  - @open-feishu-card/adapter@0.4.3

## 0.5.10

### Patch Changes

- db0190c: 修复表格表头对齐：`header_style.text_align` 换值在渲染器里看不出差别。
  
  真机（客户端 table 组件）的表头单元格是 `headerStyle.textAlign` 的 PlainText，列的
  `horizontalAlign` 只作用于表体单元格。此前渲染器写成 `column.horizontal_align ||
  header_style.text_align`，列的 `horizontal_align` 会整列盖掉表头的 `text_align`——每列都写
  `horizontal_align` 的卡片（生成器默认形态）里，改 `text_align` 完全无效。现在：
  
  - 表头对齐只由 `header_style.text_align` 决定；缺省时按列 `data_type` 兜底（`number` → right，其余 left），与真机一致。
  - 表体对齐仍以列 `horizontal_align` 为准，缺省同样按 `data_type` 兜底（`number` → right），修正数字列默认靠左的问题。

## 0.5.9

### Patch Changes

- f87cbd9: 对齐真机表格标签与折叠面板箭头：
  
  - table `options` 标签改用客户端的 `<color>_table` 色板（X100 实心底 + text-title 深色字、20px 高 / 14px 600 字、胶囊圆角），不再复用正文 text_tag 的半透明色板；选项值支持官方文档里的单个字符串，以及 `text` 为 plain_text 节点/嵌套对象的写法，不再出现空标签或 `[object Object]`。
  - `collapsible_panel` 箭头默认尺寸按标题字号计算（真机 `j(cr(title.textStyle))`：12px→14px、14px→16px、16px→18px），并支持 RAW 的 `widthValue`/`heightValue` 像素尺寸；之前一律回退 16px，标题字号偏小时箭头比真机大。

## 0.5.8

### Patch Changes

- ccce13a: 表格列线（`th`/`td` 的 `border-right`）改用 `--line-divider-default`（`rgba(31,35,41,.15)`），
  不再用 `--bg-filler` 实色 `#eff0f1`：
  
  - 真机列线是半透明中性黑，叠在单元格底色上：表头列线叠 `#f2f3f5` → `(211,211,214)`（≈ 取色
    `#d4d4d7`），表体列线叠白 → `(222,222,223)`；
  - 之前写死浅灰实色，表头列线比真机浅两档（`#eff0f1` vs `#d4d4d7`），看起来像一条发白的蓝灰线。

## 0.5.7

### Patch Changes

- 12328f1: 配色对齐客户端 light token 表（`feishu-web-dump/debugger/19ecdc88…js` 的 name→export→值映射），
  修掉「整体比真机偏蓝」的几处来源：
  
  1. `--bg-float-overlay` 改回实色 `#f5f6f7`（客户端 token = `rgb(245,246,247)`）。
     此前按 JPEG 真机截图量到 `(246,246,246)` 把它改成了 `rgba(30,30,30,.04)`：JPEG 色度子采样
     会把 `#f5f6f7` 压成中性 246，属于误判。现在 `grey` 与 `grey-50` 都是 `#f5f6f7`，
     与真机 PNG（om_footer_shot.png）逐通道一致。
  2. 分割线改用 `--line-divider-default`（客户端 light = `rgba(31,35,41,.15)` → 叠白 `(222,222,223)`）：
     `hr`、`collapse_divider`、`blockquote` 竖线、表格 `th/td` 底边不再写死 `#dee0e3`
     （蓝色阶实色，叠白后 B 通道多 4 阶）。表格列线改用 `--bg-filler`（`#eff0f1`）。
  3. 表格表头：
     - `header_style.background_style=grey` 由 `#f5f6f7` 改为 `#f2f3f5`（真机 token
       `udtoken-table-bg-head` = N100，见 fallbackStyle `table.background_color.grey`）。
     - 支持 `header_style.text_color` / `text_size` / `lines`：真机把表头单元格当 PlainText 渲染
       （`textStyle: bold/size/color/customColor`），`text_color=grey` 应为 `#646a73`，
       此前一律写死 `#1f2329`（蓝黑）。
  4. 暗色：`--bg-float-overlay` = `#373737`、`--line-divider-default` = `rgba(207,207,207,.15)`;
     表格 `th/td` 不再单独覆盖 `border-color`，跟随 token。
- @open-feishu-card/adapter@0.4.2

## 0.5.6

### Patch Changes

- 5f323bf: `--bg-float-overlay` 改用客户端的中性 4% 叠色（对齐真机 (246,246,246)）
  
  网页版主题表把 `--bg-float-overlay` alias 成 `var(--N50)` = `#f5f6f7`，比真机偏蓝一阶
  （面板底色实测：真机 `(246,246,246)` 三通道相等，旧实现 `(245,246,247)`）。
  客户端这套用的是 N900 的 4% 叠色，叠在卡片白底上正好 `#f6f6f6`。
  
  这里取中性化的 N900 `rgba(30, 30, 30, 0.04)` 而不是 `rgba(31, 35, 41, 0.04)`：8bit alpha
  量化后 N900-raw 会让蓝通道多一阶（压成 `(246,246,247)`），中性值三通道才都是 246。
  保留半透明语义，`column_set` / `column` / `interactive_container` 的 `grey` 底色因此也能
  叠在彩色底上自然融合。
  
  暗色主题补 `--bg-float-overlay: rgba(255,255,255,0.12)`（反向叠白，落在 `#1a1a1a` 上约
  `#393939`，对齐客户端 dark token）。

## 0.5.5

### Patch Changes

- cd792f4: 对齐真机：折叠面板描边/内边距/圆角、markdown 行高 +2、列表结构与列表符号
  
  按 feishu-web-dump（网页版 universal-card CSS + 引擎 JS）逐项对账，修四处肉眼可见的偏差：
  
  1. **行高**：真机 Markdown 是 `lineHeight = 引擎行高表(fontSize) + 消息卡片桌面端 2`
     （`de(12)+2=22`、`de(14)+2=24`），此前用「字号 + 8」：带 `text_size` 的段落行距
     一律小 2px，列表逐行累积后差半行。行高也改用引擎 `ce` 表（18→28、20→30 …，
     不再按字号+8 外推），Checker 同样改用该表。
  2. **折叠面板描边**：`border.color = grey` 走 `collapsible_panel.border_color` token 表
     → `var(--line-border-component)`（N350 #d0d3d6），不再是正文灰 N600 #646a73。
     `interactive_container` 的 `border_color` 同表（`--bordered` 默认边框一并改 N350）。
  3. **折叠面板间距**：新增 `--fat` 类（有描边/底色），header 内边距由写死的 `8px 12px`
     改为 CSS 的 `--fat → 4px 8px`（否则 8px 12px 会盖掉默认值）；content 内边距由
     `0 12px 12px` 改为 `--fat → 8px` / 否则 `padding-top:8px`；默认圆角 8px → `--fat` 6px
     （显式 `corner_radius` 仍优先）；箭头过渡 `.2s → .1s linear`。
     另外内容区改成真机那样**恒为 flex 容器**，默认 `row-gap/column-gap: 8px`
     （`.universal-card-element-shell__container`），多元素面板子项之间才有 8px 间距，
     只有显式写了 `vertical_spacing` / `horizontal_spacing` 才覆盖。
  4. **列表**：改为真机结构——每个 item 一个 `<ul>/<ol>` + `<li data-marker>`，
     符号由 `li::before` 画（•/◦/▪ 或序号）、`padding-left:22px`、符号右对齐到距正文 20px。
     原先的 marker span + 6px gap 让符号紧贴文字、缩进只有 11px。
  
  另：卡片根补 `-webkit-font-smoothing: antialiased`（对齐网页版 `html` 规则），
  并新增语义色 token（`--line-border-component` / `--text-caption` / `--colorful-blue` …）。

## 0.5.4

### Patch Changes

- 979b3b9: `img.title` 按真机 BaseText 渲染（此前完全忽略，预览里图片标题丢失）：
  
  **结构 / 样式对齐真机 dump**
  
  - 外壳 `.universal-card-image`（width:100%，承载 margin）+ 上方 `.universal-card-image__title`（`margin-bottom:8px`），与真机 CSS 一致。
  - `__wrapper` 补齐 `position:relative / align-items:center / flex:0 1 auto / width:100% / overflow:hidden`；`__host` 补齐 `width:100% / font-size:0 / position:static`（对齐真机 `universal-card-image` 规则）。
  - 外边距（含 `margin:8px 20px`、负 margin 出血）挂到外壳上，标题与图片作为整体参与布局，`calc` 宽度照旧。
  
  **文本能力**
  
  - 支持官方 BaseText 的 `plain_text` 与 `lark_md`：`lark_md` 按 markdown 子树渲染（对齐 / 字号 / 粗体等生效）。
  - 标题的 `text_size` / `text_color` 折叠进 `textStyle`（等价真机服务端归一）；`lines` / `text_lines` 支持行数截断；空标题不占位。
  - RAW ↔ DSL 往返补齐：`rawToDsl` 把图片标题投影成 `plain_text | lark_md` 并保留 `text_size` / `text_color` / `text_align` / `lines`；DSL→RAW 的文本叶子补上 `lines`。
- Updated dependencies [90395f9]
- Updated dependencies [979b3b9]
  - @open-feishu-card/adapter@0.4.2

## 0.5.3

### Patch Changes

- 6216759: 按真机（V7.4+，PC + iOS 实测）对齐 `column` 宽度语义，并修掉 `flex_mode: stretch` 的布局 bug。
  
  **renderer**
  
  - `flex_mode` 的列宽覆盖改为**窄屏才生效**，与客户端 `ni()` 一致（`isWide`：卡片容器
    > 320px 时把 flexMode 当 `none`）：column_set 挂 `--stretch/--bisect/--trisect/--flow`
    类，宽度覆盖与 `flex-wrap: wrap` 放进 `@container (max-width: 320px)` 规则里。
    宽卡预览下 `width` / `weighted` 照常生效（对齐 PC 真机），窄卡片里才堆叠/等分。
  - 修掉 `stretch` 的布局 bug：此前只把列改成 `width:100%` 却不换行，px 列又带
    `flex-shrink: 0`，于是它吃掉整行、把兄弟列压成 0（典型现象：stretch + `width:"16px"`，
    16px 列变成整行宽）。现在窄屏每列独占一行。
  - px 列不再写 `flex-shrink: 0`：真机在整行超过卡片内容宽时会**按 px 比例等比压缩**
    （600px 的行放进 576px 内容区 → 缩到 576），定死不缩会溢出卡片。
  - `flex_mode: flow` 在窄屏下把列宽回落 `auto`（客户端 `ei()` 同款）：px / weighted
    都被忽略、按内容宽排列；此前预览里 px 仍然生效。
  - px 超出 `[16,600]`（如 `10px` / `800px`）按 `auto` 渲染：真机既不报错也不夹取，直接当内容宽。
  
  **linter**
  
  - 新增 `column-width-range`：px 越界时提示客户端会忽略该值、退回 `auto`。
  - 新增 `column-weight-range`：`weight` 不是 1–5 的整数时提示该列会降级成 `auto`，
    同行其它 `weighted` 列分掉剩余宽度。
  
  **schema**
  
  - `column.width` / `weight` 的描述补充真机语义：px 不是绝对宽度（整行超宽会等比压缩）、
    越界值会被静默忽略、`flex_mode` 只在窄屏覆盖 `width`。
- @open-feishu-card/adapter@0.4.1

## 0.5.2

### Patch Changes

- b86a35a: 补齐各组件的 `hover_tips` / `disabled_tips`：
  
  - `button`、`video` 此前完全忽略悬浮提示，现在把文案挂到组件根节点的原生 `title` 上。
  - `interactive_container`、`checker` 改为统一解析，禁用态展示 `disabled_tips`（不再吞掉或错误回退 `hover_tips`）。
  - `select_img` 选项复用同一套解析逻辑（含组件级 `disabled` 连带禁用选项时的 `disabled_tips`）。
  - 统一在 `renderElement` 里给根节点附加 `title`，自定义组件只要元素带 `hover_tips` 也会生效；组件自己已输出的 `title` 不会被覆盖。
  - 兼容 RAW camelCase（`hoverTips` / `disabledTips`）、DSL snake_case（`hover_tips` / `disabled_tips`）以及两种文本叶子形态。

## 0.5.1

### Patch Changes

- 6502b10: `column` 未写 `width` 时按内容宽（auto）渲染，不再默认等分撑满。
  
  真机 `Kn()` 在 `width` / `widthValue` 都缺省时返回 `{}`，即 CSS 默认 `flex-grow: 0` + `width: auto`（贴内容宽）；官方文档 `column.width` 的默认值也是 `auto`。渲染器此前把"缺失"当成 `weighted`（`flexBasis:0 + flexGrow`），于是漏写列宽的卡片在预览里被拉成等宽列，和真机对不上。
  
  同时补齐 `widthValue` 的另外两种 echo（此前只认 `pixels`）：
  
  - `column_width_weighted` → `flex-basis:0` + `flex-grow:<value>`
  - `builtin_column_width: "auto"` → `width:auto`
  
  新增 4 条用例（RAW 三种 echo + 无 width）与 2 条 DSL 用例（`weighted` / `auto`）。

## 0.5.0

### Minor Changes

- 42fb7bd: 补齐 `collapsible_panel` 的 header 字段：
  
  - `schema`：`header.expanded_title` 落地（此前 `parse()` 会静默丢弃）；`header.width` / `header.position` 改为官方枚举；标题文本对象支持 `lark_md` 与 `text_align` / `text_size` / `text_color` / `lines` / `margin` / `icon` / `i18n` 等排版字段。
  - `adapter`：RAW→DSL 不再丢弃 `header.width` / `header.vertical_align` / `header.position`（这三项是官方公开字段，丢弃会破坏 RAW ↔ DSL 无损）。
  - `renderer`：渲染 `expanded_title`（`details[open]` 时切换标题）、`header.background_color` / `width` / `vertical_align` / `position`，以及面板级 `direction` / `horizontal_spacing` / `vertical_spacing` / `horizontal_align` / `vertical_align`；`expanded` 缺省改为收起（对齐真机）。
  - `components`：新增 `headerWidth` / `headerVerticalAlign` / `headerPosition` / `horizontalAlign` / `verticalAlign` / `horizontalSpacing` / `verticalSpacing`。
- 42fb7bd: `column` 的 `horizontal_align` / `direction` 在预览里生效；`column_set` 的 `vertical_align` 明确废弃。
  
  **background**：对齐字段在真机上由网页版引擎的同一个 `qr()` 产出，规则是
  
  - `isRow = direction === 'horizontal'`
  - `horizontal_align` → `isRow ? justify-content : align-items`
  - `vertical_align` → `isRow ? align-items : justify-content`
  
  但 `column_set` 调用时带了 `disableVerticalConfig: true`（`chunks` 里就是这一句），垂直对齐整段被跳过；官方《分栏》文档的 `column_set` 字段表同样没有 `vertical_align`。反过来的 `column` 两个对齐都吃，只是 `horizontal_align` 受 `unifyLayout` 开关控制。
  
  **renderer**
  
  - `column` 此前写死 `flex-direction: column`，只把 `vertical_align` 塞给 `justify-content`，`horizontal_align` 与 `direction` 完全没人读——于是「列内水平对齐」在预览里怎么点都不动，`direction: horizontal` 也永远排成竖列。
    现在按上面的规则映射，并补上 `horizontal_spacing → column-gap`（只在显式给值时输出，与真机一致）。
  - `column_set` 忽略 `vertical_align` 的行为保留，加注释说明这是真机语义（`disableVerticalConfig`），不要再"修"。
  - 新增 7 条用例锁定上述映射（含 RAW camelCase 与 `column_set` 忽略垂直对齐）。
  
  **schema**
  
  - `ColumnSetSchema` 去掉 `vertical_align`：真机不认，留着只会让模型生成一个静默失效的字段。需要列内容垂直居中写 `column.vertical_align`。
  - `ColumnSetSchema` 的 describe 同步纠正（原文案推荐在 `column_set` 上写 `vertical_align=center`，是错的）。
  
  **components**
  
  - `ColumnSetProps` 去掉 `verticalAlign`，`renderColumnSet` 不再输出 `vertical_align`（`FeishuColumnSet` 类型本就没有这个字段）。垂直居中改用 `Column` 的 `verticalAlign`。

### Patch Changes

- Updated dependencies [42fb7bd]
  - @open-feishu-card/adapter@0.4.1

## 0.4.0

### Minor Changes

- bdd86c4: 补齐 `img_combination` / `select_img` 全链路支持。
  
  - **schema**：`img_combination.img_list` 支持官方字段 `img_id` / `transparent`；`select_img.options` 支持 `img_id` / `transparent`。
  - **adapter**：RAW ↔ DSL 双向映射——`combinationMode` / `imgList` / `cornerRadiusValue` / `transparent` ↔ `combination_mode` / `img_list[{img_key}]` / `corner_radius` / `combination_transparent`；`select_img` 的 `options[].imageID` → `img_key`、camelCase 配置 → snake_case、RAW `actions` → `behaviors`；`dslToRaw` 反向生成渲染器可用的 RAW 形态。
  - **components**：`ImgCombination` 的图项支持 `imgId` / `transparent`；`SelectImg` 选项支持 `imgId` / `transparent` / `disabledTips` / `hoverTips`，组件级支持 `disabledTips`。
  - **renderer**：新增 `img_combination`（double / triple / bisect / trisect 布局）与 `select_img`（网格、选中/禁用态、表单内 checkbox/radio）渲染，样式对齐网页版引擎；`form` 渲染子元素时注入 `inForm` 上下文。

### Patch Changes

- Updated dependencies [bdd86c4]
  - @open-feishu-card/adapter@0.4.0

## 0.3.6

### Patch Changes

- 6a8360d: 支持视频公开 DSL 的嵌套封面 `cover: { img_key }`。
  
  - adapter：`dslToRaw` 把 `cover.img_key` 映射为 RAW `coverImageID`，不再把嵌套 `cover` 透传进 RAW（避免飞书按未知属性 200621 拒收）。
  - renderer：`resolveVideoCoverSrc` 同时识别扁平 `coverImageID` / `image_key` / `cover_image_key` 与嵌套 `cover`（`img_key` / `imageID` / `image_id` 等）。有媒体源时输出 `<video poster>`，无媒体源时渲染封面壳。
- Updated dependencies [6a8360d]
  - @open-feishu-card/adapter@0.3.20

## 0.3.5

### Patch Changes

- 4a501e0: 预览对齐真机：header 白底 + 输入框/按钮/下拉不再撑满整行。
  
  三处差异都出在渲染层（真机和预览吃的是同一份卡片 JSON），规则逆向自飞书网页版引擎：
  
  - header 底色：真机 default/disabled 模板的 `bg_color` 是空串，即不设背景色、透出卡片根的
    `--bg-float`(#ffffff)。此前这里写死 #f5f6f7(N50)，预览里就多出一条浅灰标题栏，真机并没有。
    改成白色，并给 header 背景层挂 `--no-template`（真机无模板时底部不留内边距）。
  - 输入框：真机 input 默认 `width:100%` 但 `max-width:282px`，只有 `width:"fill"` 才撑满。
  - 下拉：真机 select 默认定宽 282px；`type:"text"` 自适应且无边框；`width:"fill"` 撑满。
  - 按钮：真机按「卡片容器宽度 > 320px」分档（isWide）——宽屏自适应内容宽、窄屏撑满整行；
    text 族恒撑满（文字仍靠左）；`width:"fill"` 恒撑满。此前 0.2.27 那次按「默认按钮撑满整行」
    的结论写死了 block，这次一并纠正，改用容器查询实现窄屏分档。

## 0.3.4

### Patch Changes

- 0ff94c8: 渲染器：负外边距大图真正出血到卡片两边；图片默认直角，不再擅自加 4px 圆角。
  
  **出血（右边留白）**
  DSL 里 `margin: "-20px -20px 0px -20px"` 的顶层大图，本意是顶到卡片边、左右贯穿整行。
  真机上那个带 margin 的盒子 `width` 是 auto，负 margin 让它同时向两侧撑宽，所以图是贯通的；
  渲染器这边盒子写死了 `width:100%`，负 margin 只把它整体左移 20px —— 左边溢出被裁，
  右边就空出一条 20px 的白边。
  
  `applyOuterMargin` 改为按外边距符号区分：水平外边距为正仍收窄（`calc(100% - Npx)`，
  抵消 `body > * { width:100% }`），为负则把盒子撑宽（`calc(100% + Npx)`），并放开
  `max-width`（CSS 的 `max-width:100%` 会把出血宽度夹回容器宽，右边照样留白）。
  对所有组件生效，不只是 img。
  
  **圆角**
  真机网页版 `.universal-card-image__host { border-radius: 0 }`：图片默认直角，圆角只由
  `corner_radius` 给出。渲染器此前在 CSS 里写死 `border-radius: 4px`，导致没声明
  `corner_radius` 的图四角被圆掉，与真机不符。现改为 0，`corner_radius` 的内联圆角不受影响。
  
  **验证**
  新增 2 条用例（负外边距出血的 calc 宽度 + max-width:none；未声明 corner_radius 时不加圆角）。

## 0.3.3

### Patch Changes

- 3dee401: 回调行为不再在 RAW↔DSL 往返中丢失（服务端回读形态是 `action_request`，不是 `callback`）。
  
  `im.message.get?card_msg_content_type=raw_card_content` 返回的回调 action 实际形态是
  `{ type:'action_request', action:{ actionID, isValueObjectType, value:"" } }`。此前 raw→DSL 只认
  `callback`，服务端返回的 action 全部落进 `return undefined`，整条 action（含 `behaviors` 字段）
  静默消失；`interactive_container` 的 `value ?? {}` 还会把 `""` 原样透传成字符串。
  
  **adapter**
  - `button` / `interactive_container` / `column_set` / `column` 的 RAW `actions` 收成共用投影函数，
    `callback` 与 `action_request` 两种拼写都认。
  - `value` 归一：对象原样保留；非空字符串保留（服务端接受字符串载荷）；被服务端清空
    （`isValueObjectType` / `actionID`）时投影为 `{}`，字符串空载荷保留 `""`。
  - 未知 action type 不再静默丢：按 snake_case 原样保留进 `behaviors`。
  - 新增可选诊断通道 `rawToDsl(raw, { onWarn })` / `rawCardToDsl(env, { onWarn })`，报告
    `unknown_action_type`（未知 type）与 `callback_payload_cleared`（载荷被服务端清空）、
    `unrepresentable_action`（column_set/column 的公开 schema 放不下回调）。
    不传 `onWarn` 时行为与输出不变。
  - DSL→RAW 输出服务端拼写：回调写 `type:'action_request'`，平台 URL 写
    `pc_url` / `ios_url` / `android_url`（raw→DSL 两种拼写都收，往返不变）。
  
  **schema / components**
  - `CallbackBehavior.value` 放宽为 `record | string`（服务端接受字符串载荷）。
  
  **renderer**
  - `readCallbackValue` 同时识别 `action_request`；`resolveURL` 同时认 snake_case 平台 URL。
  
  注意：即使投影正确，从「拉一张卡 → 再发出去」这条路上回调参数仍会为空——服务端两种回读形态
  （raw 的 `value:""` / user_card_content 的 `{type:'callback'}`）都不回显载荷。要保住 `value`，
  发送侧必须留存原始 DSL。
- Updated dependencies [3dee401]
  - @open-feishu-card/adapter@0.3.19

## 0.3.2

### Patch Changes

- 253cf20: `markdown` 支持前缀图标 `icon`，补齐链路最后一环。
  
  组件库已正确输出 `icon`、adapter 也保留了它，但渲染器只渲染 `property.elements`，`icon` 被整块丢弃——带图标的分区标题在预览里缺图标。
  
  现在支持两种形态：
  - `standard_icon`（图标字体，含 `color`）
  - `custom_icon`（`img_key` → `<img>`）
  
  未显式给 `size` 时图标跟随文本字号（`small`→12px、`normal`→14px、`heading`→16px），避免回落到固定 16px 与文字不搭。

## 0.3.1

### Patch Changes

- 001c79c: 修复 `overflow` 未注册与 `interactive_container` 边框语义。
  
  - **`overflow`（折叠按钮组）此前未注册**，`renderElement` 遇到它会返回 `null`，整块在预览里凭空消失而真机正常显示。现渲染为「…」图标触发器：静态预览只画触发器，interactive 模式用原生 `<details>` 做纯 CSS 下拉，选项文案与 `multi_url` 跳转都正确输出。
  - **`border_color` 在 `has_border: false` 时仍会画边框**，与官方语义（仅 `has_border: true` 时生效）不符。现在未显式开启 `has_border` 时不再输出边框。

## 0.3.0

### Minor Changes

- 13fdd01: `interactive_container` 支持布局字段，预览与真机对齐。
  
  此前渲染器只读 `vertical_spacing`，完全忽略 `direction` / `horizontal_align` / `vertical_align` / `horizontal_spacing`，容器内子组件一律退化为「左上贴边、固定 4px 行距」——components 包补上这些字段后，预览仍然画不对。
  
  现在：
  - `direction: "horizontal"` → `flex-direction: row`（缺省为 column）
  - 两个 align 按主轴映射：`direction=vertical` 时 `vertical_align→justify-content`、`horizontal_align→align-items`；`direction=horizontal` 时两者交换
  - `horizontal_spacing→column-gap`、`vertical_spacing→row-gap`，均与 direction 无关
  - 未写这些字段时不输出对应样式，沿用原 CSS 默认值

## 0.2.27

### Patch Changes

- 默认按钮按真机撑满整行，不再强制按内容收缩；纯文字按钮文字靠左。

## 0.2.26

### Patch Changes

- 从 Schema 2.0 工具链移除 JSON 1.0 的 `action` / `note`；渲染器支持交互表单预览（`interactive`）
- Updated dependencies
  - @open-feishu-card/adapter@0.3.17

## 0.2.25

### Patch Changes

- Updated dependencies
  - @open-feishu-card/adapter@0.3.16

## 0.2.24

### Patch Changes

- Updated dependencies
  - @open-feishu-card/adapter@0.3.15

## 0.2.23

### Patch Changes

- Updated dependencies
  - @open-feishu-card/adapter@0.3.14

## 0.2.22

### Patch Changes

- Updated dependencies
  - @open-feishu-card/adapter@0.3.13

## 0.2.21

### Patch Changes

- `video`、`button` 应用 `margin`（含水平外边距时 `width: calc(100% - L - R)`），修复与真机左右间距不一致。

## 0.2.20

### Patch Changes

- 正文 `<font color='white'>` / `textStyle.color=white` 映射到 `N00`（对齐引擎 static-white），修复紫底等深色容器上白字被当成默认深色渲染的问题；顺带补齐 `black → N800`。

## 0.2.19

### Patch Changes

- `img` 应用 `margin`（含水平外边距时 `width: calc(100% - L - R)`），修复正文图左右贴边、与真机不一致。

## 0.2.18

### Patch Changes

- 去掉 `interactive_container` CSS 默认 `border-radius: 6px`；未声明或空 `corner_radius` 时不输出圆角，对齐飞书真机。

## 0.2.17

### Patch Changes

- 新增 `avatar`、`collapse_divider`、`fallback_text` 渲染
- 日期/人员选择器（`date_picker`、`picker_time`、`picker_datetime`、`select_person`、`multi_select_person`）静态预览框
- Updated dependencies
  - @open-feishu-card/adapter@0.3.12

## 0.2.16

### Patch Changes

- `collapsible_panel` 折叠标题色对齐真机 `--text-caption`（`var(--N600)`），不再用正文近黑 `#1f2329`

## 0.2.15

### Patch Changes

- 对齐真机：`img.size`（`Wpx Hpx`）定宽高；`interactive_container` 应用宽高与外边距；`collapsible_panel` 支持 `icon_position: follow_text`、未指定时不描边、应用 margin
- 水平外边距与 `body > * { width:100% }` 冲突时改为 `calc(100% - L - R)`，避免块相对卡片边框左右不对称
- Updated dependencies
  - @open-feishu-card/adapter@0.3.11

## 0.2.14

### Patch Changes

- `collapsible_panel` 优先读取 `customBackgroundStyle`（cus-* 经 dslToRaw 展开），修复折叠面板自定义背景色不显示
- Updated dependencies
  - @open-feishu-card/adapter@0.3.10

## 0.2.13

### Patch Changes

- root 默认 `border: 1px solid var(--N300)` 对齐飞书网页版 `--line-border-card`；独立渲染器无消息气泡外包层时在 root 绘制边框

## 0.2.12

### Patch Changes

- body padding 显式 0 覆盖 CSS 默认白边；interactive_container verticalSpacing 与仅可点击时 pointer/hover；去掉 root 默认边框；customBorderColor / cornerRadiusValue / markdown margin 对齐真机
- Updated dependencies
  - @open-feishu-card/adapter@0.3.8

## 0.2.11

### Patch Changes

- Updated dependencies
  - @open-feishu-card/adapter@0.3.6

## 0.2.10

### Patch Changes

- Updated dependencies
  - @open-feishu-card/adapter@0.3.5

## 0.2.9

### Patch Changes

- Updated dependencies
  - @open-feishu-card/adapter@0.3.4

## 0.2.8

### Patch Changes

- RAW 自定义颜色：`customBackgroundStyle` / `textStyle.customColor` 投影与渲染；`rawToDsl` 输出自动 `normalizeStoredCardColors`。
- Updated dependencies
  - @open-feishu-card/adapter@0.3.3

## 0.2.7

### Patch Changes

- Updated dependencies
  - @open-feishu-card/adapter@0.3.2

## 0.2.6

### Patch Changes

- header title/subtitle 支持 lark_md：RAW 的 originTag:lark_md 投影为公开 `{ tag:'lark_md', content }`，回写时解析成 markdown 元素树，渲染器画出 @ 提及而不是字面 `<at>`。
- Updated dependencies
  - @open-feishu-card/adapter@0.3.1

## 0.2.5

### Patch Changes

- 对齐真机：`column_set` 有背景时加 4px 内边距与 6px 圆角；`column` 有背景时只加圆角。

## 0.2.4

### Patch Changes

- 修复 `column_set` 的 `background_style: grey` 未渲染：对齐真机写入 `var(--bg-float-overlay)`（light 主题为 N50）。

## 0.2.3

### Patch Changes

- 重新生成内嵌 `BASE_STYLES_CSS`，使 SSR / 运行时注入的样式与 `styles.css` 一致。

## 0.2.2

### Patch Changes

- Updated dependencies
  - @open-feishu-card/adapter@0.3.0

## 0.2.1

### Patch Changes

- Updated dependencies
  - @open-feishu-card/adapter@0.2.1

## 0.2.0

### Minor Changes

- 对齐上游 open-feishu-card@0.14.5：新增 audio/video 渲染与音频水合，markdown 内嵌 `<audio>`，以及 `mergeMentionsIntoPersons` / 命名色 CSS 变量等。

### Patch Changes

- Updated dependencies
  - @open-feishu-card/adapter@0.2.0

## 0.1.1

### Patch Changes

- 首次正式发布：补齐构建产物与包内容（替换 npm 上的空占位 0.1.0）。
- Updated dependencies
  - @open-feishu-card/adapter@0.1.1
