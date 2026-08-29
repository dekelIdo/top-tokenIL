/** Jest configuration for the Top Token backend. */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\.spec\.ts$',
  transform: { '^.+\.(t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  // Integration tests provision a real PostgreSQL from Phase B onward; keeping
  // them serial avoids two suites fighting over the same database.
  maxWorkers: 1,
  // Booting a Nest application in a hook takes longer than Jest's 5s default.
  testTimeout: 30000,
};
