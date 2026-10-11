/**
 * @file
 * Unit tests for AXIOS_INSTANCE interceptors.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { InternalAxiosRequestConfig, AxiosResponse, AxiosError, AxiosHeaders } from 'axios';
import { AXIOS_INSTANCE } from './axios-instance';

describe('AXIOS_INSTANCE interceptors', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
    });

    describe('request interceptor', () => {
        // Find the registered request interceptor handler
        const getRequestHandler = (): ((config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig) => {
            const interceptorManager = AXIOS_INSTANCE.interceptors.request as unknown as {
                handlers: Array<{ fulfilled: (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig }>;
            };
            return interceptorManager.handlers[interceptorManager.handlers.length - 1].fulfilled;
        };

        it('injects Bearer token into Authorization header from localStorage if not present', () => {
            localStorage.setItem('api_key', 'test-local-api-key');
            const handler = getRequestHandler();

            const config = {
                headers: {} as AxiosHeaders
            } as InternalAxiosRequestConfig;

            const result = handler(config);
            expect(result.headers['Authorization']).toBe('Bearer test-local-api-key');
        });

        it('skips API key injection when skipAuthInterceptor is true', () => {
            localStorage.setItem('api_key', 'test-local-api-key');
            const handler = getRequestHandler();

            const config = {
                headers: {} as AxiosHeaders,
                skipAuthInterceptor: true
            } as InternalAxiosRequestConfig;

            const result = handler(config);
            expect(result.headers['Authorization']).toBeUndefined();
            expect(result.headers['X-API-Key']).toBeUndefined();
        });

        it('preserves existing Authorization header even if localStorage has a different key', () => {
            localStorage.setItem('api_key', 'test-local-api-key');
            const handler = getRequestHandler();

            const config = {
                headers: {
                    'Authorization': 'Bearer remote-vault-key'
                } as unknown as AxiosHeaders
            } as InternalAxiosRequestConfig;

            const result = handler(config);
            expect(result.headers['Authorization']).toBe('Bearer remote-vault-key');
        });

        it('preserves existing X-API-Key header even if localStorage has a different key', () => {
            localStorage.setItem('api_key', 'test-local-api-key');
            const handler = getRequestHandler();

            const config = {
                headers: {
                    'X-API-Key': 'remote-vault-key'
                } as unknown as AxiosHeaders
            } as InternalAxiosRequestConfig;

            const result = handler(config);
            expect(result.headers['X-API-Key']).toBe('remote-vault-key');
            expect(result.headers['Authorization']).toBeUndefined();
        });
    });

    describe('response interceptor', () => {
        const getResponseErrorHandler = (): ((error: AxiosError) => Promise<never>) => {
            const interceptorManager = AXIOS_INSTANCE.interceptors.response as unknown as {
                handlers: Array<{ rejected: (error: AxiosError) => Promise<never> }>;
            };
            return interceptorManager.handlers[interceptorManager.handlers.length - 1].rejected;
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
                config: { skipAuthInterceptor: true },
                response: { status: 401 } as AxiosResponse
            } as AxiosError;

            await expect(errorHandler(error)).rejects.toBe(error);
            expect(dispatchSpy).not.toHaveBeenCalled();
        });
    });
});
