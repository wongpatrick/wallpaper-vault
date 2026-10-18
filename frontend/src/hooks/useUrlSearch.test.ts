/**
 * @file
 * Tests for useUrlSearch hook.
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { useUrlSearch } from './useUrlSearch';

function createWrapper(initialUrl = '/') {
    return function Wrapper({ children }: { children: React.ReactNode }) {
        return React.createElement(MemoryRouter, { initialEntries: [initialUrl] }, children);
    };
}

describe('useUrlSearch', () => {
    it('initializes with search query from URL', () => {
        const { result } = renderHook(() => useUrlSearch(20), {
            wrapper: createWrapper('/?search=nature'),
        });

        expect(result.current.search).toBe('nature');
        expect(result.current.localSearch).toBe('nature');
    });

    it('syncs debounced search to URL and resets specified resetParams', async () => {
        const { result } = renderHook(() => useUrlSearch(20, ['page', 'offset']), {
            wrapper: createWrapper('/?search=old&page=3&offset=30'),
        });

        act(() => {
            result.current.setLocalSearch('sunset');
        });

        expect(result.current.localSearch).toBe('sunset');

        await waitFor(() => {
            expect(result.current.search).toBe('sunset');
        });
    });

    it('deletes search parameter when set to empty string', async () => {
        const { result } = renderHook(() => useUrlSearch(20), {
            wrapper: createWrapper('/?search=test&page=2'),
        });

        act(() => {
            result.current.setLocalSearch('');
        });

        await waitFor(() => {
            expect(result.current.search).toBe('');
        });
    });
});
