import assert from 'node:assert/strict';
import test from 'node:test';

import {
  Audio,
  Avatar,
  Blockquote,
  Chart,
  Checker,
  CollapseDivider,
  CollapsiblePanel,
  DatePicker,
  DateTimePicker,
  FallbackText,
  Image,
  ImgCombination,
  InteractiveContainer,
  Markdown,
  MultiSelect,
  MultiSelectPerson,
  Note,
  Overflow,
  Person,
  PersonList,
  SelectImg,
  SelectPerson,
  Table,
  TimePicker,
  Video,
  jsx,
  renderToCard,
} from '../src/index.js';
import { Card } from '../src/components/index.js';
import type { FeishuCardJson, FeishuElement } from '../src/types/card.js';
import type { ImageProps } from '../src/types/props.js';

function tagsOf(card: FeishuCardJson): string[] {
  const tags: string[] = [];
  const walk = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (value && typeof value === 'object' && 'tag' in value) {
      tags.push(String((value as FeishuElement).tag));
      for (const child of Object.values(value)) walk(child);
    }
  };
  walk(card.body?.elements);
  return tags;
}

test('JSON 2.0 组件都能序列化出官方 tag', () => {
  const card = renderToCard(
    jsx(Card, {
      children: [
        jsx(Image, { imgKey: 'img_a', alt: '配图', scaleType: 'fit_horizontal' }),
        jsx(ImgCombination, { mode: 'double', images: ['img_a', 'img_b'] }),
        jsx(Person, { userId: 'ou_1', showName: true }),
        jsx(PersonList, { persons: ['ou_1', 'ou_2'] }),
        jsx(Avatar, { userId: 'ou_1' }),
        jsx(Chart, { spec: { type: 'line' }, aspectRatio: '16:9' }),
        jsx(Table, {
          columns: [{ name: 'owner', displayName: '负责人', dataType: 'persons' }],
          rows: [{ owner: 'ou_1' }],
        }),
        jsx(Audio, { fileKey: 'file_a', fallback: '暂不支持音频' }),
        jsx(Video, { fileKey: 'file_v', cover: 'img_cover' }),
        jsx(FallbackText, { text: '降级文案' }),
        jsx(InteractiveContainer, { url: 'https://open.feishu.cn', children: jsx(Markdown, { content: '可点' }) }),
        jsx(CollapsiblePanel, {
          title: '备注',
          icon: 'down-bold_outlined',
          iconPosition: 'right',
          iconExpandedAngle: -180,
          children: [jsx(Markdown, { content: '细节' }), jsx(CollapseDivider, {})],
        }),
        jsx(Note, { isFooter: true, children: jsx(Markdown, { content: '脚注说明' }) }),
        jsx(Blockquote, { children: jsx(Markdown, { content: '引用内容' }) }),
        jsx(Overflow, { text: '更多', options: [{ text: '复制', value: 'copy' }] }),
        jsx(MultiSelect, { name: 'tags', options: [{ label: '甲', value: 'a' }], selectedValues: ['a'] }),
        jsx(SelectPerson, { name: 'owner', options: ['ou_1'] }),
        jsx(MultiSelectPerson, { name: 'members', options: ['ou_1'], selectedValues: ['ou_1'] }),
        jsx(DatePicker, { name: 'day', initialDate: '2026-10-08' }),
        jsx(TimePicker, { name: 'clock', initialTime: '09:30' }),
        jsx(DateTimePicker, { name: 'at', initialDatetime: '2026-10-08 09:30' }),
        jsx(SelectImg, { options: [{ imgKey: 'img_a', value: 'a' }], multiSelect: true }),
        jsx(Checker, { name: 'done', text: '完成', checked: false }),
      ],
    }),
  );

  const tags = tagsOf(card);
  for (const tag of [
    'img',
    'img_combination',
    'person',
    'person_list',
    'avatar',
    'chart',
    'table',
    'audio',
    'blockquote',
    'video',
    'fallback_text',
    'interactive_container',
    'collapsible_panel',
    'collapse_divider',
    'note',
    'overflow',
    'multi_select_static',
    'select_person',
    'multi_select_person',
    'date_picker',
    'picker_time',
    'picker_datetime',
    'select_img',
    'checker',
  ]) {
    assert.ok(tags.includes(tag), `缺少 ${tag}`);
  }

  const image = card.body?.elements[0] as {
    img_key?: string;
    alt?: { content?: string };
    scale_type?: string;
    mode?: string;
  };
  assert.equal(image.img_key, 'img_a');
  assert.equal(image.alt?.content, '配图');
  assert.equal(image.scale_type, 'fit_horizontal');
  assert.equal(image.mode, undefined);
  assert.equal(JSON.stringify(card).includes('function'), false);

  const note = (card.body?.elements ?? []).find((el) => (el as { tag: string }).tag === 'note') as
    | { tag: string; is_footer?: boolean; elements?: Array<{ tag: string }> }
    | undefined;
  assert.ok(note, '应包含 note 元素');
  assert.equal(note?.is_footer, true);
  assert.equal(note?.elements?.[0]?.tag, 'markdown');

  const quote = (card.body?.elements ?? []).find((el) => (el as { tag: string }).tag === 'blockquote') as
    | { tag: string; elements?: Array<{ tag: string }> }
    | undefined;
  assert.ok(quote, '应包含 blockquote 元素');
  assert.equal(quote?.elements?.[0]?.tag, 'markdown');
});

test('img 缩放走 scale_type；历史 mode 只保留尺寸值', () => {
  const renderImage = (props: Record<string, unknown>) =>
    renderToCard(
      jsx(Card, {
        children: [jsx(Image, { imgKey: 'img_x', alt: '图', ...props } as unknown as ImageProps)],
      }),
    ).body?.elements[0] as { mode?: string; scale_type?: string; size?: string };

  // scaleType 直接进 scale_type，绝不写 mode（官方 mode 枚举里没有 crop_top）。
  const cropTop = renderImage({ scaleType: 'crop_top' });
  assert.equal(cropTop.scale_type, 'crop_top');
  assert.equal(cropTop.mode, undefined);

  const fit = renderImage({ scaleType: 'fit_horizontal' });
  assert.equal(fit.scale_type, 'fit_horizontal');
  assert.equal(fit.mode, undefined);

  // 集合外的取值也只进 scale_type，不会掉进 mode。
  const unknown = renderImage({ scaleType: 'crop_bottom' });
  assert.equal(unknown.scale_type, 'crop_bottom');
  assert.equal(unknown.mode, undefined);

  // 历史 mode：缩放值按缩放处理，尺寸值原样保留给旧模板。
  const legacyScale = renderImage({ mode: 'fit_horizontal' });
  assert.equal(legacyScale.scale_type, 'fit_horizontal');
  assert.equal(legacyScale.mode, undefined);

  const legacySize = renderImage({ mode: 'large' });
  assert.equal(legacySize.mode, 'large');
  assert.equal(legacySize.scale_type, undefined);
});

test('img_combination / select_img 透传图片 ID、transparent 与提示文案', () => {
  const card = renderToCard(
    jsx(Card, {
      children: [
        jsx(ImgCombination, {
          mode: 'double',
          images: [
            { imgKey: 'img_a', imgId: 'id_a', transparent: true },
            'img_b',
          ],
          cornerRadius: '8px',
        }),
        jsx(SelectImg, {
          options: [{
            imgKey: 'img_a',
            imgId: 'id_a',
            value: 'a',
            disabled: true,
            disabledTips: '不可选',
            hoverTips: '悬浮',
            transparent: true,
          }],
          disabledTips: '整体禁用',
        }),
      ],
    }),
  );

  const combo = card.body?.elements[0] as {
    img_list?: Array<Record<string, unknown>>;
    corner_radius?: string;
  };
  assert.deepEqual(combo.img_list, [
    { img_key: 'img_a', img_id: 'id_a', transparent: true },
    { img_key: 'img_b' },
  ]);
  assert.equal(combo.corner_radius, '8px');

  const select = card.body?.elements[1] as {
    options?: Array<Record<string, unknown>>;
    disabled_tips?: unknown;
  };
  assert.deepEqual(select.options, [{
    img_key: 'img_a',
    img_id: 'id_a',
    value: 'a',
    disabled: true,
    disabled_tips: { tag: 'plain_text', content: '不可选' },
    hover_tips: { tag: 'plain_text', content: '悬浮' },
    transparent: true,
  }]);
  assert.deepEqual(select.disabled_tips, { tag: 'plain_text', content: '整体禁用' });
});
