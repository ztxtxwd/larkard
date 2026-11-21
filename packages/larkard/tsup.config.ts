import { defineConfig } from 'tsup';
import { copyFile, readFile, writeFile, mkdir } from 'node:fs/promises';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'content/icons/index': 'src/content/icons/index.ts',
    'content/emoji/index': 'src/content/emoji/index.ts',
    'content/metrics': 'src/content/metrics.ts',
    'content/spacing': 'src/content/spacing.ts',
    'schema/index': 'src/schema/index.ts',
    'adapter/index': 'src/adapter/index.ts',
    'renderer/index': 'src/renderer/index.ts',
    'renderer/browser': 'src/renderer/browser.ts',
    'renderer/assets/index': 'src/renderer/assets/index.ts',
    'renderer/async': 'src/renderer/async.ts',
    'components/index': 'src/components/index.ts',
    'components/jsx-runtime': 'src/components/jsx-runtime.ts',
    'components/jsx-dev-runtime': 'src/components/jsx-dev-runtime.ts',
    'optimize/index': 'src/optimize/index.ts',
    'palette/index': 'src/palette/index.ts',
    'palette/browser': 'src/palette/browser.ts',
    'patch/index': 'src/core/patch/index.ts',
    'state/index': 'src/core/state/index.ts',
    'program/index': 'src/program/index.ts',
    'program/runtime/index': 'src/program/runtime/index.ts',
    'language-server/index': 'src/language-server/index.ts',
    'language-server/server': 'src/language-server/server.ts',
    cli: 'src/cli.ts',
    'cli-bin': 'src/cli-bin.ts',
  },
  format: ['esm', 'cjs'],
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.js' };
  },
  dts: false,
  sourcemap: false,
  clean: true,
  treeshake: true,
  splitting: true,
  target: 'es2020',
  // zod 是唯一运行时依赖；其余内部模块打进产物。
  external: ['zod'],
  async onSuccess() {
    await mkdir('dist/renderer', { recursive: true });
    await copyFile('src/renderer/styles.css', 'dist/renderer/styles.css');
    await copyFile('src/renderer/icon-font.css', 'dist/renderer/icon-font.css');
    await copyFile('src/renderer/emoji.css', 'dist/renderer/emoji.css');
    const [styles, icons, emoji] = await Promise.all([
      readFile('dist/renderer/styles.css', 'utf8'),
      readFile('dist/renderer/icon-font.css', 'utf8'),
      readFile('dist/renderer/emoji.css', 'utf8'),
    ]);
    await writeFile('dist/renderer/all.css', `${styles}\n${icons}\n${emoji}`);
  },
});
