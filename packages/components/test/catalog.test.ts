import assert from 'node:assert/strict';
import test from 'node:test';

import {
  Audio,
  Avatar,
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
  Overflow,
  Person,
  PersonList,
  PickerDate,
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
        jsx(Overflow, { text: '更多', options: [{ text: '复制', value: 'copy' }] }),
        jsx(MultiSelect, { name: 'tags', options: [{ label: '甲', value: 'a' }], selectedValues: ['a'] }),
        jsx(SelectPerson, { name: 'owner', options: ['ou_1'] }),
        jsx(MultiSelectPerson, { name: 'members', options: ['ou_1'], selectedValues: ['ou_1'] }),
        jsx(DatePicker, { name: 'day', initialDate: '2026-10-08' }),
        jsx(PickerDate, { name: 'day2', initialDate: '2026-10-08' }),
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
    'video',
    'fallback_text',
    'interactive_container',
    'collapsible_panel',
    'collapse_divider',
    'overflow',
    'multi_select_static',
    'select_person',
    'multi_select_person',
    'date_picker',
    'picker_date',
    'picker_time',
    'picker_datetime',
    'select_img',
    'checker',
  ]) {
    assert.ok(tags.includes(tag), `缺少 ${tag}`);
  }

  const image = card.body?.elements[0] as { img_key?: string; alt?: { content?: string }; scale_type?: string };
  assert.equal(image.img_key, 'img_a');
  assert.equal(image.alt?.content, '配图');
  assert.equal(image.scale_type, 'fit_horizontal');
  assert.equal(JSON.stringify(card).includes('function'), false);
});
