# `@open-feishu-card/check`

一条命令回答「这张卡能不能发」：把 `parser` / `schema` / `validator` / `linter` 串成一次检查，
再补上**Schema 表达不了、但飞书会整卡拒绝**的真机硬约束，返回带 JSON Pointer 的问题清单。

上游其它包各管一段：`validator` 给字符级诊断、`linter` 给最佳实践、`compiler` 净化/编译。
这里负责把它们拼成「发送前的那道门」，并且是**唯一**拼法——CLI、LSP、卡片工作台、Agent
都用同一份判定，不会各写一套「谁算 error」。

## 安装

```bash
pnpm add @open-feishu-card/check
```

## 用法

```ts
import { checkCard } from '@open-feishu-card/check'

const result = checkCard(dsl) // 对象，或 JSON / JSONC 源码字符串
if (result.errors.length > 0) {
  for (const issue of result.errors) {
    console.error(`${issue.path}: ${issue.message}`) // 路径是 JSON Pointer，可直接拿去 patch
  }
  return
}
await sendMessage(result.card!) // 无错时才是 Schema 净化后的可发送卡片
```

「能过 Schema 却发不出去」的卡，先看能不能自动修：

```ts
const { card, fixes, errors } = checkCard(dsl, { fix: true })
// fixes: [{ path: '/body/vertical_spacing', code: 'spacing-domain', ... }]
```

`fix` 是**有损**的（删字段 / 夹到合法域），默认关闭；改了什么逐条返回，不会静默改卡。

## 返回结构

| 字段 | 说明 |
| --- | --- |
| `errors` | 会拦发送的问题。有值时 `card` 为 `undefined` |
| `hints` | 不拦发送、但值得提示：validator 的 warning 及以下 + linter 全部规则 |
| `fixes` | `fix: true` 时本轮实际改动的条目 |
| `card` | 无 `errors` 时的卡片（`FeishuCardV2Schema.parse` 输出，可直接发 `im/v1/messages`） |

每条问题形如 `{ path, message, severity, source, code? }`，`source` 取
`schema` / `validator` / `linter` / `device`，`path` 是 JSON Pointer（`/body/elements/0/...`）。

## 真机硬约束

这些约束 `FeishuCardV2Schema` 全部放行，飞书却会整卡拒绝（`11310 xxx invalid`）或静默丢样式。
依据是实测结论（仓库 `docs/feishu-card-doc-gaps/`），修复与检查共用同一份实现：

| `code` | 规则 | 修复方式 |
| --- | --- | --- |
| `spacing-domain` | `horizontal_spacing` / `vertical_spacing` 只收 `small` / `medium` / `large` / `extra_large`、`0–99px`、空串（等同没设置）；`default` / `auto` / 裸数字 / `>=100px` 会被拒。**唯一例外**：`column_set.horizontal_spacing` 收 `default` / `auto` | 归一化格式，非法值删字段 |
| `panel-header-padding` | `collapsible_panel.header.padding` 只收 `0–28px` | 夹到 28px；不是 px 就删字段 |
| `media-duration` | `audio` / `video` 不能写 `duration` / `duration_ms`（时长在上传时确定） | 删字段 |
| `media-enable-forward` | 含音视频时必须 `config.enable_forward = false` | 置为 `false` |
| `panel-border-field` | `collapsible_panel` 写了 `interactive_container` 的边框字段（`has_border` 等），Schema 会静默剥离 | 只提示（删了等于丢样式） |
| `corner-radius-domain` | `corner_radius`（`img` / `img_combination` / `interactive_container` / `audio.border` / `collapsible_panel.border`）只收**单个** px 或百分比值，不支持 CSS 四角简写（如 `8px 0 0 8px`） | 四角全等的简写折叠为单值；各角不同只报错（没有唯一正确解） |

只想修不想检查时：

```ts
import { repairDeviceIssues, findDeviceIssues } from '@open-feishu-card/check'

const { card, issues, fixes } = repairDeviceIssues(dsl) // 不修改入参
const problems = findDeviceIssues(dsl)                  // 只拿问题
```

## 约定

- **只接受卡片本身**：搭建工具文档（`{ name, dsl, variables }`）请先用
  `@open-feishu-card/parser` 的 `unwrapCardData()` 取出 `dsl`，否则抛 `TypeError`。
- **linter 的问题没有 `path`**：它检查的是结构（嵌套深度、元素数），路径固定 `/`，规则名在 `code`。
- **枚举类报错会截断**：图标 token 有 1167 个，`errors[].message` 只保留前 6 个取值 +
  `… (1167 options)`（完整列表见 `@open-feishu-card/schema` 的 `ICON_TOKENS`），避免一条
  诊断把模型上下文撑爆。
- **`fix` 不碰产品规则**：emoji 列表符号、品牌色可读性这类「口味」不在本包，放在各自的卡片产品里。
