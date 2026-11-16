import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findDeviceIssues, normalizeSpacing, repairDeviceIssues } from '../src/index.js';

const md = { tag: 'markdown', content: 'hi' };

test('normalizeSpacing：token / px / 裸数字 / 大小写空格 / 越界', () => {
  assert.equal(normalizeSpacing('small'), 'small');
  assert.equal(normalizeSpacing('extra_large'), 'extra_large');
  assert.equal(normalizeSpacing('12px'), '12px');
  assert.equal(normalizeSpacing('99.9px'), '99.9px');
  // 裸数字按 px 理解
  assert.equal(normalizeSpacing(8), '8px');
  assert.equal(normalizeSpacing(0), '0px');
  // 只差格式的写法顺手纠正
  assert.equal(normalizeSpacing('8 PX'), '8px');
  assert.equal(normalizeSpacing(' 12px '), '12px');
  // 真机会整卡拒绝的取值
  assert.equal(normalizeSpacing('100px'), undefined);
  assert.equal(normalizeSpacing('default'), undefined);
  assert.equal(normalizeSpacing('auto'), undefined);
  assert.equal(normalizeSpacing(-1), undefined);
  assert.equal(normalizeSpacing('8em'), undefined);
  assert.equal(normalizeSpacing(null), undefined);
});

test('间距值域：非法值删字段，合法值不动，入参不变', () => {
  const input = {
    schema: '2.0',
    body: { elements: [md], vertical_spacing: 'default', horizontal_spacing: '12px' },
  };
  const { card, issues, fixes } = repairDeviceIssues(input);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].path, '/body/vertical_spacing');
  assert.equal(issues[0].code, 'spacing-domain');
  assert.equal(issues[0].severity, 'error');
  assert.equal((card.body as Record<string, unknown>).vertical_spacing, undefined);
  assert.equal((card.body as Record<string, unknown>).horizontal_spacing, '12px');
  assert.deepEqual(fixes, issues);
  // 深拷贝：入参保持原样
  assert.equal((input.body as Record<string, unknown>).vertical_spacing, 'default');
});

test('column_set.horizontal_spacing 的 default 是唯一合法例外', () => {
  const { issues } = repairDeviceIssues({
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
  assert.deepEqual(issues, []);
});

test('column_set.horizontal_spacing 的 auto 也是合法值', () => {
  const { issues } = repairDeviceIssues({
    schema: '2.0',
    body: {
      elements: [
        {
          tag: 'column_set',
          horizontal_spacing: 'auto',
          columns: [{ tag: 'column', elements: [md] }],
        },
      ],
    },
  });
  assert.deepEqual(issues, []);
});

test('空串间距等同没设置，不算违规', () => {
  const { card, issues } = repairDeviceIssues({
    schema: '2.0',
    body: { elements: [md], vertical_spacing: '' },
  });
  assert.deepEqual(issues, []);
  assert.equal((card.body as Record<string, unknown>).vertical_spacing, '');
});

test('间距：裸数字与大小写归一化也算一次修复', () => {
  const { card, issues } = repairDeviceIssues({
    schema: '2.0',
    body: { elements: [md], vertical_spacing: 8, horizontal_spacing: '8 PX' },
  });
  assert.equal((card.body as Record<string, unknown>).vertical_spacing, '8px');
  assert.equal((card.body as Record<string, unknown>).horizontal_spacing, '8px');
  assert.deepEqual(
    issues.map((issue) => issue.path),
    ['/body/horizontal_spacing', '/body/vertical_spacing'],
  );
});

test('collapsible_panel.header.padding：超界夹到 28px，格式不对删字段', () => {
  const panel = (padding: unknown) => ({
    schema: '2.0',
    body: {
      elements: [
        {
          tag: 'collapsible_panel',
          header: { title: { tag: 'plain_text', content: '标题' }, padding },
          elements: [md],
        },
      ],
    },
  });

  const clamped = repairDeviceIssues(panel('40px 8px'));
  assert.equal((clamped.card.body as any).elements[0].header.padding, '28px 8px 28px 8px');
  assert.equal(clamped.issues[0].code, 'panel-header-padding');

  const dropped = repairDeviceIssues(panel('12em'));
  assert.equal((dropped.card.body as any).elements[0].header.padding, undefined);
  assert.equal(dropped.issues[0].severity, 'error');
});

test('collapsible_panel 写了 interactive_container 边框字段：只提示不修复', () => {
  const input = {
    schema: '2.0',
    body: {
      elements: [
        {
          tag: 'collapsible_panel',
          has_border: true,
          background_style: 'blue-50',
          header: { title: { tag: 'plain_text', content: '标题' } },
          elements: [md],
        },
      ],
    },
  };
  const { card, issues, fixes } = repairDeviceIssues(input);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, 'panel-border-field');
  assert.equal(issues[0].severity, 'warning');
  assert.equal(issues[0].fixable, false);
  assert.deepEqual(fixes, []);
  // 不删字段：删了等于直接丢样式，交给调用方决定
  assert.equal((card.body as any).elements[0].has_border, true);
});

test('audio：删时长字段并补 enable_forward=false', () => {
  const input = {
    schema: '2.0',
    body: { elements: [{ tag: 'audio', file_key: 'file_x', duration: 1200, duration_ms: 1200 }] },
  };
  const { card, issues, fixes } = repairDeviceIssues(input);
  assert.deepEqual(
    issues.map((issue) => issue.code),
    ['media-duration', 'media-duration', 'media-enable-forward'],
  );
  assert.deepEqual(fixes, issues);
  const audio = (card.body as any).elements[0];
  assert.equal(audio.duration, undefined);
  assert.equal(audio.duration_ms, undefined);
  assert.equal((card.config as Record<string, unknown>).enable_forward, false);
});

test('含音视频但 enable_forward 显式 true：改成 false', () => {
  const { card, issues } = repairDeviceIssues({
    schema: '2.0',
    config: { enable_forward: true },
    body: { elements: [{ tag: 'video', file_key: 'file_x' }] },
  });
  assert.equal((card.config as Record<string, unknown>).enable_forward, false);
  assert.equal(issues[0].code, 'media-enable-forward');
});

test('findDeviceIssues 与 repairDeviceIssues 结论一致', () => {
  const input = {
    schema: '2.0',
    body: { elements: [md], vertical_spacing: 'default' },
  };
  assert.deepEqual(findDeviceIssues(input), repairDeviceIssues(input).issues);
  // 非对象输入不炸
  assert.deepEqual(findDeviceIssues(null), []);
});
