---
"@open-feishu-card/patch": minor
---

新增 `@open-feishu-card/patch`：卡片 DSL 的 RFC 6902 JSON Patch。

- `parsePatch(input, { allowEmpty })`：接受操作数组或 JSON 字符串，校验 op / path / value / from
  与 JSON Pointer 语法；空补丁默认报错（避免「模型交白卷」被当成无操作）。
- `applyPatch(doc, ops)`：支持全部六种操作，返回新文档；在克隆上应用，失败不改底稿。
- `PatchError`：`{ code, index, path, operation, message }`，错误形如
  「第 2 个操作（replace /body/elements/9/content）：数组下标越界：/body/elements/9（长度 2）」，
  可直接回给模型或用户，不需要翻译 `OPERATION_PATH_UNRESOLVABLE` 这类库内部名字。
- 零运行时依赖（不引 `fast-json-patch`），ESM / CJS 具名导出一致。

和 `@open-feishu-card/check` 配套，构成「patch → check → 发送」的编辑器/Agent 闭环。
