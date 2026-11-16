import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'icon-catalog': 'src/common/icon-catalog.ts',
  },
  format: ['esm', 'cjs'],
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.js' };
  },
  dts: false,
  sourcemap: false,
  clean: true,
  treeshake: true,
  splitting: false,
  target: 'es2022',
});
