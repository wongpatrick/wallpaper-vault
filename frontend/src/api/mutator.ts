/**
 * @file
 * Orval custom mutator wrapper.
 * Decoupled from the runtime Axios instance configuration to avoid
 * compile-time environment variable parser warnings during Orval code generation.
 */
import Axios, { AxiosError, type AxiosRequestConfig } from 'axios';

// Placeholder instance that is configured at runtime by axios-instance.ts
let axiosInstance = Axios.create();

/**
 * Configure the runtime Axios instance used by the mutator.
 *
 * @param instance The fully configured Axios instance
 */
export const setMutatorAxiosInstance = (instance: ReturnType<typeof Axios.create>) => {
    axiosInstance = instance;
};

/**
 * Custom Axios request wrapper used by the auto-generated API clients.
 */
export const customInstance = <T>(
  config: AxiosRequestConfig,
  options?: AxiosRequestConfig,
): Promise<T> => {
  return axiosInstance({
    ...config,
    ...options,
  }).then(({ data }) => data);
};

export type ErrorType<Error> = AxiosError<Error>;

export type BodyType<BodyData> = BodyData;
