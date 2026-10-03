/**
 * @file
 * Module: Sets Table View
 * Description: Renders sets in a tabular view with preview image, title, creators, image count, and selection checkboxes.
 */
import { Table, Image, Checkbox, Group, Badge } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { getThumbnailUrl, FALLBACK_IMAGE } from '../../../utils/fileUtils';
import { getLabelFromPath } from '../../../utils/navigationUtils';
import type { SetSummary as SetModel } from '../../../api/model';
import type { WithMultiVault } from '../../../types/vault';

export interface SetsTableViewProps {
    sets: SetModel[];
    isAggregated: boolean;
    selectedIds: Set<number>;
    selectionMode: boolean;
    toggleSelect: (id: number) => void;
    startSelectionWith: (id: number) => void;
    switchVault: (vaultId: string) => Promise<void>;
    locationPathname: string;
}

export function SetsTableView({
    sets,
    isAggregated,
    selectedIds,
    selectionMode,
    toggleSelect,
    startSelectionWith,
    switchVault,
    locationPathname
}: SetsTableViewProps) {
    const navigate = useNavigate();

    return (
        <Table.ScrollContainer minWidth={800} mb="xl">
            <Table verticalSpacing="sm" highlightOnHover>
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th w={40}></Table.Th>
                        <Table.Th w={100}>Preview</Table.Th>
                        <Table.Th>Title</Table.Th>
                        <Table.Th>Creator(s)</Table.Th>
                        <Table.Th>Images</Table.Th>
                        <Table.Th>Date Added</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {sets.map(set => {
                        const multiSet = set as WithMultiVault<SetModel>;
                        const itemKey = `${multiSet._vaultId || 'local'}-${set.id}`;
                        const coverUrl = set.preview_image_id 
                            ? getThumbnailUrl(set.preview_image_id, 'sm', undefined, multiSet._vaultUrl, multiSet._vaultApiKey) 
                            : FALLBACK_IMAGE;
                        const creatorNames = set.creators?.map(c => c.canonical_name).join(', ') || '-';
                        const dateAdded = new Date(set.date_added).toLocaleDateString();

                        return (
                            <Table.Tr 
                                key={itemKey}
                                onClick={async () => {
                                    if (isAggregated && multiSet._vaultId) {
                                        await switchVault(multiSet._vaultId);
                                    }
                                    navigate(`/sets/${set.id}`, {
                                        state: {
                                            from: locationPathname,
                                            fromLabel: getLabelFromPath(locationPathname)
                                        }
                                    });
                                }}
                                style={{ 
                                    cursor: 'pointer', 
                                    backgroundColor: selectedIds.has(set.id) ? 'var(--mantine-color-blue-light)' : undefined 
                                }}
                            >
                                <Table.Td onClick={(e) => e.stopPropagation()}>
                                    <Checkbox 
                                        checked={selectedIds.has(set.id)}
                                        onChange={() => {
                                            if (!selectionMode) startSelectionWith(set.id);
                                            else toggleSelect(set.id);
                                        }}
                                    />
                                </Table.Td>
                                <Table.Td>
                                    <Image src={coverUrl} w={80} h={60} radius="sm" fit="cover" />
                                </Table.Td>
                                <Table.Td fw={500}>
                                    <Group gap="xs">
                                        {set.title || 'Untitled Set'}
                                        {isAggregated && multiSet._vaultLabel && (
                                            <Badge size="xs" variant="dot" color="teal">
                                                {multiSet._vaultLabel}
                                            </Badge>
                                        )}
                                    </Group>
                                </Table.Td>
                                <Table.Td>{creatorNames}</Table.Td>
                                <Table.Td>{set.image_count ?? 0}</Table.Td>
                                <Table.Td c="dimmed">{dateAdded}</Table.Td>
                            </Table.Tr>
                        );
                    })}
                </Table.Tbody>
            </Table>
        </Table.ScrollContainer>
    );
}
