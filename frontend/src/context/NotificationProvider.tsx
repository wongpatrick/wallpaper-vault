/**
 * @file
 * Notification Provider component.
 */
import { useState, useCallback, useMemo, useEffect } from 'react';
import type { ReactNode } from 'react';
import { notifications } from '@mantine/notifications';
import type { NotificationData } from '@mantine/notifications';
import { NotificationContext } from './NotificationContext';
import type { NotificationHistoryItem } from './NotificationContext';

const BASE_36 = 36;
const ID_START_INDEX = 2;
const ID_END_INDEX = 9;
const MAX_HISTORY_LENGTH = 50;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<NotificationHistoryItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const showNotification = useCallback((data: NotificationData & { status?: NotificationHistoryItem['status'] }) => {
    // Calling notifications.show will trigger the monkey-patched version below
    notifications.show(data);
  }, []);

  // Sync all notifications.show calls (including direct @mantine/notifications usage) into Notification Center history
  useEffect(() => {
    const originalShow = notifications.show;
    notifications.show = (data: NotificationData & { status?: NotificationHistoryItem['status'] }) => {
      const id = data.id || Math.random().toString(BASE_36).substring(ID_START_INDEX, ID_END_INDEX);
      const res = originalShow({ ...data, id });

      setHistory(prev => {
        const filtered = prev.filter(item => item.id !== id);
        let computedStatus = data.status;
        if (!computedStatus) {
          if (data.color === 'red') computedStatus = 'error';
          else if (data.color === 'green') computedStatus = 'success';
          else if (data.color === 'orange' || data.color === 'yellow') computedStatus = 'warning';
          else computedStatus = 'info';
        }
        return [
          {
            id,
            title: data.title,
            message: data.message,
            color: data.color,
            timestamp: new Date(),
            status: computedStatus,
          },
          ...filtered,
        ].slice(0, MAX_HISTORY_LENGTH);
      });

      setUnreadCount(prev => prev + 1);

      return res;
    };

    return () => {
      notifications.show = originalShow;
    };
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    setUnreadCount(0);
  }, []);

  const markAllAsRead = useCallback(() => {
    setUnreadCount(0);
  }, []);

  // Memoize value to prevent unnecessary re-renders of consumers
  const value = useMemo(() => ({
    history,
    showNotification,
    clearHistory,
    markAllAsRead,
    unreadCount
  }), [history, showNotification, clearHistory, markAllAsRead, unreadCount]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}
