/**
 * @file
 * Hook for accessing the notification history context and actions.
 * Provides backward compatibility for components expecting both history and actions.
 */
import { useContext, useMemo } from 'react';
import { NotificationHistoryContext } from '../context/NotificationContext';
import { NotificationActionsContext } from '../context/NotificationActionsContext';

export function useNotificationHistory() {
  const historyContext = useContext(NotificationHistoryContext);
  const actionsContext = useContext(NotificationActionsContext);

  if (!historyContext || !actionsContext) {
    throw new Error('useNotificationHistory must be used within a NotificationProvider');
  }

  return useMemo(() => ({
    history: historyContext.history,
    unreadCount: historyContext.unreadCount,
    showNotification: actionsContext.showNotification,
    clearHistory: actionsContext.clearHistory,
    markAllAsRead: actionsContext.markAllAsRead,
  }), [historyContext, actionsContext]);
}
