/**
 * @file
 * Hook for chunked validation and scanning of import candidate files/paths.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useAppNotifications } from '../../../hooks/useAppNotifications';
import {
    validateImportPathsApiImagesImportValidatePost,
    validateImportUploadedFilesApiImagesImportValidateFilesPost,
    scanImportPathsApiImagesImportScanPathsPost,
    cleanupImportTempFilesApiImagesImportCleanupTempPost
} from '../../../api/generated/images/images';
import type {
    BodyValidateImportUploadedFilesApiImagesImportValidateFilesPost,
    ImageValidationItem
} from '../../../api/model';
import type { QueueItem } from './useImportQueue';

const VALIDATION_CHUNK_SIZE = 5;
const PROGRESS_FINAL_DELAY_MS = 200;

interface UseImportScannerProps {
    opened: boolean;
    initialLocalPaths: string[];
    initialFiles: File[];
    isElectron: boolean;
    onValidated: (items: QueueItem[]) => void;
}

export function useImportScanner({
    opened,
    initialLocalPaths,
    initialFiles,
    isElectron,
    onValidated
}: UseImportScannerProps) {
    const { showNotification } = useAppNotifications();
    const abortControllerRef = useRef<AbortController | null>(null);

    const [isValidating, setIsValidating] = useState(false);
    const [isCancelledByUser, setIsCancelledByUser] = useState(false);
    const [validationProgress, setValidationProgress] = useState(0);
    const [validationCount, setValidationCount] = useState(0);
    const [validationTotal, setValidationTotal] = useState(0);

    const cancelValidation = useCallback(() => {
        setIsCancelledByUser(true);
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setIsValidating(false);
        setValidationProgress(0);
        setValidationCount(0);
        setValidationTotal(0);
    }, []);

    const pathsKey = isElectron
        ? initialLocalPaths.join('::')
        : initialFiles.map(f => `${f.name}:${f.size}`).join('::');

    useEffect(() => {
        if (!opened) {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
                abortControllerRef.current = null;
            }
            return;
        }

        const abortController = new AbortController();
        abortControllerRef.current = abortController;
        let isCancelled = false;
        const stagedTempPaths: string[] = [];

        const runValidation = async () => {
            setIsCancelledByUser(false);
            setIsValidating(true);
            setValidationProgress(0);
            setValidationCount(0);
            setValidationTotal(0);

            try {
                let validatedItems: ImageValidationItem[] = [];

                if (isElectron) {
                    const allPaths = await scanImportPathsApiImagesImportScanPathsPost(
                        { local_paths: initialLocalPaths },
                        undefined,
                        undefined,
                        abortController.signal
                    );
                    if (isCancelled || abortController.signal.aborted) return;

                    const total = allPaths.length;
                    setValidationTotal(total);

                    if (total > 0) {
                        let completedCount = 0;
                        for (let i = 0; i < total; i += VALIDATION_CHUNK_SIZE) {
                            if (isCancelled || abortController.signal.aborted) return;
                            const chunk = allPaths.slice(i, i + VALIDATION_CHUNK_SIZE);
                            const resp = await validateImportPathsApiImagesImportValidatePost(
                                { local_paths: chunk },
                                undefined,
                                undefined,
                                abortController.signal
                            );
                            if (isCancelled || abortController.signal.aborted) return;
                            validatedItems = [...validatedItems, ...(resp.items || [])];
                            completedCount += chunk.length;
                            setValidationCount(completedCount);
                            setValidationProgress((completedCount / total) * 100);
                        }
                    }
                } else {
                    const total = initialFiles.length;
                    setValidationTotal(total);

                    if (total > 0) {
                        let completedCount = 0;
                        for (let i = 0; i < total; i += VALIDATION_CHUNK_SIZE) {
                            if (isCancelled || abortController.signal.aborted) return;
                            const chunk = initialFiles.slice(i, i + VALIDATION_CHUNK_SIZE);
                            const uploadPayload: BodyValidateImportUploadedFilesApiImagesImportValidateFilesPost = {
                                files: chunk as unknown as string[]
                            };
                            const resp = await validateImportUploadedFilesApiImagesImportValidateFilesPost(
                                uploadPayload,
                                undefined,
                                undefined,
                                abortController.signal
                            );
                            if (isCancelled || abortController.signal.aborted) {
                                if (resp.items) {
                                    resp.items.forEach(it => {
                                        if (it.local_path) stagedTempPaths.push(it.local_path);
                                    });
                                }
                                return;
                            }
                            const items = resp.items || [];
                            items.forEach(it => {
                                if (it.local_path) stagedTempPaths.push(it.local_path);
                            });
                            validatedItems = [...validatedItems, ...items];
                            completedCount += chunk.length;
                            setValidationCount(completedCount);
                            setValidationProgress((completedCount / total) * 100);
                        }
                    }
                }

                if (isCancelled || abortController.signal.aborted) return;

                const initialQueue: QueueItem[] = validatedItems.map((v, idx) => {
                    let objectUrl: string | null = null;
                    let isFolder = false;

                    if (!isElectron && initialFiles[idx]) {
                        objectUrl = URL.createObjectURL(initialFiles[idx]);
                    } else if (isElectron) {
                        const suffix = v.local_path.split('.').pop()?.toLowerCase();
                        const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
                        isFolder = !suffix || !imageExts.includes(suffix);
                    }

                    return {
                        ...v,
                        id: `item-${idx}-${Date.now()}`,
                        selected: v.is_valid,
                        filenameOverride: v.filename,
                        customTags: [],
                        customRating: null,
                        objectUrl,
                        isFolder
                    };
                });

                onValidated(initialQueue);
                setValidationProgress(100);
                setTimeout(() => {
                    if (!isCancelled && !abortController.signal.aborted) {
                        setIsValidating(false);
                    }
                }, PROGRESS_FINAL_DELAY_MS);
            } catch (err: unknown) {
                const isAborted = isCancelled ||
                    abortController.signal.aborted ||
                    axios.isCancel(err) ||
                    (err as { name?: string })?.name === 'CanceledError' ||
                    (err as { name?: string })?.name === 'AbortError';

                if (isAborted) {
                    if (!isElectron && stagedTempPaths.length > 0) {
                        cleanupImportTempFilesApiImagesImportCleanupTempPost({ paths: stagedTempPaths }).catch(() => {});
                    }
                    setIsValidating(false);
                    return;
                }

                console.error('[Import Modal] Validation failed:', err);
                showNotification({
                    title: 'Validation Error',
                    message: 'Failed to inspect files for import.',
                    color: 'red'
                });
                if (!isCancelled) {
                    setIsValidating(false);
                }
            }
        };

        runValidation();

        return () => {
            isCancelled = true;
            abortController.abort();
            if (!isElectron && stagedTempPaths.length > 0) {
                cleanupImportTempFilesApiImagesImportCleanupTempPost({ paths: stagedTempPaths }).catch(() => {});
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opened, pathsKey, isElectron, onValidated, showNotification]);

    return {
        isValidating: opened && !isCancelledByUser && isValidating,
        validationProgress: opened && !isCancelledByUser ? validationProgress : 0,
        validationCount: opened && !isCancelledByUser ? validationCount : 0,
        validationTotal: opened && !isCancelledByUser ? validationTotal : 0,
        cancelValidation
    };
}
