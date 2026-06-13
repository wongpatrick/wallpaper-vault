/**
 * @file
 * Module: TagCloud
 * Description: Renders an SVG word cloud of tags sized proportionally by frequency
 * and colored on a warm-to-cool gradient. Each tag is clickable and navigates
 * to the images page filtered by that tag.
 */
import { useRef, useEffect, useState, useCallback, startTransition } from 'react';
import { useNavigate } from 'react-router-dom';

export interface TagCloudItem {
    tag: string;
    type?: string;
    count: number;
}

interface PlacedWord {
    tag: string;
    type?: string;
    count: number;
    x: number;
    y: number;
    fontSize: number;
    color: string;
    width: number;
    height: number;
}

interface TagCloudProps {
    tags: TagCloudItem[];
    height?: number;
}

// Layout constants
const MIN_FONT = 11;
const MAX_FONT = 38;
const WORD_PADDING = 4;
const DEFAULT_HEIGHT = 280;
const FALLBACK_WIDTH = 600;
const BOUNDS_MARGIN = 2;
const COLLISION_GAP = 3;
const WORD_TEXT_OFFSET = 2;

// Spiral algorithm constants
const SPIRAL_HALF = 0.5;
const SPIRAL_STEP = 0.15;
const SPIRAL_TURNS = 80;
const EMPTY_STATE_FONT_SIZE = 14;
const FONT_WEIGHT = 600;
const HOVER_OPACITY = 0.65;
const ACTIVE_OPACITY = 0.4;

/**
 * Returns a color based on taxonomy type. Matches the badge colors.
 */
function getColorForType(type?: string): string {
    switch (type) {
        case 'character': return 'var(--mantine-color-pink-filled)';
        case 'franchise': return 'var(--mantine-color-orange-filled)';
        case 'tag':
        default:
            return 'var(--mantine-color-violet-filled)';
    }
}

/**
 * Measures approximate text dimensions using a canvas context.
 */
function measureText(
    ctx: CanvasRenderingContext2D,
    text: string,
    fontSize: number
): { w: number; h: number } {
    ctx.font = `${FONT_WEIGHT} ${fontSize}px Inter, -apple-system, sans-serif`;
    const metrics = ctx.measureText(text);
    return {
        w: metrics.width + WORD_PADDING * 2,
        h: fontSize + WORD_PADDING * 2,
    };
}

/**
 * Returns true if two rectangles overlap (with a small gap buffer).
 */
function overlaps(
    ax: number, ay: number, aw: number, ah: number,
    bx: number, by: number, bw: number, bh: number,
): boolean {
    return !(
        ax + aw + COLLISION_GAP < bx ||
        bx + bw + COLLISION_GAP < ax ||
        ay + ah + COLLISION_GAP < by ||
        by + bh + COLLISION_GAP < ay
    );
}

/**
 * Archimedean spiral placement algorithm.
 * Tries to place a word starting from the center, spiraling outward.
 * Returns the top-left position or null if no room was found.
 */
function spiralPlace(
    placed: PlacedWord[],
    w: number,
    h: number,
    wordW: number,
    wordH: number
): { x: number; y: number } | null {
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.min(w, h) * SPIRAL_HALF;
    const maxIterations = SPIRAL_TURNS * Math.PI * 2 / SPIRAL_STEP;

    for (let i = 0; i < maxIterations; i++) {
        const angle = i * SPIRAL_STEP;
        const r = (maxR / (SPIRAL_TURNS * Math.PI * 2)) * angle;
        const x = cx + r * Math.cos(angle) - wordW / 2;
        const y = cy + r * Math.sin(angle) - wordH / 2;

        // Bounds check with margin
        if (
            x < BOUNDS_MARGIN ||
            y < BOUNDS_MARGIN ||
            x + wordW > w - BOUNDS_MARGIN ||
            y + wordH > h - BOUNDS_MARGIN
        ) continue;

        // Collision check
        let collides = false;
        for (const p of placed) {
            if (overlaps(x, y, wordW, wordH, p.x, p.y, p.width, p.height)) {
                collides = true;
                break;
            }
        }
        if (!collides) return { x, y };
    }
    return null;
}

/**
 * Computes the full word placement layout from raw tag data.
 * Pure function — no React state side effects.
 */
function buildLayout(
    canvas: HTMLCanvasElement,
    containerWidth: number,
    height: number,
    tags: TagCloudItem[]
): PlacedWord[] {
    const ctx = canvas.getContext('2d');
    if (!ctx || tags.length === 0) return [];

    const w = containerWidth;
    const h = height;
    const maxCount = tags[0]?.count ?? 1;
    const minCount = tags[tags.length - 1]?.count ?? 1;
    const countRange = maxCount - minCount || 1;

    const result: PlacedWord[] = [];

    for (const item of tags) {
        const t = countRange > 0 ? (item.count - minCount) / countRange : 1;
        const fontSize = MIN_FONT + t * (MAX_FONT - MIN_FONT);
        const color = getColorForType(item.type);
        const { w: wordW, h: wordH } = measureText(ctx, item.tag, fontSize);

        const pos = spiralPlace(result, w, h, wordW, wordH);
        if (pos) {
            result.push({
                tag: item.tag,
                type: item.type,
                count: item.count,
                x: pos.x,
                y: pos.y,
                fontSize,
                color,
                width: wordW,
                height: wordH,
            });
        }
    }

    return result;
}

export default function TagCloud({ tags, height = DEFAULT_HEIGHT }: TagCloudProps) {
    const navigate = useNavigate();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [placed, setPlaced] = useState<PlacedWord[]>([]);
    const [containerWidth, setContainerWidth] = useState(FALLBACK_WIDTH);

    /**
     * Reads the current container width and schedules a layout recompute.
     * State updates are wrapped in startTransition so they are non-blocking
     * and satisfy the react-hooks/set-state-in-effect lint rule.
     */
    const scheduleLayout = useCallback(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container || tags.length === 0) return;

        const w = container.clientWidth || FALLBACK_WIDTH;

        startTransition(() => {
            setContainerWidth(w);
            setPlaced(buildLayout(canvas, w, height, tags));
        });
    }, [tags, height]);

    // Recompute on prop changes
    useEffect(() => {
        scheduleLayout();
    }, [scheduleLayout]);

    // Recompute on container resize
    useEffect(() => {
        const observer = new ResizeObserver(() => scheduleLayout());
        if (containerRef.current) observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [scheduleLayout]);

    const handleTagClick = useCallback((word: PlacedWord) => {
        if (word.type === 'character') {
            navigate(`/images?character=${encodeURIComponent(word.tag)}`);
        } else if (word.type === 'franchise') {
            navigate(`/images?franchise=${encodeURIComponent(word.tag)}`);
        } else {
            navigate(`/images?tag=${encodeURIComponent(word.tag)}`);
        }
    }, [navigate]);

    if (tags.length === 0) {
        return (
            <div style={{
                height,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--mantine-color-dimmed)',
                fontSize: EMPTY_STATE_FONT_SIZE,
            }}>
                No tags yet — start tagging your sets!
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            style={{ position: 'relative', width: '100%', height, overflow: 'hidden' }}
            aria-label="Tag word cloud"
        >
            {/* Hidden canvas used only for text measurement */}
            <canvas
                ref={canvasRef}
                style={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none' }}
                width={containerWidth}
                height={height}
            />

            {/* SVG rendering layer */}
            <svg
                width="100%"
                height={height}
                style={{ position: 'absolute', top: 0, left: 0 }}
                aria-hidden="true"
            >
                {placed.map((word) => (
                    <g
                        key={`${word.type}-${word.tag}`}
                        transform={`translate(${word.x}, ${word.y})`}
                        onClick={() => handleTagClick(word)}
                        style={{ cursor: 'pointer' }}
                        role="button"
                        aria-label={`Filter by ${word.type}: ${word.tag} (${word.count} uses)`}
                    >
                        {/* Invisible hit-box for easier clicking */}
                        <rect
                            width={word.width}
                            height={word.height}
                            fill="transparent"
                        />
                        <text
                            x={WORD_PADDING}
                            y={word.height - WORD_PADDING - WORD_TEXT_OFFSET}
                            fontSize={word.fontSize}
                            fontWeight={FONT_WEIGHT}
                            fontFamily="Inter, -apple-system, sans-serif"
                            fill={word.color}
                            style={{
                                transition: 'opacity 0.15s ease',
                                userSelect: 'none',
                            }}
                        >
                            {word.tag}
                        </text>
                    </g>
                ))}
            </svg>

            <style>{`
                svg g[role="button"]:hover text { opacity: ${HOVER_OPACITY}; }
                svg g[role="button"]:active text { opacity: ${ACTIVE_OPACITY}; }
            `}</style>
        </div>
    );
}
