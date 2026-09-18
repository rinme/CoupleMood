import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'client/vite.config.ts',
      {
        test: {
          name: 'server',
          include: ['server/tests/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'e2e',
          include: ['tests/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
  },
});
