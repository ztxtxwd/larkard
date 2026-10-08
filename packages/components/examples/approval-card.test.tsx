import assert from 'node:assert/strict';
import test from 'node:test';

import { ApprovalCard } from './approval-card.js';
import { renderToCard } from '../src/index.js';
import type {
  FeishuButton,
  FeishuCardJson,
  FeishuColumnSet,
  FeishuElement,
  FeishuForm,
  FeishuSelect,
} from '../src/types/card.js';

function walk(value: unknown, visit: (node: Record<string, unknown>) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  if (value && typeof value === 'object') {
    visit(value as Record<string, unknown>);
    for (const child of Object.values(value)) walk(child, visit);
  }
}

function byTag<T extends FeishuElement>(card: FeishuCardJson, tag: T['tag']): T[] {
  const found: T[] = [];
  walk(card, (node) => {
    if (node.tag === tag) found.push(node as T);
  });
  return found;
}

test('ApprovalCard 序列化为带 action 协议字段的卡片 JSON', () => {
  const card = renderToCard(<ApprovalCard />);
  const roundTrip = JSON.parse(JSON.stringify(card)) as FeishuCardJson;
  assert.equal(roundTrip.schema, '2.0');
  assert.deepEqual(roundTrip.config, {
    update_multi: true,
    wide_screen_mode: true,
    width_mode: 'fill',
  });
  assert.equal(roundTrip.header?.title.content, '费用审批');
  assert.equal(roundTrip.header?.template, 'blue');
  assert.deepEqual(roundTrip.header?.icon, {
    tag: 'standard_icon',
    token: 'approval_outlined',
  });

  const buttons = byTag<FeishuButton>(roundTrip, 'button');
  const agree = buttons.find((button) => button.text?.content === '同意');
  const reject = buttons.find((button) => button.text?.content === '驳回');
  const detail = buttons.find((button) => button.text?.content === '查看详情');
  assert.ok(agree && reject && detail);

  assert.equal(agree.form_action_type, 'submit');
  assert.deepEqual(agree.value, {
    __action_id: 'approval.approve',
    __params: ['REQ-42', 'approve'],
  });
  assert.equal(agree.behaviors?.[0]?.type, 'callback');

  assert.deepEqual(reject.value, {
    request_id: 'REQ-42',
    __action_id: 'approval.reject',
  });
  assert.equal(reject.value && '__params' in reject.value, false);

  assert.deepEqual(detail.value, { key: 'val' });
  assert.deepEqual(detail.behaviors, [
    { type: 'open_url', default_url: 'https://open.feishu.cn' },
    { type: 'callback', value: { key: 'val' } },
  ]);

  const select = byTag<FeishuSelect>(roundTrip, 'select_static')[0];
  assert.ok(select);
  assert.deepEqual(select.value, {
    __action_id: 'approval.channel',
    __params: ['REQ-42'],
  });
  assert.equal(select.options?.[0]?.value, 'feishu');

  assert.equal(byTag(roundTrip, 'action').length, 1);
  assert.equal(byTag<FeishuForm>(roundTrip, 'form')[0]?.name, 'approval_form');
  assert.equal(byTag(roundTrip, 'hr').length, 1);
  assert.equal(byTag<FeishuColumnSet>(roundTrip, 'column_set')[0]?.columns.length, 2);
});
