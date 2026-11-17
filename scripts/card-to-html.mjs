#!/usr/bin/env node
/**
 * 用官方渲染链路把 .card（公开 DSL）转成可浏览器打开的 HTML：
 *   .card → JSON.parse → dsl → dslToRaw → renderCardToString → + ALL_CSS → HTML 文件
 *
 * 用法：
 *   node scripts/card-to-html.mjs <input.card> [output.html]
 *
 * 依赖：需先 build adapter + renderer（pnpm --filter @open-feishu-card/renderer... build）
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const inputPath = resolve(process.argv[2] || '');
if (!process.argv[2]) {
  console.error('用法: node scripts/card-to-html.mjs <input.card> [output.html]');
  process.exit(1);
}

const outPath = resolve(
  process.argv[3]
    || join(dirname(inputPath), basename(inputPath).replace(/\.card$/i, '') + '.html'),
);

const rendererUrl = pathToFileURL(
  resolve(import.meta.dirname, '../packages/renderer/dist/index.js'),
).href;
const { renderDslToString, feishuCardStyleTag } = await import(rendererUrl);

const raw = JSON.parse(readFileSync(inputPath, 'utf8'));
const dsl = raw && typeof raw === 'object' && 'dsl' in raw ? raw.dsl : raw;
const title =
  (raw && typeof raw === 'object' && typeof raw.name === 'string' && raw.name)
  || basename(inputPath).replace(/\.card$/i, '');

const cardHtml = renderDslToString(dsl);
const page = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
${feishuCardStyleTag()}
<style>
  body {
    margin: 0;
    padding: 32px 16px;
    background: #e8e6df;
    display: flex;
    justify-content: center;
  }
  /* 宽度交给卡片根节点（config.width_mode）：default 600 / compact 400 / fill 撑满 */
  .mount { width: 100%; display: flex; justify-content: center; }
</style>
</head>
<body>
<div class="mount">${cardHtml}</div>
</body>
</html>
`;

writeFileSync(outPath, page, 'utf8');
console.log(`wrote ${outPath}`);

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
