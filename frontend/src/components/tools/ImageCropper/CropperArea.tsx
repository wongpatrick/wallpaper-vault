import { Box } from '@mantine/core';
import type { CropState } from './useImageCropper';

interface CropperAreaProps {
    image: string;
    crop: CropState;
    imageRef: React.RefObject<HTMLImageElement | null>;
    onMouseDown: (e: React.MouseEvent, type: 'move' | 'resize') => void;
    onImageLoad: () => void;
}

export function CropperArea({ image, crop, imageRef, onMouseDown, onImageLoad }: CropperAreaProps) {
    return (
        <Box 
            style={{ 
                position: 'relative', 
                backgroundColor: '#1a1a1a',
                borderRadius: '8px',
                overflow: 'hidden',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: '400px'
            }}
        >
            <div style={{ position: 'relative' }}>
                <img 
                    ref={imageRef}
                    src={image} 
                    alt="To crop" 
                    style={{ maxWidth: '100%', maxHeight: '70vh', display: 'block', userSelect: 'none' }} 
                    onLoad={onImageLoad}
                />
                
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', pointerEvents: 'none' }} />
                
                <div 
                    style={{
                        position: 'absolute',
                        top: `${crop.y}px`,
                        left: `${crop.x}px`,
                        width: `${crop.width}px`,
                        height: `${crop.height}px`,
                        border: '2px solid #fff',
                        boxShadow: '0 0 0 9999px transparent',
                        cursor: 'move',
                        overflow: 'hidden'
                    }}
                    onMouseDown={(e) => onMouseDown(e, 'move')}
                >
                    <div style={{
                        position: 'absolute',
                        top: `-${crop.y}px`,
                        left: `-${crop.x}px`,
                        width: imageRef.current?.clientWidth,
                        height: imageRef.current?.clientHeight,
                        backgroundImage: `url(${image})`,
                        backgroundSize: '100% 100%',
                        pointerEvents: 'none'
                    }} />
                    
                    <div style={{ position: 'absolute', top: '33.33%', left: 0, right: 0, height: '1px', background: 'rgba(255,255,255,0.3)' }} />
                    <div style={{ position: 'absolute', top: '66.66%', left: 0, right: 0, height: '1px', background: 'rgba(255,255,255,0.3)' }} />
                    <div style={{ position: 'absolute', left: '33.33%', top: 0, bottom: 0, width: '1px', background: 'rgba(255,255,255,0.3)' }} />
                    <div style={{ position: 'absolute', left: '66.66%', top: 0, bottom: 0, width: '1px', background: 'rgba(255,255,255,0.3)' }} />

                    <div 
                        style={{
                            position: 'absolute',
                            right: 0,
                            bottom: 0,
                            width: '16px',
                            height: '16px',
                            backgroundColor: '#fff',
                            cursor: 'nwse-resize',
                            zIndex: 10
                        }}
                        onMouseDown={(e) => {
                            e.stopPropagation();
                            onMouseDown(e, 'resize');
                        }}
                    />
                </div>
            </div>
        </Box>
    );
}
