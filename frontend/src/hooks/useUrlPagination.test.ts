/**
 * @file
 * Tests for useUrlPagination hook.
 */
/* eslint-disable no-magic-numbers */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { useUrlPagination } from './useUrlPagination';

function createWrapper(initialUrl = '/') {
    return function Wrapper({ children }: { children: React.ReactNode }) {
        return React.createElement(MemoryRouter, { initialEntries: [initialUrl] }, children);
    };
}

describe('useUrlPagination', () => {
    it('defaults to page 1 when query param is missing', () => {
        const { result } = renderHook(() => useUrlPagination(20), {
            wrapper: createWrapper('/'),
        });

        expect(result.current.page).toBe(1);
    });

    it('parses valid page number from URL', () => {
        const { result } = renderHook(() => useUrlPagination(20), {
            wrapper: createWrapper('/?page=4'),
        });

        expect(result.current.page).toBe(4);
    });

    it('falls back to 1 when page is NaN or negative', () => {
        const { result: nanResult } = renderHook(() => useUrlPagination(20), {
            wrapper: createWrapper('/?page=abc'),
        });
        expect(nanResult.current.page).toBe(1);

        const { result: negResult } = renderHook(() => useUrlPagination(20), {
            wrapper: createWrapper('/?page=-3'),
        });
        expect(negResult.current.page).toBe(1);
    });

    it('updates page parameter via setPage', () => {
        const { result } = renderHook(() => useUrlPagination(20), {
            wrapper: createWrapper('/'),
        });

        act(() => {
            result.current.setPage(3);
        });
        expect(result.current.page).toBe(3);

        // Setting back to 1 removes page param
        act(() => {
            result.current.setPage(1);
        });
        expect(result.current.page).toBe(1);
    });

    it('supports functional updates in setPage', () => {
        const { result } = renderHook(() => useUrlPagination(20), {
            wrapper: createWrapper('/?page=2'),
        });

        act(() => {
            result.current.setPage((prev) => prev + 1);
        });
        expect(result.current.page).toBe(3);
    });

    it('calculates getTotalPages accurately and handles 0 or negative counts', () => {
        const { result } = renderHook(() => useUrlPagination(25), {
            wrapper: createWrapper('/'),
        });

        expect(result.current.getTotalPages(100)).toBe(4);
        expect(result.current.getTotalPages(101)).toBe(5);
        expect(result.current.getTotalPages(0)).toBe(0);
        expect(result.current.getTotalPages(-10)).toBe(0);
    });
});
