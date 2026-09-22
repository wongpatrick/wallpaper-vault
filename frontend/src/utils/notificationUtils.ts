/**
 * @file
 * Helper utilities for generating unique notification IDs.
 */
const RADIX_BASE_36 = 36;
const RANDOM_SUBSTRING_START = 2;
const RANDOM_SUBSTRING_END = 9;

export function generateNotificationId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(RADIX_BASE_36).substring(RANDOM_SUBSTRING_START, RANDOM_SUBSTRING_END);
}
