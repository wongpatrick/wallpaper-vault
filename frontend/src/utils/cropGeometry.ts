/**
 * @file
 * Module: Crop Geometry Utilities
 * Description: Pure mathematical helpers for image cropping, including aspect ratio parsing,
 * initial centered box sizing, boundary clamping, and coordinate scaling.
 */

export const DEFAULT_ASPECT_RATIO_NUMERATOR = 16;
export const DEFAULT_ASPECT_RATIO_DENOMINATOR = 9;
export const DEFAULT_CROP_SCALE = 0.8;

export interface CropRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Parses aspect ratio string (e.g. "16:9", "4:3", "free", "custom") to numeric ratio (width / height).
 */
export function parseAspectRatio(
    ratio: string,
    customRatio?: { w: number; h: number },
    defaultRatio: number = DEFAULT_ASPECT_RATIO_NUMERATOR / DEFAULT_ASPECT_RATIO_DENOMINATOR
): number {
    if (ratio === 'free') return 1;
    if (ratio === 'custom' && customRatio) {
        return (customRatio.w || 1) / (customRatio.h || 1);
    }
    try {
        const [w, h] = ratio.split(':').map(Number);
        if (!w || !h || isNaN(w) || isNaN(h)) return defaultRatio;
        return w / h;
    } catch {
        return defaultRatio;
    }
}

/**
 * Computes an initial crop box centered within the given container dimensions
 * scaled to `scale` (default 0.8 / 80%).
 */
export function computeInitialCropBox(
    containerWidth: number,
    containerHeight: number,
    aspectRatio: number | 'free',
    scale: number = DEFAULT_CROP_SCALE
): CropRect {
    let width = containerWidth * scale;
    let height = containerHeight * scale;

    if (aspectRatio !== 'free') {
        const ratio = typeof aspectRatio === 'number' ? aspectRatio : 1;
        if (width / height > ratio) {
            width = height * ratio;
        } else {
            height = width / ratio;
        }
    }

    return {
        x: (containerWidth - width) / 2,
        y: (containerHeight - height) / 2,
        width,
        height
    };
}

/**
 * Clamps a crop position (x, y) so that the crop box stays strictly within bounds [0, maxBounds - cropSize].
 */
export function clampCropPosition(
    x: number,
    y: number,
    cropWidth: number,
    cropHeight: number,
    boundsWidth: number,
    boundsHeight: number
): { x: number; y: number } {
    const maxX = Math.max(0, boundsWidth - cropWidth);
    const maxY = Math.max(0, boundsHeight - cropHeight);
    return {
        x: Math.max(0, Math.min(x, maxX)),
        y: Math.max(0, Math.min(y, maxY))
    };
}

/**
 * Scales crop coordinates between coordinate spaces (e.g. natural <-> display).
 */
export function scaleCoordinates(
    rect: CropRect,
    scaleX: number,
    scaleY: number = scaleX
): CropRect {
    return {
        x: rect.x * scaleX,
        y: rect.y * scaleY,
        width: rect.width * scaleX,
        height: rect.height * scaleY
    };
}
