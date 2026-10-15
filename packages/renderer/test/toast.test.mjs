/**
 * Toast 宿主测试（node --test）。针对构建产物 dist/index.js。
 * 事实依据：客户端 kernel.toast.success/info/warning/error({ content, showTime, maxLines })，
 * DOM 为 .ud__toast.ud__notice（max-width:600px、top:32px、顶部下拉动画）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { renderToastHTML, createToastHost } from '../dist/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));

test('renderToastHTML：四种类型各带对应修饰类与图标', () => {
  for (const type of ['success', 'info', 'warning', 'error']) {
    const html = renderToastHTML(type, { content: 'ok' });
    assert.ok(html.includes(`universal-card-toast universal-card-toast--${type}`), `missing ${type} modifier`);
    assert.ok(html.includes('<svg'), `${type} 应带图标 SVG`);
    assert.ok(html.includes('<span class="universal-card-toast__text">ok</span>'));
    assert.ok(html.includes('role="status"'));
  }
});

test('renderToastHTML：content 做 HTML 转义', () => {
  const html = renderToastHTML('error', { content: '<img src=x onerror=a>"&' });
  assert.ok(html.includes('&lt;img src=x onerror=a&gt;&quot;&amp;'));
  assert.ok(!html.includes('<img src=x'));
});

test('renderToastHTML：maxLines 默认 1 不输出 line-clamp；>1 时输出', () => {
  assert.ok(!renderToastHTML('info', { content: 'a' }).includes('-webkit-line-clamp'));
  assert.ok(renderToastHTML('info', { content: 'a', maxLines: 3 }).includes('-webkit-line-clamp:3'));
});

test('createToastHost：Node 无 DOM 环境返回 no-op，不抛错', () => {
  const api = createToastHost();
  assert.equal(typeof api.success, 'function');
  assert.equal(typeof api.destroy, 'function');
  api.success({ content: 'x' });
  api.info({ content: 'x' });
  api.warning({ content: 'x' });
  api.error({ content: 'x' });
  api.destroy();
});

test('styles.css：toast 关键样式存在（top:32 / max-width:600 / 深色胶囊）', () => {
  const css = readFileSync(join(HERE, '..', 'src', 'styles.css'), 'utf8');
  assert.ok(css.includes('.universal-card-toast-host'));
  assert.ok(css.includes('top: 32px'));
  assert.ok(css.includes('max-width: 600px'));
  assert.ok(css.includes('universal-card-toast-in'));
});
