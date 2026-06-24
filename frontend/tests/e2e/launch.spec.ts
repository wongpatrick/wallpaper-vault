/**
 * @file
 * E2E tests for application launch workflows.
 */
import { test, expect } from './e2e.fixtures';

test.describe('App Launch', () => {
  test('should launch successfully and render dashboard', async ({ window }) => {
    // Check browser title
    await expect(window).toHaveTitle(/frontend/);
    
    // Check if the dashboard title is visible
    const dashboardTitle = window.locator('h1:has-text("Dashboard")');
    await expect(dashboardTitle).toBeVisible();

    // Check library stats card is rendered
    const libraryStats = window.locator('text=Total Images');
    await expect(libraryStats).toBeVisible();
  });
});
