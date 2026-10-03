/**
 * @file
 * Module: Sets Grid View
 * Description: Renders responsive card grid for wallpaper sets.
 */
import { Box } from '@mantine/core';
import { SetCard } from '../../../components/sets/SetCard';
import type { SetSummary as SetModel } from '../../../api/model';
import type { WithMultiVault } from '../../../types/vault';

export interface SetsGridViewProps {
    sets: SetModel[];
    handleDelete: (setId: number) => void;
    selectionMode: boolean;
    selectedIds: Set<number>;
    toggleSelect: (id: number) => void;
    handleLongPress: (id: number) => void;
}

export function SetsGridView({
    sets,
    handleDelete,
    selectionMode,
    selectedIds,
    toggleSelect,
    handleLongPress
}: SetsGridViewProps) {
    return (
        <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 'var(--mantine-spacing-lg)' }}>
            {sets.map((set) => {
                const multiSet = set as WithMultiVault<SetModel>;
                const itemKey = `${multiSet._vaultId || 'local'}-${set.id}`;

                return (
                    <SetCard 
                        key={itemKey} 
                        set={set} 
                        onDelete={handleDelete}
                        selectionMode={selectionMode}
                        selected={selectedIds.has(set.id)}
                        onToggleSelect={toggleSelect}
                        onLongPress={handleLongPress}
                    />
                );
            })}
        </Box>
    );
}
