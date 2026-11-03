/**
 * @file
 * Multi-step orchestration hook for cross-vault and local library path transfers.
 * Coordinates metadata export, preflight collision checks, binary image streaming,
 * finalization, and optional source deletion in Move mode.
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AXIOS_INSTANCE } from '../api/axios-instance';
import { useListLibraryPathsApiLibraryPathsGet } from '../api/generated/library-paths/library-paths';
import { useVault } from './useVault';
import { useAppNotifications } from './useAppNotifications';
import type { VaultEntry } from '../types/electron';
import type { Set as SetModel, SetPage } from '../api/model';

const DESTINATION_SETS_LIMIT = 500;

export type TransferDestinationType = 'vault' | 'library_path';
export type TransferMode = 'copy' | 'move';
export type SetCollisionStrategy = 'merge' | 'create_new';
export type TargetSetOverrideMode = 'preserve' | 'existing' | 'new';
export type TransferStage = 'select' | 'preflighting' | 'confirm' | 'transferring' | 'completed' | 'error';

export interface CreatorTransferMeta {
    canonical_name: string;
    type?: string | null;
    notes?: string | null;
    socials?: Record<string, unknown>[] | null;
}

export interface CharacterTransferMeta {
    name: string;
    franchise_name?: string | null;
}

export interface ImageTransferMeta {
    id: number;
    filename: string;
    phash?: string | null;
    width?: number | null;
    height?: number | null;
    file_size?: number | null;
    aspect_ratio?: number | null;
    aspect_ratio_label?: string | null;
    sort_order?: number | null;
    notes?: string | null;
    rating?: string | null;
    dominant_color?: string | null;
    dominant_color_bucket?: string | null;
    focal_point_x?: number | null;
    focal_point_y?: number | null;
    is_favorite?: boolean;
    is_blacklisted?: boolean;
    tags: string[];
    characters: CharacterTransferMeta[];
}

export interface SetTransferPackage {
    source_set_id?: number | null;
    title?: string | null;
    source_url?: string | null;
    phash?: string | null;
    notes?: string | null;
    creators: CreatorTransferMeta[];
    tags: string[];
    characters: CharacterTransferMeta[];
    images: ImageTransferMeta[];
}

export interface SetCollisionItem {
    source_set_id?: number | null;
    source_title?: string | null;
    existing_set_id: number;
    existing_title?: string | null;
    match_reason: 'source_url' | 'title_and_creators';
}

export interface ImageCollisionItem {
    source_image_id: number;
    filename: string;
    source_phash: string;
    existing_image_id: number;
    existing_set_id: number;
    existing_set_title?: string | null;
    hamming_distance: number;
}

export interface TaxonomyResolutionSummary {
    existing_creators: string[];
    missing_creators: string[];
    existing_franchises: string[];
    missing_franchises: string[];
    existing_characters: string[];
    missing_characters: string[];
    existing_tags: string[];
    missing_tags: string[];
}

export interface TransferPreflightResult {
    transfer_session_id: string;
    set_collisions: SetCollisionItem[];
    image_collisions: ImageCollisionItem[];
    taxonomy: TaxonomyResolutionSummary;
}

export interface TransferFinalizeResponse {
    created_set_ids: number[];
    transferred_image_count: number;
    skipped_image_count: number;
}

export interface LocalTransferResponse {
    set_ids: number[];
    moved_image_count: number;
    new_local_paths: string[];
}

export interface TransferDestinationOption {
    value: string;
    label: string;
    type: TransferDestinationType;
    vault?: VaultEntry;
    libraryPathId?: number;
}

export interface TransferSuccessInfo {
    mode: TransferMode;
    destinationType: TransferDestinationType;
    transferredCount: number;
    skippedCount: number;
}

export interface UseTransferParams {
    setId?: number;
    imageIds?: number[];
    sourceLibraryPathId?: number | null;
    sourceVault?: VaultEntry;
    onSuccess?: (info: TransferSuccessInfo) => void;
}

function buildVaultHeaders(vault: VaultEntry): Record<string, string> {
    if (!vault.apiKey) {
        return {};
    }
    return {
        Authorization: `Bearer ${vault.apiKey}`,
        'X-API-Key': vault.apiKey,
    };
}

function cleanVaultUrl(url: string): string {
    return url.replace(/\/+$/, '');
}

export function useTransfer({
    setId,
    imageIds,
    sourceLibraryPathId,
    sourceVault,
    onSuccess,
}: UseTransferParams) {
    const queryClient = useQueryClient();
    const { showNotification } = useAppNotifications();
    const { vaults, activeVault } = useVault();
    const { data: libraryPathsData } = useListLibraryPathsApiLibraryPathsGet();

    const effectiveSourceVault = sourceVault || activeVault;

    const [selectedDestination, setSelectedDestination] = useState<string | null>(null);
    const [mode, setModeState] = useState<TransferMode>('copy');
    const [stage, setStage] = useState<TransferStage>('select');
    const [packages, setPackages] = useState<SetTransferPackage[]>([]);
    const [preflightResult, setPreflightResult] = useState<TransferPreflightResult | null>(null);
    const [setCollisionStrategy, setSetCollisionStrategy] = useState<SetCollisionStrategy>('merge');
    const [skipDuplicateImages, setSkipDuplicateImages] = useState<boolean>(true);
    const [targetSetMode, setTargetSetMode] = useState<TargetSetOverrideMode>('preserve');
    const [targetSetId, setTargetSetId] = useState<string | null>(null);
    const [targetSetTitle, setTargetSetTitle] = useState<string>('');
    const [destinationSets, setDestinationSets] = useState<Array<{ value: string; label: string }>>([]);
    const [isLoadingDestinationSets, setIsLoadingDestinationSets] = useState<boolean>(false);
    const [progress, setProgress] = useState<{ current: number; total: number; currentFilename?: string }>({
        current: 0,
        total: 0,
    });
    const [error, setError] = useState<string | null>(null);

    const destinationOptions = useMemo<TransferDestinationOption[]>(() => {
        const opts: TransferDestinationOption[] = [];

        for (const v of vaults) {
            if (v.id === effectiveSourceVault.id) continue;
            const statusSuffix = v.status === 'offline' ? ' (Offline)' : '';
            opts.push({
                value: `vault:${v.id}`,
                label: `${v.label}${statusSuffix}`,
                type: 'vault',
                vault: v,
            });
        }

        if (effectiveSourceVault.isLocal && libraryPathsData?.items) {
            for (const lp of libraryPathsData.items) {
                if (sourceLibraryPathId !== undefined && sourceLibraryPathId !== null && lp.id === sourceLibraryPathId) {
                    continue;
                }
                const lpLabel = lp.label ? `${lp.label} (${lp.path})` : lp.path;
                opts.push({
                    value: `lp:${lp.id}`,
                    label: lpLabel,
                    type: 'library_path',
                    libraryPathId: lp.id,
                });
            }
        }

        return opts;
    }, [vaults, effectiveSourceVault, libraryPathsData, sourceLibraryPathId]);

    const activeDestination = useMemo<TransferDestinationOption | null>(() => {
        if (!selectedDestination) return null;
        return destinationOptions.find((o) => o.value === selectedDestination) || null;
    }, [selectedDestination, destinationOptions]);

    const effectiveMode: TransferMode = activeDestination?.type === 'library_path' ? 'move' : mode;

    const setMode = useCallback((nextMode: TransferMode) => {
        setModeState(nextMode);
    }, []);

    const handleSelectDestination = useCallback((val: string | null) => {
        setSelectedDestination(val);
        setStage('select');
        setPreflightResult(null);
        setError(null);
        if (val?.startsWith('lp:')) {
            setModeState('move');
        }
    }, []);

    // Load destination sets when cherry-picking images and user selects 'existing' target set override
    useEffect(() => {
        if (targetSetMode !== 'existing' || !activeDestination) {
            return;
        }
        let cancelled = false;
        const loadSets = async () => {
            setIsLoadingDestinationSets(true);
            try {
                const targetVault =
                    activeDestination.type === 'vault' && activeDestination.vault
                        ? activeDestination.vault
                        : effectiveSourceVault;
                const baseUrl = cleanVaultUrl(targetVault.url);
                const res = await AXIOS_INSTANCE.get<SetPage>(`${baseUrl}/api/sets/`, {
                    params: { skip: 0, limit: DESTINATION_SETS_LIMIT },
                    headers: buildVaultHeaders(targetVault),
                    skipAuthInterceptor: true,
                });
                if (cancelled) return;
                const items: SetModel[] = res.data?.items || [];
                const mapped = items
                    .map((s) => {
                        const creators = s.creators?.map((c) => c.canonical_name).join(', ');
                        const label = creators
                            ? `${s.title || 'Untitled Set'} [${creators}]`
                            : s.title || 'Untitled Set';
                        return { value: String(s.id), label };
                    })
                    .sort((a, b) => a.label.localeCompare(b.label));
                setDestinationSets(mapped);
            } catch {
                if (!cancelled) {
                    setDestinationSets([]);
                }
            } finally {
                if (!cancelled) {
                    setIsLoadingDestinationSets(false);
                }
            }
        };
        loadSets();
        return () => {
            cancelled = true;
        };
    }, [targetSetMode, activeDestination, effectiveSourceVault]);

    const reset = useCallback(() => {
        setSelectedDestination(null);
        setModeState('copy');
        setStage('select');
        setPackages([]);
        setPreflightResult(null);
        setSetCollisionStrategy('merge');
        setSkipDuplicateImages(true);
        setTargetSetMode('preserve');
        setTargetSetId(null);
        setTargetSetTitle('');
        setProgress({ current: 0, total: 0 });
        setError(null);
    }, []);

    const runPreflight = useCallback(async () => {
        if (!activeDestination) {
            setError('Please select a destination.');
            return;
        }
        if (activeDestination.type !== 'vault' || !activeDestination.vault) {
            setStage('confirm');
            return;
        }

        setStage('preflighting');
        setError(null);

        try {
            const sourceBase = cleanVaultUrl(effectiveSourceVault.url);
            const destVault = activeDestination.vault;
            const destBase = cleanVaultUrl(destVault.url);

            let exportedPackages: SetTransferPackage[] = [];
            if (setId !== undefined && (!imageIds || imageIds.length === 0)) {
                const exportRes = await AXIOS_INSTANCE.get<SetTransferPackage>(
                    `${sourceBase}/api/vault/transfer/export/set/${setId}`,
                    {
                        headers: buildVaultHeaders(effectiveSourceVault),
                        skipAuthInterceptor: true,
                    }
                );
                exportedPackages = [exportRes.data];
            } else if (imageIds && imageIds.length > 0) {
                const exportRes = await AXIOS_INSTANCE.get<{ packages: SetTransferPackage[] }>(
                    `${sourceBase}/api/vault/transfer/export/images`,
                    {
                        params: { image_ids: imageIds.join(',') },
                        headers: buildVaultHeaders(effectiveSourceVault),
                        skipAuthInterceptor: true,
                    }
                );
                exportedPackages = exportRes.data.packages || [];
            } else {
                throw new Error('No set or images specified for transfer.');
            }

            const preflightRes = await AXIOS_INSTANCE.post<TransferPreflightResult>(
                `${destBase}/api/vault/transfer/preflight`,
                { packages: exportedPackages },
                {
                    headers: buildVaultHeaders(destVault),
                    skipAuthInterceptor: true,
                }
            );

            setPackages(exportedPackages);
            setPreflightResult(preflightRes.data);
            setStage('confirm');
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { detail?: string } }; message?: string };
            const msg =
                axiosErr.response?.data?.detail ||
                axiosErr.message ||
                'Failed to run preflight check on destination vault.';
            setError(msg);
            setStage('error');
        }
    }, [activeDestination, effectiveSourceVault, setId, imageIds]);

    const executeTransfer = useCallback(async () => {
        if (!activeDestination) return;

        setError(null);
        setStage('transferring');

        try {
            // 1. Local Library Path shortcut
            if (activeDestination.type === 'library_path' && activeDestination.libraryPathId !== undefined) {
                const sourceBase = cleanVaultUrl(effectiveSourceVault.url);
                const payload: Record<string, unknown> = {
                    destination_library_path_id: activeDestination.libraryPathId,
                };
                if (setId !== undefined && (!imageIds || imageIds.length === 0)) {
                    payload.set_id = setId;
                } else if (imageIds && imageIds.length > 0) {
                    payload.image_ids = imageIds;
                    if (targetSetMode === 'existing' && targetSetId) {
                        payload.target_set_id = Number(targetSetId);
                    } else if (targetSetMode === 'new' && targetSetTitle.trim()) {
                        payload.target_set_title = targetSetTitle.trim();
                    }
                }

                const res = await AXIOS_INSTANCE.post<LocalTransferResponse>(
                    `${sourceBase}/api/vault/transfer/local`,
                    payload,
                    {
                        headers: buildVaultHeaders(effectiveSourceVault),
                        skipAuthInterceptor: true,
                    }
                );

                await queryClient.invalidateQueries();
                showNotification({
                    title: 'Library Path Move Complete',
                    message: `Moved ${res.data.moved_image_count} image(s) to ${activeDestination.label}.`,
                    color: 'green',
                });

                setStage('completed');
                onSuccess?.({
                    mode: 'move',
                    destinationType: 'library_path',
                    transferredCount: res.data.moved_image_count,
                    skippedCount: 0,
                });
                return;
            }

            // 2. Connected Vault Transfer
            const destVault = activeDestination.vault;
            if (!destVault || !preflightResult) {
                throw new Error('Preflight check must complete before transferring.');
            }

            const sourceBase = cleanVaultUrl(effectiveSourceVault.url);
            const destBase = cleanVaultUrl(destVault.url);

            const collidingSourceIds = new Set(
                preflightResult.image_collisions.map((c) => c.source_image_id)
            );
            const excludedIds = skipDuplicateImages ? Array.from(collidingSourceIds) : [];
            const excludedSet = new Set(excludedIds);

            const imagesToStream: ImageTransferMeta[] = [];
            for (const pkg of packages) {
                for (const img of pkg.images) {
                    if (!excludedSet.has(img.id)) {
                        imagesToStream.push(img);
                    }
                }
            }

            setProgress({ current: 0, total: imagesToStream.length });

            let completedCount = 0;
            for (const img of imagesToStream) {
                setProgress({
                    current: completedCount,
                    total: imagesToStream.length,
                    currentFilename: img.filename,
                });

                const fileRes = await AXIOS_INSTANCE.get<Blob>(
                    `${sourceBase}/api/images/file/${img.id}`,
                    {
                        responseType: 'blob',
                        headers: buildVaultHeaders(effectiveSourceVault),
                        skipAuthInterceptor: true,
                    }
                );

                const formData = new FormData();
                formData.append('transfer_session_id', preflightResult.transfer_session_id);
                formData.append('source_image_id', String(img.id));
                formData.append('metadata', JSON.stringify(img));
                formData.append('file', fileRes.data, img.filename);

                await AXIOS_INSTANCE.post(
                    `${destBase}/api/vault/transfer/ingest-image`,
                    formData,
                    {
                        headers: {
                            ...buildVaultHeaders(destVault),
                            'Content-Type': 'multipart/form-data',
                        },
                        skipAuthInterceptor: true,
                    }
                );

                completedCount += 1;
                setProgress({
                    current: completedCount,
                    total: imagesToStream.length,
                    currentFilename: img.filename,
                });
            }

            const finalizePayload: Record<string, unknown> = {
                transfer_session_id: preflightResult.transfer_session_id,
                packages,
                set_collision_strategy: setCollisionStrategy,
                skip_duplicate_images: skipDuplicateImages,
                excluded_source_image_ids: excludedIds,
            };

            if (imageIds && imageIds.length > 0) {
                if (targetSetMode === 'existing' && targetSetId) {
                    finalizePayload.target_set_id = Number(targetSetId);
                } else if (targetSetMode === 'new' && targetSetTitle.trim()) {
                    finalizePayload.target_set_title = targetSetTitle.trim();
                }
            }

            const finRes = await AXIOS_INSTANCE.post<TransferFinalizeResponse>(
                `${destBase}/api/vault/transfer/finalize`,
                finalizePayload,
                {
                    headers: buildVaultHeaders(destVault),
                    skipAuthInterceptor: true,
                }
            );

            // 3. If Move mode, delete source set or source images after destination is confirmed
            if (effectiveMode === 'move') {
                if (setId !== undefined && (!imageIds || imageIds.length === 0)) {
                    await AXIOS_INSTANCE.delete(`${sourceBase}/api/sets/${setId}`, {
                        headers: buildVaultHeaders(effectiveSourceVault),
                        skipAuthInterceptor: true,
                    });
                } else if (imageIds && imageIds.length > 0) {
                    for (const id of imageIds) {
                        await AXIOS_INSTANCE.delete(`${sourceBase}/api/images/${id}`, {
                            headers: buildVaultHeaders(effectiveSourceVault),
                            skipAuthInterceptor: true,
                        });
                    }
                }
            }

            await queryClient.invalidateQueries();

            const actionWord = effectiveMode === 'move' ? 'Moved' : 'Copied';
            const skipSuffix =
                finRes.data.skipped_image_count > 0
                    ? ` (${finRes.data.skipped_image_count} duplicate(s) skipped)`
                    : '';

            showNotification({
                title: `Transfer Complete`,
                message: `${actionWord} ${finRes.data.transferred_image_count} image(s) to "${destVault.label}"${skipSuffix}.`,
                color: 'green',
            });

            setStage('completed');
            onSuccess?.({
                mode: effectiveMode,
                destinationType: 'vault',
                transferredCount: finRes.data.transferred_image_count,
                skippedCount: finRes.data.skipped_image_count,
            });
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { detail?: string } }; message?: string };
            const msg =
                axiosErr.response?.data?.detail ||
                axiosErr.message ||
                'Transfer failed. No changes were committed to the destination vault.';
            setError(msg);
            setStage('error');
        }
    }, [
        activeDestination,
        effectiveSourceVault,
        setId,
        imageIds,
        targetSetMode,
        targetSetId,
        targetSetTitle,
        queryClient,
        showNotification,
        onSuccess,
        preflightResult,
        skipDuplicateImages,
        packages,
        setCollisionStrategy,
        effectiveMode,
    ]);

    return {
        destinationOptions,
        selectedDestination,
        activeDestination,
        handleSelectDestination,
        mode: effectiveMode,
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
    };
}
