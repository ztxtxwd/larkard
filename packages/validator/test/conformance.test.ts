/**
 * Zod 公开 DSL ↔ 官方 card-schema.json 一致性测试。
 * 官方 schema 使用非标准 `$def`，因此用本目录轻量校验器而非 ajv。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FeishuCardV2Schema } from '@open-feishu-card/schema';
import {
  validateOfficialCard,
  type JsonValue,
} from './official-schema-validator.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const officialSchema = JSON.parse(
  readFileSync(join(HERE, 'fixtures/official-card-schema.json'), 'utf8'),
) as JsonValue;

function assertZodOk(card: unknown, label: string): void {
  const r = FeishuCardV2Schema.safeParse(card);
  assert.equal(
    r.success,
    true,
    `${label}: Zod 失败 ${JSON.stringify(r.error?.issues?.slice(0, 3))}`,
  );
}

function assertOfficialOk(card: unknown, label: string): void {
  const issues = validateOfficialCard(card as JsonValue, officialSchema);
  assert.equal(
    issues.length,
    0,
    `${label}: 官方 schema 失败\n${issues
      .slice(0, 8)
      .map((i) => `${i.path} ${i.keyword} ${i.message}`)
      .join('\n')}`,
  );
}

function assertBoth(card: unknown, label: string): void {
  assertZodOk(card, label);
  assertOfficialOk(card, label);
}

test('conformance: 基础 markdown 卡片同时通过 Zod 与官方 schema', () => {
  assertBoth(
    {
      schema: '2.0',
      config: { update_multi: true, width_mode: 'fill' },
      header: {
        title: { tag: 'plain_text', content: '标题' },
        template: 'blue',
      },
      body: {
        elements: [
          { tag: 'markdown', content: '你好 **世界**' },
          { tag: 'hr' },
          {
            tag: 'button',
            type: 'primary',
            text: { tag: 'plain_text', content: '打开' },
            behaviors: [
              {
                type: 'open_url',
                default_url: 'https://open.feishu.cn',
              },
            ],
          },
        ],
      },
    },
    'basic',
  );
});

test('conformance: 容器/交互常用组件同时通过两边', () => {
  assertBoth(
    {
      schema: '2.0',
      body: {
        elements: [
          {
            tag: 'column_set',
            vertical_align: 'center',
            columns: [
              {
                tag: 'column',
                width: 'weighted',
                weight: 1,
                elements: [
                  {
                    tag: 'div',
                    text: {
                      tag: 'plain_text',
                      content: 'KPI',
                    },
                  },
                ],
              },
            ],
          },
          {
            tag: 'interactive_container',
            disabled: true,
            has_border: true,
            // 官方 schema 仍标 behaviors 必填；公开 DSL 对 disabled 容器豁免
            behaviors: [],
            elements: [{ tag: 'markdown', content: '强调块' }],
          },
          {
            tag: 'form',
            name: 'f1',
            elements: [
              {
                tag: 'input',
                name: 'note',
                placeholder: { tag: 'plain_text', content: '备注' },
              },
              {
                tag: 'button',
                name: 'submit',
                form_action_type: 'submit',
                text: { tag: 'plain_text', content: '提交' },
                type: 'primary',
              },
            ],
          },
          {
            tag: 'collapsible_panel',
            expanded: false,
            direction: 'vertical',
            horizontal_align: 'left',
            vertical_align: 'top',
            horizontal_spacing: '8px',
            vertical_spacing: '4px',
            background_color: 'grey-50',
            border: { color: 'grey-200', corner_radius: '8px' },
            header: {
              title: { tag: 'lark_md', content: '**更多**', text_align: 'left' },
              expanded_title: { tag: 'plain_text', content: '收起' },
              background_color: 'grey-100',
              width: 'auto_when_fold',
              vertical_align: 'top',
              position: 'bottom',
              padding: '8px 12px 8px 12px',
              icon: { tag: 'standard_icon', token: 'down-bold_outlined' },
              icon_position: 'right',
              icon_expanded_angle: -180,
            },
            elements: [
              { tag: 'collapse_divider' },
              { tag: 'markdown', content: '折叠内容' },
            ],
          },
          {
            tag: 'person',
            user_id: 'ou_demo',
            size: 'medium',
            notation: { tag: 'plain_text', content: '负责人' },
          },
          {
            tag: 'person_list',
            persons: [{ id: 'ou_a' }, { id: 'ou_b' }],
            mode: 'nameAvatar',
            show_avatar: true,
            show_name: true,
          },
          {
            tag: 'fallback_text',
            text: { tag: 'plain_text', content: '兜底' },
          },
        ],
      },
    },
    'containers',
  );
});

test('conformance: img_combination / select_img 两边都接受', () => {
  assertBoth(
    {
      schema: '2.0',
      body: {
        elements: [
          {
            tag: 'img_combination',
            combination_mode: 'double',
            img_list: [
              { img_key: 'img_demo_a' },
              { img_key: 'img_demo_b', transparent: true },
            ],
            combination_transparent: false,
            corner_radius: '8px',
          },
          {
            tag: 'form',
            name: 'f1',
            elements: [
              {
                tag: 'select_img',
                name: 'pick',
                options: [
                  { img_key: 'img_demo_a', value: 'a', transparent: true },
                  {
                    img_key: 'img_demo_b',
                    value: 'b',
                    disabled: true,
                    disabled_tips: { tag: 'plain_text', content: '不可选' },
                  },
                ],
                style: 'default',
                layout: 'bisect',
                multi_select: true,
                selected_values: ['a'],
                aspect_ratio: '1:1',
                can_preview: true,
              },
            ],
          },
        ],
      },
    },
    'multi-image',
  );
});

test('conformance: 已知分歧——官方 overflow.variable / form 内 select.behaviors 过严', () => {
  const card = {
    schema: '2.0',
    body: {
      elements: [
        {
          tag: 'overflow',
          options: [
            {
              text: { tag: 'plain_text', content: '更多操作' },
              value: 'more',
            },
          ],
          behaviors: [{ type: 'callback', value: { a: 1 } }],
        },
        {
          tag: 'form',
          name: 'f1',
          elements: [
            {
              tag: 'select_static',
              name: 'choice',
              options: [
                {
                  text: { tag: 'plain_text', content: 'A' },
                  value: 'a',
                },
              ],
            },
            {
              tag: 'button',
              name: 'submit',
              form_action_type: 'submit',
              text: { tag: 'plain_text', content: '提交' },
              type: 'primary',
            },
          ],
        },
      ],
    },
  };
  assertZodOk(card, 'overflow-form-public');
  const issues = validateOfficialCard(card as JsonValue, officialSchema);
  assert.ok(
    issues.some((i) => i.message.includes('variable') || i.path.includes('behaviors')),
    `期望官方因 variable/behaviors 过严失败，实际：${JSON.stringify(issues)}`,
  );
});

test('conformance: date_picker 两边都接受（客户端渲染 tag）', () => {
  assertBoth(
    {
      schema: '2.0',
      body: {
        elements: [
          {
            tag: 'date_picker',
            initial_date: '2026-09-01',
            behaviors: [{ type: 'callback', value: {} }],
          },
        ],
      },
    },
    'date_picker',
  );
});

test('conformance: 已知分歧——官方 Avatar 过度 required（custom_size*）', () => {
  const publicShape = {
    schema: '2.0',
    body: {
      elements: [{ tag: 'avatar', user_id: 'ou_demo', size: 'medium' }],
    },
  };
  assertZodOk(publicShape, 'avatar-public');
  const issues = validateOfficialCard(publicShape as JsonValue, officialSchema);
  assert.ok(
    issues.some(
      (i) => i.keyword === 'required' && i.message.includes('custom_size'),
    ),
    `期望官方因 custom_size 必填失败，实际：${JSON.stringify(issues)}`,
  );

  assertBoth(
    {
      schema: '2.0',
      body: {
        elements: [
          {
            tag: 'avatar',
            user_id: 'ou_demo',
            size: 'medium',
            custom_size: 32,
            custom_size2: 32,
          },
        ],
      },
    },
    'avatar-official-shaped',
  );
});

test('conformance: 已知分歧——note 是客户端仍渲染的旧版组件（官方 2.0 schema 不认）', () => {
  const card = {
    schema: '2.0',
    body: {
      elements: [
        {
          tag: 'note',
          is_footer: true,
          elements: [
            { tag: 'standard_icon', token: 'info_outlined', color: 'grey' },
            { tag: 'plain_text', content: '备注信息' },
          ],
        },
      ],
    },
  };
  // 本项目把 note 视为 Schema 2.0 的一部分（客户端 RAW/回读仍会下发）；
  // 官方公开 schema 已移除该 tag，因此只要求 Zod 放行。
  assertZodOk(card, 'note-legacy');
  const issues = validateOfficialCard(card as JsonValue, officialSchema);
  assert.ok(
    issues.length > 0,
    `期望官方 schema 拒绝 note（用于记录已知分歧），实际：${JSON.stringify(issues)}`,
  );
});

test('conformance: 项目扩展字段官方会报 additionalProperties', () => {
  const card = {
    schema: '2.0',
    body: {
      elements: [
        {
          tag: 'audio',
          file_key: 'file_x',
          i18n_file_key: { en_us: 'file_en' },
          fallback: 'drop' as const,
        },
      ],
    },
  };
  assertZodOk(card, 'audio-ext');
  const issues = validateOfficialCard(card as JsonValue, officialSchema);
  assert.ok(
    issues.some((i) => i.keyword === 'additionalProperties'),
    `期望官方拒绝扩展字段，实际：${JSON.stringify(issues)}`,
  );
});
