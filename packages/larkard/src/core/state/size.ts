export { CARD_SIZE_BUDGET } from '../limits.js';

/** 卡片 JSON 序列化后的 UTF-8 字节数，用于封印前后估算是否超出 {@link CARD_SIZE_BUDGET}。 */
export function cardByteLength(card: unknown): number {
  return Buffer.byteLength(JSON.stringify(card) ?? '', 'utf8');
}
