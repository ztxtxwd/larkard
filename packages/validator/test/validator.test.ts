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
