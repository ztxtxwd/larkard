import * as esbuild from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

await mkdir('dist', { recursive: true });
// all.css = layout + icon font + emoji sprite（webview 渲染需要三件套）
import { dirname, join } from 'node:path';
const rendererDist = join(
  dirname(require.resolve('larkard/package.json')),
  'dist',
  'renderer',
  'all.css',
);
await copyFile(rendererDist, 'dist/card-styles.css');

// 把 language-server（及其全部 workspace 依赖）bundle 成单文件，随 VSIX 一起分发，
// 运行时由 extension 以独立 Node 进程启动（stdio LSP）。
await esbuild.build({
  entryPoints: [
    join(dirname(require.resolve('larkard/package.json')), 'dist', 'language-server', 'server.js'),
  ],
  bundle: true,
  outfile: 'dist/server.cjs',
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: false,
  minify: production,
  logLevel: 'info',
});

const context = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  sourcemap: production ? false : 'inline',
  minify: production,
  logLevel: 'info',
});

if (watch) {
  await context.watch();
} else {
  await context.rebuild();
  await context.dispose();
}
