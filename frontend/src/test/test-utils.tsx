/**
 * @file
 * Test utility helpers for React component tests.
 * Provides custom render methods wrapped inside MantineProvider.
 */
/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { render as originalRender, type RenderOptions } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

// Custom render helper that wraps components under test in MantineProvider
function render(ui: React.ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
    return originalRender(ui, {
        wrapper: ({ children }) => <MantineProvider>{children}</MantineProvider>,
        ...options,
    });
}

// Re-export everything from React Testing Library
export * from '@testing-library/react';

// Override render method
export { render };
