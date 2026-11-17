/**
 * RFC 6902 的解析与应用。
 *
 * 两条硬约束：
 * - **失败不改文档**：在 `structuredClone` 出来的副本上应用，任何一步出错都直接抛，
 *   调用方手里的底稿保持原样（模型重试时不会拿到半截卡片）；
 * - **报错能定位**：每条错误带 0-based 操作序号、出错路径和原因，可直接回给模型或用户
 *   （`OPERATION_PATH_UNRESOLVABLE` 这种库内部名字对它们没有意义）。
 */
import {
  PatchError,
  type ParseOptions,
  type PatchOpKind,
  type PatchOperation,
  type PatchErrorCode,
} from './types.js';

const KINDS = new Set<PatchOpKind>(['add', 'remove', 'replace', 'move', 'copy', 'test']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `（replace /body/elements/0）`，用于报错前缀。 */
function describeOp(op: unknown): string {
  if (!isRecord(op)) return '';
  const kind = typeof op.op === 'string' ? op.op : '?';
  const path = typeof op.path === 'string' ? ` ${op.path || '/'}` : '';
  const from = typeof op.from === 'string' ? ` from ${op.from || '/'}` : '';
  return `（${kind}${path}${from}）`;
}

function fail(
  code: PatchErrorCode,
  index: number,
  op: unknown,
  reason: string,
  path = isRecord(op) && typeof op.path === 'string' ? op.path : '',
): never {
  throw new PatchError(code, `第 ${index + 1} 个操作${describeOp(op)}：${reason}`, {
    index,
    path,
    operation: op,
  });
}

/**
 * JSON Pointer → token 数组。空串表示整份文档。
 * `~1` → `/`、`~0` → `~`（顺序固定：先 `~1` 再 `~0`），其它 `~x` 一律判非法。
 */
export function pointerTokens(pointer: string): string[] {
  if (pointer === '') return [];
  if (!pointer.startsWith('/')) throw new Error('JSON Pointer 必须以 / 开头');
  return pointer.slice(1).split('/').map((token) => {
    if (/~(?![01])/.test(token)) throw new Error('JSON Pointer 里的 ~ 只能写成 ~0 或 ~1');
    return token.replace(/~1/g, '/').replace(/~0/g, '~');
  });
}

/**
 * 解析补丁：接受操作数组，或它的 JSON 字符串（模型常把数组当字符串塞进工具参数）。
 *
 * 只做**形状**校验（op / path / value / from），不碰文档；空补丁默认报错，
 * 需要 RFC 语义时传 `{ allowEmpty: true }`。
 */
export function parsePatch(input: unknown, options: ParseOptions = {}): PatchOperation[] {
  let raw = input;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      throw new PatchError('invalid-patch', '补丁不是合法的 JSON 字符串');
    }
  }
  if (!Array.isArray(raw)) {
    throw new PatchError('invalid-patch', '补丁必须是 RFC 6902 操作数组');
  }
  if (raw.length === 0 && options.allowEmpty !== true) {
    throw new PatchError('empty-patch', '补丁为空：没有任何要做的修改');
  }

  return raw.map((item, index) => normalize(item, index));
}

function normalize(item: unknown, index: number): PatchOperation {
  if (!isRecord(item)) fail('invalid-operation', index, item, '不是对象');

  const kind = item.op;
  if (typeof kind !== 'string' || !KINDS.has(kind as PatchOpKind)) {
    fail('invalid-operation', index, item, `未知操作「${String(kind)}」（支持 add / remove / replace / move / copy / test）`);
  }
  if (typeof item.path !== 'string') {
    fail('invalid-operation', index, item, 'path 必须是字符串');
  }
  try {
    pointerTokens(item.path);
  } catch (error) {
    fail('invalid-path', index, item, (error as Error).message);
  }

  const needsValue = kind === 'add' || kind === 'replace' || kind === 'test';
  if (needsValue && !('value' in item)) {
    fail('invalid-operation', index, item, `${kind} 需要 value`);
  }
  if (kind === 'move' || kind === 'copy') {
    if (typeof item.from !== 'string') {
      fail('invalid-operation', index, item, `${kind} 需要字符串类型的 from`);
    }
    try {
      pointerTokens(item.from);
    } catch (error) {
      fail('invalid-path', index, item, `from：${(error as Error).message}`);
    }
  }

  return item as unknown as PatchOperation;
}

/**
 * 应用补丁，返回**新文档**（输入不动）。任何一步失败都抛 `PatchError`，且不会返回半成品。
 *
 * 支持全部六种操作；`path: ""` 表示整份文档（`remove` 整份文档会被拒绝）。
 */
export function applyPatch<T>(doc: T, ops: readonly PatchOperation[]): T {
  const clone = structuredClone(doc);
  let current: unknown = clone;
  for (let index = 0; index < ops.length; index++) {
    const op = ops[index]!;
    current = applyOne(current, op, index);
  }
  return current as T;
}

function applyOne(doc: unknown, op: PatchOperation, index: number): unknown {
  const tokens = safeTokens(op.path, index, op);
  const fromTokens = 'from' in op ? safeTokens(op.from, index, op) : undefined;

  if (tokens.length === 0) {
    // 整份文档：add / replace / test / copy / move 都是「换成新值」，remove 拒绝。
    if (op.op === 'remove') {
      fail('invalid-path', index, op, '不能删除整份文档（path 为空）');
    }
    if (op.op === 'test') {
      if (!deepEqual(doc, op.value)) {
        fail('test-failed', index, op, `test 断言不成立：整份文档与 value 不一致`);
      }
      return doc;
    }
    if (op.op === 'move') {
      if (!fromTokens || fromTokens.length === 0) fail('invalid-path', index, op, 'from 不能也是整份文档');
      assertNotPrefix(fromTokens, tokens, index, op);
      const value = read(doc, fromTokens, index, op);
      removeAt(doc, fromTokens, index, op);
      return value;
    }
    if (op.op === 'copy') {
      if (!fromTokens) fail('invalid-operation', index, op, 'copy 需要 from');
      return read(doc, fromTokens, index, op);
    }
    return op.value;
  }

  if (op.op === 'test') {
    if (!deepEqual(read(doc, tokens, index, op), op.value)) {
      fail(
        'test-failed',
        index,
        op,
        `test 断言不成立：${op.path} 的实际值与 value 不一致`,
      );
    }
    return doc;
  }

  if (op.op === 'move') {
    if (!fromTokens) fail('invalid-operation', index, op, 'move 需要 from');
    assertNotPrefix(fromTokens, tokens, index, op);
    const value = read(doc, fromTokens, index, op);
    removeAt(doc, fromTokens, index, op);
    insert(doc, tokens, value, index, op);
    return doc;
  }

  if (op.op === 'copy') {
    if (!fromTokens) fail('invalid-operation', index, op, 'copy 需要 from');
    const value = structuredClone(read(doc, fromTokens, index, op));
    insert(doc, tokens, value, index, op);
    return doc;
  }

  if (op.op === 'remove') {
    removeAt(doc, tokens, index, op);
    return doc;
  }

  if (op.op === 'replace') {
    replaceAt(doc, tokens, op.value, index, op);
    return doc;
  }

  insert(doc, tokens, op.value, index, op);
  return doc;
}

function safeTokens(pointer: string, index: number, op: PatchOperation): string[] {
  try {
    return pointerTokens(pointer);
  } catch (error) {
    fail('invalid-path', index, op, (error as Error).message, pointer);
  }
}

/** RFC 6902：`from` 不能是 `path` 的严格前缀（不能把节点移进自己的子节点）。 */
function assertNotPrefix(from: string[], to: string[], index: number, op: PatchOperation): void {
  if (from.length >= to.length) return;
  if (from.every((token, i) => token === to[i])) {
    fail('invalid-path', index, op, 'move 的 from 是 path 的前缀（不能把节点移进自己的子节点）', op.path);
  }
}

/** 逐段解析父节点；不存在或不是容器就报错。 */
function resolveParent(doc: unknown, tokens: string[], index: number, op: PatchOperation): unknown {
  let node = doc;
  for (let i = 0; i < tokens.length - 1; i++) {
    const token = tokens[i]!;
    const prefix = '/' + tokens.slice(0, i + 1).join('/');
    if (Array.isArray(node)) {
      node = node[arrayIndex(node.length, token, false, index, op, prefix)];
    } else if (isRecord(node)) {
      if (!(token in node)) fail('parent-not-found', index, op, `父级路径不存在：${prefix}`, prefix);
      node = node[token];
    } else {
      fail('parent-not-found', index, op, `父级不是对象或数组：${prefix || '/'}`, prefix);
    }
  }
  return node;
}

function read(doc: unknown, tokens: string[], index: number, op: PatchOperation): unknown {
  let node = doc;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    const prefix = '/' + tokens.slice(0, i + 1).join('/');
    if (Array.isArray(node)) {
      node = node[arrayIndex(node.length, token, false, index, op, prefix)];
    } else if (isRecord(node)) {
      if (!(token in node)) fail('path-not-found', index, op, `路径不存在：${prefix}`, prefix);
      node = node[token];
    } else {
      fail('parent-not-found', index, op, `父级不是对象或数组：${prefix || '/'}`, prefix);
    }
  }
  return node;
}

function insert(
  doc: unknown,
  tokens: string[],
  value: unknown,
  index: number,
  op: PatchOperation,
): void {
  const parent = resolveParent(doc, tokens, index, op);
  const key = tokens[tokens.length - 1]!;
  if (Array.isArray(parent)) {
    parent.splice(arrayIndex(parent.length, key, true, index, op, op.path), 0, value);
    return;
  }
  if (isRecord(parent)) {
    parent[key] = value;
    return;
  }
  fail('parent-not-found', index, op, `父级不是对象或数组：${op.path}`, op.path);
}

function replaceAt(
  doc: unknown,
  tokens: string[],
  value: unknown,
  index: number,
  op: PatchOperation,
): void {
  const parent = resolveParent(doc, tokens, index, op);
  const key = tokens[tokens.length - 1]!;
  if (Array.isArray(parent)) {
    parent[arrayIndex(parent.length, key, false, index, op, op.path)] = value;
    return;
  }
  if (isRecord(parent)) {
    if (!(key in parent)) fail('path-not-found', index, op, `路径不存在：${op.path}`, op.path);
    parent[key] = value;
    return;
  }
  fail('parent-not-found', index, op, `父级不是对象或数组：${op.path}`, op.path);
}

function removeAt(doc: unknown, tokens: string[], index: number, op: PatchOperation): void {
  const parent = resolveParent(doc, tokens, index, op);
  const key = tokens[tokens.length - 1]!;
  if (Array.isArray(parent)) {
    parent.splice(arrayIndex(parent.length, key, false, index, op, op.path), 1);
    return;
  }
  if (isRecord(parent)) {
    if (!(key in parent)) fail('path-not-found', index, op, `路径不存在：${op.path}`, op.path);
    delete parent[key];
    return;
  }
  fail('parent-not-found', index, op, `父级不是对象或数组：${op.path}`, op.path);
}

/** 数组下标：`-` 只在 add 里合法（追加到末尾）；其余必须是 [0, length] 内的整数。 */
function arrayIndex(
  length: number,
  token: string,
  forAdd: boolean,
  index: number,
  op: PatchOperation,
  prefix: string,
): number {
  if (forAdd && token === '-') return length;
  if (!/^(0|[1-9]\d*)$/.test(token)) {
    fail('index-invalid', index, op, `数组下标非法：「${token}」${forAdd ? '（追加请用 -）' : ''}`, prefix);
  }
  const value = Number(token);
  if (forAdd ? value > length : value >= length) {
    fail('index-invalid', index, op, `数组下标越界：${prefix}（长度 ${length}）`, prefix);
  }
  return value;
}

/** JSON 语义的深比较（对象键顺序无关，数组按序）。 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a)) {
    return Array.isArray(b) && a.length === b.length && a.every((value, i) => deepEqual(value, b[i]));
  }
  if (isRecord(a)) {
    if (!isRecord(b)) return false;
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every((key) => key in b && deepEqual(a[key], b[key]))
    );
  }
  return false;
}
