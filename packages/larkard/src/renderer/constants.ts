/**
 * 渲染常量。颜色/字号等规则均从网页版飞书引擎 (be8b738f.js) 与
 * edbaaa5b.css 中逆向抽取，详见 README 的「渲染规则」一节。
 */
import type { HeaderTemplate, NamedColor } from './types.js';

// 字号 / 行高 / 间距等真机常量统一由 content 提供，renderer 不再本地维护一份。
export {
  BASE_FONT_SIZE,
  BASE_LINE_HEIGHT,
  HEADING_LEVELS,
  TEXT_SIZE_MAP,
  lineHeightForFontSize,
  textLineHeight,
} from '../content/metrics.js';

// 官方色阶真源统一在 content；这里继续 re-export 保持 renderer 既有 API。
import {
  PALETTE,
  COLOR_FAMILY,
  COLOR_NAME_TO_TOKEN,
  paletteColor,
} from '../content/colors.js';

export { PALETTE, COLOR_NAME_TO_TOKEN, paletteColor };

/** className 前缀（飞书引擎 const J="universal-card"） */
export const CLS = 'universal-card';

/**
 * header template -> {bg,text}。规则取自 --udtoken-message-card-*（light）：
 * bg = 该色的 -100 档；text 多数 -600。
 * 例外：orange→O500、yellow→Y500；
 * grey / neutral → bg N500 + text N00（白字中灰底；飞书 token 为
 * --udtoken-message-card-*-neutral。高光用通用强纹理 aac0718d1d，
 * 叠加后观感对齐官方样图 / 真机，避免旧弱纹理显得过深）；
 * default 为**白底深字**：客户端 fallbackStyle 里 default/disabled 的 bg_color 是空串
 * （客户端 be8b738f.js 的 header fallbackStyle），即不设背景色，透出卡片根的
 * --bg-float（#ffffff）。此前这里写 #f5f6f7（N50），预览里就多出一条浅灰标题栏，
 * 真机并没有。
 */
export const HEADER_TEMPLATE: Record<HeaderTemplate, { bg: string; text: string }> = (() => {
  const bgException: Record<string, string> = { neutral: 'N500', grey: 'N500' };
  const textException: Record<string, string> = {
    orange: 'O500', yellow: 'Y500', neutral: 'N00', grey: 'N00',
  };
  const names: HeaderTemplate[] = [
    'blue', 'wathet', 'turquoise', 'green', 'yellow', 'orange', 'red',
    'carmine', 'violet', 'purple', 'indigo', 'lime', 'sunflower', 'grey', 'neutral',
  ];
  const out = {} as Record<HeaderTemplate, { bg: string; text: string }>;
  for (const n of names) {
    const letter = COLOR_FAMILY[n];
    out[n] = {
      bg: PALETTE[bgException[n] || letter + '100'],
      text: PALETTE[textException[n] || letter + '600'],
    };
  }
  out.default = { bg: '#ffffff', text: '#1f2329' };
  return out;
})();

/**
 * 正文 font_color / textStyle.color 色名 → 色阶 token。
 * 基表同 default_color_tokens（无后缀落 -600）；引擎 fallbackStyle 再覆盖
 * `markdown.font_color`：orange→O400、white→static-white（见 be8b738f）。
 * orange 特例走 O400；white 已在 COLOR_NAME_TO_TOKEN 落到 N00（等价 static-white）。
 */
export const TEXT_FONT_COLOR_TOKEN: Record<string, string> = {
  ...COLOR_NAME_TO_TOKEN,
  orange: 'O400',
};

/**
 * 命名文字色 -> hex。卡片正文里 <font color>/textStyle.color 走 TEXT_FONT_COLOR_TOKEN，
 * 无后缀名多数落 -600；orange 例外为 O400。带后缀由 paletteColor / TEXT_FONT_COLOR_TOKEN 解析。
 */
export const NAMED_TEXT_COLOR: Record<NamedColor, string> = (() => {
  const out = {} as Record<NamedColor, string>;
  for (const n of Object.keys(COLOR_FAMILY) as NamedColor[]) {
    const token = TEXT_FONT_COLOR_TOKEN[n] || COLOR_FAMILY[n] + '600';
    out[n] = PALETTE[token];
  }
  return out;
})();

/**
 * text_tag 彩色标签的 {bg,text}。
 * 逆向自 --udtoken-tag-bg-* / --udtoken-tag-text-s-*（light）：
 * bg 是半透明色（不是 header 的 -100 实心底），text 与 message-card-text 同系。
 * 之前误复用 HEADER_TEMPLATE，导致标签在彩色 header 上几乎融进底色。
 *
 * 合法色名与飞书 text_tag 枚举对齐（13 个）：
 *   neutral / blue / turquoise / lime / orange / violet / indigo /
 *   wathet / green / yellow / red / purple / carmine
 * 注意：`grey` **不是** text_tag 合法色（灰标签应写 `neutral`）。飞书收到
 * `color='grey'` 等未知色时回退为 blue；本表不收录 grey，未知色走 blue 兜底。
 */
export const TAG_COLOR: Record<string, { bg: string; text: string }> = {
  blue:      { bg: 'rgba(20, 86, 240, 0.2)',  text: '#1456f0' },
  wathet:    { bg: 'rgba(62, 195, 247, 0.2)', text: '#076a94' },
  turquoise: { bg: 'rgba(51, 214, 192, 0.2)', text: '#067062' },
  green:     { bg: 'rgba(53, 189, 75, 0.2)',  text: '#1a7526' },
  lime:      { bg: 'rgba(145, 173, 0, 0.2)',  text: '#5c6d08' },
  yellow:    { bg: 'rgba(250, 211, 85, 0.2)', text: '#ad7a03' },
  orange:    { bg: 'rgba(255, 129, 26, 0.15)', text: '#c25705' },
  red:       { bg: 'rgba(245, 74, 69, 0.2)',  text: '#c02a26' },
  carmine:   { bg: 'rgba(204, 57, 140, 0.2)', text: '#b82879' },
  violet:    { bg: 'rgba(191, 61, 191, 0.2)', text: '#a630a6' },
  purple:    { bg: 'rgba(141, 85, 237, 0.2)', text: '#7a35f0' },
  indigo:    { bg: 'rgba(91, 101, 245, 0.2)', text: '#4752e6' },
  neutral:   { bg: 'rgba(31, 35, 41, 0.1)',   text: '#646a73' },
};

/**
 * 表格 options 列（选项标签）专用色板。
 *
 * 客户端 table → TextTag 时带 `tagStyle: 'table'`，查表键是 `<color>_table`，
 * 不是正文 text_tag 的半透明色：
 *   font_color = text-title（light N900 #1f2329）——统一深色字，不跟色系走
 *   bg_color   = <C>100 实心浅色（neutral 用 N200）
 * 且只登记了 11 个色：violet / indigo **没有** _table 变体（真机会回退成
 * 普通蓝色 text_tag）。来源：fallbackStyle.text_tag.color / 官方表格文档示例图。
 */
export const TABLE_TAG_COLOR: Record<string, { bg: string; text: string }> = {
  red:       { bg: PALETTE.R100, text: PALETTE.N900 },
  orange:    { bg: PALETTE.O100, text: PALETTE.N900 },
  yellow:    { bg: PALETTE.Y100, text: PALETTE.N900 },
  lime:      { bg: PALETTE.L100, text: PALETTE.N900 },
  green:     { bg: PALETTE.G100, text: PALETTE.N900 },
  turquoise: { bg: PALETTE.T100, text: PALETTE.N900 },
  wathet:    { bg: PALETTE.W100, text: PALETTE.N900 },
  blue:      { bg: PALETTE.B100, text: PALETTE.N900 },
  carmine:   { bg: PALETTE.C100, text: PALETTE.N900 },
  purple:    { bg: PALETTE.P100, text: PALETTE.N900 },
  neutral:   { bg: PALETTE.N200, text: PALETTE.N900 },
};

/**
 * 容器浅色背景（column/interactive_container 的 backgroundStyle="<color>-50"）。
 * 对应飞书 --<C>50 token（比 header 的 -100 更浅），用作彩色提示块底色。
 */
export const BG_LIGHT_50: Record<NamedColor, string> = (() => {
  const out = {} as Record<NamedColor, string>;
  for (const n of Object.keys(COLOR_FAMILY) as NamedColor[]) {
    out[n] = PALETTE[COLOR_FAMILY[n] + '50'];
  }
  return out;
})();

/**
 * 图标尺寸枚举 -> px（icon_size_value，逆向自 be8b738f.js）。
 * 缺省/未知尺寸按 16 处理。size 同时作用于 font-size 与 width/height。
 */
export const ICON_SIZE_MAP: Record<string, number> = {
  small: 16,
  normal: 16,
  large1: 16,
  large2: 18,
  large3: 20,
  large4: 20,
};

/**
 * 图标命名色 -> hex。
 * 引擎查表顺序：default_color_tokens 再被 icon_color 覆盖（a([default, icon_color])）。
 * icon_color 特例：blue→B500、green→G500、orange→O500、red→R500 等；
 * 其余族名（indigo/wathet/…）走 default_color_tokens 的 -600 档。
 * 未命中且非 #/rgb 的 color 视为「不指定」，继承父级文字色（currentColor）。
 */
export const ICON_COLOR_MAP: Record<string, string> = (() => {
  // 先铺 default_color_tokens：无后缀族名 → -600
  const out: Record<string, string> = {};
  for (const [name, letter] of Object.entries(COLOR_FAMILY)) {
    out[name] = PALETTE[letter + '600'];
  }
  // icon_color 覆盖（引擎权威特例）
  out.red = PALETTE.R500;       // function-danger-500
  out.green = PALETTE.G500;     // function-success-500
  out.orange = PALETTE.O500;    // function-warning-500
  out.blue = PALETTE.B500;
  out.grey = PALETTE.N600;      // icon-n2
  out.black = PALETTE.N800;     // icon-n1
  out.white = PALETTE.N00;
  out.disabled = PALETTE.N400;  // icon-disabled
  out['neutral-500'] = PALETTE.N500;
  // 带档位的色名（indigo-500 等）运行期走 paletteColor，不进此表
  return out;
})();

/**
 * 真机用 SVG 组件绘制的彩色图标（token → 样式类）。
 *
 * ud-icons 是**单色轮廓**字体（woff2 无 COLR/CPAL 彩色表），`*_colorful` 的 glyph 只能被
 * 外部单色画出；而且字体 glyph 的形状也不保证与真机一致——`ai-common_colorful` 的
 * \f128 在四角星右上角多画了一颗小星，而客户端 `AiCommonColorful` 只有一颗四角星
 * （逆向自客户端 SVG 组件：24×24，linearGradient #4752E6→#CF5ECF；dark #7B83F7→#B54AB5）。
 *
 * 命中本表的 token 由 renderIcon 换成「不挂 ud-icon_ token 类的 <i> + 背景图」渲染，
 * 图形在 styles.css 里以 data URI 内联真机 SVG（`.universal-card-icon--ai-common-colorful`，
 * 暗色走 `.theme-dark` 覆盖）；未命中的 `*_colorful` 保持单色（与网页版一致）。
 */
export const SVG_COLORFUL_ICONS: Record<string, string> = {
  'ai-common_colorful': `${CLS}-icon--ai-common-colorful`,
  'ai-common_colorful-dm': `${CLS}-icon--ai-common-colorful`,
};

/** 人员尺寸 token（逆向自网页版 fallbackStyle.person.single_size / person.size） */
export type PersonSizeToken = {
  avatar_size: number;
  name_font_size: number;
  name_line_height: number;
  name_avatar_column_gap?: number;
  name_avatar_row_gap?: number;
};

/**
 * person_v1 单人尺寸表（fallbackStyle.person.single_size）。
 * 真机在「头像+姓名」时还会按 capsule/normal 再算一次头像边长，见 renderPersonChip。
 */
export const PERSON_SINGLE_SIZE: Record<string, PersonSizeToken> = {
  extra_small: { avatar_size: 20, name_font_size: 12, name_line_height: 20 },
  small: { avatar_size: 24, name_font_size: 16, name_line_height: 24 },
  medium: { avatar_size: 30, name_font_size: 20, name_line_height: 30 },
  large: { avatar_size: 40, name_font_size: 26, name_line_height: 40 },
};

/**
 * markdown 内联 person「头像+姓名（normal）」的头像/行高表（逆向网页版 Person ks 表）。
 * key = 正文字号 px；只覆盖 14/16/17，其余字号头像直接取引擎行高 de(fontSize)。
 * 仅头像、胶囊两类走另外的公式，见 renderPersonChip。
 */
export const PERSON_FOLLOW_FONT: Record<number, { avatarSize: number; lineHeight: number }> = {
  14: { avatarSize: 18, lineHeight: 22 },
  16: { avatarSize: 17, lineHeight: 24 },
  17: { avatarSize: 22, lineHeight: 26 },
};

/**
 * 胶囊（带姓名）内头像再收紧 2px 的字号档（逆向网页版 Person Ls 集合）。
 * 只有 24/30px 这两个超大档会命中，避免胶囊被大字号撑得过高。
 */
export const PERSON_CAPSULE_TIGHT_SIZE_KEYS = new Set([
  'xxx-large', 'heading-1', 'xxxx-large', 'heading-0',
]);

/**
 * person_list 尺寸表（fallbackStyle.person.size）。
 * 缺省/未知按 medium。
 */
export const PERSON_LIST_SIZE: Record<string, PersonSizeToken> = {
  table: {
    avatar_size: 20, name_font_size: 14, name_line_height: 20,
    name_avatar_column_gap: 8, name_avatar_row_gap: 4,
  },
  extra_small: {
    avatar_size: 20, name_font_size: 12, name_line_height: 20,
    name_avatar_column_gap: 12, name_avatar_row_gap: 2,
  },
  small: {
    avatar_size: 24, name_font_size: 14, name_line_height: 22,
    name_avatar_column_gap: 12, name_avatar_row_gap: 4,
  },
  medium: {
    avatar_size: 32, name_font_size: 16, name_line_height: 24,
    name_avatar_column_gap: 12, name_avatar_row_gap: 6,
  },
  large: {
    avatar_size: 40, name_font_size: 18, name_line_height: 26,
    name_avatar_column_gap: 16, name_avatar_row_gap: 8,
  },
};

/**
 * 兼容旧调用：单人头像边长粗略映射（normal + 姓名时 ≈ name_line_height）。
 * 新逻辑请用 PERSON_SINGLE_SIZE / PERSON_LIST_SIZE。
 */
export const PERSON_SIZE_MAP: Record<string, number> = {
  extra_small: 20,
  small: 20,
  medium: 30,
  large: 32,
};

/**
 * 头像图公开地址：飞书头像 key 可经 static-resource 直取（无需鉴权）。
 * 最终 src = PERSON_AVATAR_BASE + avatar_key + PERSON_AVATAR_SUFFIX。
 * 经验证：GET <base><key>~?image_size=... 返回 image/webp 200。
 */
export const PERSON_AVATAR_BASE = 'https://internal-api-lark-file.feishu.cn/static-resource/v1/';
/** 头像 URL 后缀：'~' 接在 key 后，再带尺寸/格式查询串 */
export const PERSON_AVATAR_SUFFIX = '~?image_size=64x64&cut_type=&quality=&format=webp&sticker_format=.webp';

/**
 * 人员表缺失时（离线 DSL / 无 json_attachment.persons）person_v1 / person_list 的降级展示：
 * 固定头像 + 姓名胶囊，避免「? + 截断 ID」占位。
 */
export const PERSON_FALLBACK_NAME = '赵天雄';
export const PERSON_FALLBACK_AVATAR =
  'https://s3-imfile.feishucdn.com/static-resource/v1/v3_0013s_f2d0e8ac-9d05-4aef-8f14-7486b1db129g~?image_size=72x72&cut_type=&quality=&format=image&sticker_format=.webp';

/** 人员表存在但 ID 查无时的「未知用户」（与飞书 Lark_CardCompt_UnknownUser 一致） */
export const PERSON_UNKNOWN_NAME = '未知用户';
/** 未知用户头像（网页版默认灰人像 SVG） */
export const PERSON_UNKNOWN_AVATAR =
  'https://sf1-scmcdn-cn.feishucdn.com/obj/feishu-static/ee/web-client-next/p/contents/messenger/assets/img/502e44f397.svg';

/** person_list 仅名字模式的姓名分隔符（全角逗号，Lark_SmartCard_Comma） */
export const PERSON_LIST_COMMA = '，';

/** 富文本 `<at id=...>` 查不到姓名时的降级显示名（避免露出 open_id） */
export const AT_FALLBACK_NAME = '张三';

/**
 * markdown 首元素是 heading 时，前缀图标的默认尺寸（引擎 `Aa(level)`）：
 * 1→22、2→20、3→16、4/5/6→14。注意这不是 heading 字号本身——
 * 引擎对 heading 前缀图标单独给了一套尺寸（比字号大一圈）。
 */
export const HEADING_ICON_SIZE: Record<number, number> = {
  1: 22,
  2: 20,
  3: 16,
  4: 14,
  5: 14,
  6: 14,
};

/**
 * 表格（table）行高枚举 -> px。取自客户端 fallbackStyle.table.row_height_map
 * （feishu-web-dump/debugger/1dac9008…js：`row_height_map:{low:32,middle:54,high:88}`）。
 * 缺省/未知按 low 处理——客户端组件默认 rowHeightValue = {builtin_table_row_height, low}。
 * 注意：低/高两档之前写成 40/68（按「行高 = 文本高 + 内边距」猜的），与真机不符。
 */
export const TABLE_ROW_HEIGHT: Record<string, number> = {
  low: 32,
  middle: 54,
  high: 88,
};

/**
 * 表格行高枚举 -> 单元格文本最大行数。客户端 `Wi={low:1,middle:2,high:3}`（al()）：
 * 单元格文本不会自动换行撑高行，而是按行高裁到 N 行、超出用省略号收尾。
 */
export const TABLE_ROW_HEIGHT_LINES: Record<string, number> = {
  low: 1,
  middle: 2,
  high: 3,
};

/** 自动行高（row_height=auto / builtin_table_row_height_extension）默认最大高度：fallbackStyle.table.max_row_height */
export const TABLE_ROW_MAX_HEIGHT = 124;

/** 自适应列（未写 width）的最小列宽：客户端 columnDefaultWidth 下限 128px，空间不够时表格横向滚动 */
export const TABLE_COLUMN_MIN_WIDTH = 128;

/**
 * 自定义像素行高 -> 文本行数。客户端 al() 的阈值（不是等分）：
 * `<54 → 1 行，<88 → 2 行，<110 → 3 行，<132 → 4 行，其余 5 行`。
 */
export function tableLinesForRowHeightPx(px: number): number {
  if (px < 54) return 1;
  if (px < 88) return 2;
  if (px < 110) return 3;
  if (px < 132) return 4;
  return 5;
}

/**
 * 表头背景（header_style.background_style）-> CSS 底色。
 * 取值来自客户端的 fallbackStyle 表：
 *   table.background_color.grey → token `udtoken-table-bg-head`（light = #f2f3f5 = N100，
 *   见 feishu-web-dump/debugger/043fcf54…js 的 token 模块与 19ecdc88…js 的 light 主题表）。
 * 注意不是 `udtoken-table-bg-grey`（那个才是 N50 #f5f6f7）——之前写成 #f5f6f7 比真机偏浅。
 * 缺省/unknown 走 none（无底色，继承表格底色 --bg-float = 白）。
 */
export const TABLE_HEAD_BG: Record<string, string> = {
  grey: '#f2f3f5',
  none: 'transparent',
  default: 'transparent',
};

/**
 * 图表（chart）默认序列色板。#21/D11：对齐飞书卡片图表 VChart light 主题
 * brand.light.normal 的 30 色序列（首色 #4e83fd），而非 VChart 通用默认。
 * hydrate 时若 spec 未显式给 color，注入此序列。
 */
export const CHART_PALETTE: string[] = [
  '#4e83fd', '#50cefb', '#935af6', '#fad355', '#f76964', '#ffa53d',
  '#82a7fc', '#7edafb', '#ad82f7', '#f7dc82', '#f98e8b', '#ffba6b',
  '#3370ff', '#14c0ff', '#7f3bf5', '#ffc60a', '#f54a45', '#ff8800',
  '#bacefd', '#b1e8fc', '#cdb2fa', '#f8e6ab', '#fbbfbc', '#fed4a4',
  '#245bdb', '#049fd7', '#6425d0', '#dc9b04', '#d83931', '#de7802',
];

/**
 * 图表（chart）默认内边距：真机给 VChart 的 light/dark 主题里 `padding` 是
 * `{top:12,right:12,left:12,bottom:0}`（逆向自 electron main-window/627/729f5c7242.js 模块 658511）。
 * VChart 自带 light 主题缺省是 `padding: 20`（四边 20），不覆盖会每边多出 8~20px —— 之前
 * 渲染器看起来「内边距加多了」就是这个原因。
 */
export const CHART_DEFAULT_PADDING = { top: 12, right: 12, left: 12, bottom: 0 };

/**
 * 图表容器尺寸常量（逆向自网页版飞书 chart 组件）。
 * - 缺省宽高比 PC 为 16:9（文档；客户端同样默认 "16:9"）
 * - 走宽高比时 minHeight=150 / minWidth=200；走像素 height 时下限降为 1
 */
export const CHART_DEFAULT_ASPECT_RATIO = '16:9';
export const CHART_MIN_HEIGHT = 150;
export const CHART_MIN_WIDTH = 200;
export const CHART_FIXED_MIN_SIZE = 1;

/** 1->A 2->B ... 27->AA（引擎 charCode 算法） */
function toAlpha(n: number): string {
  let s = '', e = n - 1;
  for (; e >= 0; e = Math.floor(e / 26) - 1) s = String.fromCharCode((e % 26) + 65) + s;
  return s;
}
/** 阿拉伯数字 -> 小写罗马 */
function toRoman(n: number): string {
  const map: Array<[number, string]> = [
    [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'],
    [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
  ];
  let r = '';
  for (const [v, sym] of map) while (n >= v) { r += sym; n -= v; }
  return r;
}
/** 有序列表按嵌套层级循环：数字 / 大写字母 / 小写罗马 */
export const ORDER_STYLES: Array<(n: number) => string> = [
  (n: number) => String(n),
  toAlpha,
  toRoman,
];
