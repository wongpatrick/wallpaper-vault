/**
 * @file
 * Module: Task Provider Component
 * Description: Manages global background task state, listens to the Server-Sent Events (SSE) stream,
 * provides browser close protection during active tasks, triggers toast notifications, and invalidates query caches.
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNotificationHistory } from '../hooks/useNotificationHistory';
import { API_BASE_URL } from '../config';
import { TaskStatus } from '../types/enums';
import { TaskContext, type TaskInfo } from './TaskContext';

const CLEANUP_DELAY_MS = 5000;

interface TaskProviderProps {
    children: React.ReactNode;
}

export function TaskProvider({ children }: TaskProviderProps) {
    const [tasks, setTasks] = useState<Record<string, TaskInfo>>({});
    const { showNotification } = useNotificationHistory();
    const queryClient = useQueryClient();

    // Helper to invalidate all related queries upon task completion to keep UI fresh
    const invalidateAppQueries = useCallback(() => {
        queryClient.invalidateQueries({
            predicate: (query) => {
                const key = query.queryKey[0];
                if (typeof key === 'string') {
                    return key.startsWith('/api/sets') || 
                           key.startsWith('/api/tags') || 
                           key.startsWith('/api/characters') || 
                           key.startsWith('/api/images') ||
                           key === 'sets' ||
                           key === 'tags' ||
                           key === 'characters' ||
                           key === 'images';
                }
                return false;
            }
        });
    }, [queryClient]);

    // Handle notifications and cache invalidations for task completions/failures
    const handleTaskCompletion = useCallback((tid: string) => {
        invalidateAppQueries();

        if (tid.startsWith('import-')) {
            showNotification({
                id: tid,
                title: 'Batch Import Complete',
                message: 'Your background import task has finished successfully.',
                color: 'green',
                autoClose: 5000,
                status: TaskStatus.COMPLETED,
            });
        } else if (tid.startsWith('autotag-')) {
            showNotification({
                id: tid,
                title: 'AI Auto-Tagging Complete',
                message: 'Successfully generated tags and characters for this set.',
                color: 'green',
                autoClose: 5000,
                status: TaskStatus.COMPLETED,
            });
        } else if (tid.startsWith('audit-')) {
            showNotification({
                id: tid,
                title: 'Audit Complete',
                message: 'Library scan finished successfully.',
                color: 'green',
                autoClose: 5000,
                status: TaskStatus.COMPLETED,
            });
        }
    }, [invalidateAppQueries, showNotification]);

    const handleTaskFailure = useCallback((tid: string, tinfo: { error_message?: string }) => {
        invalidateAppQueries();
        const errorMessage = tinfo.error_message || 'An error occurred during execution.';

        if (tid.startsWith('import-')) {
            showNotification({
                id: tid,
                title: 'Batch Import Failed',
                message: `Import failed: ${errorMessage}`,
                color: 'red',
                autoClose: false,
                status: TaskStatus.ERROR,
            });
        } else if (tid.startsWith('autotag-')) {
            showNotification({
                id: tid,
                title: 'AI Auto-Tagging Failed',
                message: `Auto-tagging failed: ${errorMessage}`,
                color: 'red',
                autoClose: false,
                status: TaskStatus.ERROR,
            });
        } else if (tid.startsWith('audit-')) {
            showNotification({
                id: tid,
                title: 'Audit Failed',
                message: `Scan failed: ${errorMessage}`,
                color: 'red',
                autoClose: false,
                status: TaskStatus.ERROR,
            });
        }
    }, [invalidateAppQueries, showNotification]);

    // Connect to the unified SSE stream
    useEffect(() => {
        const eventSource = new EventSource(`${API_BASE_URL}/api/sets/events`);

        eventSource.onmessage = (event) => {
            try {
                const incomingTasks: Record<string, Omit<TaskInfo, 'id'>> = JSON.parse(event.data);

                setTasks((prev) => {
                    const updated = { ...prev };

                    Object.entries(incomingTasks).forEach(([tid, tinfo]) => {
                        const existingTask = prev[tid];
                        const wasActive = !existingTask || 
                            existingTask.status === TaskStatus.ACCEPTED || 
                            existingTask.status === TaskStatus.PROCESSING;

                        // Update task in local record
                        updated[tid] = {
                            ...tinfo,
                            id: tid,
                        } as TaskInfo;

                        // Trigger notifications and cache invalidations only on transition to final state
                        if (wasActive) {
                            if (tinfo.status === TaskStatus.COMPLETED) {
                                handleTaskCompletion(tid);
                                // Schedule cleanup from local tasks state after 5 seconds to keep sidebar clear
                                setTimeout(() => {
                                    setTasks((current) => {
                                        const next = { ...current };
                                        delete next[tid];
                                        return next;
                                    });
                                }, CLEANUP_DELAY_MS);
                            } else if (tinfo.status === TaskStatus.ERROR) {
                                handleTaskFailure(tid, tinfo);
                                // Schedule cleanup from local tasks state after 5 seconds
                                setTimeout(() => {
                                    setTasks((current) => {
                                        const next = { ...current };
                                        delete next[tid];
                                        return next;
                                    });
                                }, CLEANUP_DELAY_MS);
                            }
                        }
                    });

                    return updated;
                });
            } catch (err) {
                console.error('Error parsing SSE task events:', err);
            }
        };

        return () => {
            eventSource.close();
        };
    }, [handleTaskCompletion, handleTaskFailure]);

    // Check if any background task is currently active
    const isTaskRunning = useMemo(() => {
        return Object.values(tasks).some(
            (t) => t.status === TaskStatus.ACCEPTED || t.status === TaskStatus.PROCESSING
        );
    }, [tasks]);

    // Prevent tab closure if a background task is running
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isTaskRunning) {
                e.preventDefault();
                e.returnValue = 'A background task is currently running. Closing the app will interrupt the process.';
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isTaskRunning]);

    // Helper to get auto-tagging task for a specific set ID
    const getTaskForSet = useCallback((setId: number) => {
        const prefix = `autotag-${setId}-`;
        return Object.values(tasks).find((t) => t.id.startsWith(prefix));
    }, [tasks]);

    const contextValue = useMemo(() => ({
        tasks,
        getTaskForSet,
        isTaskRunning,
    }), [tasks, getTaskForSet, isTaskRunning]);

    return (
        <TaskContext.Provider value={contextValue}>
            {children}
        </TaskContext.Provider>
    );
}
