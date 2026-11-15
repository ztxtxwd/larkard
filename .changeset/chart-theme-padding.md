---
"@open-feishu-card/renderer": patch
---

chart：水合时补上真机 VChart 主题的默认内边距 `12/12/12/0`（含 SSR hydrate 脚本与 VS Code 预览）。此前不注入，落回 VChart 缺省 `padding: 20`，四边都比真机大——现在与真机一致；`chart_spec` 显式写了 `padding` 仍以调用方为准。
