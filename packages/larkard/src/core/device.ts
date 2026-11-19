/**
 * 真机硬约束：飞书服务端比 Schema 2.0 更严的那几条「值域 / 互斥条件」。
 *
 * Schema 只能表达「字段在不在、类型对不对」。下面这些约束违反时飞书会**整卡拒绝**
 * （`11310 xxx invalid`）或静默丢样式，而 `FeishuCardV2Schema` 全部放行——所以只能
 * 在发送前单独过一遍。每条规则的实测依据记在仓库 `docs/feishu-card-doc-gaps/`。
 *
 * 修复函数是唯一实现：`findDeviceIssues()` 拿它在克隆上的结果反推问题，
 * 检查与修复不会各写一套判断后漂移。
 */
import type { CheckIssue } from './check-types.js';

export type DeviceRule =
  /** `horizontal_spacing` / `vertical_spacing` 的取值域（11310 spacing invalid） */
  | 'spacing-domain'
  /** `collapsible_panel.header.padding` 只收 0–28px（invalid panel header padding） */
  | 'panel-header-padding'
  /** `audio` / `video` 组件不能带时长字段（时长在上传时确定） */
  | 'media-duration'
  /** 含音视频时必须 `config.enable_forward = false` */
  | 'media-enable-forward'
  /** `collapsible_panel` 写了 `interactive_container` 的边框字段（Schema 静默剥离） */
  | 'panel-border-field'
  /** `corner_radius` 只接受单个 px / 百分比值，四角多值真机不支持 */
  | 'corner-radius-domain'
  /** `markdown.font_color` 是 DSL 便利字段，发送接口不认（200621 unknown property） */
  | 'markdown-font-color';

export interface DeviceIssue extends CheckIssue {
  severity: 'error' | 'warning';
  source: 'device';
  /** 命中的规则名，与 `code` 同值；保留在类型上方便 switch 穷举 */
  code: DeviceRule;
  /** `false` 表示只能提示、不能机械修复（删掉等于直接丢样式，交给调用方决定） */
  fixable: boolean;
}

export interface RepairResult {
  /** 修复后的新卡片；入参不会被修改 */
  card: Record<string, unknown>;
  /** 发现的所有违规，含已修复与不可修复的 */
  issues: DeviceIssue[];
  /** 本轮实际改动的条目（`issues` 中 `fixable` 的子集） */
  fixes: DeviceIssue[];
}

import { DSL_SPACING_TOKENS } from '../content/spacing.js';
import { wrapMarkdownContentWithFontColor } from '../adapter/expand-dsl-colors.js';

/** 合法的间距 token（间距字段是字符串枚举 + px，裸数字 / `auto` / `default` 都会被拒）。 */
const SPACING_TOKENS = DSL_SPACING_TOKENS;
/** 合法的 px 值：0–99，可带小数。整数部分三位（`100px`）真机就拒。 */
const SPACING_PX = /^\d{1,2}(?:\.\d+)?px$/;
/** `collapsible_panel.header.padding` 的上限，超过整卡 400。 */
const PANEL_PADDING_MAX = 28;
/** 属于 `interactive_container`、`collapsible_panel` 不认的边框字段。 */
const PANEL_FOREIGN_FIELDS = ['has_border', 'border_color', 'corner_radius', 'background_style'] as const;
/** 单个圆角值：px 或百分比。飞书不接受 CSS 四角简写（如 `8px 0 0 8px`）。 */
const CORNER_RADIUS = /^\d+(?:\.\d+)?(?:px|%)$/;
/** `corner_radius` 是顶层字段的组件。 */
const CORNER_RADIUS_TOP_LEVEL_TAGS = new Set(['img', 'img_combination', 'interactive_container']);
/** `corner_radius` 在 `border` 对象里的组件。 */
const CORNER_RADIUS_BORDER_TAGS = new Set(['audio', 'collapsible_panel']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

import { toPointer } from './pointer.js';

export { toPointer as pointer };

/**
 * 间距值归一化。
 *
 * 数字按 px 理解（`8` → `8px`）；`8 px` / `8PX` 这类只差格式的写法顺手纠正；
 * `default` / `auto` / 负数 / `>=100px` 一律返回 `undefined`（调用方删字段）。
 */
export function normalizeSpacing(value: unknown): string | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 && Math.floor(value) <= 99 ? `${value}px` : undefined;
  }
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (SPACING_TOKENS.has(text)) return text;
  const compact = text.replace(/\s+/g, '').toLowerCase();
  return SPACING_PX.test(compact) ? compact : undefined;
}

/**
 * 圆角值归一化：飞书只接受**一个** px 或百分比值。
 *
 * - 纯数字按 px 理解（`8` → `8px`），大小写/空格顺手纠正；
 * - 四角简写只有在**四角完全相同时**才有唯一正确解（`8px 8px 8px 8px` → `8px`），
 *   各角不同（`8px 0 0 8px`）返回 undefined，交给调用方报错而不是瞎猜一个角；
 * - 空字符串 / 其它单位 / 负值返回 undefined（真机不支持）。
 */
export function normalizeCornerRadius(value: unknown): string | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? `${value}px` : undefined;
  }
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!text) return undefined;
  const parts = text.split(/\s+/);
  if (parts.length > 1) {
    const normalized = parts.map((part) => normalizeCornerRadius(part));
    const first = normalized[0];
    return first !== undefined && normalized.every((part) => part === first) ? first : undefined;
  }
  const compact = text.toLowerCase();
  if (/^\d+(?:\.\d+)?$/.test(compact)) return `${compact}px`;
  return CORNER_RADIUS.test(compact) ? compact : undefined;
}

/** `padding` 支持 1–4 个 px 值（CSS 简写语义）；解析成四边并夹到 0–28px。 */
function normalizePanelPadding(value: unknown): string | undefined {
  const text =
    typeof value === 'number' ? `${value}px` : typeof value === 'string' ? value.trim() : undefined;
  if (!text) return undefined;
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length === 0 || parts.length > 4) return undefined;
  const nums: number[] = [];
  for (const part of parts) {
    const matched = part.toLowerCase().match(/^(\d+(?:\.\d+)?)px$/);
    if (!matched) return undefined;
    nums.push(Number(matched[1]));
  }
  const [a, b, c, d] = nums;
  const sides =
    parts.length === 1
      ? [a, a, a, a]
      : parts.length === 2
        ? [a, b, a, b]
        : parts.length === 3
          ? [a, b, c, b]
          : [a, b, c, d];
  return sides.map((n) => `${Math.min(PANEL_PADDING_MAX, Math.round(n))}px`).join(' ');
}

function issue(
  path: readonly (string | number)[],
  code: DeviceRule,
  severity: 'error' | 'warning',
  message: string,
  fixable: boolean,
): DeviceIssue {
  return { path: toPointer(path), code, severity, message, source: 'device', fixable };
}

/**
 * 按真机硬约束修复卡片，返回新卡片 + 全部违规 + 实际改动。
 *
 * 输入不会被修改（内部 `structuredClone`）。修复只做「有唯一正确解」的动作：
 * 归一化格式、删掉飞书不认的字段、夹到合法域；`panel-border-field` 这类
 * 删了会丢样式的只报告不改（`fixable: false`）。
 */
export function repairDeviceIssues(input: Record<string, unknown>): RepairResult {
  const card = structuredClone(input);
  const issues: DeviceIssue[] = [];
  const fixes: DeviceIssue[] = [];
  let hasMedia = false;

  const record = (entry: DeviceIssue, applied: boolean): void => {
    issues.push(entry);
    if (applied) fixes.push(entry);
  };

  const walk = (node: unknown, path: (string | number)[]): void => {
    if (Array.isArray(node)) {
      node.forEach((child, index) => walk(child, [...path, index]));
      return;
    }
    if (!isRecord(node)) return;

    for (const key of ['horizontal_spacing', 'vertical_spacing'] as const) {
      if (!(key in node)) continue;
      const raw = node[key];
      // 真机接受的两种「非 px」写法（实测见 docs/feishu-card-doc-gaps/column-spacing-value-domain.md）：
      // - 空串 `""`：等同没设置，所有间距字段都收；
      // - `default` / `auto`：只有 `column_set.horizontal_spacing` 收（落点就是默认值）。
      const acceptedAsIs =
        (typeof raw === 'string' && raw.trim() === '') ||
        (key === 'horizontal_spacing' &&
          node.tag === 'column_set' &&
          typeof raw === 'string' &&
          (raw.trim() === 'default' || raw.trim() === 'auto'));
      const next = acceptedAsIs ? raw : normalizeSpacing(raw);
      if (next === undefined) {
        delete node[key];
        record(
          issue(
            [...path, key],
            'spacing-domain',
            'error',
            `${key} 的取值 ${JSON.stringify(raw)} 不合法：只接受 small / medium / large / extra_large 或 0–99px（可带小数）；飞书会整卡拒绝（11310 spacing invalid）`,
            true,
          ),
          true,
        );
      } else if (next !== raw) {
        node[key] = next;
        record(
          issue(
            [...path, key],
            'spacing-domain',
            'error',
            `${key} 已归一化为 ${JSON.stringify(next)}：飞书只认小写、无空格的字符串 px（原值 ${JSON.stringify(raw)}）`,
            true,
          ),
          true,
        );
      }
    }

    if (node.tag === 'collapsible_panel') {
      const header = node.header;
      if (isRecord(header) && 'padding' in header) {
        const raw = header.padding;
        const next = normalizePanelPadding(raw);
        if (next === undefined) {
          delete header.padding;
          record(
            issue(
              [...path, 'header', 'padding'],
              'panel-header-padding',
              'error',
              `collapsible_panel.header.padding 只接受 0–28px（1–4 个 px 值），${JSON.stringify(raw)} 会让飞书报 invalid panel header padding 并整卡拒绝`,
              true,
            ),
            true,
          );
        } else if (next !== raw) {
          header.padding = next;
          record(
            issue(
              [...path, 'header', 'padding'],
              'panel-header-padding',
              'error',
              `collapsible_panel.header.padding 超出 0–28px 或格式不规范（原值 ${JSON.stringify(raw)}），已夹到 ${next}；超界会让飞书整卡拒绝`,
              true,
            ),
            true,
          );
        }
      }

      const foreign = PANEL_FOREIGN_FIELDS.filter((field) => field in node);
      if (foreign.length > 0) {
        record(
          issue(
            path,
            'panel-border-field',
            'warning',
            `collapsible_panel 不支持 ${foreign.join(' / ')}（那是 interactive_container 的字段）：Schema 会静默剥离，面板不会显示边框。请改用 border 与 background_color`,
            false,
          ),
          false,
        );
      }
    }

    // markdown 的块级字色是 DSL 便利字段：渲染 / adapter 会把它包成 content 里的
    // `<font color>`，但发送接口不认这个属性（200621 unknown property）。展开是
    // 唯一正确解——直接删会丢样式，所以 fixable。
    if (node.tag === 'markdown' && typeof node.font_color === 'string') {
      const raw = node.font_color;
      delete node.font_color;
      if (raw.trim()) {
        const content = typeof node.content === 'string' ? node.content : '';
        const wrapped = wrapMarkdownContentWithFontColor(content, raw);
        if (wrapped !== content) node.content = wrapped;
        record(
          issue(
            [...path, 'font_color'],
            'markdown-font-color',
            'error',
            wrapped !== content
              ? `markdown.font_color 会被飞书拒绝（200621 unknown property）；已展开为 content 内的 <font color='${raw}'>`
              : `markdown.font_color 会被飞书拒绝（200621 unknown property）；content 已有内联 <font color>，块级字色本来就不生效，已删除该字段`,
            true,
          ),
          true,
        );
      }
    }

    if (node.tag === 'audio' || node.tag === 'video') {
      hasMedia = true;
      for (const key of ['duration', 'duration_ms'] as const) {
        if (!(key in node)) continue;
        delete node[key];
        record(
          issue(
            [...path, key],
            'media-duration',
            'error',
            `${node.tag} 组件不能写 ${key}：时长在上传文件时确定，组件里带上会被飞书拒绝`,
            true,
          ),
          true,
        );
      }
    }

    // 圆角：只认一个 px / 百分比值。飞书不支持 CSS 四角简写，
    // 各角不同时没有唯一正确解，只报告不修（删掉会直接丢样式）。
    const radiusHolders: Array<{ holder: Record<string, unknown>; radiusPath: (string | number)[] }> = [];
    if (
      typeof node.tag === 'string' &&
      CORNER_RADIUS_TOP_LEVEL_TAGS.has(node.tag) &&
      'corner_radius' in node
    ) {
      radiusHolders.push({ holder: node, radiusPath: [...path, 'corner_radius'] });
    }
    if (
      typeof node.tag === 'string' &&
      CORNER_RADIUS_BORDER_TAGS.has(node.tag) &&
      isRecord(node.border) &&
      'corner_radius' in node.border
    ) {
      radiusHolders.push({ holder: node.border, radiusPath: [...path, 'border', 'corner_radius'] });
    }
    for (const { holder, radiusPath } of radiusHolders) {
      const raw = holder.corner_radius;
      // 空串是编辑器「未设置」的写法（主题页尾常见），真机按无圆角处理，不算违规。
      if (typeof raw === 'string' && raw.trim() === '') continue;
      const next = normalizeCornerRadius(raw);
      if (next === undefined) {
        record(
          issue(
            radiusPath,
            'corner-radius-domain',
            'error',
            `corner_radius 只接受单个像素值或百分比值（如 "8px" / "50%"），飞书不支持四角多值；${JSON.stringify(raw)} 无法自动归一化，请改成单个值`,
            false,
          ),
          false,
        );
      } else if (next !== raw) {
        holder.corner_radius = next;
        record(
          issue(
            radiusPath,
            'corner-radius-domain',
            'error',
            `corner_radius 已归一化为 ${JSON.stringify(next)}（原值 ${JSON.stringify(raw)}）：飞书只接受单个 px / 百分比值`,
            true,
          ),
          true,
        );
      }
    }

    for (const [key, value] of Object.entries(node)) walk(value, [...path, key]);
  };

  walk(card, []);

  if (hasMedia) {
    if (!isRecord(card.config)) card.config = {};
    const config = card.config as Record<string, unknown>;
    if (config.enable_forward !== false) {
      config.enable_forward = false;
      record(
        issue(
          ['config', 'enable_forward'],
          'media-enable-forward',
          'error',
          '卡片含 audio / video 组件时必须显式设置 config.enable_forward 为 false，否则飞书拒绝发送',
          true,
        ),
        true,
      );
    }
  }

  return { card, issues, fixes };
}

/** 只检查不修复：返回同一套规则发现的问题（内部在克隆上跑一次修复）。 */
export function findDeviceIssues(input: unknown): DeviceIssue[] {
  return isRecord(input) ? repairDeviceIssues(input).issues : [];
}
