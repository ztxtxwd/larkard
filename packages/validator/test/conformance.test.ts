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
            header: {
              title: { tag: 'plain_text', content: '更多' },
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
