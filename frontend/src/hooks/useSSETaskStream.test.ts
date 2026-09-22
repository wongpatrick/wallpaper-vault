/**
 * @file
 * Tests for useSSETaskStream payload validation and lifecycle.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSSETaskStream, isValidTaskInfo, isValidIncomingTasksPayload } from './useSSETaskStream';
import { TaskStatus } from '../types/enums';

describe('useSSETaskStream validation logic', () => {
  it('validates well-formed task info', () => {
    expect(isValidTaskInfo({
      status: TaskStatus.PROCESSING,
      progress: 5,
      total: 10,
    })).toBe(true);

    expect(isValidTaskInfo({
      status: TaskStatus.COMPLETED,
      progress: 10,
      total: 10,
      error_message: 'Minor warning',
    })).toBe(true);
  });

  it('rejects malformed task info', () => {
    expect(isValidTaskInfo(null)).toBe(false);
    expect(isValidTaskInfo({})).toBe(false);
    expect(isValidTaskInfo({ status: 'unknown_status', progress: 0, total: 10 })).toBe(false);
    expect(isValidTaskInfo({ status: TaskStatus.ACCEPTED, progress: 'not-a-number', total: 10 })).toBe(false);
    expect(isValidTaskInfo({ status: TaskStatus.ACCEPTED, progress: 0, total: NaN })).toBe(false);
    expect(isValidTaskInfo({ status: TaskStatus.ACCEPTED, progress: 0, total: 10, error_message: 123 })).toBe(false);
  });

  it('validates full incoming task payloads', () => {
    expect(isValidIncomingTasksPayload({
      'task-1': { status: TaskStatus.ACCEPTED, progress: 0, total: 1 },
      'task-2': { status: TaskStatus.COMPLETED, progress: 10, total: 10 },
    })).toBe(true);

    expect(isValidIncomingTasksPayload(null)).toBe(false);
    expect(isValidIncomingTasksPayload([])).toBe(false);
    expect(isValidIncomingTasksPayload({
      'task-1': { status: 'invalid' },
    })).toBe(false);
  });
});

describe('useSSETaskStream hook lifecycle', () => {
  class MockEventSource {
    url: string;
    close = vi.fn();
    onopen: ((this: EventSource, ev: Event) => unknown) | null = null;
    onerror: ((this: EventSource, ev: Event) => unknown) | null = null;
    onmessage: ((this: EventSource, ev: { data: string }) => unknown) | null = null;

    constructor(url: string) {
      this.url = url;
      mockEventSourceInstances.push(this);
    }
  }

  let mockEventSourceInstances: MockEventSource[] = [];

  beforeEach(() => {
    mockEventSourceInstances = [];
    vi.stubGlobal('EventSource', MockEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('initializes EventSource connection and closes on unmount', () => {
    const onTasksUpdate = vi.fn();
    const onTaskCompleted = vi.fn();
    const onTaskFailed = vi.fn();

    const { unmount } = renderHook(() =>
      useSSETaskStream({
        onTasksUpdate,
        onTaskCompleted,
        onTaskFailed,
      })
    );

    expect(mockEventSourceInstances.length).toBe(1);
    const es = mockEventSourceInstances[0];

    unmount();
    expect(es.close).toHaveBeenCalled();
  });

  it('processes incoming events and triggers callbacks upon task completion', () => {
    const onTasksUpdate = vi.fn();
    const onTaskCompleted = vi.fn();
    const onTaskFailed = vi.fn();

    renderHook(() =>
      useSSETaskStream({
        onTasksUpdate,
        onTaskCompleted,
        onTaskFailed,
      })
    );

    const es = mockEventSourceInstances[0];

    // Simulate incoming active task
    es.onmessage({
      data: JSON.stringify({
        'import-123': {
          status: TaskStatus.PROCESSING,
          progress: 5,
          total: 10,
        },
      }),
    });

    expect(onTasksUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        'import-123': expect.objectContaining({
          id: 'import-123',
          status: TaskStatus.PROCESSING,
        }),
      })
    );
    expect(onTaskCompleted).not.toHaveBeenCalled();

    // Transition to completed
    es.onmessage({
      data: JSON.stringify({
        'import-123': {
          status: TaskStatus.COMPLETED,
          progress: 10,
          total: 10,
        },
      }),
    });

    expect(onTaskCompleted).toHaveBeenCalledWith(
      'import-123',
      expect.objectContaining({
        id: 'import-123',
        status: TaskStatus.COMPLETED,
      })
    );
  });
});
