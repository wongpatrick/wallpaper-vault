/**
 * @file
 * Notification Provider component.
 * Manages notification history and actions without monkey-patching globals.
 */
import { useState, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
// eslint-disable-next-line no-restricted-imports
import { notifications } from '@mantine/notifications';
import type { NotificationData } from '@mantine/notifications';
import { NotificationHistoryContext } from './NotificationContext';
import { NotificationActionsContext } from './NotificationActionsContext';
import type { NotificationHistoryItem } from './NotificationContext';
import { generateNotificationId } from '../utils/notificationUtils';

const MAX_HISTORY_LENGTH = 50;

function computeStatus(data: NotificationData & { status?: NotificationHistoryItem['status'] }): NotificationHistoryItem['status'] {
  if (data.status) return data.status;
  if (data.color === 'red') return 'error';
  if (data.color === 'green') return 'success';
  if (data.color === 'orange' || data.color === 'yellow') return 'warning';
  return 'info';
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<NotificationHistoryItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const showNotification = useCallback((data: NotificationData & { status?: NotificationHistoryItem['status'] }) => {
    const id = data.id || generateNotificationId();
    
    // Call Mantine directly
    notifications.show({ ...data, id });

    // Record in history
    setHistory(prev => {
      const filtered = prev.filter(item => item.id !== id);
      const computed = computeStatus(data);
      return [
        {
          id,
          title: data.title,
          message: data.message,
          color: data.color,
          timestamp: new Date(),
          status: computed,
        },
        ...filtered,
      ].slice(0, MAX_HISTORY_LENGTH);
    });

    setUnreadCount(prev => Math.min(prev + 1, MAX_HISTORY_LENGTH));

    return id;
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    setUnreadCount(0);
  }, []);

  const markAllAsRead = useCallback(() => {
    setUnreadCount(0);
  }, []);

  const historyValue = useMemo(() => ({
    history,
    unreadCount,
  }), [history, unreadCount]);

  const actionsValue = useMemo(() => ({
    showNotification,
    clearHistory,
    markAllAsRead,
  }), [showNotification, clearHistory, markAllAsRead]);

  return (
    <NotificationActionsContext.Provider value={actionsValue}>
      <NotificationHistoryContext.Provider value={historyValue}>
        {children}
      </NotificationHistoryContext.Provider>
    </NotificationActionsContext.Provider>
  );
}
