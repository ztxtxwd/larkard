import { ExprError } from '../errors.js';
import type { BinaryOp, Expr } from './ast.js';

type Token =
  | { t: 'num'; v: number; pos: number }
  | { t: 'str'; v: string; pos: number }
  | { t: 'id'; v: string; pos: number }
  | { t: 'op'; v: string; pos: number }
  | { t: 'eof'; pos: number };

export const MAX_EXPR_LENGTH = 2000;

const OPERATORS = [
  '===', '!==', '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.',
  '(', ')', '[', ']', '{', '}', ',', '.', ':', '?', '!', '<', '>', '+', '-', '*', '/', '%',
];

const ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"', '`': '`' };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i] as string;
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (/[0-9]/.test(ch)) {
      const m = /^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(src.slice(i)) as RegExpExecArray;
      tokens.push({ t: 'num', v: Number(m[0]), pos: i });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      const m = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(src.slice(i)) as RegExpExecArray;
      tokens.push({ t: 'id', v: m[0], pos: i });
      i += m[0].length;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const start = i;
      let out = '';
      i += 1;
      for (;;) {
        if (i >= src.length) throw new ExprError('字符串没有闭合', start);
        const c = src[i] as string;
        if (c === ch) break;
        if (c === '\\') {
          const next = src[i + 1];
          if (next === 'u') {
            const hex = src.slice(i + 2, i + 6);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new ExprError('\\u 转义需要 4 位十六进制', i);
            out += String.fromCharCode(parseInt(hex, 16));
            i += 6;
            continue;
          }
          if (next === undefined || !(next in ESCAPES)) throw new ExprError(`不支持的转义 \\${next ?? ''}`, i);
          out += ESCAPES[next];
          i += 2;
          continue;
        }
        out += c;
        i += 1;
      }
      tokens.push({ t: 'str', v: out, pos: start });
      i += 1;
      continue;
    }
    const op = OPERATORS.find((o) => src.startsWith(o, i));
    if (!op) {
      if (ch === '=') throw new ExprError('表达式里不能赋值；比较请用 ==，改状态请用动作里的 set', i);
      throw new ExprError(`无法识别的字符 ${JSON.stringify(ch)}`, i);
    }
    tokens.push({ t: 'op', v: op, pos: i });
    i += op.length;
  }
  tokens.push({ t: 'eof', pos: src.length });
  return tokens;
}

const BINARY_POWER: Record<string, number> = {
  '??': 3,
  '||': 4,
  '&&': 5,
  '==': 6, '!=': 6, '===': 6, '!==': 6,
  '<': 7, '<=': 7, '>': 7, '>=': 7,
  '+': 8, '-': 8,
  '*': 9, '/': 9, '%': 9,
};
const TERNARY_POWER = 2;
const UNARY_POWER = 10;
const POSTFIX_POWER = 11;

/** Math.max(...) 这类写法按内置函数 max(...) 处理。 */
const NAMESPACE_OBJECTS = new Set(['Math']);

class Parser {
  private i = 0;

  constructor(
    private readonly src: string,
    private readonly tokens: Token[],
  ) {}

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.i + offset, this.tokens.length - 1)] as Token;
  }

  private next(): Token {
    const tok = this.peek();
    if (this.i < this.tokens.length - 1) this.i += 1;
    return tok;
  }

  private isOp(v: string, offset = 0): boolean {
    const tok = this.peek(offset);
    return tok.t === 'op' && tok.v === v;
  }

  private expectOp(v: string): Token {
    const tok = this.next();
    if (tok.t !== 'op' || tok.v !== v) throw new ExprError(`这里应为 ${v}，实际是 ${this.describe(tok)}`, tok.pos);
    return tok;
  }

  /** 列表里一项之后：要么是 ","，要么是收尾的 close。 */
  private expectSeparator(close: string): void {
    if (this.isOp(close)) return;
    const tok = this.next();
    if (tok.t !== 'op' || tok.v !== ',') throw new ExprError(`这里应为 , 或 ${close}，实际是 ${this.describe(tok)}`, tok.pos);
  }

  private describe(tok: Token): string {
    if (tok.t === 'eof') return '表达式结尾';
    return JSON.stringify(this.src.slice(tok.pos, tok.pos + 12));
  }

  parse(): Expr {
    const expr = this.expr(0);
    const tok = this.peek();
    if (tok.t !== 'eof') throw new ExprError(`多余的内容 ${this.describe(tok)}`, tok.pos);
    return expr;
  }

  private expr(rbp: number): Expr {
    let left = this.prefix();
    for (;;) {
      const tok = this.peek();
      if (tok.t !== 'op') break;
      const power = this.infixPower(tok.v);
      if (power <= rbp) break;
      left = this.infix(left);
    }
    return left;
  }

  private infixPower(op: string): number {
    if (op === '?') return TERNARY_POWER;
    if (op === '.' || op === '?.' || op === '[' || op === '(') return POSTFIX_POWER;
    return BINARY_POWER[op] ?? 0;
  }

  private prefix(): Expr {
    const tok = this.next();
    switch (tok.t) {
      case 'num':
        return { type: 'literal', value: tok.v, pos: tok.pos };
      case 'str':
        return { type: 'literal', value: tok.v, pos: tok.pos };
      case 'id': {
        if (tok.v === 'true' || tok.v === 'false') return { type: 'literal', value: tok.v === 'true', pos: tok.pos };
        if (tok.v === 'null' || tok.v === 'undefined') return { type: 'literal', value: null, pos: tok.pos };
        if (this.isOp('=>')) {
          this.next();
          return { type: 'lambda', params: [tok.v], body: this.expr(0), pos: tok.pos };
        }
        return { type: 'ident', name: tok.v, pos: tok.pos };
      }
      case 'op':
        return this.prefixOp(tok);
      case 'eof':
        throw new ExprError('表达式不完整', tok.pos);
    }
  }

  private prefixOp(tok: Extract<Token, { t: 'op' }>): Expr {
    switch (tok.v) {
      case '(': {
        if (this.looksLikeLambda()) return this.lambda(tok.pos);
        const inner = this.expr(0);
        this.expectOp(')');
        return inner;
      }
      case '[': {
        const items: Expr[] = [];
        while (!this.isOp(']')) {
          items.push(this.expr(0));
          this.expectSeparator(']');
        }
        this.next();
        return { type: 'array', items, pos: tok.pos };
      }
      case '{': {
        const entries: Array<{ key: string; value: Expr }> = [];
        while (!this.isOp('}')) {
          const keyTok = this.next();
          if (keyTok.t !== 'id' && keyTok.t !== 'str' && keyTok.t !== 'num') {
            throw new ExprError(`对象的键应为名字或字符串，实际是 ${this.describe(keyTok)}`, keyTok.pos);
          }
          const key = String(keyTok.v);
          if (this.isOp(':')) {
            this.next();
            entries.push({ key, value: this.expr(0) });
          } else if (keyTok.t === 'id') {
            entries.push({ key, value: { type: 'ident', name: key, pos: keyTok.pos } });
          } else {
            throw new ExprError(`键 ${key} 后面缺少 :`, keyTok.pos);
          }
          this.expectSeparator('}');
        }
        this.next();
        return { type: 'object', entries, pos: tok.pos };
      }
      case '!':
      case '-':
      case '+':
        return { type: 'unary', op: tok.v, arg: this.expr(UNARY_POWER), pos: tok.pos };
      default:
        throw new ExprError(`这里不能出现 ${this.describe(tok)}`, tok.pos);
    }
  }

  /** 当前位于 "(" 之后：形如 (a, b) => ... 才是箭头函数。 */
  private looksLikeLambda(): boolean {
    let offset = 0;
    for (;;) {
      const tok = this.peek(offset);
      if (tok.t === 'op' && tok.v === ')') return this.isOp('=>', offset + 1);
      if (tok.t !== 'id') return false;
      offset += 1;
      const sep = this.peek(offset);
      if (sep.t === 'op' && sep.v === ',') offset += 1;
    }
  }

  private lambda(pos: number): Expr {
    const params: string[] = [];
    while (!this.isOp(')')) {
      const tok = this.next();
      if (tok.t !== 'id') throw new ExprError('箭头函数的参数应为名字', tok.pos);
      params.push(tok.v);
      this.expectSeparator(')');
    }
    this.next();
    this.expectOp('=>');
    return { type: 'lambda', params, body: this.expr(0), pos };
  }

  private args(): Expr[] {
    const args: Expr[] = [];
    while (!this.isOp(')')) {
      args.push(this.expr(0));
      this.expectSeparator(')');
    }
    this.next();
    return args;
  }

  private infix(left: Expr): Expr {
    const tok = this.next() as Extract<Token, { t: 'op' }>;
    switch (tok.v) {
      case '?': {
        const consequent = this.expr(0);
        this.expectOp(':');
        const alternate = this.expr(TERNARY_POWER - 1);
        return { type: 'conditional', test: left, consequent, alternate, pos: tok.pos };
      }
      case '.':
      case '?.': {
        const name = this.next();
        if (name.t !== 'id') throw new ExprError(`. 后面应为属性名，实际是 ${this.describe(name)}`, name.pos);
        if (this.isOp('(')) {
          this.next();
          const args = this.args();
          if (left.type === 'ident' && NAMESPACE_OBJECTS.has(left.name)) {
            return { type: 'call', name: name.v, args, pos: name.pos };
          }
          return { type: 'call', name: name.v, args: [left, ...args], pos: name.pos };
        }
        return { type: 'member', object: left, property: { type: 'literal', value: name.v, pos: name.pos }, pos: name.pos };
      }
      case '[': {
        const property = this.expr(0);
        this.expectOp(']');
        return { type: 'member', object: left, property, pos: tok.pos };
      }
      case '(': {
        if (left.type !== 'ident') throw new ExprError('只能调用内置函数，如 len(list)', tok.pos);
        return { type: 'call', name: left.name, args: this.args(), pos: left.pos };
      }
      case '&&':
      case '||':
      case '??':
        return { type: 'logical', op: tok.v, left, right: this.expr(BINARY_POWER[tok.v] as number), pos: tok.pos };
      default: {
        const power = BINARY_POWER[tok.v];
        if (power === undefined) throw new ExprError(`这里不能出现 ${this.describe(tok)}`, tok.pos);
        const op = (tok.v === '===' ? '==' : tok.v === '!==' ? '!=' : tok.v) as BinaryOp;
        return { type: 'binary', op, left, right: this.expr(power), pos: tok.pos };
      }
    }
  }
}

const cache = new Map<string, Expr>();
const CACHE_LIMIT = 5000;

/** 解析表达式（结果按源码缓存）。语法错误抛 ExprError。 */
export function parseExpr(src: string): Expr {
  const hit = cache.get(src);
  if (hit) return hit;
  if (src.length > MAX_EXPR_LENGTH) throw new ExprError(`表达式过长（上限 ${MAX_EXPR_LENGTH} 字符）`);
  if (!src.trim()) throw new ExprError('表达式为空');
  const expr = new Parser(src, tokenize(src)).parse();
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(src, expr);
  return expr;
}

/** 解析 $for 的写法：`item in list` 或 `(item, index) in list`。 */
export function parseForSpec(src: string): { item: string; index?: string; source: Expr } {
  const m = /^\s*(?:\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:,\s*([A-Za-z_][A-Za-z0-9_]*)\s*)?\)|([A-Za-z_][A-Za-z0-9_]*))\s+(?:in|of)\s+([\s\S]+)$/.exec(src);
  if (!m) throw new ExprError('$for 的写法应为 "item in list" 或 "(item, index) in list"');
  const item = (m[1] ?? m[3]) as string;
  const index = m[2];
  return index ? { item, index, source: parseExpr(m[4] as string) } : { item, source: parseExpr(m[4] as string) };
}
