/**
 * @file
 * Module: Task Provider Component
 * Description: Manages global background task state, delegates SSE streaming to useSSETaskStream,
 * delegates cache invalidations to useTaskCacheInvalidation, tracks and clears cleanup timers on unmount,
 * and provides browser tab-close protection.
 */
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { TaskStatus } from '../types/enums';
import { TaskContext, type TaskInfo } from './TaskContext';
import { TaskActionsContext } from './TaskActionsContext';
import { useSSETaskStream } from '../hooks/useSSETaskStream';
import { useTaskCacheInvalidation } from '../hooks/useTaskCacheInvalidation';

const CLEANUP_DELAY_MS = 5000;

interface TaskProviderProps {
    children: React.ReactNode;
}

export function TaskProvider({ children }: TaskProviderProps) {
    const [tasks, setTasks] = useState<Record<string, TaskInfo>>({});
    const cleanupTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    const { handleTaskCompleted, handleTaskFailed } = useTaskCacheInvalidation();

    // Schedule cleanup of completed/failed tasks from local state after delay
    const scheduleTaskCleanup = useCallback((taskId: string) => {
        const existingTimer = cleanupTimersRef.current.get(taskId);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        const timerId = setTimeout(() => {
            cleanupTimersRef.current.delete(taskId);
            setTasks((current) => {
                if (!(taskId in current)) return current;
                const next = { ...current };
                delete next[taskId];
                return next;
            });
        }, CLEANUP_DELAY_MS);

        cleanupTimersRef.current.set(taskId, timerId);
    }, []);

    // Clear all pending cleanup timers on unmount to prevent memory leaks
    useEffect(() => {
        const timers = cleanupTimersRef.current;
        return () => {
            timers.forEach((timerId) => clearTimeout(timerId));
            timers.clear();
        };
    }, []);

    const onTasksUpdate = useCallback((incomingBatch: Record<string, TaskInfo>) => {
        setTasks((prev) => {
            const next = { ...prev };
            Object.entries(incomingBatch).forEach(([tid, tinfo]) => {
                next[tid] = tinfo;
            });
            return next;
        });
    }, []);

    const onTaskCompleted = useCallback((taskId: string, task: TaskInfo) => {
        handleTaskCompleted(taskId, task);
        scheduleTaskCleanup(taskId);
    }, [handleTaskCompleted, scheduleTaskCleanup]);

    const onTaskFailed = useCallback((taskId: string, task: TaskInfo) => {
        handleTaskFailed(taskId, task);
        scheduleTaskCleanup(taskId);
    }, [handleTaskFailed, scheduleTaskCleanup]);

    // Connect to SSE stream
    useSSETaskStream({
        onTasksUpdate,
        onTaskCompleted,
        onTaskFailed,
    });

    const addTask = useCallback((task: TaskInfo) => {
        setTasks((prev) => ({
            ...prev,
            [task.id]: task,
        }));
    }, []);

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

    // Helper to get active auto-tagging task for a specific set ID
    const getTaskForSet = useCallback((setId: number) => {
        const prefix = `autotag-${setId}-`;
        return Object.values(tasks).find(
            (t) => t.id.startsWith(prefix) && (t.status === TaskStatus.ACCEPTED || t.status === TaskStatus.PROCESSING)
        );
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
