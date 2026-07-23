/**
 * @file Header banner component for SetDetail page.
 */
/* eslint-disable no-magic-numbers */
import { Title, Text, Group, Badge, Button, Menu, ActionIcon, Stack } from '@mantine/core';
import {
    IconArrowLeft, IconCheck, IconRefresh, IconFolder, IconSettings,
    IconDotsVertical, IconSparkles, IconExternalLink, IconTrash, IconLock
} from '@tabler/icons-react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { Set as SetModel } from '../../../api/model';

interface SetHeaderProps {
    set: SetModel;
    selectionMode: boolean;
    setSelectionMode: (mode: boolean) => void;
    selectedImageIds: Set<number>;
    clearSelection: () => void;
    handleSelectAll: () => void;
    handleResync: () => void;
    handleOpenFolder: () => void;
    onOpenEditModal: () => void;
    handleAutoTag: () => void;
    handleDelete: () => void;
    resyncPending: boolean;
    autoTagPending: boolean;
    isLocalTaggingActive: boolean;
    isAnyTaggingActive: boolean;
}

export function SetHeader({
    set,
    selectionMode,
    setSelectionMode,
    selectedImageIds,
    clearSelection,
    handleSelectAll,
    handleResync,
    handleOpenFolder,
    onOpenEditModal,
    handleAutoTag,
    handleDelete,
    resyncPending,
    autoTagPending,
    isLocalTaggingActive,
    isAnyTaggingActive,
}: SetHeaderProps) {
    const navigate = useNavigate();
    const location = useLocation();

    return (
        <Stack gap="md" mb="xl">
            {/* Header Navigation */}
            <Group justify="space-between">
                <Button 
                    variant="subtle" 
                    leftSection={<IconArrowLeft size={16} />} 
                    onClick={() => {
                        if (location.state?.from) {
                            navigate(-1);
                        } else {
                            navigate('/sets');
                        }
                    }} 
                    color="gray"
                >
                    Back to {location.state?.fromLabel || "Library"}
                </Button>

                <Group gap="xs">
                    {selectionMode && (
                        <Button 
                            variant="subtle" 
                            size="sm" 
                            onClick={handleSelectAll}
                            disabled={selectedImageIds.size === (set.images?.length || 0)}
                        >
                            Select All
                        </Button>
                    )}
                    <Button 
                        variant={selectionMode ? "filled" : "light"} 
                        color={selectionMode ? "blue" : "gray"}
                        leftSection={selectionMode ? <IconCheck size={16} /> : null}
                        onClick={() => selectionMode ? clearSelection() : setSelectionMode(true)}
                    >
                        {selectionMode ? "Finish Selecting" : "Select Items"}
                    </Button>
                </Group>
            </Group>

            {/* Title & Actions Row */}
            <Group justify="space-between" align="center">
                <Title order={1}>{set.title || 'Untitled Set'}</Title>
                <Group>
                    <Button 
                        leftSection={<IconRefresh size={18} />} 
                        variant="light"
                        color="blue"
                        onClick={handleResync}
                        loading={resyncPending}
                        disabled={autoTagPending || isLocalTaggingActive}
                    >
                        Resync Folder
                    </Button>
                    <Button 
                        leftSection={<IconFolder size={18} />} 
                        variant="light"
                        onClick={handleOpenFolder}
                    >
                        Open Folder
                    </Button>
                    <Button 
                        leftSection={<IconSettings size={18} />} 
                        variant="outline"
                        onClick={onOpenEditModal}
                        disabled={autoTagPending || isLocalTaggingActive}
                    >
                        Edit Set Details
                    </Button>
                    <Menu shadow="md" width={200} position="bottom-end">
                        <Menu.Target>
                            <ActionIcon variant="outline" size="lg" radius="md">
                                <IconDotsVertical size={18} />
                            </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Label>Management</Menu.Label>
                            <Menu.Item 
                                leftSection={<IconSparkles size={14} />} 
                                onClick={handleAutoTag}
                                disabled={autoTagPending || isAnyTaggingActive}
                            >
                                Run AI Auto-Tagging
                            </Menu.Item>
                            {set.source_url && (
                                <Menu.Item 
                                    component="a" 
                                    href={set.source_url} 
                                    target="_blank" 
                                    leftSection={<IconExternalLink size={14} />}
                                >
                                    Source URL
                                </Menu.Item>
                            )}
                             <Menu.Item 
                                leftSection={<IconTrash size={14} />} 
                                color="red" 
                                onClick={handleDelete}
                                disabled={autoTagPending || isLocalTaggingActive}
                            >
                                Delete Set
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                </Group>
            </Group>

            {/* Subtitle Details */}
            <Group gap="xs">
                {set.creators && set.creators.length > 0 ? (
                    set.creators.map(c => (
                        <Badge 
                            key={c.id} 
                            size="lg" 
                            variant="light" 
                            color="indigo" 
                            style={{ cursor: 'pointer', textTransform: 'none' }}
                            onClick={() => navigate(`/creators/${c.id}`, {
                                state: {
                                    from: location.pathname,
                                    fromLabel: 'Sets'
                                }
                            })}
                        >
                            {c.canonical_name}
                        </Badge>
                    ))
                ) : (
                    <Text size="lg" c="dimmed">Unknown Creator</Text>
                )}
                <Text c="dimmed" size="lg">•</Text>
                <Badge size="lg" color="blue" variant="filled">
                    {set.images?.length || 0} Wallpapers
                </Badge>
                {set.is_locked && (
                    <Badge size="lg" color="orange" variant="light" leftSection={<IconLock size={12} />}>
                        Locked
                    </Badge>
                )}
            </Group>

            {/* Notes */}
            {set.notes && (
                <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>
                    {set.notes}
                </Text>
            )}

            {/* Tags & Characters */}
            <Group gap="xs" wrap="wrap">
                {set.franchises?.map(f => (
                    <Badge key={f.id} color="teal" variant="light" size="sm">
                        Franchise: {f.name}
                    </Badge>
                ))}
                {set.characters?.map((charName, i) => (
                    <Badge key={i} color="cyan" variant="outline" size="sm">
                        Char: {charName}
                    </Badge>
                ))}
                {set.tags?.map((tag, i) => (
                    <Badge key={i} color="gray" variant="dot" size="sm">
                        #{tag}
                    </Badge>
                ))}
            </Group>
        </Stack>
    );
}
