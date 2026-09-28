/**
 * 极简 JSON-RPC 2.0 / LSP stdio 传输层（Content-Length 分帧）。
 * 零依赖，Node 流输入输出；WebWorker 环境可换用 MessagePort 适配。
 *
 * Content-Length 按 UTF-8 **字节**计数（LSP 规范）。接收侧必须用 Buffer，
 * 不能用 setEncoding('utf8') 后按字符串 length 切片，否则正文含中文等
 * 多字节字符时 didOpen 永远解不完，诊断/补全会全部静默失效。
 */
import type { Readable, Writable } from 'node:stream';

interface PendingHandler {
  resolve: (v: unknown) => void;
}

const HEADER_SEP = Buffer.from('\r\n\r\n', 'utf8');

export class Connection {
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private pending = new Map<number | string, PendingHandler>();
  private requestHandlers = new Map<string, (params: unknown) => unknown>();
  private notificationHandlers = new Map<string, (params: unknown) => void>();

  constructor(private readonly input: Readable, private readonly output: Writable) {}

  onRequest(method: string, handler: (params: never) => unknown): void {
    this.requestHandlers.set(method, handler as (params: unknown) => unknown);
  }

  onNotification(method: string, handler: (params: never) => void): void {
    this.notificationHandlers.set(method, handler as (params: unknown) => void);
  }

  sendNotification(method: string, params: unknown): void {
    this.write({ jsonrpc: '2.0', method, params });
  }

  sendRequest(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, { resolve });
      this.write({ jsonrpc: '2.0', id, method, params });
    });
  }

  private write(msg: unknown): void {
    const body = Buffer.from(JSON.stringify(msg), 'utf8');
    const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'utf8');
    this.output.write(Buffer.concat([header, body]));
  }

  listen(): void {
    this.input.on('data', (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8');
      this.buffer = Buffer.concat([this.buffer, buf]);
      this.tryParse();
    });
    this.input.on('close', () => process.exit(0));
  }

  private tryParse(): void {
    for (;;) {
      const headerEnd = this.buffer.indexOf(HEADER_SEP);
      if (headerEnd < 0) return;
      const header = this.buffer.subarray(0, headerEnd).toString('utf8');
      const m = /Content-Length:\s*(\d+)/i.exec(header);
      if (!m) {
        this.buffer = this.buffer.subarray(headerEnd + HEADER_SEP.length);
        continue;
      }
      const length = Number(m[1]);
      const bodyStart = headerEnd + HEADER_SEP.length;
      if (this.buffer.length < bodyStart + length) return;
      const body = this.buffer.subarray(bodyStart, bodyStart + length).toString('utf8');
      this.buffer = this.buffer.subarray(bodyStart + length);
      try {
        this.handleMessage(JSON.parse(body) as Record<string, unknown>);
      } catch {
        // 忽略畸形消息
      }
    }
  }

  private handleMessage(msg: Record<string, unknown>): void {
    if (typeof msg.method === 'string') {
      if (msg.id !== undefined) {
        const handler = this.requestHandlers.get(msg.method);
        Promise.resolve(handler ? handler(msg.params) : null)
          .then((result) => this.write({ jsonrpc: '2.0', id: msg.id, result }))
          .catch((e: Error) =>
            this.write({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: e.message } }),
          );
      } else {
        this.notificationHandlers.get(msg.method)?.(msg.params);
      }
    } else if (typeof msg.id === 'number' || typeof msg.id === 'string') {
      this.pending.get(msg.id)?.resolve(msg.result);
      this.pending.delete(msg.id);
    }
  }
}

export function createConnection(input: Readable, output: Writable): Connection {
  return new Connection(input, output);
}
