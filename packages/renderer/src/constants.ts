/**
 * 渲染常量。颜色/字号等规则均从网页版飞书引擎 (be8b738f.js) 与
 * edbaaa5b.css 中逆向抽取，详见 README 的「渲染规则」一节。
 */
import type { HeaderTemplate, NamedColor } from './types';

/** 默认字号（飞书引擎 const X=14） */
export const BASE_FONT_SIZE = 14;
/** 默认行高（飞书引擎 const Z=1.6） */
export const BASE_LINE_HEIGHT = 1.6;

/**
 * 字号 -> 行高表（网页版飞书引擎 `ce` 表，见 feishu-web-dump 320657bc.js）：
 * `de(size) = ce[size] ?? size * 1.6`。不要再用「字号 + 8」——两者在
 * 12/14/16 恰好重合，但 18 以上开始分叉（18→28 而非 26，20→30 而非 28）。
 */
export const LINE_HEIGHT_BY_FONT_SIZE: Record<number, number> = {
  8: 12, 9: 16, 10: 16, 11: 18, 12: 20, 13: 20, 14: 22, 15: 22, 16: 24, 17: 24,
  18: 28, 19: 28, 20: 30, 21: 32, 22: 32, 23: 34, 24: 36, 25: 38, 26: 40, 27: 42,
  28: 44, 29: 44, 30: 46, 31: 46, 32: 48, 33: 50, 34: 52,
};

/**
 * 消息卡片（桌面端）行高补偿。真机 Markdown 组件：
 * `lineHeight = de(fontSize) + (_isFromMessageCard && !isMobile ? 2 : 0)`。
 * 本渲染器的用途就是「消息里那张卡片 + 桌面端」，故恒为 2。
 * 只有显式给了 text_size 时才写死行高；没给就继续走 CSS 的 line-height:1.6。
 */
export const MESSAGE_CARD_LINE_HEIGHT_DELTA = 2;

/** 字号 -> 行高（引擎 `de()`）：查表，表外按 1.6 倍字号 */
export function lineHeightForFontSize(fontSize: number): number {
  return LINE_HEIGHT_BY_FONT_SIZE[fontSize] ?? fontSize * BASE_LINE_HEIGHT;
}

/** 消息卡片正文行高（含桌面端 +2 补偿） */
export function textLineHeight(fontSize: number): number {
  return lineHeightForFontSize(fontSize) + MESSAGE_CARD_LINE_HEIGHT_DELTA;
}
/** className 前缀（飞书引擎 const J="universal-card"） */
export const CLS = 'universal-card';

/**
 * markdown 组件 text_size 枚举 -> 字号 px（逆向自网页版飞书正文分级）。
 * 行高不按「字号 + 8」写死，走 {@link lineHeightForFontSize} 的引擎行高表。
 * 缺省/未知按 normal（14px）处理。带 heading-N / *-large 别名一并覆盖。
 */
export const TEXT_SIZE_MAP: Record<string, number> = {
  'heading-0': 30, 'heading-1': 24, 'heading-2': 20, 'heading-3': 18, 'heading-4': 16,
  heading: 16,
  'xxxx-large': 30, 'xxx-large': 24, 'xx-large': 20, 'x-large': 18, large: 16,
  normal: 14, medium: 14,
  small: 12, 'x-small': 10,
  notation: 12,
};

/** textStyle.size 枚举 -> px（与 TEXT_SIZE_MAP 对齐，含 notation/heading） */
export const SIZE_MAP: Record<string, number> = {
  'x-small': 10,
  small: 12,
  notation: 12,
  normal: 14,
  medium: 14,
  large: 16,
  heading: 16,
  'heading-4': 16,
  'x-large': 18,
  'heading-3': 18,
  'xx-large': 20,
  'heading-2': 20,
  'xxx-large': 24,
  'heading-1': 24,
  'xxxx-large': 30,
  'heading-0': 30,
};

/**
 * 飞书色阶调色板（light 主题，`:root` 全局默认）。逆向自网页版飞书
 * 4699.*.css 的 `:root{}`（144+ token）。键形如 B500/N600/N00。
 * 这是本库所有命名色/背景色的唯一 hex 事实源——正文 <font color>、
 * header、text_tag、容器背景最终都解析到这里的某个色阶值。
 * 注：飞书还存在 `div[_pp-theme]`（Lark 容器）另一套 light 值（如 B600=#245bdb），
 * 本库统一采用 `:root` 全局默认套系。
 */
export const PALETTE: Record<string, string> = {
  B50: '#f0f4ff', B100: '#e0e9ff', B200: '#c2d4ff', B300: '#94b4ff', B350: '#7aa2ff',
  B400: '#5083fb', B500: '#336df4', B600: '#1456f0', B700: '#0442d2', B800: '#002f9e', B900: '#002270',
  C50: '#fef0f8', C100: '#fee2f2', C200: '#f8c4e1', C300: '#f598cc', C350: '#eb78b8',
  C400: '#df58a5', C500: '#cc398c', C600: '#b82879', C700: '#9d1562', C800: '#730744', C900: '#550c35',
  G50: '#e4fae1', G100: '#d0f5ce', G200: '#95e599', G300: '#5cd168', G350: '#35bd4b',
  G400: '#32a645', G500: '#258832', G600: '#1a7526', G700: '#0b6017', G800: '#04430c', G900: '#022c07',
  I50: '#f2f3fd', I100: '#e9eafb', I200: '#cccff9', I300: '#abb0f2', I350: '#959bee',
  I400: '#757df0', I500: '#5b65f5', I600: '#4752e6', I700: '#333dcc', I800: '#1e27a4', I900: '#151b70',
  L50: '#f2f8d3', L100: '#e3f0a3', L200: '#c8dd5f', L300: '#a2c10b', L350: '#91ad00',
  L400: '#7b9207', L500: '#6b7f06', L600: '#5c6d08', L700: '#4a5804', L800: '#333d00', L900: '#262e00',
  N00: '#ffffff', N50: '#f5f6f7', N100: '#f2f3f5', N200: '#eff0f1', N300: '#dee0e3', N350: '#d0d3d6',
  N400: '#bbbfc4', N500: '#8f959e', N600: '#646a73', N650: '#51565d', N700: '#373c43',
  N800: '#2b2f36', N900: '#1f2329', N950: '#0f1114', N1000: '#000000',
  O50: '#fff3e5', O100: '#fee7cd', O200: '#fec48b', O300: '#ff9d4c', O350: '#ff811a',
  O400: '#ed6d0c', O500: '#c25705', O600: '#a44904', O700: '#853a05', O800: '#642b02', O900: '#3b1a02',
  P50: '#f5f0fe', P100: '#efe6fe', P200: '#dcc9fd', P300: '#c8a9fc', P350: '#b791fa',
  P400: '#9f6ff1', P500: '#8d55ed', P600: '#7a35f0', P700: '#611fd6', P800: '#4811a6', P900: '#2f0080',
  R50: '#fef0f0', R100: '#fee3e2', R200: '#fdc6c4', R300: '#f89e9b', R350: '#ff7570',
  R400: '#f54a45', R500: '#e22e28', R600: '#c02a26', R700: '#a11c17', R800: '#741915', R900: '#590603',
  S50: '#ffffdb', S100: '#fffca3', S200: '#fff67a', S300: '#fff258', S350: '#ffe928',
  S400: '#e5ce00', S500: '#c2a800', S600: '#8f7c00', S700: '#5c4f00', S800: '#423700', S900: '#2c2502',
  T50: '#e2f8f5', T100: '#c4f2ec', T200: '#6fe8d8', T300: '#33d6c0', T350: '#2dbeab',
  T400: '#10a893', T500: '#0f8575', T600: '#067062', T700: '#045d51', T800: '#03443b', T900: '#02312a',
  V50: '#fceefc', V100: '#f9e2f9', V200: '#f3c4f3', V300: '#e59ce5', V350: '#de81de',
  V400: '#cf5ecf', V500: '#bf3dbf', V600: '#a630a6', V700: '#872787', V800: '#6a116a', V900: '#520052',
  W50: '#e7f8fe', W100: '#caeffc', W200: '#97dcfc', W300: '#3ec3f7', W350: '#25b0e7',
  W400: '#1295ca', W500: '#047fb0', W600: '#076a94', W700: '#0f587a', W800: '#06415c', W900: '#072b3d',
  Y50: '#fbf4df', Y100: '#faedc2', Y200: '#fcdf7e', Y300: '#fad355', Y350: '#ffc60a',
  Y400: '#d99904', Y500: '#ad7a03', Y600: '#865b03', Y700: '#6f4a01', Y800: '#573601', Y900: '#382201',
};

/** 颜色族名 -> 色阶字母前缀（逆向自引擎 JS 颜色名→token 映射表） */
const COLOR_FAMILY: Record<string, string> = {
  blue: 'B', carmine: 'C', green: 'G', indigo: 'I', lime: 'L',
  orange: 'O', purple: 'P', red: 'R', sunflower: 'S', turquoise: 'T',
  violet: 'V', wathet: 'W', yellow: 'Y', grey: 'N', neutral: 'N',
};

/**
 * 颜色名 -> 色阶 token（引擎权威映射，逆向自网页版飞书引擎 JS）。
 * 规则：`<族名>-<档位>` 直映到 `<字母><档位>`（如 blue-500→B500、grey-50→N50）；
 * 无档位的族名默认落 `-600`（blue→B600、green→G600 …），唯 grey→N600（同 -600 档）。
 * 生成时覆盖 50/100/200/300/350/400/500/600/700/800/900 全档 + 无后缀默认。
 */
export const COLOR_NAME_TO_TOKEN: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  const scales = ['50', '100', '200', '300', '350', '400', '500', '600', '700', '800', '900'];
  for (const [name, letter] of Object.entries(COLOR_FAMILY)) {
    map[name] = letter + '600'; // 无后缀默认 -600
    for (const s of scales) map[`${name}-${s}`] = letter + s;
  }
  // grey 特有的额外档位（引擎表里 grey-00/650/950/1000 等，映射到 N 系）
  map['grey-00'] = 'N00';
  map['grey-650'] = 'N650';
  map['grey-950'] = 'N950';
  map['grey-1000'] = 'N1000';
  // 引擎 default_color_tokens / markdown.font_color：white → static-white（#fff）。
  // 本库无 --static-white，等价落到 N00；否则 <font color='white'> 解析失败继承深色正文。
  map.white = 'N00';
  // icon_color.black → icon-n1（N800）；正文偶发 color='black' 与之对齐
  map.black = 'N800';
  return map;
})();

/** 颜色名/色阶 token/自定义色 -> hex。解析不出则返回 undefined（不污染 style）。 */
export function paletteColor(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const token = COLOR_NAME_TO_TOKEN[raw];
  if (token && PALETTE[token]) return PALETTE[token];
  if (PALETTE[raw]) return PALETTE[raw]; // raw 本身是色阶 token（如 B600）
  return undefined;
}

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
 * markdown 内联 person 跟随正文字号时的头像/行高表（逆向网页版 Person hl 表）。
 * key = 正文字号 px；缺省回退 lineHeight=fontSize+8、avatar≈lineHeight 公式。
 */
export const PERSON_FOLLOW_FONT: Record<number, { avatarSize: number; lineHeight: number }> = {
  14: { avatarSize: 18, lineHeight: 22 },
  16: { avatarSize: 17, lineHeight: 24 },
  17: { avatarSize: 22, lineHeight: 26 },
};

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

/** markdown heading level -> 字号规则，取自引擎默认 heading 表 */
export const HEADING_LEVELS: Record<number, {
  fontSize: number; fontWeight: number; lineHeight: number; marginTop: number; marginBottom: number;
}> = {
  1: { fontSize: 17, fontWeight: 600, lineHeight: 28, marginTop: 10, marginBottom: 6 },
  2: { fontSize: 16, fontWeight: 600, lineHeight: 24, marginTop: 10, marginBottom: 6 },
  3: { fontSize: 14, fontWeight: 500, lineHeight: 22, marginTop: 8, marginBottom: 6 },
  4: { fontSize: 14, fontWeight: 500, lineHeight: 22, marginTop: 8, marginBottom: 6 },
  5: { fontSize: 14, fontWeight: 500, lineHeight: 22, marginTop: 8, marginBottom: 6 },
  6: { fontSize: 14, fontWeight: 500, lineHeight: 22, marginTop: 8, marginBottom: 6 },
};

/**
 * 表格（table）行高枚举 -> px（逆向自网页版 --universal-card-table-row-height）。
 * 缺省/未知按 middle 处理。
 */
export const TABLE_ROW_HEIGHT: Record<string, number> = {
  low: 40,
  middle: 54,
  high: 68,
};

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
