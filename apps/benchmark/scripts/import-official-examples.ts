/**
 * 从飞书文档 MCP 缓存抽取官方示例 JSON → 主观题 golden + 任务。
 * 仅做保证本仓库 schema 可校验的最小修补（补 behaviors、纠正缺失 icon token），
 * 不改写官方示例的结构与文案。
 *
 *   pnpm exec tsx scripts/import-official-examples.ts
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateData } from '@open-feishu-card/validator';
import { IconTokenSchema } from '../../../packages/schema/src/common/icon-tokens.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const GOLDEN_DIR = join(ROOT, 'datasets', 'subjective', 'golden');
const TASKS_DIR = join(ROOT, 'datasets', 'subjective');
const MCP_BASE_SHORT = 'C:\\Users\\ZTX421~1\\AppData\\Local\\Temp\\feishu-doc-mcp';

interface SourceSpec {
  id: string;
  difficulty: 'easy' | 'medium' | 'hard';
  docPath: string;
  cacheDirPrefix: string;
  exampleFileHint: string;
  prompt: string;
}

const SOURCES: SourceSpec[] = [
  {
    id: 'S01',
    difficulty: 'easy',
    docPath: '/feishu-cards/card-json-v2-components/content-components/divider',
    cacheDirPrefix: 'content-components_divider',
    exampleFileHint: '示例代码',
    prompt:
      '按飞书卡片 JSON 2.0 官方「分割线」组件文档示例，生成一张完整卡片：正文为普通文本「普通文本示例」，中间一条分割线，下方一个「查看更多」主按钮。',
  },
  {
    id: 'S02',
    difficulty: 'easy',
    docPath: '/feishu-cards/card-json-v2-components/content-components/image',
    cacheDirPrefix: 'content-components_image',
    exampleFileHint: 'Demo',
    prompt:
      '按飞书卡片 JSON 2.0 官方「图片」组件 Demo，生成一张完整卡片（标题、说明与图片配置与文档示例一致，img_key 沿用示例值）。',
  },
  {
    id: 'S03',
    difficulty: 'easy',
    docPath: '/feishu-cards/card-json-v2-components/content-components/plain-text',
    cacheDirPrefix: 'content-components_plain-text',
    exampleFileHint: '示例代码',
    prompt:
      '按飞书卡片 JSON 2.0 官方「普通文本（div）」文档示例，生成一张完整卡片，复现文档中的普通文本 Demo。',
  },
  {
    id: 'S04',
    difficulty: 'easy',
    docPath: '/feishu-cards/card-json-v2-components/interactive-components/checker',
    cacheDirPrefix: 'interactive-components_checker',
    exampleFileHint: '示例代码',
    prompt:
      '按飞书卡片 JSON 2.0 官方「勾选器（checker）」文档示例，生成一张完整卡片，复现文档 Demo 中的勾选器配置。',
  },
  {
    id: 'S05',
    difficulty: 'medium',
    docPath: '/feishu-cards/card-json-v2-components/interactive-components/overflow',
    cacheDirPrefix: 'interactive-components_overflow',
    exampleFileHint: '示例代码',
    prompt:
      '按飞书卡片 JSON 2.0 官方「折叠按钮组（overflow）」文档示例，生成一张完整卡片，展示文档中的 overflow 与相关按钮用法。',
  },
  {
    id: 'S06',
    difficulty: 'medium',
    docPath: '/feishu-cards/card-json-v2-components/content-components/multi-image-laylout',
    cacheDirPrefix: 'content-components_multi-image-laylout',
    exampleFileHint: '示例代码',
    prompt:
      '按飞书卡片 JSON 2.0 官方「多图混排（img_combination）」文档示例，生成一张完整卡片，展示文档中的多图布局。',
  },
  {
    id: 'S07',
    difficulty: 'medium',
    docPath: '/feishu-cards/card-json-v2-components/content-components/rich-text',
    cacheDirPrefix: 'content-components_rich-text',
    exampleFileHint: '富文本语法使用示例',
    prompt:
      '按飞书卡片 JSON 2.0 官方「富文本（Markdown）」语法使用示例，生成一张包含 markdown 组件的完整卡片，内容覆盖文档示例中的主要 Markdown 写法。',
  },
  {
    id: 'S08',
    difficulty: 'medium',
    docPath: '/feishu-cards/card-json-v2-components/containers/interactive-container',
    cacheDirPrefix: 'containers_interactive-container',
    exampleFileHint: 'Demo',
    prompt:
      '按飞书卡片 JSON 2.0 官方「交互容器」Demo，生成一张完整卡片，复现文档示例中的 interactive_container 结构与点击行为。',
  },
  {
    id: 'S09',
    difficulty: 'medium',
    docPath: '/feishu-cards/card-json-v2-components/containers/collapsible-panel',
    cacheDirPrefix: 'containers_collapsible-panel',
    exampleFileHint: '示例代码',
    prompt:
      '按飞书卡片 JSON 2.0 官方「折叠面板」示例，生成黄色标题「折叠面板展示」的完整卡片：包含默认折叠、标题带背景色且默认展开、以及无边框等几种折叠面板（文案与文档一致）。',
  },
  {
    id: 'S10',
    difficulty: 'hard',
    docPath: '/feishu-cards/card-json-v2-components/interactive-components/button',
    cacheDirPrefix: 'interactive-components_button',
    exampleFileHint: '示例代码',
    prompt:
      '按飞书卡片 JSON 2.0 官方「按钮」组件示例，生成蓝色标题为 Buttons 的完整卡片：用分栏展示多种按钮样式（镭射、禁用、primary/default 等），交互配置对齐文档示例。',
  },
  {
    id: 'S11',
    difficulty: 'hard',
    docPath: '/feishu-cards/card-json-v2-components/content-components/table',
    cacheDirPrefix: 'content-components_table',
    exampleFileHint: 'Demo',
    prompt:
      '按飞书卡片 JSON 2.0 官方「表格」组件 Demo，生成蓝色标题「表格组件示例」的完整卡片：列含客户名称、规模、ARR、跟进人、签约日期、链接、企业图片等，行数据与 page_size 等配置对齐文档。',
  },
  {
    id: 'S12',
    difficulty: 'hard',
    docPath: '/feishu-cards/card-json-v2-components/containers/column-set',
    cacheDirPrefix: 'containers_column-set',
    exampleFileHint: '示例代码',
    prompt:
      '按飞书卡片 JSON 2.0 官方「分栏」组件示例，生成一张完整卡片：以「个人效率总览」为主题，用多层 column_set 展示已审批单量等指标布局（结构与文案对齐官方 Demo）。',
  },
  {
    id: 'S13',
    difficulty: 'hard',
    docPath: '/feishu-cards/card-json-v2-components/containers/form-container',
    cacheDirPrefix: 'containers_form-container',
    exampleFileHint: '示例代码',
    prompt:
      '按飞书卡片 JSON 2.0 官方「表单容器」示例，生成一张完整卡片：顶部 Markdown 显示项目名称「业务做大做强」，表单内用分栏布置经办人（人员选择）、优先级（下拉）、描述（输入框）等，以及提交/重置按钮；字段 name 与布局对齐文档示例。',
  },
];

const NEEDS_BEHAVIORS = new Set([
  'button',
  'overflow',
  'select_static',
  'multi_select_static',
  'select_person',
  'multi_select_person',
  'picker_date',
  'picker_time',
  'picker_datetime',
  'select_img',
  'interactive_container',
]);

function findMcpRoot(): string {
  const candidates = [
    join(process.env.LOCALAPPDATA ?? '', 'Temp', 'feishu-doc-mcp'),
    'C:\\Users\\ztx4215_123136\\AppData\\Local\\Temp\\feishu-doc-mcp',
    MCP_BASE_SHORT,
    join(process.env.TEMP ?? '', 'feishu-doc-mcp'),
  ];
  for (const p of candidates) {
    if (p && existsSync(p)) return p;
  }
  throw new Error('找不到 feishu-doc-mcp 缓存，请先用 MCP read_feishu_doc 拉取文档');
}

function findExampleFile(cacheRoot: string, dirPrefix: string, fileHint: string): string {
  const dirs = readdirSync(cacheRoot).filter((d) => d.startsWith(dirPrefix));
  if (dirs.length === 0) throw new Error(`无缓存目录前缀 ${dirPrefix}`);
  const dir = join(cacheRoot, dirs[0]);
  const files = readdirSync(dir);
  const hit = files.find((f) => f.includes(fileHint) && f.endsWith('.md'));
  if (!hit) throw new Error(`${dir} 下找不到含「${fileHint}」的 md：${files.join(', ')}`);
  return join(dir, hit);
}

function extractFirstJsonObject(md: string): string | null {
  const fence = /```(?:json|JSON)?\s*\n([\s\S]*?)```/.exec(md);
  const blob = fence ? fence[1] : md;
  const start = blob.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < blob.length; i++) {
    const ch = blob[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return blob.slice(start, i + 1);
    }
  }
  return null;
}

function isIconToken(token: string): boolean {
  return IconTokenSchema.safeParse(token).success;
}

/** 最小修补：表单外补 behaviors；无效 icon token 换成 down_outlined */
function normalizeOfficial(data: unknown): unknown {
  const walk = (node: unknown, inForm: boolean): unknown => {
    if (Array.isArray(node)) return node.map((n) => walk(n, inForm));
    if (!node || typeof node !== 'object') return node;
    const obj = { ...(node as Record<string, unknown>) };
    const tag = typeof obj.tag === 'string' ? obj.tag : '';
    const nextInForm = inForm || tag === 'form';

    if (obj.icon && typeof obj.icon === 'object') {
      const icon = { ...(obj.icon as Record<string, unknown>) };
      if (typeof icon.token === 'string' && !isIconToken(icon.token)) {
        icon.token = 'down_outlined';
      }
      obj.icon = icon;
    }
    if (obj.header && typeof obj.header === 'object') {
      const header = { ...(obj.header as Record<string, unknown>) };
      if (header.icon && typeof header.icon === 'object') {
        const icon = { ...(header.icon as Record<string, unknown>) };
        if (typeof icon.token === 'string' && !isIconToken(icon.token)) {
          icon.token = 'down_outlined';
        }
        header.icon = icon;
      }
      obj.header = header;
    }

    if (tag === 'img' && (obj.alt === undefined || obj.alt === null)) {
      obj.alt = { tag: 'plain_text', content: '' };
    }

    if (!nextInForm && NEEDS_BEHAVIORS.has(tag)) {
      const behaviors = obj.behaviors;
      const missing = !Array.isArray(behaviors) || behaviors.length === 0;
      if (missing) {
        if (typeof obj.url === 'string' && obj.url) {
          obj.behaviors = [
            {
              type: 'open_url',
              default_url: obj.url,
            },
          ];
        } else {
          obj.behaviors = [{ type: 'callback', value: { from: 'official-doc-normalize' } }];
        }
      }
    }

    for (const key of Object.keys(obj)) {
      if (key === 'icon' || key === 'header') continue;
      obj[key] = walk(obj[key], nextInForm);
    }
    return obj;
  };
  return walk(data, false);
}

function main(): void {
  const cacheRoot = findMcpRoot();
  mkdirSync(GOLDEN_DIR, { recursive: true });

  const results: Array<{ id: string; ok: boolean; errors: string[]; golden: string }> = [];

  for (const src of SOURCES) {
    const goldenName = `official-${src.id.toLowerCase()}.json`;
    const goldenPath = join(GOLDEN_DIR, goldenName);
    try {
      const mdPath = findExampleFile(cacheRoot, src.cacheDirPrefix, src.exampleFileHint);
      const md = readFileSync(mdPath, 'utf8');
      const jsonText = extractFirstJsonObject(md);
      if (!jsonText) throw new Error(`未能从 ${basename(mdPath)} 提取 JSON`);
      let data: unknown = JSON.parse(jsonText);
      // 富文本示例有时只是 content 片段，包一层完整卡
      if (
        data &&
        typeof data === 'object' &&
        !('schema' in (data as object)) &&
        'tag' in (data as object) &&
        (data as { tag: string }).tag === 'markdown'
      ) {
        data = { schema: '2.0', body: { elements: [data] } };
      }
      if (data && typeof data === 'object' && !('schema' in (data as object))) {
        data = { schema: '2.0', body: { elements: [data] } };
      }
      data = normalizeOfficial(data);
      const diags = validateData(data).filter((d) => d.severity === 'error');
      writeFileSync(goldenPath, JSON.stringify(data, null, 2) + '\n');

      writeFileSync(
        join(TASKS_DIR, `${src.id}.json`),
        JSON.stringify(
          {
            id: src.id,
            difficulty: src.difficulty,
            prompt: src.prompt,
            golden: goldenName,
            source: src.docPath,
            sourceNote: `官方文档示例抽取自 ${basename(mdPath)}；仅做 schema 兼容最小修补`,
          },
          null,
          2,
        ) + '\n',
      );

      results.push({
        id: src.id,
        ok: diags.length === 0,
        errors: diags.slice(0, 5).map((d) => `${d.path}: ${d.message}`),
        golden: goldenName,
      });
      console.log(`${src.id}: ${diags.length === 0 ? 'OK' : 'FAIL'} <- ${basename(mdPath)}`);
      for (const e of results[results.length - 1].errors) console.log(`  - ${e}`);
    } catch (err) {
      results.push({ id: src.id, ok: false, errors: [String(err)], golden: goldenName });
      console.error(`${src.id}: ERROR ${String(err)}`);
    }
  }

  // 清理旧手写题与 golden
  for (const f of readdirSync(TASKS_DIR)) {
    if (/^S(1[4-6]|0\d)\.json$/.test(f)) {
      const id = f.replace('.json', '');
      if (!SOURCES.some((s) => s.id === id) && f.startsWith('S')) {
        /* keep handled below */
      }
    }
  }
  for (const f of readdirSync(TASKS_DIR)) {
    if (!/^S\d+\.json$/.test(f)) continue;
    const id = f.replace('.json', '');
    if (!SOURCES.some((s) => s.id === id)) {
      unlinkSync(join(TASKS_DIR, f));
      console.log('removed task', f);
    }
  }
  for (const f of readdirSync(GOLDEN_DIR)) {
    if (f.startsWith('g-s') || (f.startsWith('official-') && !SOURCES.some((s) => f === `official-${s.id.toLowerCase()}.json`))) {
      unlinkSync(join(GOLDEN_DIR, f));
      console.log('removed golden', f);
    }
  }

  writeFileSync(join(TASKS_DIR, '_official-import-report.json'), JSON.stringify(results, null, 2) + '\n');
  const fail = results.filter((r) => !r.ok);
  console.log(`\n完成：${results.length - fail.length}/${results.length} 通过 schema`);
  if (fail.length) process.exitCode = 1;
}

main();
