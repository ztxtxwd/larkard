/**
 * larkard CLI
 *
 * 任务型命令：
 *   check     发送前检查（Schema + 真机硬约束 + 最佳实践），--fix 可先修复
 *   validate  仅 Schema 校验
 *   lint      Schema + 最佳实践（不含真机硬约束）
 *   compile   DSL → 渲染器 RAW
 *   sanitize  剥离非标属性
 *   format    JSONC → 标准 JSON
 */
import { readFileSync, writeFileSync } from 'node:fs';
import {
  compile,
  checkSource,
  parse,
  repairDeviceIssues,
  resolveCardDocument,
  sanitize,
  serializeCardDocument,
  validate,
  type SourceDiagnostic,
} from './core/index.js';

interface Args {
  command: string;
  files: string[];
  out?: string;
  fix?: boolean;
  checkOnly?: boolean;
}

const COMMANDS = new Set(['check', 'validate', 'lint', 'compile', 'sanitize', 'clean', 'build', 'format']);

function parseArgs(argv: string[]): Args {
  const [command, ...rest] = argv;
  const files: string[] = [];
  const args: Args = { command: command ?? '', files };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (arg === '--out' || arg === '-o') args.out = rest[++i];
    else if (arg === '--fix') args.fix = true;
    else if (arg === '--check') args.checkOnly = true;
    else files.push(arg);
  }
  return args;
}

function fmtPos(pos: { line: number; column: number }): string {
  return `${pos.line}:${pos.column}`;
}

function loadSource(file: string): string {
  return readFileSync(file, 'utf8');
}

function severityLabel(severity: SourceDiagnostic['severity']): string {
  return severity === 'error' ? 'error' : severity === 'warning' ? 'warn' : 'info';
}

function printDiagnostics(file: string, diagnostics: SourceDiagnostic[]): number {
  let errors = 0;
  const sorted = [...diagnostics].sort((a, b) => {
    const line = (a.range?.start.line ?? 0) - (b.range?.start.line ?? 0);
    if (line !== 0) return line;
    return (a.range?.start.column ?? 0) - (b.range?.start.column ?? 0);
  });
  for (const diagnostic of sorted) {
    const where = diagnostic.range
      ? `${file}:${fmtPos(diagnostic.range.start)}`
      : `${file}:1:1`;
    const code = diagnostic.code ? ` [${diagnostic.source}/${diagnostic.code}]` : ` [${diagnostic.source}]`;
    console.error(`${where}  ${severityLabel(diagnostic.severity)}  ${diagnostic.message}${code}`);
    if (diagnostic.severity === 'error') errors += 1;
  }
  return errors;
}

function cmdCheck(files: string[], fix: boolean): number {
  let errors = 0;
  for (const file of files) {
    let source = loadSource(file);
    if (fix) {
      const resolved = resolveCardDocument(parse(source));
      if (resolved && resolved.cardData && typeof resolved.cardData === 'object' && !Array.isArray(resolved.cardData)) {
        const repaired = repairDeviceIssues(resolved.cardData as Record<string, unknown>);
        const output = serializeCardDocument(resolved, repaired.card);
        source = JSON.stringify(output, null, 2) + '\n';
        writeFileSync(file, source);
        if (repaired.fixes.length > 0) {
          console.error(`✔ ${file}: 自动修复 ${repaired.fixes.length} 处`);
        }
      }
    }
    const result = checkSource(source);
    errors += printDiagnostics(file, result.diagnostics);
    const errorCount = result.errors.length;
    console.error(`✔ ${file}: ${errorCount} errors, ${result.diagnostics.length} diagnostics`);
  }
  return errors > 0 ? 1 : 0;
}

function cmdValidate(files: string[]): number {
  let errors = 0;
  for (const file of files) {
    const diagnostics = validate(loadSource(file));
    for (const diagnostic of diagnostics) {
      console.error(`${file}:${fmtPos(diagnostic.range.start)}  ${diagnostic.severity === 'error' ? 'error' : 'warn'}  ${diagnostic.message}`);
      if (diagnostic.severity === 'error') errors += 1;
    }
    console.error(`✔ ${file}: ${diagnostics.filter((d) => d.severity === 'error').length} errors`);
  }
  return errors > 0 ? 1 : 0;
}

function cmdLint(files: string[]): number {
  let errors = 0;
  for (const file of files) {
    // lint = Schema + 最佳实践；真机硬约束属于 check，不在这里重复报。
    const diagnostics = checkSource(loadSource(file)).diagnostics.filter((d) => d.source !== 'device');
    errors += printDiagnostics(file, diagnostics);
    console.error(`✔ ${file}: ${diagnostics.filter((d) => d.severity === 'error').length} errors, ${diagnostics.length} diagnostics`);
  }
  return errors > 0 ? 1 : 0;
}

function writeOutput(file: string, out: string | undefined, value: unknown): void {
  const target = out ?? file;
  writeFileSync(target, JSON.stringify(value, null, 2) + '\n');
  console.error(`已写入 → ${target}`);
}

function cmdCompile(file: string, out?: string): number {
  const parsed = parse(loadSource(file));
  if (parsed.errors.length > 0) {
    for (const error of parsed.errors) console.error(`${file}:${fmtPos(error.range.start)}  error  ${error.message}`);
    return 1;
  }
  const resolved = resolveCardDocument(parsed);
  if (!resolved) {
    console.error(`${file}: 不是有效的卡片 JSON 文档`);
    return 1;
  }
  const { raw } = compile(resolved.cardData);
  writeOutput(file, out, raw);
  return 0;
}

function cmdSanitize(file: string, out?: string, checkOnly?: boolean): number {
  const parsed = parse(loadSource(file));
  const resolved = resolveCardDocument(parsed);
  if (!resolved) {
    console.error(`${file}: 不是有效的卡片 JSON 文档`);
    return 1;
  }
  const { card, stripped } = sanitize(resolved.cardData, { mode: 'strip' });
  if (checkOnly) {
    if (stripped.length > 0) {
      console.error(`${file}: 发现 ${stripped.length} 个非标属性:`);
      for (const path of stripped) console.error(`  - ${path}`);
      return 1;
    }
    console.error(`${file}: 干净，无非标属性`);
    return 0;
  }
  writeOutput(file, out, serializeCardDocument(resolved, card));
  console.error(`已净化 ${stripped.length} 个非标属性`);
  for (const path of stripped) console.error(`  - 剥离 ${path}`);
  return 0;
}

function cmdFormat(file: string, out?: string): number {
  const { data, errors } = parse(loadSource(file));
  if (errors.length > 0) {
    for (const error of errors) console.error(`${file}:${fmtPos(error.range.start)}  error  ${error.message}`);
    return 1;
  }
  writeOutput(file, out, data);
  return 0;
}

const HELP = `用法: larkard <command> <file...> [options]

命令:
  check      发送前检查（Schema + 真机硬约束 + 最佳实践）
  validate   仅 Schema 校验
  lint       Schema + 最佳实践（不含真机硬约束）
  compile    DSL → 渲染器 RAW
  sanitize   剥离非标属性（别名: clean）
  format     JSONC → 标准 JSON

选项:
  --out, -o <file>   输出文件（默认写回原文件）
  --fix              check 前先按真机硬约束自动修复
  --check            只检查、不写回（sanitize）
`;

export function run(argv: string[] = process.argv.slice(2)): number {
  const { command, files, out, fix, checkOnly } = parseArgs(argv);
  if (!command || command === '--help' || command === '-h') {
    console.error(HELP);
    return command ? 0 : 2;
  }
  if (!COMMANDS.has(command)) {
    console.error(`未知命令: ${command}\n\n${HELP}`);
    return 2;
  }
  if (files.length === 0) {
    console.error(HELP);
    return 2;
  }
  switch (command) {
    case 'check':
      return cmdCheck(files, Boolean(fix));
    case 'validate':
      return cmdValidate(files);
    case 'lint':
      return cmdLint(files);
    case 'compile':
    case 'build':
      return cmdCompile(files[0]!, out);
    case 'sanitize':
    case 'clean':
      return cmdSanitize(files[0]!, out, checkOnly);
    case 'format':
      return cmdFormat(files[0]!, out);
    default:
      return 2;
  }
}
