/**
 * 预测用的文字度量。
 *
 * 常量与 `@open-feishu-card/renderer` 逆向出来的真机规则保持一致：
 * - 字号枚举 → px（renderer `TEXT_SIZE_MAP`）
 * - 字号 → 行高（renderer `lineHeightForFontSize` + 消息卡片桌面端 +2）
 * - markdown 没写 text_size 时的 14px / line-height 1.6
 *
 * 字宽表来自 Arial（Linux/Windows 常见回退字体）14px 的 canvas measureText，
 * 归一成 em。真机在 macOS 用 Helvetica Neue、Windows 用 Tahoma，字宽会差 1%–3%，
 * 所以 ASCII 统一乘一个 `FONT_WIDTH_SAFETY`，宁可多折一行（高度偏大留白），
 * 也不要在真机上把最后一行裁掉。CJK / 全角标点在所有常见字体里都是 1em，不放大。
 *
 * 本包不引 renderer：它的 dist 会把整套组件和 CSS 字符串带进 Node，
 * 对只需要做一次布局预测的发送前流程太重。这里保留最小常量集，
 * `test/metrics-sync.test.ts` 用 renderer 的导出做同步校验。
 */

/** renderer `TEXT_SIZE_MAP`：text_size 枚举 → 字号 px。 */
export const TEXT_SIZE_PX: Record<string, number> = {
  'heading-0': 30, 'heading-1': 24, 'heading-2': 20, 'heading-3': 18, 'heading-4': 16,
  heading: 16,
  'xxxx-large': 30, 'xxx-large': 24, 'xx-large': 20, 'x-large': 18, large: 16,
  normal: 14, medium: 14,
  small: 12, 'x-small': 10,
  notation: 12,
};

/** renderer `LINE_HEIGHT_BY_FONT_SIZE`（客户端 `de()` 行高表）。 */
const LINE_HEIGHT_BY_FONT_SIZE: Record<number, number> = {
  8: 12, 9: 16, 10: 16, 11: 18, 12: 20, 13: 20, 14: 22, 15: 22, 16: 24, 17: 24,
  18: 28, 19: 28, 20: 30, 21: 32, 22: 32, 23: 34, 24: 36, 25: 38, 26: 40, 27: 42,
  28: 44, 29: 44, 30: 46, 31: 46, 32: 48, 33: 50, 34: 52,
};

/** 消息卡片桌面端行高补偿（客户端 `_isFromMessageCard && !isMobile`）。 */
const MESSAGE_CARD_LINE_HEIGHT_DELTA = 2;

/** 默认字号 / 行高（renderer 的 BASE_FONT_SIZE / BASE_LINE_HEIGHT）。 */
export const BASE_FONT_SIZE = 14;
export const BASE_LINE_HEIGHT = 1.6;

/** 显式 text_size 时的行高：引擎表 + 2px。 */
export function lineHeightForFontSize(fontSize: number): number {
  return (LINE_HEIGHT_BY_FONT_SIZE[fontSize] ?? fontSize * BASE_LINE_HEIGHT)
    + MESSAGE_CARD_LINE_HEIGHT_DELTA;
}

/** 没写 text_size 时的 CSS 行高：14 × 1.6 = 22.4px。 */
export const DEFAULT_LINE_HEIGHT = BASE_FONT_SIZE * BASE_LINE_HEIGHT;

/** text_size 枚举 → 字号；认不出按 normal。 */
export function fontSizeOf(size: unknown): number {
  if (typeof size === 'number' && Number.isFinite(size) && size > 0) return size;
  if (typeof size === 'string') {
    const px = TEXT_SIZE_PX[size.trim()];
    if (px != null) return px;
  }
  return BASE_FONT_SIZE;
}

/* ------------------------------------------------------------------ *
 * 字宽（em）
 * ------------------------------------------------------------------ */

/** Arial 14px 的 ASCII 0x20–0x7E 字宽，单位 em。 */
const ASCII_NORMAL = [
  0.27783, 0.27783, 0.35498, 0.55615, 0.55615, 0.88916, 0.66699, 0.19092, 0.33301, 0.33301,
  0.38916, 0.58399, 0.27783, 0.33301, 0.27783, 0.27783, 0.55615, 0.55615, 0.55615, 0.55615,
  0.55615, 0.55615, 0.55615, 0.55615, 0.55615, 0.55615, 0.27783, 0.27783, 0.58399, 0.58399,
  0.58399, 0.55615, 1.01514, 0.66699, 0.66699, 0.72217, 0.72217, 0.66699, 0.61084, 0.77783,
  0.72217, 0.27783, 0.50000, 0.66699, 0.55615, 0.83301, 0.72217, 0.77783, 0.66699, 0.77783,
  0.72217, 0.66699, 0.61084, 0.72217, 0.66699, 0.94385, 0.66699, 0.66699, 0.61084, 0.27783,
  0.27783, 0.27783, 0.46924, 0.55615, 0.33301, 0.55615, 0.55615, 0.50000, 0.55615, 0.55615,
  0.27783, 0.55615, 0.55615, 0.22217, 0.22217, 0.50000, 0.22217, 0.83301, 0.55615, 0.55615,
  0.55615, 0.55615, 0.33301, 0.50000, 0.27783, 0.55615, 0.50000, 0.72217, 0.50000, 0.50000,
  0.50000, 0.33399, 0.25976, 0.33399, 0.58399,
] as const;

/** Arial Bold 14px 的 ASCII 0x20–0x7E 字宽，单位 em。 */
const ASCII_BOLD = [
  0.27783, 0.33301, 0.47412, 0.55615, 0.55615, 0.88916, 0.72217, 0.23779, 0.33301, 0.33301,
  0.38916, 0.58399, 0.27783, 0.33301, 0.27783, 0.27783, 0.55615, 0.55615, 0.55615, 0.55615,
  0.55615, 0.55615, 0.55615, 0.55615, 0.55615, 0.55615, 0.33301, 0.33301, 0.58399, 0.58399,
  0.58399, 0.61084, 0.97510, 0.72217, 0.72217, 0.72217, 0.72217, 0.66699, 0.61084, 0.77783,
  0.72217, 0.27783, 0.55615, 0.72217, 0.61084, 0.83301, 0.72217, 0.77783, 0.66699, 0.77783,
  0.72217, 0.66699, 0.61084, 0.72217, 0.66699, 0.94385, 0.66699, 0.66699, 0.61084, 0.33301,
  0.27783, 0.33301, 0.58399, 0.55615, 0.33301, 0.55615, 0.61084, 0.55615, 0.61084, 0.55615,
  0.33301, 0.61084, 0.61084, 0.27783, 0.27783, 0.55615, 0.27783, 0.88916, 0.61084, 0.61084,
  0.61084, 0.61084, 0.38916, 0.55615, 0.33301, 0.61084, 0.55615, 0.77783, 0.55615, 0.55615,
  0.50000, 0.38916, 0.27979, 0.38916, 0.58399,
] as const;

/** ASCII 字宽的保守系数：macOS / Windows 字体与 Arial 有 1%–3% 差异。 */
const FONT_WIDTH_SAFETY = 1.03;

/** 全角 / CJK 区段（这些区段在所有常见中文字体里都是 1em）。 */
function isCjkOrFullwidth(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) // Hangul Jamo
    || (cp >= 0x2e80 && cp <= 0xa4cf) // CJK 部首、标点、汉字、假名、谚文兼容
    || (cp >= 0xac00 && cp <= 0xd7a3) // Hangul 音节
    || (cp >= 0xf900 && cp <= 0xfaff) // CJK 兼容汉字
    || (cp >= 0xfe30 && cp <= 0xfe4f) // CJK 兼容标点
    || (cp >= 0xff00 && cp <= 0xff60) // 全角 ASCII
    || (cp >= 0xffe0 && cp <= 0xffe6) // 全角符号
    || (cp >= 0x20000 && cp <= 0x2fa1f) // CJK 扩展
  );
}

/** emoji：按 1.05em 估；真机的彩色 emoji 字宽略大于 1em。 */
function isEmoji(cp: number): boolean {
  return (
    (cp >= 0x2600 && cp <= 0x27bf)
    || (cp >= 0x1f000 && cp <= 0x1f2ff)
    || (cp >= 0x1f300 && cp <= 0x1faff)
    || (cp >= 0x1f1e6 && cp <= 0x1f1ff)
  );
}

/** 零宽字符：变体选择符 / ZWJ / 组合音标 / 零宽空格。 */
function isZeroWidth(cp: number): boolean {
  return (
    (cp >= 0x0300 && cp <= 0x036f)
    || (cp >= 0x200b && cp <= 0x200f)
    || (cp >= 0xfe00 && cp <= 0xfe0f)
    || cp === 0xfeff
    || cp === 0x200d
  );
}

function asciiAdvance(cp: number, bold: boolean): number | undefined {
  const index = cp - 0x20;
  if (index < 0 || index >= ASCII_NORMAL.length) return undefined;
  const em = bold ? ASCII_BOLD[index]! : ASCII_NORMAL[index]!;
  return em * FONT_WIDTH_SAFETY;
}

/** 单个字符的字宽（em）。未知字符按 0.6em 估。 */
export function charWidthEm(ch: string, bold: boolean): number {
  const cp = ch.codePointAt(0);
  if (cp == null) return 0;
  if (isZeroWidth(cp)) return 0;
  if (cp === 0x09) return 2; // tab：保守按 2em
  if (cp === 0xa0) return 0.27783; // NBSP
  if (cp <= 0x7e) return asciiAdvance(cp, bold) ?? 0.6;
  if (isCjkOrFullwidth(cp)) return 1;
  if (isEmoji(cp)) return 1.05;
  // 常见排版标点：破折号 / 省略号在真机接近全角。
  if (cp === 0x2014 || cp === 0x2026) return 1;
  return bold ? 0.65 : 0.6;
}

/** 默认文字测量：按字符累加 em 字宽。 */
export function defaultMeasureText(text: string, fontSize: number, bold: boolean): number {
  let em = 0;
  for (const ch of text) em += charWidthEm(ch, bold);
  return em * fontSize;
}

/**
 * 粗略估算一段文字的宽度（供调用方在自定义测量里复用）。
 * 与默认 `defaultMeasureText` 等价。
 */
export const measureTextByChar = defaultMeasureText;
