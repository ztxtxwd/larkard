/**
 * 组件注册表（仿飞书引擎 kernel.getComponent(tag)）+ 元素遍历 + 样式辅助。
 */
import type {
  CardElement, ComponentFn, ElementProperty, PersonInfo, RenderContext, TextStyle, VNode,
} from './types';
import {
  resolveCustomBackgroundLight,
  resolveTextStyleColor,
} from '@open-feishu-card/adapter';
import {
  BASE_FONT_SIZE, PALETTE, TEXT_FONT_COLOR_TOKEN, paletteColor,
  PERSON_AVATAR_BASE, PERSON_AVATAR_SUFFIX, TEXT_SIZE_MAP,
} from './constants';

const registry: Record<string, ComponentFn> = {};

/** 注册（或覆盖）一个 tag 的渲染组件 */
export function registerComponent(tag: string, fn: ComponentFn): void {
  registry[tag] = fn;
}

/** 取某 tag 的组件 */
export function getComponent(tag: string): ComponentFn | null {
  return registry[tag] || null;
}

/** 渲染单个元素 {tag,id,property} -> VNode */
export function renderElement(el: CardElement | null | undefined, ctx: RenderContext): VNode | null {
  if (!el || !el.tag) return null;
  const comp = getComponent(el.tag);
  if (!comp) {
    if (ctx.options.warnOnUnknownTag) {
      // eslint-disable-next-line no-console
      console.warn(`[FeishuCard] 未注册的 tag: <${el.tag}>，已跳过`);
    }
    return null;
  }
  return comp(el, ctx);
}

/** 渲染元素数组 */
export function renderElements(arr: CardElement[] | undefined, ctx: RenderContext): VNode[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((e) => renderElement(e, ctx)).filter((v): v is VNode => !!v);
}

/**
 * 取容器的子元素数组。RAW 有两种形态：
 * - 包在 property 里：el.property.elements（常见 DSL 形态）
 * - 直接挂在元素上：el.elements（部分 RAW body 无 property 包裹）
 */
export function getChildElements(el: CardElement | null | undefined): CardElement[] | undefined {
  if (!el) return undefined;
  if (Array.isArray(el.property?.elements)) return el.property!.elements;
  const direct = (el as { elements?: CardElement[] }).elements;
  if (Array.isArray(direct)) return direct;
  return undefined;
}

/**
 * 颜色解析统一入口。飞书正文 <font color>/背景 backgroundStyle 支持三类值：
 *  1) 空/'default' -> undefined（不指定，回退继承色）；
 *  2) 自定义色 #hex / rgb() / hsl() -> 原样直通；
 *  3) 命名色（含色阶后缀，如 blue-500 / grey / carmine-600）或裸色阶 token（B600）
 *     -> 经 paletteColor 解析为飞书 :root light 主题 hex。
 * 解析不出返回 undefined（不再回填无效字符串，避免污染 CSS）。
 */
export function resolveColor(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const v = raw.trim();
  if (!v || v === 'default') return undefined;
  if (/^(#|rgb|hsl)/i.test(v)) return v;
  return paletteColor(v);
}

/**
 * 正文色名 → 色阶 token（orange→O400 等，见 TEXT_FONT_COLOR_TOKEN）。
 * 自定义 #hex/rgb 返回 undefined（调用方走直通）。
 */
export function resolveTextFontToken(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const v = raw.trim();
  if (!v || v === 'default' || /^(#|rgb|hsl)/i.test(v)) return undefined;
  if (TEXT_FONT_COLOR_TOKEN[v]) return TEXT_FONT_COLOR_TOKEN[v];
  if (PALETTE[v]) return v; // 已是色阶 token（O400 / B600）
  return undefined;
}

/**
 * textStyle → BEM 修饰名（不含前缀）。对齐真机：
 *   color:"orange" + bold → ["orange","bold"] → .universal-card-text--orange/--bold
 * strikethrough 真机类名是 through。
 */
export function textStyleToModifiers(textStyle: TextStyle | undefined): string[] {
  if (!textStyle) return [];
  const out: string[] = [];
  const color = resolveTextStyleColor(textStyle) ?? textStyle?.color?.trim();
  if (color && color !== 'default' && !/^(#|rgb|hsl)/i.test(color)) out.push(color);
  const attrs = textStyle.attributes || [];
  if (attrs.includes('bold')) out.push('bold');
  if (attrs.includes('italic')) out.push('italic');
  if (attrs.includes('strikethrough')) out.push('through');
  return out;
}

/** textStyle -> CSS style 对象（颜色走 var(--TOKEN)，对齐真机 he()） */
export function textStyleToStyle(textStyle: TextStyle | undefined): Record<string, string> {
  const style: Record<string, string> = {};
  if (!textStyle) return style;
  const attrs = textStyle.attributes || [];
  if (attrs.includes('bold')) style.fontWeight = '600';
  if (attrs.includes('italic')) style.fontStyle = 'italic';
  if (attrs.includes('strikethrough')) style.textDecoration = 'line-through';
  const color = resolveTextStyleColor(textStyle) ?? textStyle.color;
  if (color) {
    const token = resolveTextFontToken(color);
    if (token) style.color = `var(--${token})`;
    else {
      const c = resolveColor(color);
      if (c) style.color = c;
    }
  }
  const sizeName = textStyle.size || (textStyle.platformSize && (textStyle.platformSize.pc || textStyle.platformSize.mobile));
  // TEXT_SIZE_MAP 覆盖 RAW textStyle.size 全量枚举（含 notation/heading），
  // 旧 SIZE_MAP 缺 notation，导致真机 RAW 的 12px 辅助信息回退成 14px。
  if (sizeName && TEXT_SIZE_MAP[sizeName] != null && TEXT_SIZE_MAP[sizeName] !== BASE_FONT_SIZE) {
    style.fontSize = TEXT_SIZE_MAP[sizeName] + 'px';
  }
  return style;
}

/**
 * 解析段落级字号枚举键。
 * - DSL：`text_size`（snake）
 * - 少数中间态：`textSize`（camel）
 * - 真机 RAW：`textStyle.size` / `textStyle.platformSize.{pc,mobile}`
 *   （服务端把 DSL text_size 归一进 textStyle，不再保留 text_size 字段）
 */
export function resolveTextSizeKey(property: ElementProperty | Record<string, unknown> | undefined | null): string | undefined {
  if (!property) return undefined;
  const p = property as Record<string, unknown>;
  const direct = p.text_size ?? p.textSize;
  if (typeof direct === 'string' && direct) return direct;
  const ts = p.textStyle as TextStyle | undefined;
  if (!ts) return undefined;
  const fromStyle = ts.size || ts.platformSize?.pc || ts.platformSize?.mobile;
  return typeof fromStyle === 'string' && fromStyle ? fromStyle : undefined;
}

/** textAlign -> CSS（left 为默认不输出） */
export function alignToStyle(align: string | undefined): Record<string, string> {
  if (align && align !== 'left') return { textAlign: align };
  return {};
}

/** 从 {tag,property:{content}} 或字符串里取纯文本 */
export function extractText(node: CardElement | string | undefined | null): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (node.property && node.property.content != null) return String(node.property.content);
  const direct = (node as { content?: unknown }).content;
  if (direct != null) return String(direct);
  return '';
}

/**
 * 递归抽出元素树里的纯文本，丢弃所有格式（加粗/颜色/徽章等）与换行。
 * 用于按钮：飞书按钮文本不支持富文本，须平铺成一行纯文字。
 * 展开 property.content / property.elements / property.text（text_tag 内层），
 * br 视为空格，最后压缩多余空白。
 */
export function extractPlainText(node: unknown): string {
  const out: string[] = [];
  const walk = (n: unknown): void => {
    if (n == null) return;
    if (typeof n === 'string') { out.push(n); return; } // 占位符等可能直接是字符串
    if (typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    const el = n as CardElement;
    if (el.tag === 'br') { out.push(' '); return; }
    const p = el.property;
    if (p) {
      if (p.content != null) out.push(String(p.content));
      if (Array.isArray(p.elements)) p.elements.forEach(walk);
      if (p.text) walk(p.text as CardElement); // text_tag 等的内层文本
    }
  };
  walk(node);
  return out.join('').replace(/\s+/g, ' ').trim();
}

/** 图片地址解析：options.resolveImage -> src/url/img_url -> imageBaseURL+imageID */
export function resolveImageSrc(p: ElementProperty, ctx: RenderContext): string | null {
  if (ctx.options.resolveImage) {
    const r = ctx.options.resolveImage(p);
    if (r) return r;
  }
  if (p.src) return p.src;
  if (p.url) return resolveURL(p.url) || null;
  if (p.img_url) return p.img_url;
  if (p.imageID && ctx.options.imageBaseURL) return ctx.options.imageBaseURL + p.imageID;
  return null;
}

/**
 * 音视频地址解析：options.resolveMedia -> src -> mediaBaseURL+fileID -> url。
 * RAW 用 fileID（file_v3_...）；DSL 用 file_key（dual-read）。
 * 飞书真机 src 走带鉴权的 uni_api/download；离线渲染需 caller 注入 resolveMedia / mediaBaseURL。
 *
 * 注意：markdown_audio 的 property.url 是降级跳转链接（如 open.feishu.cn），不是可播地址；
 * 有 fileID 时绝不能用它顶替媒体源。
 */
export function resolveMediaSrc(
  p: ElementProperty,
  kind: 'video' | 'audio',
  ctx: RenderContext,
): string | null {
  if (ctx.options.resolveMedia) {
    const r = ctx.options.resolveMedia(p, kind);
    if (r) return r;
  }
  if (typeof p.src === 'string' && p.src) return p.src;
  const fileID = (p.fileID ?? p.file_key) as string | undefined;
  if (fileID && ctx.options.mediaBaseURL) return ctx.options.mediaBaseURL + fileID;
  // 无 fileID 时才回退 url（少数直链场景）；有 fileID 则 url 多为 markdown_audio 降级链
  if (!fileID && p.url) return resolveURL(p.url) || null;
  return null;
}

/** 视频封面：coverImageID（RAW，常为 img_v3_...）/ image_key · cover_image_key（DSL）→ 走图片解析 */
export function resolveVideoCoverSrc(p: ElementProperty, ctx: RenderContext): string | null {
  const coverId = (p.coverImageID ?? p.image_key ?? p.cover_image_key) as string | undefined;
  if (!coverId) return null;
  return resolveImageSrc({ imageID: coverId }, ctx);
}

/** 按 open_id 从 ctx 的人员表反查 PersonInfo（姓名 + 头像 key） */
export function lookupPerson(userID: string | undefined, ctx: RenderContext): PersonInfo | null {
  if (!userID) return null;
  const map = ctx.options.persons;
  return (map && map[userID]) || null;
}

/**
 * 头像地址解析：resolvePersonAvatar 钩子 -> avatarBaseURL+avatar_key+suffix。
 * 飞书头像 key 公开可取（无需鉴权），故无 key 时返回 null（渲染首字占位）。
 */
export function personAvatarSrc(person: PersonInfo | null, ctx: RenderContext): string | null {
  if (!person) return null;
  if (ctx.options.resolvePersonAvatar) {
    const r = ctx.options.resolvePersonAvatar(person);
    if (r) return r;
  }
  if (!person.avatar_key) return null;
  const base = ctx.options.avatarBaseURL || PERSON_AVATAR_BASE;
  const suffix = ctx.options.avatarURLSuffix ?? PERSON_AVATAR_SUFFIX;
  return base + person.avatar_key + suffix;
}

/** 间距枚举/数值 -> px 数 */
export function spacingToPx(v: number | string | undefined): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const named: Record<string, number> = { small: 4, medium: 8, large: 12, extra_large: 16, default: 8 };
    if (named[v] != null) return named[v];
    // 像素串（"0px" / "12px" / "6"）：取数值。飞书 DSL 的 spacing 常是这种形态，
    // 若不解析会全部落到下面的默认 8，造成「0px 被当成 8px」等间距偏大。
    const m = /^(-?\d+(?:\.\d+)?)(?:px)?$/.exec(v.trim());
    if (m) return Number(m[1]);
  }
  return 8;
}

/** 解析链接：url 可能是字符串，也可能是多端地址对象 { pcURL, url, ... } */
export function resolveURL(url: unknown): string {
  if (!url) return '';
  if (typeof url === 'string') return url;
  if (typeof url === 'object') {
    const u = url as Record<string, string | undefined>;
    return u.pcURL || u.url || u.iosURL || u.androidURL || u.harmonyURL || '';
  }
  return '';
}

/** 尺寸数值/字符串 -> CSS 长度 */
export function sizeToPx(v: number | string | undefined): string {
  return typeof v === 'number' ? v + 'px' : String(v);
}

/** RAW padding/margin 对象或 DSL 简写字符串 → CSS 速记 */
export function marginToStyle(margin: unknown): string | null {
  if (typeof margin === 'string' && margin.trim()) return margin.trim();
  return boxToStyle(margin as Spacing4);
}

/** RAW cornerRadiusValue / DSL corner_radius → CSS border-radius */
export function resolveCornerRadius(property: Record<string, unknown> | undefined | null): string | undefined {
  if (!property) return undefined;
  const direct = property.corner_radius ?? property.cornerRadius;
  if (direct != null) return sizeToPx(direct as number | string);
  const echo = property.cornerRadiusValue as { type?: string; value?: number | string } | undefined;
  if (echo && typeof echo.value === 'number') return echo.value + 'px';
  if (echo && typeof echo.value === 'string' && echo.value.trim()) return sizeToPx(echo.value);
  return undefined;
}
/** RAW 的 padding/margin 对象 {top,right,bottom,left:{type:'pixels',value}} -> CSS 速记 */
type Spacing4 = { top?: { value?: number }; right?: { value?: number }; bottom?: { value?: number }; left?: { value?: number } };
export function boxToStyle(box: Spacing4 | undefined): string | null {
  if (!box || typeof box !== 'object') return null;
  const t = box.top?.value ?? 0;
  const r = box.right?.value ?? 0;
  const b = box.bottom?.value ?? 0;
  const l = box.left?.value ?? 0;
  // 对象存在即视为显式指定（含全 0），须输出以覆盖 CSS 默认值（如 body padding:12px）。
  return `${t}px ${r}px ${b}px ${l}px`;
}

/**
 * 容器 backgroundStyle -> CSS background 值。
 * 枚举 grey（及历史值 1）：真机写 `background: var(--bg-float-overlay)`，
 * light 主题 alias 为 `--N50`（#f5f6f7），不是正文色 grey→N600。
 * 带档位色名（green-50 / blue-100）、裸色阶 token、自定义 #hex 走色板。
 * "default"/"none"/空 -> 无背景。
 */
export function bgStyleToColor(style: unknown): string | null {
  if (typeof style !== 'string') return null;
  const v = style.trim();
  if (!v || v === 'default' || v === 'none' || v === 'transparent') return null;
  if (v === 'grey' || v === 'gray' || v === '1') return 'var(--bg-float-overlay)';
  return resolveColor(v) || null;
}

/** RAW customBackgroundStyle first, then enum backgroundStyle / background_style. */
export function propertyBackgroundColor(property: ElementProperty | Record<string, unknown> | undefined | null): string | null {
  if (!property) return null;
  const custom = resolveCustomBackgroundLight(property);
  if (custom) {
    const c = resolveColor(custom);
    if (c) return c;
  }
  const p = property as Record<string, unknown>;
  return bgStyleToColor(p.backgroundStyle ?? p.background_style);
}
