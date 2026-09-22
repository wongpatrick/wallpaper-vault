/**
 * @file
 * Hook for consuming notification action dispatchers without subscribing to history state updates.
 */
import { useContext } from 'react';
import { NotificationActionsContext, type NotificationActionsContextType } from '../context/NotificationActionsContext';

export function useNotificationActions(): NotificationActionsContextType {
  const context = useContext(NotificationActionsContext);
  if (!context) {
    throw new Error('useNotificationActions must be used within a NotificationProvider');
  }
  return context;
}
