import { test } from 'node:test';
import assert from 'node:assert/strict';

import { COLOR_NAME_TO_TOKEN, PALETTE } from '../src/content/colors.js';
import { COLOR_VALUES, OFFICIAL_DARK } from '../src/content/official-colors.js';

test('官方色对：light 全部来自 content PALETTE，且每个键都有 dark', () => {
  const keys = Object.keys(COLOR_VALUES);
  assert.equal(keys.length, Object.keys(OFFICIAL_DARK).length);
  for (const key of keys) {
    const pair = COLOR_VALUES[key]!;
    const token = COLOR_NAME_TO_TOKEN[key];
    assert.ok(token, `${key} 应能映射到色阶 token`);
    assert.equal(pair.light, PALETTE[token], `${key} light 应等于 PALETTE[${token}]`);
    assert.match(pair.dark, /^#[0-9a-f]{6}$/i, `${key} dark 应为 hex`);
  }
});

test('官方色对覆盖 13 个色族 + 50–900 明度', () => {
  const families = ['grey', 'blue', 'wathet', 'turquoise', 'green', 'lime', 'yellow', 'orange', 'red', 'carmine', 'violet', 'purple', 'indigo'];
  const shades = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'];
  for (const family of families) {
    assert.ok(COLOR_VALUES[family], family);
    for (const shade of shades) assert.ok(COLOR_VALUES[`${family}-${shade}`], `${family}-${shade}`);
  }
});
