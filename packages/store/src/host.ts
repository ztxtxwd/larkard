import {
  decodeStateUrl,
  encodeStateUrl,
  isStateUrl,
  STATE_URL_PREFIX,
} from './codec.js';

/** 专用空分栏宿主的 element_id（写入时保证；飞书/adapter 回读可能丢掉） */
export const STATE_ELEMENT_ID = 'card_state';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function walk(
  node: unknown,
  visit: (obj: Record<string, unknown>, parent: Record<string, unknown> | null) => void,
  parent: Record<string, unknown> | null = null,
): void {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit, parent);
    return;
  }
  if (!isRecord(node)) return;
  visit(node, parent);
  for (const value of Object.values(node)) walk(value, visit, node);
}

/** 从任意节点上抠出可能挂着的封印 URL */
function extractStateUrl(node: Record<string, unknown>): string | null {
  // DSL: action.multi_url.url
  const action = node.action;
  if (isRecord(action)) {
    const multi = action.multi_url;
    if (isRecord(multi) && typeof multi.url === 'string' && isStateUrl(multi.url)) {
      return multi.url;
    }
    // 兼容误写成 action.url
    if (typeof action.url === 'string' && isStateUrl(action.url)) {
      return action.url;
    }
  }

  // adapter 投影残留 / RAW 形态: actions:[{type:'open_url', action:{url}}]
  if (Array.isArray(node.actions)) {
    for (const item of node.actions) {
      if (!isRecord(item)) continue;
      const inner = isRecord(item.action) ? item.action : item;
      for (const key of ['url', 'default_url', 'pc_url', 'ios_url', 'android_url', 'pcURL', 'iosURL', 'androidURL'] as const) {
        const v = inner[key];
        if (typeof v === 'string' && isStateUrl(v)) return v;
      }
    }
  }

  // RAW property.actions
  const property = node.property;
  if (isRecord(property) && Array.isArray(property.actions)) {
    for (const item of property.actions) {
      if (!isRecord(item)) continue;
      const inner = isRecord(item.action) ? item.action : item;
      for (const key of ['url', 'pcURL', 'iosURL', 'androidURL'] as const) {
        const v = inner[key];
        if (typeof v === 'string' && isStateUrl(v)) return v;
      }
    }
  }

  // 顶层 multi_url
  if (isRecord(node.multi_url) && typeof node.multi_url.url === 'string' && isStateUrl(node.multi_url.url)) {
    return node.multi_url.url;
  }

  return null;
}

function isStateHost(node: Record<string, unknown>): boolean {
  if (node.tag === 'column_set' && node.element_id === STATE_ELEMENT_ID) return true;
  if (node.tag === 'column_set' && node.id === STATE_ELEMENT_ID) return true;
  if (node.tag === 'column_set' && extractStateUrl(node)) return true;
  // RAW envelope 里 tag 可能在外层，id 在同级
  if (node.id === STATE_ELEMENT_ID && extractStateUrl(node)) return true;
  return false;
}

/** 构造专用空分栏宿主（只写 url，避免 4 份复制吃额度） */
export function createStateHost(stateUrl: string): Record<string, unknown> {
  return {
    tag: 'column_set',
    element_id: STATE_ELEMENT_ID,
    action: {
      multi_url: {
        url: stateUrl,
      },
    },
    columns: [
      {
        tag: 'column',
        width: 'auto',
        elements: [],
      },
    ],
  };
}

function ensureBodyElements(card: Record<string, unknown>): unknown[] {
  const existing = card.body;
  const body: Record<string, unknown> = isRecord(existing)
    ? existing
    : { elements: [] };
  if (!isRecord(existing)) {
    card.body = body;
  }
  if (!Array.isArray(body.elements)) {
    body.elements = [];
  }
  return body.elements as unknown[];
}

/** 在卡片上查找 state 宿主 column_set */
export function findStateHost(card: Record<string, unknown>): Record<string, unknown> | null {
  let found: Record<string, unknown> | null = null;
  walk(card, (obj) => {
    if (found) return;
    if (isStateHost(obj)) found = obj;
  });
  return found;
}

/**
 * 从卡片读取封印 state（不改卡）。
 * 兼容：DSL `action.multi_url`、adapter 投影的 `actions[]`、RAW `property.actions`。
 */
export function readCardState<T = unknown>(card: Record<string, unknown>): T | null {
  // 优先专用宿主
  const host = findStateHost(card);
  if (host) {
    const url = extractStateUrl(host);
    if (url) {
      const state = decodeStateUrl(url);
      return state as T | null;
    }
  }

  // 兜底：全树扫封印 URL（adapter 可能丢掉 element_id）
  let decoded: unknown | null = null;
  walk(card, (obj) => {
    if (decoded !== null) return;
    const url = extractStateUrl(obj);
    if (url) decoded = decodeStateUrl(url);
  });
  // 再扫纯字符串字段
  if (decoded === null) {
    walk(card, (obj) => {
      if (decoded !== null) return;
      for (const v of Object.values(obj)) {
        if (typeof v === 'string' && v.startsWith(STATE_URL_PREFIX)) {
          const s = decodeStateUrl(v);
          if (s !== null) {
            decoded = s;
            return;
          }
        }
      }
    });
  }
  return decoded as T | null;
}

/**
 * 把 state 封印进卡片：写入/更新空分栏 `card_state` 的 `action.multi_url.url`。
 * 就地修改 card；返回编码后的 URL。
 */
export function sealCardState(card: Record<string, unknown>, state: unknown): string {
  const stateUrl = encodeStateUrl(state);
  const elements = ensureBodyElements(card);

  // 去掉旧宿主（含 adapter 残留的 actions 形态）
  const next = elements.filter((el) => !(isRecord(el) && isStateHost(el)));
  next.push(createStateHost(stateUrl));
  const body = card.body as Record<string, unknown>;
  body.elements = next;
  return stateUrl;
}

/**
 * 读取并移除宿主分栏（可选，用于迁移）。
 * 返回解码到的 state；没有则 null。
 */
export function unsealCardState<T = unknown>(card: Record<string, unknown>): T | null {
  const state = readCardState<T>(card);
  const body = isRecord(card.body) ? card.body : null;
  if (body && Array.isArray(body.elements)) {
    body.elements = body.elements.filter((el) => !(isRecord(el) && isStateHost(el)));
  }
  return state;
}
