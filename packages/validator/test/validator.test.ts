import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ICON_TOKENS, IconTokenSchema } from '@open-feishu-card/schema';
import { validate } from '../src/index.js';

const OK = `{
  "schema": "2.0",
  "config": { "update_multi": true },
  "body": { "elements": [ { "tag": "markdown", "content": "hello" } ] }
}`;

test('valid card passes', () => {
  const ds = validate(OK);
  assert.equal(ds.length, 0);
});

test('schema violation points to exact node', () => {
  const src = OK.replace('"markdown"', '"not_a_tag"');
  const ds = validate(src);
  assert.ok(ds.length > 0);
  const d = ds.find((x) => x.severity === 'error')!;
  assert.equal(d.range.start.line, 4);
});

test('syntax error is reported with position', () => {
  const ds = validate('{ "a": }');
  assert.ok(ds.some((d) => d.message.includes('语法错误') || d.severity === 'error'));
});

test('deprecated props produce warnings', () => {
  const ds = validate(`{
    "schema": "2.0",
    "body": { "elements": [ { "tag": "markdown", "content": "hi" } ] },
    "i18n_elements": {}
  }`);
  assert.ok(ds.some((d) => d.code === 'deprecated-prop'));
});

test('表单外 button 缺 behaviors 报错', () => {
  const ds = validate(`{
    "schema": "2.0",
    "body": {
      "elements": [
        {
          "tag": "button",
          "text": { "tag": "plain_text", "content": "去看看" },
          "type": "primary"
        }
      ]
    }
  }`);
  assert.ok(
    ds.some(
      (d) =>
        d.severity === 'error' &&
        d.path.includes('behaviors') &&
        d.message.includes('表单外'),
    ),
    JSON.stringify(ds),
  );
});

test('form 内 button/select 可不写 behaviors', () => {
  const ds = validate(`{
    "schema": "2.0",
    "body": {
      "elements": [
        {
          "tag": "form",
          "name": "f1",
          "elements": [
            {
              "tag": "select_static",
              "name": "t",
              "options": [
                { "text": { "tag": "plain_text", "content": "A" }, "value": "a" }
              ]
            },
            {
              "tag": "button",
              "text": { "tag": "plain_text", "content": "提交" },
              "type": "primary",
              "name": "submit",
              "form_action_type": "submit"
            }
          ]
        }
      ]
    }
  }`);
  assert.equal(
    ds.filter((d) => d.severity === 'error').length,
    0,
    JSON.stringify(ds),
  );
});

test('接受官方对齐的 avatar / date_picker / fallback_text / collapse_divider', () => {
  const ds = validate(`{
    "schema": "2.0",
    "body": {
      "elements": [
        { "tag": "avatar", "user_id": "ou_demo", "size": "medium" },
        {
          "tag": "date_picker",
          "initial_date": "2026-09-01",
          "behaviors": [{ "type": "callback", "value": { "k": "v" } }]
        },
        {
          "tag": "fallback_text",
          "text": { "tag": "plain_text", "content": "兜底文案" }
        },
        {
          "tag": "collapsible_panel",
          "header": {
            "title": { "tag": "plain_text", "content": "详情" }
          },
          "elements": [
            { "tag": "collapse_divider" },
            { "tag": "markdown", "content": "内容" }
          ]
        }
      ]
    }
  }`);
  assert.equal(
    ds.filter((d) => d.severity === 'error').length,
    0,
    JSON.stringify(ds),
  );
});

test('交互件可声明 disabled_tips / selected_values / overflow 扩展字段', () => {
  const ds = validate(`{
    "schema": "2.0",
    "body": {
      "elements": [
        {
          "tag": "select_static",
          "behaviors": [{ "type": "callback", "value": {} }],
          "disabled": true,
          "disabled_tips": { "tag": "plain_text", "content": "不可用" },
          "options": [
            { "text": { "tag": "plain_text", "content": "A" }, "value": "a" }
          ]
        },
        {
          "tag": "select_img",
          "behaviors": [{ "type": "callback", "value": {} }],
          "style": "laser",
          "width": "fill",
          "selected_values": ["img1"],
          "options": [{ "img_key": "img_x", "value": "img1" }]
        },
        {
          "tag": "overflow",
          "name": "more",
          "disabled": false,
          "text": { "tag": "plain_text", "content": "更多" },
          "options": [
            {
              "text": { "tag": "plain_text", "content": "打开" },
              "value": "open"
            }
          ],
          "behaviors": [{ "type": "callback", "value": {} }]
        },
        {
          "tag": "column_set",
          "vertical_align": "center",
          "columns": [
            {
              "tag": "column",
              "width": "auto",
              "elements": [
                {
                  "tag": "person",
                  "user_id": "ou_demo",
                  "notation": { "tag": "plain_text", "content": "负责人" }
                }
              ]
            }
          ]
        }
      ]
    }
  }`);
  assert.equal(
    ds.filter((d) => d.severity === 'error').length,
    0,
    JSON.stringify(ds),
  );
});

test('form 内 column_set 嵌套的 button 也可省略 behaviors', () => {
  const ds = validate(`{
    "schema": "2.0",
    "body": {
      "elements": [
        {
          "tag": "form",
          "name": "f1",
          "elements": [
            {
              "tag": "column_set",
              "columns": [
                {
                  "tag": "column",
                  "width": "weighted",
                  "weight": 1,
                  "elements": [
                    {
                      "tag": "button",
                      "width": "fill",
                      "text": { "tag": "plain_text", "content": "同意" },
                      "type": "primary",
                      "name": "ok",
                      "form_action_type": "submit"
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  }`);
  assert.equal(
    ds.filter((d) => d.severity === 'error').length,
    0,
    JSON.stringify(ds),
  );
});

test('builder envelope unwraps dsl for schema validation', () => {
  const ds = validate(`{
    "name": "demo",
    "dsl": {
      "schema": "2.0",
      "body": { "elements": [{ "tag": "markdown", "content": "hi" }] }
    },
    "variables": []
  }`);
  assert.equal(ds.filter((d) => d.severity === 'error').length, 0, JSON.stringify(ds));
});

test('builder envelope maps schema errors into /dsl paths', () => {
  const ds = validate(`{
    "name": "demo",
    "dsl": {
      "schema": "2.0",
      "body": { "elements": [{ "tag": "not_a_tag", "content": "x" }] }
    },
    "variables": []
  }`);
  const err = ds.find((d) => d.severity === 'error')!;
  assert.ok(err, JSON.stringify(ds));
  assert.ok(err.path.startsWith('/dsl/'), err.path);
  assert.equal(err.range.start.line, 5);
});

test('builder envelope rejects non-array variables', () => {
  const ds = validate(`{
    "name": "demo",
    "dsl": { "schema": "2.0", "body": { "elements": [] } },
    "variables": {}
  }`);
  assert.ok(ds.some((d) => d.code === 'builder-envelope' && d.path === '/variables'));
});

test('builder deprecated prop path is prefixed with /dsl', () => {
  const ds = validate(`{
    "name": "demo",
    "dsl": {
      "schema": "2.0",
      "body": { "elements": [{ "tag": "markdown", "content": "hi" }] },
      "i18n_elements": {}
    },
    "variables": []
  }`);
  const w = ds.find((d) => d.code === 'deprecated-prop')!;
  assert.ok(w);
  assert.equal(w.path, '/dsl/i18n_elements');
});

test('图标 token：清单内的前缀图标不被判非法，清单外 token 报错', () => {
  // 回归：以下 token 曾因枚举落后于客户端图标清单而被 zod 判为 error。
  for (const token of [
    'ai-common_colorful', 'approval_colorful',
    'chat-loading_outlined', 'feishuclip_filled', 'headphone-solid_outlined', 'inline-view_outlined',
    'jira-filter_outlined', 'original_outlined', 'port-export_outlined', 'rename_outlined',
    'trello_outlined', 'up-top-round_outlined', 'meeting-ai_filled', 'calendar-disable_colorful',
  ]) {
    const ds = validate(`{
      "schema": "2.0",
      "body": { "elements": [ {
        "tag": "div",
        "icon": { "tag": "standard_icon", "token": "${token}" },
        "text": { "tag": "plain_text", "content": "hi" }
      } ] }
    }`);
    assert.equal(ds.filter((d) => d.severity === 'error').length, 0, `${token} 不应报错：${JSON.stringify(ds)}`);
  }
  // 清单外（臆造 token、以及不在清单内的客户端私有 AI 图标）仍然报错
  for (const token of ['nope_outlined', 'ai-search_colorful', 'ai-video_outlined']) {
    const bad = validate(`{
      "schema": "2.0",
      "body": { "elements": [ {
        "tag": "div",
        "icon": { "tag": "standard_icon", "token": "${token}" },
        "text": { "tag": "plain_text", "content": "hi" }
      } ] }
    }`);
    assert.ok(bad.some((d) => d.severity === 'error'), `${token} 应被判非法`);
  }
});

test('图标 token：IconTokenSchema 与 icon-tokens.list 严格一一对应', () => {
  // 枚举由 ICON_TOKENS 生成；这里守住「清单 = 校验通过集合」，防止有人绕过清单改枚举。
  assert.equal(new Set(ICON_TOKENS).size, ICON_TOKENS.length, 'ICON_TOKENS 存在重复 token');
  for (const token of ICON_TOKENS) {
    assert.ok(/(_outlined|_filled|_colorful)$/.test(token), `token 命名不合规范：${token}`);
    assert.ok(IconTokenSchema.safeParse(token).success, `清单内 token 校验失败：${token}`);
  }
  const options = [...(IconTokenSchema as unknown as { options: readonly string[] }).options].sort();
  assert.deepEqual(options, [...ICON_TOKENS].sort());
});

test('枚举报错只保留前几个取值（图标 1167 个，message 不能爆）', () => {
  const src = `{
    "schema": "2.0",
    "header": {
      "title": { "tag": "plain_text", "content": "t" },
      "icon": { "tag": "standard_icon", "token": "not-a-token" }
    },
    "body": { "elements": [] }
  }`;
  const ds = validate(src);
  const d = ds.find((x) => x.path === '/header/icon/token');
  assert.ok(d, '应该报图标非法');
  assert.ok(d.message.length < 400, `message 太长：${d.message.length}`);
  assert.match(d.message, /… \(\d+ options\)/);
  assert.match(d.message, new RegExp(`\\(${ICON_TOKENS.length} options\\)`));
  // 前几个合法值仍然给出，方便定位
  assert.ok(d.message.includes(ICON_TOKENS[0]));
});

test('普通校验错误不被截断', () => {
  const ds = validate(OK.replace('"markdown"', '"not_a_tag"'));
  assert.ok(ds.length > 0);
  assert.ok(!/options\)$/.test(ds[0].message));
  assert.ok(ds[0].message.length <= 800);
});
