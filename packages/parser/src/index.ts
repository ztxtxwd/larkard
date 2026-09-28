/**
 * @open-feishu-card/parser
 *
 * 解析 JSON / JSONC（带注释与尾逗号）源码，生成包含位置信息的 AST。
 * 每个 AST 节点都携带 Range（字符偏移 [start, end)）与
 * Line / Column（1-based），供 validator / linter / LSP 精确回溯到源码。
 *
 * 另提供文档形态解包：裸 Card JSON，或搭建工具 `{ name, dsl, variables }`。
 */

export interface Pos {
  /** 0-based 字符偏移 */
  offset: number;
  /** 1-based 行号 */
  line: number;
  /** 1-based 列号 */
  column: number;
}

export interface Range {
  start: Pos;
  end: Pos;
}

export type JsonNode =
  | JsonObjectNode
  | JsonArrayNode
  | JsonStringNode
  | JsonNumberNode
  | JsonBooleanNode
  | JsonNullNode;

export interface BaseNode {
  type: string;
  range: Range;
}

export interface JsonPropertyNode extends BaseNode {
  type: 'property';
  key: JsonStringNode;
  value: JsonNode;
}

export interface JsonObjectNode extends BaseNode {
  type: 'object';
  properties: JsonPropertyNode[];
}

export interface JsonArrayNode extends BaseNode {
  type: 'array';
  items: JsonNode[];
}

export interface JsonStringNode extends BaseNode {
  type: 'string';
  value: string;
}

export interface JsonNumberNode extends BaseNode {
  type: 'number';
  value: number;
}

export interface JsonBooleanNode extends BaseNode {
  type: 'boolean';
  value: boolean;
}

export interface JsonNullNode extends BaseNode {
  type: 'null';
  value: null;
}

export interface ParseError {
  message: string;
  range: Range;
}

export interface ParseResult {
  /** 解析成功时的根 AST 节点；失败时为 undefined */
  ast: JsonObjectNode | undefined;
  /** AST 还原为普通 JS 对象（失去位置信息），便于直接喂给 schema 校验 */
  data: unknown;
  errors: ParseError[];
}

class Parser {
  private i = 0;
  private line = 1;
  private column = 1;

  constructor(private readonly src: string) {}

  private pos(): Pos {
    return { offset: this.i, line: this.line, column: this.column };
  }

  private rangeFrom(start: Pos): Range {
    return { start, end: this.pos() };
  }

  private advance(): void {
    if (this.src[this.i] === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    this.i++;
  }

  private err(message: string): never {
    throw new ParseErrorImpl(message, {
      start: this.pos(),
      end: this.pos(),
    });
  }

  /** 跳过空白、// 行注释、/* 块注释与尾逗号 */
  private skipTrivia(): void {
    while (this.i < this.src.length) {
      const c = this.src[this.i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
        this.advance();
      } else if (c === '/' && this.src[this.i + 1] === '/') {
        while (this.i < this.src.length && this.src[this.i] !== '\n') this.advance();
      } else if (c === '/' && this.src[this.i + 1] === '*') {
        this.advance();
        this.advance();
        while (this.i < this.src.length && !(this.src[this.i] === '*' && this.src[this.i + 1] === '/')) this.advance();
        this.advance();
        this.advance();
      } else {
        break;
      }
    }
  }

  parse(): JsonObjectNode {
    const value = this.parseValue();
    this.skipTrivia();
    if (this.i < this.src.length) this.err(`Unexpected trailing content at offset ${this.i}`);
    if (value.type !== 'object') {
      const r = value.range;
      throw new ParseErrorImpl('Feishu card root must be a JSON object', { start: r.start, end: r.end });
    }
    return value;
  }

  parseValue(): JsonNode {
    this.skipTrivia();
    const c = this.src[this.i];
    if (c === undefined) this.err('Unexpected end of input');
    if (c === '{') return this.parseObject();
    if (c === '[') return this.parseArray();
    if (c === '"') return this.parseString();
    if (c === '-' || (c >= '0' && c <= '9')) return this.parseNumber();
    if (this.src.startsWith('true', this.i)) {
      const start = this.pos();
      for (let k = 0; k < 4; k++) this.advance();
      return { type: 'boolean', value: true, range: this.rangeFrom(start) };
    }
    if (this.src.startsWith('false', this.i)) {
      const start = this.pos();
      for (let k = 0; k < 5; k++) this.advance();
      return { type: 'boolean', value: false, range: this.rangeFrom(start) };
    }
    if (this.src.startsWith('null', this.i)) {
      const start = this.pos();
      for (let k = 0; k < 4; k++) this.advance();
      return { type: 'null', value: null, range: this.rangeFrom(start) };
    }
    return this.err(`Unexpected character '${c}'`);
  }

  private parseObject(): JsonObjectNode {
    const start = this.pos();
    this.advance(); // {
    const properties: JsonPropertyNode[] = [];
    this.skipTrivia();
    if (this.src[this.i] === '}') {
      this.advance();
      return { type: 'object', properties, range: this.rangeFrom(start) };
    }
    for (;;) {
      this.skipTrivia();
      // 容忍尾逗号
      if (this.src[this.i] === '}') {
        this.advance();
        return { type: 'object', properties, range: this.rangeFrom(start) };
      }
      const key = this.parseString();
      this.skipTrivia();
      if (this.src[this.i] !== ':') this.err(`Expected ':' after object key '${key.value}'`);
      this.advance();
      const value = this.parseValue();
      properties.push({
        type: 'property',
        key,
        value,
        range: { start: key.range.start, end: value.range.end },
      });
      this.skipTrivia();
      const c = this.src[this.i];
      if (c === ',') {
        this.advance();
      } else if (c === '}') {
        this.advance();
        return { type: 'object', properties, range: this.rangeFrom(start) };
      } else {
        this.err(`Expected ',' or '}' in object`);
      }
    }
  }

  private parseArray(): JsonArrayNode {
    const start = this.pos();
    this.advance(); // [
    const items: JsonNode[] = [];
    this.skipTrivia();
    if (this.src[this.i] === ']') {
      this.advance();
      return { type: 'array', items, range: this.rangeFrom(start) };
    }
    for (;;) {
      this.skipTrivia();
      if (this.src[this.i] === ']') {
        this.advance();
        return { type: 'array', items, range: this.rangeFrom(start) };
      }
      items.push(this.parseValue());
      this.skipTrivia();
      const c = this.src[this.i];
      if (c === ',') {
        this.advance();
      } else if (c === ']') {
        this.advance();
        return { type: 'array', items, range: this.rangeFrom(start) };
      } else {
        this.err(`Expected ',' or ']' in array`);
      }
    }
  }

  private parseString(): JsonStringNode {
    const start = this.pos();
    if (this.src[this.i] !== '"') this.err('Expected string');
    this.advance();
    let out = '';
    for (;;) {
      if (this.i >= this.src.length) this.err('Unterminated string');
      const c = this.src[this.i];
      if (c === '"') {
        this.advance();
        return { type: 'string', value: out, range: this.rangeFrom(start) };
      }
      if (c === '\\') {
        this.advance();
        const e = this.src[this.i];
        if (e === undefined) this.err('Unterminated escape');
        if (e === 'u') {
          const hex = this.src.slice(this.i + 1, this.i + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.err('Invalid unicode escape');
          out += String.fromCharCode(parseInt(hex, 16));
          for (let k = 0; k < 5; k++) this.advance();
          continue;
        }
        const map: Record<string, string> = {
          '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t',
        };
        if (!(e in map)) this.err(`Invalid escape '\\${e}'`);
        out += map[e];
        this.advance();
        continue;
      }
      out += c;
      this.advance();
    }
  }

  private parseNumber(): JsonNumberNode {
    const start = this.pos();
    const begin = this.i;
    while (this.i < this.src.length && /[-+0-9.eE]/.test(this.src[this.i])) this.advance();
    const text = this.src.slice(begin, this.i);
    const value = Number(text);
    if (Number.isNaN(value)) this.err(`Invalid number '${text}'`);
    return { type: 'number', value, range: this.rangeFrom(start) };
  }
}

class ParseErrorImpl extends Error {
  constructor(
    message: string,
    public readonly range: Range,
  ) {
    super(message);
  }
}

/** 把 AST 节点还原为普通 JS 值 */
export function astToValue(node: JsonNode): unknown {
  switch (node.type) {
    case 'object': {
      const obj: Record<string, unknown> = {};
      for (const p of node.properties) obj[p.key.value] = astToValue(p.value);
      return obj;
    }
    case 'array':
      return node.items.map(astToValue);
    default:
      return node.value;
  }
}

/** 解析 JSONC 源码。即使出错也会尽量返回已收集的错误列表。 */
export function parse(source: string): ParseResult {
  const parser = new Parser(source);
  try {
    const ast = parser.parse();
    return { ast, data: astToValue(ast), errors: [] };
  } catch (e) {
    if (e instanceof ParseErrorImpl) {
      return { ast: undefined, data: undefined, errors: [{ message: e.message, range: e.range }] };
    }
    throw e;
  }
}

/* ------------------------------------------------------------------ *
 * 卡片文档形态：裸 Card JSON vs 搭建工具 `{ name, dsl, variables }`
 * ------------------------------------------------------------------ */

export type CardDocumentKind = 'card' | 'builder';

export interface ResolvedCardDocument {
  kind: CardDocumentKind;
  /** 整份文件的根 AST */
  rootAst: JsonObjectNode;
  /** 卡片 AST；builder 时为 `dsl` 子树 */
  cardAst: JsonObjectNode;
  /** 卡片数据对象 */
  cardData: unknown;
  /** 相对卡片根的 JSON Pointer 前缀；builder 为 `/dsl`，裸卡为 `''` */
  pathPrefix: string;
  /** builder 文档的 name（若有） */
  name?: string;
  /** builder 文档的 variables（若有） */
  variables?: unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * 是否为搭建工具导出的工程文档（`{ name?, dsl, variables? }`）。
 * 根上已有 `schema` 时一律按裸卡处理，避免把误加的 `dsl` 字段当外层。
 */
export function isBuilderDocument(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!isRecord(value.dsl)) return false;
  if (typeof value.schema === 'string') return false;
  return true;
}

/** 取出卡片载荷：builder 返回 `dsl`，否则原样返回 */
export function unwrapCardData(value: unknown): unknown {
  return isBuilderDocument(value) ? (value as { dsl: unknown }).dsl : value;
}

/** 把相对卡片根的 pointer 拼回源文件 pointer */
export function joinCardPointer(pathPrefix: string, relativePath: string): string {
  if (!pathPrefix) return relativePath;
  if (relativePath === '/' || relativePath === '') return pathPrefix;
  return pathPrefix + (relativePath.startsWith('/') ? relativePath : `/${relativePath}`);
}

export function wrapBuilderDocument(
  card: Record<string, unknown>,
  meta: { name?: string; variables?: unknown } = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (meta.name !== undefined) out.name = meta.name;
  out.dsl = card;
  out.variables = meta.variables ?? [];
  return out;
}

/** 净化/编译后按原文档形态写回（builder 保留 name/variables） */
export function serializeCardDocument(
  resolved: ResolvedCardDocument,
  cleanedCard: Record<string, unknown>,
): Record<string, unknown> {
  if (resolved.kind === 'card') return cleanedCard;
  return wrapBuilderDocument(cleanedCard, {
    name: resolved.name,
    variables: resolved.variables ?? [],
  });
}

export function resolveCardDocumentAst(
  rootAst: JsonObjectNode,
  data: unknown,
): ResolvedCardDocument {
  if (isBuilderDocument(data)) {
    const dslProp = rootAst.properties.find((p) => p.key.value === 'dsl');
    const dslNode = dslProp?.value;
    if (dslNode && dslNode.type === 'object') {
      const rec = data as Record<string, unknown>;
      return {
        kind: 'builder',
        rootAst,
        cardAst: dslNode,
        cardData: rec.dsl,
        pathPrefix: '/dsl',
        name: typeof rec.name === 'string' ? rec.name : undefined,
        variables: 'variables' in rec ? rec.variables : undefined,
      };
    }
  }
  return {
    kind: 'card',
    rootAst,
    cardAst: rootAst,
    cardData: data,
    pathPrefix: '',
  };
}

/** 从 parse() 结果解包；语法失败时返回 undefined */
export function resolveCardDocument(result: ParseResult): ResolvedCardDocument | undefined {
  if (!result.ast || result.data === undefined) return undefined;
  return resolveCardDocumentAst(result.ast, result.data);
}

