/**
 * 异步渲染：用飞书 access token 自动拉取卡片图片并内联（data URI），
 * 或直接按 message_id 把整条消息拉回来再渲染。
 *
 * 网络层单独成文件，使同步核心（index.ts）保持零依赖、可被 tree-shake。
 * 所有渲染仍复用同步的 renderCardToString / renderCard——这里只负责把图片
 * 预取成 data URI，再通过生成好的 resolveImage 钩子喂进去。
 */
import type {
  AsyncRenderOptions, CardElement, CardInput, CardMessageInput,
  ElementProperty, JsonAttachment, JsonCard,
} from './types';
import { renderCard, renderCardToString } from './index';

const DEFAULT_API_BASE = 'https://open.feishu.cn/open-apis/im/v1';

/** 取 fetch 实现：优先 options.fetch，其次全局 fetch；都没有则抛出可读错误 */
function getFetch(options: AsyncRenderOptions): typeof fetch {
  if (options.fetch) return options.fetch;
  if (typeof fetch !== 'undefined') return fetch;
  throw new Error(
    '[FeishuCard] 当前环境没有全局 fetch（如 Node 16）。请升级运行时，或通过 options.fetch 注入一个 fetch 实现。'
  );
}

/** ArrayBuffer -> base64（Node 用 Buffer，浏览器用 btoa；保持零依赖、双端可用） */
export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const g = globalThis as { Buffer?: { from(b: ArrayBuffer): { toString(enc: string): string } } };
  if (typeof g.Buffer !== 'undefined') {
    return g.Buffer.from(buf).toString('base64');
  }
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  // eslint-disable-next-line no-undef
  return btoa(binary);
}

/**
 * 拉取单条卡片消息并解包成 { json_card, json_attachment, messageId }。
 * 必须带 card_msg_content_type=raw_card_content，否则拿不到 json_card。
 * 注意接口里的 json_card 是被字符串化的 JSON（双重编码），需再解一层。
 */
export async function fetchCardMessage(
  messageId: string,
  options: AsyncRenderOptions
): Promise<{ json_card: JsonCard; json_attachment?: JsonAttachment; messageId: string }> {
  const token = options.accessToken;
  if (!token) {
    throw new Error('[FeishuCard] 传入 messageId 时必须同时提供 options.accessToken（拉取消息需要鉴权）。');
  }
  const base = options.apiBaseURL || DEFAULT_API_BASE;
  const url = `${base}/messages/${encodeURIComponent(messageId)}?card_msg_content_type=raw_card_content`;
  const res = await getFetch(options)(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json() as {
    code?: number; msg?: string;
    data?: { items?: Array<{ message_id?: string; body?: { content?: string } }> };
  };
  if (data.code !== 0) {
    throw new Error(`[FeishuCard] 拉取消息失败 code=${data.code} msg=${data.msg}`);
  }
  const item = data.data?.items?.[0];
  if (!item?.body?.content) {
    throw new Error(`[FeishuCard] 消息 ${messageId} 无可渲染内容`);
  }
  const content = JSON.parse(item.body.content) as {
    json_card?: JsonCard | string; json_attachment?: JsonAttachment;
  };
  let jsonCard = content.json_card;
  if (typeof jsonCard === 'string') jsonCard = JSON.parse(jsonCard) as JsonCard;
  if (!jsonCard) throw new Error(`[FeishuCard] 消息 ${messageId} 不是卡片消息（无 json_card）`);
  return {
    json_card: jsonCard,
    json_attachment: content.json_attachment,
    messageId: item.message_id || messageId,
  };
}

/**
 * 拉取单张图片二进制，转成 base64 data URI。
 * 端点：GET /messages/{messageId}/resources/{origin_key}?type=image
 */
export async function fetchImageDataUri(
  messageId: string,
  originKey: string,
  options: AsyncRenderOptions
): Promise<string> {
  const base = options.apiBaseURL || DEFAULT_API_BASE;
  const url = `${base}/messages/${encodeURIComponent(messageId)}`
    + `/resources/${encodeURIComponent(originKey)}?type=image`;
  const res = await getFetch(options)(url, {
    headers: { Authorization: `Bearer ${options.accessToken}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const contentType = res.headers.get('content-type') || 'image/png';
  const b64 = arrayBufferToBase64(await res.arrayBuffer());
  return `data:${contentType};base64,${b64}`;
}

/** 递归收集卡片树里 img 元素实际引用到的 imageID（跳过附件表中废弃项，避免无谓拉取） */
export function collectReferencedImageIds(node: unknown, acc: Set<string> = new Set()): Set<string> {
  if (!node || typeof node !== 'object') return acc;
  if (Array.isArray(node)) {
    for (const n of node) collectReferencedImageIds(n, acc);
    return acc;
  }
  const el = node as CardElement;
  if (el.tag === 'img' && el.property?.imageID != null) {
    acc.add(String(el.property.imageID));
  }
  for (const k of Object.keys(node as Record<string, unknown>)) {
    collectReferencedImageIds((node as Record<string, unknown>)[k], acc);
  }
  return acc;
}

/**
 * 预取卡片实际用到的图片，返回 { [imageID]: dataUri }。
 * 只拉卡片里 img 元素引用过的 imageID；缺 token / 缺 messageId / 缺附件表则返回空表。
 * 单张失败只 warn 并跳过（后续 resolveImage 拿不到 src -> 占位图）。
 */
export async function prefetchImages(
  jsonCard: JsonCard,
  jsonAttachment: JsonAttachment | undefined,
  messageId: string | undefined,
  options: AsyncRenderOptions
): Promise<Record<string, string>> {
  const images = jsonAttachment?.images;
  if (!options.accessToken || !messageId || !images) return {};
  const referenced = collectReferencedImageIds(jsonCard);
  const result: Record<string, string> = {};
  await Promise.all([...referenced].map(async (localId) => {
    const originKey = images[localId]?.origin_key;
    if (!originKey) return;
    try {
      result[localId] = await fetchImageDataUri(messageId, originKey, options);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[FeishuCard] 图片拉取失败 message=${messageId} key=${originKey}：${(err as Error).message}`);
    }
  }));
  return result;
}

/** 归一化输入为 { json_card, json_attachment?, messageId? }。字符串输入 -> 先拉消息。 */
async function resolveInput(
  input: CardMessageInput,
  options: AsyncRenderOptions
): Promise<{ jsonCard: JsonCard; jsonAttachment?: JsonAttachment; messageId?: string }> {
  if (typeof input === 'string') {
    const m = await fetchCardMessage(input, options);
    return { jsonCard: m.json_card, jsonAttachment: m.json_attachment, messageId: m.messageId };
  }
  const anyInput = input as Record<string, unknown>;
  // 形如 { json_card, json_attachment?, messageId? }（接口 content 解包后的形态）
  const jsonCard = (anyInput.json_card as JsonCard | undefined) || (input as JsonCard);
  return {
    jsonCard,
    jsonAttachment: anyInput.json_attachment as JsonAttachment | undefined,
    messageId: (anyInput.messageId as string | undefined) || options.messageId,
  };
}

/** 把预取到的图片表合成 resolveImage（优先命中预取表，否则回退 caller 自带的 resolveImage） */
function withImageResolver(options: AsyncRenderOptions, map: Record<string, string>): AsyncRenderOptions {
  const userResolve = options.resolveImage;
  return {
    ...options,
    resolveImage: (p: ElementProperty) => {
      const id = p.imageID;
      if (id != null && map[id]) return map[id];
      return userResolve ? userResolve(p) : null;
    },
  };
}

/**
 * 异步渲染为 HTML 字符串。
 * @param input  messageId 字符串，或卡片对象 { json_card, json_attachment?, messageId? }
 * @param options 含可选 accessToken：传了就内联图片，不传则图片渲染成占位图。
 */
export async function renderCardToStringAsync(
  input: CardMessageInput,
  options: AsyncRenderOptions = {}
): Promise<string> {
  const { jsonCard, jsonAttachment, messageId } = await resolveInput(input, options);
  const map = await prefetchImages(jsonCard, jsonAttachment, messageId, options);
  // 透传 json_attachment：人员姓名/头像（attachment.persons）由同步层自动捞出。
  return renderCardToString(
    { json_card: jsonCard, json_attachment: jsonAttachment } as CardInput,
    withImageResolver(options, map)
  );
}

/**
 * 异步渲染为真实 DOM 节点（浏览器）。Node 端请用 renderCardToStringAsync。
 * 注意：浏览器直连 open.feishu.cn 会被 CORS 拦截，需经服务端代理（见 README）。
 */
export async function renderCardAsync(
  input: CardMessageInput,
  options: AsyncRenderOptions = {}
): Promise<Node> {
  const { jsonCard, jsonAttachment, messageId } = await resolveInput(input, options);
  const map = await prefetchImages(jsonCard, jsonAttachment, messageId, options);
  return renderCard(
    { json_card: jsonCard, json_attachment: jsonAttachment } as CardInput,
    withImageResolver(options, map)
  );
}
