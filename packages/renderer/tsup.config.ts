import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.js' };
  },
  dts: true,
  sourcemap: false,
  clean: true,
  treeshake: true,
  target: 'es2020',
  loader: { '.css': 'copy' },
  publicDir: false,
  async onSuccess() {
    const { copyFile, readFile, writeFile } = await import('node:fs/promises');
    await copyFile('src/styles.css', 'dist/styles.css');
    await copyFile('src/icon-font.css', 'dist/icon-font.css');
    await copyFile('src/emoji.css', 'dist/emoji.css');
    const [s, i, e] = await Promise.all([
      readFile('dist/styles.css', 'utf8'),
      readFile('dist/icon-font.css', 'utf8'),
      readFile('dist/emoji.css', 'utf8'),
    ]);
    await writeFile('dist/all.css', `${s}\n${i}\n${e}`);
  },
});
