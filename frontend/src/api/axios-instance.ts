/**
 * @file
 * Custom Axios instance for API communication.
 * Provides the base configuration and custom request wrapper
 * used by auto-generated API clients to interact with the backend.
 */
import Axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import { API_BASE_URL } from '../config';

export const AXIOS_INSTANCE = Axios.create({
    baseURL: localStorage.getItem('backend_url') || API_BASE_URL,
    paramsSerializer: {
        indexes: null
    }
});

// Request interceptor to append API key header
AXIOS_INSTANCE.interceptors.request.use((config) => {
    const key = localStorage.getItem('api_key') || '';
    if (key) {
        config.headers = config.headers || {};
        config.headers['X-API-Key'] = key;
    }
    return config;
}, (error) => {
    return Promise.reject(error);
});

// Response interceptor to intercept 401 Unauthorized errors
AXIOS_INSTANCE.interceptors.response.use((response) => {
    return response;
}, (error) => {
    // eslint-disable-next-line no-magic-numbers
    if (error.response && error.response.status === 401) {
        window.dispatchEvent(new Event('unauthorized-api-call'));
    }
    return Promise.reject(error);
});

export const customInstance = <T>(
  config: AxiosRequestConfig,
  options?: AxiosRequestConfig,
): Promise<T> => {
  const promise = AXIOS_INSTANCE({
    ...config,
    ...options,
  }).then(({ data }) => data);

  return promise;
};

export type ErrorType<Error> = AxiosError<Error>;

export type BodyType<BodyData> = BodyData;