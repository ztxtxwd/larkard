import type { JsonObject } from '../expr/values.js';

/**
 * 运行时用到的飞书开放接口。测试里可以换成内存实现。
 *
 * 只用消息接口，不碰 CardKit：卡片 JSON 直接作为 `msg_type: "interactive"` 的消息内容发出去，
 * 更新走回调响应（见 runtime.ts）。
 *
 * 两个能力都是可选的：只处理回调的宿主（如 bot）只需要 `getRawCard`；只负责发卡的宿主
 * 只需要 `sendCard`。缺哪个就在用到时报清楚。
 */
export interface CardHost {
  /** 发送一张交互卡片消息（content 就是卡片 JSON），返回 message_id */
  sendCard?(target: SendTarget, card: JsonObject): Promise<string>;
  /** 读消息里的卡片原始内容（raw_card_content 信封）；不是卡片消息时返回 null */
  getRawCard?(messageId: string): Promise<JsonObject | null>;
}

export type SendTarget = { chatId: string } | { openId: string };

/** 通用频率限制。HTTP 可能是 400，不能只看状态码。 */
export const RATE_LIMIT = 99991400;

/** 消息接口的限频错误码（"This operation triggers the frequency limit."）。 */
export const MESSAGE_RATE_LIMIT = 230020;

/** 单次开放接口请求的超时（毫秒）。 */
export const REQUEST_TIMEOUT_MS = 10_000;

export class FeishuApiError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly path: string,
    readonly retryable = false,
  ) {
    super(`${path} → ${code} ${message}`);
    this.name = 'FeishuApiError';
  }
}

export function isRetryableError(err: unknown): boolean {
  if (err instanceof FeishuApiError) {
    if (err.retryable) return true;
    if (err.code === RATE_LIMIT || err.code === MESSAGE_RATE_LIMIT) return true;
    if (err.code >= 500 && err.code <= 599) return true;
    return false;
  }
  if (err instanceof TypeError) return true;
  if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) return true;
  return false;
}

export interface FeishuClientOptions {
  appId: string;
  appSecret: string;
  /** 默认飞书；Lark 国际版用 https://open.larksuite.com */
  domain?: string;
  /** 单次请求超时，默认 10 秒 */
  requestTimeoutMs?: number;
}

/** 只封装运行时需要的几个接口：自动获取并缓存 tenant_access_token。 */
export class FeishuClient implements CardHost {
  private token: { value: string; expiresAt: number } | null = null;
  private readonly base: string;
  private readonly requestTimeoutMs: number;

  constructor(private readonly options: FeishuClientOptions) {
    this.base = `${options.domain ?? 'https://open.feishu.cn'}/open-apis`;
    this.requestTimeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
  }

  private async tenantToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt) return this.token.value;
    const res = await this.request('POST', '/auth/v3/tenant_access_token/internal', {
      app_id: this.options.appId,
      app_secret: this.options.appSecret,
    }, false);
    // 提前 5 分钟换新，避免请求途中过期
    this.token = { value: res.tenant_access_token, expiresAt: Date.now() + (res.expire - 300) * 1000 };
    return this.token.value;
  }

  private async request(method: string, path: string, body?: unknown, auth = true): Promise<any> {
    const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8' };
    if (auth) headers.authorization = `Bearer ${await this.tenantToken()}`;
    let res: Response;
    try {
      res = await fetch(this.base + path, {
        method,
        headers,
        signal: AbortSignal.timeout(this.requestTimeoutMs),
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (err) {
      if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
        throw new FeishuApiError(0, 'request timed out', path, true);
      }
      throw err;
    }
    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      throw new FeishuApiError(res.status, text.slice(0, 200), path, res.status >= 500);
    }
    if (json.code !== 0) throw new FeishuApiError(json.code, json.msg ?? '', path);
    if (!res.ok) throw new FeishuApiError(res.status, json.msg ?? res.statusText, path, res.status >= 500);
    return json;
  }

  /** 卡片 JSON 直接作为消息内容发出去，不需要卡片实体。 */
  async sendCard(target: SendTarget, card: JsonObject): Promise<string> {
    const [type, id] = 'chatId' in target ? ['chat_id', target.chatId] : ['open_id', target.openId];
    const res = await this.request('POST', `/im/v1/messages?receive_id_type=${type}`, {
      receive_id: id,
      msg_type: 'interactive',
      content: JSON.stringify(card),
    });
    return res.data.message_id;
  }

  async getRawCard(messageId: string): Promise<JsonObject | null> {
    const res = await this.request('GET', `/im/v1/messages/${messageId}?card_msg_content_type=raw_card_content`);
    const item = res.data?.items?.[0];
    if (!item || item.msg_type !== 'interactive') return null;
    return JSON.parse(item.body.content) as JsonObject;
  }
}
