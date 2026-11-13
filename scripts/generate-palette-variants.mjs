#!/usr/bin/env node
/**
 * 基于一张 custom-visual 卡片，用 palette_manifest 中其它配色批量生成变体。
 *
 * 源卡 cus-* 角色（neo-grid-bold 指标三列）：
 *   cus-bg-0      整卡底 = canvas
 *   cus-bg-2      指标列1 主 punch（源卡 neon lemon）
 *   cus-bg-1      指标列2 + pill 强对比块（源卡 ink）
 *   cus-bg-3      指标列3 + 引用盒 软面板（源卡 body 灰）
 *   cus-text-1    主文案 = ink
 *   cus-text-2    次文案 = muted
 *   cus-accent    强对比块前景（bg-1 上）
 *   cus-on-accent 主 punch 前景（bg-2 上）
 *   cus-on-soft   软面板前景（bg-3 上）
 *
 * 不能简单 accent/button/body 直映：很多主题 accent≈ink≈button，body≈canvas，
 * 会导致三列同色或融进底色。各主题三列取色见 HIGHLIGHT_TRIPLE。
 *
 * 用法：
 *   node scripts/generate-palette-variants.mjs <source.card> [outDir]
 *   node scripts/generate-palette-variants.mjs om_x100....card --include-source
 *   node scripts/generate-palette-variants.mjs om_x100....card --only lime-slab,monochrome
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const MANIFEST_PATH = join(
  ROOT,
  '.agents/skills/create-lark-card/style/custom-visual/themes/palette_manifest.json',
);

/**
 * 三列高亮：[punch→cus-bg-2, strong→cus-bg-1, soft→cus-bg-3]
 * 按 design.md / palette rules：彼此可分辨，且相对 canvas 有色阶。
 */
const HIGHLIGHT_TRIPLE = {
  // charcoal 主高亮 + graphite 次块 + white；lime 只留在 canvas
  'lime-slab': { punch: 'ink', strong: 'muted', soft: 'panel' },
  // rose 一点题 + forest 主导 + paper panel
  'editorial-forest': { punch: 'accent_2', strong: 'accent', soft: 'panel' },
  // 无强调色：墨 / 石墨 / 浅 inset
  'monochrome': { punch: 'ink', strong: 'muted', soft: 'panel' },
  // taupe punch + espresso 强块 + almond panel
  'macchiato': { punch: 'accent_2', strong: 'ink', soft: 'panel' },
  // 源卡：lemon | ink | body
  'neo-grid-bold': { punch: 'accent', strong: 'accent_2', soft: 'body' },
  // pink 点题 punch + green 强块 + white panel
  'court-press': { punch: 'accent_2', strong: 'accent', soft: 'panel' },
  // pastel 粉 / 黄绿 / 桃
  'soft-editorial': { punch: 'accent', strong: 'accent_2', soft: 'panel' },
  // 浅蓝 + 暖黄 + secondary
  'handdrawn-vibes': { punch: 'accent', strong: 'accent_2', soft: 'secondary' },
  // 紫 + 橙 + 暖黄
  'handdrawn-dark': { punch: 'accent', strong: 'accent_2', soft: 'highlight_yellow' },
  // 软黄 + 陶土 + blush
  'wellness-planner': { punch: 'accent', strong: 'accent_2', soft: 'blush' },
  // mint + clay + secondary
  // 与手写理想卡一致：terracotta punch | ink button | mint soft
  'claude-chrome': { punch: 'accent_2', strong: 'button', soft: 'accent' },
};

function usage(code = 1) {
  console.error(`用法: node scripts/generate-palette-variants.mjs <source.card> [outDir] [--include-source] [--only id1,id2]`);
  process.exit(code);
}

function parseArgs(argv) {
  const args = { includeSource: false, only: null, positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--include-source' || a === '--all') args.includeSource = true;
    else if (a === '--only') args.only = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '-h' || a === '--help') usage(0);
    else if (a.startsWith('-')) {
      console.error(`未知选项: ${a}`);
      usage(1);
    } else args.positional.push(a);
  }
  return args;
}

function parseRgba(value) {
  if (!value || typeof value !== 'string') return null;
  const m = value.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?(?:\s*,\s*([\d.]+))?\s*\)/i);
  if (!m) return null;
  return {
    r: Number(m[1]),
    g: Number(m[2]),
    b: Number(m[3]),
    a: m[4] === undefined ? 1 : Number(m[4]),
  };
}

function relativeLuminance(rgba) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(rgba.r) + 0.7152 * lin(rgba.g) + 0.0722 * lin(rgba.b);
}

function modeValue(token) {
  if (!token) return null;
  if (typeof token === 'string') return token;
  return token.light_mode || token.dark_mode || null;
}

function cloneMode(token) {
  if (!token) return null;
  if (typeof token === 'string') {
    return { light_mode: token, dark_mode: token };
  }
  return {
    light_mode: token.light_mode,
    dark_mode: token.dark_mode ?? token.light_mode,
  };
}

function isLightToken(token) {
  const rgba = parseRgba(modeValue(token));
  return rgba ? relativeLuminance(rgba) > 0.45 : false;
}

function contrastRatio(bgRgba, fgRgba) {
  const L1 = relativeLuminance(bgRgba);
  const L2 = relativeLuminance(fgRgba);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * 选前景色：
 * - 中深色底（L < 0.4）优先浅色反白（匹配 claude accent_2 陶土+白字）
 * - 浅色底优先深色
 * - 在满足最低对比的候选里再取对比最高的
 */
function pickOnForeground(bgToken, darkCandidates, lightCandidates) {
  const bg = parseRgba(modeValue(bgToken));
  const fallbackDark = { light_mode: 'rgba(10,10,10,1)', dark_mode: 'rgba(10,10,10,1)' };
  const fallbackLight = { light_mode: 'rgba(255,255,255,1)', dark_mode: 'rgba(255,255,255,1)' };
  if (!bg) return cloneMode(darkCandidates[0]) || fallbackDark;

  const preferLight = relativeLuminance(bg) < 0.4;
  const primary = (preferLight ? lightCandidates : darkCandidates).map(cloneMode).filter(Boolean);
  const secondary = (preferLight ? darkCandidates : lightCandidates).map(cloneMode).filter(Boolean);
  const pool = [...primary, ...secondary, preferLight ? fallbackLight : fallbackDark, preferLight ? fallbackDark : fallbackLight];

  const MIN = 2.6; // 略低于 WCAG AA，允许陶土+白字这类品牌反白
  let best = null;
  let bestRatio = -1;
  let bestPreferred = null;
  let bestPreferredRatio = -1;

  for (let i = 0; i < pool.length; i++) {
    const token = pool[i];
    const fg = parseRgba(modeValue(token));
    if (!fg) continue;
    const ratio = contrastRatio(bg, fg);
    const inPrimary = i < primary.length || token === (preferLight ? fallbackLight : fallbackDark);
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = token;
    }
    if (inPrimary && ratio >= MIN && ratio > bestPreferredRatio) {
      bestPreferredRatio = ratio;
      bestPreferred = token;
    }
  }

  return bestPreferred || best || fallbackDark;
}

function colorDistance(a, b) {
  const pa = parseRgba(modeValue(a));
  const pb = parseRgba(modeValue(b));
  if (!pa || !pb) return Infinity;
  return Math.hypot(pa.r - pb.r, pa.g - pb.g, pa.b - pb.b);
}

function resolveColor(paletteColors, key) {
  if (!key) return null;
  return paletteColors[key] || null;
}

/** 用源卡 color map 与各 palette 的关键色比对，猜当前是哪个 style_id */
function detectSourceStyleId(sourceColors, styles) {
  let best = null;
  let bestScore = Infinity;
  for (const style of styles) {
    const c = style.colors;
    const score =
      colorDistance(sourceColors['cus-bg-0'], c.canvas) +
      colorDistance(sourceColors['cus-bg-2'], c.accent) +
      colorDistance(sourceColors['cus-text-1'], c.ink) +
      colorDistance(sourceColors['cus-text-2'], c.muted) +
      colorDistance(sourceColors['cus-bg-3'], c.body);
    if (score < bestScore) {
      bestScore = score;
      best = style.style_id;
    }
  }
  return bestScore < 40 ? best : null;
}

/**
 * 为未登记主题兜底：从 palette 里挑 3 个彼此距离够大、且都离 canvas 够远的色。
 */
function fallbackTriple(paletteColors) {
  const canvas = paletteColors.canvas;
  const preferred = [
    'accent', 'accent_2', 'ink', 'button', 'panel', 'body',
    'secondary', 'blush', 'sage', 'highlight_yellow', 'highlight_orange', 'muted',
  ];
  const pool = [];
  for (const key of preferred) {
    const token = paletteColors[key];
    if (!token) continue;
    if (colorDistance(token, canvas) < 18) continue;
    if (pool.some((p) => colorDistance(p.token, token) < 18)) continue;
    pool.push({ key, token });
    if (pool.length >= 3) break;
  }
  while (pool.length < 3) {
    const fallbacks = [paletteColors.ink, paletteColors.panel, paletteColors.body, paletteColors.muted];
    const next = fallbacks.find((t) => t && !pool.some((p) => colorDistance(p.token, t) < 12));
    if (!next) break;
    pool.push({ key: 'fallback', token: next });
  }
  return {
    punch: pool[0]?.token || paletteColors.accent || paletteColors.ink,
    strong: pool[1]?.token || paletteColors.ink || paletteColors.button,
    soft: pool[2]?.token || paletteColors.panel || paletteColors.body,
  };
}

function pickHighlightTriple(styleId, paletteColors) {
  const spec = HIGHLIGHT_TRIPLE[styleId];
  if (!spec) return fallbackTriple(paletteColors);

  let punch = resolveColor(paletteColors, spec.punch);
  let strong = resolveColor(paletteColors, spec.strong);
  let soft = resolveColor(paletteColors, spec.soft);

  // 缺 token 时回退
  punch = punch || paletteColors.accent || paletteColors.ink;
  strong = strong || paletteColors.button || paletteColors.ink;
  soft = soft || paletteColors.panel || paletteColors.body || paletteColors.canvas;

  // 若 soft 与 canvas 几乎无差，改用 panel / secondary / accent_2
  const canvas = paletteColors.canvas;
  if (colorDistance(soft, canvas) < 12) {
    soft =
      [paletteColors.panel, paletteColors.secondary, paletteColors.accent_2, paletteColors.body]
        .find((t) => t && colorDistance(t, canvas) >= 12 && colorDistance(t, punch) >= 12 && colorDistance(t, strong) >= 12)
      || soft;
  }

  // 若 punch/strong 撞色，尝试用备用强调色拆开
  if (colorDistance(punch, strong) < 12) {
    const alt = [paletteColors.accent_2, paletteColors.panel, paletteColors.secondary, paletteColors.blush]
      .find((t) => t && colorDistance(t, strong) >= 18 && colorDistance(t, canvas) >= 12);
    if (alt) punch = alt;
  }

  return { punch, strong, soft };
}

function buildCusColorMap(styleId, paletteColors) {
  const ink = paletteColors.ink;
  const muted = paletteColors.muted;
  const canvas = paletteColors.canvas;
  const buttonText = paletteColors.button_text || canvas;
  const { punch, strong, soft } = pickHighlightTriple(styleId, paletteColors);

  const white = { light_mode: 'rgba(255,255,255,1)', dark_mode: 'rgba(255,255,255,1)' };
  const black = { light_mode: 'rgba(10,10,10,1)', dark_mode: 'rgba(10,10,10,1)' };
  // 严格按亮度分池，避免 ink 混进浅色候选导致陶土底选出黑字
  const darkFg = [ink, paletteColors.button, buttonText, black].filter((t) => t && !isLightToken(t));
  const lightFg = [buttonText, canvas, paletteColors.panel, paletteColors.body, ink, white].filter((t) => t && isLightToken(t));
  if (!darkFg.length) darkFg.push(black);
  if (!lightFg.length) lightFg.push(white);

  return {
    'cus-text-1': cloneMode(ink),
    'cus-text-2': cloneMode(muted),
    'cus-bg-0': cloneMode(canvas),
    'cus-bg-1': cloneMode(strong),
    'cus-bg-2': cloneMode(punch),
    'cus-bg-3': cloneMode(soft),
    // 引用盒 / 内容面板：与指标 soft 列拆开，避免 mint 等强调色铺满正文区
    'cus-panel': cloneMode(paletteColors.panel || paletteColors.body || canvas),
    'cus-accent': pickOnForeground(strong, darkFg, lightFg),
    'cus-muted': cloneMode(muted),
    'cus-on-accent': pickOnForeground(punch, darkFg, lightFg),
    'cus-on-soft': pickOnForeground(soft, darkFg, lightFg),
    'cus-on-panel': pickOnForeground(
      paletteColors.panel || paletteColors.body || canvas,
      darkFg,
      lightFg,
    ),
  };
}

/** 给指定 background_style 的 column 替换文案 token */
function patchColumnFont(node, backgroundStyle, fromToken, toToken) {
  if (!node || typeof node !== 'object') return;

  if (Array.isArray(node)) {
    for (const item of node) patchColumnFont(item, backgroundStyle, fromToken, toToken);
    return;
  }

  if (node.tag === 'column' && node.background_style === backgroundStyle) {
    rewriteFontToken(node, fromToken, toToken);
    return;
  }

  for (const key of Object.keys(node)) {
    patchColumnFont(node[key], backgroundStyle, fromToken, toToken);
  }
}

/**
 * 引用盒等 soft 面 interactive_container：改用 cus-panel，
 * 与指标第 3 列的 cus-bg-3 分离（理想 claude-chrome：列3=mint，引用区=panel）。
 */
function remapQuoteSurfaces(node) {
  if (!node || typeof node !== 'object') return;

  if (Array.isArray(node)) {
    for (const item of node) remapQuoteSurfaces(item);
    return;
  }

  if (
    node.tag === 'interactive_container'
    && node.background_style === 'cus-bg-3'
  ) {
    node.background_style = 'cus-panel';
    rewriteFontToken(node, 'cus-text-1', 'cus-on-panel');
    return;
  }

  // 指标第 3 列仍用 soft 色
  if (node.tag === 'column' && node.background_style === 'cus-bg-3') {
    rewriteFontToken(node, 'cus-text-1', 'cus-on-soft');
    return;
  }

  for (const key of Object.keys(node)) {
    remapQuoteSurfaces(node[key]);
  }
}

function rewriteFontToken(node, from, to) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) rewriteFontToken(item, from, to);
    return;
  }
  if (typeof node.content === 'string' && node.content.includes(from)) {
    node.content = node.content
      .replaceAll(`color='${from}'`, `color='${to}'`)
      .replaceAll(`color="${from}"`, `color="${to}"`);
  }
  for (const key of Object.keys(node)) {
    if (key === 'content') continue;
    rewriteFontToken(node[key], from, to);
  }
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function describeTriple(styleId, colors) {
  const c = colors;
  return [
    `punch=${c['cus-bg-2'].light_mode}`,
    `strong=${c['cus-bg-1'].light_mode}`,
    `soft=${c['cus-bg-3'].light_mode}`,
  ].join(' | ');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.positional.length < 1) usage(1);

  const sourcePath = resolve(args.positional[0]);
  if (!existsSync(sourcePath)) {
    console.error(`找不到源卡片: ${sourcePath}`);
    process.exit(1);
  }

  const outDir = resolve(
    args.positional[1] || join(dirname(sourcePath), `${basename(sourcePath, '.card')}.palettes`),
  );
  mkdirSync(outDir, { recursive: true });

  const raw = JSON.parse(readFileSync(sourcePath, 'utf8'));
  const isWrapped = raw && typeof raw === 'object' && 'dsl' in raw;
  const dsl = isWrapped ? raw.dsl : raw;
  const sourceColors = dsl?.config?.style?.color;
  if (!sourceColors) {
    console.error('源卡片缺少 config.style.color，无法换色');
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const styles = manifest.styles || [];
  if (!styles.length) {
    console.error('palette_manifest 中没有 styles');
    process.exit(1);
  }

  const detected = detectSourceStyleId(sourceColors, styles);
  const onlySet = args.only ? new Set(args.only) : null;

  console.log(`源文件: ${sourcePath}`);
  console.log(`输出目录: ${outDir}`);
  console.log(`检测到源 palette: ${detected ?? '(未匹配，将生成全部)'}`);

  const baseName = basename(sourcePath, '.card');
  const written = [];

  for (const style of styles) {
    if (onlySet && !onlySet.has(style.style_id)) continue;
    if (!args.includeSource && detected && style.style_id === detected) {
      console.log(`  skip  ${style.style_id} (源 palette)`);
      continue;
    }

    const card = deepClone(raw);
    const targetDsl = isWrapped ? card.dsl : card;
    targetDsl.config = targetDsl.config || {};
    targetDsl.config.style = targetDsl.config.style || {};
    const colorMap = buildCusColorMap(style.style_id, style.colors);
    targetDsl.config.style.color = colorMap;

    // 三列各自用对比色前景
    patchColumnFont(targetDsl.body, 'cus-bg-2', 'cus-text-1', 'cus-on-accent');
    patchColumnFont(targetDsl.body, 'cus-bg-1', 'cus-text-1', 'cus-accent');
    // 引用盒 → panel；第 3 列保留 soft
    remapQuoteSurfaces(targetDsl.body);

    if (isWrapped) {
      card.name = `${baseName}__${style.style_id}`;
    }

    const outFile = join(outDir, `${baseName}__${style.style_id}.card`);
    writeFileSync(outFile, `${JSON.stringify(card, null, 2)}\n`, 'utf8');
    written.push({ style_id: style.style_id, name: style.name, path: outFile });
    console.log(`  write ${style.style_id.padEnd(20)} ${describeTriple(style.style_id, colorMap)}`);
  }

  console.log(`\n完成：生成 ${written.length} 张卡片`);
}

main();
