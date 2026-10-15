/**
 * @file
 * Module: Creator Types and Platform Constants
 * Description: Type definitions and constants for creator social profiles.
 */

import { PLATFORM_OPTIONS } from '../constants/creator';

export type PlatformType = (typeof PLATFORM_OPTIONS)[number]['value'];

export interface SocialLink {
    platform: PlatformType;
    url: string;
}
