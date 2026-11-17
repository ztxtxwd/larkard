import { test } from 'node:test';
import assert from 'node:assert/strict';

import { equalizeInteractiveContainerHeights } from '../src/index.js';
import type { JsonObject } from '../src/types.js';

function markdown(content: string, size?: string, margin?: string): JsonObject {
  return {
    tag: 'markdown',
    content,
    ...(size ? { text_size: size } : {}),
    ...(margin ? { margin } : {}),
  };
}

/** 用户给的「接入只要 3 步」卡片：三列 weighted，每列一个交互容器。 */
function threeStepsCard(): JsonObject {
  const container = (children: JsonObject[]): JsonObject => ({
    tag: 'interactive_container',
    width: 'fill',
    padding: '10px 10px 10px 10px',
    has_border: true,
    corner_radius: '12px',
    vertical_spacing: '3px',
    elements: children,
  });
  return {
    schema: '2.0',
    body: {
      elements: [
        {
          tag: 'column_set',
          flex_mode: 'trisect',
          horizontal_spacing: '10px',
          margin: '12px 20px 20px 20px',
          columns: [
            {
              tag: 'column',
              width: 'weighted',
              weight: 1,
              elements: [container([
                markdown('01', 'heading-4'),
                markdown('安装插件', 'normal'),
                markdown('安装「蝉妈妈」插件。', 'notation', '2px 2px 2px 2px'),
              ])],
            },
            {
              tag: 'column',
              width: 'weighted',
              weight: 1,
              elements: [container([
                markdown('02', 'heading-4'),
                markdown('登录授权', 'normal'),
                markdown('用蝉妈妈账号登录授权。', 'notation', '2px 2px 2px 2px'),
              ])],
            },
            {
              tag: 'column',
              width: 'weighted',
              weight: 1,
              elements: [container([
                markdown('03', 'heading-4'),
                markdown('直接提问', 'normal'),
                markdown('说清品类和商品。', 'notation', '2px 2px 2px 2px'),
              ])],
            },
          ],
        },
      ],
    },
  };
}

function heightsOf(card: JsonObject): unknown[] {
  const body = card.body as JsonObject;
  const columns = (body.elements as JsonObject[])[0]!.columns as JsonObject[];
  return columns.map((column) => {
    const container = (column.elements as JsonObject[])[0]!;
    return container.height;
  });
}

test('三列 weighted：宽卡上本来就等高 → 默认跳过，不钉死高度', () => {
  const result = equalizeInteractiveContainerHeights(threeStepsCard());
  assert.equal(result.groups.length, 0);
  assert.equal(result.changes.length, 0);
  assert.deepEqual(result.skipped.map((item) => item.reason), ['already-equal']);
});

test('窄 520px：前两列多折一行，统一到 126px', () => {
  const result = equalizeInteractiveContainerHeights(threeStepsCard(), { cardWidth: 520 });
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0]!.height, 126);
  // 第三列只有 8 个汉字，520px 下仍是一行；统一高度取三列最大值。
  assert.deepEqual(result.groups[0]!.containers.map((item) => item.naturalHeight), [126, 126, 104]);
  assert.deepEqual(heightsOf(result.card), ['126px', '126px', '126px']);
  assert.equal(result.changes.length, 3);
});

test('多参考宽度：取最大预测值（600 已经等高，520 需要 126）', () => {
  const result = equalizeInteractiveContainerHeights(threeStepsCard(), {
    widths: [600, 520],
  });
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0]!.height, 126);
  assert.deepEqual(result.groups[0]!.containers[0]!.estimates, [104, 126]);
});

test('不修改入参', () => {
  const card = threeStepsCard();
  const before = JSON.stringify(card);
  equalizeInteractiveContainerHeights(card, { cardWidth: 520 });
  assert.equal(JSON.stringify(card), before);
});

test('skipWhenEqual:false 时即使等高也钉死高度', () => {
  const result = equalizeInteractiveContainerHeights(threeStepsCard(), {
    skipWhenEqual: false,
  });
  assert.equal(result.groups.length, 1);
  assert.deepEqual(heightsOf(result.card), ['104px', '104px', '104px']);
});

test('safety / minHeight / maxHeight', () => {
  const withSafety = equalizeInteractiveContainerHeights(threeStepsCard(), {
    cardWidth: 520,
    safety: 2,
  });
  assert.equal(withSafety.groups[0]!.height, 128);

  const withMin = equalizeInteractiveContainerHeights(threeStepsCard(), {
    cardWidth: 520,
    minHeight: 150,
  });
  assert.equal(withMin.groups[0]!.height, 150);

  const overLimit = equalizeInteractiveContainerHeights(threeStepsCard(), {
    cardWidth: 520,
    maxHeight: 120,
  });
  assert.equal(overLimit.groups.length, 0);
  assert.equal(overLimit.skipped[0]!.reason, 'height-over-limit');
});

test('列宽 auto → 整组跳过', () => {
  const card = threeStepsCard();
  const columnSet = ((card.body as JsonObject).elements as JsonObject[])[0]!;
  (columnSet.columns as JsonObject[])[0]!.width = 'auto';
  const result = equalizeInteractiveContainerHeights(card, { cardWidth: 520 });
  assert.equal(result.groups.length, 0);
  assert.equal(result.skipped[0]!.reason, 'auto-column-width');
});

test('某列没有交互容器 → 跳过', () => {
  const card = threeStepsCard();
  const columnSet = ((card.body as JsonObject).elements as JsonObject[])[0]!;
  (columnSet.columns as JsonObject[])[1]!.elements = [markdown('普通文本')];
  const result = equalizeInteractiveContainerHeights(card, { cardWidth: 520 });
  assert.equal(result.groups.length, 0);
  assert.equal(result.skipped[0]!.reason, 'container-count');
});

test('容器已写死高度 → 默认跳过；overwriteFixedHeight 可重新预测', () => {
  const card = threeStepsCard();
  const columnSet = ((card.body as JsonObject).elements as JsonObject[])[0]!;
  const column = (columnSet.columns as JsonObject[])[0]!;
  ((column.elements as JsonObject[])[0] as JsonObject).height = '48px';
  const skipped = equalizeInteractiveContainerHeights(card, { cardWidth: 520 });
  assert.equal(skipped.groups.length, 0);
  assert.equal(skipped.skipped[0]!.reason, 'container-fixed-height');

  const overwritten = equalizeInteractiveContainerHeights(card, {
    cardWidth: 520,
    overwriteFixedHeight: true,
  });
  assert.equal(overwritten.groups.length, 1);
  assert.deepEqual(heightsOf(overwritten.card), ['126px', '126px', '126px']);
});

test('容器内有拿不准的组件（chart）→ 跳过', () => {
  const card = threeStepsCard();
  const columnSet = ((card.body as JsonObject).elements as JsonObject[])[0]!;
  const column = (columnSet.columns as JsonObject[])[0]!;
  const container = (column.elements as JsonObject[])[0]!;
  (container.elements as JsonObject[]).push({ tag: 'chart', chart_spec: {} });
  const result = equalizeInteractiveContainerHeights(card, { cardWidth: 520 });
  assert.equal(result.groups.length, 0);
  assert.equal(result.skipped[0]!.reason, 'unsupported-child');
  assert.match(result.skipped[0]!.detail ?? '', /chart/);
});

test('容器 padding / border / 行距都计入高度', () => {
  const card: JsonObject = {
    schema: '2.0',
    body: {
      elements: [
        {
          tag: 'column_set',
          horizontal_spacing: '8px',
          columns: [
            {
              tag: 'column',
              width: 'weighted',
              weight: 1,
              elements: [
                {
                  tag: 'interactive_container',
                  width: 'fill',
                  has_border: true,
                  padding: '8px 12px 8px 12px',
                  vertical_spacing: '6px',
                  elements: [
                    markdown('第一行'),
                    markdown('第二行'),
                  ],
                },
              ],
            },
            {
              tag: 'column',
              width: 'weighted',
              weight: 1,
              elements: [
                {
                  tag: 'interactive_container',
                  width: 'fill',
                  has_border: true,
                  padding: '8px 12px 8px 12px',
                  vertical_spacing: '6px',
                  elements: [markdown('第一行')],
                },
              ],
            },
          ],
        },
      ],
    },
  };
  const result = equalizeInteractiveContainerHeights(card);
  // 16 padding + 2 border + 2 × 22.4 + 6 gap = 68.8 → ceil 69
  assert.equal(result.groups[0]!.height, 69);
  assert.ok(Math.abs(result.groups[0]!.containers[0]!.naturalHeight - 68.8) < 1e-9);
});

test('plain_text 行高按 CSS 1.6；markdown 才走引擎行高表 +2', () => {
  const card: JsonObject = {
    schema: '2.0',
    body: {
      elements: [{
        tag: 'column_set',
        horizontal_spacing: '8px',
        columns: [
          {
            tag: 'column',
            width: 'weighted',
            weight: 1,
            elements: [{
              tag: 'interactive_container',
              width: 'fill',
              padding: '0px',
              elements: [{ tag: 'plain_text', content: 'a', text_size: 'small' }],
            }],
          },
          {
            tag: 'column',
            width: 'weighted',
            weight: 1,
            elements: [{
              tag: 'interactive_container',
              width: 'fill',
              padding: '0px',
              elements: [markdown('a', 'small')],
            }],
          },
        ],
      }],
    },
  };
  const result = equalizeInteractiveContainerHeights(card, { skipWhenEqual: false });
  const heights = result.groups[0]!.containers.map((item) => item.naturalHeight);
  assert.ok(Math.abs(heights[0]! - 19.2) < 1e-9); // 12 × 1.6
  assert.ok(Math.abs(heights[1]! - 22) < 1e-9); // 引擎表 20 + 2
});

test('markdown 块级构造（标题/列表/引用/代码块/分割线）按 margin 折叠累加', () => {
  const content = [
    '# 标题一',
    '正文**加粗**第一行',
    '- 列表项一',
    '- 列表项二',
    '> 引用一行',
    '',
    '```js',
    'const a = 1;',
    'const b = 2;',
    '```',
    '---',
    '结尾',
  ].join('\n');
  const card: JsonObject = {
    schema: '2.0',
    body: {
      elements: [{
        tag: 'column_set',
        horizontal_spacing: '8px',
        columns: [
          {
            tag: 'column',
            width: 'weighted',
            weight: 1,
            elements: [{
              tag: 'interactive_container',
              width: 'fill',
              padding: '10px',
              has_border: true,
              elements: [{ tag: 'markdown', content }],
            }],
          },
          {
            tag: 'column',
            width: 'weighted',
            weight: 1,
            elements: [{
              tag: 'interactive_container',
              width: 'fill',
              padding: '10px',
              has_border: true,
              elements: [markdown('短')],
            }],
          },
        ],
      }],
    },
  };
  const result = equalizeInteractiveContainerHeights(card, { skipWhenEqual: false });
  // 600px 卡宽下预测 264（padding 20 + 描边 2 + 内容 242）。
  assert.ok(Math.abs(result.groups[0]!.containers[0]!.naturalHeight - 264) < 0.1);
});

test('固定 px 列 + weighted 列按剩余空间分宽度', () => {
  const card: JsonObject = {
    schema: '2.0',
    body: {
      elements: [
        {
          tag: 'column_set',
          horizontal_spacing: '0px',
          columns: [
            {
              tag: 'column',
              width: '100px',
              elements: [{
                tag: 'interactive_container',
                padding: '0px',
                elements: [markdown('固定列')],
              }],
            },
            {
              tag: 'column',
              width: 'weighted',
              weight: 1,
              elements: [{
                tag: 'interactive_container',
                padding: '0px',
                elements: [markdown('很长很长很长很长很长很长很长很长很长')],
              }],
            },
            {
              tag: 'column',
              width: 'weighted',
              weight: 1,
              elements: [{
                tag: 'interactive_container',
                padding: '0px',
                elements: [markdown('短')],
              }],
            },
          ],
        },
      ],
    },
  };
  const result = equalizeInteractiveContainerHeights(card, { cardWidth: 600 });
  assert.equal(result.groups.length, 1);
  // 正文宽 574；两个 weighted 列各 (574-100)/2 = 237；19 个 14px 汉字 = 266 > 237 → 2 行
  assert.ok(result.groups[0]!.containers[1]!.naturalHeight > result.groups[0]!.containers[2]!.naturalHeight);
});
