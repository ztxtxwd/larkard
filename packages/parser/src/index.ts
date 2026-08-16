/**
 * @open-feishu-card/parser
 *
 * 解析 JSON / JSONC（带注释与尾逗号）源码，生成包含位置信息的 AST。
 * 每个 AST 节点都携带 Range（字符偏移 [start, end)）与
 * Line / Column（1-based），供 validator / linter / LSP 精确回溯到源码。
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

