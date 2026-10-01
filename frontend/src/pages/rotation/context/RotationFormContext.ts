/**
 * @file
 * Module: Rotation Form Context
 * Description: Context and consumer hook for desktop rotation settings to eliminate prop drilling.
 */
import { createContext, useContext } from 'react';
import type { MonitorInfo } from '../hooks/useMonitors';
import type { ConfigState } from '../hooks/useRotationConfig';

export interface RotationFormContextValue {
    monitors: MonitorInfo[];
    activeConfigTab: string;
    setActiveConfigTab: (tab: string) => void;
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
    globalConfig: ConfigState;
    setGlobalConfig: React.Dispatch<React.SetStateAction<ConfigState>>;
    monitorConfigs: Record<string, ConfigState>;
    setMonitorConfigs: React.Dispatch<React.SetStateAction<Record<string, ConfigState>>>;
    playlists: Array<{ id: number; name: string }> | undefined;
    saving: boolean;
    handleSaveSettings: () => void;
}

export const RotationFormContext = createContext<RotationFormContextValue | null>(null);

export function useRotationFormContext(): RotationFormContextValue {
    const context = useContext(RotationFormContext);
    if (!context) {
        throw new Error('useRotationFormContext must be used within a RotationFormProvider');
    }
    return context;
}
