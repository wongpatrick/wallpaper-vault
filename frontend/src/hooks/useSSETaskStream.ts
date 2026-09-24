/**
 * @file
 * Hook for managing the unified Server-Sent Events (SSE) task stream.
 * Handles EventSource lifecycle, exponential backoff reconnection,
 * vault-switch resilience, and runtime payload validation.
 */
import { useEffect, useRef } from 'react';
import { API_BASE_URL } from '../config';
import { AXIOS_INSTANCE } from '../api/axios-instance';
import { TaskStatus } from '../types/enums';
import type { TaskInfo } from '../context/TaskContext';
import { useVaultEvent } from '../context/VaultEventContext';

const INITIAL_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 15000;
const RETRY_BACKOFF_FACTOR = 2;

export interface UseSSETaskStreamOptions {
  onTasksUpdate: (incomingBatch: Record<string, TaskInfo>) => void;
  onTaskCompleted: (taskId: string, task: TaskInfo) => void;
  onTaskFailed: (taskId: string, task: TaskInfo) => void;
}

const VALID_STATUSES = new Set([
  TaskStatus.ACCEPTED,
  TaskStatus.PROCESSING,
  TaskStatus.COMPLETED,
  TaskStatus.ERROR,
]);

export function isValidTaskInfo(obj: unknown): obj is Omit<TaskInfo, 'id'> {
  if (typeof obj !== 'object' || obj === null) return false;
  const t = obj as Record<string, unknown>;
  if (typeof t.status !== 'string' || !VALID_STATUSES.has(t.status as TaskStatus)) return false;
  if (typeof t.progress !== 'number' || isNaN(t.progress)) return false;
  if (typeof t.total !== 'number' || isNaN(t.total)) return false;
  if (t.error_message !== undefined && t.error_message !== null && typeof t.error_message !== 'string') return false;
  return true;
}

export function isValidIncomingTasksPayload(data: unknown): data is Record<string, Omit<TaskInfo, 'id'>> {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return false;
  const map = data as Record<string, unknown>;
  for (const [key, value] of Object.entries(map)) {
    if (typeof key !== 'string' || !isValidTaskInfo(value)) {
      return false;
    }
  }
  return true;
}

export function useSSETaskStream({
  onTasksUpdate,
  onTaskCompleted,
  onTaskFailed,
}: UseSSETaskStreamOptions) {
  const { onVaultSwitch } = useVaultEvent();
  const knownTaskStatusesRef = useRef<Map<string, TaskStatus>>(new Map());

  // Keep callback refs fresh
  const onTasksUpdateRef = useRef(onTasksUpdate);
  const onTaskCompletedRef = useRef(onTaskCompleted);
  const onTaskFailedRef = useRef(onTaskFailed);

  useEffect(() => {
    onTasksUpdateRef.current = onTasksUpdate;
    onTaskCompletedRef.current = onTaskCompleted;
    onTaskFailedRef.current = onTaskFailed;
  });

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let isUnmounted = false;
    let retryDelay = INITIAL_RETRY_DELAY_MS;

    const connect = () => {
      if (isUnmounted) return;

      try {
        const rawBase = localStorage.getItem('backend_url') || AXIOS_INSTANCE.defaults.baseURL || API_BASE_URL;
        const baseOrigin = rawBase.startsWith('http') ? rawBase : window.location.origin;
        const endpoint = rawBase.startsWith('http') ? `${rawBase}/api/sets/events` : `/api/sets/events`;

        const token = localStorage.getItem('api_key') || '';
        const url = new URL(endpoint, baseOrigin);
        if (token) {
          url.searchParams.append('api_key', token);
        }

        eventSource = new EventSource(url.toString());

        eventSource.onopen = () => {
          retryDelay = INITIAL_RETRY_DELAY_MS;
        };

        eventSource.onerror = () => {
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          if (!isUnmounted) {
            console.warn(`SSE connection dropped. Retrying in ${retryDelay}ms...`);
            retryTimeout = setTimeout(() => {
              retryDelay = Math.min(retryDelay * RETRY_BACKOFF_FACTOR, MAX_RETRY_DELAY_MS);
              connect();
            }, retryDelay);
          }
        };

        eventSource.onmessage = (event) => {
          try {
            const rawParsed = JSON.parse(event.data);
            if (!isValidIncomingTasksPayload(rawParsed)) {
              console.warn('Received invalid SSE task payload format:', rawParsed);
              return;
            }

            const incomingTasks = rawParsed;
            const knownStatuses = knownTaskStatusesRef.current;
            const batch: Record<string, TaskInfo> = {};
            const completedList: [string, TaskInfo][] = [];
            const failedList: [string, TaskInfo][] = [];

            Object.entries(incomingTasks).forEach(([tid, tinfo]) => {
              const prevStatus = knownStatuses.get(tid);
              const wasActive = !prevStatus || (
                prevStatus !== TaskStatus.COMPLETED &&
                prevStatus !== TaskStatus.ERROR
              );

              const fullTask: TaskInfo = {
                ...tinfo,
                id: tid,
              };
              batch[tid] = fullTask;
              knownStatuses.set(tid, tinfo.status as TaskStatus);

              if (wasActive) {
                if (tinfo.status === TaskStatus.COMPLETED) {
                  completedList.push([tid, fullTask]);
                } else if (tinfo.status === TaskStatus.ERROR) {
                  failedList.push([tid, fullTask]);
                }
              }
            });

            // Update tasks in provider without holding onto a monolithic local copy
            onTasksUpdateRef.current(batch);

            completedList.forEach(([tid, task]) => {
              onTaskCompletedRef.current(tid, task);
            });

            failedList.forEach(([tid, task]) => {
              onTaskFailedRef.current(tid, task);
            });
          } catch (err) {
            console.error('Error processing SSE task event:', err);
          }
        };
      } catch (err) {
        console.error('Error initializing SSE connection:', err);
        if (!isUnmounted) {
          retryDelay = Math.min(retryDelay * RETRY_BACKOFF_FACTOR, MAX_RETRY_DELAY_MS);
          retryTimeout = setTimeout(connect, retryDelay);
        }
      }
    };

    connect();

    const handleVaultSwitched = () => {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      if (retryTimeout) {
        clearTimeout(retryTimeout);
        retryTimeout = null;
      }
      knownTaskStatusesRef.current.clear();
      onTasksUpdateRef.current({});
      retryDelay = INITIAL_RETRY_DELAY_MS;
      connect();
    };

    const unsubscribeVaultSwitch = onVaultSwitch(handleVaultSwitched);

    return () => {
      isUnmounted = true;
      unsubscribeVaultSwitch();
      if (retryTimeout) clearTimeout(retryTimeout);
      if (eventSource) eventSource.close();
    };
  }, [onVaultSwitch]);
}
