/**
 * 内置元素组件：tag -> 渲染函数。
 * 调用 registerBuiltins() 完成所有内置组件注册（index.ts 在模块加载时调用）。
 * 用显式函数调用而非 import 副作用，避免被打包器 tree-shake 掉。
 * 元素 property 结构与样式规则均逆向自网页版飞书引擎，详见 README。
 */
import type { CardElement, ElementProperty, RenderContext, TableColumn, TableHeaderStyle, VNode } from './types';
import {
  BASE_FONT_SIZE, BASE_LINE_HEIGHT,
  CHART_DEFAULT_ASPECT_RATIO, CHART_FIXED_MIN_SIZE, CHART_MIN_HEIGHT, CHART_MIN_WIDTH,
  CLS, HEADER_TEMPLATE, HEADING_LEVELS, ICON_COLOR_MAP, ICON_SIZE_MAP,
  NAMED_TEXT_COLOR, ORDER_STYLES, AT_FALLBACK_NAME,
  PERSON_FALLBACK_AVATAR, PERSON_FALLBACK_NAME, PERSON_FOLLOW_FONT,
  PERSON_LIST_COMMA, PERSON_LIST_SIZE, PERSON_SINGLE_SIZE,
  PERSON_UNKNOWN_AVATAR, PERSON_UNKNOWN_NAME,
  TABLE_COLUMN_MIN_WIDTH, TABLE_HEAD_BG, TABLE_ROW_HEIGHT, TABLE_ROW_HEIGHT_LINES,
  TABLE_ROW_MAX_HEIGHT, TABLE_TAG_COLOR, TAG_COLOR,
  TEXT_SIZE_MAP, lineHeightForFontSize, paletteColor, tableLinesForRowHeightPx, textLineHeight,
} from './constants';
import { CHART_SPEC_ATTR } from './chart-hydrate';
import { HEADER_BG_LIGHT } from './assets';
import { BASE_STYLES_CSS } from './base-styles';
import { ICON_FONT_CSS } from './icon-font';
import { EMOJI_KEY_TO_NAME, EMOJI_SPRITE_CSS } from './emoji-data';
import { parseMarkdown } from './md-parse';
import { h } from './vnode';
import {
  alignToStyle, applyOuterMargin, bgStyleToColor, boxToStyle, extractPlainText, extractText,
  getChildElements, propertyBackgroundColor, resolveBorderColor, resolveCornerRadius,
  lookupPerson, personAvatarSrc,
  registerComponent, renderElement, renderElements,
  resolveColor, resolveDimensionPx, resolveHoverTips, resolveImageSize, resolveImageSrc, resolveMediaSrc,
  resolveTextSizeKey, resolveURL, resolveVideoCoverSrc, sizeToPx,
  horizontalMarginPx, horizontalSpacingToPx, verticalSpacingToPx,
  textStyleToModifiers, textStyleToStyle,
} from './registry';
import { resolveCustomBackgroundLight, resolveCustomBorderLight, readThemeColorLight } from '@open-feishu-card/adapter';
import {
  AUDIO_PAUSE_FLAT_ICON_SVG, AUDIO_PAUSE_ICON_SVG,
  AUDIO_PLAY_FLAT_ICON_SVG, AUDIO_PLAY_ICON_SVG,
  AUDIO_SPEAK_ICON_SVG,
  audioInlineMetrics,
} from './audio-hydrate';

/** 视频封面中央播放钮（简化圆底三角，对齐 .universal-card-video__play-btn） */
const VIDEO_PLAY_ICON_SVG =
  '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">'
  + '<path d="M8 5.14v14l11-7-11-7z"/></svg>';

let registered = false;

/** 是否为普通对象（components 内多处共用；必须放在模块顶层，registerBuiltins 外的 helper 也要用） */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// text_tag 默认尺寸：对齐设计系统 Tag `extra-small`
// （_pp-tag__size-extra-small：height:16px; padding:0 4px; font-size:10px；
//  或 font-size:12px + zoom:.833 ≈ 10px 视觉效果）。
// 之前用 12px 无缩放，字看起来偏大。
function textTagStyle(bg: string, text: string): Record<string, string> {
  return {
    backgroundColor: bg,
    color: text,
    padding: '0 4px',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: '500',
    display: 'inline-flex',
    alignItems: 'center',
    lineHeight: '16px',
    height: '16px',
  };
}

// 表格 options 列标签：design system Tag `small` + `shape=round`。
// 尺寸骨架来自 _pp-tag__size-small（height:20px; line-height:20px），
// 但卡片样式表 .universal-card-text-tag__tag--table 把内容字号/字重覆盖成
// 14px/600、padding 0 6px；圆角是 round 形态的胶囊。
// 与正文 text_tag 的 extra-small（16px/10px/半透明底）是两套皮肤，不能复用。
function tableTagStyle(bg: string, text: string): Record<string, string> {
  return {
    backgroundColor: bg,
    color: text,
    padding: '0 6px',
    borderRadius: '999px',
    fontSize: '14px',
    fontWeight: '600',
    display: 'inline-flex',
    alignItems: 'center',
    lineHeight: '20px',
    height: '20px',
    maxWidth: '100%',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };
}

// ---- 人员（模块级，供 person_v1 / person_list / table persons 列共用）----
// 元素自身只带 ID；姓名 + 头像 key 在 json_attachment.persons（按 open_id 索引）。
// DOM/尺寸/胶囊边距逆向自网页版 Person / PersonList 组件。

type PersonResolve = {
  name: string;
  src: string | null;
  unknown: boolean;
};

/** 解析人员展示名与头像：命中人员表 → 真名；表存在但无此 ID → 未知用户；无人员表 → 离线降级。 */
function resolvePersonDisplay(userID: string | undefined, ctx: RenderContext): PersonResolve {
  const person = lookupPerson(userID, ctx);
  if (person) {
    return {
      name: person.content || PERSON_UNKNOWN_NAME,
      src: personAvatarSrc(person, ctx),
      unknown: false,
    };
  }
  if (ctx.options.persons) {
    return { name: PERSON_UNKNOWN_NAME, src: PERSON_UNKNOWN_AVATAR, unknown: true };
  }
  return { name: PERSON_FALLBACK_NAME, src: PERSON_FALLBACK_AVATAR, unknown: false };
}

function isPersonCapsule(prop: { pillShaped?: boolean; style?: unknown }): boolean {
  if (prop.pillShaped === true) return true;
  return prop.style === 'capsule';
}

/** 圆角头像节点（对齐 .universal-card-person__internal-avatar / person-list__avatar） */
function renderAvatarNode(
  className: string,
  px: number,
  src: string | null,
  name: string,
) {
  const style = { width: px + 'px', height: px + 'px' };
  if (src) {
    return h('img', { className, src, alt: name, style });
  }
  const initial = (name || '?').slice(0, 1);
  return h('span', {
    className: `${className} ${CLS}-person__avatar--placeholder`,
    style: { ...style, fontSize: Math.round(px * 0.5) + 'px' },
  }, initial);
}

/**
 * person_v1：头像（可选）+ 姓名（可选），支持 normal / capsule。
 * 结构对齐真机：.person > .content > [.avatar-wrapper + .name]
 *
 * 尺寸两套：
 * - 独立组件：走 PERSON_SINGLE_SIZE（缺省 medium）
 * - markdown 内联：飞书设 avatarFollowFontSize，跟正文字号（默认 14 → 头像 18）
 */
function renderPersonChip(
  userID: string | undefined,
  prop: {
    showAvatar?: boolean;
    showName?: boolean;
    size?: string;
    pillShaped?: boolean;
    style?: unknown;
    avatarFollowFontSize?: boolean;
    fontSize?: number;
    lineHeight?: number;
  },
  ctx: RenderContext
) {
  const showAvatar = prop.showAvatar !== false;
  const showName = prop.showName !== false;
  if (!showAvatar && !showName) return null;

  const capsule = isPersonCapsule(prop);
  const nameOnly = !showAvatar && showName;
  // markdown 注入 textMetrics，或元素自带 avatarFollowFontSize（RAW / md-parse 形态）
  const follow = prop.avatarFollowFontSize === true || !!ctx.textMetrics;
  const parentFs = Number(prop.fontSize) || ctx.textMetrics?.fontSize || (follow ? BASE_FONT_SIZE : 0);
  const parentLh = Number(prop.lineHeight) || ctx.textMetrics?.lineHeight;

  let fontSize: number;
  let lineHeight: number;
  let avatarPx: number;
  let followMargins = false;

  if (follow && parentFs) {
    const hl = PERSON_FOLLOW_FONT[parentFs];
    fontSize = parentFs;
    lineHeight = hl?.lineHeight ?? parentLh ?? parentFs + 8;
    followMargins = true;
    if (showAvatar && showName) {
      avatarPx = hl?.avatarSize ?? (capsule
        ? lineHeight - (fontSize > 20 ? 8 : 4)
        : lineHeight);
    } else if (showAvatar && capsule) {
      const token = PERSON_SINGLE_SIZE[String(prop.size ?? 'medium')] || PERSON_SINGLE_SIZE.medium;
      avatarPx = token.avatar_size;
    } else if (showAvatar) {
      avatarPx = lineHeight;
    } else {
      avatarPx = 0;
    }
  } else {
    const sizeKey = String(prop.size ?? 'medium');
    const token = PERSON_SINGLE_SIZE[sizeKey] || PERSON_SINGLE_SIZE.medium;
    fontSize = token.name_font_size;
    lineHeight = token.name_line_height;
    // 真机：showAvatar+showName 时 capsule 头像 = lineHeight - (large?8:4)；normal = lineHeight
    avatarPx = token.avatar_size;
    if (showAvatar && showName) {
      avatarPx = capsule ? lineHeight - (fontSize > 20 ? 8 : 4) : lineHeight;
    } else if (showAvatar && !capsule) {
      avatarPx = lineHeight;
    }
  }

  const largeType = fontSize > 20;
  const { name, src } = resolvePersonDisplay(userID, ctx);
  const contentChildren: Array<ReturnType<typeof h> | null> = [];

  if (showAvatar) {
    let margin: string | undefined;
    if (showName) {
      // 真机：capsule 或 followFontSize 时用紧凑左右 margin
      if (capsule || followMargins) margin = largeType ? '0 4px' : '0 4px 0 2px';
      else margin = largeType ? '4px' : '2px 4px 2px 2px';
    }
    contentChildren.push(
      h('div', {
        className: `${CLS}-person__avatar-wrapper`,
        style: margin ? { margin } : undefined,
      }, renderAvatarNode(`${CLS}-person__internal-avatar`, avatarPx, src, name))
    );
  }

  if (showName) {
    const nameStyle: Record<string, string> = {
      fontSize: fontSize + 'px',
      // markdown 内联跟父级行高，避免 22px 盒子在 1.6 行里把整段顶矮/顶歪
      lineHeight: follow ? 'inherit' : lineHeight + 'px',
    };
    if (capsule) {
      const pad = largeType ? 10 : 6;
      nameStyle.padding = nameOnly ? `0 ${pad}px` : `0 ${pad}px 0 0`;
    } else if (!nameOnly) {
      nameStyle.padding = '0 2px 0 0';
    }
    contentChildren.push(
      h('span', {
        className: `${CLS}-person__name${showAvatar ? ` ${CLS}-person__name--avatar` : ''}`,
        style: nameStyle,
      }, h('span', {
        className: `${CLS}-text ${CLS}-text--line ${CLS}-text--line-1`,
      }, name))
    );
  }

  const rootCls = [
    `${CLS}-person`,
    showAvatar ? `${CLS}-person--avatar` : '',
    showName ? `${CLS}-person--name` : '',
    capsule ? `${CLS}-person--capsule` : '',
  ].filter(Boolean).join(' ');
  const contentCls = [
    `${CLS}-person__content`,
    showAvatar ? `${CLS}-person__content--avatar` : '',
    showName ? `${CLS}-person__content--name` : '',
    capsule ? `${CLS}-person__content--capsule` : '',
  ].filter(Boolean).join(' ');

  return h('div', { className: rootCls, title: name },
    h('div', { className: contentCls }, contentChildren)
  );
}

/** person_list 条目上的圆角头像 */
function renderPersonListAvatar(
  userID: string | undefined,
  px: number,
  ctx: RenderContext,
) {
  const { name, src, unknown } = resolvePersonDisplay(userID, ctx);
  const cls = unknown
    ? `${CLS}-person-list__unknown-avatar`
    : `${CLS}-person-list__avatar`;
  return renderAvatarNode(cls, px, src, name);
}

/**
 * 葫芦串重叠挖月牙 mask（逆向 ud Avatar.Group hollow-out）。
 * size=头像边长，overlap=重叠像素（默认 size/4，对应 spacing=-size/4）。
 * 公式与网页版 `(e, n+2, n, |spacing|)` 一致。
 */
function personAvatarHollowMask(size: number, overlap: number): string {
  const e = size;
  const n = e / 2;
  const t = n + 2;
  const r = overlap;
  const o = (t * t - (3 * n - r) * (3 * n - r)) / (2 * (r - 2 * n));
  const a = n - Math.sqrt(n * n - (o - n) * (o - n));
  const i = 2 * n - a;
  const svg =
    `<svg width="${e}px" height="${e}px" viewBox="0 0 ${e} ${e}" version="1.1" xmlns="http://www.w3.org/2000/svg">` +
    `<path d="M ${o}, ${a} A ${n}, ${n}, 0, 1, 0, ${o}, ${i} M ${o}, ${a} A ${t}, ${t}, 0, 0, 0, ${o}, ${i}" ` +
    `fill="#000" stroke-width="0" fill-rule="evenodd"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 0 0 / 100% 100% no-repeat`;
}

/** 基础布局 <style> 的去重标记 id */
const BASE_STYLES_STYLE_ID = `${CLS}-base-styles`;

/** 图标字体 <style> 的去重标记 id */
const ICON_FONT_STYLE_ID = `${CLS}-icon-font`;

/** emoji 雪碧图 <style> 的去重标记 id */
const EMOJI_SPRITE_STYLE_ID = `${CLS}-emoji-sprite`;

/**
 * 浏览器端：把基础布局 CSS（.universal-card-* 布局/外观规则）注入一次 <style>（幂等）。
 * 每张卡片的地基样式，故在组根节点时调用一次，而非挂在某个叶子组件上。
 * Node/SSR 无 DOM——renderCardToString 不注入，使用方需引 dist/styles.css（或 all.css）。
 * 与 ensureIconFontInjected 同策略。
 */
export function ensureBaseStylesInjected(ctx: RenderContext): void {
  const doc = ctx.options.document || (typeof document !== 'undefined' ? document : null);
  if (!doc || typeof doc.getElementById !== 'function') return;
  if (doc.getElementById(BASE_STYLES_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = BASE_STYLES_STYLE_ID;
  style.textContent = BASE_STYLES_CSS;
  (doc.head || doc.documentElement).appendChild(style);
}

/**
 * 浏览器端：把图标字体 CSS（含内联 base64 woff2）注入一次 <style>（幂等）。
 * Node/SSR 无 DOM——renderCardToString 不注入，使用方需引 dist/icon-font.css。
 * 取 document：优先 ctx.options.document，回退全局 document；都没有则跳过。
 */
function ensureIconFontInjected(ctx: RenderContext): void {
  const doc = ctx.options.document || (typeof document !== 'undefined' ? document : null);
  if (!doc || typeof doc.getElementById !== 'function') return;
  if (doc.getElementById(ICON_FONT_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = ICON_FONT_STYLE_ID;
  style.textContent = ICON_FONT_CSS;
  (doc.head || doc.documentElement).appendChild(style);
}

/**
 * 浏览器端：把 emoji 雪碧图 CSS（含 CDN 背景图 + 每表情 background-position）注入一次
 * <style>（幂等）。Node/SSR 无 DOM——renderCardToString 不注入，使用方需引 dist/emoji.css。
 * 与 ensureIconFontInjected 同策略。
 */
function ensureEmojiSpriteInjected(ctx: RenderContext): void {
  const doc = ctx.options.document || (typeof document !== 'undefined' ? document : null);
  if (!doc || typeof doc.getElementById !== 'function') return;
  if (doc.getElementById(EMOJI_SPRITE_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = EMOJI_SPRITE_STYLE_ID;
  style.textContent = EMOJI_SPRITE_CSS;
  (doc.head || doc.documentElement).appendChild(style);
}

/**
 * 图表容器尺寸：对齐网页版飞书 chart 组件。
 * - height 为 `[1,999]px`（或 RAW heightValue.pixels）→ 固定高度，忽略宽高比；min 降为 1
 * - 否则走 aspect_ratio（缺省 16:9）；minWidth=200 / minHeight=150
 * - linearProgress 且未显式给尺寸时：按 bandWidth × 系列数给紧凑高度
 *   （真机进度条观感很矮；若仍走 16:9 会在细条上下留大片空白）
 */
function resolveChartBoxStyle(
  p: Record<string, unknown>,
  spec?: Record<string, unknown>,
): Record<string, string> {
  const heightValue = p.heightValue as { type?: string; value?: number | string } | undefined;
  let pixelH: number | undefined;
  if (heightValue && String(heightValue.type || '').toLowerCase() === 'pixels') {
    const n = Number(heightValue.value);
    if (Number.isFinite(n)) pixelH = n;
  }
  if (pixelH == null) {
    const raw = String(p.height ?? '').trim().toLowerCase();
    if (raw && raw !== 'auto') {
      const m = /^(\d+(?:\.\d+)?)\s*px$/.exec(raw);
      if (m) pixelH = Number(m[1]);
    }
  }
  if (pixelH != null) {
    const h = Math.min(999, Math.max(1, Math.round(pixelH)));
    return {
      height: h + 'px',
      minWidth: CHART_FIXED_MIN_SIZE + 'px',
      minHeight: CHART_FIXED_MIN_SIZE + 'px',
    };
  }

  const arRaw = String(p.aspect_ratio || p.aspectRatio || '').trim();
  if (!arRaw && spec && spec.type === 'linearProgress') {
    // 紧凑进度条：bandWidth（缺省 16）× 条目数 + 少量内边距，夹在 [32, 150]
    const band = Number(spec.bandWidth);
    const bw = Number.isFinite(band) && band > 0 ? band : 16;
    const data = spec.data as { values?: unknown[] } | unknown[] | undefined;
    const values = Array.isArray(data) ? data
      : (data && typeof data === 'object' && Array.isArray((data as { values?: unknown[] }).values)
        ? (data as { values: unknown[] }).values : []);
    const count = Math.max(1, values.length || 1);
    const h = Math.min(CHART_MIN_HEIGHT, Math.max(32, Math.round(bw * count + 16)));
    return {
      height: h + 'px',
      minWidth: CHART_FIXED_MIN_SIZE + 'px',
      minHeight: CHART_FIXED_MIN_SIZE + 'px',
    };
  }

  const ar = arRaw || CHART_DEFAULT_ASPECT_RATIO;
  const m = /^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/.exec(ar);
  const style: Record<string, string> = {
    minWidth: CHART_MIN_WIDTH + 'px',
    minHeight: CHART_MIN_HEIGHT + 'px',
  };
  if (m) style.aspectRatio = `${m[1]} / ${m[2]}`;
  else style.aspectRatio = '16 / 9';
  return style;
}

/**
 * header.title / header.subtitle：plain_text 用 content 字符串；
 * lark_md / markdown 走子元素树（真机 RAW 只有 elements，没有 content）。
 * 仅有 content 字符串时现场 parseMarkdown，避免 <at> 当字面量漏出。
 */
function renderHeaderTextLeaf(
  node: CardElement | undefined,
  ctx: RenderContext,
  className: string,
): VNode | null {
  if (!node) return null;
  const tag = node.tag;
  const p = node.property || {};
  const isMd = tag === 'markdown' || tag === 'lark_md';
  if (isMd) {
    let elements = Array.isArray(p.elements) ? p.elements : [];
    if (elements.length === 0 && typeof p.content === 'string' && p.content) {
      elements = parseMarkdown(p.content);
    }
    if (elements.length === 0) return null;
    return h('div', { className }, renderElements(elements, ctx));
  }
  const content = typeof p.content === 'string' ? p.content : '';
  if (!content) return null;
  return h('div', { className }, content);
}

/** 注册全部内置组件（幂等）。index.ts 在加载时调用一次。 */
export function registerBuiltins(): void {
  if (registered) return;
  registered = true;

  // ---- 结构 ----

  // body：卡片正文容器。
  // RAW 有两种形态：子元素在 property.elements，或直接挂在 el.elements 上（无 property 包裹）。
  // padding / vertical_spacing 若 DSL 显式给出则如实透传（对齐飞书：默认 padding 12px、纵向间距 8px；
  // 但很多卡片用 20px / 12px），否则回退 CSS 里的默认值。
  registerComponent('body', (el, ctx) => {
    const p = el.property || {};
    const style: Record<string, string> = {};
    const pad = boxToStyle(p.padding);
    if (pad) style.padding = pad;
    // #18/D8：无显式 padding 时，按 header 模板收紧顶部 8px（其余三边走 CSS 12px）。
    if (!pad && ctx.bodyPaddingTop != null) style.paddingTop = ctx.bodyPaddingTop + 'px';
    const vGap = p.verticalSpacingValue?.value ?? p.vertical_spacing;
    if (vGap != null) style.rowGap = verticalSpacingToPx(vGap as number | string) + 'px';
    const props: Record<string, unknown> = { className: `${CLS}-body` };
    if (Object.keys(style).length) props.style = style;
    return h('div', props, renderElements(getChildElements(el), ctx));
  });

  // card_header：标题栏。结构对齐网页版：
  //   __bg → __content(row) → [__icon?] + __text(column: title-wrapper + subtitle)
  // text_tag_list（DSL snake_case，兼容 camelCase textTagList）：标题右侧彩色标签。
  // icon / udIcon：标题左侧图标；未指定 color 时继承 header 模板标题色。
  // title / subtitle 支持 plain_text 与 lark_md（真机 RAW 为 tag:markdown + originTag:lark_md）。
  registerComponent('card_header', (el, ctx) => {
  const p = el.property || {};
  const tplKey = (p.template || 'default') as keyof typeof HEADER_TEMPLATE;
  const tpl = HEADER_TEMPLATE[tplKey] || HEADER_TEMPLATE.default;
  // #19/D9：客户端 header textTagList.slice(0,3)，每项以 TextTag + parentFontSize 渲染。
  // 标题字号 16px（见 .universal-card-header__text-title），注入 textMetrics 供内联跟随字号的组件缩放。
  const tags = (p.text_tag_list || p.textTagList) as CardElement[] | undefined;
  const tagCtx: RenderContext = { ...ctx, textMetrics: { fontSize: 16, lineHeight: 24 } };
  const tagVNodes = Array.isArray(tags) && tags.length
    ? renderElements(tags.slice(0, 3), tagCtx)
    : [];

  // 左侧图标：udIcon 优先（颜色取模板 title_color），回退 icon，再回退 avatar(imageID)→Img Tiny（#20/D10）
  const iconRaw = (p.udIcon || p.icon) as CardElement | undefined;
  let iconVNode: VNode | null = null;
  if (iconRaw && iconRaw.tag) {
    // 未指定 color 时，把 header 标题色注入，使图标与标题同色
    const ip = (iconRaw.property || {}) as Record<string, unknown>;
    const hasColor = typeof ip.color === 'string' && ip.color
      || (ip.style && typeof ip.style === 'object' && typeof (ip.style as { color?: unknown }).color === 'string');
    const iconEl: CardElement = hasColor
      ? iconRaw
      : { ...iconRaw, property: { ...ip, color: tpl.text } as never };
    const inner = renderIcon(iconEl, ctx);
    if (inner) iconVNode = h('div', { className: `${CLS}-header__icon` }, inner);
  }
  // avatar(imageID) 回退：客户端 createElement(Img,{mode:Tiny})，16px 圆角小图
  if (!iconVNode) {
    const avatarEl = p.avatar as CardElement | undefined;
    const avatarSrc = avatarEl && avatarEl.property
      ? resolveImageSrc(avatarEl.property as never, ctx)
      : null;
    if (avatarSrc) {
      iconVNode = h('div', { className: `${CLS}-header__icon` },
        h('img', {
          src: avatarSrc,
          alt: '',
          style: { width: '16px', height: '16px', borderRadius: '4px', objectFit: 'cover' },
        }));
    }
  }

  const titleVNode = renderHeaderTextLeaf(p.title, ctx, `${CLS}-header__text-title`)
    ?? h('div', { className: `${CLS}-header__text-title` });
  const subtitleVNode = renderHeaderTextLeaf(p.subtitle, ctx, `${CLS}-header__text-subtitle`);

  const textChildren: Array<VNode | null> = [
    h('div', { className: `${CLS}-header__text-title-wrapper` },
      titleVNode,
      tagVNodes.length ? h('div', { className: `${CLS}-header__tags` }, tagVNodes) : null
    ),
    subtitleVNode,
  ];

  // 无模板（default/disabled）时客户端给 __bg 挂 --no-template：
  // 底部 padding 收成 0，header 与 body 之间的间距交给 body 的 paddingTop（客户端 #18/D8 收成 8px）。
  const tplKey2 = (p.template || 'default') as string;
  const noTemplate = !tplKey2 || tplKey2 === 'default' || tplKey2 === 'disabled';

  return h('div', {
    className: `${CLS}-header ${CLS}-header--${p.template || 'default'}`,
    style: { backgroundColor: tpl.bg, color: tpl.text },
  },
    h('div', {
      className: `${CLS}-header__bg${noTemplate ? ` ${CLS}-header__bg--no-template` : ''}`,
      // 内联 base64 高光纹理；图宽=header 宽使亮带居中；padding 透传 DSL（默认 12px）
      style: (() => {
        const s: Record<string, string> = { backgroundImage: `url(${HEADER_BG_LIGHT})` };
        const pad = boxToStyle(p.padding);
        if (pad) s.padding = pad;
        return s;
      })(),
    },
      h('div', { className: `${CLS}-header__content` },
        iconVNode,
        h('div', { className: `${CLS}-header__text` }, textChildren)
      )
    )
  );
});

// markdown：富文本段落，property.elements 是内联元素
// 字号来源：DSL text_size / 中间态 textSize / 真机 RAW textStyle.size|platformSize。
// small/notation=12px、normal=14px、heading=16px…；不给则回退正文默认 14px。
// 并把字号注入 childCtx.textMetrics，供内联 person_v1 跟随（飞书 avatarFollowFontSize）。
// 客户端把 Markdown 与 MarkdownV1(tag=markdown_v1) 注册为同一组件，此处做别名（#13/D3）。
function MarkdownComponent(el: CardElement, ctx: RenderContext) {
  const p = el.property || {};
  const style = { ...alignToStyle(p.textAlign), ...textStyleToStyle(p.textStyle) };
  applyOuterMargin(style, p.margin);
  const sizeKey = resolveTextSizeKey(p);
  // 有显式字号才写死字号/行高；缺省走 CSS（14px / line-height:1.6）
  // 行高走引擎表 lineHeightForFontSize + 消息卡片桌面端 +2：
  //   12→20+2=22 / 14→22+2=24 / 16→24+2=26
  // （此前用「字号 + 8」，12/14/16 恰好对上字号表，但漏了 +2，
  //   带 text_size 的段落行距比真机小 2px——列表逐行累积后很明显。）
  let fontSize = BASE_FONT_SIZE;
  let lineHeight = Math.round(BASE_FONT_SIZE * BASE_LINE_HEIGHT);
  if (sizeKey != null && TEXT_SIZE_MAP[String(sizeKey)] != null) {
    fontSize = TEXT_SIZE_MAP[String(sizeKey)];
    lineHeight = textLineHeight(fontSize);
    style.fontSize = fontSize + 'px';
    style.lineHeight = lineHeight + 'px';
  }
  const childCtx: RenderContext = { ...ctx, textMetrics: { fontSize, lineHeight } };
  // #22/D12：客户端 plain_text/markdown 支持 property.lines（textLines），超出省略。
  // 用 -webkit-line-clamp 纯 CSS 截断。
  const linesStyle = lineClampStyle(p.lines ?? p.textLines);
  // 前缀图标：官方 markdown.icon 支持 standard_icon（token）与 custom_icon（img_key）。
  // 此前只渲染 property.elements，icon 被整块丢弃，带图标的分区标题会缺图标。
  const iconVNode = renderPrefixIcon(p.icon, ctx, fontSize);
  return h('div', { className: `${CLS}-markdown`, style },
    iconVNode,
    h('div', {
      className: `${CLS}-markdown__children`,
      style: Object.keys(linesStyle).length ? linesStyle : undefined,
    }, renderElements(p.elements, childCtx))
  );
}

/**
 * 文本前缀图标（markdown.icon / 同类字段）。
 * standard_icon 走图标字体；custom_icon 用 img_key 出 <img>。
 * 尺寸跟随文本字号：未显式给 size 时用 1em，与真机「图标随文字大小」一致。
 */
function renderPrefixIcon(
  raw: unknown,
  ctx: RenderContext,
  fontSize: number,
): VNode | null {
  if (!isRecord(raw)) return null;
  // 两种形态都要认：
  //   DSL 扁平形态   { tag:'standard_icon', token, color }
  //   RAW 嵌套形态   { tag:'standard_icon', property:{ token, color } }（dslToRaw 输出）
  const inner = isRecord(raw.property) ? raw.property : raw;
  const tag = typeof raw.tag === 'string' ? raw.tag : 'standard_icon';
  const sizeProp = typeof inner.size === 'string'
    ? inner.size
    : (typeof raw.size === 'string' ? raw.size : undefined);
  if (tag === 'custom_icon') {
    const imgKey = typeof inner.img_key === 'string'
      ? inner.img_key
      : (typeof raw.img_key === 'string' ? raw.img_key : undefined);
    if (!imgKey) return null;
    // img_key 走与 img 组件相同的解析（宿主可注入 resolveImage 换成本地资源）
    const src = resolveImageSrc({ img_key: imgKey } as never, ctx) ?? imgKey;
    const sizePx = sizeProp && /^\d/.test(sizeProp)
      ? Number(/^(\d+(?:\.\d+)?)/.exec(sizeProp)![1])
      : fontSize;
    return h('span', { className: `${CLS}-markdown__icon` },
      h('img', {
        src,
        alt: '',
        style: { width: sizePx + 'px', height: sizePx + 'px', objectFit: 'contain' },
      }));
  }
  const token = typeof inner.token === 'string' ? inner.token : '';
  if (!token) return null;
  const iconNode = renderIcon({
    tag: 'standard_icon',
    property: {
      token,
      color: typeof inner.color === 'string' ? inner.color : undefined,
      // 未显式给 size 时跟随文本字号，避免回落到固定 16px 与文字不搭
      size: sizeProp ?? fontSize + 'px',
    },
  } as CardElement, ctx);
  if (!iconNode) return null;
  return h('span', { className: `${CLS}-markdown__icon` }, iconNode);
}
registerComponent('markdown', MarkdownComponent);
registerComponent('markdown_v1', MarkdownComponent);

// #22/D12：lines → -webkit-line-clamp 截断样式（无效/非正数返回空）
function lineClampStyle(lines: unknown): Record<string, string> {
  const n = Number(lines);
  if (!Number.isFinite(n) || n <= 0) return {};
  return {
    display: '-webkit-box',
    WebkitLineClamp: String(Math.floor(n)),
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  };
}

// plain_text：纯文本。类名对齐真机 .universal-card-text（break-spaces 保留连续空格）。
// 颜色/加粗走修饰类 + color:var(--TOKEN)（引擎 he()），例如：
//   .universal-card-text--orange.universal-card-text--bold { color: var(--O400) }
registerComponent('plain_text', (el) => {
  const p = el.property || {};
  const mods = textStyleToModifiers(p.textStyle);
  const className = [`${CLS}-text`, ...mods.map((m) => `${CLS}-text--${m}`)].join(' ');
  const style = textStyleToStyle(p.textStyle);
  // 属性已落到 --bold/--italic/--through，不再内联 fontWeight 等（对齐真机 DOM）
  delete style.fontWeight;
  delete style.fontStyle;
  delete style.textDecoration;
  // #22/D12：property.lines 最大行数截断
  Object.assign(style, lineClampStyle(p.lines));
  return h('span', { className, style }, p.content != null ? String(p.content) : '');
});

// br：换行
registerComponent('br', () => h('br', {}));

// hr：分割线
registerComponent('hr', () => h('div', { className: `${CLS}-hr` }));

// div：通用容器。
// RAW 的 div 常把单个内容元素挂在 property.text（如一段 markdown），
// 也可能用 property.elements 列一组子元素——两者都要支持。
// 另：div 可带「前置图标」——property.udIcon / property.icon（同一图标的两种形态，
// 引擎取 udIcon || icon，只渲染其一），与文本排成一行（icon 在左、文本在右）。
registerComponent('div', (el, ctx) => {
  const p = el.property || {};
  const content = Array.isArray(p.elements) && p.elements.length
    ? renderElements(p.elements, ctx)
    : (p.text ? renderElements([p.text as CardElement], ctx) : []);
  // 前置图标：udIcon 优先（含 style.color），回退 icon
  const iconEl = (p.udIcon || p.icon) as CardElement | undefined;
  if (iconEl && iconEl.tag) {
    const iconVNode = ctx.kernel.renderElement(iconEl, ctx);
    if (iconVNode) {
      return h('div', { className: `${CLS}-div ${CLS}-div--with-icon` },
        h('div', { className: `${CLS}-div__icon_wrapper` }, iconVNode),
        h('div', { className: `${CLS}-div__content` }, content)
      );
    }
  }
  return h('div', { className: `${CLS}-div` }, content);
});

// ---- 布局 ----

/** 对齐枚举 → flex 值。真机 qr() 里的 Wr / Hr 两张表，column / column_set /
 *  interactive_container 共用。 */
const H_ALIGN_MAP: Record<string, string> = { left: 'flex-start', center: 'center', right: 'flex-end' };
const V_ALIGN_MAP: Record<string, string> = { top: 'flex-start', center: 'center', bottom: 'flex-end' };

// column_set：横向分栏容器
registerComponent('column_set', (el, ctx) => {
  const p = el.property || {};
  // RAW 用 camelCase（horizontalSpacingValue.value / flexMode / horizontalAlign），DSL 用 snake_case
  const gapRaw = p.horizontalSpacingValue?.value ?? p.horizontal_spacing;
  // #30（纠正 #15）：公开 DSL 不写 horizontal_spacing 时等价于 "default" → 8px。
  // 客户端配置表 horizontal_spacing.default.margin=8，渲染前 fallback（horizontalSpacingFallback）
  // 会把缺省补成 default；adapter TAG_DEFAULT_DROPS 也确认 RAW 常态值即 "default"，仅在
  // RAW→DSL 时删除。#15 误把"样式解析后 columnGap ?? 0"这层兜底当成了 DSL 缺省语义，
  // 导致未指定间距的列在网页预览里贴死，与真机（省略=8px）分叉。
  const gap = gapRaw != null ? horizontalSpacingToPx(gapRaw as number | string) : horizontalSpacingToPx('default');
  const flexMode = p.flexMode || p.flex_mode;
  const hAlign = p.horizontalAlign || p.horizontal_align;
  // 注意：column_set 只吃 horizontal_align，vertical_align 真机根本没有实现——
  // 飞书网页版引擎里 column_set 走 qr(element, { disableVerticalConfig: true })，
  // 垂直对齐配置整段被跳过（列本身又被 stretch 成整行高，也没有可对齐的余量）。
  // 官方《分栏》文档的 column_set 字段表同样没有 vertical_align。别再"补"上它。
  const style: Record<string, string> = {
    display: 'flex',
    rowGap: '8px',
    alignItems: 'stretch',
    columnGap: gap + 'px',
    // 供 styles.css 的窄屏 calc() 用（bisect / trisect 要减掉列间距）。
    '--universal-card-column-gap': gap + 'px',
  };
  // flex_mode 只挂类名（真机同款 ai({[flexMode]: true})）：宽度覆盖、换行都在
  // styles.css 的 @container (max-width:320px) 里，对应客户端 isWide 时才置 none。
  const fm = typeof flexMode === 'string' ? flexMode.toLowerCase() : '';
  const modeClass =
    fm === 'flow' || fm === 'wrap' || fm === 'stretch' || fm === 'bisect' || fm === 'trisect'
      ? ` ${CLS}-column-set--${fm === 'wrap' ? 'flow' : fm}`
      : '';
  if (hAlign) {
    style.justifyContent = H_ALIGN_MAP[hAlign] || 'flex-start';
  }
  // margin：分栏容器自身的外边距（可为负，如 -8px 上移，紧贴上一块）；
  // 有水平外边距时用 calc 抵消 body 子项 width:100%，避免两侧被裁切。
  applyOuterMargin(style, p.margin);
  // 背景：DSL background_style / RAW backgroundStyle。grey → var(--bg-float-overlay)。
  // 有底色挂 --bg：真机 CSS 给 padding:4px + border-radius:6px。DSL padding 仍可覆盖。
  const bg = propertyBackgroundColor(p);
  if (bg) style.background = bg;
  const pad = boxToStyle(p.padding);
  if (pad) style.padding = pad;
  const cls = `${CLS}-column-set` + (bg ? ` ${CLS}-column-set--bg` : '') + modeClass;
  if (isStateHost(el)) {
    style.position = 'absolute';
    style.width = '0';
    style.height = '0';
    style.overflow = 'hidden';
    style.margin = '0';
    style.padding = '0';
  }
  // #17/D7：把 flexMode + 实际 columnGap 下发给子 column（公开 RenderContext 的一部分，
  // 自定义组件可用）。内置 column 的宽度覆盖已改由 CSS 类 + 容器查询完成，见上。
  const childCtx: RenderContext = { ...ctx, columnSet: { flexMode, gap } };
  return h('div', { className: cls, style }, renderElements(p.columns, childCtx));
});

function isStateHost(el: CardElement): boolean {
  if (el.id === 'card_state') return true;
  const actions = el.property?.actions as unknown;
  if (!Array.isArray(actions)) return false;
  return actions.some((item) => {
    if (!item || typeof item !== 'object') return false;
    const action = (item as { action?: { url?: unknown } }).action;
    return typeof action?.url === 'string' && action.url.includes('msgcard/unsupported_action#s1.');
  });
}

// column：单栏
registerComponent('column', (el, ctx) => {
  const p = el.property || {};
  const style: Record<string, string | number> = {
    flexShrink: 1, overflow: 'hidden', display: 'flex',
    // 缺省纵向排列；direction=horizontal 时改行，两个 align 落到哪个 flex 属性也随之交换
    flexDirection: 'column',
  };
  // 宽度：与真机 Kn() 完全同构。RAW 有四种子形态，DSL 用 width 字符串。
  //   widthValue.pixels                 → width:Npx（只认 [16,600]，越界客户端按 auto）
  //   widthValue.column_width_weighted  → flexBasis:0 + flexGrow:N
  //   width / widthValue = auto         → width:auto（贴内容宽）
  //   width = weighted                  → flexBasis:0 + flexGrow:weight
  // 宽度完全缺失时什么都不写：真机 Kn() 在 width 缺省时返回 {}，即 CSS 默认
  // flex-grow:0 + width:auto（官方文档 column.width 默认 auto）。
  // 之前把缺失当成 weighted（等分撑满），忘了写 width 的卡片预览里会被拉成等宽列。
  const wv = p.widthValue;
  const w = p.width;
  const weighted = wv && wv.type === 'column_width_weighted' && typeof wv.value === 'number';
  if (wv && wv.type === 'pixels' && typeof wv.value === 'number') {
    // 真机（V7.4+）只认 [16,600] 的 px：10px / 800px 既不报错也不夹取，
    // 直接按 auto（内容宽）渲染。预览照抄，避免「预览定宽、真机变 auto」。
    // 注意不要写 flexShrink:0：真机整行超宽时会把各列按 px 比例压缩
    // （600px 行放进 576px 内容区 → 等比缩到 576），定死不缩会溢出卡片。
    if (wv.value >= 16 && wv.value <= 600) style.width = wv.value + 'px';
    else style.width = 'auto';
  } else if (weighted) {
    style.flexBasis = 0;
    style.flexGrow = String(wv!.value);
  } else if (w === 'auto' || wv?.value === 'auto') {
    style.width = 'auto';
  } else if (w === 'weighted' || wv?.value === 'weighted') {
    style.flexBasis = 0;
    style.flexGrow = String(p.weight || 1);
  } else if (typeof w === 'number') {
    style.width = w + 'px';
  } else if (typeof w === 'string' && w) {
    // 认不出的写法（"80%"、历史脏值）：按权重兜底，别让列塔成 0
    style.flexGrow = String(p.weight || 1);
  }
  // flex_mode 的窄屏覆盖不在内联样式里做：真机 isWide（卡片容器 > 320px）时
  // 客户端直接把 flexMode 当 none（ni() 里 `isWide && (flexMode = None)`），只有
  // 窄屏才按 ei() 改写列宽。SSR 端不知道容器宽度，所以改由 column_set 的模式类名
  // + styles.css 里的 @container（max-width: 320px）规则覆盖，见
  // `.universal-card-column-set--stretch / --bisect / --trisect / --flow`。
  // 这样宽卡预览里 width 照常生效，窄卡片里才变成堆叠/等分/内容宽。
  // 对齐：与真机 qr() 同一套映射。
  //   direction=vertical（缺省）→ 主轴纵向：vertical_align→justify-content，horizontal_align→align-items
  //   direction=horizontal      → 主轴横向：horizontal_align→justify-content，vertical_align→align-items
  // 此前只读了 vertical_align 且写死给 justify-content，horizontal_align / direction 被整个忽略，
  // 于是「列内水平对齐」在预览里怎么点都不动。未写这两个字段时不输出对应样式，沿用 CSS 默认。
  const horizontalDir = p.direction === 'horizontal';
  if (horizontalDir) style.flexDirection = 'row';
  const hAlign = p.horizontal_align ?? p.horizontalAlign;
  const vAlign = p.vertical_align ?? p.verticalAlign;
  const justify = horizontalDir ? H_ALIGN_MAP[hAlign as string] : V_ALIGN_MAP[vAlign as string];
  const align = horizontalDir ? V_ALIGN_MAP[vAlign as string] : H_ALIGN_MAP[hAlign as string];
  if (justify) style.justifyContent = justify;
  if (align) style.alignItems = align;
  // 横向间距：只在显式给值时输出（真机没有 column 级默认 column-gap）。
  const hGap = p.horizontalSpacingValue?.value ?? p.horizontal_spacing ?? p.horizontalSpacing;
  if (hGap != null) style.columnGap = horizontalSpacingToPx(hGap as number | string) + 'px';
  // 纵向间距：列内元素唯一的间隔来源（flex row-gap）。缺省 8px（对齐飞书默认）。
  // 注意不要再叠加 CSS 的相邻兄弟 margin，否则间距翻倍——故 styles.css 里不给 column 子元素设 margin。
  const vGap = p.verticalSpacingValue?.value ?? p.vertical_spacing;
  style.rowGap = (vGap != null ? verticalSpacingToPx(vGap as number | string) : 8) + 'px';
  // 背景：有底色挂 --bg（CSS 给 6px 圆角；默认 padding 仍是 0，内边距须 DSL 显式写）。
  const bg = propertyBackgroundColor(p);
  if (bg) style.background = bg;
  const pad = boxToStyle(p.padding);
  if (pad) style.padding = pad;
  const mg = boxToStyle(p.margin);
  if (mg) style.margin = mg;
  const cls = `${CLS}-column` + (bg ? ` ${CLS}-column--bg` : '');
  return h('div', { className: cls, style }, renderElements(p.elements, ctx));
});

// ---- 内容 / 交互 ----

/**
 * img 标题（property.title）：真机把它当文本组件渲染在图片上方，
 * 外层 .universal-card-image__title 负责 8px 间距（见 styles.css）。
 * 官方 schema 的 BaseText 允许 plain_text 与 lark_md：
 *  - RAW：{tag, property:{content | elements, textStyle, lines}}
 *  - DSL：文本叶子 {tag, content, text_size, text_color, lines} 与裸字符串
 * 对齐只对 markdown 生效（真机 plain_text 组件不消费 textAlign）。
 */
function renderImageTitle(raw: unknown, ctx: RenderContext): VNode | null {
  if (typeof raw === 'string') {
    return raw ? h('span', { className: `${CLS}-text` }, raw) : null;
  }
  if (!isRecord(raw) || typeof raw.tag !== 'string') return null;
  const property: Record<string, unknown> = isRecord(raw.property)
    ? { ...raw.property }
    : { content: typeof raw.content === 'string' ? raw.content : '' };

  // DSL 扁平文本叶子字段（text_size / text_color）→ 真机 RAW 的 textStyle；
  // 服务端会把 DSL 扁平字段归一进 textStyle，这里做同样的折叠。
  // 两种载体都认：DSL 原样（字段在叶子上）与转成 RAW 后（字段在 property 里）。
  const flat = (key: string): unknown => raw[key] ?? property[key];
  const flatSize = flat('text_size') ?? flat('textSize');
  const flatColor = flat('text_color') ?? flat('textColor');
  if (typeof flatSize === 'string' || typeof flatColor === 'string') {
    const ts = isRecord(property.textStyle) ? property.textStyle : {};
    property.textStyle = {
      ...ts,
      ...(typeof flatSize === 'string' && ts.size == null ? { size: flatSize } : {}),
      ...(typeof flatColor === 'string' && ts.color == null ? { color: flatColor } : {}),
    };
  }
  // 两边 schema 都有 lines / text_lines（最大行数截断）
  const lines = flat('lines') ?? flat('text_lines') ?? flat('textLines');
  if (property.lines == null && typeof lines === 'number') property.lines = lines;

  // DSL 可能直接给 {tag:'lark_md', content}：按 markdown 子树渲染（含对齐/字号）。
  const tag = raw.tag === 'lark_md' ? 'markdown' : raw.tag;
  if (tag === 'markdown' && !Array.isArray(property.elements)) {
    const content = typeof property.content === 'string' ? property.content : '';
    if (!content) return null;
    property.elements = parseMarkdown(content);
  }

  const node = { tag, property } as unknown as CardElement;
  // 空标题不占位（否则多出 8px 空白）
  if (tag === 'plain_text' && !extractText(node)) return null;
  return renderElement(node, ctx);
}

// img：图片
registerComponent('img', (el, ctx) => {
  const p = el.property || {};
  const src = resolveImageSrc(p, ctx);
  const altText = extractText(p.alt as never);
  // 缩放模式：RAW 用 scaleType（camelCase），DSL 用 scale_type/mode
  const scale = p.scaleType || p.scale_type || p.mode;
  const wrapStyle: Record<string, string> = {};
  const imgStyle: Record<string, string> = {};
  if (p.corner_radius != null) imgStyle.borderRadius = sizeToPx(p.corner_radius);
  // size:"24px 24px" / sizeValue width_height_pixels：图标格等定宽高（缺省会按原图撑爆）
  const sized = resolveImageSize(p as Record<string, unknown>);
  if (sized.width && sized.height) {
    wrapStyle.width = sized.width;
    wrapStyle.height = sized.height;
    wrapStyle.flexShrink = '0';
    imgStyle.width = '100%';
    imgStyle.height = '100%';
    imgStyle.objectFit = scale === 'fit_horizontal' || scale === 'stretch' ? 'fill' : 'cover';
  } else if (sized.aspectRatio) {
    wrapStyle.width = '100%';
    imgStyle.width = '100%';
    imgStyle.aspectRatio = sized.aspectRatio;
    imgStyle.height = 'auto';
    imgStyle.objectFit = 'cover';
  } else if (scale === 'fit_horizontal' || scale === 'stretch') {
    // fit_horizontal / stretch：图片填满所在列宽（飞书网页版同样 width:100%）
    wrapStyle.width = '100%';
    imgStyle.width = '100%';
    imgStyle.height = 'auto';
  }
  // 外边距（如正文图 margin:8px 20px）挂在外壳上，让标题与图片作为一个整体参与布局；
  // 水平 margin 时 width 改为 calc 抵消 body>*{width:100%}
  const rootStyle: Record<string, string> = {};
  applyOuterMargin(rootStyle, p.margin);
  // 标题：真机在图片上方渲染 title 文本，外层 margin-bottom:8px
  const titleVNode = renderImageTitle(p.title, ctx);
  const imageVNode = h('div', { className: `${CLS}-image__wrapper`, style: wrapStyle },
    src
      ? h('img', { className: `${CLS}-image__host`, src, alt: altText, style: imgStyle })
      : h('div', { className: `${CLS}-image__placeholder`, style: imgStyle }, altText || '[图片]')
  );
  return h('div', { className: `${CLS}-image`, style: rootStyle },
    titleVNode ? h('div', { className: `${CLS}-image__title` }, titleVNode) : null,
    imageVNode,
  );
});

// img_combination：多图混排。
// 结构与比例逆向自网页版 .universal-card-img-combination：
//   double  左窄(32.4%, 24:33) + 右宽(67.6%, 49.33:33)
//   triple  左大(66.5%, 1:1) + 右侧两小(33%, 1:1)
//   bisect / trisect  等宽方格换行（50% / 33.33%，1:1）
// RAW：combinationMode / imgList[{ imageID, transparent }] / cornerRadiusValue；
// DSL：combination_mode / img_list[{ img_key }] / corner_radius。
const IMG_COMBINATION_LIMIT: Record<string, number | undefined> = {
  double: 2,
  triple: 3,
};

/** 混排中的单张图：填满所在格，按容器 corner_radius 裁圆角。 */
function renderCombinationImage(
  item: Record<string, unknown>,
  cornerRadius: string | undefined,
  ctx: RenderContext,
) {
  const src = resolveImageSrc(item as ElementProperty, ctx);
  const style: Record<string, string> = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  };
  if (cornerRadius) style.borderRadius = cornerRadius;
  return src
    ? h('img', { className: `${CLS}-image__host`, src, alt: '', style })
    : h('div', { className: `${CLS}-image__placeholder`, style }, '[图片]');
}

registerComponent('img_combination', (el, ctx) => {
  const p = el.property || {};
  const rawList = Array.isArray(p.imgList)
    ? p.imgList
    : Array.isArray(p.img_list)
      ? p.img_list
      : [];
  if (rawList.length === 0) return null;

  const mode = String(p.combinationMode ?? p.combination_mode ?? 'double');
  const limit = IMG_COMBINATION_LIMIT[mode];
  const list = (limit ? rawList.slice(0, limit) : rawList)
    .map((item) => (typeof item === 'string' ? { img_key: item } : item))
    .filter(isRecord);
  if (list.length === 0) return null;

  const cornerRadius = resolveCornerRadius(p as Record<string, unknown>);
  const containerStyle: Record<string, string> = {};
  applyOuterMargin(containerStyle, p.margin);
  const cls = `${CLS}-img-combination ${CLS}-img-combination--${mode}`;
  const itemNode = (item: Record<string, unknown>) =>
    h(
      'div',
      { className: `${CLS}-img-combination__item` },
      renderCombinationImage(item, cornerRadius, ctx),
    );

  // triple：第一张占左侧大图，其余进右列。
  if (mode === 'triple') {
    const [first, ...rest] = list;
    return h(
      'div',
      { className: cls, style: containerStyle },
      h(
        'div',
        { className: `${CLS}-img-combination__item ${CLS}-img-combination__left` },
        renderCombinationImage(first, cornerRadius, ctx),
      ),
      h('div', { className: `${CLS}-img-combination__right` }, rest.map(itemNode)),
    );
  }

  return h('div', { className: cls, style: containerStyle }, list.map(itemNode));
});

// select_img：多图选择。静态预览对齐网页版：
// - 网格布局（stretch 单列 / bisect 两列 / trisect 三列），每格按 aspect_ratio 裁切；
// - 选中项 2px 主题色描边；禁用项半透明白遮罩；
// - 表单内左上角显示 checkbox（多选）或 radio（单选）——真机仅 in-form 渲染。
// RAW：options[{ imageID, value, disabled, disabledTips }] / multiSelect / selectedValues；
// DSL：options[{ img_key, value }] / multi_select / selected_values。
function readSelectImgValues(p: Record<string, unknown>): string[] {
  const raw = p.selectedValues ?? p.selected_values ?? p.value;
  let value: unknown = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return typeof value === 'string' && value ? [value] : [];
    }
  }
  if (isRecord(value) && Array.isArray(value.value)) value = value.value;
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function renderSelectImgCheckbox(checked: boolean, disabled: boolean, multiple: boolean) {
  const boxClass = `${CLS}-select-img__checkbox-box`
    + (multiple ? ` ${CLS}-select-img__checkbox-box--square` : '')
    + (checked ? ` ${CLS}-select-img__checkbox-box--checked` : '');
  return h(
    'div',
    {
      className: `${CLS}-select-img__checkbox`
        + (disabled ? ` ${CLS}-select-img__checkbox--disabled` : ''),
    },
    h('span', { className: boxClass }),
  );
}

registerComponent('select_img', (el, ctx) => {
  const p = el.property || {};
  const options = Array.isArray(p.options) ? p.options : [];
  if (options.length === 0) return null;

  const layout = String(p.layout ?? 'bisect');
  const aspectRatio = String(p.aspectRatio ?? p.aspect_ratio ?? '16:9').replace(':', '/');
  const multiple = p.multiSelect === true || p.multi_select === true;
  const disabledAll = p.disabled === true;
  const selected = readSelectImgValues(p);
  const containerStyle: Record<string, string> = {};
  applyOuterMargin(containerStyle, p.margin);

  const items = options.map((rawOption) => {
    const option: Record<string, unknown> = isRecord(rawOption)
      ? rawOption
      : { img_key: rawOption };
    const value = typeof option.value === 'string' ? option.value : undefined;
    const isSelected = value !== undefined && selected.includes(value);
    const disabled = disabledAll || option.disabled === true;
    const tip = resolveHoverTips(option, disabled);
    const src = resolveImageSrc(option as ElementProperty, ctx);
    const wrapperClass = `${CLS}-select-img__item-wrapper`
      + (isSelected ? ` ${CLS}-select-img__item-wrapper--selected` : '')
      + (disabled ? ` ${CLS}-select-img__item-wrapper--disabled` : '');
    const itemClass = `${CLS}-select-img__item`
      + (disabled ? ` ${CLS}-select-img__item--disabled` : '');
    return h(
      'div',
      { className: wrapperClass },
      h(
        'div',
        { className: itemClass, style: { aspectRatio }, title: tip || undefined },
        ctx.inForm ? renderSelectImgCheckbox(isSelected, disabled, multiple) : null,
        src
          ? h('img', {
              className: `${CLS}-image__host`,
              src,
              alt: '',
              style: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
            })
          : h(
              'div',
              { className: `${CLS}-image__placeholder`, style: { width: '100%', height: '100%' } },
              '[图片]',
            ),
      ),
    );
  });

  return h(
    'div',
    { className: `${CLS}-select-img ${CLS}-select-img--${layout}`, style: containerStyle },
    items,
  );
});

// video：视频。真机网页版有 src 时直接 <video controls>；无 src 时出封面 + 播放钮。
// RAW：fileID / coverImageID / showTime / enableDownload；DSL：file_key / image_key / show_time。
registerComponent('video', (el, ctx) => {
  const p = el.property || {};
  const src = resolveMediaSrc(p, 'video', ctx);
  const cover = resolveVideoCoverSrc(p, ctx);
  const showTime = p.showTime !== false && p.show_time !== false;
  const enableDownload = p.enableDownload === true || p.enable_download === true;
  // 外边距（如 margin:8px 20px）；水平 margin 时 width 改为 calc 抵消 body>*{width:100%}
  const style: Record<string, string> = {};
  if (p.margin) {
    style.width = '100%';
    applyOuterMargin(style, p.margin);
  }
  const styleProp = Object.keys(style).length ? { style } : {};
  // 有可播放地址：对齐真机 <video class="universal-card-video" controls preload="metadata">
  if (src) {
    const props: Record<string, unknown> = {
      className: `${CLS}-video`,
      src,
      controls: true,
      preload: 'metadata',
      ...styleProp,
    };
    // 禁止下载时收紧 controlslist（浏览器支持度不一，尽力对齐）
    if (!enableDownload) props.controlslist = 'nodownload';
    if (cover) props.poster = cover;
    return h('video', props);
  }
  // 无 src：封面态（播放钮 + 可选时长角标）。时长真机运行期从媒体元数据取，离线未知 → 不写假数字。
  return h('div', { className: `${CLS}-video`, ...styleProp },
    h('div', { className: `${CLS}-video__cover` },
      cover
        ? h('img', { className: `${CLS}-video__host-image`, src: cover, alt: '' })
        : h('div', { className: `${CLS}-video__default-cover` })
    ),
    h('div', {
      className: `${CLS}-video__play-btn`,
      dangerouslySetInnerHTML: { __html: VIDEO_PLAY_ICON_SVG },
    }),
    showTime ? h('div', { className: `${CLS}-video__duration` }, '--:--') : null,
  );
});

// audio：音频播放器壳（播放钮 + 进度条 + 时长）。真机是自定义 UI，非原生 <audio controls>。
// 有 resolveMedia 时内嵌隐藏 <audio>，外壳负责观感；完整交互需宿主页自行绑事件（或后续 hydrate）。
//
// markdown_audio：与顶层 audio 共用渲染函数，但 markdown 分发时按 inline 处理 →
// 胶囊样式（--inline）、扁平图标、随父字号缩放；进度条仅显式 showProgressBar 时才画。
//
// 属性对齐飞书网页版 audio 组件（见 feishu-web-dump 的 vn/xn）：
// style=normal|flat|speak 控制图标（圆底/扁平/声波）；time_display=default|both +
// time_position=end|start|both_sides 控制时间槽；border{color,corner_radius}、
// margin/padding/background_style/fill_color/width、disabled/disabled_tips、fallback。
function renderAudio(el: CardElement, ctx: RenderContext) {
  const p = el.property || {};
  const isInline = el.tag === 'markdown_audio';
  const src = resolveMediaSrc(p, 'audio', ctx);
  const disabled = p.disabled === true;
  // 真机：showProgressBar 按真值渲染。顶层 DSL 常显式 true；markdown_audio 样本常省略 → 无进度条。
  // 顶层仍对「未声明」默认画出（兼容既有卡片）；inline 严格按真值，避免胶囊里塞满进度条。
  const showProgress = isInline
    ? (p.showProgressBar === true || p.show_progress_bar === true)
    : (p.showProgressBar !== false && p.show_progress_bar !== false);
  const showTime = p.showTime !== false && p.show_time !== false;

  // 无媒体且显式声明了 fallback：drop 丢弃，fallback_text 出兜底文案。
  const fallback = p.fallback as unknown;
  if (!src && fallback != null) {
    if (fallback === 'drop') return null;
    if (isRecord(fallback) && fallback.tag === 'fallback_text') {
      const textNode = fallback.text as unknown;
      // 公开 DSL 的 text 是扁平 {tag, content}；RAW 可能是 {tag, property:{content}}。
      const content = typeof textNode === 'string' ? textNode
        : isRecord(textNode) && typeof textNode.content === 'string' ? textNode.content
        : extractPlainText(textNode);
      return content ? h('div', { className: `${CLS}-fallback-text` }, content) : null;
    }
  }

  const wv = p.widthValue as { type?: string; value?: string | number } | undefined;
  const widthTok = (p.width ?? wv?.value) as string | number | undefined;
  const widthIsFill = widthTok === 'fill' || wv?.value === 'fill';

  const wrapCls = `${CLS}-audio__wrapper`
    + (isInline ? ` ${CLS}-audio__wrapper--inline` : '')
    + (showTime ? ` ${CLS}-audio__wrapper--show-time` : '')
    + (disabled ? ` ${CLS}-audio__wrapper--disabled` : '');
  const style: Record<string, string> = {};

  // 宽度：fill→100%；像素→Npx；default/auto→auto（进度条+时长时 minWidth 164px）。
  const applyWidth = (): void => {
    if (isInline) {
      style.width = 'auto';
    } else if (widthIsFill) {
      style.width = '100%';
    } else if (typeof widthTok === 'number') {
      style.width = widthTok + 'px';
    } else if (typeof widthTok === 'string' && /^\d+(\.\d+)?px$/.test(widthTok)) {
      style.width = widthTok;
    } else {
      // 真机 Default：width:auto；进度条+时长时 minWidth:164px
      style.width = 'auto';
      if (showProgress && showTime) style.minWidth = '164px';
    }
  };
  applyWidth();

  if (isInline) {
    // 真机 inline：尺寸跟父 markdown 字号（ctx.textMetrics）
    const parentFs = ctx.textMetrics?.fontSize ?? BASE_FONT_SIZE;
    const { iconSize, fontSize, top } = audioInlineMetrics(parentFs);
    style['--universal-card-audio-icon-size'] = iconSize + 'px';
    style['--universal-card-audio-time-font-size'] = fontSize + 'px';
    style.verticalAlign = 'top';
    if (top) style.top = top + 'px';
  }

  // padding：RAW 四向对象 / DSL CSS 简写字符串都支持。
  const paddingRaw = p.padding as unknown;
  const pad = typeof paddingRaw === 'string' ? paddingRaw.trim() : boxToStyle(paddingRaw as never);
  if (pad) style.padding = pad;

  // margin：顶层 audio 外边距（真机 applyOuterMargin 等价物）。
  if (p.margin != null) {
    if (!style.width) style.width = '100%';
    applyOuterMargin(style, p.margin);
  }

  // 边框：border{color|borderColor, corner_radius|cornerRadius} 或 RAW hasBorder/borderColor。
  const borderObj = isRecord(p.border) ? p.border : undefined;
  const hasBorder = p.hasBorder === true || p.has_border === true || !!borderObj;
  if (hasBorder) {
    const borderColor = readThemeColorLight(borderObj?.customBorderColor ?? borderObj?.custom_border_color)
      ?? resolveCustomBorderLight(p)
      ?? resolveBorderColor(borderObj?.color ?? borderObj?.borderColor ?? p.borderColor);
    if (borderColor) style.border = `1px solid ${borderColor}`;
  }
  // mask 按 border-width 向外扩；真机 wrapper 恒定 1px 描边。
  style['--universal-card-audio-border-width'] = '1px';
  // corner_radius：DSL 字符串 / RAW {type:'pixels',value} / 裸数字都支持。
  const radiusRaw = borderObj?.corner_radius ?? borderObj?.cornerRadius
    ?? p.corner_radius ?? p.cornerRadius;
  const radiusVal = isRecord(radiusRaw) ? radiusRaw.value : radiusRaw;
  if (radiusVal != null && radiusVal !== '') {
    style.borderRadius = typeof radiusVal === 'number' ? radiusVal + 'px' : String(radiusVal);
  }

  // 背景：customBackgroundStyle（主题自定义色）优先，其次 background_style / backgroundColor。
  const bg = resolveCustomBackgroundLight(p)
    ?? bgStyleToColor(p.backgroundColor ?? p.background_color ?? p.background_style ?? p.backgroundStyle);
  if (bg) style['--universal-card-audio-bg'] = bg;

  // 填充色（图标/进度/时间）：customFillColor 优先，其次 fill_color / fillColor。
  const fillRaw = readThemeColorLight(p.customFillColor ?? p.custom_fill_color)
    ?? p.fill_color ?? p.fillColor;
  if (typeof fillRaw === 'string') {
    const fill = resolveColor(fillRaw);
    if (fill) style['--universal-card-audio-fill-color'] = fill;
  }

  // ---- 时间槽（time_display × time_position，对齐真机 xn/V）----
  const timeDisplay = (p.timeDisplay ?? p.time_display) === 'both' ? 'both' : 'default';
  const posRaw = p.timePosition ?? p.time_position;
  const timePosition = posRaw === 'start' || posRaw === 'both_sides' ? posRaw : 'end';
  const timeCls = `${CLS}-audio__time`
    + (timeDisplay === 'both' && timePosition !== 'both_sides' ? ` ${CLS}-audio__time--both` : '');

  type TimeRole = 'auto' | 'current' | 'total';
  const slot = (role: TimeRole) => h('div', {
    className: timeCls,
    'data-audio-time': role,
  }, role === 'current' ? '00:00' : '--:--');

  let leftTime: ReturnType<typeof h> | null = null;
  let rightTime: ReturnType<typeof h> | null = null;
  if (showTime) {
    if (timeDisplay === 'both') {
      if (timePosition === 'both_sides') {
        leftTime = slot('current');
        rightTime = slot('total');
      } else if (timePosition === 'start') {
        leftTime = slot('current');
      } else {
        rightTime = slot('current');
      }
    } else if (timePosition === 'start') {
      leftTime = slot('auto');
    } else {
      // Default + end/both_sides：单槽在右侧（both_sides 只在 both 模式下拆两槽）。
      rightTime = slot('auto');
    }
  }

  // ---- 图标（style）----
  // normal + 块级 → RoundFilled；normal + inline → FlatFilled；flat → FlatFilled；
  // speak → SpeakingOutlined（播放/暂停同图标，不做双图标切换）。
  // markdown_audio 的 md-parse 为避免与图标 style 对象撞名，把 style 存成 audioStyle。
  const styleRaw = p.style ?? p.audioStyle;
  const audioStyle = styleRaw === 'flat' || styleRaw === 'speak' ? styleRaw : 'normal';
  const useFlat = audioStyle === 'flat' || (audioStyle === 'normal' && isInline);
  const iconNode = audioStyle === 'speak'
    ? h('span', { className: `${CLS}-audio__ctrl-icon` },
        h('span', {
          className: `${CLS}-audio__icon ${CLS}-audio__icon--speak`,
          dangerouslySetInnerHTML: { __html: AUDIO_SPEAK_ICON_SVG },
        }),
      )
    : h('span', { className: `${CLS}-audio__ctrl-icon` },
        h('span', {
          className: `${CLS}-audio__icon ${CLS}-audio__icon--play`,
          dangerouslySetInnerHTML: { __html: useFlat ? AUDIO_PLAY_FLAT_ICON_SVG : AUDIO_PLAY_ICON_SVG },
        }),
        h('span', {
          className: `${CLS}-audio__icon ${CLS}-audio__icon--pause`,
          dangerouslySetInnerHTML: { __html: useFlat ? AUDIO_PAUSE_FLAT_ICON_SVG : AUDIO_PAUSE_ICON_SVG },
        }),
      );

  const controlKids: Array<ReturnType<typeof h> | null> = [
    h('div', { className: `${CLS}-audio__ctrl` }, iconNode),
    leftTime,
  ];
  if (showProgress) {
    controlKids.push(
      h('div', { className: `${CLS}-audio__slider` },
        h('div', { className: `${CLS}-audio__slider-bg` },
          h('div', { className: `${CLS}-audio__process`, style: { width: '0%' } })
        ),
        h('div', { className: `${CLS}-audio__slider-strip`, style: { left: '0%' } })
      )
    );
  }
  controlKids.push(rightTime);

  const children: Array<ReturnType<typeof h> | null> = [];
  // 可播放地址：藏原生 audio，宿主可用 querySelector 驱动；controls 不画，避免双 UI。
  if (src && !disabled) {
    children.push(h('audio', {
      className: `${CLS}-audio__native`,
      src,
      preload: 'metadata',
      'data-audio-id': p.audioID || p.audio_id || '',
    }));
  }
  if (disabled) {
    children.push(h('div', { className: `${CLS}-audio__mask` }));
  }
  children.push(
    h('div', { className: `${CLS}-audio__component` },
      h('div', { className: `${CLS}-audio__control${widthIsFill ? ` ${CLS}-audio__control--fill` : ''}` },
        controlKids.filter(Boolean) as never
      )
    )
  );

  const props: Record<string, unknown> = { className: wrapCls };
  if (Object.keys(style).length) props.style = style;
  if (src) props['data-src'] = src;
  return h('div', props, children.filter(Boolean) as never);
}
registerComponent('audio', renderAudio);
registerComponent('markdown_audio', renderAudio);

// interactive_container：可点击的交互容器（整块可点，带 hover 提示/背景）
// 注意：容器内常含 link 等 <a>，故外层必须用 <div> 而非 <a>——嵌套 <a> 是非法 HTML，
// 浏览器会把外层锚点提前闭合，导致结构错乱。点击交给内部链接，URL 存到 data-url。
registerComponent('interactive_container', (el, ctx) => {
  const p = el.property || {};
  const disabled = p.disabled === true;
  // 取首个 open_url 行为的地址；action.url 可能是字符串或多端对象
  const act = Array.isArray(p.actions) ? (p.actions[0] as { action?: { url?: unknown } } | undefined) : undefined;
  const url = resolveURL(act?.action?.url);
  const hasActions = Array.isArray(p.actions) && p.actions.length > 0;
  const clickable = !disabled && (Boolean(url) || hasActions);
  // border_color / customBorderColor：命名色 /色阶 / 自定义色 → CSS 值。
  // 描边色走 interactive_container.border_color token 表：grey → --line-border-component（N350），
  // 不是正文灰 N600（resolveColor('grey') 会给出后者，描边明显偏深）。
  const borderNamed = (p.border_color ?? (p as { borderColor?: string }).borderColor) as string | undefined;
  const borderCustom = resolveCustomBorderLight(p);
  // 优先 customBorderColor（dslToRaw 已展开登记色）；命名色走 border token 表。
  const borderColorResolved = (borderCustom ? resolveBorderColor(borderCustom) : undefined)
    ?? resolveBorderColor(borderNamed);
  // 官方语义：has_border 为 true 时 border_color 才生效（只写 border_color 不描边）。
  const hasBorder = p.hasBorder === true || p.has_border === true;
  const borderColor = hasBorder ? borderColorResolved : undefined;
  const cls = `${CLS}-interactive-container`
    + (clickable ? ` ${CLS}-interactive-container--action` : '')
    + (hasBorder && !borderColor ? ` ${CLS}-interactive-container--bordered` : '')
    + (disabled ? ` ${CLS}-interactive-container--disabled` : '');
  const style: Record<string, string> = {};
  const bg = propertyBackgroundColor(p);
  if (bg) style.background = bg;
  const pad = boxToStyle(p.padding);
  if (pad) style.padding = pad;
  if (borderColor) style.border = `1px solid ${borderColor}`;
  const radius = resolveCornerRadius(p as Record<string, unknown>);
  if (radius != null) style.borderRadius = radius;

  // 布局：direction 决定主轴，两个 align 字段落到哪个 flex 属性也随之交换。
  //   direction=vertical  → 主轴纵向：vertical_align→justify-content，horizontal_align→align-items
  //   direction=horizontal→ 主轴横向：horizontal_align→justify-content，vertical_align→align-items
  // 漏读这几个字段会让容器内子组件退化成「左上贴边、固定 4px 行距」，与真机对不上。
  const horizontalDir = p.direction === 'horizontal';
  if (horizontalDir) style.flexDirection = 'row';
  const hAlign = p.horizontal_align ?? (p as { horizontalAlign?: string }).horizontalAlign;
  const vAlign = p.vertical_align ?? (p as { verticalAlign?: string }).verticalAlign;
  const justify = horizontalDir ? H_ALIGN_MAP[hAlign as string] : V_ALIGN_MAP[vAlign as string];
  const align = horizontalDir ? V_ALIGN_MAP[vAlign as string] : H_ALIGN_MAP[hAlign as string];
  if (justify) style.justifyContent = justify;
  if (align) style.alignItems = align;

  // 间距：与 direction 无关——horizontal_spacing 恒为列间距，vertical_spacing 恒为行间距。
  // CSS 的 row-gap 4px 是兜底默认值，仅在未显式给 vertical_spacing 时生效。
  const hGap = p.horizontalSpacingValue?.value ?? p.horizontal_spacing
    ?? (p as { horizontalSpacing?: string }).horizontalSpacing;
  if (hGap != null) style.columnGap = horizontalSpacingToPx(hGap as number | string) + 'px';
  const vGap = p.verticalSpacingValue?.value ?? p.vertical_spacing;
  if (vGap != null) style.rowGap = verticalSpacingToPx(vGap as number | string) + 'px';
  // width/height：fill→100%；"48px"/widthValue.pixels→定宽高（图标容器）。
  const icWv = p.widthValue as { type?: string; value?: string | number } | undefined;
  const icHv = p.heightValue as { type?: string; value?: string | number } | undefined;
  const w = resolveDimensionPx(p.width, icWv);
  const hPx = resolveDimensionPx(p.height, icHv);
  if (w) style.width = w;
  if (hPx) {
    style.height = hPx;
    style.flexShrink = '0';
    style.boxSizing = 'border-box';
  }
  // 外边距（卡片左右 20px 等）；定宽图标框不改 width。
  applyOuterMargin(style, p.margin);
  const props: Record<string, unknown> = { className: cls };
  if (Object.keys(style).length) props.style = style;
  // disabled 时不挂跳转；hover_tips / disabled_tips 由 renderElement 统一附加为 title。
  if (url && !disabled) props['data-url'] = url;
  return h('div', props, renderElements(p.elements, ctx));
});

// collapsible_panel：折叠面板（可点击展开/收起）。
// 用原生 <details>/<summary> 实现纯 CSS 交互——零 JS、SSR 字符串与浏览器 DOM 都能点，
// 用户点击 <summary> 由浏览器切换 [open]，箭头旋转、标题文案（title ↔ expanded_title）
// 与内容显隐都由 CSS 的 details[open] 驱动，故 toggle 后状态始终自洽（无需 JS）。
// 结构：<details>（外层容器 border/background/radius）→ <summary>（标题 + 可旋转箭头图标）
// → content（子元素；折叠态由浏览器隐藏）。expanded 决定初始展开态（映射到 <details open>）。
// header 里的字段（DSL 扁平对象，未经 convertEl）：title / expanded_title（文本叶子或 plain_text）、
// background_color、width（fill/auto/auto_when_fold）、vertical_align、position（top/bottom）、
// icon（standard_icon）、icon_position、icon_expanded_angle、padding。

/**
 * 折叠面板箭头默认尺寸：真机用 j(cr(header.title.textStyle))。
 * title 没声明字号（textStyle/size 缺失）时返回 undefined，交给 renderIcon 走 size 枚举/16px。
 * 注意这里不能默认成 normal：真机 cr() 拿不到 textStyle 就不会注入 defaultSize。
 */
function collapsibleIconDefaultSize(title: unknown): number | undefined {
  if (!isRecord(title)) return undefined;
  const property = isRecord(title.property) ? title.property : title;
  const sizeKey = resolveTextSizeKey(property as never);
  const fontPx = sizeKey ? TEXT_SIZE_MAP[sizeKey] : undefined;
  return typeof fontPx === 'number' && fontPx > 0 ? iconDefaultSize(fontPx) : undefined;
}

registerComponent('collapsible_panel', (el, ctx) => {
  const p = el.property || {};
  const hdr = (p.header && typeof p.header === 'object' ? p.header : {}) as Record<string, unknown>;
  // 真机 useState(!!e.expanded)：expanded 缺省即收起（官方字段默认 false）。
  const expanded = p.expanded === true;

  // 外层容器样式：background_color（bg-white/命名色/登记色→customBackgroundStyle）+ 可选 border。
  const style: Record<string, string> = { width: '100%' };
  const bgRaw = (p.background_color ?? (p as { backgroundColor?: string }).backgroundColor) as string | undefined;
  // 优先 customBackgroundStyle（dslToRaw 已展开登记色）；再 bg-white / 命名色。
  const bgCustom = propertyBackgroundColor(p);
  let hasBg = false;
  if (bgCustom) { style.background = bgCustom; hasBg = true; }
  else if (bgRaw === 'bg-white') { style.background = '#fff'; hasBg = true; }
  else { const bg = bgStyleToColor(bgRaw); if (bg) { style.background = bg; hasBg = true; } }
  // header.background_color：命名色 / #hex / 色阶 token。
  const hbg = resolveColor(hdr.background_color ?? hdr.backgroundColor);

  // 描边：真机 border.color 走 collapsible_panel.border_color token 表——
  //   grey → var(--line-border-component)（N350 #d0d3d6）
  // 缺省也是 grey（borderColorDefaultToken: b.Grey）。
  // 之前直接 resolveColor('grey') → N600 #646a73，同一张卡片描边深了一整档。
  const borderRaw = p.border;
  let hasBorder = false;
  let borderRadiusRaw: number | string | undefined;
  if (borderRaw && typeof borderRaw === 'object') {
    const border = borderRaw as { color?: string; corner_radius?: number | string };
    const borderColor = resolveBorderColor(border.color) ?? 'var(--line-border-component)';
    style.border = `1px solid ${borderColor}`;
    hasBorder = true;
    borderRadiusRaw = border.corner_radius;
  }
  // 真机 --fat：有描边 / 面板底色 / header 底色 任一条成立 → border-radius:6px。
  // （只有纯无样式面板才是直角；DSL 显式的 corner_radius 覆盖本默认值。）
  const isFat = hasBorder || hasBg || !!hbg;
  if (borderRadiusRaw != null) style.borderRadius = sizeToPx(borderRadiusRaw);
  else if (isFat) style.borderRadius = '6px';
  // header.position=bottom：标题落在内容下方。<summary> 必须是 <details> 的首个子节点才能
  // 充当开关键，所以 DOM 顺序不动，用 flex order 调换视觉顺序（details 变成纵向 flex 容器）。
  const headerBottom = String(hdr.position ?? 'top') === 'bottom';
  if (headerBottom) {
    style.display = 'flex';
    style.flexDirection = 'column';
  }
  applyOuterMargin(style, p.margin);

  // header（<summary>）：标题 + 箭头图标。icon_position：
  // left → 箭头在左；right（默认）→ 箭头贴右；follow_text → 箭头紧贴文字（不推到最右）。
  const headerStyle: Record<string, string> = {};
  const hpad = typeof hdr.padding === 'string'
    ? hdr.padding
    : boxToStyle(hdr.padding as never); // DSL 常是 "8px 12px 8px 12px"；RAW 可能是 box 对象
  // header.padding 缺省时不写内联 padding：真机标题区额外内边距唯一来源是 CSS
  // （--fat → 4px 8px，否则 0，见 styles.css 注释），官方 schema 文档未标注该默认值。
  if (hpad) headerStyle.padding = hpad;
  // header.background_color 已在上方解析（hbg），同时决定 --fat。
  if (hbg) headerStyle.background = hbg;
  if (headerBottom) headerStyle.order = '2';

  // 标题支持 plain_text / lark_md / markdown（官方 CollapsiblePanelHeaderTitle 是三者联合）。
  // DSL 标题是扁平的 `{ tag, content }`；编辑器直出的 RAW 可能再包一层 property，两种都归一。
  const titleLeaf = (raw: unknown, className: string): VNode | null => {
    if (!raw || typeof raw !== 'object') return null;
    const t = raw as Record<string, unknown>;
    if (typeof t.tag !== 'string') return null;
    const property = (t.property && typeof t.property === 'object'
      ? t.property
      : t) as Record<string, unknown>;
    const node = renderHeaderTextLeaf({ tag: t.tag, property } as CardElement, ctx, className);
    if (node) return node;
    // 兼容历史畸形形态：抽不到结构化内容时退回纯文本。
    const text = extractPlainText(raw) || extractText(raw as never);
    return text ? h('div', { className }, text) : null;
  };
  const primaryTitle = titleLeaf(hdr.title, `${CLS}-collapsible-panel__title-text`);
  const expandedTitleRaw = hdr.expanded_title ?? hdr.expandedTitle;
  const expandedTitle = titleLeaf(
    expandedTitleRaw,
    `${CLS}-collapsible-panel__title-text ${CLS}-collapsible-panel__title-text--expanded`,
  );
  // 有 expanded_title 时才挂 --has-expanded：折叠展示 title、展开展示 expanded_title（纯 CSS）。
  const titleCls = `${CLS}-collapsible-panel__title`
    + (expandedTitle ? ` ${CLS}-collapsible-panel__title--has-expanded` : '');
  const titleVNode = h('div', { className: titleCls }, [primaryTitle, expandedTitle].filter(Boolean) as VNode[]);

  // 箭头图标：复用 renderIcon（standard_icon）。旋转不再由内联 transform 定死，而是把展开角度
  // 写进 CSS 变量 --panel-icon-angle：details[open] 时 CSS 用它旋转，收起时归 0——这样用户
  // 点击 toggle 后箭头方向自动跟随，无需 JS。默认展开角 -180。
  // header 是未经 convertEl 的原始 DSL 对象，故 icon 的字段（token/color/size）是扁平的、
  // 未包进 property——renderIcon 读 property，这里归一：无 property 时把元素自身当 property。
  // 图标默认尺寸跟标题字号（真机 j(cr(title.textStyle))）：标题 12px 时箭头 14px，
  // 而不是固定 16px；显式 widthValue/heightValue/像素 size 仍然优先。
  let iconVNode: VNode | null = null;
  const iconRaw = hdr.icon as CardElement | undefined;
  const openAngle = Number(hdr.icon_expanded_angle ?? hdr.iconExpandedAngle ?? -180);
  if (iconRaw && iconRaw.tag) {
    const iconEl: CardElement = iconRaw.property
      ? iconRaw
      : { tag: iconRaw.tag, property: iconRaw as never };
    const inner = renderIcon(iconEl, ctx, collapsibleIconDefaultSize(hdr.title));
    if (inner) {
      iconVNode = h('div', { className: `${CLS}-collapsible-panel__icon` }, inner);
    }
  }
  const iconPos = String(hdr.icon_position ?? hdr.iconPosition ?? 'right');
  const iconLeft = iconPos === 'left';
  const iconFollow = iconPos === 'follow_text' || iconPos === 'followText';
  const headerChildren = iconLeft ? [iconVNode, titleVNode] : [titleVNode, iconVNode];
  // 展开角写在 <summary> 上（作用域含箭头子节点）；--panel-icon-angle 供 CSS details[open] 取用。
  const summaryStyle = { ...headerStyle, '--panel-icon-angle': `${openAngle}deg` };
  // header.width：fill（默认撑满）/ auto（自适应内容宽）/ auto_when_fold（折叠自适应、展开撑满）。
  const headerWidth = String(hdr.width ?? hdr.headerWidth ?? 'fill');
  // header.vertical_align：top / center（默认）/ bottom。
  const headerVAlign = String(hdr.vertical_align ?? hdr.verticalAlign ?? 'center');
  const headerCls = `${CLS}-collapsible-panel__header`
    + (iconFollow ? ` ${CLS}-collapsible-panel__header--icon-follow` : '')
    + (iconLeft ? ` ${CLS}-collapsible-panel__header--icon-left` : '')
    + (headerWidth === 'auto' ? ` ${CLS}-collapsible-panel__header--w-auto` : '')
    + (headerWidth === 'auto_when_fold' ? ` ${CLS}-collapsible-panel__header--w-auto-when-fold` : '')
    + (headerVAlign === 'top' ? ` ${CLS}-collapsible-panel__header--valign-top` : '')
    + (headerVAlign === 'bottom' ? ` ${CLS}-collapsible-panel__header--valign-bottom` : '');
  const summary = h('summary', { className: headerCls, style: summaryStyle }, headerChildren);

  // 内容始终渲染：折叠态由 <details>（无 open 属性）交给浏览器隐藏，展开由用户点击控制。
  // 面板 padding 落到内容区（header 用 hdr.padding）；缺省走 CSS：
  //   --fat 时 8px，否则只有 padding-top:8px（对齐网页版 __content 规则）。
  const contentStyle: Record<string, string> = {};
  const cpad =
    typeof p.padding === 'string'
      ? p.padding
      : boxToStyle(p.padding as never);
  if (cpad) contentStyle.padding = cpad;
  if (headerBottom) contentStyle.order = '1';
  // 面板内布局四件套：direction / horizontal_spacing / vertical_spacing / horizontal_align / vertical_align。
  // 真机内容区永远是 flex 容器（element-shell__container）：
  //   默认纵向、row-gap/column-gap 都是 8px（CSS 给的底），只有显式写了 spacing 才覆盖。
  // 多元素面板（如列表 markdown + 说明 markdown 各一个元素）就靠这 8px 拉开，
  // 之前只在“显式配了 spacing/align”时才切 flex、否则块级堆叠，块间距就少了 8px。
  const direction = String(p.direction ?? 'vertical');
  const isRow = direction === 'horizontal';
  const hSpacing = p.horizontal_spacing ?? (p as { horizontalSpacing?: unknown }).horizontalSpacing;
  const vSpacing = p.vertical_spacing ?? (p as { verticalSpacing?: unknown }).verticalSpacing;
  const hAlign = (p.horizontal_align ?? (p as { horizontalAlign?: unknown }).horizontalAlign) as string | undefined;
  const vAlign = (p.vertical_align ?? (p as { verticalAlign?: unknown }).verticalAlign) as string | undefined;
  contentStyle.display = 'flex';
  contentStyle.flexDirection = isRow ? 'row' : 'column';
  if (hSpacing != null) contentStyle.columnGap = horizontalSpacingToPx(hSpacing as number | string) + 'px';
  if (vSpacing != null) contentStyle.rowGap = verticalSpacingToPx(vSpacing as number | string) + 'px';
  // 主轴/交叉轴随方向互换：横排时 horizontal_align 走 justify-content，纵排时走 align-items。
  const hVal = hAlign ? H_ALIGN_MAP[hAlign] : undefined;
  const vVal = vAlign ? V_ALIGN_MAP[vAlign] : undefined;
  if (hVal) {
    if (isRow) contentStyle.justifyContent = hVal;
    else contentStyle.alignItems = hVal;
  }
  if (vVal) {
    if (isRow) contentStyle.alignItems = vVal;
    else contentStyle.justifyContent = vVal;
  }
  const content = h(
    'div',
    { className: `${CLS}-collapsible-panel__content`, style: contentStyle },
    renderElements(p.elements, ctx),
  );

  const cls = `${CLS}-collapsible-panel`
    + (expanded ? ` ${CLS}-collapsible-panel--expanded` : '')
    + (isFat ? ` ${CLS}-collapsible-panel--fat` : '');
  const props: Record<string, unknown> = { className: cls, style };
  if (expanded) props.open = ''; // 原生 <details open>：初始展开
  return h('details', props, summary, content);
});

// button：按钮。文本是纯文本（不支持富文本）；可带前置 icon（继承按钮文字色）。
// 按钮尺寸 → 字号（与引擎 button.size 一致）；icon 走 inheritFontSize=1em，等同按钮字号。
const BUTTON_FONT_SIZE: Record<string, number> = {
  tiny: 12, small: 12, medium: 14, large: 16,
};
registerComponent('button', (el, ctx) => {
  const p = el.property || {};
  const type = p.type || 'default';
  // 飞书按钮文本是纯文本，不支持富文本：递归抽出所有文字、去掉格式与换行，平铺成一行。
  // text 可能是 plain_text（property.content），也可能是 markdown（property.elements，
  // 内含 emoji / text_tag / br / 副标题）——两种都只取纯文字。
  const label = extractPlainText(p.text);
  // 前置图标：引擎 inheritFontSize → fontSize:1em（跟随按钮字号）；
  // 无显式 size 时按按钮 size 注入像素，避免 renderIcon 默认 16px 偏大。
  const iconRaw = (p.icon || p.udIcon) as CardElement | undefined;
  let iconVNode: VNode | null = null;
  if (iconRaw && iconRaw.tag) {
    const btnSize = String(p.size || 'medium');
    const iconPx = BUTTON_FONT_SIZE[btnSize] || 14;
    const ip = { ...(iconRaw.property || {}) } as Record<string, unknown>;
    const nested = (ip.style && typeof ip.style === 'object' ? ip.style : null) as { size?: unknown } | null;
    if (ip.size == null && nested?.size == null) ip.size = iconPx + 'px';
    const inner = renderIcon({ ...iconRaw, property: ip as never }, ctx);
    if (inner) {
      iconVNode = h('span', { className: `${CLS}-button__icon` }, inner);
    }
  }
  const children = iconVNode ? [iconVNode, label] : [label];
  // URL 优先级：actions[].action.url（open_url）> p.url > behaviors.default_url
  const actionUrl = Array.isArray(p.actions)
    ? resolveURL((p.actions.find((a) => (a as { type?: string }).type === 'open_url') as { action?: { url?: unknown } } | undefined)?.action?.url)
    : '';
  const url = actionUrl || resolveURL(p.url) || p.behaviors?.[0]?.default_url?.url;
  // 宽度：真机按「容器宽度是否 > 320px」分档（客户端 useIsWide + oa() 的宽度策略）：
  //   default/primary/primary_filled/danger/danger_filled/laser → 宽屏内容自适应、窄屏撑满整行
  //   text/primary_text/danger_text（纯文字族）→ 恒撑满整行，文字仍靠左
  //   width:"fill" → 恒撑满；width:"120px" → 定宽
  // 真机 RAW 用 widthValue:{type:'builtin_width',value:'fill'}，DSL 直接写 width:"fill"——两处都认。
  const wv = p.widthValue as { type?: string; value?: string | number } | undefined;
  const widthTok = (p.width ?? wv?.value) as string | number | undefined;
  const isFill = widthTok === 'fill';
  const pxWidth = /^\d+(\.\d+)?px$/i.test(String(widthTok ?? '')) ? String(widthTok) : '';
  // 纯文字族恒撑满（客户端 NonFill 策略 → "100%"）
  const textFamily = type === 'text' || type === 'primary_text' || type === 'danger_text';
  const block = isFill || textFamily;
  // 其余（未写 width）→ 宽屏自适应、窄屏撑满
  const auto = !block && !pxWidth;
  const base = `${CLS}-button ${CLS}-button--${type}`
    + (block ? ` ${CLS}-button--block` : '')
    + (auto ? ` ${CLS}-button--auto` : '');
  // 外边距（如 margin:12px 20px）。撑满的按钮用 calc 抵消左右 margin（对齐真机元素壳的算法）；
  // 自适应宽度的按钮保持内容宽，margin 直接给，只用 max-width 防溢出。
  const style: Record<string, string> = {};
  if (pxWidth) {
    style.width = pxWidth;
    if (p.margin) applyOuterMargin(style, p.margin);
  } else if (p.margin) {
    if (block) {
      style.width = '100%';
      applyOuterMargin(style, p.margin);
    } else {
      // 自适应宽度不写死 inline width：窄屏撑满由 @container 规则控制，
      // 内联样式优先级更高，写死会盖掉窄屏分档。
      applyOuterMargin(style, p.margin);
      const { left, right } = horizontalMarginPx(p.margin);
      const inset = left + right;
      if (inset > 0) style.maxWidth = `calc(100% - ${inset}px)`;
    }
  }
  const styleProp = Object.keys(style).length ? { style } : {};
  const extra = p as ElementProperty & Record<string, unknown>;
  const callback = readCallbackValue(extra);
  const formAction = String(extra.form_action_type ?? extra.formActionType ?? '');
  // interactive：回调按钮变成真 <button>，值放在 data-feishu-action，由宿主页面提交。
  if (ctx.options.interactive && callback && !p.disabled && !url) {
    return h('button', {
      type: formAction === 'reset' ? 'reset' : formAction === 'submit' ? 'submit' : 'button',
      className: base,
      'data-feishu-action': JSON.stringify(callback),
      'data-feishu-tag': 'button',
      ...styleProp,
    }, children);
  }
  // 只有"点击跳转外链"（open_url / 直链）才保留为可点链接；
  // 其余动作在静态预览里无意义——保留按钮外观，但渲染成不可点的 <span>。
  if (url && !p.disabled) {
    return h('a', { className: base, href: url, target: '_blank', rel: 'noopener', ...styleProp }, children);
  }
  const cls = `${base} ${CLS}-button--static` + (p.disabled ? ` ${CLS}-button--disabled` : '');
  return h('span', { className: cls, ...styleProp }, children);
});

/**
 * 按钮 / 下拉的回传对象。DSL 写在 value 上，RAW 写在 actions[].action.value。
 * 回调 type 认两种拼写：`callback`（公开 DSL / 旧数据）与 `action_request`
 * （服务端存储与 dslToRaw 输出的拼写）。
 */
function readCallbackValue(p: { value?: unknown; actions?: unknown; behaviors?: unknown }): Record<string, unknown> | null {
  const fromList = (list: unknown): Record<string, unknown> | null => {
    if (!Array.isArray(list)) return null;
    for (const item of list) {
      if (!isRecord(item)) continue;
      if (item.type !== 'callback' && item.type !== 'action_request') continue;
      const inner = isRecord(item.action) ? item.action : item;
      if (isRecord(inner.value)) return inner.value;
    }
    return null;
  };
  return fromList(p.actions) ?? fromList(p.behaviors) ?? (isRecord(p.value) ? p.value : null);
}

// overflow：折叠按钮组。真机渲染成一个「…」图标按钮，点击弹出选项菜单；
// 选项文案只在菜单里，不占正文位置。此前该 tag 未注册，renderElement 直接返回 null，
// 整块在预览里凭空消失（真机却有）。
// 预览：静态态输出「…」图标按钮（不可点），interactive 态用原生 <details> 做纯 CSS 下拉，
// 每个选项是一个按钮外观的行，带 open_url 的选项渲染成 <a>。
registerComponent('overflow', (el, ctx) => {
  const p = el.property || {};
  const disabled = p.disabled === true;
  const options = Array.isArray(p.options) ? p.options : [];
  const widthTok = (p.width ?? (p.widthValue as { value?: string } | undefined)?.value) as string | undefined;
  const block = widthTok === 'fill';
  // 触发器：与 button 同款外观（default 灰边），图标尺寸跟随按钮字号
  const triggerIcon = renderIcon(
    { tag: 'standard_icon', property: { token: 'more_outlined', size: '14px' } } as CardElement,
    ctx,
  );
  const triggerCls = `${CLS}-button ${CLS}-button--default ${CLS}-button--static ${CLS}-overflow__trigger`
    + (disabled ? ` ${CLS}-button--disabled` : '')
    + (block ? ` ${CLS}-button--block` : '');
  const trigger = triggerIcon
    ? h('span', { className: triggerCls }, h('span', { className: `${CLS}-button__icon` }, triggerIcon))
    : h('span', { className: triggerCls }, '···');

  // 菜单项：文案取 options[].text（plain_text 叶子），url 取 multi_url.url 兜底
  const items = options.map((raw) => {
    const opt = isRecord(raw) ? raw : {};
    // options[].text 在 DSL 里是扁平 { tag, content }，经 dslToRaw 后是 { property: { content } }；
    // extractPlainText 只认 property.content，故两处都兜一下。
    const textObj = opt.text;
    const label = (isRecord(textObj) && typeof textObj.content === 'string'
      ? textObj.content
      : extractPlainText(textObj)) || extractPlainText(opt);
    const multi = isRecord(opt.multi_url) ? opt.multi_url : undefined;
    const href = resolveURL(multi?.url ?? opt.url);
    const itemCls = `${CLS}-overflow__item`;
    if (href && !disabled) {
      return h('a', { className: itemCls, href, target: '_blank', rel: 'noopener' }, label);
    }
    return h('span', { className: itemCls }, label);
  });

  const style: Record<string, string> = {};
  if (p.margin) applyOuterMargin(style, p.margin);
  const styleProp = Object.keys(style).length ? { style } : {};

  // 静态预览：没有交互能力，只画触发器，避免出现点了没反应的假菜单
  if (!ctx.options.interactive) {
    return h('span', { className: `${CLS}-overflow ${CLS}-overflow--static`, ...styleProp }, trigger);
  }
  // interactive：<details> 驱动纯 CSS 下拉，无需 JS
  return h(
    'details',
    { className: `${CLS}-overflow`, ...styleProp },
    h('summary', { className: `${CLS}-overflow__summary` }, trigger),
    h('div', { className: `${CLS}-overflow__menu` }, items),
  );
});

// form：静态预览只透传子元素。interactive 时变成真 <form>，提交由宿主 preventDefault。
registerComponent('form', (el, ctx) => {
  // 子元素在表单上下文里渲染：select_img 需要据此显示 checkbox/radio 选中态。
  const children = renderElements(el.property?.elements, { ...ctx, inForm: true });
  const className = `${CLS}-form`;
  if (!ctx.options.interactive) return h('div', { className }, children);
  const name = typeof el.property?.name === 'string' ? el.property.name : '';
  return h('form', { className, 'data-feishu-form': name }, children);
});

// input / select：静态预览是只读框。interactive 时变成可输入控件，name 进入 FormData。
/**
 * 真机宽度规则（客户端 oa() / eo()，逆向自飞书网页版引擎）：
 * - input / date_picker：默认 100% 但上限 282px（`.universal-card-input__container--default-width`）；
 *   width=fill 解除上限；width="120px" 定宽。
 * - select（单选/多选/人员）：默认定宽 282px（eo() 的 `{maxWidth:"100%", width:"282px"}`）；
 *   type="text" 内容自适应且无边框（eo() 只给 maxWidth）；width=fill / width="auto" → 100%。
 */
function fieldWidthStyle(p: Record<string, unknown>, kind: 'input' | 'select'): Record<string, string> {
  const wv = p.widthValue as { type?: string; value?: string | number } | undefined;
  const raw = String(p.width ?? wv?.value ?? '');
  const style: Record<string, string> = {};
  if (/^\d+(\.\d+)?px$/i.test(raw)) {
    style.width = raw;
    style.maxWidth = '100%';
    return style;
  }
  if (raw === 'fill') {
    style.width = '100%';
    style.maxWidth = 'none';
    return style;
  }
  if (kind === 'select') {
    // width:"auto" 在客户端走 DefaultFill（100%），与 "default"（282px）不同
    if (raw === 'auto') {
      style.width = '100%';
      style.maxWidth = '100%';
      return style;
    }
    if (p.type === 'text') {
      style.width = 'auto';
      style.maxWidth = '100%';
      return style;
    }
    style.width = '282px';
    style.maxWidth = '100%';
    return style;
  }
  style.width = '100%';
  style.maxWidth = '282px';
  return style;
}

function renderStaticField(el: CardElement) {
  const p = (el.property || {}) as ElementProperty & Record<string, unknown>;
  const ph = extractPlainText(p.placeholder) || '';
  const kind = isSelectTag(el.tag) ? 'select' : 'input';
  const cls = `${CLS}-input ${CLS}-input--static`
    + (kind === 'select' && p.type === 'text' ? ` ${CLS}-input--text` : '');
  return h('div', { className: cls, style: fieldWidthStyle(p, kind) }, ph);
}

function fieldText(value: unknown): string {
  if (typeof value === 'string') return value;
  return extractPlainText(value);
}

/** 下拉类组件（单选/多选/人员）走 select 的宽度规则 */
function isSelectTag(tag: string): boolean {
  return tag === 'select_static' || tag === 'multi_select_static'
    || tag === 'select_person' || tag === 'multi_select_person';
}

function renderInteractiveField(el: CardElement) {
  const p = (el.property || {}) as ElementProperty & Record<string, unknown>;
  const ph = extractPlainText(p.placeholder) || '';
  const name = typeof p.name === 'string' ? p.name : undefined;
  const nameProp = name ? { name } : {};
  const callback = readCallbackValue(p);
  const actionProp = callback
    ? { 'data-feishu-action': JSON.stringify(callback), 'data-feishu-tag': el.tag }
    : {};
  if (isSelectTag(el.tag)) {
    const initial = p.initial_option ?? p.initialOption;
    const options = Array.isArray(p.options) ? p.options : [];
    const cls = `${CLS}-input` + (p.type === 'text' ? ` ${CLS}-input--text` : '');
    return h('select', {
      className: cls,
      style: fieldWidthStyle(p, 'select'),
      ...nameProp,
      ...(el.tag === 'multi_select_static' || el.tag === 'multi_select_person' ? { multiple: true } : {}),
      ...actionProp,
    }, [
      h('option', { value: '' }, ph),
      ...options.map((option) => {
        const item = isRecord(option) ? option : {};
        const value = typeof item.value === 'string' ? item.value : fieldText(item.text ?? item);
        const label = fieldText(item.text ?? item.label) || value;
        return h('option', {
          value,
          ...(value !== '' && value === initial ? { selected: true } : {}),
        }, label);
      }),
    ]);
  }
  const def = p.default_value ?? p.defaultValue;
  const inputType = el.tag === 'date_picker' ? 'date' : el.tag === 'picker_time' ? 'time' : 'text';
  return h('input', {
    className: `${CLS}-input`,
    style: fieldWidthStyle(p, 'input'),
    type: inputType,
    placeholder: ph,
    value: typeof def === 'string' ? def : '',
    ...nameProp,
    ...actionProp,
  });
}

function renderField(el: CardElement, ctx: RenderContext) {
  return ctx.options.interactive ? renderInteractiveField(el) : renderStaticField(el);
}

registerComponent('input', (el, ctx) => renderField(el, ctx));
registerComponent('multi_select_static', (el, ctx) => renderField(el, ctx));
registerComponent('select_static', (el, ctx) => renderField(el, ctx));
registerComponent('date_picker', (el, ctx) => renderField(el, ctx));
registerComponent('picker_time', (el, ctx) => renderField(el, ctx));
registerComponent('picker_datetime', (el, ctx) => renderField(el, ctx));
registerComponent('select_person', (el, ctx) => renderField(el, ctx));
registerComponent('multi_select_person', (el, ctx) => renderField(el, ctx));

// checker：勾选器（交互组件）。结构对齐网页版飞书引擎：
// checkbox-container + content（可选删除线/透明度）+ buttons（可选，on_hover 自动隐藏）。
// 用原生 <input type="checkbox"> + :has(:checked) 驱动勾选态样式——零 JS、SSR/浏览器都能本地切换，
// 行为对齐 collapsible_panel（预览可点）；callback 类 behaviors 预览里不发请求。
registerComponent('checker', (el, ctx) => {
  const p = el.property || {};
  const checked = p.checked === true;
  const disabled = p.disabled === true;
  const overall = (p.overall_checkable ?? (p as { overallCheckable?: boolean }).overallCheckable) !== false;
  const checkedStyle = (
    (p.checked_style ?? (p as { checkedStyle?: unknown }).checkedStyle) &&
    typeof (p.checked_style ?? (p as { checkedStyle?: unknown }).checkedStyle) === 'object'
      ? (p.checked_style ?? (p as { checkedStyle?: unknown }).checkedStyle)
      : {}
  ) as { show_strikethrough?: boolean; showStrikethrough?: boolean; opacity?: number };
  const strike = !!(checkedStyle.show_strikethrough ?? checkedStyle.showStrikethrough);
  const opacity = typeof checkedStyle.opacity === 'number' ? checkedStyle.opacity : undefined;

  // 文本：plain_text 叶子，或 markdown（property.elements，含 text_tag / font / 加粗 等）
  const textEl = p.text as CardElement | undefined;
  const textProp = (textEl && typeof textEl === 'object' ? textEl.property : undefined) || {};
  const textSizeKey = resolveTextSizeKey(textProp);
  const fontSize = (textSizeKey && TEXT_SIZE_MAP[textSizeKey]) || TEXT_SIZE_MAP.normal;
  // 真机 Checker：lineHeight = de(fontSize)（不叠加消息卡片 +2）
  const lineHeight = lineHeightForFontSize(fontSize);
  const textColorRaw = (textProp.text_color ?? (textProp as { textColor?: string }).textColor) as string | undefined;
  const textColor = resolveColor(textColorRaw) || (textColorRaw && textColorRaw !== 'default' ? NAMED_TEXT_COLOR[textColorRaw as never] : undefined);
  const textAlign = (textProp.textAlign ?? (textProp as { text_align?: string }).text_align) as string | undefined;

  // markdown / RAW 已解析的子树 → 渲富文本；否则退回纯文本（字符串 / plain_text）
  const richElements = Array.isArray(textProp.elements) ? (textProp.elements as CardElement[]) : null;
  const childCtx: RenderContext = { ...ctx, textMetrics: { fontSize, lineHeight } };
  const label = richElements && richElements.length
    ? renderElements(richElements, childCtx)
    : (extractPlainText(textEl) || extractText(textEl as never));

  const contentCls = `${CLS}-checker__content`
    + (textAlign === 'right' ? ` ${CLS}-checker__content--right` : '')
    + (textAlign === 'center' ? ` ${CLS}-checker__content--center` : '');
  const contentStyle: Record<string, string> = {
    fontSize: fontSize + 'px',
    lineHeight: lineHeight + 'px',
  };
  if (textColor) contentStyle.color = textColor;

  const checkbox = h(
    overall ? 'span' : 'label',
    { className: `${CLS}-checker__checkbox-container` },
    h('input', {
      type: 'checkbox',
      className: `${CLS}-checker__input`,
      ...(checked ? { checked: '' } : {}),
      ...(disabled ? { disabled: '' } : {}),
    }),
    h('span', { className: `${CLS}-checker__box` }),
  );
  // 真机结构：checker__content → .universal-card-text → 行内子树。
  // 富文本必须包一层，否则 text_tag / 后续文字各自成 flex 子项，行首空格丢失。
  const content = h(
    'span',
    { className: contentCls, style: contentStyle },
    h('span', { className: `${CLS}-text` }, label),
  );

  // button_area：右侧最多 3 个按钮；pc_display_rule=on_hover 时默认隐藏、hover 显示
  const buttonArea = (p.button_area ?? (p as { buttonArea?: unknown }).buttonArea) as
    | { pc_display_rule?: string; pcDisplayRule?: string; buttons?: CardElement[] }
    | undefined;
  const buttons = Array.isArray(buttonArea?.buttons) ? buttonArea!.buttons! : [];
  const autoHide = (buttonArea?.pc_display_rule ?? buttonArea?.pcDisplayRule) === 'on_hover';
  let buttonsVNode: VNode | null = null;
  if (buttons.length) {
    buttonsVNode = h(
      'div',
      {
        className: `${CLS}-checker__buttons` + (autoHide ? ` ${CLS}-checker__buttons--auto-hide` : ''),
        style: { minWidth: (28 * (buttons.length - 1) + 14) + 'px' },
      },
      buttons.map((btn) => h('div', { className: `${CLS}-checker__button` }, renderElements([btn], ctx))),
    );
  }

  // hover 阴影：overall_checkable 或 on_hover 按钮区时启用（对齐引擎 P = h || buttons+OnHover）
  const hoverable = overall || (buttons.length > 0 && autoHide);

  const style: Record<string, string> = {
    [`--${CLS}-checker-line-height`]: lineHeight + 'px',
  };
  if (opacity != null) style['--checker-checked-opacity'] = String(opacity);
  const pad = boxToStyle(p.padding);
  if (pad) style.padding = pad;
  const mar = boxToStyle(p.margin);
  if (mar) style.margin = mar;

  const cls = `${CLS}-checker`
    + (hoverable ? ` ${CLS}-checker--hover` : '')
    + (strike ? ` ${CLS}-checker--strike` : '')
    + (disabled ? ` ${CLS}-checker--disabled` : '');

  const props: Record<string, unknown> = { className: cls, style };

  // overall_checkable：整行包进 <label>，点文字也能切换；否则外层 div，仅 checkbox 可点
  const Tag = overall && !disabled ? 'label' : 'div';
  return h(Tag, props, checkbox, content, buttonsVNode);
});

// at / at_all：@人。优先 property.content → 人员表姓名 → 固定降级名「张三」（不露出 open_id）。
registerComponent('at', (el, ctx) => {
  const p = el.property || {};
  if (p.userID === 'all') {
    return h('span', { className: `${CLS}-markdown-at`, style: { color: NAMED_TEXT_COLOR.blue } }, '@所有人');
  }
  const person = lookupPerson(p.userID, ctx);
  const name = p.content || person?.content || AT_FALLBACK_NAME;
  return h('span', { className: `${CLS}-markdown-at`, style: { color: NAMED_TEXT_COLOR.blue } }, '@' + name);
});
registerComponent('at_all', () =>
  h('span', { className: `${CLS}-markdown-at`, style: { color: NAMED_TEXT_COLOR.blue } }, '@所有人')
);

// link：超链接（url 可能是字符串或多端地址对象）
registerComponent('link', (el) => {
  const p = el.property || {};
  const url = resolveURL(p.url) || resolveURL(p.multiURL) || '#';
  const style = textStyleToStyle(p.textStyle);
  return h('a', { className: `${CLS}-markdown-link`, href: url, target: '_blank', rel: 'noopener', style },
    p.content != null ? String(p.content) : url);
});

// text_tag：彩色标签。色板走 --udtoken-tag-*（半透明底 + 实心字色）。
// 缺省 / 未知色（含非法的 grey）回退 blue，对齐飞书引擎对 text_tag 的默认与容错。
registerComponent('text_tag', (el) => {
  const p = el.property || {};
  const rawColor = (p.color || p.tagStyle || 'blue') as string;
  const colorName = TAG_COLOR[rawColor] ? rawColor : 'blue';
  const c = TAG_COLOR[colorName];
  const style = textTagStyle(p.backgroundColor || c.bg, c.text);
  return h('span', { className: `${CLS}-text-tag ${CLS}-text-tag--${colorName}`, style }, extractText(p.text));
});

// local_datetime：markdown 内联时间戳（#14/D4）。客户端按 milliseconds+formatType+时区渲染，
// 静态渲染器用浏览器本地时区 + Intl 兜底。formatType 为枚举字符串（含 date/time 关键字），
// 识别不出时按「日期+时间」完整输出。
registerComponent('local_datetime', (el) => {
  const p = el.property || {};
  let ms = Number(p.milliseconds ?? p.millisecond ?? p.value ?? 0);
  if (!Number.isFinite(ms) || ms === 0) return null;
  // 真机毫秒；偶发秒级时间戳（< 1e12）自动 ×1000 兜底
  if (ms < 1e12) ms = ms * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  const ft = String(p.formatType || p.format_type || '').toLowerCase();
  const opts: Intl.DateTimeFormatOptions = ft.includes('time') && !ft.includes('date')
    ? { hour: '2-digit', minute: '2-digit', hour12: false }
    : ft.includes('date') && !ft.includes('time')
      ? { year: 'numeric', month: '2-digit', day: '2-digit' }
      : { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false };
  let text: string;
  try {
    text = new Intl.DateTimeFormat('zh-CN', opts).format(d);
  } catch {
    text = d.toLocaleString();
  }
  return h('span', { className: `${CLS}-local-datetime` }, text);
});

// number_tag：markdown 内联数字徽标（#14/D4）。跟随正文字号（ctx.textMetrics，缺省 14px），
// 圆角小胶囊，复用 text_tag blue 色板。plainMode 下客户端降级纯文本——静态渲染无 plainMode，
// 直接输出徽标（与 text_tag 一致）。
registerComponent('number_tag', (el, ctx) => {
  const p = el.property || {};
  const raw = extractText(p.text);
  const text = raw != null && raw !== '' ? raw : (p.content != null ? String(p.content) : '');
  if (text === '') return null;
  const parentFs = ctx.textMetrics?.fontSize ?? BASE_FONT_SIZE;
  const fs = Math.max(11, Math.round(parentFs * 0.85));
  const c = TAG_COLOR.blue;
  const style: Record<string, string> = {
    backgroundColor: c.bg,
    color: c.text,
    fontSize: fs + 'px',
    lineHeight: '1.4',
    padding: '0 4px',
    borderRadius: '4px',
    display: 'inline-flex',
    alignItems: 'center',
    whiteSpace: 'nowrap',
    margin: '0 2px',
    verticalAlign: 'baseline',
  };
  return h('span', { className: `${CLS}-number-tag`, style }, text);
});

// vote-card-select：消息流投票卡片单选项（#24/D14，Tier C 流式组件）。
// 客户端结构（d74b7f67be.js）：.vote-card-select[--voted] > .vote-card-select-content
// + voted 时 .vote-card-select-result（"票数 R%"）+ .vote-card-select-progress 进度条。
// 静态渲染器只渲只读结果态：选项文本 + 百分比 + 进度条；交互（onChange）留空。
// 字段名以常见 RAW 形态兜底（content/text、count/total、percent、voted）。
registerComponent('vote-card-select', (el) => {
  const p = el.property || {};
  const text = extractText(p.text) || (p.content != null ? String(p.content) : '');
  if (!text) return null;
  const voted = p.voted === true || p.isVoted === true || p.selected === true;
  const count = Number(p.count ?? p.voteCount ?? 0) || 0;
  const total = Number(p.total ?? p.totalCount ?? 0) || 0;
  let percent = Number(p.percent ?? p.ratio ?? NaN);
  if (!Number.isFinite(percent)) {
    percent = total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
  }
  const rootCls = `${CLS}-vote-card-select` + (voted ? ` ${CLS}-vote-card-select--voted` : '');
  const kids: Array<ReturnType<typeof h> | null> = [
    h('div', { className: `${CLS}-vote-card-select-content` }, text),
  ];
  if (voted) {
    kids.push(
      h('div', {
        className: `${CLS}-vote-card-select-result`,
        style: { fontSize: '12px', color: '#646a73', marginTop: '2px' },
      }, `${count} 票 ${percent}%`),
      h('div', {
        className: `${CLS}-vote-card-select-progress`,
        style: {
          height: '4px', borderRadius: '2px', background: '#f2f3f5',
          marginTop: '4px', overflow: 'hidden',
        },
      },
        h('div', {
          className: `${CLS}-vote-card-select-progress-bar`,
          style: {
            width: Math.min(100, Math.max(0, percent)) + '%',
            height: '100%', background: '#4e83fd', borderRadius: '2px',
          },
        })),
    );
  }
  return h('div', { className: rootCls, style: { padding: '8px 0' } }, kids);
});

// emoji：飞书表情。short code（key，如 "Fire"）→ 雪碧图名（如 "fire"），
// 渲染成 <i class="larkw-emoji__img--emoji-<name>">，靠单张 CDN 雪碧图 + background-position 出图
// （定位/宽高由 EMOJI_SPRITE_CSS 以 em 给出，随 <i> 的 font-size 缩放）。
// 尺寸 = 所在文字字号 × 行高倍率（引擎 be8b738f：emoji size = s*Z，Z=1.6）。
// 正文默认 14px → 14*1.6 = 22.4px，与网页版原版一致。
// 未知 key 降级为字面 :key:（与飞书一致——不认识的短码原样显示）。
// 14 * 1.6 = 22.4；toFixed 消除浮点尾巴（22.400000000000002）
const EMOJI_FONT_SIZE = Number((BASE_FONT_SIZE * BASE_LINE_HEIGHT).toFixed(2));
registerComponent('emoji', (el, ctx) => {
  const p = el.property || {};
  const key = String(p.key || p.emoji_type || p.code || '');
  const name = EMOJI_KEY_TO_NAME[key];
  if (!name) return h('span', { className: `${CLS}-emoji` }, key ? `:${key}:` : '');
  ensureEmojiSpriteInjected(ctx);
  return h('span', { className: `${CLS}-emoji` },
    h('i', {
      className: `${CLS}-emoji__img larkw-emoji__img--emoji-${name}`,
      style: { fontSize: EMOJI_FONT_SIZE + 'px' },
    })
  );
});

// standard_icon / ud_icon：图标字体。空 <i class="ud-icon_<token>"> 靠字体 :before 出图。
// token 形如 "warning_outlined"；size 走 ICON_SIZE_MAP（默认 16px），color 走 ICON_COLOR_MAP
// 或直接 #/rgb 直值；缺/未知 color 不输出，继承父级文字色（currentColor）。
// _colorful 结尾的彩色图标字体自带色，不覆盖 color。
// 两种形态：standard_icon 的 color/size 直接挂 property；ud_icon 把它们嵌在 property.style 里。

/** RAW 图标尺寸（widthValue/heightValue，或 "12px"/12）→ px */
function iconPixelSize(v: unknown): number | undefined {
  if (typeof v === 'number') return v > 0 ? v : undefined;
  if (typeof v === 'string') {
    const m = /^(\d+(?:\.\d+)?)(?:px)?/.exec(v.trim());
    return m ? Number(m[1]) : undefined;
  }
  if (isRecord(v)) {
    if (typeof v.value === 'number') return v.value > 0 ? v.value : undefined;
    if (typeof v.value === 'string') return iconPixelSize(v.value);
  }
  return undefined;
}

/**
 * 父级字号 → 图标默认尺寸（真机引擎 j()，见 be8b738f）。
 * 折叠面板 / markdown 的前置图标在没有显式像素尺寸时会用它，而不是死回 16px：
 *   ≤16 → 字号 +2（12→14、14→16、16→18）
 *   >16 → 1.15 倍后向上取偶数（18→22、20→24、24→28）
 * 之前固定 16px，标题字号小于 14 的面板（notation / small）箭头比真机大一圈。
 */
function iconDefaultSize(fontSize: number): number {
  if (!Number.isFinite(fontSize) || fontSize <= 0) return 16;
  if (fontSize <= 16) return fontSize + 2;
  const scaled = Math.round(fontSize * 1.15);
  return scaled % 2 === 0 ? scaled : scaled + 1;
}

/**
 * @param defaultSize 父级给出的图标默认尺寸（真机 extraProperty.defaultSize）。
 *   优先级对齐真机 icon 组件：RAW widthValue/heightValue > 像素串 size >
 *   defaultSize > size 枚举 > 16。注意 defaultSize 存在时 size 枚举会被忽略——
 *   真机就是如此（`else if (widthValue || heightValue || !defaultSize)`）。
 */
function renderIcon(el: CardElement, ctx: RenderContext, defaultSize?: number) {
  const p = el.property || {};
  // token 字段名：RAW 用 token；个别形态用 key（与 emoji 同字段名兼容取值）
  const token = String(p.token || p.key || '').trim();
  if (!token) return null;
  ensureIconFontInjected(ctx);
  // ud_icon 形态把 color/size 收进 property.style；standard_icon 直接挂 property。
  const inner = (p.style && typeof p.style === 'object' ? p.style : {}) as { color?: unknown; size?: unknown };
  const sizeKey = String(p.size ?? inner.size ?? '');
  const colorRaw = typeof p.color === 'string' ? p.color
    : (typeof inner.color === 'string' ? inner.color : '');
  const style: Record<string, string> = {};
  // RAW 里精确尺寸在 widthValue/heightValue（{type:'pixels',value:N}），
  // 编辑器直出/DSL 则是 "10px 10px" 像素串。两种都认。
  const widthPx = iconPixelSize(p.widthValue);
  const heightPx = iconPixelSize(p.heightValue);
  const pixelStringPx = /^\d/.test(sizeKey)
    ? Number(/^(\d+(?:\.\d+)?)/.exec(sizeKey)![1])
    : undefined;
  const enumPx = ICON_SIZE_MAP[sizeKey];
  let boxW: number;
  let boxH: number;
  if (widthPx != null || heightPx != null) {
    // 只给单边时另一边回退 size 枚举/16（真机行为），字号取两边较小值
    const fallback = enumPx ?? 16;
    boxW = widthPx ?? fallback;
    boxH = heightPx ?? fallback;
  } else if (pixelStringPx != null) {
    boxW = boxH = pixelStringPx;
  } else if (defaultSize != null) {
    boxW = boxH = defaultSize;
  } else {
    boxW = boxH = enumPx ?? 16;
  }
  style.fontSize = Math.min(boxW, boxH) + 'px';
  style.width = boxW + 'px';
  style.height = boxH + 'px';
  if (!token.endsWith('_colorful')) {
    // 命名色：ICON_COLOR_MAP（含 indigo/wathet 等）→ paletteColor（indigo-500）→ #/rgb 直值
    const c = ICON_COLOR_MAP[colorRaw]
      || paletteColor(colorRaw)
      || (/^#|^rgb/i.test(colorRaw) ? colorRaw : '');
    if (c) style.color = c;
  }
  return h('i', { className: `${CLS}-icon ud-icon_${token}`, style });
}
registerComponent('standard_icon', renderIcon);
registerComponent('ud_icon', renderIcon);

// ---- 人员 person_v1 / person_list ----
// 两者都走模块级 renderPersonChip：无人员表时统一降级为固定头像 +「赵天雄」。
// 不再优先走元素自带的纯文本 fallback——离线预览要与表格 persons 列观感一致。

// person_v1：单个人员
registerComponent('person_v1', (el, ctx) => {
  const p = el.property || {};
  return renderPersonChip(p.userID, p, ctx);
});

/** avatar：仅头像。尺寸枚举 tiny/small/medium/large/huge；custom 时用 customSize(px)。 */
const AVATAR_SIZE_PX: Record<string, number> = {
  tiny: 16,
  small: 24,
  medium: 32,
  large: 40,
  huge: 48,
};

registerComponent('avatar', (el, ctx) => {
  const p = el.property || {};
  const userID = (p.userID || (p as { user_id?: string }).user_id) as string | undefined;
  const sizeKey = String(p.size ?? 'medium');
  const custom =
    typeof p.customSize === 'number'
      ? p.customSize
      : typeof (p as { custom_size?: number }).custom_size === 'number'
        ? (p as { custom_size: number }).custom_size
        : undefined;
  const px =
    sizeKey === 'custom' && typeof custom === 'number' && custom > 0
      ? custom
      : AVATAR_SIZE_PX[sizeKey] || AVATAR_SIZE_PX.medium;
  const { name, src } = resolvePersonDisplay(userID, ctx);
  return h('div', { className: `${CLS}-avatar`, title: name },
    renderAvatarNode(`${CLS}-avatar__img`, px, src, name),
  );
});

/** collapse_divider：折叠面板内部分割线 */
registerComponent('collapse_divider', () =>
  h('div', { className: `${CLS}-collapse-divider` }),
);

/** fallback_text：兜底文案元素 */
registerComponent('fallback_text', (el, ctx) => {
  const p = el.property || {};
  const textEl = p.text as CardElement | undefined;
  if (textEl && typeof textEl === 'object' && textEl.tag) {
    return h('div', { className: `${CLS}-fallback-text` }, renderElement(textEl, ctx));
  }
  const content = extractPlainText(p.text);
  if (!content) return null;
  return h('div', { className: `${CLS}-fallback-text` }, content);
});

// person_list：按 showAvatar/showName 分四态（逆向网页版 PersonList）
//   仅名字：蓝色姓名 + 全角逗号
//   名字+头像：avatar-name 组合，可 lines 折行
//   名字+头像+icon：左侧图标 + 组合列表
//   头像葫芦串：叠放 Avatar.Group（showName=false && showAvatar）
registerComponent('person_list', (el, ctx) => {
  const p = el.property || {};
  const list = Array.isArray(p.persons) ? p.persons : [];
  if (!list.length) return null;

  const ids = list.map((x) => (typeof x === 'string' ? x : x?.id)).filter(Boolean) as string[];
  if (!ids.length) return null;

  const showAvatar = !!p.showAvatar;
  const showName = !!p.showName;
  const nameOnly = !showAvatar;
  const avatarOnly = !showName && showAvatar;
  const combine = showName && showAvatar;

  const sizeKey = String(p.size ?? 'medium');
  const token = PERSON_LIST_SIZE[sizeKey] || PERSON_LIST_SIZE.medium;
  const avatarPx = token.avatar_size;
  const fontSize = token.name_font_size;
  const lineHeight = token.name_line_height;
  const colGap = token.name_avatar_column_gap ?? 12;
  const rowGap = token.name_avatar_row_gap ?? 4;
  const lines = typeof p.lines === 'number' && p.lines > 0 ? p.lines : undefined;

  // 前置图标（icon / udIcon）
  const iconEl = (p.icon || p.udIcon) as CardElement | undefined;
  let iconNode: ReturnType<typeof h> | null = null;
  if (iconEl && typeof iconEl === 'object' && iconEl.tag) {
    const rendered = renderElement(iconEl, ctx);
    if (rendered) {
      const iconStyle: Record<string, string> = { fontSize: fontSize + 'px' };
      if (showAvatar) iconStyle.height = avatarPx + 'px';
      if (nameOnly) iconStyle.lineHeight = lineHeight + 'px';
      iconNode = h('div', { className: `${CLS}-person-list__icon`, style: iconStyle }, rendered);
    }
  }

  const contentStyle: Record<string, string> = { fontSize: fontSize + 'px' };
  if (lines) contentStyle.WebkitLineClamp = String(lines);
  if (combine) {
    contentStyle.gap = `${rowGap}px ${colGap}px`;
  }
  if (nameOnly) contentStyle.lineHeight = lineHeight + 'px';

  const contentCls = [
    `${CLS}-person-list__content`,
    lines ? `${CLS}-person-list__content--lines` : '',
    combine ? `${CLS}-person-list__content--combine` : '',
  ].filter(Boolean).join(' ');

  let contentChildren: Array<ReturnType<typeof h> | string | null>;

  if (combine) {
    contentChildren = ids.map((id) => {
      const { name, unknown } = resolvePersonDisplay(id, ctx);
      const nameCls = [
        `${CLS}-person-list__reaction-user`,
        unknown ? `${CLS}-person-list__reaction-user--disabled` : '',
      ].filter(Boolean).join(' ');
      return h('div', { className: `${CLS}-person-list__avatar-name` },
        renderPersonListAvatar(id, avatarPx, ctx),
        h('span', { className: nameCls },
          h('span', { className: `${CLS}-person-list__reaction-user__name` }, name)
        )
      );
    });
  } else if (nameOnly && showName) {
    contentChildren = ids.map((id, i) => {
      const { name, unknown } = resolvePersonDisplay(id, ctx);
      const nameCls = [
        `${CLS}-person-list__reaction-user`,
        `${CLS}-person-list__reaction-user--blue`,
        unknown ? `${CLS}-person-list__reaction-user--disabled` : '',
      ].filter(Boolean).join(' ');
      return h('span', { className: nameCls },
        h('span', { className: `${CLS}-person-list__reaction-user__name` }, name),
        i < ids.length - 1
          ? h('span', { className: `${CLS}-person-list__reaction-user__comma` }, PERSON_LIST_COMMA)
          : null
      );
    });
  } else if (avatarOnly) {
    // 葫芦串：spacing=-size/4；除最后一颗外套 hollow-out mask（不用白描边）
    const overlap = Math.round(avatarPx / 4);
    const mask = personAvatarHollowMask(avatarPx, overlap);
    const last = ids.length - 1;
    contentChildren = [
      h('div', { className: `${CLS}-person-list__avatar-group` },
        ids.map((id, i) => {
          const style: Record<string, string> = {
            width: avatarPx + 'px',
            height: avatarPx + 'px',
          };
          if (i > 0) style.marginLeft = -overlap + 'px';
          // 真机给「非末位」头像加 hollow-out mask，挖出给下一颗叠入的月牙
          if (i < last) {
            style.mask = mask;
            style.WebkitMask = mask;
          }
          return h('span', {
            className: `${CLS}-person-list__avatar-group-item`,
            style,
          }, renderPersonListAvatar(id, avatarPx, ctx));
        })
      ),
    ];
  } else {
    // showName/showAvatar 皆假：无可见内容
    return null;
  }

  return h('div', { className: `${CLS}-person-list` },
    iconNode,
    h('div', { className: contentCls, style: contentStyle }, contentChildren)
  );
});

// ---- markdown 子元素 ----

// heading：标题，level 决定字号
registerComponent('heading', (el, ctx) => {
  const p = el.property || {};
  const lv = HEADING_LEVELS[p.level as number] || HEADING_LEVELS[3];
  const style = {
    fontSize: lv.fontSize + 'px',
    fontWeight: String(lv.fontWeight),
    lineHeight: lv.lineHeight + 'px',
    marginTop: lv.marginTop + 'px',
    marginBottom: lv.marginBottom + 'px',
  };
  const childCtx: RenderContext = {
    ...ctx,
    textMetrics: { fontSize: lv.fontSize, lineHeight: lv.lineHeight },
  };
  return h('div', { className: `${CLS}-markdown-heading`, style }, renderElements(p.elements, childCtx));
});

// blockquote：引用块
registerComponent('blockquote', (el, ctx) =>
  h('div', { className: `${CLS}-blockquote` }, renderElements(el.property?.elements, ctx))
);

// list：有序/无序列表。
// 结构对齐网页版（feishu-web-dump 320657bc.js 的 List 组件）：每个 item 自己是一个
// `<ul class="...__ul">` / `<ol class="...__ol">`，里面一个 `<li data-marker>`：
//   - 层级缩进落在 ul/ol 的 margin-left:24*level；
//   - 无序项目符号由 li::before 画（•/◦/▪ 轮替），li 左侧留 22px，
//     符号右对齐到距正文 20px 处——不能自己拼一个 marker span + gap，
//     那样符号会紧贴文字（真机的符号离文字更远，且字号固定 14px）。
registerComponent('list', (el, ctx) => {
  const p = el.property || {};
  const items = p.items || [];
  return h('div', { className: `${CLS}-markdown-list` },
    items.map((item, i) => {
      const ordered = (item.type || '').toLowerCase() === 'ol' || item.ordered === true;
      const level = item.level || 0;
      // data-marker：无序为 0/1/2（对应 •/◦/▪）；有序为带序号的字符串（CSS attr 回显）。
      let marker: string;
      if (ordered) {
        const fn = ORDER_STYLES[level % ORDER_STYLES.length];
        marker = fn(item.order != null ? item.order : i + 1) + '.';
      } else {
        marker = String(level % 3);
      }
      const tag = ordered ? 'ol' : 'ul';
      return h(tag, {
        className: `${CLS}-markdown-list__${tag}`,
        style: { marginLeft: 24 * level + 'px' },
      },
        h('li', { 'data-marker': marker },
          h('div', { className: `${CLS}-markdown-list__li-content` }, renderElements(item.elements, ctx))
        )
      );
    })
  );
});

// code_span：行内代码
registerComponent('code_span', (el) => {
  const p = el.property || {};
  return h('code', { className: `${CLS}-code-span` }, p.content != null ? String(p.content) : '');
});

  // code_block：代码块
  registerComponent('code_block', (el) => {
    const p = el.property || {};
    const lines = (p.contents || []).map((line) =>
      (line.contents || []).map((seg) => seg.content).join(''));
    return h('pre', { className: `${CLS}-markdown-code-block` }, h('code', {}, lines.join('\n')));
  });

  // ---- chart：图表 ----
  // 网页版飞书用 VChart 画到 <canvas>。本渲染器保持同步「输出字符串/DOM」，无法在渲染期跑
  // VChart，故只输出一个挂载容器：把 VChart 规格塞进 data-feishu-chart-spec，真正画图交给
  // 运行期水合（chart-hydrate.ts：浏览器 hydrateFeishuCharts / SSR feishuChartHydrateScript）。
  // chart_spec 本身即合法 VChart spec，原样透传。
  // 尺寸对齐飞书：height 为 Npx 时固定高度并忽略宽高比；否则走 aspect_ratio（缺省 16:9）。
  registerComponent('chart', (el) => {
    const p = el.property || {};
    const spec = (p.chart_spec || p.chartSpec) as Record<string, unknown> | undefined;
    const style = resolveChartBoxStyle(p, spec);
    const props: Record<string, unknown> = { className: `${CLS}-chart`, style };
    // 无 spec：渲染占位框（与图片占位同风格）。
    if (!spec || typeof spec !== 'object') {
      return h('div', { className: `${CLS}-chart`, style },
        h('div', { className: `${CLS}-chart__placeholder` }, '[图表]'));
    }
    // spec 存进属性，供水合脚本读取。序列化失败则退化为占位。
    let specJson = '';
    try { specJson = JSON.stringify(spec); } catch { specJson = ''; }
    if (!specJson) {
      return h('div', { className: `${CLS}-chart`, style },
        h('div', { className: `${CLS}-chart__placeholder` }, '[图表]'));
    }
    props[CHART_SPEC_ATTR] = specJson;
    return h('div', props,
      // __vchart：VChart 的挂载点（renderSync 会往里塞 canvas）。未水合前显示 loading 占位。
      h('div', { className: `${CLS}-chart__vchart` },
        h('div', { className: `${CLS}-chart__loading` }, '图表加载中…'))
    );
  });

  // ---- table：表格 ----
  // 语义 <table>：colgroup 定列宽、thead 表头（header_style 控背景/加粗/对齐）、tbody 行。
  // 单元格按列 data_type 渲染：text/number（format.precision 定小数位）走纯文本；
  // options（值为 [{text,color}]）渲染成彩色 text_tag 标签；
  // markdown / lark_md（字符串或已解析的 markdown 元素树）走 markdown 渲染。
  // 关键对齐点（逆向自网页版客户端 Ol()/Rl()/al()）：
  //   1) 行高决定单元格文本最大行数（low 1 / middle 2 / high 3，像素行高按阈值），
  //      文本不换行撑高行，超出用省略号截断；row_height=auto 则不截断、内容可滚动。
  //   2) 列宽固定（table-layout:fixed）+ 未写宽度的列最小 128px，空间不够横向滚动。
  //   3) td/th 自身不加内边距，内边距在内容层（表体 0 8px / 表头 6px 8px）。
  // page_size：预览只「显示前 N 行」，不做真实分页控件。
  registerComponent('table', (el, ctx) => {
    const p = el.property || {};
    // 列定义：DSL 用 snake_case（data_type/display_name/horizontal_align/width），
    // 真机 RAW 用 camelCase（dataType/displayName/horizontalAlign/widthValue）——归一成统一形态。
    const columns = (Array.isArray(p.columns) ? p.columns : []).map(normalizeColumn);
    const rows = (Array.isArray(p.rows) ? p.rows : []) as Array<Record<string, unknown>>;
    const hs = (p.header_style || p.headerStyle || {}) as TableHeaderStyle;
    // 行高 / 单元格文本行数（缺省 low → 32px / 1 行，与真机默认一致）。
    const metrics = resolveTableRowMetrics(p);
    // page_size 只作正整数「显示前 N 行」；0/负数/非数视为不限制（避免 slice(0,0) 清空全表）。
    const pageSizeRaw = typeof p.page_size === 'number' ? p.page_size : (typeof p.pageSize === 'number' ? p.pageSize : undefined);
    const pageSize = typeof pageSizeRaw === 'number' && pageSizeRaw > 0 ? pageSizeRaw : undefined;
    const shownRows = pageSize != null ? rows.slice(0, pageSize) : rows;

    // 表头样式：DSL background_style/text_align/text_color/text_size/lines；RAW 对应 camelCase。
    // 真机把表头单元格当 PlainText 渲染（textStyle: bold/size/color/customColor，见
    // feishu-web-dump/debugger/1dac9008…js 的 nl()）——text_color 走正文色名解析
    // （grey → N600 #646a73），不是表格专用色；之前整个忽略，表头永远写死 #1f2329（偏蓝黑）。
    const headBg = TABLE_HEAD_BG[String(hs.background_style ?? (hs as { backgroundStyle?: string }).backgroundStyle ?? 'none')] ?? 'transparent';
    // 表头对齐只看 header_style.text_align；缺省时按列 data_type 兜底（number → right，其余 left）。
    // 真机 antd 列定义里 `align = headerStyle.textAlign || (dataType==='number' ? right : left)`，
    // 列的 horizontalAlign 只影响表体单元格（`row-item` 自己的 align），不参与表头。
    // 之前写成 `column.horizontal_align || headAlign`，导致列一旦写了 horizontal_align，
    // header_style.text_align 就整列失效（常见卡片每列都带 horizontal_align → 换值无任何变化）。
    const headAlign = (hs.text_align ?? (hs as { textAlign?: string }).textAlign) as string | undefined;
    const headBold = hs.bold !== false; // 默认加粗
    const headSizeKey = String(hs.text_size ?? (hs as { textSize?: string }).textSize ?? 'normal');
    const headFontSize = TEXT_SIZE_MAP[headSizeKey] ?? TEXT_SIZE_MAP.normal;
    const headColorRaw = (hs.text_color ?? (hs as { textColor?: string }).textColor) as string | undefined;
    const headColor = headColorRaw && headColorRaw !== 'default'
      ? (resolveColor(headColorRaw) || NAMED_TEXT_COLOR[headColorRaw as never])
      : undefined;
    // 表头最大行数：缺省 1 行（真机 headerStyle.linesValue 缺省 int_number 1），超出省略号。
    const headLines = resolveHeaderLines(hs);
    const headTextStyle: Record<string, string> = { fontSize: `${headFontSize}px` };
    if (headColor) headTextStyle.color = headColor;
    if (headLines != null && headLines > 1) Object.assign(headTextStyle, lineClampStyle(headLines));

    // 列宽：显式 px / 百分比落到 <col>，未写宽度的列由 table-layout:fixed 均分。
    // 真机给自适应列的下限是 128px：空间不够时表格横向撑开 + 滚动，而不是把列压窄。
    const widthSpecs = columns.map((c) => parseColumnWidth(c.width));
    const cols = widthSpecs.map((w) => (w.css ? h('col', { style: { width: w.css } }) : h('col', {})));
    const autoCols = widthSpecs.filter((w) => w.kind === 'auto').length;
    const fixedPx = widthSpecs.reduce((sum, w) => sum + (w.px || 0), 0);
    const pctSum = widthSpecs.reduce((sum, w) => sum + (w.pct || 0), 0);
    const minTableWidth = autoCols > 0 ? Math.round(fixedPx + autoCols * TABLE_COLUMN_MIN_WIDTH) : 0;
    // 表宽（客户端 Fl()）：只要有自适应列就占满 100%；
    // 列宽全写成 px/% 时，真机把表宽收紧到「列宽之和 + 每列 1px 边框」，超过容器才退化成 100%。
    // 宽度落在最外层容器上（真机边框是贴着表格的，不是整卡宽），表格本身保持 100%；
    // 固定列总宽超过容器时，fixed 布局的 MIN 规则会把表格撑宽 → 横向滚动条。
    // 之前一律 width:100%，固定列多的表会被拉宽，文本截断位置比真机靠后很多。
    const tableWidth = autoCols === 0 && columns.length > 0
      ? `min(100%, calc(${Math.round(fixedPx)}px + ${Math.round(pctSum * 100) / 100}% + ${columns.length}px))`
      : undefined;

    // thead
    const headCells = columns.map((c) => {
      const align = headAlign ?? defaultColumnAlign(c);
      return h('th', {
        className: `${CLS}-table__th`,
        style: { textAlign: align, backgroundColor: headBg },
      },
        h('span', {
          className: `${CLS}-table__th-text${headBold ? ` ${CLS}-table__th-text--bold` : ''}${headLines === 1 ? ` ${CLS}-table__line-1` : ''}`,
          style: headTextStyle,
        }, String(c.display_name ?? c.name ?? ''))
      );
    });

    // tbody
    const bodyRows = shownRows.map((row) =>
      h('tr', { className: `${CLS}-table__row` },
        columns.map((c) => {
          // 表体：列 horizontal_align 优先，缺省按 data_type 兜底（number → right）。
          const align = c.horizontal_align ?? defaultColumnAlign(c);
          const tdStyle: Record<string, string> = { textAlign: align };
          if (metrics.heightPx != null) tdStyle.height = `${metrics.heightPx}px`;
          return h('td', {
            className: `${CLS}-table__td`,
            style: tdStyle,
          },
            h('div', {
              className: `${CLS}-table__cell${metrics.auto ? ` ${CLS}-table__cell--auto` : ''}`,
              style: { justifyContent: alignToFlex(align), maxHeight: `${metrics.maxHeightPx}px` },
            }, renderCell(unwrapCellValue(row[c.name]), c, ctx, metrics.lines))
          );
        })
      )
    );

    return h('div', {
      className: `${CLS}-table`,
      style: tableWidth ? { width: tableWidth } : undefined,
    },
      h('div', { className: `${CLS}-table__scroll` },
        h('table', {
          className: `${CLS}-table__table`,
          style: minTableWidth ? { minWidth: `${minTableWidth}px` } : undefined,
        },
          h('colgroup', {}, cols),
          h('thead', { className: `${CLS}-table__thead` },
            h('tr', {}, headCells)),
          h('tbody', { className: `${CLS}-table__tbody` }, bodyRows)
        )
      )
    );
  });
}

/**
 * 列定义归一：抹平 DSL（snake_case）与真机 RAW（camelCase）差异，产出统一的 TableColumn。
 * - data_type ← dataType；display_name ← displayName；horizontal_align ← horizontalAlign
 * - width ← widthValue（RAW 用 {type,value}：pixels 取 value 数字，percent 转 "N%"，
 *   builtin_table_column_width:auto / 未知归为 'auto'）
 */
function normalizeColumn(raw: unknown): TableColumn {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const wv = c.widthValue as { type?: string; value?: number | string } | undefined;
  let width: TableColumn['width'];
  if (c.width != null) {
    width = c.width as TableColumn['width'];
  } else if (wv && typeof wv === 'object') {
    // pixels → 数字定宽；percent → "N%"（客户端按百分比算列宽）；
    // 其余（builtin_table_column_width:'auto' / 权重）→ 自适应
    width = wv.type === 'pixels' && typeof wv.value === 'number'
      ? wv.value
      : wv.type === 'percent' && typeof wv.value === 'number'
        ? `${wv.value}%`
        : 'auto';
  }
  return {
    name: String(c.name ?? ''),
    display_name: (c.display_name ?? c.displayName) as string | undefined,
    data_type: (c.data_type ?? c.dataType) as string | undefined,
    horizontal_align: (c.horizontal_align ?? c.horizontalAlign) as TableColumn['horizontal_align'],
    width,
    format: (c.format ?? c.formatValue) as TableColumn['format'],
  };
}

/**
 * 单元格值拆包：真机 RAW 把每格包成 { data: <值> }（值可能是字符串 / [{text,color}] / 子元素）。
 * DSL 则直接是裸值。这里统一剥到裸值：命中 { data } 形态取 .data，否则原样返回。
 */
function unwrapCellValue(v: unknown): unknown {
  if (v && typeof v === 'object' && !Array.isArray(v) && 'data' in (v as Record<string, unknown>)) {
    return (v as { data: unknown }).data;
  }
  return v;
}

/** 列宽规格：px 列参与 min-width / 表宽累加，percent 交给 CSS，auto 由 table-layout:fixed 均分 */
interface ColumnWidthSpec {
  kind: 'auto' | 'px' | 'percent';
  /** <col> 的 width 值；auto 为空串（不写宽度） */
  css: string;
  /** px 列的数值（min-width / 表宽累加用） */
  px?: number;
  /** percent 列的百分比数值（表宽累加用） */
  pct?: number;
}

/**
 * 列宽归一：数字 / "120px" / "120" → px；"30%" → percent；
 * "auto" / 空 / 未知单位 → auto（不写宽，由 fixed 布局均分剩余空间）。
 * 真机把 pixels 列的宽度写进 <col>，percent 列按表格宽百分比算，auto 列取剩余均分。
 */
function parseColumnWidth(w: TableColumn['width']): ColumnWidthSpec {
  if (typeof w === 'number') {
    return Number.isFinite(w) && w > 0 ? { kind: 'px', css: `${w}px`, px: w } : { kind: 'auto', css: '' };
  }
  const s = String(w ?? '').trim();
  if (!s || s.toLowerCase() === 'auto') return { kind: 'auto', css: '' };
  const pct = /^(\d+(?:\.\d+)?)%$/.exec(s);
  if (pct) return { kind: 'percent', css: `${pct[1]}%`, pct: Number(pct[1]) };
  const px = /^(\d+(?:\.\d+)?)(?:px)?$/i.exec(s);
  if (px) return { kind: 'px', css: `${px[1]}px`, px: Number(px[1]) };
  return { kind: 'auto', css: '' };
}

/** 表格行高度量（对齐客户端 Vl()/al()：行高同时决定 td 高度与单元格文本行数） */
interface TableRowMetrics {
  /** td 的 CSS height；自动行高（row_height=auto）时为 null（不设高度） */
  heightPx: number | null;
  /** 单元格内容最大高度（真机 row-item-wrapper 的 max-height） */
  maxHeightPx: number;
  /** 单元格文本最大行数；undefined = 不截断 */
  lines?: number;
  /** 自动行高：内容保留滚动，不截断 */
  auto: boolean;
}

/**
 * 解析表格行高 → { td 高度, 内容最大高度, 文本行数 }。
 * - RAW `rowHeightValue:{type:'builtin_table_row_height',value:'low'|'middle'|'high'}` → 32/54/88px，1/2/3 行
 * - RAW `rowHeightValue:{type:'pixels',value:N}` / DSL `row_height:'48px'` → N px，行数按阈值
 * - RAW `rowHeightValue:{type:'builtin_table_row_height_extension'}` / DSL `row_height:'auto'`
 *   → 不设 td 高度、内容最大 124px（row_max_height 可覆盖）、文本不截断
 * - 缺省 → low（客户端默认 rowHeightValue = {builtin_table_row_height, low}）
 */
function resolveTableRowMetrics(p: ElementProperty): TableRowMetrics {
  const rhv = isRecord(p.rowHeightValue) ? (p.rowHeightValue as { type?: string; value?: number | string }) : undefined;
  const rawType = String(rhv?.type ?? '').toLowerCase();
  const rawValue = rhv?.value;
  const direct = p.row_height ?? p.rowHeight;
  const directKey = typeof direct === 'string' ? direct.trim().toLowerCase() : '';

  // 自动行高：内容铺开，超过 max-height 滚动（真机 --auto 样式）
  if (
    rawType === 'builtin_table_row_height_extension'
    || String(rawValue ?? '').toLowerCase() === 'auto'
    || directKey === 'auto'
  ) {
    return { heightPx: null, maxHeightPx: resolveTableRowMaxHeight(p) ?? TABLE_ROW_MAX_HEIGHT, auto: true };
  }

  // 自定义像素行高：RAW {type:'pixels',value:N} / DSL '48px'、'48'、48
  let px: number | undefined;
  if (rawType === 'pixels') px = Number(rawValue);
  else if (typeof direct === 'number') px = direct;
  else if (directKey) {
    const m = /^(\d+(?:\.\d+)?)(?:px)?$/.exec(directKey);
    if (m) px = Number(m[1]);
  }
  if (px != null && Number.isFinite(px) && px > 0) {
    const h = Math.round(px);
    return { heightPx: h, maxHeightPx: h, lines: tableLinesForRowHeightPx(h), auto: false };
  }

  // 内建枚举：缺省/未知都落 low（不落 middle——真机默认就是 low，单行 + 省略号）
  const rawKey = String(rawValue ?? direct ?? '').trim().toLowerCase();
  const key = TABLE_ROW_HEIGHT[rawKey] != null ? rawKey : 'low';
  const heightPx = TABLE_ROW_HEIGHT[key];
  return {
    heightPx,
    maxHeightPx: heightPx,
    lines: TABLE_ROW_HEIGHT_LINES[key] ?? 1,
    auto: false,
  };
}

/** row_max_height：DSL 直接值 / RAW rowMaxHeightValue:{type,value} → px */
function resolveTableRowMaxHeight(p: ElementProperty): number | undefined {
  const direct = p.row_max_height ?? p.rowMaxHeight;
  const valueObj = isRecord(p.rowMaxHeightValue)
    ? (p.rowMaxHeightValue as { type?: string; value?: number | string })
    : undefined;
  const css = resolveDimensionPx(direct, valueObj);
  if (!css) return undefined;
  const n = Number.parseFloat(css);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

/**
 * 表头最大行数。真机 HeaderStyle.linesValue：缺省 int_number 1；
 * `full_displayed`（builtin_table_header_lines）表示不限行数 → undefined。
 */
function resolveHeaderLines(hs: TableHeaderStyle): number | undefined {
  const raw = (hs as Record<string, unknown>).lines ?? (hs as Record<string, unknown>).linesValue;
  const v = isRecord(raw) ? (raw as { value?: unknown }).value : raw;
  if (v == null) return 1;
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return undefined;
}

/**
 * 单元格文本截断（真机 PlainText 的 `universal-card-text--line-1` / `--line-N`）：
 * lines=1 → 单行 nowrap + 省略号；lines>1 → -webkit-line-clamp；undefined（自动行高）→ 不截断。
 * 行为要点：文本不会换行把行撑高，超出部分一律「…」收尾。
 */
function clampTableCell(content: string | VNode, lines?: number): string | VNode {
  if (content === '' || lines == null) return content;
  const n = Math.max(1, Math.floor(lines));
  return h('div', {
    className: n === 1 ? `${CLS}-table__line-1` : `${CLS}-table__lines`,
    style: n === 1 ? undefined : { WebkitLineClamp: String(n) },
  }, content);
}

/** 列的默认对齐（真机：number 列靠右，其余靠左）——表头与表体的兜底都用它 */
function defaultColumnAlign(c: TableColumn): string {
  return c.data_type === 'number' ? 'right' : 'left';
}

/** 水平对齐 → flex 主轴（单元格内容用 flex 排布，才能让标签也跟对齐走） */
function alignToFlex(align: string): string {
  return ({ left: 'flex-start', center: 'center', right: 'flex-end' } as Record<string, string>)[align] || 'flex-start';
}

/** 从任意文本节点/字符串里抽纯文字（只用于 table options 的标签文案） */
function optionText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(optionText).join('');
  if (!isRecord(value)) return '';
  // 驼峰/扁平 DSL：{ tag:'plain_text', content } / { content }
  if (typeof value.content === 'string' || typeof value.content === 'number') {
    return String(value.content);
  }
  // RAW 文本叶子：{ tag, property:{ content } }
  const prop = isRecord(value.property) ? value.property : undefined;
  if (prop) {
    if (typeof prop.content === 'string' || typeof prop.content === 'number') {
      return String(prop.content);
    }
    if (prop.text != null) return optionText(prop.text);
    if (Array.isArray(prop.elements)) return optionText(prop.elements);
  }
  if (value.text != null) return optionText(value.text);
  return '';
}

/**
 * options 单元格里的单项 → { text, color }。
 * 真机 table 把每项包成 PlainText({content: e.text}) 后交给 TextTag，所以正常形态是
 * {text:'S2',color:'blue'}；但历史的编辑器直出/模型生成卡片会把 text 写成文本节点、
 * 或整项写成 text_tag 元素（{tag:'text_tag',property:{text,color}}），之前直接
 * String(opt.text) 会得到空串或 "[object Object]"，标签内容就丢了。
 */
function normalizeTableOption(opt: unknown): { text: string; color?: string } {
  if (typeof opt === 'string' || typeof opt === 'number' || typeof opt === 'boolean') {
    return { text: String(opt) };
  }
  if (!isRecord(opt)) return { text: '' };
  const prop = isRecord(opt.property) ? opt.property : undefined;
  const color = typeof opt.color === 'string' ? opt.color
    : typeof opt.tagStyle === 'string' ? opt.tagStyle
      : typeof prop?.color === 'string' ? prop.color
        : undefined;
  const candidates = [opt.text, opt.content, opt.label, opt.name, prop?.text, prop?.content];
  for (const c of candidates) {
    const text = optionText(c);
    if (text !== '') return { text, color };
  }
  return { text: '', color };
}

/**
 * 单元格内容：按列 data_type 渲染。
 * - options：值形如 [{text,color}]（也兼容官方文档里的单个字符串 / 单个对象），
 *   每项渲染成表格专用的彩色标签。
 * - persons：值为 open_id 字符串数组（或 {id}），每人一颗人员胶囊（无人员表时走 PERSON_FALLBACK_*）。
 * - number：按 format.precision 定小数位。
 * - markdown / lark_md：字符串走 parseMarkdown；RAW 已是 markdown 元素树则直接渲。
 * - 其余（text/…）：转成字符串纯文本。
 *
 * lines 是行高换算出的单元格文本最大行数（见 resolveTableRowMetrics）：
 * 真机只把 1/N 行写进文本组件做截断，不靠外层裁切。自动行高（undefined）不截断。
 */
function renderCell(value: unknown, col: TableColumn, ctx: RenderContext, lines?: number): ReturnType<typeof h> | string {
  const type = col.data_type || 'text';

  // options：官方文档允许三种写法——
  //   "name": "option"                          单个默认样式标签
  //   "name": { "text": "S2", "color": "blue" } 单个自定义标签
  //   "name": [{ "text": "S2", "color": "blue" }] 多个标签
  // 真机 RAW 还会把整个值包成 { data: … }（unwrapCellValue 已在上游剥掉）。
  // text 在编辑器直出/部分 RAW 里可能是 plain_text 节点而不是字符串——之前直接
  // String(opt.text) 会得到空串/[object Object]，标签就只剩一个空壳；颜色也错用了
  // 正文 text_tag 的半透明色板（表格应是 X100 实心底 + text-title 深色字）。
  if (type === 'options' && value != null) {
    const opts = Array.isArray(value) ? value : [value];
    const chips = opts
      .map((opt) => normalizeTableOption(opt))
      .filter((opt) => opt.text !== '')
      .map((opt) => {
        // 真机 table 标签查 `<color>_table`；只登记了 11 色，其余（含 grey/indigo/
        // violet）与缺省一样回退成普通蓝色 text_tag。
        const colorName = opt.color ? String(opt.color) : 'blue';
        const tableColor = TABLE_TAG_COLOR[colorName];
        const c = tableColor ?? TAG_COLOR.blue;
        return h('span', {
          className: `${CLS}-text-tag ${CLS}-text-tag--table ${CLS}-text-tag--${tableColor ? colorName : 'blue'}`,
          style: tableColor ? tableTagStyle(c.bg, c.text) : textTagStyle(c.bg, c.text),
        }, opt.text);
      });
    if (!chips.length) return '';
    return clampTableCell(h('span', { className: `${CLS}-table__tags` }, chips), lines);
  }

  // persons：open_id[] 或 [{id}] → 人员胶囊列表（与 person_list 同款降级）
  if (type === 'persons' && value != null) {
    const ids = (Array.isArray(value) ? value : [value]).map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && typeof (item as { id?: string }).id === 'string') {
        return (item as { id: string }).id;
      }
      return undefined;
    });
    if (!ids.length) return '';
    const chips = ids.map((id) => renderPersonChip(id, {
      showAvatar: true, showName: true, size: 'extra_small',
    }, ctx));
    return clampTableCell(h('div', { className: `${CLS}-person-list ${CLS}-person-list--table` }, chips), lines);
  }

  if (type === 'number' && value != null && value !== '' && Number.isFinite(Number(value))) {
    const precision = col.format?.precision;
    const num = Number(value);
    // toFixed 仅接受 0..100，DSL 传入越界会抛 RangeError 拖垮整卡渲染——夹紧。
    const text = typeof precision === 'number'
      ? num.toFixed(Math.max(0, Math.min(100, Math.trunc(precision))))
      : String(num);
    return clampTableCell(text, lines);
  }

  // markdown / lark_md：飞书表格里两者等价（DSL 常用 lark_md，真机 RAW 也是 dataType:lark_md）。
  // - RAW：单元格已是 { tag:'markdown', property:{elements} }（unwrap 后）
  // - DSL：仍是 "<font>…</font>" 字符串 → 现场 parseMarkdown 再渲
  // 截断：真机只对 lark_md 把行高换算的 lines 写回 markdown.property.lines（由 children_wrapper
  // 做 -webkit-line-clamp）；dataType=markdown 不写 lines（避免把图表/图片类单元格截断），
  // 这里保持一致，不额外包 clamp。
  if ((type === 'markdown' || type === 'lark_md') && value != null) {
    let mdEl: CardElement | null = null;
    if (typeof value === 'object' && (value as CardElement).tag) {
      mdEl = value as CardElement;
    } else if (typeof value === 'string') {
      mdEl = { tag: 'markdown', property: { elements: parseMarkdown(value) } };
    }
    if (mdEl) {
      // 不改原卡片对象：拷贝一层 property 再写 lines
      const withLines: CardElement = type === 'lark_md' && lines != null
        ? { ...mdEl, property: { ...(mdEl.property || {}), lines } }
        : mdEl;
      const vnode = ctx.kernel.renderElement(withLines, ctx);
      if (vnode) return vnode;
    }
  }

  // 兜底：对象（未识别的复杂单元格）不走 String() → "[object Object]"
  if (value != null && typeof value === 'object') return '';
  return clampTableCell(value == null ? '' : String(value), lines);
}
