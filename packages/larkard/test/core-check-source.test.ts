import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkSource } from '../src/core/index.js';

const BAD_SPACING = `{
  "schema": "2.0",
  "body": {
    "vertical_spacing": "huge",
    "elements": [{ "tag": "markdown", "content": "x" }]
  }
}`;

test('checkSource：device 诊断带源码位置', () => {
  const result = checkSource(BAD_SPACING);
  const device = result.diagnostics.find((d) => d.source === 'device');
  assert.ok(device, '应命中真机硬约束');
  assert.equal(device.code, 'spacing-domain');
  assert.equal(device.severity, 'error');
  assert.equal(device.range?.start.line, 4);
  assert.ok(device.range && device.range.start.column > 0);
});

test('checkSource：fix 后 fixable 的 device 错误消失，并返回可发送卡片', () => {
  const result = checkSource(BAD_SPACING, { fix: true });
  assert.equal(result.errors.length, 0);
  assert.ok(result.card);
  assert.equal((result.card!.body as Record<string, unknown>).vertical_spacing, undefined);
  assert.ok(result.fixes.some((fix) => fix.code === 'spacing-domain'));
});

test('checkSource：搭建工具文档的路径带 /dsl 前缀', () => {
  const source = `{
    "name": "demo",
    "dsl": {
      "schema": "2.0",
      "body": { "vertical_spacing": "huge", "elements": [] }
    },
    "variables": []
  }`;
  const result = checkSource(source);
  const device = result.diagnostics.find((d) => d.source === 'device');
  assert.ok(device);
  assert.ok(device.path.startsWith('/dsl/'));
  assert.ok(device.range);
});

test('checkSource：语法错误直接返回 parser 定位', () => {
  const result = checkSource('{"schema": "2.0",');
  assert.ok(result.errors.length > 0);
  assert.equal(result.diagnostics[0]?.source, 'validator');
  assert.ok(result.diagnostics[0]?.range);
});
