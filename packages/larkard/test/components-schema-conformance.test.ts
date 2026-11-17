/**
 * components 产出的卡片必须能通过 schema 校验。
 *
 * components 的 props → DSL 是手写白名单，最容易出现「TSX 里写了、序列化时丢了」
 * 或「序列化出的字段 schema 不认」。这里用一份覆盖常用组件的卡片做契约测试：
 * renderToCard 的输出直接喂给 FeishuCardV2Schema，字段漂移会在这里失败。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { FeishuCardV2Schema } from '../src/schema/index.js';

import {
  Button,
  Card,
  Column,
  ColumnSet,
  Header,
  Image,
  InteractiveContainer,
  Markdown,
  Note,
  Person,
  Table,
  bindAction,
  jsx,
  registerAction,
  renderToCard,
} from '../src/components/index.js';

function like(id: string) {
  return { id };
}
registerAction('conformance.like', like);

test('renderToCard 输出通过 Schema 2.0 校验', () => {
  const card = renderToCard(
    jsx(Card, {
      headerTheme: 'blue',
      config: { update_multi: true, width_mode: 'fill' },
      children: [
        jsx(Header, { title: '契约测试', subtitle: 'components → DSL' }),
        jsx(Markdown, { content: '**hello** <at id=all></at>' }),
        jsx(ColumnSet, {
          flexMode: 'bisect',
          children: [
            jsx(Column, { width: 'weighted', weight: 1, children: jsx(Markdown, { content: '左' }) }),
            jsx(Column, { width: 'weighted', weight: 1, children: jsx(Markdown, { content: '右' }) }),
          ],
        }),
        jsx(InteractiveContainer, {
          url: 'https://open.feishu.cn',
          children: jsx(Markdown, { content: '可点区域' }),
        }),
        jsx(Image, { imgKey: 'img_v3_conformance', alt: '配图', scaleType: 'fit_horizontal' }),
        jsx(Person, { userId: 'ou_conformance', showName: true }),
        jsx(Table, {
          columns: [{ name: 'owner', displayName: '负责人', dataType: 'persons' }],
          rows: [{ owner: 'ou_conformance' }],
        }),
        jsx(Button, {
          type: 'primary',
          action: bindAction(like, 'REQ-1'),
          children: '同意',
        }),
        jsx(Note, { isFooter: true, children: jsx(Markdown, { content: '脚注' }) }),
      ],
    }),
  );

  const result = FeishuCardV2Schema.safeParse(card);
  assert.equal(
    result.success,
    true,
    result.success ? '' : `schema 校验失败：${JSON.stringify(result.error.issues.slice(0, 5), null, 2)}`,
  );
});
