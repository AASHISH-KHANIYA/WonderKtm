import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'], testTimeout: 30000, hookTimeout: 30000, fileParallelism: false,
    env: { NODE_ENV: 'test', JWT_SECRET: 'test-secret-test-secret-test-secret-12345', STORAGE_DRIVER: 'local', CLIENT_URL: 'http://localhost:5173' },
  },
});
