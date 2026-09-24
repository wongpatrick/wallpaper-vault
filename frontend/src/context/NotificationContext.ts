/**
 * @file
 * Module: Notification Context (Read State)
 * Description: Manages read-only state of application notifications history and unread count.
 */
import { createContext } from 'react';
import type { ReactNode } from 'react';
import type { NotificationData } from '@mantine/notifications';

export interface NotificationHistoryItem {
  id: string;
  title?: ReactNode;
  message?: ReactNode;
  color?: string;
  timestamp: Date;
  status?: 'completed' | 'error' | 'info' | 'success' | 'warning';
}

export interface NotificationHistoryContextType {
  history: NotificationHistoryItem[];
  unreadCount: number;
}

/**
 * Legacy combined interface for backward compatibility with existing useNotificationHistory consumers.
 */
export interface NotificationContextType extends NotificationHistoryContextType {
  showNotification: (data: NotificationData & { status?: NotificationHistoryItem['status'] }) => string;
  clearHistory: () => void;
  markAllAsRead: () => void;
}

export const NotificationHistoryContext = createContext<NotificationHistoryContextType | undefined>(undefined);

// Export alias for backward compatibility
export const NotificationContext = NotificationHistoryContext;
