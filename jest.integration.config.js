/**
 * Integration Jest project: real PostgreSQL, real Prisma, no mocks.
 *
 * Kept separate from `jest.config.js` on purpose:
 * - the unit suite must stay database-free (`npm test`);
 * - this project runs one worker and a longer timeout because it shares one
 *   disposable database;
 * - integration specs use the `.it.ts` extension so the default `testMatch`
 *   in `jest.config.js` never picks them up.
 */

module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/tests/integration/**/*.it.ts'],
  setupFiles: ['<rootDir>/src/tests/integration/support/setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', { presets: ['next/babel'] }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/'],
  maxWorkers: 1,
  testTimeout: 120000,
};
