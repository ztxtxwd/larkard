# Open Feishu Card

在 VS Code 里编辑、校验并预览飞书 / Lark **Card Schema 2.0**。这不是单纯的预览插件：内嵌语言服务器会在你写 `.card` 时给出 Schema 诊断、补全、Hover 和 Quick Fix，预览仍在本地 Webview 里实时渲染。

- 显示名：**Open Feishu Card**（原「飞书卡片预览」）
- 扩展 ID 不变：[`TianxiongZhao.lark-card-preview`](https://marketplace.visualstudio.com/items?itemName=TianxiongZhao.lark-card-preview)
- 源码：[open-feishu-card-monorepo](https://github.com/ztxtxwd/open-feishu-card-monorepo) 的 `apps/vscode`。原独立仓库 `lark-card-preview` 已归档。

已安装旧版的用户会直接收到 `0.2.0` 更新，不必卸了重装。

## 0.2.0 新增

相对 `0.1.x` 的纯预览版：

- **语言服务（LSP）**：打开 `*.card` 即启用。Problems 面板里是字符级定位的 Schema / 最佳实践诊断；输入 `tag` 等字段时补全组件名；悬停查看字段说明；灯泡菜单可一键修常见问题，也支持 `source.fixAll`。
- **只作用于 `.card`**：普通 `.json` 不再被当成卡片检查，避免污染整个工作区。需要预览时仍可用命令手动打开。
- **净化非标属性**：命令 **Open Feishu Card: Sanitize Card**，去掉 Schema 不认的字段，便于贴进飞书开放平台。
- **同一套工具链**：解析、校验、适配、渲染来自 `@open-feishu-card/*`，与 CLI / npm 包一致。

## 语言服务

编辑 `.card`（JSON/JSONC）时自动工作，无需额外配置。

| 能力 | 说明 |
| --- | --- |
| 诊断 | 合并 Schema 校验与 linter（嵌套过深、废弃属性等），来源显示为 `open-feishu-card` |
| 补全 | 在 `tag` 等位置提示合法组件；触发字符 `"`, `:`, 空格 |
| Hover | 已知字段的说明 |
| Quick Fix | 针对当前诊断的修复；可一次性净化整份卡片 |

关闭：设置 `openFeishuCard.languageServer.enabled` 为 `false`。

## 预览

- 打开 `.card` 默认进入卡片预览；点标题栏 **Source**（或 **Reopen Editor With… → Text Editor**）改 JSON。
- 标题栏 **Open Preview to the Side**：左侧源码、右侧实时预览。
- 解析错误可点进大致源码位置。
- 跟随 VS Code 亮/暗色，或用设置强制主题。
- 可选 `openFeishuCard.imageBaseURL` 给图片 ID 加前缀。
- 默认完全本地渲染，不请求预览服务。页眉纹理、图标字体、emoji shortcode（`:Fire:`、`:OK:` 等）由渲染器内置样式提供。

命令面板运行 **Open Feishu Card: Open Sample Card** 可打开内置示例 `samples/welcome.card`。

## 命令

| 命令 | 作用 |
| --- | --- |
| `Open Feishu Card: Open Preview to the Side` | 侧边实时预览 |
| `Open Feishu Card: Open Sample Card` | 打开内置 DSL 示例 |
| `Open Feishu Card: Refresh Preview` | 刷新独立预览面板 |
| `Open Feishu Card: Open Source` | 从预览回到 JSON |
| `Open Feishu Card: Sanitize Card` | 去掉非标属性 |

`0.1.x` 的命令 ID（`larkCardPreview.*`）仍注册为别名，原有快捷键不用改。

## 设置

| 设置 | 默认 | 作用 |
| --- | --- | --- |
| `openFeishuCard.languageServer.enabled` | `true` | 为 `*.card` 启用诊断 / 补全 / Hover / Quick Fix |
| `openFeishuCard.preview.theme` | `auto` | `auto` / `light` / `dark` |
| `openFeishuCard.preview.maxWidth` | `650` | 预览最大宽度（像素） |
| `openFeishuCard.render.warnOnUnknownTag` | `true` | 未知组件在 Extension Host 打日志 |
| `openFeishuCard.imageBaseURL` | 空 | 未解析图片值的 URL 前缀 |

已写入的 `larkCardPreview.*` 设置会继续生效，直到改成新键。

## 从 0.1.x 升级

Marketplace 按同一扩展更新。主要行为变化：

1. 扩展列表里显示为 **Open Feishu Card**，ID 仍是 `TianxiongZhao.lark-card-preview`。
2. 诊断和补全只挂在 `*.card` 上，不再扫遍工作区 JSON。
3. 命令与设置命名空间改为 `openFeishuCard.*`（旧 ID / 旧键兼容）。
4. 自定义编辑器 viewType 改为 `openFeishuCard.editor`；若某个 `.card` 仍用旧编辑器打开，用 **Reopen Editor With…** 选 **Open Feishu Card**。

## 本地开发与打包

在 monorepo 根目录：

```bash
pnpm install
pnpm --filter lark-card-preview... build
pnpm --filter lark-card-preview package
```

`F5` 启动 Extension Development Host 后，打开任意 `.card` 即可同时试预览和 LSP。

发布：在 **本仓库** 打 tag `vscode-v*`（须与 `apps/vscode/package.json` 的 `version` 一致），或手动跑 Actions **Publish VS Code Extension**。需要 secrets：`VSCE_PAT`、`OVSX_PAT`。

## License

MIT
