/**
 * @file
 * Custom Axios instance for API communication.
 * Provides the base configuration and custom request wrapper
 * used by auto-generated API clients to interact with the backend.
 */
import Axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import { API_BASE_URL } from '../config';

export const AXIOS_INSTANCE = Axios.create({
    baseURL: API_BASE_URL,
    paramsSerializer: {
        indexes: null
    }
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