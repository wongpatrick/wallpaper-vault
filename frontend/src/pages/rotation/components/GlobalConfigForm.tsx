/**
 * @file Global rotation configuration form component.
 */
/* eslint-disable no-magic-numbers */
import { useMemo } from 'react';
import {
    Paper, Select, ActionIcon, Group, Button, Modal, TextInput, Stack, Tabs, Switch,
    Box, Text, Badge, Slider, NumberInput, Alert
} from '@mantine/core';
import {
    IconDeviceFloppy, IconTrash, IconSettings, IconClock, IconDeviceDesktop, IconInfoCircle
} from '@tabler/icons-react';
import { RotationRulesManager } from '../../../components/RotationRulesManager';
import type { MonitorInfo } from '../hooks/useMonitors';
import type { ConfigState } from '../hooks/useRotationConfig';

interface GlobalConfigFormProps {
    monitors: MonitorInfo[];
    profiles: Array<{ id: number; name: string }> | undefined;
    selectedProfileId: string | null;
    setSelectedProfileId: (id: string | null) => void;
    saveModalOpen: boolean;
    setSaveModalOpen: (open: boolean) => void;
    newProfileName: string;
    setNewProfileName: (name: string) => void;
    savingProfile: boolean;
    applyingProfile: boolean;
    deletingProfile: boolean;
    handleSaveProfile: () => void;
    handleApplyProfile: () => void;
    handleDeleteProfile: () => void;
    activeConfigTab: string;
    setActiveConfigTab: (tab: string) => void;
    globalConfig: ConfigState;
    setGlobalConfig: React.Dispatch<React.SetStateAction<ConfigState>>;
    monitorConfigs: Record<string, ConfigState>;
    setMonitorConfigs: React.Dispatch<React.SetStateAction<Record<string, ConfigState>>>;
    playlists: Array<{ id: number; name: string }> | undefined;
    saving: boolean;
    handleSaveSettings: () => void;
}

export function GlobalConfigForm({
    monitors,
    profiles,
    selectedProfileId,
    setSelectedProfileId,
    saveModalOpen,
    setSaveModalOpen,
    newProfileName,
    setNewProfileName,
    savingProfile,
    applyingProfile,
    deletingProfile,
    handleSaveProfile,
    handleApplyProfile,
    handleDeleteProfile,
    activeConfigTab,
    setActiveConfigTab,
    globalConfig,
    setGlobalConfig,
    monitorConfigs,
    setMonitorConfigs,
    playlists,
    saving,
    handleSaveSettings,
}: GlobalConfigFormProps) {
    const playlistData = useMemo(() => {
        return playlists?.map(p => ({ value: String(p.id), label: p.name })) || [];
    }, [playlists]);

    const activeTabConfig = useMemo((): ConfigState => {
        if (activeConfigTab === 'global') return globalConfig;
        return monitorConfigs[activeConfigTab] || {
            mode: 'displayfusion',
            interval: 15,
            favProb: 40,
            source: 'entire_library',
            playlistId: '',
            style: 'fill',
            overrideEnabled: false
        };
    }, [activeConfigTab, globalConfig, monitorConfigs]);

    const updateActiveTabConfig = (updates: Partial<ConfigState>) => {
        if (activeConfigTab === 'global') {
            setGlobalConfig(prev => ({ ...prev, ...updates }));
        } else {
            setMonitorConfigs(prev => ({
                ...prev,
                [activeConfigTab]: {
                    ...prev[activeConfigTab],
                    ...updates
                }
            }));
        }
    };

    return (
        <Stack gap="md">
            <Paper withBorder p="md" radius="md">
                <Stack gap="sm">
                    <Select
                        label="Saved Profiles"
                        placeholder={profiles && profiles.length > 0 ? "Select a profile..." : "No profiles saved yet"}
                        data={profiles?.map(p => ({ value: String(p.id), label: p.name })) || []}
                        value={selectedProfileId}
                        onChange={setSelectedProfileId}
                        disabled={!profiles || profiles.length === 0}
                    />
                    <Group grow gap="xs">
                        <Button
                            variant="filled"
                            color="green"
                            leftSection={<IconDeviceFloppy size="1rem" />}
                            onClick={() => setSaveModalOpen(true)}
                        >
                            Save Current Settings
                        </Button>
                        <Button
                            variant="light"
                            color="blue"
                            disabled={!selectedProfileId}
                            loading={applyingProfile}
                            onClick={handleApplyProfile}
                        >
                            Apply Profile
                        </Button>
                        <ActionIcon
                            variant="light"
                            color="red"
                            size="lg"
                            disabled={!selectedProfileId}
                            loading={deletingProfile}
                            onClick={handleDeleteProfile}
                            title="Delete Profile"
                        >
                            <IconTrash size="1.2rem" />
                        </ActionIcon>
                    </Group>
                </Stack>
            </Paper>

            <Modal
                opened={saveModalOpen}
                onClose={() => {
                    setSaveModalOpen(false);
                    setNewProfileName('');
                }}
                title="Save Settings Profile"
                centered
            >
                <Stack gap="md">
                    <TextInput
                        label="Profile Name"
                        placeholder="e.g. Gaming Mode, Work Mode"
                        value={newProfileName}
                        onChange={(e) => setNewProfileName(e.currentTarget.value)}
                        required
                        data-autofocus
                    />
                    <Group justify="flex-end" gap="xs">
                        <Button variant="subtle" onClick={() => setSaveModalOpen(false)}>Cancel</Button>
                        <Button color="blue" onClick={handleSaveProfile} loading={savingProfile}>Save Profile</Button>
                    </Group>
                </Stack>
            </Modal>

            <Paper withBorder p="md" radius="md">
                <Tabs value={activeConfigTab} onChange={(val) => setActiveConfigTab(val || 'global')}>
                    <Tabs.List mb="md">
                        <Tabs.Tab value="global" leftSection={<IconSettings size="0.8rem" />}>Global</Tabs.Tab>
                        <Tabs.Tab value="rules" leftSection={<IconClock size="0.8rem" />}>Scheduled Rules</Tabs.Tab>
                        {monitors.map(m => (
                            <Tabs.Tab key={m.index} value={String(m.index)} leftSection={<IconDeviceDesktop size="0.8rem" />}>
                                Monitor {m.winNum || (m.index + 1)}
                            </Tabs.Tab>
                        ))}
                    </Tabs.List>

                    {activeConfigTab !== 'global' && activeConfigTab !== 'rules' && (
                        <Switch
                            label={`Override global rotation rules for Monitor ${(() => {
                                const activeMon = monitors.find(mon => String(mon.index) === activeConfigTab);
                                return activeMon?.winNum || (Number(activeConfigTab) + 1);
                            })()}`}
                            checked={!!activeTabConfig.overrideEnabled}
                            onChange={(event) => updateActiveTabConfig({ overrideEnabled: event.currentTarget.checked })}
                            mb="md"
                        />
                    )}

                    {activeConfigTab === 'rules' ? (
                        <RotationRulesManager />
                    ) : (
                        <Stack gap="md" style={{ opacity: activeConfigTab === 'global' || activeTabConfig.overrideEnabled ? 1 : 0.5, pointerEvents: activeConfigTab === 'global' || activeTabConfig.overrideEnabled ? 'all' : 'none' }}>
                            <Select 
                                label="Rotation Mode"
                                description="Coordinate with DisplayFusion or update Windows backgrounds natively."
                                data={[
                                    { value: 'displayfusion', label: 'DisplayFusion CLI Integration' },
                                    { value: 'native', label: 'Native Windows Changer' }
                                ]}
                                value={activeTabConfig.mode}
                                onChange={(val) => { if (val) updateActiveTabConfig({ mode: val as 'displayfusion' | 'native' }); }}
                            />

                            {activeTabConfig.mode === 'native' && (
                                <Select 
                                    label="Wallpaper Sizing & Style"
                                    description={activeConfigTab === 'global' 
                                        ? "How native rotation sizes the wallpapers on the screen."
                                        : "Windows natively forces a global wallpaper style. Change this on the Global tab."}
                                    disabled={activeConfigTab !== 'global'}
                                    data={[
                                        { value: 'fill', label: 'Fill / Crop to aspect ratio' },
                                        { value: 'fit', label: 'Fit / Show entire image with borders' },
                                        { value: 'stretch', label: 'Stretch / Distortion fill' },
                                        { value: 'center', label: 'Center / Absolute centering' },
                                        { value: 'span', label: 'Span / Stretch wallpaper across all displays' }
                                    ]}
                                    value={activeTabConfig.style}
                                    onChange={(val) => { if (val) updateActiveTabConfig({ style: val as ConfigState['style'] }); }}
                                />
                            )}

                            <Select 
                                label="Selection Target Source"
                                description="Choose whether to rotate random images from entire library or restrict to a playlist."
                                data={[
                                    { value: 'entire_library', label: 'Entire Library' },
                                    { value: 'playlist', label: 'Restricted Playlist' }
                                ]}
                                value={activeTabConfig.source}
                                onChange={(val) => { if (val) updateActiveTabConfig({ source: val as 'entire_library' | 'playlist' }); }}
                            />

                            {activeTabConfig.source === 'playlist' && (
                                <Select 
                                    label="Playlist Source"
                                    description="Target playlist to rotate wallpapers from."
                                    placeholder="Select playlist"
                                    data={playlistData}
                                    value={activeTabConfig.playlistId}
                                    onChange={(val) => updateActiveTabConfig({ playlistId: val || '' })}
                                />
                            )}

                            <Box mt="xs">
                                <Group justify="space-between" mb="xs">
                                    <Text size="sm" fw={500}>Favorite Wallpaper Probability Chance</Text>
                                    <Badge color="yellow">{activeTabConfig.favProb}%</Badge>
                                </Group>
                                <Slider 
                                    min={0}
                                    max={100}
                                    step={5}
                                    value={activeTabConfig.favProb}
                                    onChange={(val) => updateActiveTabConfig({ favProb: val })}
                                    marks={[
                                        { value: 0, label: '0%' },
                                        { value: 40, label: '40% (Def)' },
                                        { value: 100, label: '100%' }
                                    ]}
                                    mb="lg"
                                />
                            </Box>

                            <NumberInput 
                                label="Native Rotation Interval"
                                description="Interval in minutes for background rotations (only active in Native mode)."
                                min={1}
                                max={1440}
                                value={activeTabConfig.interval}
                                onChange={(val) => updateActiveTabConfig({ interval: Number(val) || 15 })}
                                disabled={activeTabConfig.mode !== 'native'}
                            />

                            {activeTabConfig.mode === 'displayfusion' && (
                                <Alert 
                                    icon={<IconInfoCircle size="1rem" />} 
                                    color="blue" 
                                    variant="light"
                                    styles={{ title: { fontWeight: 600 } }}
                                    title="DisplayFusion CLI Configuration"
                                >
                                    DisplayFusion is currently driving the interval schedule. To change rotation intervals, please adjust your DisplayFusion monitor settings.
                                </Alert>
                            )}

                            {activeTabConfig.mode === 'native' && (
                                <Alert 
                                    icon={<IconInfoCircle size="1rem" />} 
                                    color="blue" 
                                    variant="light"
                                    styles={{ title: { fontWeight: 600 } }}
                                    title="Auto-Detect Monitor Orientation"
                                >
                                    Rotations automatically request wallpapers matching your monitor's orientation (Landscape screens fetch landscape images like 16:9 or 16:10, and Portrait screens fetch portrait images).
                                </Alert>
                            )}
                        </Stack>
                    )}
                </Tabs>

                {activeConfigTab !== 'rules' && (
                    <Button 
                        color="blue" 
                        onClick={handleSaveSettings}
                        loading={saving}
                        leftSection={<IconSettings size="1rem" />}
                        mt="xl"
                        fullWidth
                    >
                        Save All Configurations
                    </Button>
                )}
            </Paper>
        </Stack>
    );
}
