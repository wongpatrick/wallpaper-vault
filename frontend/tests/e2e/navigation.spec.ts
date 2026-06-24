/**
 * @file
 * E2E tests for navigation sidebar routes.
 */
import { test, expect } from './e2e.fixtures';

test.describe('Sidebar Navigation', () => {
  test('should navigate to all sidebar views', async ({ window }) => {
    // 1. Navigate to Creators
    await window.click('text=Creators');
    await expect(window.locator('text=Artists & Creators')).toBeVisible();

    // 2. Navigate to Sets
    await window.click('text=Sets');
    await expect(window.locator('h1:has-text("Wallpaper Sets")')).toBeVisible();

    // 3. Navigate to Playlists
    await window.click('text=Playlists');
    await expect(window.locator('h1:has-text("Collections & Playlists")')).toBeVisible();

    // 4. Navigate to Images
    await window.click('text=Images');
    await expect(window.locator('text=Individual Wallpapers')).toBeVisible();

    // 5. Navigate to Taxonomy
    await window.click('text=Taxonomy');
    await expect(window.locator('h2:has-text("Taxonomy Management")')).toBeVisible();

    // 6. Navigate to Tools
    await window.click('text=Tools');
    await expect(window.locator('text=Wallpaper Tools')).toBeVisible();

    // 7. Navigate to Settings
    await window.click('text=Settings');
    await expect(window.locator('h1:has-text("Settings")')).toBeVisible();

    // 8. Go back to Dashboard
    await window.click('text=Dashboard');
    await expect(window.locator('h1:has-text("Dashboard")')).toBeVisible();
  });
});
