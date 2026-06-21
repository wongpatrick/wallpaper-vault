/**
 * @file
 * Main application component.
 * Sets up the router, theme, global state, and background task listeners.
 */
import { createHashRouter, RouterProvider } from 'react-router-dom'
import MainLayout from './components/layout/MainLayout'
import Dashboard from './pages/dashboard/dashboard'
import Creators from './pages/creators/creators'
import CreatorDetail from './pages/creators/CreatorDetail'
import Sets from './pages/sets/sets'
import SetDetail from './pages/sets/SetDetail'
import Images from './pages/images/images'
import TaxonomyManagement from './pages/taxonomy/TaxonomyManagement'
import Tools from './pages/tools/tools'
import Settings from './pages/settings/settings'
import Playlists from './pages/playlists/playlists'
import PlaylistDetail from './pages/playlists/PlaylistDetail'
import { createTheme, MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { ModalsProvider } from '@mantine/modals'
import { QueryClient, QueryClientProvider, MutationCache } from '@tanstack/react-query'
import { NotificationProvider } from './context/NotificationProvider'
import { TaskProvider } from './context/TaskProvider'

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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000, // Keep data fresh for 5 seconds to prevent duplicate fetches on remount/StrictMode
    },
  },
  mutationCache: new MutationCache({
    onSuccess: () => {
      // Globally invalidate all queries on any successful mutation to ensure
      // the UI is always perfectly in sync with the backend. Active queries will automatically refetch.
      queryClient.invalidateQueries();
    },
  }),
});

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
        path: "/playlists",
        element: <Playlists />,
      },
      {
        path: "/playlists/:playlistId",
        element: <PlaylistDetail />,
      },
      {
        path: "/images",
        element: <Images />,
      },
      {
        path: "/taxonomy",
        element: <TaxonomyManagement />,
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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider theme={theme} defaultColorScheme="auto">
        <ModalsProvider>
          <NotificationProvider>
            <Notifications position="top-right" />
            <TaskProvider>
              <RouterProvider router={router} />
            </TaskProvider>
          </NotificationProvider>
        </ModalsProvider>
      </MantineProvider>
    </QueryClientProvider>
  )
}

export default App
