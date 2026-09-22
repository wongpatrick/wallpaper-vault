/**
 * @file
 * Hook for dispatching notifications and managing notification actions.
 * Facade hook wrapping Mantine's notifications.show with history recording.
 */
import { useContext, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { NotificationActionsContext } from '../context/NotificationActionsContext';
// eslint-disable-next-line no-restricted-imports
import { notifications } from '@mantine/notifications';
import type { NotificationData } from '@mantine/notifications';
import type { NotificationHistoryItem } from '../context/NotificationContext';
import { generateNotificationId } from '../utils/notificationUtils';

export function useAppNotifications() {
  const context = useContext(NotificationActionsContext);

  const showNotification = useCallback((data: NotificationData & { status?: NotificationHistoryItem['status'] }): string => {
    if (context) {
      return context.showNotification(data);
    }
    // Safe fallback if called outside NotificationProvider (e.g., isolated component test)
    const id = data.id || generateNotificationId();
    notifications.show({ ...data, id });
    return id;
  }, [context]);

  const clearHistory = useCallback(() => {
    context?.clearHistory();
  }, [context]);

  const markAllAsRead = useCallback(() => {
    context?.markAllAsRead();
  }, [context]);

  const showSuccess = useCallback((message: ReactNode, title: ReactNode = 'Success') => {
    return showNotification({
      title,
      message,
      color: 'green',
      status: 'success',
    });
  }, [showNotification]);

  const showError = useCallback((message: ReactNode, title: ReactNode = 'Error') => {
    return showNotification({
      title,
      message,
      color: 'red',
      status: 'error',
    });
  }, [showNotification]);

  const showWarning = useCallback((message: ReactNode, title: ReactNode = 'Warning') => {
    return showNotification({
      title,
      message,
      color: 'orange',
      status: 'warning',
    });
  }, [showNotification]);

  const showInfo = useCallback((message: ReactNode, title?: ReactNode) => {
    return showNotification({
      title,
      message,
      color: 'blue',
      status: 'info',
    });
  }, [showNotification]);

  return useMemo(() => ({
    showNotification,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    clearHistory,
    markAllAsRead,
  }), [showNotification, showSuccess, showError, showWarning, showInfo, clearHistory, markAllAsRead]);
}
