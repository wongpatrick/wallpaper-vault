/**
 * @file
 * Module: CropOverlayGrid Component
 * Description: Renders the standard rule-of-thirds grid guidelines inside an active crop viewport.
 */
import type { CSSProperties } from 'react';
import { Box } from '@mantine/core';

export interface CropOverlayGridProps {
    color?: string;
    lineStyle?: 'dashed' | 'solid';
}

export function CropOverlayGrid({
    color = 'rgba(255, 255, 255, 0.4)',
    lineStyle = 'solid'
}: CropOverlayGridProps) {
    const isDashed = lineStyle === 'dashed';

    const horizontalStyle: CSSProperties = isDashed
        ? {
            position: 'absolute',
            left: 0,
            right: 0,
            height: '1px',
            borderTop: `1px dashed ${color}`,
            boxSizing: 'border-box',
            pointerEvents: 'none'
        }
        : {
            position: 'absolute',
            left: 0,
            right: 0,
            height: '1px',
            backgroundColor: color,
            pointerEvents: 'none'
        };

    const verticalStyle: CSSProperties = isDashed
        ? {
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: '1px',
            borderLeft: `1px dashed ${color}`,
            boxSizing: 'border-box',
            pointerEvents: 'none'
        }
        : {
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: '1px',
            backgroundColor: color,
            pointerEvents: 'none'
        };

    return (
        <>
            <Box style={{ ...horizontalStyle, top: '33.33%' }} />
            <Box style={{ ...horizontalStyle, top: '66.66%' }} />
            <Box style={{ ...verticalStyle, left: '33.33%' }} />
            <Box style={{ ...verticalStyle, left: '66.66%' }} />
        </>
    );
}
