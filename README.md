# open-feishu-card

飞书卡片（Feishu/Lark Card Schema 2.0）全栈现代开发工具链，基于 **pnpm workspace + Turborepo** 构建，覆盖从底层解析、类型校验、双向适配、编译净化，到 DOM 实时渲染、LSP 语言服务以及 VS Code 插件的完整生命周期。

## 包矩阵

| 包 | 职责 | 环境 |
| --- | --- | --- |
| `@open-feishu-card/parser` | JSON/JSONC 解析器，生成带位置信息（Line/Column/Range）的 AST | Universal |
| `@open-feishu-card/schema` | 基于 Zod 的卡片 Schema 2.0 规范与类型导出 | Universal |
| `@open-feishu-card/validator` | AST × Schema 对比，输出字符级精确定位诊断 | Universal |
| `@open-feishu-card/linter` | 嵌套深度、可读性、废弃属性等静态最佳实践检查 | Universal |
| `@open-feishu-card/check` | 发送前检查门面：Schema + 定位诊断 + 最佳实践 + 真机硬约束，可选自动修复 | Universal |
| `@open-feishu-card/patch` | 卡片 DSL 的 RFC 6902 JSON Patch：操作校验、不可变应用、带操作序号的定位报错 | Universal |
| `@open-feishu-card/adapter` | 公开 DSL ↔ 飞书内部 RAW JSON 双向适配（raw→DSL 对齐 feishu-raw-card-to-dsl） | Universal |
| `@open-feishu-card/compiler` | DSL → 标准 RAW 编译器 + 非标属性净化器 (Sanitizer) | Universal |
| `@open-feishu-card/components` | 轻量 JSX 运行时：用 TSX 声明卡片，序列化为 JSON 2.0 | Universal |
| `@open-feishu-card/renderer` | 零框架依赖渲染引擎：HTML 字符串 / 真实 DOM / SSR | Browser / Node |
| `@open-feishu-card/language-server` | LSP 语言服务器：诊断、补全、Hover、Quick Fix | Node / WebWorker |
| `@open-feishu-card/cli` | 终端工具：`lint` / `validate` / `clean` / `format` / `build` | Node CLI |
| `lark-card-preview` | VS Code 插件（显示名 Open Feishu Card，Marketplace：`TianxiongZhao.lark-card-preview`）：LSP + Webview 预览 | VS Code |
| `@open-feishu-card/benchmark` | 大模型飞书卡片生成能力评测：客观题 + 主观题（工具链自动判分） | Node CLI |

## 快速开始

```bash
pnpm install
pnpm build   # turbo 全量构建（依赖拓扑序）
pnpm test    # 全部包测试
```

## 使用示例

**检查一张卡能不能发（check）**

```typescript
import { checkCard } from '@open-feishu-card/check';

const { card, errors, hints } = checkCard(dsl); // 对象或 JSON / JSONC 源码
if (errors.length > 0) throw new Error(errors.map((e) => `${e.path}: ${e.message}`).join('\n'));
await sendMessage(card!); // 无错时才是可发送的净化卡片
```

除了 Schema 与最佳实践，它还会拦下 Schema 放行、飞书却整卡拒绝的真机约束
（间距值域、面板内边距上限、音视频字段等），`{ fix: true }` 可自动修并逐条回报 `fixes`。

**增量改卡（patch）**

```typescript
import { parsePatch, applyPatch } from '@open-feishu-card/patch';

const next = applyPatch(dsl, parsePatch(params.json_patch)); // 入参不动
const { card, errors } = checkCard(next); // 改完先校验再发
```

**净化非标属性（compiler）**

```typescript
import { sanitize } from '@open-feishu-card/compiler';

const { card, stripped } = sanitize(rawInput, { mode: 'strip' });
// stripped = ['/body/elements/0/extra_invalid_prop']
```

**CLI**

```bash
npx @open-feishu-card/cli lint my-card.json      # Schema + 最佳实践校验
npx @open-feishu-card/cli clean my-card.json --out clean-card.json
npx @open-feishu-card/cli build my-card.json --out raw.json   # 编译为渲染器 RAW
```

**用 TSX 写卡片（components）**

`tsconfig.json` 中设置 `"jsx": "react-jsx"`、`"jsxImportSource": "@open-feishu-card/components"`。

```tsx
import { Button, Card, Header, bindAction, registerAction, renderToCard } from '@open-feishu-card/components';

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
// card.body.elements[0].value.__action_id === 'approval.approve'
```

**渲染（renderer）**

```typescript
import { renderDslToString, renderDsl } from '@open-feishu-card/renderer';
// DSL 直接渲染（内置 DSL→RAW 适配）
const html = renderDslToString({ schema: '2.0', body: { elements: [...] } });
```

**双向适配（adapter）**

```typescript
import { dslToRaw, rawToDsl, degradeUnknown } from '@open-feishu-card/adapter';
const raw = dslToRaw(dsl);          // 公开 DSL → 渲染器 RAW
const back = rawToDsl(rawEnvelope); // 飞书下发 RAW envelope → 公开 DSL（对齐 feishu-raw-card-to-dsl）
// 可选：对私有/未知元素手动降级为 { tag:'unknown', raw_tag, fallback }
// const safe = degradeUnknown(el);
```

## 架构数据流

```
TSX ─ components.renderToCard ─ DSL 对象
源码 JSONC ─ parser(AST+位置) ─ validator(schema 诊断) ┐
                         └───── linter(规则诊断)        ├─ language-server ─ vscode 插件
DSL 对象 ─ compiler.sanitize(净化) ─ adapter.dslToRaw ─ renderer(DOM/HTML/SSR)
飞书 RAW envelope ─ adapter.rawToDsl ─ DSL
```
