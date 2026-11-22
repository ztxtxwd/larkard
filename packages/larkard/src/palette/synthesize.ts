/**
 * 把图片调色板 + 卡片现有色板，合成为一套新的卡片主题。
 *
 * 关键思路：不直接拿图片主色替换 token，而是保留原卡的明暗关系：
 * - 背景 token 相对 canvas 的 L 差保持不变，色相/彩度换成图片的；
 * - 文字 token 相对父背景的对比方向保持不变，并做 WCAG 修复；
 * - 同色 token 仍然同色（等价类）；
 * - 语义色、未知 token 不动。
 *
 * 全部是确定性计算：同一张图 + 同一张卡，输出一定相同。
 */

import {
  capChroma,
  compositeOver,
  contrastRatio,
  ensureContrast,
  formatRgba,
  nearestHue,
  oklchToRgba,
  relativeLuminance,
  rgbaToOklch,
  type Oklch,
  type Rgba,
} from './color.js';
import { ACHROMATIC_CHROMA, type ImagePalette } from './extract.js';
import {
  normalizeTokenName,
  type CardColorInventory,
  type CardColorToken,
  type TokenRole,
} from './roles.js';

export interface ThemeColorPair {
  light_mode: string;
  dark_mode: string;
}

export interface PreviewColor {
  role: TokenRole;
  label: string;
  color: string;
}

export interface DerivedTheme {
  colors: Record<string, ThemeColorPair>;
  roles: Record<string, TokenRole>;
  preview: PreviewColor[];
  warnings: string[];
}

export interface DeriveOptions {
  /** 卡片明暗极性；默认从 canvas 的 light 值推断。 */
  polarity?: 'light' | 'dark';
  /** 强调色彩度上限，默认 0.16。 */
  maxAccentChroma?: number;
  /** 正文/次要文字的最小对比度，默认 4.5。 */
  minTextContrast?: number;
}

const ROLE_LABELS: Partial<Record<TokenRole, string>> = {
  canvas: '整卡底色',
  body: '正文底色',
  panel: '面板',
  highlight: '高亮面',
  icon_surface: '图标底座',
  ink: '主文字',
  muted: '次要文字',
  accent_text: '强调文字',
  accent: '强调色',
  accent_2: '第二强调色',
  button: '按钮',
  button_text: '按钮文字',
  border: '描边',
};

const ROLE_PRIORITY: Record<TokenRole, number> = {
  canvas: 0,
  body: 1,
  panel: 2,
  ink: 3,
  muted: 4,
  accent_text: 5,
  accent: 6,
  button: 7,
  accent_2: 8,
  highlight: 9,
  icon_surface: 10,
  on_surface: 11,
  button_text: 12,
  border: 13,
  unknown: 14,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sourceOf(token: CardColorToken, themeMode: 'light' | 'dark'): Rgba {
  return themeMode === 'light' ? token.light : token.dark;
}

function inferCardPolarity(inventory: CardColorInventory): 'light' | 'dark' {
  const canvas = inventory.canvasName ? inventory.byName.get(inventory.canvasName) : undefined;
  if (!canvas) return 'light';
  // 饱和蓝的 OKLab L 会在 0.5 附近，但相对亮度只有 0.13；极性按相对亮度判断更准。
  return relativeLuminance(canvas.light) > 0.35 ? 'light' : 'dark';
}

function accentHues(image: ImagePalette): number[] {
  return image.accents.map((accent) => accent.h);
}

/**
 * 中性表面 / 文字该用哪个色相。
 *
 * 中性色自己的彩度低到人眼看不出色相时（照片暗部常见的 0.004~0.008 色偏），
 * 不能拿它染色；改用图片的强调色色相（例如香槟金车身的暖色），让整张卡
 * 跟主体的颜色走，而不是跟背景噪声走。两者都没有就返回 0，此时彩度会被
 * 压到 0.004 以下，实际仍是灰色。
 */
function neutralHueFor(image: ImagePalette): number {
  if (image.neutral.c >= ACHROMATIC_CHROMA) return image.neutral.h;
  return image.accents[0]?.h ?? 0;
}

/** 灰图（没有强调色、中性色也几乎无彩度）不应该被合成出彩色表面。 */
function imageHasColor(image: ImagePalette): boolean {
  return image.accents.length > 0 || image.neutral.c >= ACHROMATIC_CHROMA;
}

function neutralChromaFor(
  sourceChroma: number,
  image: ImagePalette,
  min: number,
  max: number,
): number {
  if (!imageHasColor(image)) return Math.min(sourceChroma, 0.004);
  return clamp(sourceChroma, min, max);
}

/**
 * 图片强调色能支撑的最高彩度。
 *
 * 源卡可能本来是高饱和品牌色（蓝底卡 c≈0.2）；如果照搬源卡彩度，一张
 * 香槟金照片会被合成成焦橙色。这里按图片强调色自身彩度封顶，只保留一个
 * 可见的下限：图片越淡，卡片上的彩色块也越淡。
 */
function accentChromaCap(image: ImagePalette, maxAccentChroma: number): number {
  const accent = image.accents[0];
  if (!accent) return maxAccentChroma;
  return clamp(accent.c * 2, 0.06, maxAccentChroma);
}

/** 从图片生成目标 canvas：保留卡原有的“彩/灰”倾向，只换色相与明度锚点。 */
function makeTargetCanvas(
  source: Rgba,
  image: ImagePalette,
  polarity: 'light' | 'dark',
): Rgba {
  const sc = rgbaToOklch(source);
  const chromatic = imageHasColor(image) && sc.c >= 0.05;
  const baseL = polarity === 'light' ? 0.95 : 0.22;
  const l = polarity === 'light'
    ? clamp(baseL + (sc.l - 0.95) * 0.3, 0.84, 0.995)
    : clamp(baseL + (sc.l - 0.22) * 0.3, 0.10, 0.34);
  const h = chromatic
    ? nearestHue(accentHues(image), sc.h, image.neutral.h)
    : neutralHueFor(image);
  const c = chromatic
    ? Math.min(clamp(sc.c * 0.75, 0.06, 0.14), accentChromaCap(image, 0.14))
    : neutralChromaFor(sc.c, image, 0.006, 0.025);
  return oklchToRgba({ l, c, h }, source.a);
}

function surfaceChroma(
  source: Oklch,
  image: ImagePalette,
  maxAccentChroma: number,
): number {
  if (source.c < 0.05) return neutralChromaFor(source.c, image, 0.005, 0.03);
  return clamp(source.c * 0.85, 0.06, maxAccentChroma);
}

/** 按“相对 canvas 的 L 差”映射表面色，保留高亮栏/深色块的对比关系。 */
function mapSurface(
  source: Rgba,
  sourceCanvas: Rgba,
  targetCanvas: Rgba,
  image: ImagePalette,
  polarity: 'light' | 'dark',
  role: TokenRole,
  maxAccentChroma: number,
): Rgba {
  const s = rgbaToOklch(source);
  const sc = rgbaToOklch(sourceCanvas);
  const tc = rgbaToOklch(targetCanvas);

  if (role === 'icon_surface') {
    return oklchToRgba({
      l: polarity === 'light' ? 0.96 : 0.30,
      c: imageHasColor(image) ? clamp(s.c, 0.004, 0.02) : Math.min(s.c, 0.004),
      h: neutralHueFor(image),
    }, source.a);
  }

  const dL = s.l - sc.l;
  const scale = polarity === 'light' ? 0.9 : 0.8;
  let l = clamp(tc.l + dL * scale, 0.02, 0.995);

  // 高亮面即使源色是低彩度，也应该带一点图片的强调色，不能变成灰。
  const chromatic = imageHasColor(image)
    && (role === 'highlight' || role === 'accent' || role === 'accent_2' || s.c >= 0.05);
  const h = chromatic
    ? nearestHue(accentHues(image), s.h, image.neutral.h)
    : neutralHueFor(image);
  const c = chromatic
    ? Math.min(
        Math.max(surfaceChroma(s, image, maxAccentChroma), role === 'highlight' ? 0.06 : 0),
        accentChromaCap(image, maxAccentChroma),
      )
    : imageHasColor(image)
      ? surfaceChroma(s, image, maxAccentChroma)
      : neutralChromaFor(s.c, image, 0.005, 0.03);

  // 深色高亮块上的 L 不要因为缩放被抬得太高，保留它的“重块”感。
  if (polarity === 'light' && s.l < sc.l - 0.45) {
    l = Math.min(l, tc.l - 0.45);
  }
  return oklchToRgba({ l, c, h }, source.a);
}

/** 图片里没有可用的强调色时，退回单色：保留源 accent 的明暗，彩度收敛。 */
function mapAccent(
  source: Rgba,
  image: ImagePalette,
  polarity: 'light' | 'dark',
  index: number,
  maxAccentChroma: number,
): Rgba {
  const s = rgbaToOklch(source);
  const accents = image.accents;

  if (s.c < 0.045) {
    // 源卡本来就是单色强调（如 ink 同时当 accent），保持单色。
    const l = polarity === 'light'
      ? clamp(s.l, 0.10, 0.86)
      : clamp(s.l * 0.5 + 0.45, 0.45, 0.90);
    return oklchToRgba({
      l,
      c: imageHasColor(image) ? Math.min(s.c, 0.02) : Math.min(s.c, 0.004),
      h: neutralHueFor(image),
    }, source.a);
  }

  if (accents.length === 0) {
    // 灰度图片：不凭空造彩色，强调色收成中性深/浅色。
    return oklchToRgba({
      l: polarity === 'light' ? 0.34 : 0.70,
      // 没有强调色不代表要把源卡的高饱和 accent 留在 0.04 的彩度上；
      // 灰图应该是中性深/浅色，否则 hue=0 会得到一层暗红。
      c: imageHasColor(image) ? Math.min(s.c, 0.04) : Math.min(s.c, 0.004),
      h: neutralHueFor(image),
    }, source.a);
  }

  const accent = accents[index % accents.length]!;
  const cap = accentChromaCap(image, maxAccentChroma);
  // 源卡 accent 可能很鲜艳；图片强调色很淡时按图片封顶，避免橙得发焦。
  const c = Math.min(clamp(Math.max(s.c, accent.c), 0.06, maxAccentChroma), cap);
  const l = polarity === 'light'
    ? clamp(s.l, 0.32, 0.84)
    : clamp(s.l * 0.4 + 0.5, 0.45, 0.82);

  return capChroma(oklchToRgba({ l, c, h: accent.h }, source.a), maxAccentChroma);
}

function findTokenByShortName(
  inventory: CardColorInventory,
  short: string,
): CardColorToken | undefined {
  return inventory.tokens.find((token) => normalizeTokenName(token.name) === short);
}

function findTokenByRole(
  inventory: CardColorInventory,
  role: TokenRole,
): CardColorToken | undefined {
  return inventory.tokens.find((token) => token.role === role);
}

/** 文字 token 对应的背景 token。 */
function backgroundTokenFor(
  token: CardColorToken,
  inventory: CardColorInventory,
): CardColorToken | undefined {
  const short = normalizeTokenName(token.name);

  // 实际使用位置优先：`cus-on-accent` 这类命名和它承载的背景并不总是一一对应，
  // 只有走 AST 记录下来的父背景才是真值。
  const parent = token.usage.texts[0]?.background;
  if (parent && inventory.byName.has(parent)) return inventory.byName.get(parent);

  if (short === 'button_text') {
    return findTokenByRole(inventory, 'button')
      ?? findTokenByRole(inventory, 'accent')
      ?? inventory.byName.get(inventory.canvasName ?? '');
  }

  if (short.startsWith('on_')) {
    const base = short.slice(3);
    const named = findTokenByShortName(inventory, base);
    if (named) return named;
    const role = base === 'canvas'
      ? 'canvas'
      : base === 'body'
        ? 'body'
        : base === 'panel' || base === 'soft'
          ? 'panel'
          : base === 'accent'
            ? 'accent'
            : base === 'accent_2'
              ? 'accent_2'
              : base === 'button'
                ? 'button'
                : null;
    if (role) return findTokenByRole(inventory, role);
  }

  return inventory.byName.get(inventory.canvasName ?? '');
}

function effectiveBackground(color: Rgba, backdrop: Rgba): Rgba {
  return color.a >= 1 ? color : compositeOver(color, backdrop);
}

function contrastDirection(background: Rgba): 'lighter' | 'darker' {
  const black: Rgba = { r: 0, g: 0, b: 0, a: 1 };
  const white: Rgba = { r: 255, g: 255, b: 255, a: 1 };
  return contrastRatio(black, background) >= contrastRatio(white, background)
    ? 'darker'
    : 'lighter';
}

function mapForeground(
  source: Rgba,
  targetBackground: Rgba,
  backdrop: Rgba,
  image: ImagePalette,
  role: TokenRole,
  minTextContrast: number,
): Rgba {
  const s = rgbaToOklch(source);
  const effective = effectiveBackground(targetBackground, backdrop);
  const direction = contrastDirection(effective);
  const baseL = role === 'muted'
    ? direction === 'lighter' ? 0.76 : 0.46
    : direction === 'lighter' ? 0.96 : 0.16;

  const hue = neutralHueFor(image);
  const chroma = neutralChromaFor(s.c * 0.6, image, 0.004, 0.035);
  let foreground = oklchToRgba({ l: baseL, c: chroma, h: hue }, source.a);

  const desired = role === 'ink' ? Math.max(minTextContrast, 7) : minTextContrast;
  foreground = ensureContrast(foreground, effective, desired, direction);
  if (contrastRatio(foreground, effective) < minTextContrast) {
    foreground = ensureContrast(foreground, effective, minTextContrast, direction);
  }
  return foreground;
}

function mapAccentText(
  source: Rgba,
  targetBackground: Rgba,
  backdrop: Rgba,
  image: ImagePalette,
  minTextContrast: number,
): Rgba {
  if (image.accents.length === 0) {
    return mapForeground(source, targetBackground, backdrop, image, 'ink', minTextContrast);
  }
  const s = rgbaToOklch(source);
  const effective = effectiveBackground(targetBackground, backdrop);
  const direction = contrastDirection(effective);
  const accent = image.accents[0]!;
  const baseL = direction === 'lighter' ? 0.76 : 0.48;
  const chroma = Math.min(
    clamp(Math.max(s.c, accent.c), 0.06, 0.16),
    accentChromaCap(image, 0.16),
  );
  let foreground = oklchToRgba({ l: baseL, c: chroma, h: accent.h }, source.a);
  foreground = ensureContrast(foreground, effective, minTextContrast, direction);
  return foreground;
}

function mapBorder(
  source: Rgba,
  sourceBackground: Rgba,
  targetBackground: Rgba,
  image: ImagePalette,
): Rgba {
  const s = rgbaToOklch(source);
  const sb = rgbaToOklch(sourceBackground);
  const tb = rgbaToOklch(targetBackground);
  // 方向按源卡判断：源边框比源底色亮，目标边框也应该比目标底色亮。
  const sourceIsLighter = s.l >= sb.l;
  const amount = clamp(Math.abs(s.l - sb.l), 0.06, 0.16);
  const l = clamp(tb.l + (sourceIsLighter ? amount : -amount), 0.02, 0.98);
  return oklchToRgba({
    l,
    c: neutralChromaFor(s.c, image, 0.004, 0.03),
    h: neutralHueFor(image),
  }, source.a);
}

function synthesizeMode(
  themeMode: 'light' | 'dark',
  cardPolarity: 'light' | 'dark',
  image: ImagePalette,
  inventory: CardColorInventory,
  maxAccentChroma: number,
  minTextContrast: number,
): Map<string, Rgba> {
  const polarity: 'light' | 'dark' = themeMode === 'light' ? cardPolarity : 'dark';
  const canvasToken = inventory.canvasName
    ? inventory.byName.get(inventory.canvasName)
    : undefined;
  const sourceCanvas = canvasToken
    ? sourceOf(canvasToken, themeMode)
    : oklchToRgba({
        l: polarity === 'light' ? 0.95 : 0.22,
        c: 0.01,
        h: image.neutral.h,
      });
  const targetCanvas = makeTargetCanvas(sourceCanvas, image, polarity);

  const targets = new Map<string, Rgba>();

  // 1. 表面色：canvas / body / panel / highlight / icon_surface。
  for (const token of inventory.tokens) {
    const isSurface = token.role === 'canvas'
      || token.role === 'body'
      || token.role === 'panel'
      || token.role === 'highlight'
      || token.role === 'icon_surface';
    if (!isSurface) continue;
    const source = sourceOf(token, themeMode);
    const target = token.role === 'canvas'
      ? targetCanvas
      : mapSurface(
          source,
          sourceCanvas,
          targetCanvas,
          image,
          polarity,
          token.role,
          maxAccentChroma,
        );
    targets.set(token.name, target);
  }

  // 2. 强调色：accent / accent_2 / button。
  let accentIndex = 0;
  for (const token of inventory.tokens) {
    if (token.role !== 'accent' && token.role !== 'accent_2' && token.role !== 'button') {
      continue;
    }
    const source = sourceOf(token, themeMode);
    const target = mapAccent(source, image, polarity, accentIndex, maxAccentChroma);
    targets.set(token.name, target);
    if (token.role !== 'button') accentIndex += 1;
  }

  // 3. 前景色：ink / muted / on_surface / button_text。
  for (const token of inventory.tokens) {
    const isForeground = token.role === 'ink'
      || token.role === 'muted'
      || token.role === 'accent_text'
      || token.role === 'on_surface'
      || token.role === 'button_text';
    if (!isForeground) continue;
    const backgroundToken = backgroundTokenFor(token, inventory);
    const targetBackground = backgroundToken
      ? targets.get(backgroundToken.name)
      : undefined;
    const background = targetBackground ?? targetCanvas;
    targets.set(
      token.name,
      token.role === 'accent_text'
        ? mapAccentText(
            sourceOf(token, themeMode),
            background,
            targetCanvas,
            image,
            minTextContrast,
          )
        : mapForeground(
            sourceOf(token, themeMode),
            background,
            targetCanvas,
            image,
            token.role,
            minTextContrast,
          ),
    );
  }

  // 4. 描边：默认跟随 canvas；如果 token 明确写在某个背景里，跟随最近的表面色。
  for (const token of inventory.tokens) {
    if (token.role !== 'border') continue;
    const background = targets.get(inventory.canvasName ?? '') ?? targetCanvas;
    targets.set(
      token.name,
      mapBorder(sourceOf(token, themeMode), sourceCanvas, background, image),
    );
  }

  // 5. 未知 token 保持原色，避免把语义色/业务色改坏。
  for (const token of inventory.tokens) {
    if (targets.has(token.name)) continue;
    targets.set(token.name, sourceOf(token, themeMode));
  }

  // 6. 等价类：原本同色的 token，换色后仍然同色。代表色按角色优先级挑。
  for (const group of inventory.groups) {
    if (group.length <= 1) continue;
    const members = group
      .map((name) => inventory.byName.get(name))
      .filter((token): token is CardColorToken => Boolean(token))
      .sort((a, b) =>
        ROLE_PRIORITY[a.role] - ROLE_PRIORITY[b.role] || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const representative = members[0];
    if (!representative) continue;
    const color = targets.get(representative.name);
    if (!color) continue;
    for (const member of members) targets.set(member.name, color);
  }

  // 7. 对比度修复放在等价类之后：优先保证可读性，个别 token 因此不再同色是可接受的。
  for (const token of inventory.tokens) {
    if (token.role !== 'ink' && token.role !== 'muted' && token.role !== 'accent_text'
      && token.role !== 'on_surface' && token.role !== 'button_text') {
      continue;
    }
    const current = targets.get(token.name);
    if (!current) continue;
    const backgroundToken = backgroundTokenFor(token, inventory);
    const background = (backgroundToken ? targets.get(backgroundToken.name) : undefined)
      ?? targetCanvas;
    const effective = effectiveBackground(background, targetCanvas);
    const direction = contrastDirection(effective);
    const desired = token.role === 'ink'
      ? Math.max(minTextContrast, 7)
      : minTextContrast;
    let repaired = ensureContrast(current, effective, desired, direction);
    if (contrastRatio(repaired, effective) < minTextContrast) {
      repaired = ensureContrast(repaired, effective, minTextContrast, direction);
    }
    targets.set(token.name, repaired);
  }

  return targets;
}

function buildPreview(
  colors: Record<string, ThemeColorPair>,
  inventory: CardColorInventory,
  image: ImagePalette,
): PreviewColor[] {
  const preview: PreviewColor[] = [];
  const used = new Set<string>();
  const add = (role: TokenRole, label: string, color: string): void => {
    if (used.has(color)) return;
    used.add(color);
    preview.push({ role, label, color });
  };

  const preferredRoles: TokenRole[] = [
    'canvas',
    'body',
    'panel',
    'ink',
    'muted',
    'accent_text',
    'accent',
    'accent_2',
    'button',
    'button_text',
    'highlight',
  ];
  for (const role of preferredRoles) {
    const token = inventory.tokens.find((item) => item.role === role);
    if (!token) continue;
    const pair = colors[token.name];
    if (!pair) continue;
    add(role, ROLE_LABELS[role] ?? token.name, pair.light_mode);
  }

  // 先给图片的强调色：这才是用户从照片里认出来的“那个颜色”（例：香槟金车身）。
  // 再看面积主色；只列一个主色时，暗背景压过主体会让人误以为取色取错了。
  const accentLabels = ['图片强调色', '图片次强调色'];
  for (const [index, accent] of image.accents.slice(0, 2).entries()) {
    add('unknown', accentLabels[index] ?? '图片强调色', formatRgba(oklchToRgba(accent)));
  }
  const clusterLabels = ['图片主色', '图片色 2', '图片色 3'];
  for (const [index, cluster] of image.clusters.slice(0, 3).entries()) {
    add('unknown', clusterLabels[index] ?? '图片色', formatRgba(cluster.rgba));
  }
  return preview.slice(0, 10);
}

/**
 * 合成卡片主题。`inventory.tokens` 为空时返回空结果，由调用方提示“这张卡没有自定义色”。
 */
export function deriveThemePalette(
  image: ImagePalette,
  inventory: CardColorInventory,
  options: DeriveOptions = {},
): DerivedTheme {
  if (inventory.tokens.length === 0) {
    return { colors: {}, roles: {}, preview: [], warnings: ['卡片没有 config.style.color 自定义色'] };
  }

  const cardPolarity = options.polarity ?? inferCardPolarity(inventory);
  const maxAccentChroma = clamp(options.maxAccentChroma ?? 0.16, 0.08, 0.3);
  const minTextContrast = clamp(options.minTextContrast ?? 4.5, 3, 12);

  const lightMap = synthesizeMode(
    'light',
    cardPolarity,
    image,
    inventory,
    maxAccentChroma,
    minTextContrast,
  );
  const darkMap = synthesizeMode(
    'dark',
    cardPolarity,
    image,
    inventory,
    maxAccentChroma,
    minTextContrast,
  );

  const colors: Record<string, ThemeColorPair> = {};
  const roles: Record<string, TokenRole> = {};
  const warnings: string[] = [];

  for (const token of inventory.tokens) {
    roles[token.name] = token.role;
    const light = lightMap.get(token.name);
    const dark = darkMap.get(token.name);
    if (!light) {
      warnings.push(`${token.name}: 没有生成颜色，保持原值`);
      continue;
    }
    // 源卡 light/dark 相同（custom-visual 的约定）时，输出也相同。
    const samePair = formatRgba(token.light) === formatRgba(token.dark);
    if (samePair || !dark) {
      const value = formatRgba(light);
      colors[token.name] = { light_mode: value, dark_mode: value };
    } else {
      colors[token.name] = {
        light_mode: formatRgba(light),
        dark_mode: formatRgba(dark),
      };
    }
  }

  for (const token of inventory.tokens) {
    if (token.role === 'unknown') {
      warnings.push(`${token.name}: 无法判断角色，保持原色`);
    }
  }

  return {
    colors,
    roles,
    preview: buildPreview(colors, inventory, image),
    warnings,
  };
}

