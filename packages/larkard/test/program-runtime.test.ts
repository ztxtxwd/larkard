import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { ProgramError, type JsonObject } from '../src/program/index.js';
import { CardRuntime, RATE_LIMIT, readEnvelope, type CallbackResponse, type RuntimeOptions, type StoredCardInstance } from '../src/program/runtime/index.js';
import { FeishuApiError } from '../src/program/runtime/feishu.js';
import { FakeFeishu } from './helpers/fake-feishu.js';

const signup = JSON.parse(readFileSync(new URL('./fixtures/program-signup.card.json', import.meta.url), 'utf8')) as JsonObject;
const roomy = { ...signup, $state: { ...(signup.$state as JsonObject), limit: 100 } };
const target = { chatId: 'oc_test' };

function runtime(api: FakeFeishu, options: Partial<RuntimeOptions> = {}): CardRuntime {
  return new CardRuntime({ api, retryDelaysMs: [0, 0, 0], ...options });
}

function stateOf(api: FakeFeishu, messageId: string) {
  return readEnvelope(api.card(messageId))!.meta;
}

/** 处理一次点击，并把响应里的新卡应用到"平台"上（模拟客户端收到回调响应后换卡）。 */
async function click(
  rt: CardRuntime,
  api: FakeFeishu,
  messageId: string,
  buttonText: string,
  openId: string,
): Promise<CallbackResponse | undefined> {
  const response = await rt.handleCallback(api.callback(messageId, buttonText, openId));
  api.applyResponse(messageId, response ?? {});
  return response;
}

/** 内存版实例存储：模拟 bot 用的 bitedb。 */
function memoryStore() {
  const map = new Map<string, StoredCardInstance>();
  return {
    map,
    store: {
      async load(messageId: string): Promise<StoredCardInstance | null> {
        const hit = map.get(messageId);
        return hit ? structuredClone(hit) : null;
      },
      async save(messageId: string, instance: StoredCardInstance): Promise<void> {
        map.set(messageId, structuredClone(instance));
      },
    },
  };
}

describe('CardRuntime', () => {
  it('seals the program and the state into the card it sends', async () => {
    const api = new FakeFeishu();
    const { messageId } = await runtime(api).send(signup, target);
    assert.deepEqual(api.calls, ['sendCard']);
    const envelope = readEnvelope(api.card(messageId))!;
    assert.deepEqual(envelope.program, signup);
    assert.deepEqual(envelope.meta, { rev: 0, state: signup.$state });
  });

  it('rejects invalid programs before touching Feishu', async () => {
    const api = new FakeFeishu();
    await assert.rejects(runtime(api).send({ body: { elements: [] } }, target), ProgramError);
    assert.deepEqual(api.calls, []);
  });

  it('runs a click end to end and answers with a toast and the new card', async () => {
    const api = new FakeFeishu();
    const rt = runtime(api);
    const { messageId } = await rt.send(signup, target);
    const response = await rt.handleCallback(api.callback(messageId, '报名参与', 'ou_alice'));
    assert.deepEqual(response?.toast, { type: 'success', content: '报名成功，当前第 1 位' });
    assert.equal(response?.card?.type, 'raw');
    const meta = readEnvelope(response!.card!.data)!.meta;
    assert.deepEqual(meta.state.participants, ['ou_alice']);
    assert.equal(meta.rev, 1);
  });

  it('updates the card through the callback response, without writing to Feishu', async () => {
    const api = new FakeFeishu();
    const rt = runtime(api);
    const { messageId } = await rt.send(signup, target);
    const before = api.calls.length;
    const response = await rt.handleCallback(api.callback(messageId, '报名参与', 'ou_alice'));
    await rt.idle();
    assert.ok(response?.card, '新卡随回调响应一起回去');
    assert.deepEqual(
      api.calls.slice(before).filter((c) => c !== 'getRawCard'),
      [],
      '除了读回卡片，不该再有别的接口调用',
    );
  });

  it('does not return a card when nothing changed', async () => {
    const api = new FakeFeishu();
    const rt = runtime(api);
    const { messageId } = await rt.send(signup, target);
    await click(rt, api, messageId, '报名参与', 'ou_alice');
    const again = await rt.handleCallback(api.callback(messageId, '报名参与', 'ou_alice'));
    assert.equal(again?.toast?.content, '你已经报过名了');
    assert.equal(again?.card, undefined);
    assert.deepEqual(stateOf(api, messageId).state.participants, ['ou_alice']);
  });

  it('returns the current card for a stale click even when nothing changed', async () => {
    const api = new FakeFeishu();
    const rt = runtime(api);
    const { messageId } = await rt.send(signup, target);
    // 第一次点击成功，但响应没有落到“平台”（模拟客户端超时 / 丢响应）
    const first = await rt.handleCallback(api.callback(messageId, '报名参与', 'ou_alice'));
    assert.ok(first?.card);

    // 客户端还停在 rev 0，再点一次：动作被拒，但要带回当前卡让客户端追上
    const again = await rt.handleCallback(
      api.callbackWithValue(messageId, { __a: 'join', __r: 0 }, 'ou_alice'),
    );
    assert.equal(again?.toast?.content, '你已经报过名了');
    assert.ok(again?.card, '旧视图点击也要把当前卡带回去');
    const meta = readEnvelope(again!.card!.data)!.meta;
    assert.equal(meta.rev, 1);
    assert.deepEqual(meta.state.participants, ['ou_alice']);
  });

  it('serialises concurrent clicks and coalesces them into a single card', async () => {
    const api = new FakeFeishu(20);
    const rt = runtime(api);
    const { messageId } = await rt.send(roomy, target);
    const users = Array.from({ length: 30 }, (_, i) => `ou_${i}`);
    const responses = await Promise.all(users.map((u) => rt.handleCallback(api.callback(messageId, '报名参与', u))));
    await rt.idle();

    assert.ok(responses.every((r) => r?.toast?.type === 'success'));
    const withCard = responses.filter((r) => r?.card);
    assert.equal(withCard.length, 1, '一批只写一次卡');
    assert.equal(withCard[0], responses[responses.length - 1], '卡挂在最后一个响应上');
    api.applyResponse(messageId, responses[responses.length - 1]!);
    assert.equal((stateOf(api, messageId).state.participants as string[]).length, 30);

    const positions = responses.map((r) => Number(/第 (\d+) 位/.exec(r!.toast!.content)![1])).sort((a, b) => a - b);
    assert.deepEqual(positions, users.map((_, i) => i + 1), '每个人拿到的名次互不相同');
  });

  it('keeps the card of a batch consistent when a later action is rejected', async () => {
    const api = new FakeFeishu(20);
    const rt = runtime(api);
    const { messageId } = await rt.send(signup, target);
    const [first, second] = await Promise.all([
      rt.handleCallback(api.callback(messageId, '报名参与', 'ou_alice')),
      rt.handleCallback(api.callback(messageId, '报名参与', 'ou_alice')),
    ]);
    await rt.idle();
    assert.equal(first?.toast?.content, '报名成功，当前第 1 位');
    assert.equal(second?.toast?.content, '你已经报过名了');
    assert.equal(first?.card, undefined, '卡只挂在最后一个响应上');
    assert.ok(second?.card);
    api.applyResponse(messageId, second!);
    assert.deepEqual(stateOf(api, messageId).state.participants, ['ou_alice'], '被拒的动作没有改状态');
  });

  it('recovers everything from the card after a restart', async () => {
    const api = new FakeFeishu();
    const { messageId } = await runtime(api).send(signup, target);
    const first = runtime(api);
    await click(first, api, messageId, '报名参与', 'ou_alice');

    const fresh = runtime(api);
    const response = await click(fresh, api, messageId, '报名参与', 'ou_bob');
    assert.equal(response?.toast?.content, '报名成功，当前第 2 位');
    assert.deepEqual(stateOf(api, messageId).state.participants, ['ou_alice', 'ou_bob']);
  });

  it('recovers from the instance store without reading the platform', async () => {
    const api = new FakeFeishu();
    const { messageId } = await runtime(api).send(signup, target);
    const { map, store } = memoryStore();
    const sealed = readEnvelope(api.card(messageId))!;
    map.set(messageId, { program: sealed.program, rev: sealed.meta.rev, state: sealed.meta.state });

    // 只给 store，不给飞书宿主：模拟 bot 不在会话里、读不回卡片
    const rt = new CardRuntime({ store });
    const response = await rt.handleCallback(api.callback(messageId, '报名参与', 'ou_alice'));
    assert.equal(response?.toast?.content, '报名成功，当前第 1 位');
    assert.equal(api.calls.filter((c) => c === 'getRawCard').length, 0);

    await rt.idle();
    assert.deepEqual(map.get(messageId)!.state.participants, ['ou_alice']);
    assert.equal(map.get(messageId)!.rev, 1);
  });

  it('writes every batch back to the instance store', async () => {
    const api = new FakeFeishu();
    const { map, store } = memoryStore();
    const rt = runtime(api, { store });
    const { messageId } = await rt.send(signup, target);
    await click(rt, api, messageId, '报名参与', 'ou_a');
    await rt.idle();
    assert.deepEqual(map.get(messageId)!.state.participants, ['ou_a']);
    assert.equal(map.get(messageId)!.rev, 1);
  });

  it('does not try to read the platform when a store is configured', async () => {
    const api = new FakeFeishu();
    const { store } = memoryStore();
    const rt = runtime(api, { store });
    const { messageId } = await rt.send(signup, target);
    await click(rt, api, messageId, '报名参与', 'ou_a');
    await rt.idle();
    assert.equal(api.calls.filter((c) => c === 'getRawCard').length, 0);
  });

  it('adopts the platform state when another process wrote first', async () => {
    const api = new FakeFeishu();
    const a = runtime(api);
    const { messageId } = await a.send(roomy, target);
    const b = runtime(api);
    await click(b, api, messageId, '报名参与', 'ou_b');

    // a 的缓存还停在 rev 0，用户点的是平台最新的那张卡
    const response = await click(a, api, messageId, '报名参与', 'ou_a');
    assert.equal(response?.toast?.content, '报名成功，当前第 2 位');
    assert.deepEqual(stateOf(api, messageId).state.participants, ['ou_b', 'ou_a']);
    assert.equal(stateOf(api, messageId).rev, 2);
  });

  it('keeps the local state when the platform has not caught up', async () => {
    const api = new FakeFeishu();
    const rt = runtime(api);
    const { messageId } = await rt.send(signup, target);
    const first = await rt.handleCallback(api.callback(messageId, '报名参与', 'ou_alice'));
    // 不把响应落到平台上：平台还停在 rev 0，比本地旧
    const second = await rt.handleCallback(api.callbackWithValue(messageId, { __a: 'quit', __r: 0 }, 'ou_alice'));
    assert.equal(second?.toast?.content, '已取消报名', '用的是本地状态，不是平台上的旧状态');
    assert.ok(second?.card);
    api.applyResponse(messageId, second!);
    assert.equal(stateOf(api, messageId).rev, 2);
    assert.deepEqual(stateOf(api, messageId).state.participants, []);
  });

  it('does not read the platform when readBeforeApply is off', async () => {
    const api = new FakeFeishu();
    const rt = runtime(api, { readBeforeApply: false });
    const { messageId } = await rt.send(signup, target);
    await rt.handleCallback(api.callback(messageId, '报名参与', 'ou_alice'));
    await rt.idle();
    assert.equal(api.calls.filter((c) => c === 'getRawCard').length, 0);
  });

  it('ignores callbacks from cards it did not send', async () => {
    const rt = runtime(new FakeFeishu());
    assert.equal(
      await rt.handleCallback({ event: { operator: { open_id: 'ou_x' }, action: { value: { key: 'v' } }, context: { open_message_id: 'om_x' } } }),
      undefined,
    );
    assert.equal(
      await rt.handleCallback({ event: { operator: { open_id: 'ou_x' }, action: { value: { __a: 'join' } }, context: { open_message_id: 'om_unknown' } } }),
      undefined,
      '不是本协议的卡要交还给宿主，不能返回空响应吞掉事件',
    );
  });

  it('retries rate-limited sends', async () => {
    const api = new FakeFeishu();
    api.sendHook = (n) => {
      if (n < 3) throw new FeishuApiError(RATE_LIMIT, 'too many requests', 'sendCard');
    };
    const { messageId } = await runtime(api).send(signup, target);
    assert.equal(api.calls.filter((c) => c === 'sendCard').length, 3);
    assert.ok(messageId);
  });

  it('does not retry a business error on send', async () => {
    const api = new FakeFeishu();
    api.sendHook = () => {
      throw new FeishuApiError(230027, 'no permission', 'sendCard');
    };
    await assert.rejects(runtime(api).send(signup, target), FeishuApiError);
    assert.equal(api.calls.filter((c) => c === 'sendCard').length, 1);
  });
});

describe('CardRuntime 的边界情况', () => {
  /** 状态里放一段随机文字，视图原样渲染：卡片体积随状态线性增长。 */
  function blobProgram(chunk: string): JsonObject {
    return {
      $v: 1,
      schema: '2.0',
      body: {
        elements: [
          { tag: 'plain_text', content: '{{ blob }}' },
          { tag: 'button', text: { tag: 'plain_text', content: '加' }, $on: 'add' },
        ],
      },
      $state: { blob: [] },
      $actions: { add: [{ push: 'blob', value: `'${chunk}'` }] },
    };
  }

  /** 固定种子的伪随机：同样的输入每次得到同样的卡片，体积断言才稳定。 */
  function randomChunk(length: number): string {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let seed = 0x9e3779b9;
    let out = '';
    for (let i = 0; i < length; i += 1) {
      seed ^= seed << 13;
      seed >>>= 0;
      seed ^= seed >> 17;
      seed ^= seed << 5;
      seed >>>= 0;
      out += alphabet[seed % alphabet.length];
    }
    return out;
  }

  it('turns the whole batch into an error toast when the new card cannot be rendered', async () => {
    const api = new FakeFeishu();
    const dup: JsonObject = {
      $v: 1,
      schema: '2.0',
      body: {
        elements: [
          { tag: 'button', text: { tag: 'plain_text', content: '加' }, $on: 'add' },
          {
            tag: 'column_set',
            $for: 'it in items',
            $key: 'it.id',
            element_id: 'row',
            columns: [{ tag: 'column', elements: [{ tag: 'markdown', content: '{{ it.id }}' }] }],
          },
        ],
      },
      $state: { items: [] },
      $actions: { add: [{ push: 'items', value: '{ id: "x" }' }] },
    };
    const rt = runtime(api);
    const { messageId } = await rt.send(dup, target);
    const first = await click(rt, api, messageId, '加', 'ou_a');
    assert.ok(first?.card, '第一次渲染正常');

    // 第二个 x 让循环里的 element_id 重复，渲染失败
    const second = await rt.handleCallback(api.callback(messageId, '加', 'ou_a'));
    assert.equal(second?.toast?.type, 'error');
    assert.equal(second?.card, undefined);
    assert.equal(stateOf(api, messageId).rev, 1, '状态没有落盘');
  });

  it('does not send a card that grew past the size budget', async () => {
    const api = new FakeFeishu();
    // 卡片体积约 1636 → 3157 → 3976 字节：预算 3500 让第一次点击刚好还在里面，第二次超了
    const rt = runtime(api, { cardSizeBudget: 3500 });
    const { messageId } = await rt.send(blobProgram(randomChunk(800)), target);
    const first = await click(rt, api, messageId, '加', 'ou_a');
    assert.ok(first?.card, '第一次还在预算内');

    const second = await rt.handleCallback(api.callback(messageId, '加', 'ou_a'));
    assert.equal(second?.toast?.type, 'error');
    assert.equal(second?.toast?.content, '卡片太大了，这次的改动装不下', '要说清楚是装不下，不是出错');
    assert.equal(second?.card, undefined, '超限的卡发不出去');
    assert.equal(stateOf(api, messageId).rev, 1, '状态没有落盘');
  });

  it('warns when the card is close to the size budget', async () => {
    const api = new FakeFeishu();
    // 卡片约 1636 字节，预算 1800 → 用掉 91%
    const { warnings } = await runtime(api, { cardSizeBudget: 1800 }).send(blobProgram(randomChunk(800)), target);
    assert.ok(
      warnings.some((w) => w.includes('体积已用掉')),
      '快到上限要提醒：卡片体积跟着状态涨',
    );
  });

  it('does not warn about the size when the card is small', async () => {
    const api = new FakeFeishu();
    const { warnings } = await runtime(api).send(signup, target);
    assert.deepEqual(warnings, []);
  });
});
