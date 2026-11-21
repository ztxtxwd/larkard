import { createHash } from 'node:crypto';
import {
  CARD_SIZE_BUDGET,
  dispatchAction,
  eventFromCallback,
  loadProgram,
  renderProgram,
  type ActionEvent,
  type CompiledProgram,
  type Diagnostic,
  type JsonObject,
  type Toast,
} from '../index.js';
import { cardByteLength } from '../../core/state/size.js';
import { composeCard, readEnvelope, type InstanceMeta } from './envelope.js';
import { FeishuApiError, MESSAGE_RATE_LIMIT, RATE_LIMIT, type CardHost, type SendTarget } from './feishu.js';

/**
 * 回调响应体：飞书要求 3 秒内返回。
 *
 * `card` 是飞书"处理卡片回调 · 方式一"：把新卡片放进响应体，平台用它替换消息里的卡片。
 * toast 与卡片在同一个响应体里，要么一起生效要么一起丢掉。
 */
export interface CallbackResponse {
  toast?: Toast;
  /** 回传的新卡片；平台用它替换消息里的卡片 */
  card?: { type: 'raw'; data: JsonObject };
}

export interface RuntimeLogger {
  info(message: string, extra?: unknown): void;
  warn(message: string, extra?: unknown): void;
  error(message: string, extra?: unknown): void;
}

/** 持久化到宿主存储里的卡片实例：程序、状态与版本号。 */
export interface StoredCardInstance {
  /** 原始卡片程序文档（不含状态） */
  program: JsonObject;
  /** 状态版本，与封印在卡片上的 `rev` 一致 */
  rev: number;
  state: JsonObject;
}

/**
 * 实例持久化。配置后冷启动优先从这里恢复，不再依赖平台读回；
 * bot 这类「可能不在会话里」的宿主必须提供。
 */
export interface CardInstanceStore {
  load(messageId: string): Promise<StoredCardInstance | null>;
  save(messageId: string, instance: StoredCardInstance): Promise<void>;
}

export interface RuntimeOptions {
  /** 读写卡片消息的宿主实现；只处理回调时可以只实现 `getRawCard`。 */
  api?: CardHost;
  /** 实例持久化；配置后冷启动优先从 store 恢复。 */
  store?: CardInstanceStore;
  logger?: RuntimeLogger;
  /** 内存里最多缓存多少张卡片实例，超出时淘汰最久未用且空闲的 */
  maxInstances?: number;
  /**
   * 每批点击前先读回平台上的卡片再对账。默认 true；配置 `store` 时默认 false
   * （单进程写同一张卡，store 就是真源，不需要每次都多一次 GET）。
   *
   * 消息卡片没有乐观锁（CardKit 的 sequence 没有对应物），多个进程写同一张卡时，
   * 只能靠读一次平台来发现别人写过的痕迹。
   */
  readBeforeApply?: boolean;
  /** 发卡遇到限频时的退避间隔（毫秒）。默认 0.5s、1s、2s。 */
  retryDelaysMs?: number[];
  /** 卡片体积上限（字节）。默认 30KB，与平台一致。 */
  cardSizeBudget?: number;
}

export interface SendResult {
  messageId: string;
  bytes: number;
  warnings: string[];
}

export class CardTooLargeError extends Error {
  constructor(readonly bytes: number, budget: number = CARD_SIZE_BUDGET) {
    super(`卡片封印后 ${bytes} 字节，超过建议上限 ${budget}；请精简卡片或减少状态里的数据`);
    this.name = 'CardTooLargeError';
  }
}

interface Pending {
  event: ActionEvent;
  /** undefined：不是本运行时的卡片，交还给宿主继续处理 */
  resolve(response: CallbackResponse | undefined): void;
}

interface Instance {
  messageId: string;
  /** 已从卡片读回；null 表示还没加载（或缓存已作废） */
  loaded: Loaded | null;
  queue: Pending[];
  running: boolean;
  lastUsed: number;
}

interface Loaded {
  program: CompiledProgram;
  source: JsonObject;
  meta: InstanceMeta;
  /** 这个状态是不是刚刚从平台读回来的 */
  fromPlatform: boolean;
}

const FAILED: Toast = { type: 'error', content: '卡片出错了，操作没有生效' };
const TOO_LARGE: Toast = { type: 'error', content: '卡片太大了，这次的改动装不下' };
const DEFAULT_RETRY_DELAYS_MS = [500, 1000, 2000];

/**
 * 卡片体积快到上限时的提醒。
 *
 * 每次更新都会把整个状态重新封印进卡片，所以卡片体积是**跟着状态涨的**。
 * 一张已经贴着上限的卡，几次点击之后就发不出新卡了 —— 这时候用户看到的是
 * "操作没生效"，很难查。发卡时就提醒一下。
 */
function headroomWarnings(bytes: number, budget: number): string[] {
  const used = bytes / budget;
  if (used < 0.8) return [];
  return [`卡片体积已用掉 ${Math.round(used * 100)}%，状态再涨一点就超过 ${budget} 字节上限（每次更新都会重新封印整张卡）`];
}

const silentLogger: RuntimeLogger = { info() {}, warn() {}, error() {} };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 限频：请求被平台挡在门外，没有真的发出去，重试是安全的。 */
function isRateLimited(err: unknown): boolean {
  return err instanceof FeishuApiError && (err.code === RATE_LIMIT || err.code === MESSAGE_RATE_LIMIT);
}

/**
 * 新的版本号：至少比本地缓存、以及用户点击的那张卡片都大。
 * 用户点的是旧视图时（event.rev < 本地 rev），新卡的版本仍要盖过所有旧版本。
 */
function nextRev(localRev: number, batch: Pending[]): number {
  let rev = localRev;
  for (const { event } of batch) {
    if (typeof event.rev === 'number' && event.rev > rev) rev = event.rev;
  }
  return rev + 1;
}

/**
 * 卡片程序运行时。程序和状态可以全部封印在卡片上；配置 `store` 时，
 * 宿主（例如不在消息所在会话里的 bot）也能在冷启动后恢复实例：
 * 内存 → store → 平台卡片。
 *
 * 同一张卡的点击在 mailbox 里串行处理；排队中的点击合并成一批：执行动作、渲染新卡，
 * 把新卡放进这一批最后一个回调响应里（飞书的"方式一"），一次往返完成提示与更新。
 */
export class CardRuntime {
  private readonly api?: CardHost;
  private readonly store?: CardInstanceStore;
  private readonly logger: RuntimeLogger;
  private readonly maxInstances: number;
  private readonly readBeforeApply: boolean;
  private readonly retryDelaysMs: number[];
  private readonly cardSizeBudget: number;
  private readonly instances = new Map<string, Instance>();
  private readonly programs = new Map<string, CompiledProgram>();
  private readonly draining = new Set<Promise<void>>();
  private readonly pendingSaves = new Set<Promise<void>>();

  constructor(options: RuntimeOptions) {
    this.api = options.api;
    this.store = options.store;
    this.logger = options.logger ?? silentLogger;
    this.maxInstances = options.maxInstances ?? 1000;
    this.readBeforeApply = options.readBeforeApply ?? !options.store;
    this.retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    this.cardSizeBudget = options.cardSizeBudget ?? CARD_SIZE_BUDGET;
  }

  /** 编译程序、渲染初始卡片并发出去。程序有错时抛 ProgramError（带逐条诊断）。 */
  async send(doc: JsonObject, target: SendTarget): Promise<SendResult> {
    const program = this.compile(doc);
    const state = program.initialState;
    const rendered = renderProgram(program, state, { rev: 0 });
    const meta: InstanceMeta = { rev: 0, state };
    const card = composeCard(rendered.card, doc, meta);
    const bytes = cardByteLength(card);
    if (bytes > this.cardSizeBudget) throw new CardTooLargeError(bytes, this.cardSizeBudget);

    const messageId = await this.sendWithRetry(target, card);
    this.remember({ messageId, loaded: { program, source: doc, meta, fromPlatform: false }, queue: [], running: false, lastUsed: Date.now() });
    this.persist(messageId, { program: doc, rev: 0, state });
    this.logger.info('card sent', { messageId, bytes });
    return { messageId, bytes, warnings: [...rendered.warnings, ...headroomWarnings(bytes, this.cardSizeBudget)] };
  }

  /**
   * 处理 card.action.trigger 回调（整个回调体或其中的 event 都行）。
   * 不是本运行时发出的卡片时返回 undefined，交给别的处理器。
   */
  async handleCallback(payload: unknown): Promise<CallbackResponse | undefined> {
    const raw = ((payload as { event?: unknown })?.event ?? payload) as {
      context?: { open_message_id?: unknown };
      open_message_id?: unknown;
    };
    const event = eventFromCallback(raw);
    const messageId = raw?.context?.open_message_id ?? raw?.open_message_id;
    if (!event || typeof messageId !== 'string') return undefined;

    const instance = this.instance(messageId);
    return new Promise<CallbackResponse | undefined>((resolve) => {
      instance.queue.push({ event, resolve });
      if (instance.running) return;
      const draining = this.drain(instance);
      this.draining.add(draining);
      void draining.finally(() => this.draining.delete(draining));
    });
  }

  /** 等所有卡片处理完排队的点击、持久化也落盘（测试与优雅退出用）。 */
  async idle(): Promise<void> {
    while (this.draining.size > 0 || this.pendingSaves.size > 0) {
      await Promise.all([...this.draining, ...this.pendingSaves]);
    }
  }

  private compile(doc: JsonObject): CompiledProgram {
    const key = createHash('sha256').update(JSON.stringify(doc)).digest('hex');
    const hit = this.programs.get(key);
    if (hit) return hit;
    const program = loadProgram(doc);
    if (this.programs.size >= this.maxInstances) this.programs.delete(this.programs.keys().next().value as string);
    this.programs.set(key, program);
    return program;
  }

  private instance(messageId: string): Instance {
    let instance = this.instances.get(messageId);
    if (!instance) {
      instance = { messageId, loaded: null, queue: [], running: false, lastUsed: Date.now() };
      this.remember(instance);
    }
    instance.lastUsed = Date.now();
    return instance;
  }

  private remember(instance: Instance): void {
    this.instances.set(instance.messageId, instance);
    if (this.instances.size <= this.maxInstances) return;
    const idle = [...this.instances.values()].filter((i) => !i.running && i.queue.length === 0);
    idle.sort((a, b) => a.lastUsed - b.lastUsed);
    for (const victim of idle.slice(0, this.instances.size - this.maxInstances)) this.instances.delete(victim.messageId);
  }

  /** 写实例存储。失败只记日志：卡片已经从回调响应回给客户端，不因此让点击报错。 */
  private persist(messageId: string, instance: StoredCardInstance): void {
    if (!this.store) return;
    const saving = this.store.save(messageId, instance).catch((err) => {
      this.logger.warn('save instance failed', { messageId, err });
    });
    this.pendingSaves.add(saving);
    void saving.finally(() => this.pendingSaves.delete(saving));
  }

  /** 从平台读回卡片：封印的程序、状态与版本号。不是本运行时发的卡片时抛 NotOurCard。 */
  private async readPlatform(instance: Instance): Promise<Loaded> {
    if (!this.api?.getRawCard) throw new NotOurCard();
    const raw = await this.api.getRawCard(instance.messageId);
    const envelope = raw ? readEnvelope(raw) : null;
    if (!envelope) throw new NotOurCard();
    return {
      program: this.compile(envelope.program),
      source: envelope.program,
      meta: envelope.meta,
      fromPlatform: true,
    };
  }

  /**
   * 恢复实例：内存 → store → 平台卡片。
   *
   * store 命中时标记 `fromPlatform: false`，由 store 作为真源；
   * 都没有时抛 NotOurCard，宿主可以把回调交还给其它处理器。
   */
  private async load(instance: Instance): Promise<Loaded> {
    if (instance.loaded) return instance.loaded;
    if (this.store) {
      try {
        const stored = await this.store.load(instance.messageId);
        if (stored) {
          const loaded: Loaded = {
            program: this.compile(stored.program),
            source: stored.program,
            meta: { rev: stored.rev, state: stored.state },
            fromPlatform: false,
          };
          instance.loaded = loaded;
          return loaded;
        }
      } catch (err) {
        this.logger.warn('load instance failed', { messageId: instance.messageId, err });
      }
    }
    const loaded = await this.readPlatform(instance);
    instance.loaded = loaded;
    return loaded;
  }

  /**
   * 与平台对账。消息卡片没有乐观锁，所以每批处理前读一次平台上的卡片：
   * 平台版本更高说明别的进程写过了，采信平台并在这份状态上重放这批动作；
   * 平台版本更低说明平台还没跟上我们上一次的写（读回来的是旧的），保留本地。
   */
  private async reconcile(instance: Instance, local: Loaded): Promise<Loaded> {
    if (!this.readBeforeApply || local.fromPlatform) return local;
    let fresh: Loaded;
    try {
      fresh = await this.readPlatform(instance);
    } catch (err) {
      if (!(err instanceof NotOurCard)) this.logger.warn('reconcile card failed', { messageId: instance.messageId, err });
      return local;
    }
    if (fresh.meta.rev < local.meta.rev) return local;
    instance.loaded = fresh;
    return fresh;
  }

  private async drain(instance: Instance): Promise<void> {
    instance.running = true;
    try {
      await sleep(0);
      while (instance.queue.length > 0) {
        const batch = instance.queue.splice(0);
        let loaded: Loaded;
        try {
          loaded = await this.reconcile(instance, await this.load(instance));
        } catch (err) {
          if (err instanceof NotOurCard) {
            // 不是本协议的卡：交还给宿主，别在缓存里留下空实例。
            batch.forEach((pending) => pending.resolve(undefined));
            if (instance.queue.length === 0) this.instances.delete(instance.messageId);
            continue;
          }
          this.logger.error('load card failed', { messageId: instance.messageId, err });
          batch.forEach((pending) => pending.resolve({ toast: FAILED }));
          continue;
        }
        this.respond(instance, loaded, batch);
      }
    } finally {
      instance.running = false;
    }
  }

  /**
   * 执行这一批点击，渲染新卡，逐个应答。
   *
   * 新卡只挂在这一批最后一个响应上：一批只写一次卡，前面的响应只带 toast。
   * 渲染失败或卡片超限时，整批都改成错误提示、状态也不落盘 —— 否则前面几个动作
   * 已经说了"报名成功"，实际却没生效。
   */
  private respond(instance: Instance, loaded: Loaded, batch: Pending[]): void {
    let state = loaded.meta.state;
    const toasts: (Toast | undefined)[] = [];
    try {
      for (const { event } of batch) {
        const result = dispatchAction(loaded.program, state, event);
        if (result.error) this.logger.warn('action failed', { messageId: instance.messageId, action: event.action, error: result.error });
        if (result.changed) state = result.state;
        toasts.push(result.toast);
      }
    } catch (err) {
      this.logger.error('dispatch failed', { messageId: instance.messageId, err });
      batch.forEach((pending) => pending.resolve({ toast: FAILED }));
      return;
    }

    const stateChanged = state !== loaded.meta.state;
    /**
     * 用户点的是旧视图（上一次响应丢了 / 客户端超时 / 另一台设备还没刷新）时，
     * 即使这次动作没改状态，也要把当前卡带回去；否则客户端会一直停在旧状态，
     * 服务端却已经推进了 rev。正常重复点击（rev == 当前 rev）只回 toast。
     */
    const stale = batch.some(
      ({ event }) => typeof event.rev === 'number' && event.rev !== loaded.meta.rev,
    );

    let card: JsonObject | undefined;
    if (stateChanged || stale) {
      const rev = stateChanged ? nextRev(loaded.meta.rev, batch) : loaded.meta.rev;
      try {
        const rendered = renderProgram(loaded.program, state, { rev });
        const composed = composeCard(rendered.card, loaded.source, { rev, state });
        const bytes = cardByteLength(composed);
        if (bytes > this.cardSizeBudget) throw new CardTooLargeError(bytes, this.cardSizeBudget);
        card = composed;
        if (stateChanged) {
          loaded.meta = { rev, state };
          this.persist(instance.messageId, { program: loaded.source, rev, state });
        }
      } catch (err) {
        this.logger.error('compose card failed', { messageId: instance.messageId, err });
        const toast = err instanceof CardTooLargeError ? TOO_LARGE : FAILED;
        batch.forEach((pending) => pending.resolve({ toast }));
        return;
      }
    }
    loaded.fromPlatform = false;

    const last = batch.length - 1;
    batch.forEach((pending, i) => {
      const response: CallbackResponse = {};
      if (toasts[i]) response.toast = toasts[i];
      if (card && i === last) response.card = { type: 'raw', data: card };
      pending.resolve(response);
    });
  }

  /**
   * 发卡。只对限频重试：请求被平台挡在门外，没有真的发出去，重试不会多发一张卡。
   * 网络错误和 5xx 说不清消息有没有已经发出去，重试可能多发一条，所以不重试。
   */
  private async sendWithRetry(target: SendTarget, card: JsonObject): Promise<string> {
    const sendCard = this.api?.sendCard;
    if (!sendCard) throw new Error('CardRuntime.send 需要 api.sendCard');
    const delays = this.retryDelaysMs;
    for (let i = 0; ; i += 1) {
      try {
        return await sendCard.call(this.api, target, card);
      } catch (err) {
        if (i >= delays.length || !isRateLimited(err)) throw err;
        this.logger.warn('send card limited', { retry: i, err });
        await sleep(delays[i] ?? 0);
      }
    }
  }
}

class NotOurCard extends Error {}

export type { Diagnostic };
