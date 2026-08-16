import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OBJECTIVE_SYSTEM_PROMPT, composeSystemPrompt } from '../src/prompts.js';

test('composeSystemPrompt：无 hint 或空白时不改系统提示', () => {
  assert.equal(composeSystemPrompt(OBJECTIVE_SYSTEM_PROMPT), OBJECTIVE_SYSTEM_PROMPT);
  assert.equal(composeSystemPrompt(OBJECTIVE_SYSTEM_PROMPT, '  '), OBJECTIVE_SYSTEM_PROMPT);
});

test('composeSystemPrompt：优化版把 promptHint 拼到末尾', () => {
  const composed = composeSystemPrompt(OBJECTIVE_SYSTEM_PROMPT, 'button 必须带 behaviors 数组。');
  assert.ok(composed.startsWith(OBJECTIVE_SYSTEM_PROMPT));
  assert.ok(composed.endsWith('button 必须带 behaviors 数组。'));
  assert.notEqual(composed, OBJECTIVE_SYSTEM_PROMPT);
});
