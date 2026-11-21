import type { JsonObject } from '../expr/values.js';
import { readCardState, sealCardState } from '../../core/state/index.js';

/** 不可变的程序宿主 */
export const PROGRAM_HOST = 'card_prog';
/** 可变的实例状态宿主 */
export const STATE_HOST = 'card_state';

/**
 * 封印在卡片上的实例信息：状态与版本号。
 *
 * 没有卡片实体，也就没有 card_id 与 sequence：更新卡片走回调响应，平台不提供乐观锁。
 */
export interface InstanceMeta {
  /** 状态版本，每次状态变化 +1，写进回调 value 用于识别过期点击 */
  rev: number;
  state: JsonObject;
}

/** 在渲染出的视图上挂两个宿主：程序和实例信息。不改传入的 view。 */
export function composeCard(view: JsonObject, program: JsonObject, meta: InstanceMeta): JsonObject {
  const card = structuredClone(view);
  sealCardState(card, program, { id: PROGRAM_HOST });
  sealCardState(card, meta, { id: STATE_HOST });
  return card;
}

function isMeta(value: unknown): value is InstanceMeta {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  // 多余字段一律容忍：旧运行时封印的 card_id / seq 不影响读取。
  return typeof m.rev === 'number' && typeof m.state === 'object' && m.state !== null;
}

/** 从卡片（或 raw_card_content 信封）读回程序与实例信息；不是本运行时发的卡片时返回 null。 */
export function readEnvelope(card: JsonObject): { program: JsonObject; meta: InstanceMeta } | null {
  const program = readCardState<JsonObject>(card, { id: PROGRAM_HOST });
  const meta = readCardState(card, { id: STATE_HOST });
  if (!program || typeof program !== 'object' || !isMeta(meta)) return null;
  return { program, meta };
}
