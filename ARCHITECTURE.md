# 架构

`larkard` 是**一个 npm 包、多个显式入口**。仓库里只有 `packages/larkard` 一个库，外加 VS Code 插件和 benchmark 两个应用。

## 为什么是单包多入口

包的边界应该由发布边界决定。这个工具链里的 parser / validator / linter / check / compiler / adapter / renderer 永远一起演进，拆成多个 npm 包只会带来版本错配、重复依赖和多份安装。用一个包 + subpath exports：

- 消费者只装一个 `larkard`，不会出现 `schema@0.6` 与 `core@0.1` 互相不兼容；
- 发布只有一套 version / changelog / tag；
- 运行时边界仍由入口保证：SSR 根入口不会引入 DOM / 图标字体 / emoji CSS，浏览器能力走 `larkard/renderer/browser`。

代价是安装体积变大（渲染资源、schema 类型都在包里），但 tarball 约 2MB，且运行时按入口加载，可以接受。

## 入口图

```
larkard                     ← core：parse / validate / lint / check / compile
├── larkard/schema          ← Zod Schema + 类型 + tag 清单
├── larkard/icons           ← 图标 token / 分类 / 字体码点
├── larkard/emoji           ← emoji token / 雪碧图映射
├── larkard/metrics         ← 字号 / 行高 / heading / 字宽
├── larkard/spacing         ← 横向 / 纵向间距
├── larkard/adapter         ← RAW ↔ DSL + RAW 类型 + Markdown tokenizer
│   └── larkard/renderer    ← SSR HTML
│       ├── /browser        ← DOM 渲染 + 水合 + toast
│       ├── /assets         ← ALL_CSS / 图标字体 / emoji / 布局 CSS
│       └── /async          ← access token 拉图 / 拉消息
├── larkard/components      ← TSX 组件
│   └── larkard/jsx-runtime
├── larkard/optimize        ← 分栏等高 / 富文本升级
├── larkard/palette         ← 图片取色 / 任意卡片换色 / 官方色物化
│   └── /browser            ← File/URL → RGBA 像素
├── larkard/patch           ← RFC 6902
├── larkard/state           ← 卡片内嵌 state
├── larkard/language-server ← LSP 核心（server 为 bin）
└── larkard/cli             ← CLI run()
```

依赖方向只能向下。根入口 `src/core` 不依赖 `src/renderer`；`src/renderer` 不依赖 `src/core`。需要共享的客户端事实放 `src/content`。

## 内部模块

| 模块 | 职责 | 规则 |
| --- | --- | --- |
| `src/content` | 图标 / emoji 数据、字号行高、间距枚举 | 零依赖；官方校验数据与客户端渲染数据的差异用显式清单表达 |
| `src/schema` | Zod Schema 2.0、类型、`CARD_ELEMENT_TAGS` | 校验真源；tag 清单有源码一致性测试 |
| `src/core` | 解析、校验、lint、`checkCard` / `checkSource`、device 规则、sanitize / compile | CLI / LSP / 下游不得再自己 `parse → validate → lint` |
| `src/adapter` | RAW ↔ DSL、RAW 类型、Markdown tokenizer | 双向无损；不做“修美”颜色 |
| `src/renderer` | RAW / DSL → HTML / DOM | 根入口 DOM-free；浏览器专属代码在 `browser.ts` / `dom.ts` |
| `src/components` | TSX → DSL | props 白名单；输出必须过 schema 契约测试 |
| `src/optimize` | 发送前视觉优化 | 不依赖 renderer，真机常量从 content 取 |
| `src/palette` | 图片取色、色板合成、官方色物化 / 枚举回写 | 纯函数；DOM 解码只在 `palette/browser.ts`；官方色从 content 取 |
| `src/cli.ts` / `src/language-server` | 工具入口 | 只消费 core 公共 API |

## 设计约束

**同一事实只有一个真源。** 真机字号、行高、间距、图标、emoji 在 `content`；RAW 类型与 Markdown 字符串解析在 `adapter`；Schema 在 `schema`。其它模块只能消费，不能复制。

**公共 API 面向任务。** 用户想的是“检查这张卡能不能发”“编译成 RAW”“渲染出来”。所以根入口是 `checkCard` / `checkSource` / `compile` / `sanitize`，不是按 parser / validator / linter 分阶段暴露。

**运行时入口显式化。** 根入口不引入 DOM、图标字体 base64、emoji 雪碧 CSS。浏览器渲染、资源、飞书 API 分别在 `/browser`、`/assets`、`/async`。

**检查与修复共用判断。** `device.ts` 的修复函数是唯一实现，`checkCard` / `checkSource` 在克隆上跑它来发现问题，避免“检查一套、修复一套”漂移。

**契约测试兜底。** components 输出喂给 `FeishuCardV2Schema`；图标字体 CSS / emoji 雪碧 CSS 与 content 数据做一致性校验；tag 清单与 schema 源码做一致性校验。

## 新增功能放哪

| 功能 | 放置 |
| --- | --- |
| 新组件 / 新字段的校验 | `src/schema` |
| 新真机硬约束 | `src/core/device.ts` |
| 新最佳实践规则 | `src/core/linter.ts` |
| 新 RAW ↔ DSL 映射 | `src/adapter` |
| 新图标 / emoji / 字号 / 间距 | `src/content` |
| 新渲染组件 | `src/renderer/components.ts` |
| 图片取色 / 换色 / 官方色映射 | `src/palette` |
| 浏览器交互 | `src/renderer/browser.ts` / `dom.ts` |
| 编辑器能力 | `src/language-server` |
| 终端能力 | `src/cli.ts` |
| 新的公开入口 | `src/<module>/index.ts` + `package.json` exports + `tsup.config.ts` entries |

## 发版

- 单包 `larkard`，changesets 管理；内部不需要 `workspace:*`。
- 推 `main` 后 `publish.yml` 在同一轮完成 version + publish。
- VS Code 扩展不在 changesets 管理内，单独 bump + tag。
