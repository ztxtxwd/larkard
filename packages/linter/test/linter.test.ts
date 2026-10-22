import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lint } from '../src/index.js';

test('missing schema warning', () => {
  const ds = lint('{ "body": { "elements": [{ "tag": "markdown", "content": "x" }] } }');
  assert.ok(ds.some((d) => d.rule === 'missing-schema'));
});

test('empty body info', () => {
  const ds = lint('{ "schema": "2.0", "body": { "elements": [] } }');
  assert.ok(ds.some((d) => d.rule === 'empty-body'));
});

test('deep nesting warning', () => {
  let el = '{ "tag": "markdown", "content": "x" }';
  for (let i = 0; i < 10; i++) {
    el = `{ "tag": "column", "elements": [${el}] }`;
  }
  const ds = lint(`{ "schema": "2.0", "body": { "elements": [${el}] } }`);
  assert.ok(ds.some((d) => d.rule === 'nesting-depth'));
});

test('div.fields 子容器计入嵌套深度', () => {
  const ds = lint(
    `{ "schema": "2.0", "body": { "elements": [
       { "tag": "div", "fields": [ { "text": { "tag": "markdown", "content": "x" } } ] }
     ] } }`,
    { maxDepth: 2 },
  );
  assert.ok(ds.some((d) => d.rule === 'nesting-depth'));
});

test('action.actions 子容器计入嵌套深度', () => {
  const ds = lint(
    `{ "schema": "2.0", "body": { "elements": [
       { "tag": "action", "actions": [ { "tag": "button", "text": { "tag": "plain_text", "content": "ok" } } ] }
     ] } }`,
    { maxDepth: 2 },
  );
  assert.ok(ds.some((d) => d.rule === 'nesting-depth'));
});

test('long text warning', () => {
  const long = 'x'.repeat(4000);
  const ds = lint(`{ "schema": "2.0", "body": { "elements": [{ "tag": "markdown", "content": "${long}" }] } }`);
  assert.ok(ds.some((d) => d.rule === 'long-text'));
});

test('input default_value exceeding max_length (default 1000) warns', () => {
  const tooLong = 'x'.repeat(1001);
  const ds = lint(`{ "schema": "2.0", "body": { "elements": [{ "tag": "input", "default_value": "${tooLong}" }] } }`);
  assert.ok(ds.some((d) => d.rule === 'input-max-length'));
});

test('input default_value within explicit max_length does not warn', () => {
  const val = 'x'.repeat(5);
  const ds = lint(`{ "schema": "2.0", "body": { "elements": [{ "tag": "input", "max_length": 10, "default_value": "${val}" }] } }`);
  assert.ok(!ds.some((d) => d.rule === 'input-max-length'));
});

test('builder document lints the dsl subtree', () => {
  const ds = lint(`{
    "name": "demo",
    "dsl": { "body": { "elements": [{ "tag": "markdown", "content": "x" }] } },
    "variables": []
  }`);
  assert.ok(ds.some((d) => d.rule === 'missing-schema'));
});

test('markdown 加粗星号内侧有空格时告警', () => {
  const ds = lint(
    `{ "schema": "2.0", "body": { "elements": [
       { "tag": "markdown", "content": "** 分区标题**" }
     ] } }`,
  );
  const d = ds.find((x) => x.rule === 'markdown-bold-space');
  assert.ok(d, JSON.stringify(ds));
  assert.equal(d.severity, 'warning');
  assert.ok(d.message.includes('** 分区标题**'));
});

test('markdown 收尾星号前有空格时告警', () => {
  const ds = lint(
    `{ "schema": "2.0", "body": { "elements": [
       { "tag": "markdown", "content": "**分区标题 **" }
     ] } }`,
  );
  assert.ok(ds.some((x) => x.rule === 'markdown-bold-space'));
});

test('markdown 星号外侧贴空格合法，不告警', () => {
  const ds = lint(
    `{ "schema": "2.0", "body": { "elements": [
       { "tag": "markdown", "content": "**分区标题** 正文，中间 有空格 也没关系" }
     ] } }`,
  );
  assert.ok(!ds.some((x) => x.rule === 'markdown-bold-space'), JSON.stringify(ds));
});

test('代码块/行内代码里的星号不告警', () => {
  const ds = lint(
    `{ "schema": "2.0", "body": { "elements": [
       { "tag": "markdown", "content": "示例：\\\`** x**\\\` 与 \\\`\\\`\\\`** y**\\\`\\\`\\\`" }
     ] } }`,
  );
  assert.ok(!ds.some((x) => x.rule === 'markdown-bold-space'), JSON.stringify(ds));
});

test('lark_md 文本对象的加粗贴空格同样告警', () => {
  const ds = lint(
    `{ "schema": "2.0", "body": { "elements": [
       { "tag": "div", "text": { "tag": "lark_md", "content": "** 已审批单量**" } }
     ] } }`,
  );
  assert.ok(ds.some((x) => x.rule === 'markdown-bold-space'));
});

test('table 的 lark_md 列单元格加粗贴空格告警', () => {
  const ds = lint(`{
    "schema": "2.0",
    "body": { "elements": [ {
      "tag": "table",
      "columns": [
        { "name": "owner", "data_type": "lark_md" },
        { "name": "count", "data_type": "text" }
      ],
      "rows": [ { "owner": "** 张三**", "count": "** 3**" } ]
    } ] }
  }`);
  const hits = ds.filter((x) => x.rule === 'markdown-bold-space');
  assert.equal(hits.length, 1, JSON.stringify(ds));
  assert.ok(hits[0]!.message.includes('张三'));
  assert.ok(!hits[0]!.message.includes('3'));
});

test('plain_text 里的星号不告警', () => {
  const ds = lint(
    `{ "schema": "2.0", "body": { "elements": [
       { "tag": "button", "text": { "tag": "plain_text", "content": "** 不是 markdown**" } }
     ] } }`,
  );
  assert.ok(!ds.some((x) => x.rule === 'markdown-bold-space'), JSON.stringify(ds));
});

test('builder empty body is reported on dsl body', () => {
  const ds = lint(`{
    "name": "demo",
    "dsl": { "schema": "2.0", "body": { "elements": [] } },
    "variables": []
  }`);
  assert.ok(ds.some((d) => d.rule === 'empty-body'));
});
