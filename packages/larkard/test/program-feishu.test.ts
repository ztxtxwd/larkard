import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FeishuApiError, MESSAGE_RATE_LIMIT, RATE_LIMIT, isRetryableError } from '../src/program/runtime/feishu.js';

describe('isRetryableError', () => {
  it('retries rate limits, 5xx, timeouts and network failures', () => {
    assert.equal(isRetryableError(new FeishuApiError(RATE_LIMIT, 'limited', '/x')), true);
    assert.equal(isRetryableError(new FeishuApiError(MESSAGE_RATE_LIMIT, 'limited', '/x')), true);
    assert.equal(isRetryableError(new FeishuApiError(503, 'unavailable', '/x')), true);
    assert.equal(isRetryableError(new FeishuApiError(0, 'request timed out', '/x', true)), true);
    assert.equal(isRetryableError(new TypeError('fetch failed')), true);
    const timeout = new Error('aborted');
    timeout.name = 'TimeoutError';
    assert.equal(isRetryableError(timeout), true);
  });

  it('does not retry other business errors', () => {
    assert.equal(isRetryableError(new FeishuApiError(230027, 'forbidden', '/x')), false);
    assert.equal(isRetryableError(new FeishuApiError(400, 'bad request', '/x')), false);
    assert.equal(isRetryableError(new Error('nope')), false);
  });
});
