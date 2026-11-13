/**
 * 布局字段透传回归测试。
 *
 * 背景：components 包从 props 到 DSL 是**手写白名单**（逐个字段 compact({...}) 拼输出），
 * 不是透传。任何一个字段在 props 类型里有、但在 compact() 里没列出来，都会被静默丢弃，
 * 表现为「同一段参考卡片 JSON 用 TSX 重建后，真机效果对不上」。
 *
 * 这些用例锁定参考卡片片段里实际用到的布局字段，防止再次漏字段。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  Card,
  CollapsiblePanel,
  Column,
  ColumnSet,
  InteractiveContainer,
  Markdown,
  Select,
  jsx,
  renderToCard,
} from '../src/index.js';
import type { FeishuCardJson, FeishuElement } from '../src/types/card.js';

function firstElement(card: FeishuCardJson): FeishuElement {
  const el = card.body?.elements?.[0];
  assert.ok(el, 'card.body.elements[0] 应该存在');
  return el as FeishuElement;
}

test('interactive_container: 透传 horizontal_align / vertical_align / 两个 spacing', () => {
  const card = renderToCard(
    jsx(Card, {
      children: [
        jsx(InteractiveContainer, {
          width: 'fill',
          height: 'auto',
          direction: 'horizontal',
          horizontalAlign: 'center',
          verticalAlign: 'center',
          horizontalSpacing: '8px',
          verticalSpacing: '8px',
          padding: '10px 12px 10px 12px',
          hasBorder: true,
          borderColor: 'grey-300',
          cornerRadius: '8px',
          children: jsx(Markdown, { content: 'x' }),
        }),
      ],
    }),
  );

  const el = firstElement(card) as unknown as Record<string, unknown>;
  assert.equal(el.tag, 'interactive_container');
  assert.equal(el.direction, 'horizontal');
  assert.equal(el.horizontal_align, 'center');
  assert.equal(el.vertical_align, 'center');
  assert.equal(el.horizontal_spacing, '8px');
  assert.equal(el.vertical_spacing, '8px');
  // 回归：这些原本就在白名单里，不能因为加字段被破坏
  assert.equal(el.width, 'fill');
  assert.equal(el.height, 'auto');
  assert.equal(el.padding, '10px 12px 10px 12px');
  assert.equal(el.has_border, true);
  assert.equal(el.border_color, 'grey-300');
  assert.equal(el.corner_radius, '8px');
});

test('column: 透传 horizontal_align / horizontal_spacing', () => {
  const card = renderToCard(
    jsx(Card, {
      children: [
        jsx(ColumnSet, {
          children: [
            jsx(Column, {
              width: 'weighted',
              weight: 1,
              direction: 'vertical',
              horizontalAlign: 'left',
              verticalAlign: 'top',
              horizontalSpacing: '8px',
              verticalSpacing: '4px',
              padding: '12px',
              backgroundStyle: 'cv_accent_2',
              children: jsx(Markdown, { content: 'x' }),
            }),
          ],
        }),
      ],
    }),
  );

  const columnSet = firstElement(card) as unknown as Record<string, unknown>;
  const columns = columnSet.columns as Array<Record<string, unknown>>;
  assert.equal(columns.length, 1);
  const col = columns[0]!;
  assert.equal(col.horizontal_align, 'left');
  assert.equal(col.horizontal_spacing, '8px');
  assert.equal(col.vertical_align, 'top');
  assert.equal(col.vertical_spacing, '4px');
  assert.equal(col.direction, 'vertical');
});

test('column_set: 不透传 vertical_align（真机 column_set 无垂直对齐）', () => {
  const card = renderToCard(
    jsx(Card, {
      children: [
        jsx(ColumnSet, {
          flexMode: 'stretch',
          horizontalAlign: 'left',
          horizontalSpacing: '8px',
          backgroundStyle: 'default',
          children: [
            jsx(Column, { verticalAlign: 'center', children: jsx(Markdown, { content: 'x' }) }),
          ],
        }),
      ],
    }),
  );

  const el = firstElement(card) as unknown as Record<string, unknown>;
  const columns = el.columns as Array<Record<string, unknown>>;
  // 飞书网页版引擎对 column_set 走 disableVerticalConfig，垂直对齐写在这一级不生效；
  // 正确写法是落到列上。
  assert.equal('vertical_align' in el, false);
  assert.equal(el.horizontal_align, 'left');
  assert.equal(el.flex_mode, 'stretch');
  assert.equal(el.horizontal_spacing, '8px');
  assert.equal(columns[0]!.vertical_align, 'center');
});

test('icon: size 必须透传（标准图标与自定义图标）', () => {
  const card = renderToCard(
    jsx(Card, {
      children: [
        jsx(Markdown, {
          content: 'x',
          icon: { tag: 'standard_icon', token: 'chat_outlined', color: 'grey', size: '10px 10px' },
        }),
      ],
    }),
  );

  const el = firstElement(card) as unknown as Record<string, unknown>;
  const icon = el.icon as Record<string, unknown>;
  assert.equal(icon.token, 'chat_outlined');
  assert.equal(icon.color, 'grey');
  // 丢掉 size 会让渲染器回落 16px，与真机 10px 对不上
  assert.equal(icon.size, '10px 10px');
});

test('collapsible_panel: header.padding 与 expanded_title 落在 header 内，不是顶层', () => {
  const card = renderToCard(
    jsx(Card, {
      children: [
        jsx(CollapsiblePanel, {
          title: '展开标题',
          expandedTitle: '收起标题',
          expanded: false,
          icon: { tag: 'standard_icon', token: 'down_outlined', color: 'grey', size: '10px 10px' },
          iconPosition: 'follow_text',
          iconExpandedAngle: 180,
          backgroundColor: 'cv_panel',
          padding: '4px',
          headerPadding: '8px 12px 8px 12px',
          children: jsx(Markdown, { content: 'z' }),
        }),
      ],
    }),
  );

  const el = firstElement(card) as unknown as Record<string, unknown>;
  const header = el.header as Record<string, unknown>;

  // 面板级 padding 在顶层
  assert.equal(el.padding, '4px');
  // 标题区 padding 在 header 内——放错层级会让标题区内边距完全失效
  assert.equal(header.padding, '8px 12px 8px 12px');
  assert.equal((header.title as Record<string, unknown>).content, '展开标题');
  assert.equal((header.expanded_title as Record<string, unknown>).content, '收起标题');
  assert.equal((header.icon as Record<string, unknown>).size, '10px 10px');
});

test('collapsible_panel: 不写 expandedTitle 时不输出 expanded_title', () => {
  const card = renderToCard(
    jsx(Card, {
      children: [jsx(CollapsiblePanel, { title: '只有标题', children: jsx(Markdown, { content: 'z' }) })],
    }),
  );
  const header = (firstElement(card) as unknown as Record<string, unknown>).header as Record<string, unknown>;
  assert.equal('expanded_title' in header, false);
});

test('collapsible_panel: header.width / vertical_align / position 落在 header 内，布局四件套在顶层', () => {
  const card = renderToCard(
    jsx(Card, {
      children: [
        jsx(CollapsiblePanel, {
          title: '标题',
          expanded: true,
          headerWidth: 'auto_when_fold',
          headerVerticalAlign: 'top',
          headerPosition: 'bottom',
          direction: 'horizontal',
          horizontalAlign: 'center',
          verticalAlign: 'bottom',
          horizontalSpacing: '8px',
          verticalSpacing: '4px',
          children: jsx(Markdown, { content: 'z' }),
        }),
      ],
    }),
  );

  const el = firstElement(card) as unknown as Record<string, unknown>;
  const header = el.header as Record<string, unknown>;
  // header 内字段放错层级会被当作未知属性丢掉，真机上宽度/位置/垂直对齐就失效了
  assert.equal(header.width, 'auto_when_fold');
  assert.equal(header.vertical_align, 'top');
  assert.equal(header.position, 'bottom');
  assert.equal('width' in el, false);
  assert.equal('position' in el, false);
  // 面板级布局四件套
  assert.equal(el.direction, 'horizontal');
  assert.equal(el.horizontal_align, 'center');
  assert.equal(el.vertical_align, 'bottom');
  assert.equal(el.horizontal_spacing, '8px');
  assert.equal(el.vertical_spacing, '4px');
});

test('select_static: 透传组件 type 与选项 icon', () => {
  const card = renderToCard(
    jsx(Card, {
      children: [
        jsx(Select, {
          name: 's',
          type: 'text',
          options: [
            {
              text: '选项一',
              value: 'a',
              icon: { tag: 'standard_icon', token: 'chat_outlined', color: 'orange', size: '10px 10px' },
            },
          ],
        }),
      ],
    }),
  );

  const el = firstElement(card) as unknown as Record<string, unknown>;
  assert.equal(el.type, 'text');
  const options = el.options as Array<Record<string, unknown>>;
  const icon = options[0]!.icon as Record<string, unknown>;
  assert.equal(icon.token, 'chat_outlined');
  assert.equal(icon.color, 'orange');
  assert.equal(icon.size, '10px 10px');
});
