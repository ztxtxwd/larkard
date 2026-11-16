# @open-feishu-card/check

## 0.1.1

### Patch Changes

- adb2913: 修复 `spacing-domain` 的两处误判：真机接受、却被当成非法值报错/删除。
  
  - `column_set.horizontal_spacing` 除 `default` 外还接受 `auto`（两者落点都是默认间距）。
  - 所有间距字段的空串 `""` 都接受，等同没设置。
  
  依据是仓库 `docs/feishu-card-doc-gaps/column-spacing-value-domain.md` 的实测取值表。
  新增两个回归用例（`column_set.horizontal_spacing: "auto"`、`vertical_spacing: ""`）。

## 0.1.0

### Minor Changes

- 新增 `@open-feishu-card/check`：发送前检查门面。
  
  此前「拼一次发送前检查」要各下游自己 wire：CLI 与 LSP 各写一遍 `parse → validate → lint`，
  卡片工作台再写第三遍，还得自己决定谁的 warning 算 error。本包把它收成一个纯函数：
  
  - `checkCard(input, { fix })`：输入卡片对象或 JSON / JSONC 源码，返回带 JSON Pointer 的
    `errors` / `hints` / `fixes`，无错时给出 `FeishuCardV2Schema.parse` 输出的可发送卡片。
  - 新增**真机硬约束**检查（`source: 'device'`）——Schema 全都放行、飞书却整卡拒绝的那几条：
    间距值域（`spacing-domain`）、`collapsible_panel.header.padding` 上限（`panel-header-padding`）、
    `audio`/`video` 的时长字段（`media-duration`）、含音视频时的 `config.enable_forward`
    （`media-enable-forward`），以及 `collapsible_panel` 误用 `interactive_container` 边框字段的
    静默丢样式提示（`panel-border-field`）。
  - `repairDeviceIssues()` / `findDeviceIssues()` 单独导出：修复是唯一实现，检查拿它在克隆上的
    结果反推，避免两套判断漂移；修复不修改入参，`fix` 默认关闭（有损操作显式 opt-in）。
  - 只解析一次：validator 与 linter 共用同一份 AST。
