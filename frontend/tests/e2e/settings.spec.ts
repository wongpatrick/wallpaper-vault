/**
 * @file
 * E2E tests for application settings and close behavior persistence.
 */
import { test, expect } from './e2e.fixtures';

test.describe('App Settings and IPC Integration', () => {
  test('should toggle close behavior settings and verify IPC persistence', async ({ window }) => {
    // 1. Navigate to Settings page
    await window.click('text=Settings');
    await expect(window.locator('h1:has-text("Settings")')).toBeVisible();

    // 2. Click on the Close Behavior Select dropdown
    const selectTrigger = window.locator('input[data-path="close_behavior"]');
    await expect(selectTrigger).toBeVisible();
    await selectTrigger.click();

    // 3. Click the option to exit completely
    const exitOption = window.getByRole('option', { name: 'Exit application completely' });
    await expect(exitOption).toBeVisible();
    await exitOption.click();
    const applyButton = window.locator('button:has-text("Apply Changes")');
    await expect(applyButton).toBeEnabled();
    await applyButton.click();

    // 5. Verify the save button becomes disabled again (saving completed)
    await expect(applyButton).toBeDisabled();

    // 6. Verify IPC returns the updated close behavior setting
    const closeBehavior = await window.evaluate(async () => {
      return await window.electron.getCloseBehavior();
    });
    expect(closeBehavior).toBe('exit');
  });
});
