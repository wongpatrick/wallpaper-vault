/**
 * @file
 * Custom Axios instance and Orval mutator for API communication.
 * Provides the base configuration and custom request wrapper
 * used by auto-generated API clients to interact with the backend.
 */
import Axios, { type AxiosError, type AxiosRequestConfig } from 'axios';
import { API_BASE_URL } from '../config';

export const AXIOS_INSTANCE = Axios.create({
    baseURL: localStorage.getItem('backend_url') || API_BASE_URL,
    paramsSerializer: {
        indexes: null
    }
});

// Request interceptor to append API key Authorization header
AXIOS_INSTANCE.interceptors.request.use((config) => {
    const shouldSkipAuth = config.skipAuthInterceptor;
    if (shouldSkipAuth) {
        return config;
    }
    const key = localStorage.getItem('api_key') || '';
    const hasAuthHeader = Boolean(
        config.headers?.['Authorization'] ||
        config.headers?.['authorization'] ||
        config.headers?.['X-API-Key'] ||
        config.headers?.['x-api-key']
    );
    if (key && !hasAuthHeader) {
        config.headers = config.headers || {};
        config.headers['Authorization'] = `Bearer ${key}`;
    }
    return config;
}, (error) => {
    return Promise.reject(error);
});

// Response interceptor to intercept 401 Unauthorized errors
AXIOS_INSTANCE.interceptors.response.use((response) => {
    return response;
}, (error) => {
    const shouldSkipAuth = error.config?.skipAuthInterceptor;
    // eslint-disable-next-line no-magic-numbers
    if (!shouldSkipAuth && error.response && error.response.status === 401) {
        window.dispatchEvent(new Event('unauthorized-api-call'));
    }
    return Promise.reject(error);
});

/**
 * Custom Axios request wrapper used by the auto-generated API clients.
 */
export const customInstance = <T>(
    config: AxiosRequestConfig,
    options?: AxiosRequestConfig,
): Promise<T> => {
    return AXIOS_INSTANCE({
        ...config,
        ...options,
    }).then(({ data }) => data);
};

export type ErrorType<Error> = AxiosError<Error>;

export type BodyType<BodyData> = BodyData;