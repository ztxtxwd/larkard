/**
 * interactive_container hover 样式回归测试。
 *
 * 真机 hover 底来自当前底色（客户端 useColors：HSL lighten 5%，dark 主题
 * darken 5%）。渲染器曾经用固定 rgba(31,35,41,0.05) 覆盖 background-color，
 * 深色自定义按钮一 hover 就变透明、白字一起消失。这里守住“保留底色、
 * 只叠加明暗层”的实现。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(HERE, '..', 'src', 'renderer', 'styles.css'), 'utf8');

test('interactive_container hover 保留自定义底色，只叠加 5% 亮层', () => {
  const rule = css.match(
    /\.universal-card-interactive-container--action:not\([^)]*\):hover\s*\{([^}]*)\}/,
  );
  assert.ok(rule, '缺少 interactive_container hover 规则');
  assert.match(rule[1], /background-image:\s*linear-gradient\(/);
  assert.doesNotMatch(rule[1], /background-color:\s*rgba\(31,\s*35,\s*41/);
});

test('dark 主题 hover 用 5% 暗层，而不是固定灰', () => {
  assert.match(
    css,
    /\.universal-card-root\.theme-dark[\s\S]{0,200}interactive-container--action[^{]*:hover\s*\{[^}]*linear-gradient\(rgba\(0,\s*0,\s*0,\s*0\.05\)/,
  );
});
