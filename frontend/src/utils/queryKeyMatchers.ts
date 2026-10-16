/**
 * @file
 * Centralized query key matching utilities for React Query cache invalidation.
 * Handles both direct keys and multi-vault prefixed query keys.
 */
import type { QueryKey } from '@tanstack/react-query';

/**
 * Check if a query key matches a specific endpoint target.
 * Matches:
 * - `target` directly or starts with `/api/${target}`
 * - `['multi-vault', target, ...]` or `['multi-vault', '/api/${target}...', ...]`
 */
export function matchesEndpoint(queryKey: QueryKey, target: string): boolean {
    if (!Array.isArray(queryKey) || queryKey.length === 0) {
        return false;
    }

    const key0 = queryKey[0];
    const key1 = queryKey[1];

    if (typeof key0 === 'string') {
        if (key0 === target || key0.startsWith(`/api/${target}`)) {
            return true;
        }
        if (key0 === 'multi-vault' && typeof key1 === 'string' && (key1 === target || key1.startsWith(`/api/${target}`))) {
            return true;
        }
    }

    return false;
}

/**
 * Check if a query key matches any of the given endpoint targets.
 */
export function matchesAnyEndpoint(queryKey: QueryKey, targets: readonly string[] | string[]): boolean {
    return targets.some((target) => matchesEndpoint(queryKey, target));
}
