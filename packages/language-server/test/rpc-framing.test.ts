import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const serverJs = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'server.js');

function send(child: ReturnType<typeof spawn>, obj: unknown): void {
  const encoded = Buffer.from(JSON.stringify(obj), 'utf8');
  const header = Buffer.from(`Content-Length: ${encoded.length}\r\n\r\n`, 'utf8');
  child.stdin!.write(Buffer.concat([header, encoded]));
}

function readMessages(
  child: ReturnType<typeof spawn>,
  timeoutMs = 2000,
): Promise<Array<Record<string, unknown>>> {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    const msgs: Array<Record<string, unknown>> = [];
    const timer = setTimeout(() => {
      cleanup();
      resolve(msgs);
    }, timeoutMs);
    const onData = (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      for (;;) {
        const sep = buf.indexOf('\r\n\r\n');
        if (sep < 0) return;
        const header = buf.subarray(0, sep).toString('utf8');
        const m = /Content-Length:\s*(\d+)/i.exec(header);
        if (!m) {
          buf = buf.subarray(sep + 4);
          continue;
        }
        const len = Number(m[1]);
        const start = sep + 4;
        if (buf.length < start + len) return;
        msgs.push(JSON.parse(buf.subarray(start, start + len).toString('utf8')));
        buf = buf.subarray(start + len);
        cleanup();
        resolve(msgs);
        return;
      }
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.stdout?.off('data', onData);
    };
    child.stdout?.on('data', onData);
    child.on('error', reject);
  });
}

test('stdio framing accepts didOpen bodies with raw UTF-8 Chinese', async () => {
  const child = spawn(process.execPath, [serverJs, '--stdio'], { stdio: ['pipe', 'pipe', 'pipe'] });
  try {
    send(child, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { processId: process.pid, capabilities: {}, rootUri: null },
    });
    const init = await readMessages(child, 2000);
    assert.equal(init[0]?.id, 1);

    const card = {
      schema: '2.0',
      header: { title: { tag: 'plain_text', content: '你好世界' } },
      body: { elements: [] },
    };
    const text = JSON.stringify(card, null, 2);
    assert.ok(Buffer.byteLength(text, 'utf8') > text.length, 'fixture must contain multi-byte chars');

    send(child, {
      jsonrpc: '2.0',
      method: 'textDocument/didOpen',
      params: {
        textDocument: {
          uri: 'file:///tmp/cn.card',
          languageId: 'json',
          version: 1,
          text,
        },
      },
    });
    const diags = await readMessages(child, 2000);
    assert.ok(diags.length >= 1, 'expected publishDiagnostics after unicode didOpen');
    assert.equal(diags[0]?.method, 'textDocument/publishDiagnostics');
  } finally {
    child.kill();
  }
});
