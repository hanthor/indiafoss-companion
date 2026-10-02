import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['packages/*/src/**/*.ts', 'packages/*/src/**/*.js'],
      exclude: [
        'node_modules/',
        'packages/*/dist/',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/test-fixtures/**',
      ],
      lines: 60,
      functions: 60,
      branches: 50,
      statements: 60,
    },
  },
})
