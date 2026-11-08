/**
 * @file
 * Unit tests for useBatchImportQueue hook.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBatchImportQueue } from './useBatchImportQueue';

const mockBatchImportApi = vi.fn();
const mockCancelTaskApi = vi.fn();
const mockShowNotification = vi.fn();

vi.mock('../../../api/generated/sets/sets', () => ({
    batchImportSetsApiSetsBatchImportPost: (...args: unknown[]) => mockBatchImportApi(...args),
}));

vi.mock('../../../api/generated/tasks/tasks', () => ({
    cancelTaskEndpointApiTasksTaskIdCancelPost: (...args: unknown[]) => mockCancelTaskApi(...args),
}));

vi.mock('../../../hooks/useAppNotifications', () => ({
    useAppNotifications: () => ({
        showNotification: mockShowNotification,
    }),
}));

vi.mock('../../../hooks/useTasks', () => ({
    useTasks: () => ({
        tasks: {
            'task-123': {
                id: 'task-123',
                status: 'processing',
                progress: 5,
                total: 10,
            }
        },
    }),
}));

describe('useBatchImportQueue', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCancelTaskApi.mockResolvedValue({ task_id: 'task-123', status: 'cancelled', message: 'Cancelled' });
    });

    it('handleClearQueue resets results and aborts scanning', async () => {
        const { result } = renderHook(() => useBatchImportQueue());

        act(() => {
            result.current.setResults([
                { source_path: '/path/test', creator_name: 'Artist', set_title: 'Title', status: 'pending', isValid: true }
            ]);
        });

        expect(result.current.results.length).toBe(1);

        act(() => {
            result.current.handleClearQueue();
        });

        expect(result.current.results.length).toBe(0);
        expect(result.current.isScanning).toBe(false);
    });

    it('handleCancelImport triggers cancellation endpoint for active task', async () => {
        mockBatchImportApi.mockResolvedValue({
            status: 'accepted',
            task_id: 'task-123'
        });

        const { result } = renderHook(() => useBatchImportQueue());

        act(() => {
            result.current.setResults([
                { source_path: '/path/test', creator_name: 'Artist', set_title: 'Title', status: 'pending', isValid: true }
            ]);
        });

        await act(async () => {
            await result.current.handleImportAll();
        });

        expect(result.current.activeTaskId).toBe('task-123');
        expect(result.current.isTaskRunning).toBe(true);

        await act(async () => {
            await result.current.handleCancelImport();
        });

        expect(mockCancelTaskApi).toHaveBeenCalledWith('task-123');
        expect(result.current.activeTaskId).toBe(null);
    });
});
