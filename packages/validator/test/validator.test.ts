import { test } from 'node:test';
import assert from 'node:assert/strict';
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

test('接受官方对齐的 avatar / picker_date / fallback_text / collapse_divider', () => {
  const ds = validate(`{
    "schema": "2.0",
    "body": {
      "elements": [
        { "tag": "avatar", "user_id": "ou_demo", "size": "medium" },
        {
          "tag": "picker_date",
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
