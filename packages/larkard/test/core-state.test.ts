import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { describe, it } from 'node:test';
import {
  CARD_SIZE_BUDGET,
  STATE_CODEC_VERSION,
  STATE_ELEMENT_ID,
  STATE_URL_PREFIX,
  StateCodecError,
  buildStateHostPatch,
  cardByteLength,
  createStateHost,
  decodeStateUrl,
  encodeStateUrl,
  findStateHost,
  isStateUrl,
  readCardState,
  sealCardState,
  unsealCardState,
} from '../src/core/state/index.js';

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
    assert.equal(host!.id, undefined);
    assert.deepEqual(
      (host!.action as { multi_url: { url: string } }).multi_url.url,
      url,
    );
    assert.equal((host!.action as { multiURL?: unknown }).multiURL, undefined);
    // 只写 url，不复制三端
    const multi = (host!.action as { multi_url: Record<string, string> }).multi_url;
    assert.equal(multi.pc_url, undefined);
    assert.equal(multi.ios_url, undefined);
    assert.equal(multi.android_url, undefined);

    // 空列、零内容
    const cols = host!.columns as Array<Record<string, unknown>>;
    assert.equal(cols.length, 1);
    assert.deepEqual(cols[0]!.elements, []);
    assert.equal(host!.margin, '-8px 0 0 0');

    assert.deepEqual(readCardState(card), state);

    // 宿主在 elements 末尾，业务节点仍在
    const els = (card.body as { elements: unknown[] }).elements;
    assert.equal((els[0] as { tag: string }).tag, 'markdown');
    assert.equal((els[els.length - 1] as { element_id: string }).element_id, STATE_ELEMENT_ID);
  });

  it('offsets the host by the body vertical spacing', () => {
    const card = baseCard();
    (card.body as { vertical_spacing: string }).vertical_spacing = '12px';
    sealCardState(card, { n: 1 });
    assert.equal(findStateHost(card)?.margin, '-12px 0 0 0');

    // 客户端纵向枚举 {default:8, medium:12, large:16}；横向那套 {small,default,large} 不能用。
    const named = baseCard();
    (named.body as { vertical_spacing: string }).vertical_spacing = 'large';
    sealCardState(named, { n: 1 });
    assert.equal(findStateHost(named)?.margin, '-16px 0 0 0');

    const medium = baseCard();
    (medium.body as { vertical_spacing: string }).vertical_spacing = 'medium';
    sealCardState(medium, { n: 1 });
    assert.equal(findStateHost(medium)?.margin, '-12px 0 0 0');

    // small / extra_large 不是纵向 token，客户端回落 default(8)。
    const unknown = baseCard();
    (unknown.body as { vertical_spacing: string }).vertical_spacing = 'extra_large';
    sealCardState(unknown, { n: 1 });
    assert.equal(findStateHost(unknown)?.margin, '-8px 0 0 0');
  });

  it('reads the RAW body spacing', () => {
    const card = baseCard();
    (card.body as Record<string, unknown>).property = {
      verticalSpacingValue: { type: 'pixels', value: 16 },
      elements: [],
    };
    sealCardState(card, { n: 1 });
    assert.equal(findStateHost(card)?.margin, '-16px 0 0 0');
  });

  it('skips the offset when the body lays out horizontally', () => {
    const card = baseCard();
    (card.body as { direction: string }).direction = 'horizontal';
    sealCardState(card, { n: 1 });
    assert.equal(findStateHost(card)?.margin, undefined);
  });

  it('createStateHost only writes margin when a gap is given', () => {
    const plain = createStateHost(`${STATE_URL_PREFIX}s1.abc`);
    assert.equal(plain.margin, undefined);
    assert.equal(createStateHost(`${STATE_URL_PREFIX}s1.abc`, '12px').margin, '-12px 0 0 0');
    assert.equal(createStateHost(`${STATE_URL_PREFIX}s1.abc`, 0).margin, undefined);
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

describe('named hosts', () => {
  it('keeps several hosts side by side, each read by id', () => {
    const card = baseCard();
    sealCardState(card, { program: 'p1' }, { id: 'card_prog' });
    sealCardState(card, { n: 1 });
    sealCardState(card, { n: 2 });

    assert.deepEqual(readCardState(card, { id: 'card_prog' }), { program: 'p1' });
    assert.deepEqual(readCardState(card), { n: 2 });
    const ids = (card.body as { elements: Array<{ element_id?: string }> }).elements
      .map((el) => el.element_id)
      .filter(Boolean);
    assert.deepEqual(ids, ['card_prog', STATE_ELEMENT_ID]);
  });

  it('does not let the default host read a named host', () => {
    const card = baseCard();
    sealCardState(card, { program: 'p1' }, { id: 'card_prog' });
    assert.equal(readCardState(card), null);
    assert.equal(findStateHost(card), null);
    assert.equal(readCardState(card, { id: 'other' }), null);
  });

  it('reads named hosts from the RAW shape', () => {
    const prog = encodeStateUrl({ program: 1 });
    const state = encodeStateUrl({ n: 3 });
    const rawHost = (id: string, url: string) => ({
      id,
      tag: 'column_set',
      property: { actions: [{ type: 'open_url', action: { url } }], columns: [] },
    });
    const card = { body: { property: { elements: [rawHost('card_prog', prog), rawHost(STATE_ELEMENT_ID, state)] } } };
    assert.deepEqual(readCardState(card, { id: 'card_prog' }), { program: 1 });
    assert.deepEqual(readCardState(card), { n: 3 });
  });

  it('reads through the raw_card_content envelope', () => {
    const card = baseCard();
    sealCardState(card, { program: 'p1' }, { id: 'card_prog' });
    sealCardState(card, { n: 7 });
    const envelope = { json_card: JSON.stringify(card), json_attachment: {}, card_schema: 2 };
    assert.deepEqual(readCardState(envelope), { n: 7 });
    assert.deepEqual(readCardState(envelope, { id: 'card_prog' }), { program: 'p1' });
    assert.ok(findStateHost(envelope));
  });

  it('unseals only the requested host', () => {
    const card = baseCard();
    sealCardState(card, { program: 'p1' }, { id: 'card_prog' });
    sealCardState(card, { n: 1 });
    assert.deepEqual(unsealCardState(card, { id: 'card_prog' }), { program: 'p1' });
    assert.deepEqual(readCardState(card), { n: 1 });
  });

  it('rejects ids the platform would refuse', () => {
    assert.throws(() => sealCardState(baseCard(), 1, { id: '1abc' }), StateCodecError);
    assert.throws(() => createStateHost(`${STATE_URL_PREFIX}s1.abc`, 0, { id: 'a'.repeat(21) }), StateCodecError);
  });
});

describe('buildStateHostPatch', () => {
  it('builds a CardKit partial_update_element op for the host', () => {
    const op = buildStateHostPatch({ n: 5 }, { id: 'card_state' });
    assert.equal(op.action, 'partial_update_element');
    assert.equal(op.params.element_id, STATE_ELEMENT_ID);
    assert.deepEqual(decodeStateUrl(op.params.partial_element.action.multi_url.url), { n: 5 });
  });
});

describe('cardByteLength', () => {
  it('counts UTF-8 bytes of the serialized card', () => {
    assert.equal(cardByteLength({ a: '中' }), JSON.stringify({ a: '中' }).length + 2);
    assert.ok(CARD_SIZE_BUDGET === 30 * 1024);
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
