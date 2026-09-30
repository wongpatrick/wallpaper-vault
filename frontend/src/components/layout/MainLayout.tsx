/**
 * @file
 * Main application layout component.
 * Provides the application shell, including the header, sidebar, and notification center.
 */
import { useState, Suspense } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import {
  AppShell,
  Title,
  Box,
  Group,
  Divider,
  Burger,
  Center,
  Loader,
  Text,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconPackage, IconCloudUpload } from '@tabler/icons-react';
import SideNav from './SideNav';
import TitleBarControls from './TitleBarControls';
import GlobalSearch from './GlobalSearch';
import { VaultSwitcher } from './VaultSwitcher';
import { NotificationCenter } from './NotificationCenter';
import { GlobalTaskOverlays } from './GlobalTaskOverlays';
import { MetadataFormModal } from '../import/MetadataFormModal';
import { DemoBanner } from '../ui/DemoBanner';
import { useSidebarResizer } from '../../hooks/useSidebarResizer';
import { useFileDropScanner } from '../../hooks/useFileDropScanner';
import { IS_DEMO_MODE } from '../../config';
import classes from './Layout.module.css';

const HEADER_HEIGHT_DEFAULT_PX = 56;
const DEMO_BANNER_HEIGHT_PX = 32;

/**
 * Root layout structure rendering header navigation, resizable sidebar, and routed content outlet.
 */
export default function MainLayout() {
  const { setId } = useParams();
  const { width, isResizing, startResizing, isCollapsed } = useSidebarResizer();
  const [mobileOpened, { toggle: toggleMobile }] = useDisclosure();
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const isBannerVisible = IS_DEMO_MODE && !bannerDismissed;
  const headerHeight = isBannerVisible
    ? HEADER_HEIGHT_DEFAULT_PX + DEMO_BANNER_HEIGHT_PX
    : HEADER_HEIGHT_DEFAULT_PX;

  const { isDragging, importModalProps } = useFileDropScanner();

  return (
    <div style={{ minHeight: '100vh', position: 'relative' }}>
      <AppShell
        layout="alt"
        header={{ height: headerHeight }}
        navbar={{
          width: { base: width },
          breakpoint: 'sm',
          collapsed: { mobile: !mobileOpened },
        }}
        padding="md"
      >
        <AppShell.Header className={classes.header} style={{ display: 'flex', flexDirection: 'column' }}>
          <DemoBanner onDismiss={() => setBannerDismissed(true)} />
          <Group h={HEADER_HEIGHT_DEFAULT_PX} px="md" justify="space-between" wrap="nowrap" style={{ flex: 1 }}>
            <Group style={{ flex: 1, maxWidth: 650 }} wrap="nowrap" gap="sm">
              <Burger
                opened={mobileOpened}
                onClick={toggleMobile}
                hiddenFrom="sm"
                size="sm"
                className={classes.noDrag}
              />
              <Box className={classes.noDrag} style={{ flex: 1, maxWidth: 320 }}>
                <GlobalSearch />
              </Box>
              <Box className={classes.noDrag}>
                <VaultSwitcher />
              </Box>
            </Group>

            <Group gap="sm" className={classes.noDrag} wrap="nowrap">
              <NotificationCenter />

              {window.electron && window.electron.platform === 'win32' && (
                <Divider orientation="vertical" h={24} my="auto" />
              )}

              <TitleBarControls />
            </Group>
          </Group>
        </AppShell.Header>

        <AppShell.Navbar
          p="md"
          className={isResizing ? classes.navbarResizing : ''}
          style={{ transition: isResizing ? 'none' : undefined }}
        >
          <Box
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: isCollapsed ? 0 : '12px',
              justifyContent: isCollapsed ? 'center' : 'flex-start',
              marginBottom: 'var(--mantine-spacing-xl)',
              height: 44,
              transition: 'all 0.2s ease',
            }}
          >
            <IconPackage size={28} style={{ minWidth: 28 }} color="var(--mantine-color-blue-6)" />
            <Title
              order={3}
              className={`${classes.appTitle} ${isCollapsed ? classes.appTitleCollapsed : ''}`}
            >
              Wallpaper Vault
            </Title>
          </Box>

          <SideNav collapsed={isCollapsed} />

          <div
            className={`${classes.resizer} ${isResizing ? classes.resizing : ''}`}
            onMouseDown={startResizing}
          />
        </AppShell.Navbar>

        <AppShell.Main>
          <Suspense
            fallback={(
              <Center style={{ height: 'calc(100vh - 120px)' }}>
                <Loader size="lg" />
              </Center>
            )}
          >
            <Outlet />
          </Suspense>
          <GlobalTaskOverlays />
        </AppShell.Main>
      </AppShell>

      {isDragging && (
        <div className={`${classes.dragOverlay} ${classes.dragOverlayActive}`}>
          <div className={classes.dragOverlayContent}>
            <IconCloudUpload size={80} stroke={1.5} color="var(--mantine-color-blue-5)" />
            <Title order={2}>Drop images or folders here</Title>
            <Text size="sm" c="dimmed">
              Import them directly into the wallpaper vault
            </Text>
          </div>
        </div>
      )}

      <MetadataFormModal
        {...importModalProps}
        preselectedSetId={setId}
      />
    </div>
  );
}
