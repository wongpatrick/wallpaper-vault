/**
 * @file
 * Tests for useAppNotifications hook and NotificationProvider.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { NotificationProvider } from '../context/NotificationProvider';
import { useAppNotifications } from './useAppNotifications';
import { useNotificationHistory } from './useNotificationHistory';
// eslint-disable-next-line no-restricted-imports
import { notifications } from '@mantine/notifications';

vi.mock('@mantine/notifications', () => ({
  notifications: {
    show: vi.fn(),
  },
}));

function NotificationConsumer() {
  const { showNotification, showSuccess, showError, showWarning, showInfo, clearHistory, markAllAsRead } = useAppNotifications();
  const { history, unreadCount } = useNotificationHistory();

  return (
    <div>
      <div data-testid="unread-count">{unreadCount}</div>
      <div data-testid="history-length">{history.length}</div>
      {history.map((item, idx) => (
        <div key={item.id} data-testid={`history-item-${idx}`}>
          <span data-testid={`item-status-${idx}`}>{item.status}</span>
          <span data-testid={`item-title-${idx}`}>{item.title}</span>
          <span data-testid={`item-message-${idx}`}>{item.message}</span>
        </div>
      ))}
      <button
        data-testid="btn-custom"
        onClick={() => showNotification({ id: 'custom-id', title: 'Custom', message: 'Hello', color: 'blue' })}
      >
        Custom
      </button>
      <button data-testid="btn-success" onClick={() => showSuccess('Saved successfully')}>
        Success
      </button>
      <button data-testid="btn-error" onClick={() => showError('Failed to save')}>
        Error
      </button>
      <button data-testid="btn-warning" onClick={() => showWarning('Take note')}>
        Warning
      </button>
      <button data-testid="btn-info" onClick={() => showInfo('Informational message')}>
        Info
      </button>
      <button data-testid="btn-mark-read" onClick={() => markAllAsRead()}>
        Mark Read
      </button>
      <button data-testid="btn-clear" onClick={() => clearHistory()}>
        Clear
      </button>
    </div>
  );
}

describe('useAppNotifications and NotificationProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records custom notifications to history and calls mantine notifications.show', async () => {
    render(
      <NotificationProvider>
        <NotificationConsumer />
      </NotificationProvider>
    );

    expect(screen.getByTestId('unread-count').textContent).toBe('0');
    expect(screen.getByTestId('history-length').textContent).toBe('0');

    await act(async () => {
      screen.getByTestId('btn-custom').click();
    });

    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'custom-id',
        title: 'Custom',
        message: 'Hello',
        color: 'blue',
      })
    );

    expect(screen.getByTestId('unread-count').textContent).toBe('1');
    expect(screen.getByTestId('history-length').textContent).toBe('1');
    expect(screen.getByTestId('item-status-0').textContent).toBe('info');
    expect(screen.getByTestId('item-title-0').textContent).toBe('Custom');
    expect(screen.getByTestId('item-message-0').textContent).toBe('Hello');
  });

  it('maps colors correctly to status for success, error, warning, and info helpers', async () => {
    render(
      <NotificationProvider>
        <NotificationConsumer />
      </NotificationProvider>
    );

    await act(async () => {
      screen.getByTestId('btn-success').click();
    });
    expect(screen.getByTestId('item-status-0').textContent).toBe('success');

    await act(async () => {
      screen.getByTestId('btn-error').click();
    });
    expect(screen.getByTestId('item-status-0').textContent).toBe('error');

    await act(async () => {
      screen.getByTestId('btn-warning').click();
    });
    expect(screen.getByTestId('item-status-0').textContent).toBe('warning');

    await act(async () => {
      screen.getByTestId('btn-info').click();
    });
    expect(screen.getByTestId('item-status-0').textContent).toBe('info');

    expect(screen.getByTestId('unread-count').textContent).toBe('4');
    expect(screen.getByTestId('history-length').textContent).toBe('4');

    // Mark as read
    await act(async () => {
      screen.getByTestId('btn-mark-read').click();
    });
    expect(screen.getByTestId('unread-count').textContent).toBe('0');
    expect(screen.getByTestId('history-length').textContent).toBe('4');

    // Clear history
    await act(async () => {
      screen.getByTestId('btn-clear').click();
    });
    expect(screen.getByTestId('history-length').textContent).toBe('0');
  });

  it('falls back gracefully to direct notifications.show if used outside Provider', async () => {
    function StandaloneConsumer() {
      const { showNotification } = useAppNotifications();
      return (
        <button
          data-testid="standalone-btn"
          onClick={() => showNotification({ title: 'Standalone', message: 'No provider' })}
        >
          Click
        </button>
      );
    }

    render(<StandaloneConsumer />);

    await act(async () => {
      screen.getByTestId('standalone-btn').click();
    });

    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Standalone',
        message: 'No provider',
      })
    );
  });
});
