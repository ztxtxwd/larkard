# @open-feishu-card/validator

## 0.1.16

### Patch Changes

- f1b95bc: 枚举类报错不再把整份取值列表塞进一条诊断。
  
  图标 token 有 1167 个，写错一个 token 时 Zod 会把整份枚举拼进 message——实测单条诊断
  **25 KB**。这条字符串会进 LSP 诊断、`checkCard()` 返回给调用方/模型的错误、以及日志，
  直接把上下文撑爆。
  
  - `validator` 新增导出 `formatIssueMessage(issue)`：枚举类报错只保留前 6 个取值 +
    `… (N options)`；另给所有超长报错加 800 字符兜底（判别联合的整份 tag 列表也在此列）。
    `validateAst()` / `validateData()` 的诊断统一走它。
  - `check` 的 `schemaIssue()` 复用同一份截断，`checkCard()` 与 validator 两条路径文案一致。
  
  新增回归用例：非法 `standard_icon.token` 的诊断 < 400 字符且带总数量；普通 schema 错误
  不被截断。

## 0.1.15

### Patch Changes

- Updated dependencies [c45693a]
  - @open-feishu-card/schema@0.4.0

## 0.1.14

### Patch Changes

- Updated dependencies [7624ccc]
  - @open-feishu-card/schema@0.3.3

## 0.1.13

### Patch Changes

- Updated dependencies [12328f1]
  - @open-feishu-card/schema@0.3.2

## 0.1.12

### Patch Changes

- Updated dependencies [6216759]
  - @open-feishu-card/schema@0.3.1

## 0.1.11

### Patch Changes

- Updated dependencies [42fb7bd]
- Updated dependencies [42fb7bd]
  - @open-feishu-card/schema@0.3.0

## 0.1.10

### Patch Changes

- Updated dependencies [bdd86c4]
  - @open-feishu-card/schema@0.2.0

## 0.1.9

### Patch Changes

- Updated dependencies [d14e395]
  - @open-feishu-card/schema@0.1.10

## 0.1.8

### Patch Changes

- Updated dependencies [3dee401]
  - @open-feishu-card/schema@0.1.9

## 0.1.7

### Patch Changes

- 从 Schema 2.0 工具链移除 JSON 1.0 的 `action` / `note`
- Updated dependencies
  - @open-feishu-card/schema@0.1.6

## 0.1.6

### Patch Changes

- 支持搭建工具文档：自动解包 `dsl` 后做 Schema 校验，诊断 path 带 `/dsl` 前缀；外层轻量检查 `name` / `variables`
- Updated dependencies
  - @open-feishu-card/parser@0.1.3

## 0.1.5

### Patch Changes

- 新增官方 `card-schema.json` 一致性（conformance）测试与 `$def` 方言校验器
- Updated dependencies
  - @open-feishu-card/schema@0.1.5

## 0.1.4

### Patch Changes

- Updated dependencies
  - @open-feishu-card/schema@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies [441c53b]
  - @open-feishu-card/schema@0.1.3

## 0.1.2

### Patch Changes

- 为库包增加 CommonJS 双格式构建（ESM + CJS），可通过 `require` 使用。
- Updated dependencies
  - @open-feishu-card/schema@0.1.2
  - @open-feishu-card/parser@0.1.2

## 0.1.1

### Patch Changes

- 首次正式发布：补齐构建产物与包内容（替换 npm 上的空占位 0.1.0）。
- Updated dependencies
  - @open-feishu-card/parser@0.1.1
  - @open-feishu-card/schema@0.1.1
