import type { Json, JsonObject } from '../../src/program/index.js';
import type { CardHost, SendTarget } from '../../src/program/runtime/feishu.js';
import type { CallbackResponse } from '../../src/program/runtime/index.js';

/**
 * 内存版飞书：行为对齐真机 —— 卡片 JSON 直接作为消息内容发出去，没有卡片实体；
 * raw_card_content 读回的是带 json_card 信封的原始卡片。
 *
 * 卡片按 message_id 存。回调响应里的新卡要靠 applyResponse 落到"平台"上，
 * 就像客户端收到回调响应后把卡换掉那样。
 */
export class FakeFeishu implements CardHost {
  readonly cards = new Map<string, JsonObject>();
  readonly calls: string[] = [];
  /** 每次 sendCard 调用前执行。抛错则本次不发出。 */
  sendHook?: (n: number) => void;
  private next = 1;
  private sendCount = 0;

  constructor(private readonly latencyMs = 0) {}

  private async delay(): Promise<void> {
    if (this.latencyMs > 0) await new Promise((r) => setTimeout(r, this.latencyMs));
  }

  async sendCard(_target: SendTarget, card: JsonObject): Promise<string> {
    this.calls.push('sendCard');
    await this.delay();
    const n = ++this.sendCount;
    this.sendHook?.(n);
    const id = `om_${this.next++}`;
    this.cards.set(id, structuredClone(card));
    return id;
  }

  async getRawCard(messageId: string): Promise<JsonObject | null> {
    this.calls.push('getRawCard');
    await this.delay();
    const card = this.cards.get(messageId);
    if (!card) return null;
    return { json_card: JSON.stringify(card), card_schema: 2 };
  }

  /** 平台上的当前卡片（含封印宿主） */
  card(messageId: string): JsonObject {
    const card = this.cards.get(messageId);
    if (!card) throw new Error(`没有这张卡：${messageId}`);
    return card;
  }

  /** 模拟平台把回调响应里的新卡应用到消息上 */
  applyResponse(messageId: string, response: CallbackResponse): void {
    const data = response.card?.data;
    if (data) this.cards.set(messageId, structuredClone(data));
  }

  /** 按按钮文字构造一个真实形状的 card.action.trigger 回调 */
  callback(messageId: string, buttonText: string, openId: string): JsonObject {
    const elements = (this.card(messageId).body as { elements: any[] }).elements;
    const button = elements.find((el) => el.tag === 'button' && el.text?.content === buttonText);
    if (!button) throw new Error(`卡片上没有按钮 ${buttonText}`);
    const value = button.behaviors.find((b: any) => b.type === 'callback').value;
    return this.callbackWithValue(messageId, value, openId);
  }

  /** 用给定的回调 value 构造回调（按钮不在卡片上时用） */
  callbackWithValue(messageId: string, value: Json, openId: string): JsonObject {
    return {
      schema: '2.0',
      header: { event_type: 'card.action.trigger' },
      event: {
        operator: { open_id: openId },
        token: 'c-test',
        action: { tag: 'button', value },
        context: { open_message_id: messageId, open_chat_id: 'oc_test' },
      },
    };
  }
}
