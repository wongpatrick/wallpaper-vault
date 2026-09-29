/**
 * @file
 * Global Mantine theme configuration.
 */
import { createTheme } from '@mantine/core';

export const theme = createTheme({
  primaryColor: 'blue',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  defaultRadius: 'md',
  colors: {
    ocean: [
      '#E3F2FD',
      '#BBDEFB',
      '#90CAF9',
      '#64B5F6',
      '#42A5F5',
      '#2196F3',
      '#1E88E5',
      '#1976D2',
      '#1565C0',
      '#0D47A1',
    ],
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
          letterSpacing: '-0.5px',
        },
      },
    },
    AppShell: {
      styles: {
        header: {
          backgroundColor: 'light-dark(var(--mantine-color-white), var(--mantine-color-dark-7))',
          borderBottom: '1px solid light-dark(var(--mantine-color-gray-4), var(--mantine-color-dark-3))',
        },
        navbar: {
          backgroundColor: 'light-dark(var(--mantine-color-white), var(--mantine-color-dark-7))',
          borderRight: '1px solid light-dark(var(--mantine-color-gray-4), var(--mantine-color-dark-3))',
          transition: 'width 0.2s ease',
        },
        main: {
          backgroundColor: 'light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-8))',
          minHeight: '100vh',
        },
      },
    },
  },
});
