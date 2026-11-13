# 开发笔记

- monorepo：pnpm workspace + turbo，包在 packages/*，VS Code 插件在 apps/vscode。
- 各 Universal 包用 tsc 构建（NodeNext，ESM），renderer 用 tsup 双格式，vscode 用 esbuild bundle。
- 测试：node:test + tsx（renderer 针对 dist 产物，需先 build）。

## 发版

- 不用 PR：往 `main` 推带 changeset 的提交即可。`.github/workflows/publish.yml` 会在同一轮里
  `changeset version` → 直接提交「chore: version packages」推到 main → build/test → `changeset publish` → 推 tag。
- 因为 GITHUB_TOKEN 推的提交不会再触发新 workflow，所以 version 与 publish 必须在同一轮完成；
  不要改回「version 开 PR」再靠 push 触发 publish 的两段式流程。
- 工作流文件名必须保持 `publish.yml`：npm Trusted Publisher 绑定的是这个文件名。
- VS Code 扩展不在 changesets 管理内：手动 bump `apps/vscode/package.json` 版本 + 补 CHANGELOG，
  推 `vscode-v<version>` tag 触发 `publish-vscode.yml`（Marketplace + Open VSX + GitHub Release）。

