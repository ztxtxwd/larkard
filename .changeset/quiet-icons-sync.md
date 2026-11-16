---
'@open-feishu-card/schema': minor
'@open-feishu-card/renderer': patch
---

`IconTokenSchema` 改为由仓库内清单 `src/common/icon-tokens.list.ts`（`ICON_TOKENS`，1167 个）生成，能通过校验的 token 与清单严格一一对应：

- **新增 13 个**前缀图标 token：`chat-loading_outlined`、`feishuclip_filled`、`headphone-solid_outlined`、`inline-view_outlined`、`jira-filter_outlined`、`original_outlined`、`port-export_outlined`、`rename_outlined`、`trello_outlined`、`up-top-round_outlined`、`meeting-ai_filled`、`calendar-disable_colorful`，以及 `ai-common_colorful`（此前只作为客户端补充，现已在清单内）。
- **移除 10 个**不在清单内的客户端私有 AI token（`ai-search_colorful`、`ai-doc_colorful`、`ai-video_outlined`、`ai-update_filled` 等）。这些 token 在客户端字体里存在，但不在有效值清单里，现在与臆造 token 一样被判非法——若既有卡片用到，需要换成清单内的图标。
- **renderer**：`COLORFUL_ICON_GRADIENTS` 同步收敛到 `ai-common_colorful`，不再为已移除的 AI 彩色图标注入渐变。
- **validator**：新增回归用例——清单内 token 全部通过校验、清单外 token（含被移除的 AI 图标）报错，且 `IconTokenSchema.options` 与 `ICON_TOKENS` 严格相等。
