/**
 * @file
 * Module: Crop Geometry Utility Tests
 * Description: Unit tests for aspect ratio parsing, initial crop bounding box sizing, and coordinate clamping.
 */
/* eslint-disable no-magic-numbers */
import { describe, it, expect } from 'vitest';
import {
    parseAspectRatio,
    computeInitialCropBox,
    clampCropPosition,
    scaleCoordinates
} from './cropGeometry';

describe('cropGeometry utilities', () => {
    describe('parseAspectRatio', () => {
        it('parses standard "16:9" ratio string', () => {
            const ratio = parseAspectRatio('16:9');
            expect(ratio).toBeCloseTo(16 / 9, 5);
        });

        it('parses "4:3" ratio string', () => {
            const ratio = parseAspectRatio('4:3');
            expect(ratio).toBeCloseTo(4 / 3, 5);
        });

        it('returns 1 for "free" ratio', () => {
            expect(parseAspectRatio('free')).toBe(1);
        });

        it('parses custom ratio object when ratio is "custom"', () => {
            expect(parseAspectRatio('custom', { w: 21, h: 9 })).toBeCloseTo(21 / 9, 5);
        });

        it('falls back to default ratio on invalid format', () => {
            expect(parseAspectRatio('invalid')).toBeCloseTo(16 / 9, 5);
        });
    });

    describe('computeInitialCropBox', () => {
        it('calculates 80% centered crop box for landscape image with 16:9 ratio', () => {
            const box = computeInitialCropBox(1920, 1080, 16 / 9, 0.8);
            expect(box.width).toBeCloseTo(1920 * 0.8, 2);
            expect(box.height).toBeCloseTo(1080 * 0.8, 2);
            expect(box.x).toBeCloseTo((1920 - box.width) / 2, 2);
            expect(box.y).toBeCloseTo((1080 - box.height) / 2, 2);
        });

        it('constrains width when container is narrower than aspect ratio', () => {
            // Container 1000x1000 with 16:9 ratio
            const box = computeInitialCropBox(1000, 1000, 16 / 9, 0.8);
            // Default 80% is 800x800. 800/800 = 1 < 1.777, so width / height <= ratio -> height = width / ratio = 800 / (16/9) = 450
            expect(box.width).toBe(800);
            expect(box.height).toBeCloseTo(800 / (16 / 9), 2);
            expect(box.x).toBe((1000 - 800) / 2);
            expect(box.y).toBeCloseTo((1000 - box.height) / 2, 2);
        });

        it('supports free aspect ratio without ratio clamping', () => {
            const box = computeInitialCropBox(1000, 500, 'free', 0.8);
            expect(box.width).toBe(800);
            expect(box.height).toBe(400);
            expect(box.x).toBe(100);
            expect(box.y).toBe(50);
        });
    });

    describe('clampCropPosition', () => {
        it('leaves position untouched when inside bounds', () => {
            const clamped = clampCropPosition(50, 60, 200, 200, 500, 500);
            expect(clamped).toEqual({ x: 50, y: 60 });
        });

        it('clamps negative coordinates to 0', () => {
            const clamped = clampCropPosition(-20, -10, 100, 100, 400, 400);
            expect(clamped).toEqual({ x: 0, y: 0 });
        });

        it('clamps coordinate exceeding maximum bounds', () => {
            // max X is 500 - 200 = 300, max Y is 400 - 150 = 250
            const clamped = clampCropPosition(350, 300, 200, 150, 500, 400);
            expect(clamped).toEqual({ x: 300, y: 250 });
        });
    });

    describe('scaleCoordinates', () => {
        it('scales crop rect proportionally', () => {
            const original = { x: 100, y: 50, width: 200, height: 150 };
            const scaled = scaleCoordinates(original, 2, 2);
            expect(scaled).toEqual({
                x: 200,
                y: 100,
                width: 400,
                height: 300
            });
        });
    });
});
