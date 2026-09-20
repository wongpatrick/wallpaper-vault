/**
 * @file
 * Type declaration merging for AxiosRequestConfig to support custom interceptor bypass.
 */
import 'axios';

declare module 'axios' {
    export interface AxiosRequestConfig {
        skipAuthInterceptor?: boolean;
    }
    export interface InternalAxiosRequestConfig {
        skipAuthInterceptor?: boolean;
    }
}
