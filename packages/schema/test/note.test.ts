import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FeishuCardV2Schema, NoteSchema } from '../src/index.js';

test('note 纳入 Schema 2.0：图标/图片/文本/富文本子项均合法', () => {
  const card = {
    schema: '2.0',
    body: {
      elements: [
        {
          tag: 'note',
          element_id: 'footer_note',
          margin: '4px 0px',
          is_footer: true,
          elements: [
            { tag: 'standard_icon', token: 'info_outlined', color: 'grey' },
            {
              tag: 'custom_icon',
              img_key: 'img_v2_041b28e3',
            },
            { tag: 'plain_text', content: '备注信息1' },
            { tag: 'lark_md', content: '**备注**信息2' },
            {
              tag: 'img',
              img_key: 'img_v2_041b28e3',
              alt: { tag: 'plain_text', content: '备注图片' },
            },
            { tag: 'markdown', content: '脚注说明' },
          ],
        },
      ],
    },
  };

  const result = FeishuCardV2Schema.safeParse(card);
  assert.equal(result.success, true, JSON.stringify(result.error?.issues));

  const note = NoteSchema.parse(card.body.elements[0]);
  assert.equal(note.is_footer, true);
  assert.equal(note.element_id, 'footer_note');
  assert.equal(note.elements?.length, 6);
  assert.equal(note.elements?.[0]?.tag, 'standard_icon');
  assert.equal(note.elements?.[2]?.tag, 'plain_text');
});

test('note 拒绝备注不支持的容器组件', () => {
  const result = NoteSchema.safeParse({
    tag: 'note',
    elements: [{ tag: 'column_set', columns: [] }],
  });
  assert.equal(result.success, false);
});

test('note 允许不写 elements（空备注块）', () => {
  const result = NoteSchema.safeParse({ tag: 'note' });
  assert.equal(result.success, true);
});
