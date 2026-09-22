/**
 * @file
 * Tests for useTaskCacheInvalidation hook.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTaskCacheInvalidation } from './useTaskCacheInvalidation';
import { TaskStatus } from '../types/enums';

const mockInvalidateQueries = vi.fn();
const mockShowNotification = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

vi.mock('./useAppNotifications', () => ({
  useAppNotifications: () => ({
    showNotification: mockShowNotification,
  }),
}));

describe('useTaskCacheInvalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invalidates sets and images queries on import task completion', () => {
    const { result } = renderHook(() => useTaskCacheInvalidation());

    act(() => {
      result.current.handleTaskCompleted('import-1', {
        id: 'import-1',
        status: TaskStatus.COMPLETED,
        progress: 10,
        total: 10,
      });
    });

    expect(mockInvalidateQueries).toHaveBeenCalled();
    expect(mockShowNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'import-1',
        title: 'Batch Import Complete',
        color: 'green',
      })
    );

    // Test predicate logic
    const predicate = mockInvalidateQueries.mock.calls[0][0].predicate;
    expect(predicate({ queryKey: ['sets'] })).toBe(true);
    expect(predicate({ queryKey: ['images'] })).toBe(true);
    expect(predicate({ queryKey: ['creators'] })).toBe(false);
  });

  it('invalidates sets, tags, and characters on autotag task completion', () => {
    const { result } = renderHook(() => useTaskCacheInvalidation());

    act(() => {
      result.current.handleTaskCompleted('autotag-set-42-1', {
        id: 'autotag-set-42-1',
        status: TaskStatus.COMPLETED,
        progress: 10,
        total: 10,
      });
    });

    expect(mockInvalidateQueries).toHaveBeenCalled();
    expect(mockShowNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'AI Auto-Tagging Complete',
        color: 'green',
      })
    );

    const predicate = mockInvalidateQueries.mock.calls[0][0].predicate;
    expect(predicate({ queryKey: ['sets'] })).toBe(true);
    expect(predicate({ queryKey: ['tags'] })).toBe(true);
    expect(predicate({ queryKey: ['characters'] })).toBe(true);
    expect(predicate({ queryKey: ['images'] })).toBe(false);
  });

  it('triggers error toast on task failure', () => {
    const { result } = renderHook(() => useTaskCacheInvalidation());

    act(() => {
      result.current.handleTaskFailed('audit-123', {
        id: 'audit-123',
        status: TaskStatus.ERROR,
        progress: 2,
        total: 10,
        error_message: 'Disk read error',
      });
    });

    expect(mockInvalidateQueries).toHaveBeenCalled();
    expect(mockShowNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'audit-123',
        title: 'Audit Failed',
        message: 'Audit failed: Disk read error',
        color: 'red',
        autoClose: false,
      })
    );
  });
});
