# 开发笔记

- monorepo：pnpm workspace + turbo，包在 packages/*，VS Code 插件在 apps/vscode。
- 各 Universal 包用 tsc 构建（NodeNext，ESM），renderer 用 tsup 双格式，vscode 用 esbuild bundle。
- 测试：node:test + tsx（renderer 针对 dist 产物，需先 build）。
