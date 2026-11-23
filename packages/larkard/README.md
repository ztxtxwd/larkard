# larkard

飞书卡片（Feishu/Lark Card JSON 2.0）工具链：解析、校验、发送前检查、RAW ↔ DSL、渲染、TSX 创作、CLI 与 LSP。

一个包，多个运行时入口。主入口是卡片模型层；渲染、资源、浏览器水合、飞书 API 等能力通过子路径按需引入。

```bash
npm i larkard
```

## 入口

| 入口 | 内容 | 运行时 |
| --- | --- | --- |
| `larkard` | 解析、Schema 校验、lint、`checkCard` / `checkSource`、`sanitize` / `compile` | Universal |
| `larkard/schema` | Zod Schema 2.0、类型、`CARD_ELEMENT_TAGS` | Universal |
| `larkard/icons` | 官方图标 token / 分类目录 / 客户端字体码点 | Universal |
| `larkard/emoji` | 官方 emoji token / 客户端短码映射 | Universal |
| `larkard/metrics` | 字号枚举、行高表、heading 样式、字宽度量 | Universal |
| `larkard/spacing` | 横向 / 纵向间距枚举与解析 | Universal |
| `larkard/adapter` | RAW ↔ DSL、RAW 类型、Markdown tokenizer | Universal |
| `larkard/renderer` | RAW / DSL → HTML 字符串（SSR / 截图） | Node |
| `larkard/renderer/browser` | DOM 渲染 + 音频 / 图表 / 表格水合 + toast | Browser |
| `larkard/renderer/assets` | `ALL_CSS` / 图标字体 / emoji / 布局 CSS | 任意 |
| `larkard/renderer/async` | 按 access token 拉图 / 按 message_id 拉消息 | Node / Browser |
| `larkard/components` | TSX → 卡片 JSON | Universal |
| `larkard/jsx-runtime` | JSX 运行时（`jsxImportSource`） | Universal |
| `larkard/optimize` | 分栏等高、纯文本升级富文本 | Universal |
| `larkard/palette` | 图片取色、任意卡片换色、官方色物化 / 枚举回写 | Universal |
| `larkard/palette/browser` | File / URL → RGBA 像素（`createImageBitmap` + Canvas） | Browser |
| `larkard/patch` | RFC 6902 JSON Patch | Universal |
| `larkard/state` | 把卡片 state 封印进空分栏 URL | Node |
| `larkard/program` | 卡片程序协议：编译、渲染、动作、模拟器 | Universal |
| `larkard/program/runtime` | 卡片程序宿主：发卡、回调、状态封印与实例存储 | Node |
| `larkard/program/preview` | 卡片程序多用户预览：共享一张卡、创建 / 切换虚拟用户 | Universal |
| `larkard/program/preview/browser` | 浏览器预览宿主：DOM 点击回传、toast、虚拟用户工具条 | Browser |
| `larkard/language-server` | LSP 核心（stdio 服务器为 `larkard-language-server` bin） | Node / WebWorker |
| `larkard/cli` | CLI 的 `run(argv)` | Node |

CLI bin：`larkard`；LSP bin：`larkard-language-server`。

## 图片换色

`larkard/palette` 把图片调色板套到任意卡片上。算法是确定性的：不调用模型、不用随机数，
同一张图 + 同一张卡输出一致。

```ts
import { recolorCardWithImage } from 'larkard/palette';
import { recolorCardFromFile } from 'larkard/palette/browser';

// 已有 RGBA 像素（Node 可用 sharp 解码）
const { card, changed, warnings } = recolorCardWithImage(dsl, { data, width, height });

// 浏览器里直接选文件
const result = await recolorCardFromFile(dsl, file);
```

它做三件事：

1. **物化**：把支持自定义色、但写的是官方枚举/字面量的字段改成 `config.style.color` 的 cus-* token；
2. **合成**：按图片色板保留原卡明暗关系，修复文字对比度，输出 light/dark；
3. **枚举回写**：icon / text_tag / header.template 等只能走官方枚举的字段，挑最接近的枚举；
   非 danger、非 form 按钮转成可自定义底色的 `interactive_container`。

## 发送前检查

```ts
import { checkCard } from 'larkard';

const { card, errors, hints } = checkCard(dsl); // 对象，或 JSON / JSONC 源码
if (errors.length > 0) {
  for (const issue of errors) console.error(`${issue.path}: ${issue.message}`);
  process.exit(1);
}
await sendMessage(card!); // 无 errors 时才是可发送的净化卡片
```

检查覆盖 Schema、最佳实践，以及 Schema 表达不了、但飞书会整卡拒绝的真机硬约束（间距值域、面板内边距、音视频字段等）。`{ fix: true }` 会先修复可机械修复的问题，并逐条返回 `fixes`。

需要带行列号的诊断（CLI / LSP / 编辑器）：

```ts
import { checkSource } from 'larkard';

const { diagnostics, errors, card } = checkSource(source);
for (const d of diagnostics) {
  console.log(`${d.range?.start.line}:${d.range?.start.column} ${d.severity} ${d.message}`);
}
```

## 编译与净化

```ts
import { compile, sanitize } from 'larkard';

const { raw } = compile(dsl);              // DSL → 渲染器 RAW
const { card, stripped } = sanitize(input, { mode: 'strip' });
```

## 渲染

```ts
// Node / SSR / 截图
import { renderDslToString } from 'larkard/renderer';
const html = renderDslToString(dsl);

// 浏览器
import { renderDsl } from 'larkard/renderer/browser';
const node = renderDsl(dsl);

// 页面级样式（SSR 自行注入）
import { feishuCardStyleTag } from 'larkard/renderer/assets';
const page = `<html><head>${feishuCardStyleTag()}</head><body>${html}</body></html>`;

// 按 access token 拉图 / 拉消息
import { renderCardToStringAsync } from 'larkard/renderer/async';
```

CSS 文件子路径：`larkard/renderer/styles.css`、`icon-font.css`、`emoji.css`、`all.css`。

## 双向适配

```ts
import { dslToRaw, rawToDsl, degradeUnknown } from 'larkard/adapter';

const raw = dslToRaw(dsl);
const back = rawToDsl(rawEnvelope);
const safe = degradeUnknown(element);
```

## TSX 创作

`tsconfig.json`：

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "larkard"
  }
}
```

```tsx
import { Button, Card, Header, bindAction, registerAction, renderToCard } from 'larkard/components';

function approve(requestId: string) {
  return { requestId };
}
registerAction('approval.approve', approve);

const card = renderToCard(
  <Card headerTheme="blue" config={{ update_multi: true }}>
    <Header title="费用审批" />
    <Button type="primary" action={bindAction(approve, 'REQ-42')}>同意</Button>
  </Card>,
);
```

## 增量修改 / 卡片内嵌 state

```ts
import { parsePatch, applyPatch } from 'larkard/patch';
import { sealCardState, readCardState } from 'larkard/state';

const next = applyPatch(dsl, parsePatch(params.json_patch));
const { card, errors } = checkCard(next);
```

## 卡片程序

`larkard/program` 是「卡片即程序」协议的通用解释器：卡片文档在 JSON 2.0 上增加
`$state` / `$actions`，渲染时展开 `{{ }}`、`$if` / `$for`，点击时执行动作。

```ts
import { compileProgram, createSimulator, renderProgram } from 'larkard/program';
import { composeCard } from 'larkard/program/runtime';

const { program, diagnostics } = compileProgram(doc);
if (!program) throw new Error(diagnostics.map((d) => `${d.path}: ${d.message}`).join('\n'));

const { card } = renderProgram(program, program.initialState, { rev: 0 });
const sealed = composeCard(card, doc, { rev: 0, state: program.initialState });
```

宿主要处理点击时用 `larkard/program/runtime` 的 `CardRuntime`：

- `handleCallback()` 返回飞书回调响应（toast + 新卡），原样交给长连接 / Webhook；
- 不是本协议的卡片返回 `undefined`，宿主应继续其它卡片处理；
- bot 这类可能不在消息所在会话里的宿主请配置 `store`（按 `message_id` 持久化程序和状态），
  冷启动就不用依赖平台读回。

协议见 [`docs/program-protocol.md`](../../docs/program-protocol.md)，平台事实与接入边界见
[`docs/program-runtime.md`](../../docs/program-runtime.md)。

### 本地多用户预览

`larkard/program/preview` 在内存里跑一张**共享卡**：所有虚拟用户看到同一份状态，
切换身份只影响后续点击里的 `$user`，不会为每个人分叉出另一张卡。状态不落盘。

```ts
import { createProgramPreview } from 'larkard/program/preview';
import { mountProgramPreview, mountPreviewUserBar } from 'larkard/program/preview/browser';

// 无 DOM：适合测试 / 自定义 UI
const preview = createProgramPreview(doc, {
  users: [{ name: '阿明' }, { name: '小林' }],
});
preview.click('报名参与');                 // 阿明点击
preview.selectUser(preview.users[1]!.open_id);
preview.click('报名参与');                 // 小林点击，同一张卡
preview.addUser({ name: '小陈' }, { select: true });
preview.reset();                           // 回到初始状态，保留用户

// 浏览器：渲染一张卡 + 绑定点击 / 表单 / 下拉 / 勾选
const mounted = mountProgramPreview(document.querySelector('#card')!, doc, {
  users: [{ name: '阿明' }, { name: '小林' }],
});
mountPreviewUserBar(document.querySelector('#toolbar')!, mounted.preview);
```

- `createVirtualUser()` 会补全随机 `open_id` / `user_id` / `union_id` 和首字头像；
  虚拟用户会自动进入 `persons` 表，`person_list` / `at()` 直接显示姓名和头像。
- 预览里的动作仍然是声明式的 `$state` / `$actions`，不会发网络请求；
  toast 用 `larkard/renderer/browser` 的 `createToastHost` 显示。
- `mountProgramPreview({ decorate })` 可在每次重绘后做图表水合、彩色图标替换等后处理。
- 程序卡渲染结果（公开 DSL）会先经过 `dslToRaw` 再交给渲染器，和画布 / 导出同一条路径。

## CLI

```bash
larkard check <file...>        # Schema + 真机硬约束 + 最佳实践
larkard check <file> --fix     # 先修复再检查
larkard validate <file...>     # 仅 Schema
larkard lint <file...>         # Schema + 最佳实践
larkard compile <file> --out raw.json
larkard sanitize <file> --out clean.json
larkard format <file>
```

## LSP

```bash
larkard-language-server
```

诊断来自 `checkSource`，包含 Schema、最佳实践与真机硬约束；组件补全来自 `larkard/schema` 的 `CARD_ELEMENT_TAGS`。

## 设计约束

- **包边界按运行时 / 发布边界切**：一个包，多个显式子路径；根入口不引入 DOM、图标字体或 emoji 雪碧。
- **同一事实只有一个真源**：图标 / emoji / 字号行高 / 间距在内部 `content` 模块，公开为 `larkard/icons`、`larkard/emoji`、`larkard/metrics`、`larkard/spacing`；RAW 类型与 Markdown tokenizer 在内部 `adapter` 模块。
- **任务型 API**：CLI / LSP / 下游统一走 `checkCard` / `checkSource`，不各自 `parse → validate → lint`。
- **契约测试**：components 的输出直接喂给 `FeishuCardV2Schema`；图标字体 / emoji CSS 与数据做一致性校验。

## 从 `@open-feishu-card/*` 迁移

| 旧包 | 新入口 |
| --- | --- |
| `@open-feishu-card/parser` | `larkard`（`parse` / `resolveCardDocument` / `serializeCardDocument`） |
| `@open-feishu-card/validator` | `larkard`（`validate` / `validateAst` / `validateData`） |
| `@open-feishu-card/linter` | `larkard`（`lint` / `lintAst`） |
| `@open-feishu-card/check` | `larkard`（`checkCard` / `checkSource` / `repairDeviceIssues`） |
| `@open-feishu-card/compiler` | `larkard`（`sanitize` / `compile`） |
| `@open-feishu-card/patch` | `larkard/patch` |
| `@open-feishu-card/store` | `larkard/state` |
| `@lark-interactive/core` | `larkard/program` |
| `@lark-interactive/runtime` | `larkard/program/runtime` |
| `@open-feishu-card/schema` | `larkard/schema` |
| `@open-feishu-card/schema/icon-catalog` | `larkard/icons`（`ICON_CATALOG` / `ICON_TOKENS`） |
| `@open-feishu-card/adapter` | `larkard/adapter` |
| `@open-feishu-card/renderer` | `larkard/renderer`；浏览器 / 资源 / 异步用 `/browser`、`/assets`、`/async` |
| `@open-feishu-card/components` | `larkard/components`；JSX 运行时用 `larkard/jsx-runtime` |
| `@open-feishu-card/optimize` | `larkard/optimize`；字号行高常量用 `larkard/metrics` |

## License

MIT。Lark / 飞书是字节跳动的商标；本项目是社区工具链，与官方无隶属关系。
