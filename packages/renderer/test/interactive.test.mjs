import assert from 'node:assert/strict';
import test from 'node:test';

import { renderDslToString } from '../dist/index.js';

const card = {
  schema: '2.0',
  body: {
    elements: [
      {
        tag: 'form',
        name: 'comment',
        elements: [
          {
            tag: 'input',
            name: 'comment',
            placeholder: { tag: 'plain_text', content: '备注' },
            default_value: 'hi',
          },
          {
            tag: 'button',
            type: 'primary',
            text: { tag: 'plain_text', content: '保存' },
            form_action_type: 'submit',
            behaviors: [{ type: 'callback', value: { __action_id: 'save' } }],
          },
        ],
      },
    ],
  },
};

test('默认预览里回调按钮不可点', () => {
  const html = renderDslToString(card);
  assert.match(html, /button--static/);
  assert.equal(html.includes('data-feishu-action'), false);
  assert.equal(html.includes('<button'), false);
});

test('interactive 把回调按钮和输入框变成真控件', () => {
  const html = renderDslToString(card, { interactive: true });
  assert.match(html, /<button[^>]*type="submit"[^>]*data-feishu-action="[^"]*__action_id[^"]*save/);
  assert.match(html, /<form[^>]*data-feishu-form="comment"/);
  assert.match(html, /<input[^>]*value="hi"[^>]*name="comment"/);
  assert.equal(html.includes('button--static'), false);
});
