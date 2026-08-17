/**
 * @file
 * Centralized configuration settings and environment helpers for the frontend.
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
export const IS_DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
export const isElectron = typeof window !== 'undefined' && 'electron' in window;

