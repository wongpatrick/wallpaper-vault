/* eslint-disable no-magic-numbers */
/**
 * @file
 * Module: Desktop Rotation Manager Page
 * Description: Control center for desktop wallpaper rotation settings, active wallpaper monitoring, quick actions (favorite/blacklist), history, and native/DisplayFusion options with multi-monitor override support.
 */
import { useState } from 'react';
import { Container, SimpleGrid, Group, Stack, Title, Button } from '@mantine/core';
import { useMonitors } from './hooks/useMonitors';
import { useActiveWallpaper } from './hooks/useActiveWallpaper';
import { useRotationConfig } from './hooks/useRotationConfig';
import { RotationHeader } from './components/RotationHeader';
import { ActiveWallpaperPreview } from './components/ActiveWallpaperPreview';
import { MonitorGrid } from './components/MonitorGrid';
import { GlobalConfigForm } from './components/GlobalConfigForm';

export default function RotationManagement() {
    const { monitors } = useMonitors();

    // Active configuration tab & monitor preview focus
    const [activeConfigTab, setActiveConfigTab] = useState<string>('global');
    const [activeMonitorPreview, setActiveMonitorPreview] = useState<string>('all');

    const activeWpHook = useActiveWallpaper(monitors, activeMonitorPreview);
    const configHook = useRotationConfig(monitors);

    return (
        <Container size="xl" py="md">
            <Stack gap="xl">
                <RotationHeader 
                    paused={configHook.globalConfig.paused}
                    onTogglePause={configHook.handleTogglePause}
                />

                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
                    {/* LEFT COLUMN: Active wallpaper display & History */}
                    <Stack gap="md">
                        <Group justify="space-between" align="center">
                            <Title order={3}>Active Wallpaper</Title>
                            {monitors.length > 0 && (
                                <Button 
                                    size="xs" 
                                    variant={activeMonitorPreview === 'all' ? 'filled' : 'light'} 
                                    color="blue"
                                    onClick={() => setActiveMonitorPreview('all')}
                                >
                                    Global View
                                </Button>
                            )}
                        </Group>

                        {/* Monitor Layout Map */}
                        <MonitorGrid 
                            monitors={monitors}
                            monitorConfigs={configHook.monitorConfigs}
                            activeMonitorPreview={activeMonitorPreview}
                            setActiveMonitorPreview={setActiveMonitorPreview}
                            systemWallpapers={activeWpHook.systemWallpapers}
                            activeWallpapers={activeWpHook.activeWallpapers}
                            currentMonitors={activeWpHook.currentMonitors}
                            dbSettings={configHook.dbSettings}
                            currentImage={activeWpHook.currentImage}
                            resolveImageFromPath={activeWpHook.resolveImageFromPath}
                        />
                        
                        <ActiveWallpaperPreview 
                            currentLoading={activeWpHook.currentLoading}
                            focusedImage={activeWpHook.focusedImage}
                            activeWallpaper={activeWpHook.activeWallpaper}
                            activeMonitorPreview={activeMonitorPreview}
                            skipPending={false}
                            onToggleFavorite={activeWpHook.handleToggleFavorite}
                            onBlacklist={activeWpHook.handleBlacklist}
                            onSkip={activeWpHook.handleSkip}
                            historyLoading={activeWpHook.historyLoading}
                            historyList={activeWpHook.historyList}
                            selectedImageId={activeWpHook.selectedImageId}
                            onSelectImageId={activeWpHook.setSelectedImageId}
                        />
                    </Stack>

                    {/* RIGHT COLUMN: Configuration overrides panel */}
                    <Stack gap="md">
                        <Title order={3}>Configuration Profiles</Title>
                        <GlobalConfigForm 
                            monitors={monitors}
                            profiles={configHook.profiles}
                            selectedProfileId={configHook.selectedProfileId}
                            setSelectedProfileId={configHook.setSelectedProfileId}
                            saveModalOpen={configHook.saveModalOpen}
                            setSaveModalOpen={configHook.setSaveModalOpen}
                            newProfileName={configHook.newProfileName}
                            setNewProfileName={configHook.setNewProfileName}
                            savingProfile={configHook.savingProfile}
                            applyingProfile={configHook.applyingProfile}
                            deletingProfile={configHook.deletingProfile}
                            handleSaveProfile={configHook.handleSaveProfile}
                            handleApplyProfile={configHook.handleApplyProfile}
                            handleDeleteProfile={configHook.handleDeleteProfile}
                            activeConfigTab={activeConfigTab}
                            setActiveConfigTab={setActiveConfigTab}
                            globalConfig={configHook.globalConfig}
                            setGlobalConfig={configHook.setGlobalConfig}
                            monitorConfigs={configHook.monitorConfigs}
                            setMonitorConfigs={configHook.setMonitorConfigs}
                            playlists={configHook.playlists}
                            saving={configHook.saving}
                            handleSaveSettings={configHook.handleSaveSettings}
                        />
                    </Stack>
                </SimpleGrid>
            </Stack>
        </Container>
    );
}
