import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Same "@/…" alias the extension build uses ("/src" is relative to the project root).
    alias: [{ find: /^@\//, replacement: '/src/' }],
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
  },
});
