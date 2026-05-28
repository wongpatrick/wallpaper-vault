/**
 * @file
 * Main application component.
 * Sets up the router, theme, global state, and background task listeners.
 */
import { useEffect, useState } from 'react'
import { createHashRouter, RouterProvider } from 'react-router-dom'
import MainLayout from './components/layout/MainLayout'
import Dashboard from './pages/dashboard/dashboard'
import Creators from './pages/creators/creators'
import CreatorDetail from './pages/creators/CreatorDetail'
import Sets from './pages/sets/sets'
import SetDetail from './pages/sets/SetDetail'
import Images from './pages/images/images'
import Tools from './pages/tools/tools'
import Settings from './pages/settings/settings'
import { createTheme, MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { ModalsProvider } from '@mantine/modals'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NotificationProvider } from './context/NotificationProvider'
import { useNotificationHistory } from './hooks/useNotificationHistory'
import { TaskStatus } from './types/enums'

import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'

const theme = createTheme({
  primaryColor: 'blue',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  defaultRadius: 'md',
    colors: {
     'ocean': ['#E3F2FD', '#BBDEFB', '#90CAF9', '#64B5F6', '#42A5F5', '#2196F3', '#1E88E5', '#1976D2', '#1565C0',
      '#0D47A1'],
    },
    components: {
       Container: {
         defaultProps: {
           size: 'xl',
         },
       },
       Title: {
         styles: {
           root: { 
             color: 'light-dark(var(--mantine-color-black), var(--mantine-color-white))', 
             letterSpacing: '-0.5px' 
           },
         },
       },
     },
});

const queryClient = new QueryClient();

const router = createHashRouter([
  {
    element: <MainLayout />,
    children: [
      {
        path: "/",
        element: <Dashboard />,
      },
      {
        path: "/creators",
        element: <Creators />,
      },
      {
        path: "/creators/:creatorId",
        element: <CreatorDetail />,
      },
      {
        path: "/sets",
        element: <Sets />,
      },
      {
        path: "/sets/:setId",
        element: <SetDetail />,
      },
      {
        path: "/images",
        element: <Images />,
      },
      {
        path: "/tools",
        element: <Tools />,
      },
      {
        path: "/settings",
        element: <Settings />,
      },
    ],
  },
]);

function GlobalTasks() {
  const [isTaskRunning, setIsTaskRunning] = useState(false);
  const { showNotification } = useNotificationHistory();

  useEffect(() => {
    // Note: In a real production app, this URL should be configurable
    const eventSource = new EventSource('http://localhost:8000/api/sets/events');

    eventSource.onmessage = (event) => {
      try {
        const tasks: Record<string, {
            status: string;
            progress: number;
            total: number;
            error_message?: string;
        }> = JSON.parse(event.data);
        const taskList = Object.values(tasks);
        
        const hasActive = taskList.some(t => t.status === TaskStatus.PROCESSING || t.status === TaskStatus.ACCEPTED);
        setIsTaskRunning(hasActive);

        Object.entries(tasks).forEach(([tid, tinfo]) => {
          if (tinfo.status === TaskStatus.COMPLETED) {
            showNotification({
              id: tid, // Use tid to prevent duplicate notifications for the same task
              title: 'Batch Import Complete',
              message: 'Your background import task has finished successfully.',
              color: 'green',
              autoClose: 5000,
              status: TaskStatus.COMPLETED,
            });
          } else if (tinfo.status === TaskStatus.ERROR) {
            showNotification({
              id: tid,
              title: 'Batch Import Failed',
              message: 'An error occurred during the background import process.',
              color: 'red',
              autoClose: false,
              status: TaskStatus.ERROR,
            });
          }
        });
      } catch (err) {
        console.error('Error parsing SSE data:', err);
      }
    };

    return () => {
      eventSource.close();
    };
  }, [showNotification]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isTaskRunning) {
        e.preventDefault();
        e.returnValue = 'A batch import is currently running. Closing the app will interrupt the process.';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isTaskRunning]);

  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider theme={theme} defaultColorScheme="auto">
        <ModalsProvider>
          <NotificationProvider>
            <Notifications position="top-right" />
            <GlobalTasks />
            <RouterProvider router={router} />
          </NotificationProvider>
        </ModalsProvider>
      </MantineProvider>
    </QueryClientProvider>
  )
}

export default App
