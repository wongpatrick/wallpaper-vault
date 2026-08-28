/**
 * @file
 * Unit tests for AXIOS_INSTANCE interceptors.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { InternalAxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { AXIOS_INSTANCE } from './axios-instance';

describe('AXIOS_INSTANCE interceptors', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
    });

    describe('request interceptor', () => {
        // Find the registered request interceptor handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const getRequestHandler = (): ((config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const handlers = (AXIOS_INSTANCE.interceptors.request as any).handlers;
            return handlers[handlers.length - 1].fulfilled;
        };

        it('injects api_key from localStorage if no X-API-Key header is present', () => {
            localStorage.setItem('api_key', 'test-local-api-key');
            const handler = getRequestHandler();

            const config = {
                headers: {}
            } as unknown as InternalAxiosRequestConfig;

            const result = handler(config);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect((result.headers as any)['X-API-Key']).toBe('test-local-api-key');
        });

        it('skips API key injection when skipAuthInterceptor is true', () => {
            localStorage.setItem('api_key', 'test-local-api-key');
            const handler = getRequestHandler();

            const config = {
                headers: {},
                skipAuthInterceptor: true
            } as unknown as InternalAxiosRequestConfig;

            const result = handler(config);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect((result.headers as any)?.['X-API-Key']).toBeUndefined();
        });

        it('preserves existing X-API-Key even if localStorage has a different key', () => {
            localStorage.setItem('api_key', 'test-local-api-key');
            const handler = getRequestHandler();

            const config = {
                headers: {
                    'X-API-Key': 'remote-vault-key'
                }
            } as unknown as InternalAxiosRequestConfig;

            const result = handler(config);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect((result.headers as any)['X-API-Key']).toBe('remote-vault-key');
        });
    });

    describe('response interceptor', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const getResponseErrorHandler = (): ((error: AxiosError) => Promise<never>) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const handlers = (AXIOS_INSTANCE.interceptors.response as any).handlers;
            return handlers[handlers.length - 1].rejected;
        };

        it('dispatches unauthorized-api-call on 401 when skipAuthInterceptor is not set', async () => {
            const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
            const errorHandler = getResponseErrorHandler();

            const error = {
                config: {},
                response: { status: 401 } as AxiosResponse
            } as AxiosError;

            await expect(errorHandler(error)).rejects.toBe(error);
            expect(dispatchSpy).toHaveBeenCalledTimes(1);
        });

        it('does not dispatch unauthorized-api-call on 401 when skipAuthInterceptor is true', async () => {
            const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
            const errorHandler = getResponseErrorHandler();

            const error = {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                config: { skipAuthInterceptor: true } as any,
                response: { status: 401 } as AxiosResponse
            } as AxiosError;

            await expect(errorHandler(error)).rejects.toBe(error);
            expect(dispatchSpy).not.toHaveBeenCalled();
        });
    });
});
