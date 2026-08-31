/**
 * 内置元素组件：tag -> 渲染函数。
 * 调用 registerBuiltins() 完成所有内置组件注册（index.ts 在模块加载时调用）。
 * 用显式函数调用而非 import 副作用，避免被打包器 tree-shake 掉。
 * 元素 property 结构与样式规则均逆向自网页版飞书引擎，详见 README。
 */
import type { CardElement, RenderContext, TableColumn, TableHeaderStyle, VNode } from './types';
import {
  BASE_FONT_SIZE, BASE_LINE_HEIGHT,
  CHART_DEFAULT_ASPECT_RATIO, CHART_FIXED_MIN_SIZE, CHART_MIN_HEIGHT, CHART_MIN_WIDTH,
  CLS, HEADER_TEMPLATE, HEADING_LEVELS, ICON_COLOR_MAP, ICON_SIZE_MAP,
  NAMED_TEXT_COLOR, ORDER_STYLES, AT_FALLBACK_NAME,
  PERSON_FALLBACK_AVATAR, PERSON_FALLBACK_NAME, PERSON_FOLLOW_FONT,
  PERSON_LIST_COMMA, PERSON_LIST_SIZE, PERSON_SINGLE_SIZE,
  PERSON_UNKNOWN_AVATAR, PERSON_UNKNOWN_NAME,
  TABLE_HEAD_BG, TABLE_ROW_HEIGHT, TAG_COLOR,
  TEXT_SIZE_MAP, paletteColor,
} from './constants';
import { CHART_SPEC_ATTR } from './chart-hydrate';
import { HEADER_BG_LIGHT } from './assets';
import { BASE_STYLES_CSS } from './base-styles';
import { ICON_FONT_CSS } from './icon-font';
import { EMOJI_KEY_TO_NAME, EMOJI_SPRITE_CSS } from './emoji-data';
import { parseMarkdown } from './md-parse';
import { h } from './vnode';
import {
  alignToStyle, bgStyleToColor, boxToStyle, extractPlainText, extractText, getChildElements,
  marginToStyle, propertyBackgroundColor, resolveCornerRadius,
  lookupPerson, personAvatarSrc,
  registerComponent, renderElement, renderElements,
  resolveColor, resolveImageSrc, resolveMediaSrc, resolveTextSizeKey, resolveURL,
  resolveVideoCoverSrc, sizeToPx, spacingToPx, textStyleToModifiers, textStyleToStyle,
} from './registry';
import { resolveCustomBorderLight } from '@open-feishu-card/adapter';
import {
  AUDIO_PAUSE_FLAT_ICON_SVG, AUDIO_PAUSE_ICON_SVG,
  AUDIO_PLAY_FLAT_ICON_SVG, AUDIO_PLAY_ICON_SVG,
  audioInlineMetrics,
} from './audio-hydrate';

/** 视频封面中央播放钮（简化圆底三角，对齐 .universal-card-video__play-btn） */
const VIDEO_PLAY_ICON_SVG =
  '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">'
  + '<path d="M8 5.14v14l11-7-11-7z"/></svg>';

let registered = false;

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
    const vGap = p.verticalSpacingValue?.value ?? p.vertical_spacing;
    if (vGap != null) style.rowGap = spacingToPx(vGap as number | string) + 'px';
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
  const tags = (p.text_tag_list || p.textTagList) as CardElement[] | undefined;
  const tagVNodes = Array.isArray(tags) && tags.length ? renderElements(tags, ctx) : [];

  // 左侧图标：udIcon 优先，回退 icon（与引擎 Rs 一致）
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

  return h('div', {
    className: `${CLS}-header ${CLS}-header--${p.template || 'default'}`,
    style: { backgroundColor: tpl.bg, color: tpl.text },
  },
    h('div', {
      className: `${CLS}-header__bg`,
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
registerComponent('markdown', (el, ctx) => {
  const p = el.property || {};
  const style = { ...alignToStyle(p.textAlign), ...textStyleToStyle(p.textStyle) };
  const mg = marginToStyle(p.margin);
  if (mg) style.margin = mg;
  const sizeKey = resolveTextSizeKey(p);
  // 有显式字号才写死字号/行高；缺省走 CSS（14px / line-height:1.6）
  // 行高取引擎 ce 表：字号≤16 时 = 字号+8（12→20 / 14→22 / 16→24）
  let fontSize = BASE_FONT_SIZE;
  let lineHeight = BASE_FONT_SIZE + 8;
  if (sizeKey != null && TEXT_SIZE_MAP[String(sizeKey)] != null) {
    fontSize = TEXT_SIZE_MAP[String(sizeKey)];
    lineHeight = fontSize + 8;
    style.fontSize = fontSize + 'px';
    style.lineHeight = lineHeight + 'px';
  }
  const childCtx: RenderContext = { ...ctx, textMetrics: { fontSize, lineHeight } };
  return h('div', { className: `${CLS}-markdown`, style },
    h('div', { className: `${CLS}-markdown__children` }, renderElements(p.elements, childCtx))
  );
});

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

// note：备注（小字灰色）
registerComponent('note', (el, ctx) =>
  h('div', { className: `${CLS}-note` }, renderElements(el.property?.elements, ctx))
);

// ---- 布局 ----

// column_set：横向分栏容器
registerComponent('column_set', (el, ctx) => {
  const p = el.property || {};
  // RAW 用 camelCase（horizontalSpacingValue.value / flexMode / horizontalAlign），DSL 用 snake_case
  const gapRaw = p.horizontalSpacingValue?.value ?? p.horizontal_spacing;
  const gap = gapRaw != null ? spacingToPx(gapRaw as number | string) : 8;
  const flexMode = p.flexMode || p.flex_mode;
  const hAlign = p.horizontalAlign || p.horizontal_align;
  const style: Record<string, string> = {
    display: 'flex',
    flexWrap: flexMode === 'flow' || flexMode === 'wrap' ? 'wrap' : 'nowrap',
    columnGap: gap + 'px',
    rowGap: '8px',
    alignItems: 'stretch',
  };
  if (hAlign) {
    style.justifyContent =
      ({ left: 'flex-start', center: 'center', right: 'flex-end' } as Record<string, string>)[hAlign] || 'flex-start';
  }
  // margin：分栏容器自身的外边距（可为负，如 -8px 上移，紧贴上一块）——如实透传。
  const mg = boxToStyle(p.margin);
  if (mg) style.margin = mg;
  // 背景：DSL background_style / RAW backgroundStyle。grey → var(--bg-float-overlay)。
  // 有底色挂 --bg：真机 CSS 给 padding:4px + border-radius:6px。DSL padding 仍可覆盖。
  const bg = propertyBackgroundColor(p);
  if (bg) style.background = bg;
  const pad = boxToStyle(p.padding);
  if (pad) style.padding = pad;
  const cls = `${CLS}-column-set` + (bg ? ` ${CLS}-column-set--bg` : '');
  return h('div', { className: cls, style }, renderElements(p.columns, ctx));
});

// column：单栏
registerComponent('column', (el, ctx) => {
  const p = el.property || {};
  const style: Record<string, string | number> = {
    flexShrink: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column',
  };
  // 宽度：RAW 优先 widthValue（{type:'pixels',value} 为定宽；其余按权重），回退 snake_case width
  const wv = p.widthValue;
  const w = p.width;
  if (wv && wv.type === 'pixels' && typeof wv.value === 'number') {
    style.width = wv.value + 'px';
    style.flexShrink = 0; // 定宽列不被压缩，保证图片按列宽显示
  } else if (w === 'auto' || wv?.value === 'auto') {
    style.width = 'auto';
  } else if (w === 'weighted' || w == null) {
    style.flexBasis = 0; style.flexGrow = String(p.weight || 1);
  } else if (typeof w === 'number') {
    style.width = w + 'px';
  } else {
    style.flexGrow = String(p.weight || 1);
  }
  const vAlign = p.verticalAlign || p.vertical_align;
  if (vAlign) {
    style.justifyContent =
      ({ top: 'flex-start', center: 'center', bottom: 'flex-end' } as Record<string, string>)[vAlign] || 'flex-start';
  }
  // 纵向间距：列内元素唯一的间隔来源（flex row-gap）。缺省 8px（对齐飞书默认）。
  // 注意不要再叠加 CSS 的相邻兄弟 margin，否则间距翻倍——故 styles.css 里不给 column 子元素设 margin。
  const vGap = p.verticalSpacingValue?.value ?? p.vertical_spacing;
  style.rowGap = (vGap != null ? spacingToPx(vGap as number | string) : 8) + 'px';
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
  // fit_horizontal / stretch：图片填满所在列宽（飞书网页版同样 width:100%）
  if (scale === 'fit_horizontal' || scale === 'stretch') {
    wrapStyle.width = '100%';
    imgStyle.width = '100%';
    imgStyle.height = 'auto';
  }
  return h('div', { className: `${CLS}-image__wrapper`, style: wrapStyle },
    src
      ? h('img', { className: `${CLS}-image__host`, src, alt: altText, style: imgStyle })
      : h('div', { className: `${CLS}-image__placeholder` }, altText || '[图片]')
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
  // 有可播放地址：对齐真机 <video class="universal-card-video" controls preload="metadata">
  if (src) {
    const props: Record<string, unknown> = {
      className: `${CLS}-video`,
      src,
      controls: true,
      preload: 'metadata',
    };
    // 禁止下载时收紧 controlslist（浏览器支持度不一，尽力对齐）
    if (!enableDownload) props.controlslist = 'nodownload';
    if (cover) props.poster = cover;
    return h('video', props);
  }
  // 无 src：封面态（播放钮 + 可选时长角标）。时长真机运行期从媒体元数据取，离线未知 → 不写假数字。
  return h('div', { className: `${CLS}-video` },
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
// markdown_audio：与顶层 audio 共用渲染函数 Ln，但 markdown 分发时注入 isInline=true →
// 胶囊样式（--inline）、扁平图标、随父字号缩放；进度条仅显式 showProgressBar 时才画。
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
  const wv = p.widthValue as { type?: string; value?: string | number } | undefined;
  const widthTok = (p.width ?? wv?.value) as string | number | undefined;

  const wrapCls = `${CLS}-audio__wrapper`
    + (isInline ? ` ${CLS}-audio__wrapper--inline` : '')
    + (showTime ? ` ${CLS}-audio__wrapper--show-time` : '')
    + (disabled ? ` ${CLS}-audio__wrapper--disabled` : '');
  const style: Record<string, string> = {};

  if (isInline) {
    // 真机 inline：强制 width:auto；尺寸跟父 markdown 字号（ctx.textMetrics）
    style.width = 'auto';
    const parentFs = ctx.textMetrics?.fontSize ?? BASE_FONT_SIZE;
    const { iconSize, fontSize, top } = audioInlineMetrics(parentFs);
    style['--universal-card-audio-icon-size'] = iconSize + 'px';
    style['--universal-card-audio-time-font-size'] = fontSize + 'px';
    style.verticalAlign = 'top';
    if (top) style.top = top + 'px';
  } else if (widthTok === 'fill') {
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

  const pad = boxToStyle(p.padding as never);
  if (pad) style.padding = pad;
  // markdown_audio 用 backgroundColor；顶层 audio 偶见 backgroundStyle——都写入 CSS 变量（对齐真机）
  const bg = bgStyleToColor(
    p.backgroundColor ?? p.background_color ?? p.background_style ?? p.backgroundStyle,
  );
  if (bg) style['--universal-card-audio-bg'] = bg;
  if (typeof p.fill_color === 'string' || typeof p.fillColor === 'string') {
    const fill = resolveColor((p.fill_color ?? p.fillColor) as string);
    if (fill) style['--universal-card-audio-fill-color'] = fill;
  }

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

  // inline → 扁平 PlayFilled/PauseFilled；块级 → RoundFilled
  const playSvg = isInline ? AUDIO_PLAY_FLAT_ICON_SVG : AUDIO_PLAY_ICON_SVG;
  const pauseSvg = isInline ? AUDIO_PAUSE_FLAT_ICON_SVG : AUDIO_PAUSE_ICON_SVG;

  // 播放/暂停双图标同时输出，靠 .wrapper--playing CSS 显隐（避免 hydrate 改 innerHTML 丢 SVG）
  const controlKids: Array<ReturnType<typeof h> | null> = [
    h('div', { className: `${CLS}-audio__ctrl` },
      h('span', { className: `${CLS}-audio__ctrl-icon` },
        h('span', {
          className: `${CLS}-audio__icon ${CLS}-audio__icon--play`,
          dangerouslySetInnerHTML: { __html: playSvg },
        }),
        h('span', {
          className: `${CLS}-audio__icon ${CLS}-audio__icon--pause`,
          dangerouslySetInnerHTML: { __html: pauseSvg },
        }),
      )
    ),
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
  if (showTime) {
    controlKids.push(h('div', { className: `${CLS}-audio__time` }, '--:--'));
  }

  children.push(
    h('div', { className: `${CLS}-audio__component` },
      h('div', { className: `${CLS}-audio__control${widthTok === 'fill' ? ` ${CLS}-audio__control--fill` : ''}` },
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
  const tip = extractText(p.hoverTips as never);
  // border_color / customBorderColor：命名色/色阶/自定义色 → hex。
  const borderNamed = (p.border_color ?? (p as { borderColor?: string }).borderColor) as string | undefined;
  const borderCustom = resolveCustomBorderLight(p);
  const borderColor = resolveColor(borderNamed) ?? (borderCustom ? resolveColor(borderCustom) : undefined);
  const hasBorder = borderColor != null || p.hasBorder === true || p.has_border === true;
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
  const vGap = p.verticalSpacingValue?.value ?? p.vertical_spacing;
  if (vGap != null) style.rowGap = spacingToPx(vGap as number | string) + 'px';
  // width:"fill" → 撑满所在列（对齐真机 width:100%）。RAW 用 widthValue.builtin_*_width。
  const icWv = p.widthValue as { type?: string; value?: string | number } | undefined;
  if ((p.width ?? icWv?.value) === 'fill') style.width = '100%';
  const props: Record<string, unknown> = { className: cls };
  if (Object.keys(style).length) props.style = style;
  // disabled 时不挂跳转与 hover 提示，避免仍可点/仍出 tip
  if (url && !disabled) props['data-url'] = url;
  if (tip && !disabled) props.title = tip;
  return h('div', props, renderElements(p.elements, ctx));
});

// collapsible_panel：折叠面板（可点击展开/收起）。
// 用原生 <details>/<summary> 实现纯 CSS 交互——零 JS、SSR 字符串与浏览器 DOM 都能点，
// 用户点击 <summary> 由浏览器切换 [open]，箭头旋转与内容显隐都由 CSS 的 details[open] 驱动，
// 故 toggle 后状态始终自洽（无需 JS 同步）。
// 结构：<details>（外层容器 border/background/radius）→ <summary>（标题 + 可旋转箭头图标）
// → content（子元素；折叠态由浏览器隐藏）。expanded 决定初始展开态（映射到 <details open>）。
// header 里的字段（DSL 扁平对象，未经 convertEl）：title（文本叶子或 plain_text）、
// icon（standard_icon）、icon_position（left/right）、icon_expanded_angle（展开时旋转角度）、padding。
registerComponent('collapsible_panel', (el, ctx) => {
  const p = el.property || {};
  const hdr = (p.header && typeof p.header === 'object' ? p.header : {}) as Record<string, unknown>;
  const expanded = p.expanded !== false; // 缺省视为展开

  // 外层容器样式：background_color（bg-white/命名色/自定义）+ border(color/corner_radius)。
  const style: Record<string, string> = { width: '100%' };
  const bgRaw = (p.background_color ?? (p as { backgroundColor?: string }).backgroundColor) as string | undefined;
  // 'bg-white' 等 design token 语义即白底；命名色/自定义走 resolveColor。
  if (bgRaw === 'bg-white') style.background = '#fff';
  else { const bg = bgStyleToColor(bgRaw); if (bg) style.background = bg; }
  const border = (p.border && typeof p.border === 'object' ? p.border : {}) as { color?: string; corner_radius?: number | string };
  const borderColor = resolveColor(border.color) || '#dee0e3';
  style.border = `1px solid ${borderColor}`;
  style.borderRadius = border.corner_radius != null ? sizeToPx(border.corner_radius) : '8px';

  // header（<summary>）：标题 + 箭头图标，两者一行（icon_position 决定箭头在左/右）。
  const headerStyle: Record<string, string> = {};
  const hpad = typeof hdr.padding === 'string'
    ? hdr.padding
    : boxToStyle(hdr.padding as never); // DSL 常是 "8px 12px 8px 12px"；RAW 可能是 box 对象
  if (hpad) headerStyle.padding = hpad;
  const title = extractPlainText(hdr.title) || extractText(hdr.title as never);
  const titleVNode = h('div', { className: `${CLS}-collapsible-panel__title` }, title);

  // 箭头图标：复用 renderIcon（standard_icon）。旋转不再由内联 transform 定死，而是把展开角度
  // 写进 CSS 变量 --panel-icon-angle：details[open] 时 CSS 用它旋转，收起时归 0——这样用户
  // 点击 toggle 后箭头方向自动跟随，无需 JS。默认展开角 -180。
  // header 是未经 convertEl 的原始 DSL 对象，故 icon 的字段（token/color/size）是扁平的、
  // 未包进 property——renderIcon 读 property，这里归一：无 property 时把元素自身当 property。
  let iconVNode: VNode | null = null;
  const iconRaw = hdr.icon as CardElement | undefined;
  const openAngle = Number(hdr.icon_expanded_angle ?? -180);
  if (iconRaw && iconRaw.tag) {
    const iconEl: CardElement = iconRaw.property
      ? iconRaw
      : { tag: iconRaw.tag, property: iconRaw as never };
    const inner = renderIcon(iconEl, ctx);
    if (inner) {
      iconVNode = h('div', { className: `${CLS}-collapsible-panel__icon` }, inner);
    }
  }
  const iconLeft = hdr.icon_position === 'left';
  const headerChildren = iconLeft ? [iconVNode, titleVNode] : [titleVNode, iconVNode];
  // 展开角写在 <summary> 上（作用域含箭头子节点）；--panel-icon-angle 供 CSS details[open] 取用。
  const summaryStyle = { ...headerStyle, '--panel-icon-angle': `${openAngle}deg` };
  const summary = h('summary', { className: `${CLS}-collapsible-panel__header`, style: summaryStyle }, headerChildren);

  // 内容始终渲染：折叠态由 <details>（无 open 属性）交给浏览器隐藏，展开由用户点击控制。
  // 面板 padding 落到内容区（header 用 hdr.padding）；缺省走 CSS 的 0 12px 12px。
  const contentStyle: Record<string, string> = {};
  const cpad =
    typeof p.padding === 'string'
      ? p.padding
      : boxToStyle(p.padding as never);
  if (cpad) contentStyle.padding = cpad;
  const content = h(
    'div',
    { className: `${CLS}-collapsible-panel__content`, style: contentStyle },
    renderElements(p.elements, ctx),
  );

  const cls = `${CLS}-collapsible-panel${expanded ? ` ${CLS}-collapsible-panel--expanded` : ''}`;
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
  // width:"fill" → 撑满所在列（block）。真机 RAW 用 widthValue:{type:'builtin_width',value:'fill'}，
  // DSL / 部分路径仍可能直接带 width:"fill"——两处都认（对齐 audio）。
  // text 系（text/primary_text/danger_text）是纯文字按钮，始终按内容宽（auto），不吃 fill。
  const isText = type === 'text' || type === 'primary_text' || type === 'danger_text';
  const wv = p.widthValue as { type?: string; value?: string | number } | undefined;
  const widthTok = (p.width ?? wv?.value) as string | number | undefined;
  const block = widthTok === 'fill' && !isText;
  const base = `${CLS}-button ${CLS}-button--${type}${block ? ` ${CLS}-button--block` : ''}`;
  // 只有"点击跳转外链"（open_url / 直链）才保留为可点链接；
  // 其余动作（form_submit / action_request / 回调）在预览里无意义——
  // 保留按钮外观，但渲染成不可点的 <span>，不触发任何交互。
  if (url && !p.disabled) {
    return h('a', { className: base, href: url, target: '_blank', rel: 'noopener' }, children);
  }
  const cls = `${base} ${CLS}-button--static` + (p.disabled ? ` ${CLS}-button--disabled` : '');
  return h('span', { className: cls }, children);
});

// form：表单容器。预览定位——不渲染表单语义，只透传内部元素（否则整块被跳过、
// 里面的按钮/文本都会丢失）。表单内的提交按钮会按 button 规则渲成不可点的静态样式。
registerComponent('form', (el, ctx) =>
  h('div', { className: `${CLS}-form` }, renderElements(el.property?.elements, ctx))
);

// input / multi_select_static：表单输入控件。预览里不可交互，
// 渲染成一个静态只读框，展示 placeholder（有什么提示就显示什么）。
function renderStaticField(el: CardElement) {
  const p = el.property || {};
  const ph = extractPlainText(p.placeholder) || '';
  return h('div', { className: `${CLS}-input ${CLS}-input--static` }, ph);
}
registerComponent('input', (el) => renderStaticField(el));
registerComponent('multi_select_static', (el) => renderStaticField(el));
registerComponent('select_static', (el) => renderStaticField(el));

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
  const lineHeight = fontSize + 8;
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
  const tip = disabled
    ? extractText((p.disabled_tips ?? (p as { disabledTips?: unknown }).disabledTips) as never)
    : extractText((p.hover_tips ?? p.hoverTips) as never);

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
  if (tip) props.title = tip;

  // overall_checkable：整行包进 <label>，点文字也能切换；否则外层 div，仅 checkbox 可点
  const Tag = overall && !disabled ? 'label' : 'div';
  return h(Tag, props, checkbox, content, buttonsVNode);
});

// action：横排交互容器
registerComponent('action', (el, ctx) => {
  const p = el.property || {};
  const layout = p.layout || 'flow';
  const style = { display: 'flex', flexWrap: 'wrap', gap: '12px' };
  return h('div', { className: `${CLS}-action ${CLS}-action--${layout}`, style }, renderElements(p.actions, ctx));
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
function renderIcon(el: CardElement, ctx: RenderContext) {
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
  // 尺寸：优先枚举（small/large1..4），否则解析像素串（"10px" / "10px 10px" 取首个数字），
  // 都不认时回退 16。折叠面板的箭头图标常直接给像素尺寸（如 "10px 10px"）。
  const sizePx = ICON_SIZE_MAP[sizeKey] ?? (/^\d/.test(sizeKey) ? Number(/^(\d+(?:\.\d+)?)/.exec(sizeKey)![1]) : 16);
  style.fontSize = sizePx + 'px';
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

// list：有序/无序列表
registerComponent('list', (el, ctx) => {
  const p = el.property || {};
  const items = p.items || [];
  return h('div', { className: `${CLS}-markdown-list` },
    items.map((item, i) => {
      const ordered = (item.type || '').toLowerCase() === 'ol' || item.ordered === true;
      const level = item.level || 0;
      let marker: string;
      if (ordered) {
        const fn = ORDER_STYLES[level % ORDER_STYLES.length];
        marker = fn(item.order != null ? item.order : i + 1) + '.';
      } else {
        marker = ['•', '◦', '▪'][level % 3];
      }
      const liStyle = { marginLeft: 24 * level + 'px', display: 'flex', gap: '6px' };
      return h('div', { className: `${CLS}-markdown-list__item`, style: liStyle },
        h('span', { className: `${CLS}-markdown-list__marker`, style: { flexShrink: 0 } }, marker),
        h('div', { className: `${CLS}-markdown-list__li-content` }, renderElements(item.elements, ctx))
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
  // row_height 控行高（含省略）。page_size：预览只「显示前 N 行」，不做真实分页控件。
  registerComponent('table', (el, ctx) => {
    const p = el.property || {};
    // 列定义：DSL 用 snake_case（data_type/display_name/horizontal_align/width），
    // 真机 RAW 用 camelCase（dataType/displayName/horizontalAlign/widthValue）——归一成统一形态。
    const columns = (Array.isArray(p.columns) ? p.columns : []).map(normalizeColumn);
    const rows = (Array.isArray(p.rows) ? p.rows : []) as Array<Record<string, unknown>>;
    const hs = (p.header_style || p.headerStyle || {}) as TableHeaderStyle;
    // 行高：DSL row_height 字符串枚举；RAW rowHeightValue:{value:'middle'}。
    const rhKey = String(
      p.row_height ?? p.rowHeight
      ?? (p.rowHeightValue as { value?: string } | undefined)?.value
      ?? 'middle'
    );
    const rowHeight = TABLE_ROW_HEIGHT[rhKey] ?? TABLE_ROW_HEIGHT.middle;
    // page_size 只作正整数「显示前 N 行」；0/负数/非数视为不限制（避免 slice(0,0) 清空全表）。
    const pageSizeRaw = typeof p.page_size === 'number' ? p.page_size : (typeof p.pageSize === 'number' ? p.pageSize : undefined);
    const pageSize = typeof pageSizeRaw === 'number' && pageSizeRaw > 0 ? pageSizeRaw : undefined;
    const shownRows = pageSize != null ? rows.slice(0, pageSize) : rows;

    // 表头样式：DSL background_style/text_align；RAW backgroundStyle/textAlign（dual-read）。
    const headBg = TABLE_HEAD_BG[String(hs.background_style ?? (hs as { backgroundStyle?: string }).backgroundStyle ?? 'none')] ?? 'transparent';
    const headAlign = hs.text_align ?? (hs as { textAlign?: string }).textAlign ?? 'left';
    const headBold = hs.bold !== false; // 默认加粗

    // colgroup：把列宽落到 <col>。"auto"/空 不设宽（自适应），"120px"/数字 定宽。
    const cols = columns.map((c) => {
      const w = colWidth(c.width);
      return h('col', w ? { style: { width: w, minWidth: w } } : {});
    });

    // thead
    const headCells = columns.map((c) => {
      const align = c.horizontal_align || headAlign;
      return h('th', {
        className: `${CLS}-table__th`,
        style: { textAlign: align, backgroundColor: headBg },
      },
        h('span', {
          className: `${CLS}-table__th-text${headBold ? ` ${CLS}-table__th-text--bold` : ''}`,
        }, String(c.display_name ?? c.name ?? ''))
      );
    });

    // tbody
    const bodyRows = shownRows.map((row) =>
      h('tr', { className: `${CLS}-table__row` },
        columns.map((c) => {
          const align = c.horizontal_align || 'left';
          return h('td', {
            className: `${CLS}-table__td`,
            style: { textAlign: align, height: rowHeight + 'px' },
          },
            h('div', {
              className: `${CLS}-table__cell`,
              style: { justifyContent: alignToFlex(align) },
            }, renderCell(unwrapCellValue(row[c.name]), c, ctx))
          );
        })
      )
    );

    return h('div', { className: `${CLS}-table` },
      h('div', { className: `${CLS}-table__scroll` },
        h('table', { className: `${CLS}-table__table` },
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
 * - width ← widthValue（RAW 用 {type,value}：pixels 取 value 数字，builtin/auto 归为 'auto'）
 */
function normalizeColumn(raw: unknown): TableColumn {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const wv = c.widthValue as { type?: string; value?: number | string } | undefined;
  let width: TableColumn['width'];
  if (c.width != null) {
    width = c.width as TableColumn['width'];
  } else if (wv && typeof wv === 'object') {
    // pixels → 数字定宽；其余（builtin_table_column_width:'auto' / 权重）→ 自适应
    width = wv.type === 'pixels' && typeof wv.value === 'number' ? wv.value : 'auto';
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

/** 列宽：数字 → "Npx"；"120px" 原样；"auto"/空 → 空串（自适应，不设宽） */
function colWidth(w: TableColumn['width']): string {
  if (w == null) return '';
  if (typeof w === 'number') return w + 'px';
  const s = String(w).trim();
  if (!s || s === 'auto') return '';
  return s;
}

/** 水平对齐 → flex 主轴（单元格内容用 flex 排布，才能让标签也跟对齐走） */
function alignToFlex(align: string): string {
  return ({ left: 'flex-start', center: 'center', right: 'flex-end' } as Record<string, string>)[align] || 'flex-start';
}

/**
 * 单元格内容：按列 data_type 渲染。
 * - options：值为 [{text,color}]，每项渲染成彩色 text_tag（复用 text_tag 组件的色板）。
 * - persons：值为 open_id 字符串数组（或 {id}），每人一颗人员胶囊（无人员表时走 PERSON_FALLBACK_*）。
 * - number：按 format.precision 定小数位。
 * - markdown / lark_md：字符串走 parseMarkdown；RAW 已是 markdown 元素树则直接渲。
 * - 其余（text/…）：转成字符串纯文本。
 */
function renderCell(value: unknown, col: TableColumn, ctx: RenderContext): ReturnType<typeof h> | string {
  const type = col.data_type || 'text';

  // options：值可能是数组，也可能是单个 {text,color}（归一成数组统一处理）。
  if (type === 'options' && value != null && (Array.isArray(value) || typeof value === 'object')) {
    const opts = (Array.isArray(value) ? value : [value]) as Array<{ text?: string; color?: string }>;
    const chips = opts.map((opt) => {
      const rawColor = (opt.color || 'neutral') as string;
      // 与 text_tag 同色板：非法色（如 grey）回退 blue
      const colorName = TAG_COLOR[rawColor] ? rawColor : 'blue';
      const c = TAG_COLOR[colorName];
      return h('span', {
        className: `${CLS}-text-tag ${CLS}-text-tag--${colorName}`,
        style: textTagStyle(c.bg, c.text),
      }, String(opt.text ?? ''));
    });
    return h('span', { className: `${CLS}-table__tags` }, chips);
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
    return h('div', { className: `${CLS}-person-list ${CLS}-person-list--table` }, chips);
  }

  if (type === 'number' && value != null && value !== '' && Number.isFinite(Number(value))) {
    const precision = col.format?.precision;
    const num = Number(value);
    // toFixed 仅接受 0..100，DSL 传入越界会抛 RangeError 拖垮整卡渲染——夹紧。
    return typeof precision === 'number'
      ? num.toFixed(Math.max(0, Math.min(100, Math.trunc(precision))))
      : String(num);
  }

  // markdown / lark_md：飞书表格里两者等价（DSL 常用 lark_md，真机 RAW 也是 dataType:lark_md）。
  // - RAW：单元格已是 { tag:'markdown', property:{elements} }（unwrap 后）
  // - DSL：仍是 "<font>…</font>" 字符串 → 现场 parseMarkdown 再渲
  if ((type === 'markdown' || type === 'lark_md') && value != null) {
    let mdEl: CardElement | null = null;
    if (typeof value === 'object' && (value as CardElement).tag) {
      mdEl = value as CardElement;
    } else if (typeof value === 'string') {
      mdEl = { tag: 'markdown', property: { elements: parseMarkdown(value) } };
    }
    if (mdEl) {
      const vnode = ctx.kernel.renderElement(mdEl, ctx);
      if (vnode) return vnode;
    }
  }

  // 兜底：对象（未识别的复杂单元格）不走 String() → "[object Object]"
  if (value != null && typeof value === 'object') return '';
  return value == null ? '' : String(value);
}
