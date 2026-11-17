import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  AudioSchema,
  CollapsiblePanelSchema,
  CornerRadiusSchema,
  FeishuCardV2Schema,
  ImgCombinationSchema,
  ImageSchema,
  InteractiveContainerSchema,
} from '../src/schema/index.js';

test('CornerRadiusSchema：只接受单个 px / 百分比值', () => {
  for (const value of ['8px', '8.5px', '0px', '50%', '12.5%']) {
    assert.equal(CornerRadiusSchema.safeParse(value).success, true, value);
  }
  // 编辑器「未设置」的回读值：原样保留，不能把真实卡判非法
  assert.equal(CornerRadiusSchema.safeParse('').success, true);
});

test('CornerRadiusSchema：拒绝四角多值与其它单位', () => {
  for (const value of ['8px 0 0 8px', '8px 0', '8 8', '8', '8em', '50 %', '  ', '-4px']) {
    const result = CornerRadiusSchema.safeParse(value);
    assert.equal(result.success, false, value);
    if (!result.success) {
      assert.match(result.error.issues[0].message, /单个像素值或百分比值/);
    }
  }
});

test('所有带 corner_radius 的组件 Schema 都不接受多值', () => {
  const cases: Array<[string, { safeParse: (v: unknown) => { success: boolean } }]> = [
    ['img', ImageSchema],
    ['img_combination', ImgCombinationSchema],
    ['interactive_container', InteractiveContainerSchema],
    ['collapsible_panel', CollapsiblePanelSchema],
    ['audio', AudioSchema],
  ];
  const elements: Record<string, Record<string, unknown>> = {
    img: {
      tag: 'img',
      img_key: 'img_test',
      alt: { tag: 'plain_text', content: '图' },
      corner_radius: '8px 0 0 8px',
    },
    img_combination: {
      tag: 'img_combination',
      combination_mode: 'double',
      img_list: [],
      corner_radius: '8px 0 0 8px',
    },
    interactive_container: {
      tag: 'interactive_container',
      elements: [],
      corner_radius: '8px 0 0 8px',
    },
    collapsible_panel: {
      tag: 'collapsible_panel',
      header: { title: { tag: 'plain_text', content: '标题' } },
      border: { corner_radius: '8px 0 0 8px' },
    },
    audio: {
      tag: 'audio',
      file_key: 'file_test',
      border: { corner_radius: '8px 0 0 8px' },
    },
  };

  for (const [tag, schema] of cases) {
    const result = schema.safeParse(elements[tag]);
    assert.equal(result.success, false, tag);
  }
});

test('FeishuCardV2Schema：img 单个 px / 百分比圆角仍然合法', () => {
  for (const corner_radius of ['8px', '50%']) {
    const result = FeishuCardV2Schema.safeParse({
      schema: '2.0',
      body: {
        elements: [
          {
            tag: 'img',
            img_key: 'img_test',
            alt: { tag: 'plain_text', content: '图' },
            corner_radius,
          },
        ],
      },
    });
    assert.equal(result.success, true, corner_radius);
  }
});
