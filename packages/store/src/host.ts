import {
  decodeStateUrl,
  encodeStateUrl,
  isStateUrl,
  STATE_URL_PREFIX,
} from './codec.js';

/** 专用空分栏宿主标识。发出去只写 element_id（官方 schema 不收 id）；客户端回读时标识键可能是 id。 */
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
  // DSL: action.multi_url.url；飞书客户端多端链接用 camelCase action.multiURL.url。
  const action = node.action;
  if (isRecord(action)) {
    // 先读客户端 camelCase multiURL，再兼容 DSL 历史 snake_case multi_url。
    const multiCamel = action.multiURL;
    if (isRecord(multiCamel) && typeof multiCamel.url === 'string' && isStateUrl(multiCamel.url)) {
      return multiCamel.url;
    }
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
  // 客户端元素对象标识键为 id（let{id,tag}=e），无 element_id 键读取；
  // element_id 仅 DSL 别名。优先按 id 判定。
  if (node.tag === 'column_set' && node.id === STATE_ELEMENT_ID) return true;
  if (node.tag === 'column_set' && node.element_id === STATE_ELEMENT_ID) return true;
  if (node.tag === 'column_set' && extractStateUrl(node)) return true;
  // RAW envelope 里 tag 可能在外层，id 在同级
  if (node.id === STATE_ELEMENT_ID && extractStateUrl(node)) return true;
  return false;
}

/**
 * 正文纵向间距（px）。
 *
 * 客户端的**横向 / 纵向间距是两套不同的枚举**（与 packages/renderer/src/registry.ts 的
 * VERTICAL_SPACING_PX 同源，来自客户端反推 #16/D6）：
 *   纵向 vertical : {default:8, medium:12, large:16}   —— 无 small / extra_large
 *   横向 horizontal: {small:4, default:8, large:12}     —— 无 medium / extra_large
 * 未知名值一律回落 default(8)；像素串（"12px"）照字面解析。
 *
 * 别用 schema 里 SpacingTokenSchema 那套并集值（small 4 / medium 8 / large 12 /
 * extra_large 16）——那是横纵并集，套到纵向字段上会差 4px。
 */
const VERTICAL_SPACING_PX: Record<string, number> = { default: 8, medium: 12, large: 16 };
const DEFAULT_VERTICAL_SPACING_PX = VERTICAL_SPACING_PX.default;

/** 间距枚举 / 像素串 / 数字 → px（纵向口径） */
function spacingPx(value: number | string | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : DEFAULT_VERTICAL_SPACING_PX;
  if (typeof value !== 'string') return DEFAULT_VERTICAL_SPACING_PX;
  const v = value.trim();
  const named = VERTICAL_SPACING_PX[v];
  if (named != null) return named;
  const matched = /^(-?\d+(?:\.\d+)?)(?:px)?$/.exec(v);
  return matched ? Number(matched[1]) : DEFAULT_VERTICAL_SPACING_PX;
}

/** 正文方向。DSL 在 body.direction；RAW 在 body.property.direction。 */
function bodyDirection(card: Record<string, unknown>): string | undefined {
  const body = isRecord(card.body) ? card.body : undefined;
  if (!body) return undefined;
  const property = isRecord(body.property) ? body.property : undefined;
  const dir = body.direction ?? property?.direction;
  return typeof dir === 'string' ? dir : undefined;
}

/** RAW 正文里的纵向间距回显：{type:'pixels', value:12} */
function rawVerticalSpacing(property: Record<string, unknown> | undefined): number | string | undefined {
  if (!property) return undefined;
  const echo = property.verticalSpacingValue;
  if (isRecord(echo) && typeof echo.value === 'number') return echo.value;
  const v = property.vertical_spacing;
  return typeof v === 'number' || typeof v === 'string' ? v : undefined;
}

/**
 * 正文纵向间距。DSL 写在 body.vertical_spacing；RAW 写在 body.property.verticalSpacingValue
 * （{type:'pixels', value:12}）或 body.property.vertical_spacing。
 */
function bodyVerticalSpacingPx(card: Record<string, unknown>): number {
  const body = isRecord(card.body) ? card.body : undefined;
  if (!body) return DEFAULT_VERTICAL_SPACING_PX;
  const property = isRecord(body.property) ? body.property : undefined;
  const raw = body.vertical_spacing ?? rawVerticalSpacing(property);
  return spacingPx(raw as number | string | undefined);
}

/**
 * 宿主要抵掉的间距。正文纵向排列时，宿主前面那段纵向间距要抵掉；横向排列时宿主前面
 * 是列间距，负上外边距只会把宿主顶上去，不抵。
 */
function bodyHostGapPx(card: Record<string, unknown>): number {
  if (bodyDirection(card) === 'horizontal') return 0;
  return bodyVerticalSpacingPx(card);
}

/**
 * 构造专用空分栏宿主（只写 url，避免 4 份复制吃额度）。
 *
 * gap：宿主前面那段正文纵向间距（枚举 / px 串 / 数字）。大于 0 时用等值负上外边距抵掉
 * ——真机把空分栏留在正文流里，前面仍有一段间距；网页渲染器把宿主移出排版，不受此值影响。
 * 传 0（默认）表示不写 margin。
 */
export function createStateHost(stateUrl: string, gap: number | string = 0): Record<string, unknown> {
  const gapPx = spacingPx(gap);
  return {
    tag: 'column_set',
    // 发出去只写 element_id。id 是客户端回读时的标识键，官方 schema 不收（写了会 200621）。
    element_id: STATE_ELEMENT_ID,
    // 真机把空分栏留在正文流里，前面仍有一段 vertical_spacing。
    // 负的上外边距把这段间距抵掉。网页渲染器会把宿主移出排版，不受这个值影响。
    ...(gapPx > 0 ? { margin: `-${gapPx}px 0 0 0` } : {}),
    action: {
      // 发出去的卡片只写 multi_url。multiURL 是客户端回读时的 camelCase，官方 schema 不收（200621）。
      multi_url: { url: stateUrl },
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
  next.push(createStateHost(stateUrl, bodyHostGapPx(card)));
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
