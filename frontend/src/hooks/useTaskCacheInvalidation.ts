/**
 * @file
 * Hook for invalidating React Query caches and showing notifications upon task lifecycle events.
 * Uses a declarative lookup table mapping task prefixes to cache keys and toast configurations.
 */
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppNotifications } from './useAppNotifications';
import { TaskStatus } from '../types/enums';
import type { TaskInfo } from '../context/TaskContext';

const CLEANUP_DELAY_MS = 5000;

// Lookup table mapping task prefix key to query target categories
const TASK_QUERY_TARGETS: Record<string, string[]> = {
  import: ['sets', 'images'],
  autotag: ['sets', 'tags', 'characters'],
  audit: ['sets'],
  scan: ['sets', 'library-paths'],
};

const ALL_QUERY_TARGETS = ['sets', 'tags', 'characters', 'images', 'creators', 'franchises'];

function getTaskCategory(taskId: string): string {
  const dashIdx = taskId.indexOf('-');
  const underIdx = taskId.indexOf('_');
  const splitIdx = dashIdx > 0 && underIdx > 0 ? Math.min(dashIdx, underIdx) : (dashIdx > 0 ? dashIdx : underIdx);

  if (splitIdx > 0) {
    const prefix = taskId.substring(0, splitIdx);
    if (prefix in TASK_QUERY_TARGETS) {
      return prefix;
    }
  }
  return 'all';
}

export function useTaskCacheInvalidation() {
  const queryClient = useQueryClient();
  const { showNotification } = useAppNotifications();

  const invalidateTaskQueries = useCallback((category: string) => {
    const targets = TASK_QUERY_TARGETS[category] || ALL_QUERY_TARGETS;

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

        return targets.some(isMatch);
      }
    });
  }, [queryClient]);

  const handleTaskCompleted = useCallback((taskId: string, task: TaskInfo) => {
    const category = getTaskCategory(taskId);
    invalidateTaskQueries(category);

    if (category === 'import') {
      const hasWarning = !!task.error_message;
      showNotification({
        id: taskId,
        title: hasWarning ? 'Import Complete (with warnings)' : 'Batch Import Complete',
        message: hasWarning ? task.error_message! : 'Your background import task has finished successfully.',
        color: hasWarning ? 'orange' : 'green',
        autoClose: hasWarning ? false : CLEANUP_DELAY_MS,
        status: TaskStatus.COMPLETED,
      });
    } else if (category === 'autotag') {
      showNotification({
        id: taskId,
        title: 'AI Auto-Tagging Complete',
        message: 'Successfully generated tags and characters for this set.',
        color: 'green',
        autoClose: CLEANUP_DELAY_MS,
        status: TaskStatus.COMPLETED,
      });
    } else if (category === 'audit') {
      showNotification({
        id: taskId,
        title: 'Audit Complete',
        message: 'Library audit scan finished successfully.',
        color: 'green',
        autoClose: CLEANUP_DELAY_MS,
        status: TaskStatus.COMPLETED,
      });
    } else if (category === 'scan') {
      showNotification({
        id: taskId,
        title: 'Scan Complete',
        message: 'Folder scan finished successfully.',
        color: 'green',
        autoClose: CLEANUP_DELAY_MS,
        status: TaskStatus.COMPLETED,
      });
    }
  }, [invalidateTaskQueries, showNotification]);

  const handleTaskFailed = useCallback((taskId: string, task: TaskInfo) => {
    const category = getTaskCategory(taskId);
    invalidateTaskQueries(category);

    const errorMessage = task.error_message || 'An error occurred during execution.';

    let title = 'Task Failed';
    let messagePrefix = 'Execution failed: ';

    if (category === 'import') {
      title = 'Batch Import Failed';
      messagePrefix = 'Import failed: ';
    } else if (category === 'autotag') {
      title = 'AI Auto-Tagging Failed';
      messagePrefix = 'Auto-tagging failed: ';
    } else if (category === 'audit') {
      title = 'Audit Failed';
      messagePrefix = 'Audit failed: ';
    } else if (category === 'scan') {
      title = 'Scan Failed';
      messagePrefix = 'Scan failed: ';
    }

    showNotification({
      id: taskId,
      title,
      message: `${messagePrefix}${errorMessage}`,
      color: 'red',
      autoClose: false,
      status: TaskStatus.ERROR,
    });
  }, [invalidateTaskQueries, showNotification]);

  return {
    invalidateTaskQueries,
    handleTaskCompleted,
    handleTaskFailed,
  };
}
