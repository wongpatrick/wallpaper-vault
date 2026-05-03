import { useEffect, useState } from 'react'
import { createHashRouter, RouterProvider, Navigate } from 'react-router-dom'
import MainLayout from './components/layout/MainLayout'
import Dashboard from './pages/dashboard/dashboard'
import Creators from './pages/creators/creators'
import Tools from './pages/tools/tools'
import Settings from './pages/settings/settings'
import { createTheme, MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NotificationProvider, useNotificationHistory } from './context/NotificationContext'

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
        path: "/sets",
        element: <Navigate to="/" replace />,
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
        const tasks = JSON.parse(event.data);
        const taskList = Object.values(tasks) as any[];
        
        const hasActive = taskList.some(t => t.status === 'processing' || t.status === 'accepted');
        setIsTaskRunning(hasActive);

        Object.entries(tasks).forEach(([tid, tinfo]: [string, any]) => {
          if (tinfo.status === 'completed') {
            showNotification({
              id: tid, // Use tid to prevent duplicate notifications for the same task
              title: 'Batch Import Complete',
              message: 'Your background import task has finished successfully.',
              color: 'green',
              autoClose: 5000,
              status: 'completed',
            });
          } else if (tinfo.status === 'error') {
            showNotification({
              id: tid,
              title: 'Batch Import Failed',
              message: 'An error occurred during the background import process.',
              color: 'red',
              autoClose: false,
              status: 'error',
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
        <NotificationProvider>
          <Notifications position="top-right" />
          <GlobalTasks />
          <RouterProvider router={router} />
        </NotificationProvider>
      </MantineProvider>
    </QueryClientProvider>
  )
}

export default App

