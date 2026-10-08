/**
 * @file
 * Module: useCropModalState Hook
 * Description: Manages crop aspect ratio, saliency detection preview queries, coordinate clamping, and saving mutations.
 */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { parseAspectRatio, computeInitialCropBox, clampCropPosition } from '../../../utils/cropGeometry';
import { useCropImageApiImagesImageIdCropPost } from '../../../api/generated/images/images';
import { useAppNotifications } from '../../../hooks/useAppNotifications';
import type { Image as ImageModel } from '../../../api/model';

const DEFAULT_CROP_PERCENT = 80;
const PERCENT_SCALE = 100;
const DEFAULT_CUSTOM_CROP_OFFSET_RATIO = 0.1;

export interface UseCropModalStateOptions {
    image: ImageModel | null;
    opened: boolean;
    onClose: () => void;
    onCropSuccess?: (updatedImage: ImageModel) => void;
}

export function useCropModalState({
    image,
    opened,
    onClose,
    onCropSuccess
}: UseCropModalStateOptions) {
    const { showNotification } = useAppNotifications();
    const { mutateAsync, isPending } = useCropImageApiImagesImageIdCropPost();

    const [aspectRatio, setAspectRatio] = useState<string>('16:9');
    const [saveMode, setSaveMode] = useState<string>('new');
    const [cropSize, setCropSize] = useState<number>(DEFAULT_CROP_PERCENT);
    const [customWidth, setCustomWidth] = useState<number>(DEFAULT_CROP_PERCENT);
    const [customHeight, setCustomHeight] = useState<number>(DEFAULT_CROP_PERCENT);
    const [displayDimensions, setDisplayDimensions] = useState<{ width: number; height: number } | null>(null);
    const [cropX, setCropX] = useState<number>(0);
    const [cropY, setCropY] = useState<number>(0);
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const [dragStart, setDragStart] = useState<{ clientX: number; clientY: number; startBoxX: number; startBoxY: number }>({ clientX: 0, clientY: 0, startBoxX: 0, startBoxY: 0 });

    const imageRef = useRef<HTMLImageElement>(null);

    const currentAR = useMemo(() => {
        return parseAspectRatio(aspectRatio);
    }, [aspectRatio]);

    // Trigger preview fetch from backend when aspect ratio changes
    useEffect(() => {
        if (!opened || !image || !displayDimensions) return;
        if (aspectRatio === 'custom') return;

        const fetchPreview = async () => {
            try {
                const res = await mutateAsync({
                    imageId: image.id,
                    data: {
                        aspect_ratio: aspectRatio,
                        save_mode: 'new',
                        preview_only: true
                    }
                });

                if (res.x !== undefined && res.x !== null &&
                    res.y !== undefined && res.y !== null &&
                    res.width !== undefined && res.width !== null) {
                    setCropX(res.x);
                    setCropY(res.y);

                    const maxW = image.width || 1;
                    const maxH = image.height || 1;
                    let maxCropW = maxW;
                    if (maxW / maxH >= currentAR) {
                        maxCropW = maxH * currentAR;
                    }
                    const pct = Math.round((res.width / maxCropW) * PERCENT_SCALE);
                    setCropSize(pct);
                }
            } catch (err) {
                console.error('Failed to fetch crop preview', err);
            }
        };

        fetchPreview();
    }, [aspectRatio, displayDimensions, image, opened, currentAR, mutateAsync]);

    // Compute current crop box size in original coordinates
    const originalCropW = useMemo(() => {
        if (!image) return 0;
        if (aspectRatio === 'custom') {
            return (image.width || 1) * (customWidth / PERCENT_SCALE);
        }
        const maxW = image.width || 1;
        const maxH = image.height || 1;

        let maxCropW = maxW;
        if (maxW / maxH >= currentAR) {
            maxCropW = maxH * currentAR;
        }
        return maxCropW * (cropSize / PERCENT_SCALE);
    }, [image, aspectRatio, currentAR, cropSize, customWidth]);

    const originalCropH = useMemo(() => {
        if (!image) return 0;
        if (aspectRatio === 'custom') {
            return (image.height || 1) * (customHeight / PERCENT_SCALE);
        }
        const maxW = image.width || 1;
        const maxH = image.height || 1;

        let maxCropH = maxH;
        if (maxW / maxH < currentAR) {
            maxCropH = maxW / currentAR;
        }
        return maxCropH * (cropSize / PERCENT_SCALE);
    }, [image, aspectRatio, currentAR, cropSize, customHeight]);

    // Derived clamped coordinates in original space
    const maxOriginalW = image?.width || 1;
    const maxOriginalH = image?.height || 1;

    const { x: clampedCropX, y: clampedCropY } = clampCropPosition(
        cropX,
        cropY,
        originalCropW,
        originalCropH,
        maxOriginalW,
        maxOriginalH
    );

    // Convert to display coordinates
    const scale = displayDimensions && image && image.width ? displayDimensions.width / image.width : 1;

    const displayBox = {
        x: clampedCropX * scale,
        y: clampedCropY * scale,
        w: originalCropW * scale,
        h: originalCropH * scale
    };

    const handleImageLoad = useCallback(() => {
        if (imageRef.current && image) {
            const dims = {
                width: imageRef.current.clientWidth,
                height: imageRef.current.clientHeight
            };
            setDisplayDimensions(dims);

            const maxW = image.width || 1;
            const maxH = image.height || 1;
            const initialBox = computeInitialCropBox(maxW, maxH, currentAR, DEFAULT_CROP_PERCENT / PERCENT_SCALE);

            setCropX(initialBox.x);
            setCropY(initialBox.y);
        }
    }, [image, currentAR]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (!displayDimensions || !image) return;

        e.preventDefault();
        setIsDragging(true);
        setDragStart({
            clientX: e.clientX,
            clientY: e.clientY,
            startBoxX: clampedCropX,
            startBoxY: clampedCropY
        });
    }, [displayDimensions, image, clampedCropX, clampedCropY]);

    useEffect(() => {
        if (!isDragging || !displayDimensions || !image) return;

        const scaleVal = displayDimensions.width / (image.width || 1);

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const deltaX = (moveEvent.clientX - dragStart.clientX) / scaleVal;
            const deltaY = (moveEvent.clientY - dragStart.clientY) / scaleVal;

            const newX = dragStart.startBoxX + deltaX;
            const newY = dragStart.startBoxY + deltaY;

            const clamped = clampCropPosition(newX, newY, originalCropW, originalCropH, image.width || 1, image.height || 1);
            setCropX(clamped.x);
            setCropY(clamped.y);
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, displayDimensions, image, dragStart, originalCropW, originalCropH]);

    const handleAspectRatioChange = useCallback((val: string) => {
        setAspectRatio(val);
        if (val === 'custom' && image) {
            setCustomWidth(DEFAULT_CROP_PERCENT);
            setCustomHeight(DEFAULT_CROP_PERCENT);
            setCropX((image.width || 1) * DEFAULT_CUSTOM_CROP_OFFSET_RATIO);
            setCropY((image.height || 1) * DEFAULT_CUSTOM_CROP_OFFSET_RATIO);
        }
    }, [image]);

    const handleSave = useCallback(async () => {
        if (!image) return;

        const finalX = Math.round(clampedCropX);
        const finalY = Math.round(clampedCropY);
        const finalW = Math.round(originalCropW);
        const finalH = Math.round(originalCropH);

        try {
            const res = await mutateAsync({
                imageId: image.id,
                data: {
                    aspect_ratio: aspectRatio,
                    x: finalX,
                    y: finalY,
                    width: finalW,
                    height: finalH,
                    save_mode: saveMode as 'new' | 'replace',
                    preview_only: false
                }
            });

            showNotification({
                title: 'Success',
                message: saveMode === 'replace' ? 'Original image successfully replaced.' : 'Cropped image saved as new wallpaper.',
                color: 'green'
            });

            if (res.image) {
                onCropSuccess?.(res.image as ImageModel);
            }
            onClose();
        } catch (err) {
            showNotification({
                title: 'Error',
                message: 'Failed to crop image. Please check backend logs.',
                color: 'red'
            });
            console.error(err);
        }
    }, [image, clampedCropX, clampedCropY, originalCropW, originalCropH, mutateAsync, aspectRatio, saveMode, showNotification, onCropSuccess, onClose]);

    return {
        aspectRatio,
        handleAspectRatioChange,
        saveMode,
        setSaveMode,
        cropSize,
        setCropSize,
        customWidth,
        setCustomWidth,
        customHeight,
        setCustomHeight,
        displayDimensions,
        displayBox,
        originalCropW,
        originalCropH,
        clampedCropX,
        clampedCropY,
        isDragging,
        isPending,
        imageRef,
        handleImageLoad,
        handleMouseDown,
        handleSave
    };
}
