import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ICON_CODEPOINTS } from '../dist/content/icons/index.js';
import { EMOJI_KEY_TO_NAME } from '../dist/content/emoji/index.js';
import { ICON_FONT_CSS, EMOJI_SPRITE_CSS } from '../dist/renderer/assets/index.js';

test('图标字体 CSS 覆盖 larkard/icons 的全部码点', () => {
  const names = new Set(
    [...ICON_FONT_CSS.matchAll(/\.ud-icon_([^:]+):before/g)].map((match) => match[1]),
  );
  const missing = Object.keys(ICON_CODEPOINTS).filter((name) => !names.has(name));
  assert.deepEqual(missing.slice(0, 20), [], `字体 CSS 缺少 ${missing.length} 个图标`);
});

test('emoji 雪碧 CSS 覆盖 larkard/emoji 的全部短码映射', () => {
  const names = new Set(
    [...EMOJI_SPRITE_CSS.matchAll(/\.larkw-emoji__img--emoji-([^\s{]+)/g)].map((match) => match[1]),
  );
  const missing = Object.values(EMOJI_KEY_TO_NAME).filter((name) => !names.has(name));
  assert.deepEqual(missing.slice(0, 20), [], `emoji CSS 缺少 ${missing.length} 个雪碧图名`);
});
