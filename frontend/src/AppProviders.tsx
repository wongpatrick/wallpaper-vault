/**
 * @file
 * Composed application provider hierarchy.
 * Flattens QueryClient, Mantine, Modals, Notifications, Vault, and Task providers.
 */
import React, { useState } from 'react';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { ModalsProvider } from '@mantine/modals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationProvider } from './context/NotificationProvider';
import { VaultProvider } from './context/VaultProvider';
import { TaskProvider } from './context/TaskProvider';
import BackendStatusGuard from './components/ui/BackendStatusGuard';
import ApiKeyModal from './components/ui/ApiKeyModal';
import { isElectron } from './config';
import { theme } from './theme';

import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';

/**
 * Creates the default QueryClient instance configured for Wallpaper Vault.
 */
function createDefaultQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        refetchOnWindowFocus: !isElectron,
      },
    },
  });
}

export interface AppProvidersProps {
  children: React.ReactNode;
  queryClient?: QueryClient;
}

/**
 * Wraps children with all global application state and styling providers.
 */
export function AppProviders({ children, queryClient: externalQueryClient }: AppProvidersProps) {
  const [defaultQueryClient] = useState(() => createDefaultQueryClient());
  const client = externalQueryClient ?? defaultQueryClient;

  return (
    <QueryClientProvider client={client}>
      <MantineProvider theme={theme} defaultColorScheme="auto">
        <ModalsProvider>
          <NotificationProvider>
            <Notifications position="top-right" />
            <ApiKeyModal />
            <VaultProvider>
              <TaskProvider>
                <BackendStatusGuard>
                  {children}
                </BackendStatusGuard>
              </TaskProvider>
            </VaultProvider>
          </NotificationProvider>
        </ModalsProvider>
      </MantineProvider>
    </QueryClientProvider>
  );
}
