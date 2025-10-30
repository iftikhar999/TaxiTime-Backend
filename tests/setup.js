const { PrismaClient } = require('@prisma/client');

// Global test setup
const prisma = new PrismaClient();

beforeAll(async () => {
    // Make Prisma client available globally
    global.prisma = prisma;

    // Set test environment variables
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';

    console.log('🧪 Test environment initialized');
});

afterAll(async () => {
    // Clean up and disconnect
    await prisma.$disconnect();
    console.log('🧹 Test environment cleaned up');
});

// Global test timeout
jest.setTimeout(30000);

// Suppress console logs during tests unless there's an error
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeEach(() => {
    console.log = jest.fn();
});

afterEach(() => {
    console.log = originalConsoleLog;
});

// Keep error logging for debugging
console.error = originalConsoleError;