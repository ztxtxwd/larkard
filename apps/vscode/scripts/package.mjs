#!/usr/bin/env node
/**
 * vsce 打包编排：
 * 1. esbuild 构建（extension.js + server.cjs + card-styles.css）
 * 2. 组装暂存目录（dist/media/samples + 去掉 workspace:* dependencies 的 package.json）
 *    —— 产物已全量 bundle，运行时零 npm 依赖；去掉 dependencies 让 vsce 完全跳过
 *       npm 依赖校验（这正是 pnpm workspace 下 vsce 无限重试 npm 的根源）
 * 3. 在暂存目录执行官方 vsce package，产物移回 apps/vscode/
 */
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// 注意：new URL('..') 带尾部斜杠，不能再过 path.dirname（会把目录再削一层）
const root = fileURLToPath(new URL('..', import.meta.url));

// 1. build
const build = spawnSync('node', ['esbuild.mjs', '--production'], { cwd: root, stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);

// 2. stage
const stage = join(root, '.vsce-stage');
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
for (const dir of ['dist', 'media', 'samples']) {
  cpSync(join(root, dir), join(stage, dir), { recursive: true });
}
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
delete pkg.dependencies; // 全量 bundle，运行时零依赖
delete pkg.scripts;
writeFileSync(join(stage, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
for (const f of ['LICENSE', 'README.md', 'CHANGELOG.md', '.vscodeignore']) {
  const src = join(root, f);
  if (existsSync(src)) cpSync(src, join(stage, f));
}

// 3. vsce（用扩展本地安装的 vsce 二进制，不触发网络下载）
const vsceBin = join(root, 'node_modules', '.bin', 'vsce');
const res = spawnSync(vsceBin, ['package', '--no-dependencies'], { cwd: stage, stdio: 'inherit' });
if (res.status !== 0) process.exit(res.status ?? 1);

// 移回产物
const vsix = readdirSync(stage).find((f) => f.endsWith('.vsix'));
if (vsix) {
  cpSync(join(stage, vsix), join(root, vsix));
  console.log(`Packaged: ${join(root, vsix)}`);
  rmSync(stage, { recursive: true, force: true });
}
