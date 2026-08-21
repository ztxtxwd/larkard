import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/raw-to-dsl.test.ts'],
  },
});
