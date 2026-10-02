/**
 * @file Global rotation configuration form component.
 * Module: Global Config Form
 * Description: Renders rotation mode, style, source, playlist, probability, and interval settings using RotationFormContext.
 */
import { useMemo } from 'react';
import {
    Paper, Select, Button, Stack, Tabs, Switch,
    Box, Text, Badge, Slider, NumberInput, Alert, Group
} from '@mantine/core';
import {
    IconSettings, IconClock, IconDeviceDesktop, IconInfoCircle
} from '@tabler/icons-react';
import { RotationRulesManager } from '../../../components/RotationRulesManager';
import type { MonitorInfo } from '../hooks/useMonitors';
import type { ConfigState } from '../hooks/useRotationConfig';
import { useRotationFormContext } from '../context/RotationFormContext';
import { ProfileManagerCard } from './ProfileManagerCard';

const DEFAULT_CONFIG_STATE: ConfigState = {
    mode: 'displayfusion',
    interval: 15,
    favProb: 40,
    source: 'entire_library',
    playlistId: '',
    style: 'fill',
    overrideEnabled: false
};

const DEFAULT_FAV_PROB_DEF = 40;
const SLIDER_MAX = 100;
const SLIDER_STEP = 5;
const INTERVAL_MIN = 1;
const INTERVAL_MAX = 1440;
const DEFAULT_INTERVAL = 15;
const DISABLED_OPACITY = 0.5;

function getMonitorDisplayName(monitors: MonitorInfo[], tabKey: string): string | number {
    const activeMon = monitors.find(mon => String(mon.index) === tabKey);
    return activeMon?.winNum || (Number(tabKey) + 1);
}

export function GlobalConfigForm() {
    const {
        monitors,
        activeConfigTab,
        setActiveConfigTab,
        globalConfig,
        setGlobalConfig,
        monitorConfigs,
        setMonitorConfigs,
        playlists,
        saving,
        handleSaveSettings
    } = useRotationFormContext();

    const playlistData = useMemo(() => {
        return playlists?.map(p => ({ value: String(p.id), label: p.name })) || [];
    }, [playlists]);

    const activeTabConfig = useMemo((): ConfigState => {
        if (activeConfigTab === 'global') return globalConfig;
        return monitorConfigs[activeConfigTab] || DEFAULT_CONFIG_STATE;
    }, [activeConfigTab, globalConfig, monitorConfigs]);

    const updateActiveTabConfig = (updates: Partial<ConfigState>) => {
        if (activeConfigTab === 'global') {
            setGlobalConfig(prev => ({ ...prev, ...updates }));
        } else {
            setMonitorConfigs(prev => ({
                ...prev,
                [activeConfigTab]: {
                    ...(prev[activeConfigTab] || DEFAULT_CONFIG_STATE),
                    ...updates
                }
            }));
        }
    };

    const isFormEnabled = activeConfigTab === 'global' || !!activeTabConfig.overrideEnabled;

    return (
        <Stack gap="md">
            <ProfileManagerCard />

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
                            label={`Override global rotation rules for Monitor ${getMonitorDisplayName(monitors, activeConfigTab)}`}
                            checked={!!activeTabConfig.overrideEnabled}
                            onChange={(event) => updateActiveTabConfig({ overrideEnabled: event.currentTarget.checked })}
                            mb="md"
                        />
                    )}

                    {activeConfigTab === 'rules' ? (
                        <RotationRulesManager />
                    ) : (
                        <fieldset
                            disabled={!isFormEnabled}
                            style={{
                                border: 'none',
                                padding: 0,
                                margin: 0,
                                opacity: isFormEnabled ? 1 : DISABLED_OPACITY
                            }}
                        >
                            <Stack gap="md">
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
                                        max={SLIDER_MAX}
                                        step={SLIDER_STEP}
                                        value={activeTabConfig.favProb}
                                        onChange={(val) => updateActiveTabConfig({ favProb: val })}
                                        marks={[
                                            { value: 0, label: '0%' },
                                            { value: DEFAULT_FAV_PROB_DEF, label: '40% (Def)' },
                                            { value: SLIDER_MAX, label: '100%' }
                                        ]}
                                        mb="lg"
                                    />
                                </Box>

                                <NumberInput 
                                    label="Native Rotation Interval"
                                    description="Interval in minutes for background rotations (only active in Native mode)."
                                    min={INTERVAL_MIN}
                                    max={INTERVAL_MAX}
                                    value={activeTabConfig.interval}
                                    onChange={(val) => updateActiveTabConfig({ interval: Number(val) || DEFAULT_INTERVAL })}
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
                        </fieldset>
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
