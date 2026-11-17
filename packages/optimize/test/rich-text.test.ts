import { test } from 'node:test';
import assert from 'node:assert/strict';

import { upgradeTextToRichText } from '../src/index.js';
import type { JsonObject } from '../src/types.js';

test('header plain_text → lark_md，内容按实体转义', () => {
  const input: JsonObject = {
    header: {
      title: { tag: 'plain_text', content: '**周报** <at id=all></at> :OK:' },
      subtitle: { tag: 'plain_text', content: '10:30 A&B' },
    },
    body: { elements: [] },
  };

  const original = JSON.parse(JSON.stringify(input));
  const result = upgradeTextToRichText(input);

  assert.deepEqual(input, original, '入参不能被修改');
  assert.deepEqual(result.card.header, {
    title: {
      tag: 'lark_md',
      content: '&#42;&#42;周报&#42;&#42; &#60;at id=all&#62;&#60;&#47;at&#62; &#58;OK&#58;',
    },
    subtitle: { tag: 'lark_md', content: '10&#58;30 A&amp;B' },
  });
  assert.deepEqual(result.changes, [
    {
      path: ['header', 'title'],
      kind: 'plain-text-to-lark-md',
      from: 'plain_text',
      to: 'lark_md',
      escaped: true,
    },
    {
      path: ['header', 'subtitle'],
      kind: 'plain-text-to-lark-md',
      from: 'plain_text',
      to: 'lark_md',
      escaped: true,
    },
  ]);
  assert.deepEqual(result.skipped, []);
});

test('div → markdown：text 字段摊平，text_color → font_color', () => {
  const input: JsonObject = {
    body: {
      elements: [
        {
          tag: 'div',
          element_id: 'div_1',
          margin: '0px 0px 8px 0px',
          width: 'fill',
          text: {
            tag: 'plain_text',
            content: '负责人：<张三>',
            text_size: 'notation',
            text_color: 'grey',
            text_align: 'center',
            lines: 2,
          },
          icon: { tag: 'standard_icon', token: 'info_outlined' },
        },
      ],
    },
  };

  const result = upgradeTextToRichText(input);
  assert.deepEqual(result.card.body, {
    elements: [
      {
        tag: 'markdown',
        content: '负责人：&#60;张三&#62;',
        element_id: 'div_1',
        margin: '0px 0px 8px 0px',
        text_size: 'notation',
        text_align: 'center',
        text_lines: 2,
        font_color: 'grey',
        icon: { tag: 'standard_icon', token: 'info_outlined' },
      },
    ],
  });
  assert.deepEqual(result.changes, [
    {
      path: ['body', 'elements', 0],
      kind: 'div-to-markdown',
      from: 'div',
      to: 'markdown',
      escaped: true,
      mapped: {
        'text.lines': 'text_lines',
        'text.text_color': 'font_color',
      },
    },
  ]);
});

test('div 里的 lark_md 内容不转义；text_color 记录为失效字段', () => {
  const input: JsonObject = {
    body: {
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: '**加粗** <at id=all></at>',
            text_color: 'red',
          },
        },
      ],
    },
  };

  const result = upgradeTextToRichText(input);
  assert.deepEqual(result.card.body, {
    elements: [
      {
        tag: 'markdown',
        content: '**加粗** <at id=all></at>',
      },
    ],
  });
  assert.equal(result.changes.length, 1);
  assert.equal(result.changes[0]!.escaped, false);
  assert.deepEqual(result.changes[0]!.lost, ['text.text_color']);
  assert.equal(result.changes[0]!.mapped, undefined);
});

test('div.width 不是 fill 时跳过，卡片保持原样', () => {
  const input: JsonObject = {
    body: {
      elements: [
        {
          tag: 'div',
          width: 'auto',
          text: { tag: 'plain_text', content: '标题' },
        },
      ],
    },
  };

  const result = upgradeTextToRichText(input);
  assert.deepEqual(result.card, input);
  assert.deepEqual(result.changes, []);
  assert.deepEqual(result.skipped, [
    {
      path: ['body', 'elements', 0],
      reason: 'div-width',
      detail: 'auto',
    },
  ]);
});

test('未知字段的 div 跳过，避免静默丢字段', () => {
  const input: JsonObject = {
    body: {
      elements: [
        {
          tag: 'div',
          text: { tag: 'plain_text', content: 'x' },
          custom_field: true,
        },
      ],
    },
  };

  const result = upgradeTextToRichText(input);
  assert.deepEqual(result.card, input);
  assert.deepEqual(result.skipped, [
    {
      path: ['body', 'elements', 0],
      reason: 'div-unknown-field',
      detail: 'custom_field',
    },
  ]);
});

test('convertDiv: false 时只升级 div.text，不动组件', () => {
  const input: JsonObject = {
    body: {
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'plain_text',
            content: 'a-b',
            text_color: 'red',
          },
        },
      ],
    },
  };

  const result = upgradeTextToRichText(input, { convertDiv: false });
  assert.deepEqual(result.card.body, {
    elements: [
      {
        tag: 'div',
        text: { tag: 'lark_md', content: 'a&#45;b', text_color: 'red' },
      },
    ],
  });
  assert.deepEqual(result.changes, [
    {
      path: ['body', 'elements', 0, 'text'],
      kind: 'plain-text-to-lark-md',
      from: 'plain_text',
      to: 'lark_md',
      escaped: true,
      lost: ['text_color'],
    },
  ]);
});

test('convertPlainText: false 时 header 保持 plain_text，div 仍可转 markdown', () => {
  const input: JsonObject = {
    header: { title: { tag: 'plain_text', content: 'T' } },
    body: {
      elements: [
        { tag: 'div', text: { tag: 'plain_text', content: 'D' } },
      ],
    },
  };

  const result = upgradeTextToRichText(input, { convertPlainText: false });
  assert.deepEqual((result.card.header as JsonObject).title, {
    tag: 'plain_text',
    content: 'T',
  });
  assert.deepEqual((result.card.body as JsonObject).elements, [
    { tag: 'markdown', content: 'D' },
  ]);
  assert.deepEqual(result.changes.map((change) => change.kind), ['div-to-markdown']);
});

test('escape: false 保留 Markdown 语法', () => {
  const input: JsonObject = {
    header: { title: { tag: 'plain_text', content: '**粗体**' } },
    body: {
      elements: [
        {
          tag: 'div',
          text: { tag: 'plain_text', content: '**粗体**' },
        },
      ],
    },
  };

  const result = upgradeTextToRichText(input, { escape: false });
  assert.deepEqual((result.card.header as JsonObject).title, {
    tag: 'lark_md',
    content: '**粗体**',
  });
  assert.deepEqual((result.card.body as JsonObject).elements, [
    { tag: 'markdown', content: '**粗体**' },
  ]);
  assert.equal(result.changes.some((change) => change.escaped), false);
});

test('嵌套容器 / 折叠面板 / checker / fallback_text 都会处理', () => {
  const input: JsonObject = {
    body: {
      elements: [
        {
          tag: 'column_set',
          columns: [
            {
              tag: 'column',
              elements: [
                {
                  tag: 'interactive_container',
                  elements: [
                    { tag: 'div', text: { tag: 'plain_text', content: 'A*' } },
                  ],
                },
              ],
            },
          ],
        },
        {
          tag: 'collapsible_panel',
          header: {
            title: {
              tag: 'plain_text',
              content: 'T*',
              text_color: 'red',
              i18n: { en_us: 'E*' },
            },
            expanded_title: { tag: 'plain_text', content: 'X' },
          },
          elements: [
            {
              tag: 'checker',
              text: { tag: 'plain_text', content: 'C', text_color: 'blue' },
            },
            {
              tag: 'fallback_text',
              text: { tag: 'plain_text', content: 'F' },
            },
          ],
        },
      ],
    },
  };

  const result = upgradeTextToRichText(input);
  const body = result.card.body as JsonObject;
  const elements = body.elements as JsonObject[];

  assert.deepEqual(elements[0], {
    tag: 'column_set',
    columns: [
      {
        tag: 'column',
        elements: [
          {
            tag: 'interactive_container',
            elements: [
              { tag: 'markdown', content: 'A&#42;' },
            ],
          },
        ],
      },
    ],
  });
  assert.deepEqual(elements[1], {
    tag: 'collapsible_panel',
    header: {
      title: {
        tag: 'lark_md',
        content: 'T&#42;',
        text_color: 'red',
        i18n: { en_us: 'E&#42;' },
      },
      expanded_title: { tag: 'lark_md', content: 'X' },
    },
    elements: [
      {
        tag: 'checker',
        text: { tag: 'lark_md', content: 'C', text_color: 'blue' },
      },
      {
        tag: 'fallback_text',
        text: { tag: 'lark_md', content: 'F' },
      },
    ],
  });
  assert.deepEqual(
    result.changes.map((change) => change.path),
    [
      ['body', 'elements', 0, 'columns', 0, 'elements', 0, 'elements', 0],
      ['body', 'elements', 1, 'header', 'title'],
      ['body', 'elements', 1, 'header', 'expanded_title'],
      ['body', 'elements', 1, 'elements', 0, 'text'],
      ['body', 'elements', 1, 'elements', 1, 'text'],
    ],
  );
  assert.deepEqual(result.changes[1]!.lost, ['text_color']);
  assert.deepEqual(result.changes[3]!.lost, ['text_color']);
});

test('plain_text 固定字段不处理：button / select / img / tips', () => {
  const input: JsonObject = {
    body: {
      elements: [
        {
          tag: 'button',
          text: { tag: 'plain_text', content: '**提交**' },
          hover_tips: { tag: 'plain_text', content: '提示' },
          disabled_tips: { tag: 'plain_text', content: '不可用' },
        },
        {
          tag: 'select_static',
          placeholder: { tag: 'plain_text', content: '请选择' },
          options: [{ text: { tag: 'plain_text', content: 'A' }, value: 'a' }],
        },
        {
          tag: 'img',
          img_key: 'img_v3_xxx',
          alt: { tag: 'plain_text', content: '图' },
          title: { tag: 'plain_text', content: '标题' },
        },
      ],
    },
  };

  const original = JSON.parse(JSON.stringify(input));
  const result = upgradeTextToRichText(input);
  assert.deepEqual(result.card, original);
  assert.deepEqual(result.changes, []);
});

test('element_id：text.element_id 上移；两者都有时保留组件级 ID', () => {
  const onlyText = upgradeTextToRichText({
    body: {
      elements: [
        {
          tag: 'div',
          text: { tag: 'plain_text', content: 'A', element_id: 'text_1' },
        },
      ],
    },
  });
  assert.deepEqual((onlyText.card.body as JsonObject).elements, [
    { tag: 'markdown', content: 'A', element_id: 'text_1' },
  ]);
  assert.deepEqual(onlyText.changes[0]!.mapped, {
    'text.element_id': 'element_id',
  });

  const both = upgradeTextToRichText({
    body: {
      elements: [
        {
          tag: 'div',
          element_id: 'div_1',
          text: { tag: 'plain_text', content: 'A', element_id: 'text_1' },
        },
      ],
    },
  });
  assert.deepEqual((both.card.body as JsonObject).elements, [
    { tag: 'markdown', content: 'A', element_id: 'div_1' },
  ]);
  assert.deepEqual(both.changes[0]!.lost, ['text.element_id']);
});

test('幂等：重复运行不会产生新的改动', () => {
  const input: JsonObject = {
    header: { title: { tag: 'plain_text', content: 'T*' } },
    body: {
      elements: [
        {
          tag: 'div',
          text: { tag: 'plain_text', content: 'D*', text_color: 'red' },
        },
        {
          tag: 'checker',
          text: { tag: 'plain_text', content: 'C' },
        },
      ],
    },
  };

  const first = upgradeTextToRichText(input);
  const second = upgradeTextToRichText(first.card);
  assert.deepEqual(second.card, first.card);
  assert.deepEqual(second.changes, []);
  assert.deepEqual(second.skipped, []);
});
