import { deflateSync, inflateSync } from 'node:zlib';

/** fragment 协议版本：s1 = JSON → UTF-8 → deflate → base64url */
export const STATE_CODEC_VERSION = 's1' as const;

/** 跳转基座：即使被点到也不会打开网页 */
export const STATE_URL_BASE = 'lark://msgcard/unsupported_action';

/** 完整 URL 前缀（含 #） */
export const STATE_URL_PREFIX = `${STATE_URL_BASE}#` as const;

export class StateCodecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StateCodecError';
  }
}

/**
 * 把任意 JSON 可序列化值编码为完整封印 URL。
 * 格式：`lark://msgcard/unsupported_action#s1.<base64url(deflate(json))>`
 */
export function encodeStateUrl(state: unknown): string {
  let json: string;
  try {
    json = JSON.stringify(state);
  } catch (err) {
    throw new StateCodecError(
      `state 无法 JSON 序列化: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (json === undefined) {
    throw new StateCodecError('state 无法 JSON 序列化（undefined）');
  }
  const compressed = deflateSync(Buffer.from(json, 'utf8'), { level: 9 });
  const payload = compressed.toString('base64url');
  return `${STATE_URL_PREFIX}${STATE_CODEC_VERSION}.${payload}`;
}

/**
 * 从封印 URL（或裸 fragment / 带版本前缀的 payload）解码 state。
 * 无法识别或损坏时返回 null。
 */
export function decodeStateUrl(urlOrFragment: string): unknown | null {
  if (typeof urlOrFragment !== 'string' || !urlOrFragment) return null;

  let fragment = urlOrFragment;
  const hash = urlOrFragment.indexOf('#');
  if (hash >= 0) {
    fragment = urlOrFragment.slice(hash + 1);
  }

  // s1.<payload>
  const dot = fragment.indexOf('.');
  if (dot <= 0) return null;
  const version = fragment.slice(0, dot);
  const payload = fragment.slice(dot + 1);
  if (!payload) return null;

  if (version === STATE_CODEC_VERSION) {
    try {
      const raw = Buffer.from(payload, 'base64url');
      const json = inflateSync(raw).toString('utf8');
      return JSON.parse(json) as unknown;
    } catch {
      return null;
    }
  }

  return null;
}

/** 判断字符串是否为我们的封印 URL / fragment */
export function isStateUrl(value: string): boolean {
  if (typeof value !== 'string' || !value) return false;
  if (value.startsWith(STATE_URL_PREFIX)) {
    return decodeStateUrl(value) !== null;
  }
  // 裸 fragment
  if (value.startsWith(`${STATE_CODEC_VERSION}.`)) {
    return decodeStateUrl(value) !== null;
  }
  return false;
}
