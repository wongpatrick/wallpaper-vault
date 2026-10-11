/**
 * @file
 * Unit tests for imageUrl.ts.
 * Verifies image and thumbnail URL generation and fallback image constant.
 */
/* eslint-disable no-magic-numbers */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getImageUrl, getThumbnailUrl, FALLBACK_IMAGE } from './imageUrl';
import { AXIOS_INSTANCE } from '../api/axios-instance';
import { API_BASE_URL } from '../config';

describe('imageUrl', () => {
    let originalBaseURL: string | undefined;

    beforeEach(() => {
        localStorage.clear();
        originalBaseURL = AXIOS_INSTANCE.defaults.baseURL;
    });

    afterEach(() => {
        AXIOS_INSTANCE.defaults.baseURL = originalBaseURL;
    });

    describe('getImageUrl', () => {
        it('should return fallback image when imageId is falsy', () => {
            expect(getImageUrl(undefined)).toBe('https://placehold.co/600x400?text=No+Image');
            expect(getImageUrl(null)).toBe('https://placehold.co/600x400?text=No+Image');
            expect(getImageUrl('')).toBe('https://placehold.co/600x400?text=No+Image');
            expect(getImageUrl(0)).toBe('https://placehold.co/600x400?text=No+Image');
        });

        it('should generate URL with API_BASE_URL if AXIOS_INSTANCE baseURL is not set', () => {
            AXIOS_INSTANCE.defaults.baseURL = undefined;
            expect(getImageUrl(123)).toBe(`${API_BASE_URL}/api/images/file/123`);
        });

        it('should generate URL with AXIOS_INSTANCE baseURL if it is set', () => {
            AXIOS_INSTANCE.defaults.baseURL = 'http://custom-api.local';
            expect(getImageUrl(123)).toBe('http://custom-api.local/api/images/file/123');
        });

        it('should append cacheBuster parameter if provided', () => {
            AXIOS_INSTANCE.defaults.baseURL = 'http://custom-api.local';
            expect(getImageUrl(123, 'buster')).toBe('http://custom-api.local/api/images/file/123?cb=buster');
            expect(getImageUrl(123, 999)).toBe('http://custom-api.local/api/images/file/123?cb=999');
        });

        it('should append token query parameter when apiKeyOverride or localStorage api_key exists', () => {
            AXIOS_INSTANCE.defaults.baseURL = 'http://custom-api.local';
            expect(getImageUrl(123, undefined, undefined, 'my-key')).toBe('http://custom-api.local/api/images/file/123?token=my-key');

            localStorage.setItem('api_key', 'stored-token');
            expect(getImageUrl(123)).toBe('http://custom-api.local/api/images/file/123?token=stored-token');
        });
    });

    describe('getThumbnailUrl', () => {
        it('should return fallback image when imageId is falsy', () => {
            expect(getThumbnailUrl(undefined)).toBe('https://placehold.co/600x400?text=No+Image');
            expect(getThumbnailUrl(null)).toBe('https://placehold.co/600x400?text=No+Image');
        });

        it('should generate thumbnail URL with default size sm', () => {
            AXIOS_INSTANCE.defaults.baseURL = 'http://custom-api.local';
            expect(getThumbnailUrl(123)).toBe('http://custom-api.local/api/images/thumb/123?size=sm');
        });

        it('should generate thumbnail URL with specified size', () => {
            AXIOS_INSTANCE.defaults.baseURL = 'http://custom-api.local';
            expect(getThumbnailUrl(123, 'md')).toBe('http://custom-api.local/api/images/thumb/123?size=md');
            expect(getThumbnailUrl(123, 'lg')).toBe('http://custom-api.local/api/images/thumb/123?size=lg');
        });

        it('should append cacheBuster parameter if provided', () => {
            AXIOS_INSTANCE.defaults.baseURL = 'http://custom-api.local';
            expect(getThumbnailUrl(123, 'sm', 'buster')).toBe('http://custom-api.local/api/images/thumb/123?size=sm&cb=buster');
        });

        it('should append token query parameter when apiKeyOverride or localStorage api_key exists', () => {
            AXIOS_INSTANCE.defaults.baseURL = 'http://custom-api.local';
            expect(getThumbnailUrl(123, 'sm', undefined, undefined, 'my-key')).toBe('http://custom-api.local/api/images/thumb/123?size=sm&token=my-key');

            localStorage.setItem('api_key', 'stored-token');
            expect(getThumbnailUrl(123, 'sm')).toBe('http://custom-api.local/api/images/thumb/123?size=sm&token=stored-token');
        });
    });

    describe('FALLBACK_IMAGE', () => {
        it('should export a valid Unsplash placeholder URL', () => {
            expect(FALLBACK_IMAGE).toBeTypeOf('string');
            expect(FALLBACK_IMAGE).toContain('unsplash.com');
        });
    });
});
