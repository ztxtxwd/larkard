import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCard } from '../src/index.js';

const md = { tag: 'markdown', content: 'hi' };

test('合法卡：无 error，给出可发送的卡', () => {
  const result = checkCard({ schema: '2.0', body: { elements: [md] } });
  assert.deepEqual(result.errors, []);
  assert.ok(result.card);
  assert.deepEqual(result.fixes, []);
  assert.equal((result.card.body as any).elements[0].content, 'hi');
});

test('Schema 非法值报 JSON Pointer，且不返回 card', () => {
  const result = checkCard({
    schema: '2.0',
    header: {
      title: { tag: 'plain_text', content: '标题' },
      icon: { tag: 'standard_icon', token: 'not-a-real-token' },
    },
    body: { elements: [md] },
  });
  assert.ok(result.errors.length > 0);
  assert.equal(result.errors[0].path, '/header/icon/token');
  assert.equal(result.card, undefined);
});

test('真机约束（间距值域）单独拦发送，source 为 device', () => {
  const result = checkCard({
    schema: '2.0',
    body: { elements: [md], vertical_spacing: 'default' },
  });
  const deviceError = result.errors.find((error) => error.source === 'device');
  assert.ok(deviceError);
  assert.equal(deviceError.path, '/body/vertical_spacing');
  assert.equal(deviceError.code, 'spacing-domain');
  assert.equal(result.card, undefined);
});

test('fix:true 修掉真机约束后可以发送，并回报 fixes', () => {
  const result = checkCard(
    { schema: '2.0', body: { elements: [md], vertical_spacing: 'default' } },
    { fix: true },
  );
  assert.deepEqual(result.errors, []);
  assert.ok(result.card);
  assert.equal((result.card.body as any).vertical_spacing, undefined);
  assert.equal(result.fixes.length, 1);
  assert.equal(result.fixes[0].path, '/body/vertical_spacing');
});

test('fix 不修改传入的对象', () => {
  const input = { schema: '2.0', body: { elements: [md], vertical_spacing: 'default' } };
  checkCard(input, { fix: true });
  assert.equal((input.body as any).vertical_spacing, 'default');
});

test('collapsible_panel.header.padding 超界：先报错，fix 后夹到 28px', () => {
  const card = {
    schema: '2.0',
    body: {
      elements: [
        {
          tag: 'collapsible_panel',
          header: { title: { tag: 'plain_text', content: '标题' }, padding: '40px' },
          elements: [md],
        },
      ],
    },
  };
  const before = checkCard(card);
  assert.ok(before.errors.some((error) => error.code === 'panel-header-padding'));

  const after = checkCard(card, { fix: true });
  assert.deepEqual(after.errors, []);
  assert.equal((after.card.body as any).elements[0].header.padding, '28px 28px 28px 28px');
});

test('音频卡缺 enable_forward：两条错误，fix 后清零', () => {
  const card = {
    schema: '2.0',
    body: { elements: [{ tag: 'audio', file_key: 'file_x', duration_ms: 1200 }] },
  };
  const before = checkCard(card);
  assert.deepEqual(
    before.errors.map((error) => error.code).sort(),
    ['media-duration', 'media-enable-forward'],
  );

  const after = checkCard(card, { fix: true });
  assert.deepEqual(after.errors, []);
  assert.equal((after.card.config as any).enable_forward, false);
});

test('JSONC（带注释）字符串输入', () => {
  const result = checkCard(`{
    // 卡片版本
    "schema": "2.0",
    "body": { "elements": [{ "tag": "markdown", "content": "hi" }] }
  }`);
  assert.deepEqual(result.errors, []);
  assert.ok(result.card);
});

test('JSON 语法错误直接透出定位', () => {
  const result = checkCard('{ "schema": "2.0", "body": ');
  assert.ok(result.errors.length > 0);
  assert.match(result.errors[0].message, /JSON 语法错误/);
  assert.equal(result.card, undefined);
});

test('顶层不是对象时明确报错', () => {
  const result = checkCard('[]');
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /JSON object|JSON 对象/);
});

test('搭建工具文档需要先 unwrapCardData', () => {
  assert.throws(
    () => checkCard({ name: 'demo', dsl: { schema: '2.0', body: { elements: [md] } }, variables: {} }),
    /unwrapCardData/,
  );
});

test('column_set.horizontal_spacing=default 是合法值，不拦发送', () => {
  const result = checkCard({
    schema: '2.0',
    body: {
      elements: [
        {
          tag: 'column_set',
          horizontal_spacing: 'default',
          columns: [{ tag: 'column', elements: [md] }],
        },
      ],
    },
  });
  assert.deepEqual(result.errors, []);
  assert.ok(result.card);
});

test('card 是净化后的：非标属性被剥离', () => {
  const result = checkCard({ schema: '2.0', body: { elements: [md] }, not_a_field: 1 });
  assert.deepEqual(result.errors, []);
  assert.equal((result.card as Record<string, unknown>).not_a_field, undefined);
});

test('collapsible_panel 误用边框字段只进 hints', () => {
  const result = checkCard({
    schema: '2.0',
    body: {
      elements: [
        {
          tag: 'collapsible_panel',
          has_border: true,
          header: { title: { tag: 'plain_text', content: '标题' } },
          elements: [md],
        },
      ],
    },
  });
  assert.deepEqual(result.errors, []);
  assert.ok(result.hints.some((hint) => hint.code === 'panel-border-field'));
  assert.ok(result.card);
});

test('linter 只进 hints，不拦发送', () => {
  const result = checkCard(
    { schema: '2.0', body: { elements: [md, { tag: 'markdown', content: 'second' }] } },
    { maxElements: 1 },
  );
  assert.deepEqual(result.errors, []);
  assert.ok(result.hints.some((hint) => hint.source === 'linter' && hint.code === 'element-count'));
  assert.ok(result.card);
});
