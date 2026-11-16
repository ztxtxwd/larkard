# `@open-feishu-card/patch`

卡片 DSL 的 **RFC 6902 JSON Patch**：操作形状校验 + 不可变应用 + 能直接读的报错。
和 [`@open-feishu-card/check`](../check) 配套，组成编辑器/Agent 的最小闭环：**patch → check → 发送**。

## 为什么不用 `fast-json-patch`

- **零依赖**，ESM / CJS 都是干净具名导出（不用 `default` interop 兜底）；
- **报错能定位**：每条错误带 0-based 操作序号、出错 JSON Pointer 和原因，可以直接回给模型或用户；
  库内部的 `OPERATION_PATH_UNRESOLVABLE` 对它们没有意义；
- **失败不改文档**：在 `structuredClone` 出来的副本上应用，中途任何一步失败都抛错，
  调用方手里的底稿保持原样（模型重试不会拿到半截卡片）。

## 安装

```bash
pnpm add @open-feishu-card/patch
```

## 用法

```ts
import { parsePatch, applyPatch, PatchError } from '@open-feishu-card/patch'

// 模型常把操作数组当字符串塞进工具参数，parsePatch 两种都收
const ops = parsePatch(params.json_patch)

try {
  const next = applyPatch(dsl, ops)   // 入参 dsl 不会被修改
  const { card, errors } = checkCard(next)
  if (errors.length === 0) await send(card!)
} catch (error) {
  if (error instanceof PatchError) {
    // 第 2 个操作（replace /body/elements/9/content）：数组下标越界：/body/elements/9（长度 2）
    console.error(error.message)
    console.error(error.code, error.index, error.path)   // 'index-invalid' 1 '/body/elements/9/content'
  }
}
```

## API

| 导出 | 说明 |
| --- | --- |
| `parsePatch(input, { allowEmpty? })` | 接受操作数组或其 JSON 字符串；校验 `op` / `path` / `value` / `from` 的形状与 JSON Pointer 语法 |
| `applyPatch(doc, ops)` | 应用全部六种操作（`add` / `remove` / `replace` / `move` / `copy` / `test`），返回新文档 |
| `pointerTokens(pointer)` | JSON Pointer → token 数组（`~1` → `/`、`~0` → `~`） |
| `PatchError` | `{ code, index, path, operation, message }`，`message` 已是人话 |

`code` 取值：`invalid-patch` / `invalid-operation` / `invalid-path` / `parent-not-found` /
`path-not-found` / `index-invalid` / `test-failed` / `empty-patch`。

## 几个刻意的取舍

- **空补丁默认报错**（`allowEmpty: false`）。RFC 允许空补丁（无操作），但「模型/用户提交修改」
  时给空数组几乎总是漏了内容，静默无操作比报错更难查；要 RFC 语义就显式传 `allowEmpty: true`。
- **`path: ""` 表示整份文档**：`add` / `replace` / `test` / `move` / `copy` 都按「换成新值」处理，
  但 `remove` 整份文档直接拒绝——删掉根节点之后没有任何卡片可发。
- **`-` 只在 `add` 里合法**（追加到数组末尾）；`replace` / `remove` 用 `-` 会报 `index-invalid`。
- **`move` 拒绝把节点移进自己的子节点**（RFC 的 `from` 前缀限制），报 `invalid-path`。
- **数组越界报 `index-invalid` 并带长度**，比笼统的「路径不存在」更好定位。
