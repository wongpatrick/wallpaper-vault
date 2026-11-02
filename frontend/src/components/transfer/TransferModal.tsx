/**
 * @file
 * TransferModal component for copying or moving sets and images across connected vaults
 * or local library paths with preflight collision detection and resolution options.
 */
import { useEffect, useMemo } from 'react';
import {
    Modal,
    Stack,
    Group,
    Button,
    Select,
    SegmentedControl,
    Text,
    Alert,
    Radio,
    Switch,
    Badge,
    Progress,
    Paper,
    TextInput,
    Divider,
    Loader,
} from '@mantine/core';
import {
    IconArrowsExchange,
    IconAlertTriangle,
    IconCheck,
    IconAlertCircle,
    IconServer,
    IconFolder,
} from '@tabler/icons-react';
import {
    useTransfer,
    type SetCollisionStrategy,
    type TargetSetOverrideMode,
    type TransferMode,
    type TransferSuccessInfo,
} from '../../hooks/useTransfer';
import type { VaultEntry } from '../../types/electron';

const MAX_DROPDOWN_HEIGHT = 280;
const PROGRESS_MAX_PERCENT = 100;

export interface TransferModalProps {
    opened: boolean;
    onClose: () => void;
    setId?: number;
    setTitle?: string | null;
    imageIds?: number[];
    sourceLibraryPathId?: number | null;
    sourceVault?: VaultEntry;
    onSuccess?: (info: TransferSuccessInfo) => void;
}

export function TransferModal({
    opened,
    onClose,
    setId,
    setTitle,
    imageIds,
    sourceLibraryPathId,
    sourceVault,
    onSuccess,
}: TransferModalProps) {
    const isImageTransfer = Boolean(imageIds && imageIds.length > 0);

    const {
        destinationOptions,
        selectedDestination,
        activeDestination,
        handleSelectDestination,
        mode,
        setMode,
        stage,
        setStage,
        packages,
        preflightResult,
        setCollisionStrategy,
        setSetCollisionStrategy,
        skipDuplicateImages,
        setSkipDuplicateImages,
        targetSetMode,
        setTargetSetMode,
        targetSetId,
        setTargetSetId,
        targetSetTitle,
        setTargetSetTitle,
        destinationSets,
        isLoadingDestinationSets,
        progress,
        error,
        runPreflight,
        executeTransfer,
        reset,
    } = useTransfer({
        setId,
        imageIds,
        sourceLibraryPathId,
        sourceVault,
        onSuccess: (info) => {
            onSuccess?.(info);
            onClose();
        },
    });

    useEffect(() => {
        if (!opened) {
            reset();
        }
    }, [opened, reset]);

    const groupedSelectData = useMemo(() => {
        const vaultItems = destinationOptions
            .filter((o) => o.type === 'vault')
            .map((o) => ({ value: o.value, label: o.label }));
        const lpItems = destinationOptions
            .filter((o) => o.type === 'library_path')
            .map((o) => ({ value: o.value, label: o.label }));

        const groups: Array<{ group: string; items: Array<{ value: string; label: string }> }> = [];
        if (vaultItems.length > 0) {
            groups.push({ group: 'Connected Vaults', items: vaultItems });
        }
        if (lpItems.length > 0) {
            groups.push({ group: 'Local Library Paths (Current Vault)', items: lpItems });
        }
        return groups;
    }, [destinationOptions]);

    const totalImagesInPackages = useMemo(() => {
        return packages.reduce((acc, pkg) => acc + pkg.images.length, 0);
    }, [packages]);

    const progressPercent =
        progress.total <= 0
            ? PROGRESS_MAX_PERCENT
            : Math.round((progress.current / progress.total) * PROGRESS_MAX_PERCENT);

    const isLocalPathSelected = activeDestination?.type === 'library_path';
    const isBusy = stage === 'preflighting' || stage === 'transferring';

    const modalTitle = isImageTransfer
        ? `Transfer ${imageIds?.length || 0} ${imageIds?.length === 1 ? 'Wallpaper' : 'Wallpapers'}`
        : `Transfer Set${setTitle ? `: ${setTitle}` : ''}`;

    const canProceedOverride =
        !isImageTransfer ||
        targetSetMode === 'preserve' ||
        (targetSetMode === 'existing' && Boolean(targetSetId)) ||
        (targetSetMode === 'new' && Boolean(targetSetTitle.trim()));

    return (
        <Modal
            opened={opened}
            onClose={() => {
                if (!isBusy) onClose();
            }}
            title={
                <Group gap="xs">
                    <IconArrowsExchange size={20} />
                    <Text fw={600}>{modalTitle}</Text>
                </Group>
            }
            size="lg"
            radius="md"
        >
            <Stack gap="md">
                {destinationOptions.length === 0 ? (
                    <Alert
                        icon={<IconAlertCircle size={16} />}
                        title="No Destinations Available"
                        color="yellow"
                    >
                        Connect another vault in Settings or configure an additional Library Path to transfer sets and wallpapers.
                    </Alert>
                ) : (
                    <>
                        <Select
                            label="Destination"
                            placeholder="Select a connected vault or local library path..."
                            data={groupedSelectData}
                            value={selectedDestination}
                            onChange={handleSelectDestination}
                            disabled={isBusy}
                            leftSection={
                                isLocalPathSelected ? <IconFolder size={16} /> : <IconServer size={16} />
                            }
                            searchable
                        />

                        {activeDestination && (
                            <Stack gap={4}>
                                <Text size="sm" fw={500}>
                                    Transfer Mode
                                </Text>
                                <SegmentedControl
                                    value={mode}
                                    onChange={(val) => setMode(val as TransferMode)}
                                    disabled={isBusy || isLocalPathSelected}
                                    data={[
                                        { label: 'Copy (Keep Source)', value: 'copy' },
                                        { label: 'Move (Delete Source After Transfer)', value: 'move' },
                                    ]}
                                />
                                {isLocalPathSelected && (
                                    <Text size="xs" c="dimmed">
                                        Same-vault Library Path transfers relocate files on disk (Move-only) without duplicating database records.
                                    </Text>
                                )}
                            </Stack>
                        )}

                        {activeDestination && isImageTransfer && (
                            <Paper withBorder p="sm" radius="md">
                                <Stack gap="xs">
                                    <Text size="sm" fw={500}>
                                        Destination Set Placement
                                    </Text>
                                    <SegmentedControl
                                        size="xs"
                                        value={targetSetMode}
                                        onChange={(val) => setTargetSetMode(val as TargetSetOverrideMode)}
                                        disabled={isBusy}
                                        data={[
                                            { label: 'Preserve Source Set(s)', value: 'preserve' },
                                            { label: 'Existing Destination Set', value: 'existing' },
                                            { label: 'Create New Set', value: 'new' },
                                        ]}
                                    />
                                    {targetSetMode === 'existing' && (
                                        <Select
                                            placeholder="Select destination set..."
                                            data={destinationSets}
                                            value={targetSetId}
                                            onChange={setTargetSetId}
                                            searchable
                                            clearable
                                            disabled={isBusy}
                                            maxDropdownHeight={MAX_DROPDOWN_HEIGHT}
                                            rightSection={isLoadingDestinationSets ? <Loader size="xs" /> : null}
                                            nothingFoundMessage={
                                                isLoadingDestinationSets ? 'Loading sets...' : 'No sets found'
                                            }
                                        />
                                    )}
                                    {targetSetMode === 'new' && (
                                        <TextInput
                                            placeholder="Enter new destination set title..."
                                            value={targetSetTitle}
                                            onChange={(e) => setTargetSetTitle(e.currentTarget.value)}
                                            disabled={isBusy}
                                        />
                                    )}
                                </Stack>
                            </Paper>
                        )}

                        {stage === 'confirm' && preflightResult && activeDestination?.type === 'vault' && (
                            <Stack gap="sm">
                                <Divider label="Preflight Check Report" labelPosition="center" />

                                {preflightResult.set_collisions.length > 0 && targetSetMode === 'preserve' && (
                                    <Alert
                                        icon={<IconAlertTriangle size={16} />}
                                        title={`Matching Set Detected (${preflightResult.set_collisions.length})`}
                                        color="yellow"
                                    >
                                        <Stack gap="xs">
                                            <Text size="xs">
                                                {preflightResult.set_collisions
                                                    .map(
                                                        (c) =>
                                                            `"${c.existing_title || 'Untitled'}" (matched by ${
                                                                c.match_reason === 'source_url'
                                                                    ? 'Source URL'
                                                                    : 'Title + Creators'
                                                            })`
                                                    )
                                                    .join(', ')}
                                            </Text>
                                            <Radio.Group
                                                value={setCollisionStrategy}
                                                onChange={(val) =>
                                                    setSetCollisionStrategy(val as SetCollisionStrategy)
                                                }
                                                label="How should colliding sets be handled?"
                                            >
                                                <Stack gap="xs" mt={4}>
                                                    <Radio
                                                        value="merge"
                                                        label="Merge into existing set on destination (Recommended)"
                                                    />
                                                    <Radio
                                                        value="create_new"
                                                        label="Create as a new set anyway"
                                                    />
                                                </Stack>
                                            </Radio.Group>
                                        </Stack>
                                    </Alert>
                                )}

                                {preflightResult.image_collisions.length > 0 && (
                                    <Alert
                                        icon={<IconAlertTriangle size={16} />}
                                        title={`${preflightResult.image_collisions.length} of ${totalImagesInPackages} Image(s) Match Existing Wallpapers (by pHash)`}
                                        color="orange"
                                    >
                                        <Stack gap="xs">
                                            <Text size="xs">
                                                Detected {preflightResult.image_collisions.length} visual duplicate
                                                or near-duplicate image(s) (Hamming distance ≤ 5) already on the destination vault.
                                            </Text>
                                            <Switch
                                                checked={skipDuplicateImages}
                                                onChange={(e) =>
                                                    setSkipDuplicateImages(e.currentTarget.checked)
                                                }
                                                label="Skip duplicate images (by pHash)"
                                            />
                                            {mode === 'move' && skipDuplicateImages && (
                                                <Text size="xs" c="dimmed">
                                                    In Move mode, skipped duplicates already confirmed on the destination will still be removed from the source vault.
                                                </Text>
                                            )}
                                        </Stack>
                                    </Alert>
                                )}

                                {preflightResult.set_collisions.length === 0 &&
                                    preflightResult.image_collisions.length === 0 && (
                                        <Alert
                                            icon={<IconCheck size={16} />}
                                            title="No Collisions Detected"
                                            color="teal"
                                        >
                                            All {totalImagesInPackages} wallpaper(s) are unique on the destination vault.
                                        </Alert>
                                    )}

                                <Paper withBorder p="xs" radius="md">
                                    <Group gap="xs" wrap="wrap">
                                        <Badge variant="light" color="blue">
                                            {totalImagesInPackages} Total Image(s)
                                        </Badge>
                                        {preflightResult.taxonomy.missing_creators.length > 0 && (
                                            <Badge variant="light" color="indigo">
                                                +{preflightResult.taxonomy.missing_creators.length} New Creator(s)
                                            </Badge>
                                        )}
                                        {preflightResult.taxonomy.missing_franchises.length > 0 && (
                                            <Badge variant="light" color="teal">
                                                +{preflightResult.taxonomy.missing_franchises.length} New Franchise(s)
                                            </Badge>
                                        )}
                                        {preflightResult.taxonomy.missing_characters.length > 0 && (
                                            <Badge variant="light" color="cyan">
                                                +{preflightResult.taxonomy.missing_characters.length} New Character(s)
                                            </Badge>
                                        )}
                                        {preflightResult.taxonomy.missing_tags.length > 0 && (
                                            <Badge variant="light" color="gray">
                                                +{preflightResult.taxonomy.missing_tags.length} New Tag(s)
                                            </Badge>
                                        )}
                                    </Group>
                                </Paper>
                            </Stack>
                        )}

                        {stage === 'transferring' && (
                            <Stack gap="xs">
                                <Group justify="space-between">
                                    <Text size="sm" fw={500}>
                                        {isLocalPathSelected
                                            ? 'Moving files on disk...'
                                            : `Transferring images (${progress.current} / ${progress.total})...`}
                                    </Text>
                                    <Text size="xs" c="dimmed">
                                        {progressPercent}%
                                    </Text>
                                </Group>
                                <Progress value={progressPercent} animated />
                                {progress.currentFilename && (
                                    <Text size="xs" c="dimmed" truncate="end">
                                        Current: {progress.currentFilename}
                                    </Text>
                                )}
                            </Stack>
                        )}

                        {error && (
                            <Alert
                                icon={<IconAlertCircle size={16} />}
                                title="Transfer Error"
                                color="red"
                            >
                                {error}
                            </Alert>
                        )}
                    </>
                )}

                <Group justify="flex-end" mt="sm">
                    <Button variant="default" onClick={onClose} disabled={isBusy}>
                        Cancel
                    </Button>

                    {activeDestination && isLocalPathSelected && (
                        <Button
                            color="blue"
                            loading={isBusy}
                            disabled={!canProceedOverride}
                            onClick={executeTransfer}
                        >
                            Move to Library Path
                        </Button>
                    )}

                    {activeDestination && !isLocalPathSelected && stage !== 'confirm' && (
                        <Button
                            color="blue"
                            loading={stage === 'preflighting'}
                            disabled={!canProceedOverride || stage === 'transferring'}
                            onClick={runPreflight}
                        >
                            Check Collisions & Continue
                        </Button>
                    )}

                    {activeDestination && !isLocalPathSelected && stage === 'confirm' && (
                        <>
                            <Button
                                variant="subtle"
                                color="gray"
                                disabled={isBusy}
                                onClick={() => setStage('select')}
                            >
                                Back
                            </Button>
                            <Button
                                color={mode === 'move' ? 'orange' : 'blue'}
                                loading={isBusy}
                                disabled={!canProceedOverride}
                                onClick={executeTransfer}
                            >
                                {mode === 'move' ? 'Confirm Move' : 'Confirm Copy'}
                            </Button>
                        </>
                    )}
                </Group>
            </Stack>
        </Modal>
    );
}
