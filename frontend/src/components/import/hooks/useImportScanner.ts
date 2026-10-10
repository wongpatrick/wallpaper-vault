/**
 * @file
 * Hook for chunked validation and scanning of import candidate files/paths.
 */
import { useState, useEffect } from 'react';
import { useAppNotifications } from '../../../hooks/useAppNotifications';
import {
    useValidateImportPathsApiImagesImportValidatePost,
    useValidateImportUploadedFilesApiImagesImportValidateFilesPost,
    useScanImportPathsApiImagesImportScanPathsPost
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
    const validatePathsMutation = useValidateImportPathsApiImagesImportValidatePost();
    const validateFilesMutation = useValidateImportUploadedFilesApiImagesImportValidateFilesPost();
    const scanPathsMutation = useScanImportPathsApiImagesImportScanPathsPost();

    const [isValidating, setIsValidating] = useState(false);
    const [validationProgress, setValidationProgress] = useState(0);
    const [validationCount, setValidationCount] = useState(0);
    const [validationTotal, setValidationTotal] = useState(0);

    useEffect(() => {
        if (!opened) {
            setIsValidating(false);
            setValidationProgress(0);
            setValidationCount(0);
            setValidationTotal(0);
            return;
        }

        let isCancelled = false;

        const runValidation = async () => {
            setIsValidating(true);
            setValidationProgress(0);
            setValidationCount(0);
            setValidationTotal(0);

            try {
                let validatedItems: ImageValidationItem[] = [];

                if (isElectron) {
                    const allPaths = await scanPathsMutation.mutateAsync({
                        data: { local_paths: initialLocalPaths }
                    });
                    if (isCancelled) return;

                    const total = allPaths.length;
                    setValidationTotal(total);

                    if (total > 0) {
                        let completedCount = 0;
                        for (let i = 0; i < total; i += VALIDATION_CHUNK_SIZE) {
                            if (isCancelled) return;
                            const chunk = allPaths.slice(i, i + VALIDATION_CHUNK_SIZE);
                            const resp = await validatePathsMutation.mutateAsync({
                                data: { local_paths: chunk }
                            });
                            if (isCancelled) return;
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
                            if (isCancelled) return;
                            const chunk = initialFiles.slice(i, i + VALIDATION_CHUNK_SIZE);
                            const uploadPayload: BodyValidateImportUploadedFilesApiImagesImportValidateFilesPost = {
                                files: chunk as unknown as string[]
                            };
                            const resp = await validateFilesMutation.mutateAsync({
                                data: uploadPayload
                            });
                            if (isCancelled) return;
                            validatedItems = [...validatedItems, ...(resp.items || [])];
                            completedCount += chunk.length;
                            setValidationCount(completedCount);
                            setValidationProgress((completedCount / total) * 100);
                        }
                    }
                }

                if (isCancelled) return;

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
                    if (!isCancelled) {
                        setIsValidating(false);
                    }
                }, PROGRESS_FINAL_DELAY_MS);
            } catch (err) {
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
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opened]);

    return {
        isValidating,
        validationProgress,
        validationCount,
        validationTotal
    };
}
