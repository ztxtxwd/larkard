# Changesets

独立版本、changelog 与 npm 发布由 Changesets 管理。改了 `packages/*` 里要发版的代码后，在仓库根目录运行：

```bash
pnpm changeset
```

选中变更的包和 semver 类型（patch / minor / major），生成的 `.changeset/*.md` 跟 PR 一起提交。合并进 `main` 后，CI 会开 Version Packages PR；再合并那条 PR 就会只把 bump 过的包发到 npm。
