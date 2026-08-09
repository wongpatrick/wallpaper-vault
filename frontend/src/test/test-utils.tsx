/**
 * @file
 * Test utility helpers for React component tests.
 * Provides custom render methods wrapped inside MantineProvider.
 */
/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { render as originalRender, type RenderOptions } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const createTestQueryClient = () => new QueryClient({
    defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
    },
});

// Custom render helper that wraps components under test in MantineProvider and QueryClientProvider
function render(ui: React.ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
    const testQueryClient = createTestQueryClient();
    return originalRender(ui, {
        wrapper: ({ children }) => (
            <QueryClientProvider client={testQueryClient}>
                <MantineProvider>{children}</MantineProvider>
            </QueryClientProvider>
        ),
        ...options,
    });
}

// Re-export everything from React Testing Library
export * from '@testing-library/react';

// Override render method
export { render };
