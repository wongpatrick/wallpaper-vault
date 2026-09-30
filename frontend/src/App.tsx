/**
 * @file
 * Main application root component.
 * Sets up global providers and router.
 */
import { RouterProvider } from 'react-router-dom';
import { AppProviders } from './AppProviders';
import { router } from './router';

/**
 * Root application component mounting providers and router.
 */
export default function App() {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
