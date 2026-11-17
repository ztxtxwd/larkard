#!/usr/bin/env node
/**
 * LSP stdio 服务器：Content-Length 分帧的 JSON-RPC 2.0。
 * 可直接 `npx larkard-language-server` 启动，供 VS Code / Neovim 等客户端接入。
 */
import * as lsp from './index.js';
import { createConnection } from './rpc.js';

const connection = createConnection(process.stdin, process.stdout);

interface TextDocument {
  uri: string;
  text: string;
  version: number;
}

const documents = new Map<string, TextDocument>();

function pushDiagnostics(doc: TextDocument): void {
  const { diagnostics } = lsp.analyze(doc.text);
  connection.sendNotification('textDocument/publishDiagnostics', {
    uri: doc.uri,
    version: doc.version,
    diagnostics,
  });
}

connection.onRequest('initialize', () => ({
  capabilities: {
    textDocumentSync: 1, // full
    completionProvider: { triggerCharacters: ['"', ':', ' '] },
    hoverProvider: true,
    codeActionProvider: { codeActionKinds: ['quickfix', 'source.fixAll'] },
  },
  serverInfo: { name: 'larkard-language-server', version: '0.1.0' },
}));

connection.onNotification('textDocument/didOpen', (params: any) => {
  documents.set(params.textDocument.uri, {
    uri: params.textDocument.uri,
    text: params.textDocument.text,
    version: params.textDocument.version,
  });
  pushDiagnostics(documents.get(params.textDocument.uri)!);
});

connection.onNotification('textDocument/didChange', (params: any) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return;
  doc.text = params.contentChanges?.[params.contentChanges.length - 1]?.text ?? doc.text;
  doc.version = params.textDocument.version;
  pushDiagnostics(doc);
});

connection.onNotification('textDocument/didClose', (params: any) => {
  documents.delete(params.textDocument.uri);
});

connection.onRequest('textDocument/completion', (params: any) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return { isIncomplete: false, items: [] };
  const offset = positionToOffset(doc.text, params.position);
  return { isIncomplete: false, items: lsp.complete(doc.text, offset) };
});

connection.onRequest('textDocument/hover', (params: any) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  const offset = positionToOffset(doc.text, params.position);
  return lsp.hover(doc.text, offset) ?? null;
});

connection.onRequest('textDocument/codeAction', (params: any) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  const fixes: lsp.CodeAction[] = lsp.quickFixes(doc.text, params.range);
  const all = lsp.sanitizeAllAction(doc.text);
  if (all) fixes.push(all);
  // 转换为 LSP CodeAction 结构（edit 按 uri 归组）
  return fixes.map((f) => ({
    title: f.title,
    kind: f.kind,
    isPreferred: f.isPreferred,
    edit: { changes: { [params.textDocument.uri]: f.edits } },
  }));
});

connection.onRequest('shutdown', () => null);
connection.onNotification('exit', () => process.exit(0));

function positionToOffset(text: string, pos: { line: number; character: number }): number {
  let offset = 0;
  let line = 0;
  while (line < pos.line && offset < text.length) {
    if (text[offset] === '\n') line++;
    offset++;
  }
  return offset + pos.character;
}

connection.listen();
