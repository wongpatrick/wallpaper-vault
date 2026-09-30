/**
 * @file
 * Application routing configuration using React Router hash router.
 * Encapsulates code-split lazy routes and top-level Suspense fallback.
 */
/* eslint-disable react-refresh/only-export-components */
import { lazy, Suspense } from 'react';
import { createHashRouter } from 'react-router-dom';
import { Center, Loader } from '@mantine/core';
import MainLayout from './components/layout/MainLayout';

const Dashboard = lazy(() => import('./pages/dashboard/dashboard'));
const Creators = lazy(() => import('./pages/creators/creators'));
const CreatorDetail = lazy(() => import('./pages/creators/CreatorDetail'));
const Sets = lazy(() => import('./pages/sets/sets'));
const SetDetail = lazy(() => import('./pages/sets/SetDetail'));
const Images = lazy(() => import('./pages/images/images'));
const TaxonomyManagement = lazy(() => import('./pages/taxonomy/TaxonomyManagement'));
const Tools = lazy(() => import('./pages/tools/tools'));
const Settings = lazy(() => import('./pages/settings/settings'));
const Playlists = lazy(() => import('./pages/playlists/playlists'));
const PlaylistDetail = lazy(() => import('./pages/playlists/PlaylistDetail'));
const RotationManagement = lazy(() => import('./pages/rotation/rotation'));

export const router = createHashRouter([
  {
    element: (
      <Suspense fallback={<Center style={{ height: '100vh' }}><Loader size="xl" /></Center>}>
        <MainLayout />
      </Suspense>
    ),
    children: [
      {
        path: '/',
        element: <Dashboard />,
      },
      {
        path: '/creators',
        element: <Creators />,
      },
      {
        path: '/creators/:creatorId',
        element: <CreatorDetail />,
      },
      {
        path: '/sets',
        element: <Sets />,
      },
      {
        path: '/sets/:setId',
        element: <SetDetail />,
      },
      {
        path: '/playlists',
        element: <Playlists />,
      },
      {
        path: '/playlists/:playlistId',
        element: <PlaylistDetail />,
      },
      {
        path: '/images',
        element: <Images />,
      },
      {
        path: '/taxonomy',
        element: <TaxonomyManagement />,
      },
      {
        path: '/tools',
        element: <Tools />,
      },
      {
        path: '/settings',
        element: <Settings />,
      },
      {
        path: '/rotation',
        element: <RotationManagement />,
      },
    ],
  },
]);
