# @open-feishu-card/adapter

## 核心原则：RAW ↔ DSL 双向无损

本包的目标是 **公开 DSL（Schema 2.0）与飞书内部 RAW JSON 的完全无损双向转换**。

后续所有改动必须遵守：

1. **显式信息不得改写、合并、丢弃。**  
   RAW 里的 `textStyle.customColor` / `customBackgroundStyle` / `customBorderColor` 等，投影为 DSL 后须仍能还原为同一视觉语义与同一类 token（背景归 `cus-bg-*`，文字归 `cus-text-*`）。  
   **禁止**因「和某个背景 / accent / muted 同 hex」就把显式字色并进 `cus-accent`、`cus-muted` 或其他语义别名。
2. **不要用启发式「修美」颜色。**  
   亮度阈值、对比度、品牌色推断等不属于 adapter。可读性兜底放在调用方（如 bot），不要写进 raw↔dsl 主路径。
3. **可加字段 ≠ 可改字段。**  
   登记 `config.style.color`、把 `#hex` 收成 `cus-*` 别名可以；改掉元素上已指向的字色别名、或把字色 alias 重命名成别的语义 token 不可以。
4. **恢复逻辑与无损投影分离。**  
   飞书回读丢字色后的「补 `<font>`」等 best-effort 行为必须明确 gated（例如仅 `!preRegistered`），不得污染带完整 customColor 的 RAW→DSL 路径。新增能力时优先新 API / 新开关，而不是默默塞进 `rawToDsl`。
5. **用 round-trip 测试锁住。**  
   改颜色、交互、平台 URL 等映射时，加 RAW→DSL→RAW（或至少 RAW→DSL 字段断言）用例；禁止只断言「看起来差不多」。

已知需逐步收干净的杂质（改到时优先删，不要扩）：

- 由首个背景派生 `cus-accent`（合成 token，调用方应用来包无色加粗）
- `!preRegistered` 时给无 `<font>` 的 markdown 补 `cus-accent` / `cus-muted`
