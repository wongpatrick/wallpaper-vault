/**
 * @file
 * React hook managing image cropping state and logic.
 * Handles drag, resize, and cropping operations.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import {
    parseAspectRatio,
    computeInitialCropBox,
    clampCropPosition
} from '../../../utils/cropGeometry';

export type AspectRatio = 'free' | '16:9' | '16:10' | '9:16' | '4:3' | '1:1' | 'custom';

export interface CropState {
    x: number;
    y: number;
    width: number;
    height: number;
}

const INITIAL_CROP_RATIO = 0.8;
const MIN_CROP_SIZE = 50;

export function useImageCropper() {
    const [image, setImage] = useState<string | null>(null);
    const [croppedImage, setCroppedImage] = useState<string | null>(null);
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
    const [customRatio, setCustomRatio] = useState({ w: 21, h: 9 });
    const [crop, setCrop] = useState<CropState>({ x: 0, y: 0, width: 0, height: 0 });
    const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [initialCrop, setInitialCrop] = useState<CropState>({ x: 0, y: 0, width: 0, height: 0 });

    const imageRef = useRef<HTMLImageElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const handleFile = (file: File) => {
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (event) => setImage(event.target?.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        handleFile(file);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
    };

    const resetImage = () => {
        setImage(null);
        setCroppedImage(null);
    };

    const getRatio = useCallback(() => {
        return parseAspectRatio(aspectRatio, customRatio);
    }, [aspectRatio, customRatio]);

    const handleImageLoad = useCallback(() => {
        if (!imageRef.current) return;
        const img = imageRef.current;
        const containerWidth = img.clientWidth;
        const containerHeight = img.clientHeight;

        if (containerWidth === 0 || containerHeight === 0) return;

        setImageDimensions({ width: containerWidth, height: containerHeight });

        const initialBox = computeInitialCropBox(
            containerWidth,
            containerHeight,
            aspectRatio === 'free' ? 'free' : getRatio(),
            INITIAL_CROP_RATIO
        );

        setCrop(initialBox);
    }, [aspectRatio, getRatio]);

    useEffect(() => {
        handleImageLoad();
    }, [aspectRatio, image, customRatio, handleImageLoad]);

    const handleMouseDown = (e: React.MouseEvent, type: 'move' | 'resize') => {
        e.preventDefault();
        setIsDragging(type === 'move');
        setIsResizing(type === 'resize');
        setDragStart({ x: e.clientX, y: e.clientY });
        setInitialCrop({ ...crop });
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDragging && !isResizing) return;
        if (!imageRef.current) return;

        const deltaX = e.clientX - dragStart.x;
        const deltaY = e.clientY - dragStart.y;
        const img = imageRef.current;

        if (isDragging) {
            setCrop(prev => {
                const clamped = clampCropPosition(
                    initialCrop.x + deltaX,
                    initialCrop.y + deltaY,
                    prev.width,
                    prev.height,
                    img.clientWidth,
                    img.clientHeight
                );
                return {
                    ...prev,
                    x: clamped.x,
                    y: clamped.y
                };
            });
        } else if (isResizing) {
            let newWidth = Math.max(MIN_CROP_SIZE, initialCrop.width + deltaX);
            let newHeight = Math.max(MIN_CROP_SIZE, initialCrop.height + deltaY);

            if (aspectRatio !== 'free') {
                const ratio = getRatio();
                if (Math.abs(deltaX) > Math.abs(deltaY)) {
                    newHeight = newWidth / ratio;
                } else {
                    newWidth = newHeight * ratio;
                }
            }

            if (initialCrop.x + newWidth > img.clientWidth) {
                newWidth = img.clientWidth - initialCrop.x;
                if (aspectRatio !== 'free') {
                    newHeight = newWidth / getRatio();
                }
            }
            if (initialCrop.y + newHeight > img.clientHeight) {
                newHeight = img.clientHeight - initialCrop.y;
                if (aspectRatio !== 'free') {
                    newWidth = newHeight * getRatio();
                }
            }

            setCrop(prev => ({ ...prev, width: newWidth, height: newHeight }));
        }
    }, [isDragging, isResizing, dragStart, initialCrop, aspectRatio, getRatio]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
        setIsResizing(false);
    }, []);

    useEffect(() => {
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleMouseMove, handleMouseUp]);

    const performCrop = () => {
        if (!imageRef.current || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const img = imageRef.current;
        const scaleX = img.naturalWidth / img.clientWidth;
        const scaleY = img.naturalHeight / img.clientHeight;

        canvas.width = crop.width * scaleX;
        canvas.height = crop.height * scaleY;

        ctx.drawImage(
            img,
            crop.x * scaleX,
            crop.y * scaleY,
            crop.width * scaleX,
            crop.height * scaleY,
            0,
            0,
            canvas.width,
            canvas.height
        );

        setCroppedImage(canvas.toDataURL('image/png'));
    };

    const downloadCropped = () => {
        if (!croppedImage) return;
        const link = document.createElement('a');
        link.download = `cropped-${Date.now()}.png`;
        link.href = croppedImage;
        link.click();
    };

    return {
        image,
        croppedImage,
        aspectRatio,
        setAspectRatio,
        customRatio,
        setCustomRatio,
        crop,
        imageRef,
        canvasRef,
        handleDrop,
        handleFileSelect,
        handleMouseDown,
        handleImageLoad,
        performCrop,
        downloadCropped,
        resetImage,
        imageDimensions
    };
}
