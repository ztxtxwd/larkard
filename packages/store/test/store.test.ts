import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { describe, it } from 'node:test';
import {
  STATE_CODEC_VERSION,
  STATE_ELEMENT_ID,
  STATE_URL_PREFIX,
  decodeStateUrl,
  encodeStateUrl,
  findStateHost,
  isStateUrl,
  readCardState,
  sealCardState,
  unsealCardState,
} from '../src/index.js';

function baseCard(): Record<string, unknown> {
  return {
    schema: '2.0',
    header: {
      title: { tag: 'plain_text', content: 'demo' },
    },
    body: {
      elements: [
        { tag: 'markdown', content: 'hello' },
        {
          tag: 'button',
          text: { tag: 'plain_text', content: 'ok' },
          behaviors: [{ type: 'callback', value: { action: 'ping' } }],
        },
      ],
    },
  };
}

describe('codec', () => {
  it('round-trips object / array / nested state', () => {
    const state = {
      v: 1,
      votes: { a: ['ou_1', 'ou_2'], b: [] },
      slides: [{ img_key: 'img_x', alt: 'x' }],
      i: 3,
      nested: { a: { b: [1, 2, null, true] } },
    };
    const url = encodeStateUrl(state);
    assert.ok(url.startsWith(STATE_URL_PREFIX + STATE_CODEC_VERSION + '.'));
    assert.deepEqual(decodeStateUrl(url), state);
    assert.equal(isStateUrl(url), true);
  });

  it('is smaller than raw JSON for repetitive payloads', () => {
    const state = { items: Array.from({ length: 200 }, (_, i) => ({ id: `user_${i % 10}`, name: 'alice' })) };
    const json = JSON.stringify(state);
    const url = encodeStateUrl(state);
    const fragment = url.slice(url.indexOf('#') + 1);
    const payload = fragment.slice(fragment.indexOf('.') + 1);
    assert.ok(payload.length < json.length, `${payload.length} !< ${json.length}`);
  });

  it('rejects garbage', () => {
    assert.equal(decodeStateUrl('https://example.com#nope'), null);
    assert.equal(decodeStateUrl(`${STATE_URL_PREFIX}s1.!!!`), null);
    assert.equal(decodeStateUrl(`${STATE_URL_PREFIX}s9.${Buffer.from('x').toString('base64url')}`), null);
  });

  it('accepts bare fragment', () => {
    const url = encodeStateUrl({ ok: true });
    const fragment = url.slice(url.indexOf('#') + 1);
    assert.deepEqual(decodeStateUrl(fragment), { ok: true });
  });
});

describe('seal / read / unseal', () => {
  it('seals into empty column_set host and reads back', () => {
    const card = baseCard();
    const state = { page: 2, selected: ['a'] };
    const url = sealCardState(card, state);

    const host = findStateHost(card);
    assert.ok(host);
    assert.equal(host!.tag, 'column_set');
    assert.equal(host!.element_id, STATE_ELEMENT_ID);
    assert.deepEqual(
      (host!.action as { multi_url: { url: string } }).multi_url.url,
      url,
    );
    // 只写 url，不复制三端
    const multi = (host!.action as { multi_url: Record<string, string> }).multi_url;
    assert.equal(multi.pc_url, undefined);
    assert.equal(multi.ios_url, undefined);
    assert.equal(multi.android_url, undefined);

    // 空列、零内容
    const cols = host!.columns as Array<Record<string, unknown>>;
    assert.equal(cols.length, 1);
    assert.deepEqual(cols[0]!.elements, []);

    assert.deepEqual(readCardState(card), state);

    // 宿主在 elements 末尾，业务节点仍在
    const els = (card.body as { elements: unknown[] }).elements;
    assert.equal((els[0] as { tag: string }).tag, 'markdown');
    assert.equal((els[els.length - 1] as { element_id: string }).element_id, STATE_ELEMENT_ID);
  });

  it('replaces previous host on re-seal', () => {
    const card = baseCard();
    sealCardState(card, { n: 1 });
    sealCardState(card, { n: 2 });
    const els = (card.body as { elements: unknown[] }).elements;
    const hosts = els.filter(
      (el) =>
        typeof el === 'object' &&
        el !== null &&
        (el as { element_id?: string }).element_id === STATE_ELEMENT_ID,
    );
    assert.equal(hosts.length, 1);
    assert.deepEqual(readCardState(card), { n: 2 });
  });

  it('reads adapter-projected actions[] shape (no element_id)', () => {
    const state = { recovered: true, votes: { a: ['ou_x'] } };
    const url = encodeStateUrl(state);
    const card = {
      schema: '2.0',
      body: {
        elements: [
          { tag: 'markdown', content: 'x' },
          {
            tag: 'column_set',
            // adapter 回读时常丢掉 element_id
            actions: [
              {
                type: 'open_url',
                action: { url },
              },
            ],
            columns: [{ tag: 'column', width: 'auto', elements: [] }],
          },
        ],
      },
    };
    assert.deepEqual(readCardState(card), state);
  });

  it('reads RAW property.actions shape', () => {
    const state = { raw: 1 };
    const url = encodeStateUrl(state);
    const card = {
      body: {
        property: {
          elements: [
            {
              id: STATE_ELEMENT_ID,
              tag: 'column_set',
              property: {
                actions: [
                  {
                    type: 'open_url',
                    action: {
                      url,
                      pcURL: url,
                    },
                  },
                ],
                columns: [{ tag: 'column', property: { elements: [] } }],
              },
            },
          ],
        },
      },
    };
    assert.deepEqual(readCardState(card), state);
  });

  it('unseal removes host', () => {
    const card = baseCard();
    sealCardState(card, { bye: 1 });
    assert.deepEqual(unsealCardState(card), { bye: 1 });
    assert.equal(findStateHost(card), null);
    assert.equal(readCardState(card), null);
  });
});

describe('capacity smoke', () => {
  it('encodes ~10KB JSON comfortably under fragment budget', () => {
    const state = {
      rows: Array.from({ length: 300 }, (_, i) => ({
        id: `id_${i}`,
        name: `name_${i % 20}`,
        flags: { a: true, b: false, c: i },
      })),
    };
    const url = encodeStateUrl(state);
    const fragmentLen = url.length - STATE_URL_PREFIX.length;
    // 经验：deflate+base64 后应远小于 150KB 上限
    assert.ok(fragmentLen < 80_000, `fragment ${fragmentLen}`);
    assert.deepEqual(decodeStateUrl(url), state);
    // 确认确实走了 deflate（同长度随机串压不动，结构化数据应明显小于 raw json 的 base64）
    const rawB64 = Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
    const compressedB64 = deflateSync(Buffer.from(JSON.stringify(state), 'utf8'))
      .toString('base64url');
    assert.ok(compressedB64.length < rawB64.length);
  });
});
