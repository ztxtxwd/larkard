/**
 * 构建前生成：
 * 1) 把 constants.ts 的 PALETTE 同步进 styles.css 的色阶 CSS 变量区；
 * 2) 把 styles.css 内联进 base-styles.ts，供 ALL_CSS 运行时聚合。
 *
 * 挂在 build/dev 前置（package.json），styles.css / PALETTE 一改即同步。
 * 也可单独运行：node scripts/gen-base-styles.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const SRC_CSS = join(repoRoot, 'src', 'styles.css');
const SRC_CONSTANTS = join(repoRoot, 'src', 'constants.ts');
const OUT_TS = join(repoRoot, 'src', 'base-styles.ts');

const PALETTE_BEGIN = '  /* BEGIN PALETTE VARS (auto-generated from constants.ts PALETTE) */';
const PALETTE_END = '  /* END PALETTE VARS */';

/** 从 constants.ts 抽出 PALETTE 对象字面量里的 KEY: '#hex' 对 */
function extractPalette(ts) {
  const m = ts.match(/export const PALETTE:[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!m) throw new Error('未找到 export const PALETTE = {...}');
  const out = [];
  const re = /\b([A-Z]\d{2,4})\s*:\s*'([^']+)'/g;
  let hit;
  while ((hit = re.exec(m[1]))) out.push([hit[1], hit[2]]);
  if (!out.length) throw new Error('PALETTE 为空');
  return out;
}

function injectPaletteVars(css, pairs) {
  const block = [
    PALETTE_BEGIN,
    '  /* 正文 color:var(--O400) 等依赖这些变量；与飞书 :root light 色阶对齐 */',
    ...pairs.map(([k, v]) => `  --${k}: ${v};`),
    PALETTE_END,
  ].join('\n');

  if (css.includes(PALETTE_BEGIN) && css.includes(PALETTE_END)) {
    return css.replace(
      new RegExp(`${escapeRe(PALETTE_BEGIN)}[\\s\\S]*?${escapeRe(PALETTE_END)}`),
      block,
    );
  }

  // 插入到 .universal-card-root { ... } 闭合前
  const rootOpen = css.indexOf('.universal-card-root {');
  if (rootOpen < 0) throw new Error('styles.css 缺少 .universal-card-root');
  const brace = css.indexOf('{', rootOpen);
  const close = css.indexOf('\n}', brace);
  if (close < 0) throw new Error('无法定位 .universal-card-root 闭合');
  return css.slice(0, close) + '\n' + block + css.slice(close);
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function main() {
  const [css0, constants] = await Promise.all([
    readFile(SRC_CSS, 'utf8'),
    readFile(SRC_CONSTANTS, 'utf8'),
  ]);
  const pairs = extractPalette(constants);
  const css = injectPaletteVars(css0, pairs);
  if (css !== css0) await writeFile(SRC_CSS, css, 'utf8');

  const source = `/**
 * 基础布局样式（styles.css）的运行时字符串形态。
 * 由 scripts/gen-base-styles.mjs 从 src/styles.css 生成，请勿手改。
 *
 * 用途：让 ALL_CSS（all-css.ts）能在运行时聚合「布局 + 图标字体 + emoji」三份样式，
 * 供 SSR 消费者页面级一次性注入。改样式请改 src/styles.css，再跑 build（会自动重生成）。
 */

/** 基础布局样式（= src/styles.css 全文） */
export const BASE_STYLES_CSS: string =
  ${JSON.stringify(css)};
`;
  await writeFile(OUT_TS, source, 'utf8');
  console.log(`[done] palette ${pairs.length} tokens → styles.css；已写入 ${OUT_TS}（${css.length} 字符）`);
}

main().catch((e) => { console.error(e); process.exit(1); });
