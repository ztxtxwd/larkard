import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bindAction,
  describeAction,
  registerAction,
  serializeActionValue,
} from '../src/action.ts';

test('具名函数取函数名', () => {
  function approve(id: string) {
    return id;
  }
  assert.deepEqual(describeAction(approve), { id: 'approve', params: [] });
  assert.deepEqual(serializeActionValue(approve, { key: 'val' }), {
    key: 'val',
    __action_id: 'approve',
  });
});

test('registerAction 路径优先于函数名，bindAction 累加参数', () => {
  function approve(requestId: string, decision: string) {
    return { requestId, decision };
  }
  registerAction('approval.approve', approve);
  const bound = bindAction(approve, 'REQ-42', 'approve');
  assert.deepEqual(describeAction(bound), {
    id: 'approval.approve',
    params: ['REQ-42', 'approve'],
  });
  assert.deepEqual(bound(), { requestId: 'REQ-42', decision: 'approve' });
  assert.deepEqual(serializeActionValue(bound), {
    __action_id: 'approval.approve',
    __params: ['REQ-42', 'approve'],
  });
});

test('绑定对象与纯 value', () => {
  assert.deepEqual(
    serializeActionValue({ path: 'approval.channel', params: ['REQ-42'] }, { from: 'menu' }),
    {
      from: 'menu',
      __action_id: 'approval.channel',
      __params: ['REQ-42'],
    },
  );
  assert.deepEqual(serializeActionValue(undefined, { key: 'val' }), { key: 'val' });
});

test('匿名函数拒绝序列化', () => {
  assert.throws(() => serializeActionValue(() => undefined), /匿名函数/);
});
