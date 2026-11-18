/**
 * 图片取色 → 卡片换色。
 *
 * 对外只暴露一个任务级入口：给一张卡片 DSL 和一张图片的像素，返回换色后的
 * 新卡片、提取到的图片调色板、合成主题和变更报告。
 *
 * 流程分三段：
 *   物化（官方色 → cus-*、按钮 → interactive_container）
 *   → 合成（图片色板 × 卡片现有色彩结构）
 *   → 枚举回写（icon / text_tag / header.template 等只能走官方枚举的字段）
 *
 * 这一层不依赖 React / DOM；浏览器解码在 `browser.ts`，应用层只负责选图和提交。
 */

import { applyThemePalette, type ApplyResult } from './apply.js';
import { formatRgba, relativeLuminance } from './color.js';
import { buildAnchors, remapEnumColors } from './enums.js';
import { extractImagePalette, type ExtractOptions, type ImagePalette, type PixelData } from './extract.js';
import { materializeCardColors, type MaterializeResult } from './materialize.js';
import { readCardColorInventory, type CardColorInventory } from './roles.js';
import {
  deriveThemePalette,
  type DerivedTheme,
  type DeriveOptions,
  type PreviewColor,
} from './synthesize.js';

export * from './color.js';
export * from './extract.js';
export * from './official.js';
export * from './materialize.js';
export * from './enums.js';
export * from './roles.js';
export * from './synthesize.js';
export * from './apply.js';

export interface RecolorOptions extends ExtractOptions, DeriveOptions {}

export interface RecolorChanged {
  custom: number;
  enums: number;
  buttons: number;
  total: number;
}

export interface RecolorResult {
  /** 卡片上是否有任何可被图片影响的颜色（自定义 token / 官方枚举 / 按钮）。 */
  supported: boolean;
  card: Record<string, unknown>;
  image: ImagePalette;
  inventory: CardColorInventory;
  theme: DerivedTheme;
  materialized: MaterializeResult;
  apply: ApplyResult;
  changed: RecolorChanged;
}

function emptyTheme(warnings: string[] = []): DerivedTheme {
  return { colors: {}, roles: {}, preview: [], warnings };
}

function fallbackPreview(image: ImagePalette): PreviewColor[] {
  return image.clusters.slice(0, 6).map((cluster, index) => ({
    role: 'unknown' as const,
    label: index === 0 ? '图片主色' : `图片主色 ${index + 1}`,
    color: formatRgba(cluster.rgba),
  }));
}

function polarityOf(inventory: CardColorInventory, image: ImagePalette): 'light' | 'dark' {
  const canvas = inventory.canvasName
    ? inventory.byName.get(inventory.canvasName)
    : undefined;
  if (!canvas) return image.polarity;
  return relativeLuminance(canvas.light) > 0.35 ? 'light' : 'dark';
}

/**
 * 从像素直接换色。图片解码由调用方负责（浏览器见 `recolorFromFile`）。
 */
export function recolorCardWithImage(
  card: unknown,
  pixels: PixelData,
  options: RecolorOptions = {},
): RecolorResult {
  const image = extractImagePalette(pixels, options);
  const materialized = materializeCardColors(card);
  const inventory = readCardColorInventory(materialized.card);
  const hasTokens = inventory.tokens.length > 0;
  const supported = hasTokens || materialized.hasEnumColors || materialized.convertedButtons > 0;

  if (!supported) {
    return {
      supported: false,
      card: (card ?? {}) as Record<string, unknown>,
      image,
      inventory,
      theme: emptyTheme(['卡片没有可换色的颜色字段']),
      materialized,
      apply: { card: (card ?? {}) as Record<string, unknown>, changed: [] },
      changed: { custom: 0, enums: 0, buttons: 0, total: 0 },
    };
  }

  const baseTheme = hasTokens
    ? deriveThemePalette(image, inventory, options)
    : emptyTheme();
  const theme: DerivedTheme = {
    ...baseTheme,
    preview: baseTheme.preview.length > 0 ? baseTheme.preview : fallbackPreview(image),
  };

  const apply = hasTokens
    ? applyThemePalette(materialized.card, theme.colors)
    : { card: materialized.card, changed: [] };
  const anchors = buildAnchors(
    theme,
    inventory,
    image,
    options.polarity ?? polarityOf(inventory, image),
  );
  const enums = remapEnumColors(apply.card, anchors);

  const changed: RecolorChanged = {
    custom: apply.changed.length,
    enums: enums.changed,
    buttons: materialized.convertedButtons,
    total: apply.changed.length + enums.changed + materialized.convertedButtons,
  };

  return {
    supported: true,
    card: enums.card,
    image,
    inventory,
    theme,
    materialized,
    apply,
    changed,
  };
}
