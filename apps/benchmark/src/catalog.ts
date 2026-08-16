/** 被测对象名录：每个模型一条完整配置（name / model / baseUrl / apiKey / extra / promptHint）。 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BenchmarkConfig, ModelConfig } from './types.js';

function resolveDefaultCatalogPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const p of [join(here, '..', 'models.json'), join(here, '..', '..', 'models.json')]) {
    if (existsSync(p)) return p;
  }
  throw new Error('找不到 models.json');
}

export function defaultCatalogPath(): string {
  return resolveDefaultCatalogPath();
}

export function loadCatalog(path: string = defaultCatalogPath()): ModelConfig[] {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as BenchmarkConfig;
  if (!Array.isArray(raw.models)) throw new Error(`${path} 缺少 models 数组`);
  for (const m of raw.models) {
    if (!m.name || !m.model) throw new Error(`${path} 中存在缺少 name/model 的被测对象`);
  }
  return raw.models;
}

/** 按展示名精确匹配，其次按 model ID 精确匹配。同 model、不同 extra/promptHint 必须用不同 name。 */
export function findSubject(catalog: ModelConfig[], id: string): ModelConfig | undefined {
  return catalog.find((m) => m.name === id) ?? catalog.find((m) => m.model === id);
}

/** 展开配置字符串里的 ${ENV_VAR}；未定义的变量展开为空串。 */
export function expandEnvVars(config: ModelConfig, env: NodeJS.ProcessEnv = process.env): ModelConfig {
  const expand = (value: string | undefined): string | undefined => {
    if (value === undefined) return undefined;
    return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, key: string) => env[key] ?? '');
  };
  return {
    ...config,
    baseUrl: expand(config.baseUrl) || undefined,
    apiKey: expand(config.apiKey) || undefined,
  };
}

export function applyCliOverrides(
  config: ModelConfig,
  overrides: { baseUrl?: string; apiKey?: string },
): ModelConfig {
  return {
    ...config,
    baseUrl: overrides.baseUrl ?? config.baseUrl,
    apiKey: overrides.apiKey ?? config.apiKey,
  };
}

export function resolveRunModels(opts: {
  model?: string;
  config?: string;
  baseUrl?: string;
  apiKey?: string;
}): ModelConfig[] {
  if (opts.config) {
    const catalog = loadCatalog(opts.config);
    if (!opts.model) return catalog;
    const found = findSubject(catalog, opts.model);
    if (!found) throw new Error(`未在 ${opts.config} 中找到被测对象 "${opts.model}"`);
    return [found];
  }
  if (!opts.model) return [];
  const catalog = loadCatalog();
  const found = findSubject(catalog, opts.model);
  if (found) return [found];
  if (opts.baseUrl || opts.apiKey) {
    return [{ name: opts.model, model: opts.model, baseUrl: opts.baseUrl, apiKey: opts.apiKey }];
  }
  throw new Error(
    `未在 ${defaultCatalogPath()} 中找到被测对象 "${opts.model}"。请写入 models.json，或同时传入 --base-url 作为一次性配置。`,
  );
}

