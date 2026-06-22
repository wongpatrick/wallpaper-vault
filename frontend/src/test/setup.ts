/**
 * @file
 * Test setup file for Vitest.
 * Integrates custom DOM matchers and hooks up global cleanups.
 */
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Stub window.matchMedia which is not implemented by JSDOM
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(), // Deprecated but often used by older libraries
        removeListener: vi.fn(), // Deprecated but often used by older libraries
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })),
});

// Automatically clean up DOM containers after each test
afterEach(() => {
    cleanup();
});
