# Changesets

独立版本、changelog 与 npm 发布由 Changesets 管理。改了 `packages/*` 里要发版的代码后，在仓库根目录运行：

```bash
pnpm changeset
```

选中变更的包和 semver 类型（patch / minor / major），生成的 `.changeset/*.md` 跟 PR 一起提交。合并进 `main` 后，CI 会开 Version Packages PR；再合并那条 PR 就会只把 bump 过的包发到 npm。

VS Code 扩展不走 Changesets。只在本仓库发：改 `apps/vscode` 后升 `package.json` 版本，打 `vscode-v*` tag（与版本号一致），CI 用本仓库的 `VSCE_PAT` / `OVSX_PAT` 发到 Marketplace 与 Open VSX。扩展 ID 仍是 `TianxiongZhao.lark-card-preview`，显示名为 Open Feishu Card。旧仓库 `lark-card-preview` 已归档。
