import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ICON_TOKENS } from '../src/content/icons/official-tokens.js';
import { ICON_CODEPOINTS } from '../src/content/icons/client-codepoints.js';
import { EMOJI_TOKENS_WITHOUT_SPRITE, FEISHU_EMOJI_TOKENS } from '../src/content/emoji/official-tokens.js';
import { EMOJI_KEY_TO_NAME } from '../src/content/emoji/client-map.js';
import {
  BASE_FONT_SIZE,
  DEFAULT_LINE_HEIGHT,
  TEXT_SIZE_MAP,
  fontSizeOf,
  lineHeightForFontSize,
  textLineHeight,
} from '../src/content/metrics.js';
import { HORIZONTAL_SPACING_PX, VERTICAL_SPACING_PX, parseSpacingPx, spacingPx } from '../src/content/spacing.js';

test('官方图标 token 都能在客户端图标字体里渲染', () => {
  const missing = ICON_TOKENS.filter((token) => ICON_CODEPOINTS[token] == null);
  assert.deepEqual(missing, [], `缺少字体码点: ${missing.slice(0, 10).join(', ')}`);
});

test('官方 emoji token 与客户端雪碧图的差异是已知且显式的', () => {
  const missing = FEISHU_EMOJI_TOKENS.filter((token) => EMOJI_KEY_TO_NAME[token] == null);
  assert.deepEqual(
    [...missing].sort(),
    [...EMOJI_TOKENS_WITHOUT_SPRITE].sort(),
    '官方 token 与客户端雪碧图出现新的差异；确认后在 EMOJI_TOKENS_WITHOUT_SPRITE 登记',
  );
});

test('字号行高：引擎表 + 消息卡片桌面端 +2', () => {
  assert.equal(BASE_FONT_SIZE, 14);
  assert.equal(DEFAULT_LINE_HEIGHT, 14 * 1.6);
  assert.equal(TEXT_SIZE_MAP.normal, 14);
  assert.equal(fontSizeOf('normal'), 14);
  assert.equal(fontSizeOf('unknown'), 14);
  assert.equal(lineHeightForFontSize(14), 22);
  assert.equal(textLineHeight(14), 24);
  assert.equal(lineHeightForFontSize(18), 28);
  assert.equal(textLineHeight(18), 30);
});

test('横纵间距是两套枚举，解析互不串味', () => {
  assert.deepEqual(VERTICAL_SPACING_PX, { default: 8, medium: 12, large: 16 });
  assert.deepEqual(HORIZONTAL_SPACING_PX, { small: 4, default: 8, large: 12 });
  assert.equal(parseSpacingPx('medium', 'vertical'), 12);
  assert.equal(parseSpacingPx('medium', 'horizontal'), undefined);
  assert.equal(parseSpacingPx('small', 'horizontal'), 4);
  assert.equal(parseSpacingPx('12px', 'vertical'), 12);
  assert.equal(spacingPx('nope', 'vertical'), 8);
});
