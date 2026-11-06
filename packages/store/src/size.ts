/** 官方建议的卡片体积上限（创建卡片实体超限报「卡片体积超限，建议控制在 30KB 以内」）。 */
export const CARD_SIZE_BUDGET = 30 * 1024;

/** 卡片 JSON 序列化后的 UTF-8 字节数，用于封印前后估算是否超出 {@link CARD_SIZE_BUDGET}。 */
export function cardByteLength(card: unknown): number {
  return Buffer.byteLength(JSON.stringify(card) ?? '', 'utf8');
}
