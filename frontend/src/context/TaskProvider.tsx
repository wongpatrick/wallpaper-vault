/**
 * @file
 * Module: Task Provider Component
 * Description: Manages global background task state, listens to the Server-Sent Events (SSE) stream,
 * provides browser close protection during active tasks, triggers toast notifications, and invalidates query caches.
 */
import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNotificationHistory } from '../hooks/useNotificationHistory';
import { API_BASE_URL } from '../config';
import { AXIOS_INSTANCE } from '../api/axios-instance';
import { TaskStatus } from '../types/enums';
import { TaskContext, type TaskInfo } from './TaskContext';
import { TaskActionsContext } from './TaskActionsContext';

const CLEANUP_DELAY_MS = 5000;
const INITIAL_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 15000;
const RETRY_BACKOFF_FACTOR = 2;

interface TaskProviderProps {
    children: React.ReactNode;
}

export function TaskProvider({ children }: TaskProviderProps) {
    const [tasks, setTasks] = useState<Record<string, TaskInfo>>({});
    const tasksRef = useRef(tasks);
    
    useEffect(() => {
        tasksRef.current = tasks;
    }, [tasks]);

    const { showNotification } = useNotificationHistory();
    const queryClient = useQueryClient();

    // Helper to invalidate queries upon task completion scoped by task domain to prevent refetch storms
    const invalidateTaskQueries = useCallback((taskType: 'import' | 'autotag' | 'audit' | 'all') => {
        queryClient.invalidateQueries({
            predicate: (query) => {
                const key0 = query.queryKey[0];
                const key1 = query.queryKey[1];
                
                const isMatch = (target: string) => {
                    if (typeof key0 === 'string') {
                        if (key0 === target || key0.startsWith(`/api/${target}`)) return true;
                        if (key0 === 'multi-vault' && typeof key1 === 'string' && (key1 === target || key1.startsWith(`/api/${target}`))) return true;
                    }
                    return false;
                };

                if (taskType === 'import') {
                    return isMatch('sets') || isMatch('images');
                }
                if (taskType === 'autotag') {
                    return isMatch('sets') || isMatch('tags') || isMatch('characters');
                }
                if (taskType === 'audit') {
                    return isMatch('sets');
                }
                const allTargets = ['sets', 'tags', 'characters', 'images', 'creators', 'franchises'];
                return allTargets.some(isMatch);
            }
        });
    }, [queryClient]);

    // Handle notifications and cache invalidations for task completions/failures
    const handleTaskCompletion = useCallback((tid: string, tinfo: { error_message?: string }) => {
        if (tid.startsWith('import-')) {
            invalidateTaskQueries('import');
            const hasWarning = !!tinfo.error_message;
            showNotification({
                id: tid,
                title: hasWarning ? 'Import Complete (with warnings)' : 'Batch Import Complete',
                message: hasWarning ? tinfo.error_message! : 'Your background import task has finished successfully.',
                color: hasWarning ? 'orange' : 'green',
                autoClose: hasWarning ? false : CLEANUP_DELAY_MS,
                status: TaskStatus.COMPLETED,
            });
        } else if (tid.startsWith('autotag-')) {
            invalidateTaskQueries('autotag');
            showNotification({
                id: tid,
                title: 'AI Auto-Tagging Complete',
                message: 'Successfully generated tags and characters for this set.',
                color: 'green',
                autoClose: 5000,
                status: TaskStatus.COMPLETED,
            });
        } else if (tid.startsWith('audit-')) {
            invalidateTaskQueries('audit');
            showNotification({
                id: tid,
                title: 'Audit Complete',
                message: 'Library scan finished successfully.',
                color: 'green',
                autoClose: 5000,
                status: TaskStatus.COMPLETED,
            });
        } else {
            invalidateTaskQueries('all');
        }
    }, [invalidateTaskQueries, showNotification]);

    const handleTaskFailure = useCallback((tid: string, tinfo: { error_message?: string }) => {
        const errorMessage = tinfo.error_message || 'An error occurred during execution.';

        if (tid.startsWith('import-')) {
            invalidateTaskQueries('import');
            showNotification({
                id: tid,
                title: 'Batch Import Failed',
                message: `Import failed: ${errorMessage}`,
                color: 'red',
                autoClose: false,
                status: TaskStatus.ERROR,
            });
        } else if (tid.startsWith('autotag-')) {
            invalidateTaskQueries('autotag');
            showNotification({
                id: tid,
                title: 'AI Auto-Tagging Failed',
                message: `Auto-tagging failed: ${errorMessage}`,
                color: 'red',
                autoClose: false,
                status: TaskStatus.ERROR,
            });
        } else if (tid.startsWith('audit-')) {
            invalidateTaskQueries('audit');
            showNotification({
                id: tid,
                title: 'Audit Failed',
                message: `Scan failed: ${errorMessage}`,
                color: 'red',
                autoClose: false,
                status: TaskStatus.ERROR,
            });
        } else {
            invalidateTaskQueries('all');
        }
    }, [invalidateTaskQueries, showNotification]);

    const addTask = useCallback((task: TaskInfo) => {
        setTasks((prev) => ({
            ...prev,
            [task.id]: task,
        }));
    }, []);

    // Connect to the unified SSE stream with auto-reconnect and resilience
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
                        console.warn(`SSE connection dropped in TaskProvider. Retrying in ${retryDelay}ms...`);
                        retryTimeout = setTimeout(() => {
                            retryDelay = Math.min(retryDelay * RETRY_BACKOFF_FACTOR, MAX_RETRY_DELAY_MS);
                            connect();
                        }, retryDelay);
                    }
                };

                eventSource.onmessage = (event) => {
                    try {
                        const incomingTasks: Record<string, Omit<TaskInfo, 'id'>> = JSON.parse(event.data);
                        const prev = tasksRef.current;

                        const updated = { ...prev };
                        const completedTasks: [string, Omit<TaskInfo, 'id'>][] = [];
                        const failedTasks: [string, Omit<TaskInfo, 'id'>][] = [];

                        Object.entries(incomingTasks).forEach(([tid, tinfo]) => {
                            const existingTask = prev[tid];
                            const wasActive = !existingTask || (
                                existingTask.status !== TaskStatus.COMPLETED && 
                                existingTask.status !== TaskStatus.ERROR
                            );

                            // Update task in local record
                            updated[tid] = {
                                ...tinfo,
                                id: tid,
                            } as TaskInfo;

                            // Trigger notifications and cache invalidations only on transition to final state
                            if (wasActive) {
                                if (tinfo.status === TaskStatus.COMPLETED) {
                                    completedTasks.push([tid, tinfo]);
                                } else if (tinfo.status === TaskStatus.ERROR) {
                                    failedTasks.push([tid, tinfo]);
                                }
                            }
                        });

                        // Update tasks state
                        setTasks(updated);

                        // Safely trigger side-effects outside of state updates to avoid React setState-in-render warnings
                        completedTasks.forEach(([tid, tinfo]) => {
                            handleTaskCompletion(tid, tinfo);
                            // Schedule cleanup from local tasks state after 5 seconds to keep sidebar clear
                            setTimeout(() => {
                                setTasks((current) => {
                                    const next = { ...current };
                                    delete next[tid];
                                    return next;
                                });
                            }, CLEANUP_DELAY_MS);
                        });

                        failedTasks.forEach(([tid, tinfo]) => {
                            handleTaskFailure(tid, tinfo);
                            // Schedule cleanup from local tasks state after 5 seconds
                            setTimeout(() => {
                                setTasks((current) => {
                                    const next = { ...current };
                                    delete next[tid];
                                    return next;
                                });
                            }, CLEANUP_DELAY_MS);
                        });

                    } catch (err) {
                        console.error('Error parsing SSE task events:', err);
                    }
                };

            } catch (err) {
                console.error('Error initializing SSE connection:', err);
                if (!isUnmounted) {
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
            setTasks({});
            retryDelay = INITIAL_RETRY_DELAY_MS;
            connect();
        };

        window.addEventListener('vault-switched', handleVaultSwitched);

        return () => {
            isUnmounted = true;
            window.removeEventListener('vault-switched', handleVaultSwitched);
            if (retryTimeout) clearTimeout(retryTimeout);
            if (eventSource) eventSource.close();
        };
    }, [handleTaskCompletion, handleTaskFailure]);

    // Check if any background task is currently active
    const isTaskRunning = useMemo(() => {
        return Object.values(tasks).some(
            (t) => t.status !== TaskStatus.COMPLETED && t.status !== TaskStatus.ERROR
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

    const actionsValue = useMemo(() => ({
        addTask,
    }), [addTask]);

    const contextValue = useMemo(() => ({
        tasks,
        getTaskForSet,
        isTaskRunning,
        addTask,
    }), [tasks, getTaskForSet, isTaskRunning, addTask]);

    return (
        <TaskActionsContext.Provider value={actionsValue}>
            <TaskContext.Provider value={contextValue}>
                {children}
            </TaskContext.Provider>
        </TaskActionsContext.Provider>
    );
}
