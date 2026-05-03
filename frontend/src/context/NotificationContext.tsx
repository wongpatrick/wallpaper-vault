import { createContext, useContext, useState, useCallback, ReactNode, useMemo } from 'react';
import { notifications, NotificationData } from '@mantine/notifications';

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

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<NotificationHistoryItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const showNotification = useCallback((data: NotificationData & { status?: NotificationHistoryItem['status'] }) => {
    const id = data.id || Math.random().toString(36).substring(2, 9);
    
    // Show mantine notification (UI Toast)
    notifications.show({ ...data, id });

    // Add to history (State)
    setHistory(prev => {
        const filtered = prev.filter(item => item.id !== id);
        return [
            {
                id,
                title: data.title,
                message: data.message,
                color: data.color,
                timestamp: new Date(),
                status: data.status,
            },
            ...filtered,
        ].slice(0, 50);
    });
    
    setUnreadCount(prev => prev + 1);
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

export function useNotificationHistory() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotificationHistory must be used within a NotificationProvider');
  }
  return context;
}

