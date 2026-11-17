import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ICON_TOKENS } from '../src/content/icons/official-tokens.js';
import { ICON_CATALOG, ICON_STYLES, iconCategoryOf, iconStyleOf } from '../src/content/icons/catalog.js';

const SUFFIX: Record<string, string> = {
  outlined: '_outlined',
  filled: '_filled',
  colorful: '_colorful',
};

const flat = (): string[] =>
  Object.values(ICON_CATALOG).flatMap((groups) => groups.flatMap((group) => [...group.tokens]));

test('每个 token 的后缀与所在风格一致', () => {
  for (const [style, groups] of Object.entries(ICON_CATALOG)) {
    for (const group of groups) {
      for (const token of group.tokens) {
        assert.ok(
          token.endsWith(SUFFIX[style]!),
          `${token} 出现在 ${style} 里，但后缀不是 ${SUFFIX[style]}`,
        );
      }
    }
  }
});

test('目录与 ICON_TOKENS 严格一一对应：不重、不漏、不多', () => {
  const tokens = flat();
  assert.equal(new Set(tokens).size, tokens.length, '有 token 重复出现在多个分类里');
  assert.deepEqual(
    [...new Set(tokens)].sort(),
    [...ICON_TOKENS].sort(),
    '目录与 icon-tokens.list.ts 不一致（增删 token 时两处都要改）',
  );
});

test('ICON_STYLES 与 ICON_CATALOG 的 key 完全一致', () => {
  assert.deepEqual(
    ICON_STYLES.map((s) => s.value).sort(),
    Object.keys(ICON_CATALOG).sort(),
  );
});

test('iconStyleOf / iconCategoryOf 能定位 token 与未知值', () => {
  assert.equal(iconStyleOf('add_outlined'), 'outlined');
  assert.equal(iconStyleOf('approval_filled'), 'filled');
  assert.equal(iconStyleOf('ai-common_colorful'), 'colorful');
  assert.equal(iconStyleOf('not-a-token'), undefined);
  assert.equal(iconStyleOf(undefined), undefined);

  assert.equal(iconCategoryOf('add_outlined'), '系统');
  assert.equal(iconCategoryOf('ai-common_colorful'), 'AI');
  assert.equal(iconCategoryOf('not-a-token'), undefined);
});
