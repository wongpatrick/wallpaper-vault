/**
 * @file
 * Unit tests for useSelection hook.
 */
/* eslint-disable no-magic-numbers */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSelection } from './useSelection';

describe('useSelection hook', () => {
    it('initializes with selectionMode false and empty selectedIds', () => {
        const { result } = renderHook(() => useSelection<number>());
        expect(result.current.selectionMode).toBe(false);
        expect(result.current.selectedIds.size).toBe(0);
    });

    it('enters selection mode explicitly via enterSelectionMode', () => {
        const { result } = renderHook(() => useSelection<number>());

        act(() => {
            result.current.enterSelectionMode();
        });

        expect(result.current.selectionMode).toBe(true);
        expect(result.current.selectedIds.size).toBe(0);
    });

    it('exits selection mode and clears ids via exitSelectionMode', () => {
        const { result } = renderHook(() => useSelection<number>());

        act(() => {
            result.current.startSelectionWith(1);
        });
        expect(result.current.selectionMode).toBe(true);
        expect(result.current.selectedIds.has(1)).toBe(true);

        act(() => {
            result.current.exitSelectionMode();
        });
        expect(result.current.selectionMode).toBe(false);
        expect(result.current.selectedIds.size).toBe(0);
    });

    it('adds item and enters selection mode on toggle', () => {
        const { result } = renderHook(() => useSelection<number>());

        act(() => {
            result.current.toggle(42);
        });

        expect(result.current.selectionMode).toBe(true);
        expect(result.current.selectedIds.has(42)).toBe(true);
    });

    it('retains selectionMode true when one of multiple items is removed', () => {
        const { result } = renderHook(() => useSelection<number>());

        act(() => {
            result.current.toggle(1);
            result.current.toggle(2);
        });
        expect(result.current.selectedIds.size).toBe(2);
        expect(result.current.selectionMode).toBe(true);

        act(() => {
            result.current.toggle(1);
        });
        expect(result.current.selectedIds.size).toBe(1);
        expect(result.current.selectedIds.has(2)).toBe(true);
        expect(result.current.selectionMode).toBe(true);
    });

    it('auto-resets selectionMode to false when removing the last selected item', () => {
        const { result } = renderHook(() => useSelection<number>());

        act(() => {
            result.current.toggle(10);
        });
        expect(result.current.selectionMode).toBe(true);
        expect(result.current.selectedIds.size).toBe(1);

        act(() => {
            result.current.toggle(10);
        });
        expect(result.current.selectedIds.size).toBe(0);
        expect(result.current.selectionMode).toBe(false);
    });

    it('selects all items and activates selectionMode via selectAll', () => {
        const { result } = renderHook(() => useSelection<number>());

        act(() => {
            result.current.selectAll([1, 2, 3]);
        });

        expect(result.current.selectionMode).toBe(true);
        expect(result.current.selectedIds.size).toBe(3);
        expect(result.current.selectedIds.has(2)).toBe(true);
    });

    it('clears selection and deactivates selectionMode via clear', () => {
        const { result } = renderHook(() => useSelection<number>());

        act(() => {
            result.current.selectAll([1, 2]);
        });
        expect(result.current.selectionMode).toBe(true);

        act(() => {
            result.current.clear();
        });
        expect(result.current.selectionMode).toBe(false);
        expect(result.current.selectedIds.size).toBe(0);
    });

    it('starts selection with a specific item via startSelectionWith', () => {
        const { result } = renderHook(() => useSelection<string>());

        act(() => {
            result.current.startSelectionWith('item-a');
        });

        expect(result.current.selectionMode).toBe(true);
        expect(result.current.selectedIds.size).toBe(1);
        expect(result.current.selectedIds.has('item-a')).toBe(true);
    });
});
