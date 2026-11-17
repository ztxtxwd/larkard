/**
 * 同步渲染核心：RAW / DSL → VNode → HTML 字符串。
 *
 * 这里不碰 DOM、不注入 CSS、不做交互水合；浏览器能力在 `./browser`，
 * 资源在 `./assets`，异步取数在 `./async`。
 */
import type { CardInput, JsonCard, RenderContext, RenderOptions, VNode } from './types.js';
import { BASE_FONT_SIZE, BASE_LINE_HEIGHT, CLS } from './constants.js';
import { h, vnodeToString } from './vnode.js';
import { getComponent, renderElement, renderElements } from './registry.js';
import { registerBuiltins } from './components.js';
import { dslToRaw } from '../adapter/index.js';

// 模块加载时注册全部内置组件（显式调用，避免被 tree-shake）
registerBuiltins();

/** 把多种外层包装归一到 json_card 对象 */
function unwrap(card: CardInput | null | undefined): JsonCard | null {
  if (!card) return null;
  const anyCard = card as Record<string, unknown>;
  if (anyCard.json_card) return anyCard.json_card as JsonCard;
  if (anyCard.card && (anyCard.card as Record<string, unknown>).json_card) {
    return (anyCard.card as { json_card: JsonCard }).json_card;
  }
  return card as JsonCard;
}

type WidthMode = 'default' | 'compact' | 'fill';

/**
 * 读取卡片宽度模式（config.width_mode，JSON 2.0）。
 *
 * RAW 里字段名可能是 snake_case（真机消息）或 camelCase（部分宿主），两种都认，
 * 与 adapter 的行为保持一致。不填或非法值按官方默认值 default 处理。
 */
function readWidthMode(jc: JsonCard): WidthMode {
  const cfg = jc.config;
  if (!cfg || typeof cfg !== 'object') return 'default';
  const raw = (cfg as Record<string, unknown>).width_mode
    ?? (cfg as Record<string, unknown>).widthMode;
  return raw === 'compact' || raw === 'fill' ? raw : 'default';
}

/**
 * 从输入里捞 json_attachment.persons 合进 options.persons（不覆盖 caller 显式传入的）。
 * 这样直接把整条消息对象 { json_card, json_attachment } 丢给同步渲染时，人员姓名/头像也能出。
 */
function withPersonsFromAttachment(card: CardInput, options: RenderOptions): RenderOptions {
  if (options.persons) return options; // caller 显式给了就以它为准
  const anyCard = card as Record<string, unknown>;
  const att = (anyCard.json_attachment
    || (anyCard.card as Record<string, unknown> | undefined)?.json_attachment) as
    { persons?: RenderOptions['persons'] } | undefined;
  if (att?.persons) return { ...options, persons: att.persons };
  return options;
}

/** 构建整张卡片的 VNode 树 */
export function buildCardVNode(card: CardInput, options: RenderOptions): VNode {
  const jc = unwrap(card);
  if (!jc) throw new Error('[FeishuCard] 无效的卡片数据');
  const ctx: RenderContext = {
    options: withPersonsFromAttachment(card, options),
    kernel: { getComponent, renderElement, renderElements },
  };

  const parts: Array<VNode | null> = [];
  if (jc.header) parts.push(renderElement(jc.header, ctx));
  const bodyEl = jc.body || jc.newBody;
  // #18/D8：客户端 s = !!header && (!template || template===default || template===disabled)
  // 时 body paddingTop 从 12 收紧为 8。无 header 或彩色模板时保持 12。
  if (bodyEl) {
    const headerTpl = jc.header?.property?.template as string | undefined;
    const compactHeader = !!jc.header
      && (!headerTpl || headerTpl === 'default' || headerTpl === 'disabled');
    const bodyCtx: RenderContext = compactHeader ? { ...ctx, bodyPaddingTop: 8 } : ctx;
    // RAW 里 body 常无 tag（直接 { elements: [...] }），补上 'body' 以走 body 组件渲染。
    parts.push(renderElement(bodyEl.tag ? bodyEl : { ...bodyEl, tag: 'body' }, bodyCtx));
  }

  return h('div', {
    className: `${CLS}-root ${CLS} ${CLS}-root--width-${readWidthMode(jc)}`,
    style: { fontSize: BASE_FONT_SIZE + 'px', lineHeight: String(BASE_LINE_HEIGHT) },
  }, parts.filter((p): p is VNode => !!p));
}

/** 渲染为 HTML 字符串（Node / SSR / 邮件 / 截图等） */
export function renderCardToString(card: CardInput, options: RenderOptions = {}): string {
  return vnodeToString(buildCardVNode(card, options));
}

/**
 * 输入公开 DSL（JSON Schema 2.0 卡片），渲染为 HTML 字符串。
 * = renderCardToString(dslToRaw(dsl))。DSL 里 markdown 写字符串、字段用 snake_case，
 * 内部转成 RAW 再渲染，无需真发一遍卡片。
 */
export function renderDslToString(dsl: unknown, options: RenderOptions = {}): string {
  return renderCardToString(dslToRaw(dsl), options);
}

