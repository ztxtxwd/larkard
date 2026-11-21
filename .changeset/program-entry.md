---
"larkard": minor
---

新增 `larkard/program` 与 `larkard/program/runtime`：

- `larkard/program`：卡片程序协议解释器（`compileProgram` / `renderProgram` / `dispatchAction` / 模拟器），纯计算、不依赖 Node 与 DOM；转义与体积常量改为复用 `larkard/schema`、`larkard` 的真源。
- `larkard/program/runtime`：程序宿主（`CardRuntime`、`composeCard`、`readEnvelope`、`FeishuClient`），依赖 `larkard/state` 封印命名宿主；新增 `CardInstanceStore` 持久化，`handleCallback` 对非本协议卡片返回 `undefined`，`CardHost` 的读写能力可分别实现。
- `larkard/state` 的 `CARD_SIZE_BUDGET` 移到中立的 `src/core/limits.ts`，避免 Universal 入口为了一个常量引入 `node:zlib`。
- 回调的 `rev` 与当前版本不一致时（响应丢失 / 客户端超时），即使动作没有改状态也把当前卡带回，修正客户端视图。
