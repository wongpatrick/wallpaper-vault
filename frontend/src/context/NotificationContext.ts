/**
 * @file
 * Module: Notification Context
 * Description: Manages the state and history of application notifications, integrating with Mantine's toast system to provide persistent notification records.
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

interface NotificationContextType {
  history: NotificationHistoryItem[];
  showNotification: (data: NotificationData & { status?: NotificationHistoryItem['status'] }) => void;
  clearHistory: () => void;
  markAllAsRead: () => void;
  unreadCount: number;
}

export const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

