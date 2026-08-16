/**
 * OpenAI 兼容 Chat Completions 客户端（原生 fetch，零 SDK 依赖）。
 * 兼容 OpenAI / DeepSeek / Qwen / OpenRouter / 本地 vLLM 等服务。
 */
import type { ModelConfig } from './types.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  timeoutMs?: number;
  retries?: number;
}

export interface ChatClient {
  readonly name: string;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>;
}

export function createClient(config: ModelConfig, apiKeyFallback?: string): ChatClient {
  const baseUrl = (config.baseUrl ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
  const apiKey = config.apiKey ?? process.env.OPENAI_API_KEY ?? apiKeyFallback ?? '';

  return {
    name: config.name,
    async chat(messages, options = {}) {
      const { temperature = 0, timeoutMs = 120_000, retries = 5 } = options;
      let lastError: unknown;

      for (let attempt = 0; attempt <= retries; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const res = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            signal: controller.signal,
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: config.model,
              messages,
              temperature,
              ...config.extra,
            }),
          });
          if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
          }
          const data = (await res.json()) as {
            choices?: { message?: { content?: string | null } }[];
          };
          const content = data.choices?.[0]?.message?.content;
          if (typeof content !== 'string') {
            throw new Error(`响应中缺少 choices[0].message.content: ${JSON.stringify(data).slice(0, 300)}`);
          }
          return content;
        } catch (err) {
          lastError = err;
          if (attempt < retries) {
            const is429 = String(err).includes('HTTP 429');
            const delay = is429 ? 4000 * 2 ** attempt : 1500 * (attempt + 1);
            await new Promise((r) => setTimeout(r, delay));
          }
        } finally {
          clearTimeout(timer);
        }
      }
      throw new Error(`模型 ${config.name} 请求失败（已重试）: ${String(lastError)}`);
    },
  };
}

/** 简单并发池：按固定并发度执行任务。 */
export async function runPool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}
