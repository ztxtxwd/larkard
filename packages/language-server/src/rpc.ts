/**
 * 极简 JSON-RPC 2.0 / LSP stdio 传输层（Content-Length 分帧）。
 * 零依赖，Node 流输入输出；WebWorker 环境可换用 MessagePort 适配。
 */
import type { Readable, Writable } from 'node:stream';

interface PendingHandler {
  resolve: (v: unknown) => void;
}

export class Connection {
  private buffer = '';
  private nextId = 1;
  private pending = new Map<number, PendingHandler>();
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
    const body = JSON.stringify(msg);
    this.output.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`);
  }

  listen(): void {
    this.input.setEncoding('utf8');
    this.input.on('data', (chunk: string) => {
      this.buffer += chunk;
      this.tryParse();
    });
    this.input.on('close', () => process.exit(0));
  }

  private tryParse(): void {
    for (;;) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) return;
      const header = this.buffer.slice(0, headerEnd);
      const m = /Content-Length:\s*(\d+)/i.exec(header);
      if (!m) {
        this.buffer = this.buffer.slice(headerEnd + 4);
        continue;
      }
      const length = Number(m[1]);
      const bodyStart = headerEnd + 4;
      if (this.buffer.length < bodyStart + length) return;
      const body = this.buffer.slice(bodyStart, bodyStart + length);
      this.buffer = this.buffer.slice(bodyStart + length);
      try {
        this.handleMessage(JSON.parse(body));
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
    } else if (typeof msg.id === 'number') {
      this.pending.get(msg.id)?.resolve(msg.result);
      this.pending.delete(msg.id);
    }
  }
}

export function createConnection(input: Readable, output: Writable): Connection {
  return new Connection(input, output);
}
