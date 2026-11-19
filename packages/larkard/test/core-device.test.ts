import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findDeviceIssues, normalizeCornerRadius, normalizeSpacing, repairDeviceIssues } from '../src/core/index.js';

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

test('normalizeCornerRadius：单个值归一化，四角简写只在全等时可折叠', () => {
  assert.equal(normalizeCornerRadius('8px'), '8px');
  assert.equal(normalizeCornerRadius('8.5px'), '8.5px');
  assert.equal(normalizeCornerRadius('50%'), '50%');
  // 只差格式的写法顺手纠正
  assert.equal(normalizeCornerRadius(' 8PX '), '8px');
  assert.equal(normalizeCornerRadius(8), '8px');
  assert.equal(normalizeCornerRadius('8'), '8px');
  // 四角相同才有唯一正确解
  assert.equal(normalizeCornerRadius('8px 8px 8px 8px'), '8px');
  assert.equal(normalizeCornerRadius('0 0 0 0'), '0px');
  // 各角不同 / 非法值：无法自动修复
  assert.equal(normalizeCornerRadius('8px 0 0 8px'), undefined);
  assert.equal(normalizeCornerRadius('8px 8px 0 8px'), undefined);
  assert.equal(normalizeCornerRadius('8em'), undefined);
  assert.equal(normalizeCornerRadius(-4), undefined);
  assert.equal(normalizeCornerRadius(''), undefined);
});

test('圆角值域：各角不同只报错，全等简写折叠为单值', () => {
  const input = {
    schema: '2.0',
    body: {
      elements: [
        {
          tag: 'img',
          img_key: 'img_x',
          alt: { tag: 'plain_text', content: '图' },
          corner_radius: '8px 0 0 8px',
        },
        {
          tag: 'collapsible_panel',
          header: {},
          border: { corner_radius: '8px 8px 8px 8px' },
        },
        { tag: 'interactive_container', elements: [], corner_radius: '50%' },
      ],
    },
  };
  const { card, issues, fixes } = repairDeviceIssues(input);

  const multi = issues.find((issue) => issue.path === '/body/elements/0/corner_radius');
  assert.ok(multi);
  assert.equal(multi.code, 'corner-radius-domain');
  assert.equal(multi.severity, 'error');
  assert.equal(multi.fixable, false);

  const collapsed = issues.find((issue) => issue.path === '/body/elements/1/border/corner_radius');
  assert.ok(collapsed);
  assert.equal(collapsed.fixable, true);
  assert.deepEqual(fixes, [collapsed]);

  const elements = (card.body as any).elements;
  // 无唯一正确解的原样保留，交给调用方决定
  assert.equal(elements[0].corner_radius, '8px 0 0 8px');
  assert.equal(elements[1].border.corner_radius, '8px');
  // 合法单值不动，也不产生 issue
  assert.equal(elements[2].corner_radius, '50%');
  assert.equal(issues.length, 2);
  // 入参深拷贝未被修改
  assert.equal((input.body as any).elements[1].border.corner_radius, '8px 8px 8px 8px');
});

test('圆角值域：不碰 chart_spec 里的 vega cornerRadius', () => {
  const { card, issues } = repairDeviceIssues({
    schema: '2.0',
    body: {
      elements: [{ tag: 'chart', chart_spec: { cornerRadius: '8 8 8 8' } }],
    },
  });
  assert.deepEqual(issues, []);
  assert.equal((card.body as any).elements[0].chart_spec.cornerRadius, '8 8 8 8');
});

test('圆角值域：空字符串等同未设置，不报错', () => {
  const { card, issues } = repairDeviceIssues({
    schema: '2.0',
    body: {
      elements: [{
        tag: 'interactive_container',
        elements: [],
        corner_radius: '',
      }],
    },
  });
  assert.deepEqual(issues, []);
  assert.equal((card.body as any).elements[0].corner_radius, '');
});

test('markdown.font_color：展开成 content 内 <font>（飞书 200621 unknown property）', () => {
  const input = {
    schema: '2.0',
    body: {
      elements: [
        { tag: 'markdown', content: '标题', font_color: 'cus-ink-1' },
        { tag: 'markdown', content: "<font color='red'>红</font> 黑", font_color: 'blue' },
        { tag: 'markdown', content: '', font_color: 'grey' },
        { tag: 'markdown', content: '空字色', font_color: '' },
      ],
    },
  };
  const { card, issues, fixes } = repairDeviceIssues(input);
  const els = (card.body as any).elements;
  assert.equal(els[0].font_color, undefined);
  assert.equal(els[0].content, "<font color='cus-ink-1'>标题</font>");
  // 已有内联字色：块级字色本来就不生效，只删属性
  assert.equal(els[1].font_color, undefined);
  assert.equal(els[1].content, "<font color='red'>红</font> 黑");
  // 空内容没有可包的字，只删属性
  assert.equal(els[2].font_color, undefined);
  assert.equal(els[2].content, '');
  // 空串等同未设置，不算违规
  assert.equal(els[3].font_color, undefined);
  assert.equal(els[3].content, '空字色');

  assert.equal(issues.length, 3);
  assert.deepEqual(issues.map((issue) => issue.code), [
    'markdown-font-color',
    'markdown-font-color',
    'markdown-font-color',
  ]);
  assert.deepEqual(issues.map((issue) => issue.path), [
    '/body/elements/0/font_color',
    '/body/elements/1/font_color',
    '/body/elements/2/font_color',
  ]);
  assert.deepEqual(fixes, issues);
  // 入参不变
  assert.equal((input.body as any).elements[0].font_color, 'cus-ink-1');
});
