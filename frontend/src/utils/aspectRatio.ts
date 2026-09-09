/**
 * @file
 * Module: Aspect Ratio Utilities
 * Description: Helper functions and colors for image aspect ratio display.
 */

export function getARColor(label: string): string {
    const l = label.toLowerCase();
    if (l.includes('16/9') || l.includes('16x9')) return 'var(--mantine-color-blue-6)';
    if (l.includes('21/9') || l.includes('21x9')) return 'var(--mantine-color-teal-6)';
    if (l.includes('9/16') || l.includes('9x16')) return 'var(--mantine-color-orange-6)';
    if (l.includes('16/10') || l.includes('16x10')) return 'var(--mantine-color-indigo-6)';
    return 'var(--mantine-color-gray-6)';
}
