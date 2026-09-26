// Jest config cho Auth Service; dùng ts-jest để test application/presentation mà không boot database thật.
module.exports = {
    moduleFileExtensions: ['js', 'json', 'ts'],
    rootDir: '.',
    testRegex: '.*\\.spec\\.ts$',
    transform: { '^.+\\.(t|j)s$': 'ts-jest' },
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^@common/(.*)$': '<rootDir>/../../packages/common/$1',
    },
    testEnvironment: 'node',
};
