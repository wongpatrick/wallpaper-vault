/**
 * @file
 * Module: Notification Actions Context
 * Description: React context for dispatching notifications and managing notification history actions without subscribing to read state.
 */
import { createContext } from 'react';
import type { NotificationData } from '@mantine/notifications';
import type { NotificationHistoryItem } from './NotificationContext';

export interface NotificationActionsContextType {
  showNotification: (data: NotificationData & { status?: NotificationHistoryItem['status'] }) => string;
  clearHistory: () => void;
  markAllAsRead: () => void;
}

export const NotificationActionsContext = createContext<NotificationActionsContextType | undefined>(undefined);
