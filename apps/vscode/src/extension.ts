import * as crypto from 'node:crypto';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  LanguageClient,
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';
import { renderDslToString } from 'larkard/renderer';
import {
  parse,
  resolveCardDocument,
  sanitize,
  serializeCardDocument,
  unwrapCardData,
} from 'larkard';

type PreviewSettings = { theme: string; maxWidth: number };
type PreviewPayload =
  | (PreviewSettings & { type: 'render'; html: string; fileName: string })
  | (PreviewSettings & { type: 'error'; title: string; message: string; line?: number; column?: number });

export function activate(context: vscode.ExtensionContext): void {
  const renderer = new CardRenderer();
  const previews = new PreviewPanelManager(context, renderer);
  const customEditor = new FeishuCardEditorProvider(context, renderer);
  const sidePreview = new SidePreviewController(previews);

  const languageClient = createLanguageClient(context);

  context.subscriptions.push(
    previews,
    sidePreview,
    ...(languageClient ? [languageClient] : []),
    vscode.window.registerCustomEditorProvider(
      FeishuCardEditorProvider.viewType,
      customEditor,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
    vscode.commands.registerCommand('openFeishuCard.openPreview', async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!target) {
        void vscode.window.showInformationMessage('Open a Feishu Card JSON file first.');
        return;
      }
      await previews.open(target);
    }),
    vscode.commands.registerCommand('openFeishuCard.openSample', async () => {
      const sample = vscode.Uri.joinPath(context.extensionUri, 'samples', 'welcome.card');
      const document = await vscode.workspace.openTextDocument(sample);
      await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
      await previews.open(sample);
    }),
    vscode.commands.registerCommand('openFeishuCard.showSource', async (uri?: vscode.Uri) => {
      const activeTabInput = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
      const target = uri
        ?? (activeTabInput instanceof vscode.TabInputCustom ? activeTabInput.uri : undefined)
        ?? vscode.window.activeTextEditor?.document.uri;
      if (!target) return;
      const document = await vscode.workspace.openTextDocument(target);
      await revealDocument(document);
    }),
    vscode.commands.registerCommand('openFeishuCard.refresh', () => previews.refreshVisible()),
    vscode.commands.registerCommand('openFeishuCard.clean', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const document = editor.document;
      if (!isCardDocument(document)) {
        void vscode.window.showErrorMessage('Sanitize only applies to .card files.');
        return;
      }
      const resolved = resolveCardDocument(parse(document.getText()));
      if (!resolved) {
        void vscode.window.showErrorMessage('Not a valid card JSON document.');
        return;
      }
      const { stripped, card } = sanitize(resolved.cardData, { mode: 'strip' });
      if (stripped.length === 0) {
        void vscode.window.showInformationMessage('Card is clean — no non-standard properties found.');
        return;
      }
      const output = serializeCardDocument(resolved, card);
      await editor.edit((edit) => {
        const lastLine = document.lineCount - 1;
        edit.replace(
          new vscode.Range(0, 0, lastLine, document.lineAt(lastLine).text.length),
          JSON.stringify(output, null, 2) + '\n',
        );
      });
      void vscode.window.showInformationMessage(
        `Sanitized: stripped ${stripped.length} non-standard propert${stripped.length === 1 ? 'y' : 'ies'}:\n${stripped.join('\n')}`,
      );
    }),
    ...legacyCommandAliases(),
  );

  // 默认走「源码 + 侧边预览」，保证 LSP 诊断/补全可用
  sidePreview.syncVisibleEditors();
}

export function deactivate(): Promise<void> | undefined {
  return undefined;
}

const LEGACY_COMMANDS: Array<[legacy: string, current: string]> = [
  ['larkCardPreview.openPreview', 'openFeishuCard.openPreview'],
  ['larkCardPreview.openSample', 'openFeishuCard.openSample'],
  ['larkCardPreview.showSource', 'openFeishuCard.showSource'],
  ['larkCardPreview.refresh', 'openFeishuCard.refresh'],
];

function legacyCommandAliases(): vscode.Disposable[] {
  return LEGACY_COMMANDS.map(([legacy, current]) =>
    vscode.commands.registerCommand(legacy, (...args: unknown[]) =>
      vscode.commands.executeCommand(current, ...args),
    ),
  );
}

function cardConfigValue<T>(key: string, fallback: T): T {
  const next = vscode.workspace.getConfiguration('openFeishuCard').inspect<T>(key);
  const legacy = vscode.workspace.getConfiguration('larkCardPreview').inspect<T>(key);
  return (
    next?.workspaceFolderValue ??
    next?.workspaceValue ??
    next?.globalValue ??
    legacy?.workspaceFolderValue ??
    legacy?.workspaceValue ??
    legacy?.globalValue ??
    next?.defaultValue ??
    fallback
  );
}

function cardConfigChanged(event: vscode.ConfigurationChangeEvent): boolean {
  return event.affectsConfiguration('openFeishuCard') || event.affectsConfiguration('larkCardPreview');
}

/** 打开 *.card 文本编辑器时自动侧边预览（可关）；关掉预览后本会话不再强开 */
class SidePreviewController implements vscode.Disposable {
  private readonly opened = new Set<string>();
  private readonly dismissed = new Set<string>();
  private readonly changeEditor: vscode.Disposable;
  private readonly changeConfig: vscode.Disposable;
  private readonly closedPreview: vscode.Disposable;

  constructor(private readonly previews: PreviewPanelManager) {
    this.changeEditor = vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) void this.maybeOpen(editor.document);
    });
    this.changeConfig = vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('openFeishuCard.preview.openOnSide')
        || event.affectsConfiguration('larkCardPreview.preview.openOnSide')) {
        this.syncVisibleEditors();
      }
    });
    this.closedPreview = this.previews.onDidClosePreview((uri) => {
      this.dismissed.add(uri.toString());
    });
  }

  syncVisibleEditors(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      void this.maybeOpen(editor.document);
    }
  }

  private async maybeOpen(document: vscode.TextDocument): Promise<void> {
    if (!isCardDocument(document)) return;
    if (!cardConfigValue<boolean>('preview.openOnSide', true)) return;
    const key = document.uri.toString();
    if (this.opened.has(key) || this.dismissed.has(key)) return;
    if (this.previews.has(document.uri)) {
      this.opened.add(key);
      return;
    }
    this.opened.add(key);
    await this.previews.open(document.uri);
  }

  dispose(): void {
    this.changeEditor.dispose();
    this.changeConfig.dispose();
    this.closedPreview.dispose();
  }
}

/* ------------------------------------------------------------------ *
 * Language Server 客户端（诊断 / 补全 / Hover / 快速修复）
 * ------------------------------------------------------------------ */

function createLanguageClient(context: vscode.ExtensionContext): LanguageClient | undefined {
  const enabled = cardConfigValue<boolean>('languageServer.enabled', true);
  if (!enabled) return undefined;

  // language-server 已 bundle 为单文件 dist/server.cjs，随 VSIX 分发
  const serverModule = path.join(context.extensionPath, 'dist', 'server.cjs');

  const serverOptions: ServerOptions = {
    run: { command: process.execPath, args: [serverModule], transport: TransportKind.stdio },
    debug: { command: process.execPath, args: [serverModule], transport: TransportKind.stdio },
  };
  // 只挂到 *.card。*.json 仍可通过命令手动预览，但不能把普通 JSON 当成卡片做诊断。
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ pattern: '**/*.card' }],
  };
  const client = new LanguageClient(
    'openFeishuCardLanguageServer',
    'Open Feishu Card Language Server',
    serverOptions,
    clientOptions,
  );
  void client.start();
  return client;
}

/* ------------------------------------------------------------------ *
 * 渲染 + 预览面板（DSL → renderer，实时同步）
 * ------------------------------------------------------------------ */

class CardRenderer {
  render(document: vscode.TextDocument): PreviewPayload {
    const settings: PreviewSettings = {
      theme: cardConfigValue<string>('preview.theme', 'auto'),
      maxWidth: cardConfigValue<number>('preview.maxWidth', 650),
    };
    try {
      const card: unknown = JSON.parse(document.getText());
      const imageBaseURL = cardConfigValue<string>('imageBaseURL', '').trim();
      const html = renderDslToString(getDsl(card), {
        warnOnUnknownTag: cardConfigValue<boolean>('render.warnOnUnknownTag', true),
        ...(imageBaseURL ? { imageBaseURL } : {}),
      });
      return { type: 'render', html, fileName: path.basename(document.fileName), ...settings };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const location = parseJsonErrorLocation(document.getText(), message);
      return {
        type: 'error',
        title: 'Unable to render this card',
        message,
        ...settings,
        ...location,
      };
    }
  }
}

function isCardDocument(document: vscode.TextDocument): boolean {
  return document.uri.path.toLowerCase().endsWith('.card');
}

function getDsl(input: unknown): unknown {
  return unwrapCardData(input);
}

class FeishuCardEditorProvider implements vscode.CustomTextEditorProvider {
  static readonly viewType = 'openFeishuCard.editor';

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly renderer: CardRenderer,
  ) {}

  resolveCustomTextEditor(
    document: vscode.TextDocument,
    panel: vscode.WebviewPanel,
  ): void {
    configureWebview(panel.webview, this.context);
    panel.webview.html = createWebviewHtml(panel.webview, this.context, document.fileName, true);

    const update = (): void => {
      void panel.webview.postMessage(this.renderer.render(document));
    };

    const changes = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() === document.uri.toString()) {
        update();
      }
    });
    const configuration = vscode.workspace.onDidChangeConfiguration((event) => {
      if (cardConfigChanged(event)) {
        update();
      }
    });
    panel.webview.onDidReceiveMessage((message: { type?: string; line?: number; column?: number }) => {
      if (message.type === 'ready' || message.type === 'refresh') {
        update();
      } else if (message.type === 'showSource') {
        void revealDocument(document, message.line, message.column);
      }
    });
    panel.onDidDispose(() => {
      changes.dispose();
      configuration.dispose();
    });
  }
}

class PreviewPanelManager implements vscode.Disposable {
  private readonly panels = new Map<string, { panel: vscode.WebviewPanel; document: vscode.TextDocument }>();
  private readonly changes: vscode.Disposable;
  private readonly configuration: vscode.Disposable;
  private readonly closeEmitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidClosePreview = this.closeEmitter.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly renderer: CardRenderer,
  ) {
    this.changes = vscode.workspace.onDidChangeTextDocument((event) => {
      const entry = this.panels.get(event.document.uri.toString());
      if (entry) this.update(entry.panel, event.document);
    });
    this.configuration = vscode.workspace.onDidChangeConfiguration((event) => {
      if (cardConfigChanged(event)) this.refreshVisible();
    });
  }

  has(uri: vscode.Uri): boolean {
    return this.panels.has(uri.toString());
  }

  async open(uri: vscode.Uri): Promise<void> {
    const document = await vscode.workspace.openTextDocument(uri);
    const key = uri.toString();
    const existing = this.panels.get(key);
    if (existing) {
      existing.panel.reveal(vscode.ViewColumn.Beside);
      this.update(existing.panel, document);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'openFeishuCard.preview',
      `Feishu Card: ${path.basename(document.fileName)}`,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, localResourceRoots: [this.context.extensionUri], retainContextWhenHidden: true },
    );
    configureWebview(panel.webview, this.context);
    panel.webview.html = createWebviewHtml(panel.webview, this.context, document.fileName, false);
    this.panels.set(key, { panel, document });
    panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'icon.png');
    panel.onDidDispose(() => {
      this.panels.delete(key);
      this.closeEmitter.fire(uri);
    });
    panel.webview.onDidReceiveMessage((message: { type?: string; line?: number; column?: number }) => {
      if (message.type === 'ready' || message.type === 'refresh') {
        this.update(panel, document);
      } else if (message.type === 'showSource') {
        void revealDocument(document, message.line, message.column);
      }
    });
  }

  refreshVisible(): void {
    for (const { panel, document } of this.panels.values()) {
      if (panel.visible) this.update(panel, document);
    }
  }

  dispose(): void {
    this.changes.dispose();
    this.configuration.dispose();
    this.closeEmitter.dispose();
    for (const { panel } of this.panels.values()) panel.dispose();
  }

  private update(panel: vscode.WebviewPanel, document: vscode.TextDocument): void {
    void panel.webview.postMessage(this.renderer.render(document));
  }
}

function configureWebview(webview: vscode.Webview, context: vscode.ExtensionContext): void {
  webview.options = {
    enableScripts: true,
    localResourceRoots: [context.extensionUri],
  };
}

function createWebviewHtml(
  webview: vscode.Webview,
  context: vscode.ExtensionContext,
  fileName: string,
  customEditor: boolean,
): string {
  const nonce = crypto.randomBytes(16).toString('base64');
  // larkard/renderer all.css: layout + icon font + emoji sprite positioning
  const cardStyles = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'dist', 'card-styles.css'),
  );
  const appStyles = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'preview.css'));
  const script = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'preview.js'));
  const maxWidth = cardConfigValue<number>('preview.maxWidth', 650);
  const theme = cardConfigValue<string>('preview.theme', 'auto');
  const csp = [
    "default-src 'none'",
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `font-src ${webview.cspSource} data:`,
    `img-src ${webview.cspSource} data: https: http:`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');

  return `<!doctype html>
<html lang="en" data-card-theme="${escapeHtml(theme)}" style="--preview-max-width:${maxWidth}px">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${cardStyles}">
  <link rel="stylesheet" href="${appStyles}">
  <title>Feishu Card Preview</title>
</head>
<body data-custom-editor="${customEditor}">
  <header class="toolbar">
    <div class="title-group">
      <span class="status-dot" aria-hidden="true"></span>
      <span class="file-name" title="${escapeHtml(fileName)}">${escapeHtml(path.basename(fileName))}</span>
    </div>
    <div class="toolbar-actions">
      <button id="source" type="button">Source</button>
      <button id="refresh" type="button" title="Refresh preview" aria-label="Refresh preview">↻</button>
    </div>
  </header>
  <main id="stage" class="stage" aria-live="polite">
    <div class="loading"><span></span><span></span><span></span></div>
  </main>
  <script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
}

async function revealDocument(
  document: vscode.TextDocument,
  line = 1,
  column = 1,
): Promise<void> {
  const currentColumn = vscode.window.tabGroups.activeTabGroup.viewColumn;
  await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default', currentColumn);
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.uri.toString() !== document.uri.toString()) return;
  const position = new vscode.Position(Math.max(0, line - 1), Math.max(0, column - 1));
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

function parseJsonErrorLocation(text: string, message: string): { line?: number; column?: number } {
  const match = /position\s+(\d+)/i.exec(message);
  if (!match?.[1]) return {};
  const offset = Number(match[1]);
  const prefix = text.slice(0, offset);
  const lines = prefix.split(/\r?\n/);
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[char] ?? char);
}
