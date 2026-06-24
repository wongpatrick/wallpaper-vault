/**
 * @file
 * E2E tests for Set CRUD and deletion workflows.
 */
import { test, expect } from './e2e.fixtures';

test.describe('Wallpaper Sets CRUD Workflows', () => {
  test('should display created sets, allow viewing details, and delete a set', async ({ window, testDir }) => {
    // 1. Setup by importing a set first
    await window.evaluate((mockPath) => {
      if (window.electron && window.electron.setMockImportPath) {
        window.electron.setMockImportPath(mockPath);
      }
      const file = new File([], 'temp_import_dir');
      const entry = {
        isDirectory: true,
        isFile: false,
        name: 'temp_import_dir',
        createReader: () => ({ readEntries: (success) => success([]) })
      };
      const mockEvent = new DragEvent('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(mockEvent, 'dataTransfer', {
        value: { files: [file], items: [{ webkitGetAsEntry: () => entry }] }
      });
      window.dispatchEvent(mockEvent);
    }, testDir);

    await expect(window.locator('text=Drag-and-Drop Import Manager')).toBeVisible({ timeout: 10000 });

    const setInput = window.locator('input[placeholder="Select Set or search/create (fallback: Imports)"]');
    await setInput.fill('Delete Test Set');
    await window.locator('text=+ Create new set: "Delete Test Set"').click();

    await window.locator('button:has-text("Import Selected")').click();
    await expect(window.locator('text=Batch Import Complete')).toBeVisible({ timeout: 25000 });

    // 2. Navigate to Sets page and check that "Delete Test Set" is visible
    await window.click('text=Sets');
    await expect(window.locator('h1:has-text("Wallpaper Sets")')).toBeVisible();

    const setCardTitle = window.locator('.mantine-Card-root', { hasText: 'Delete Test Set' });
    await expect(setCardTitle).toBeVisible();

    // 3. Open the context menu and delete the Set
    const setCard = window.locator('.mantine-Card-root', { hasText: 'Delete Test Set' }).first();
    const menuButton = setCard.locator('button:has(svg.tabler-icon-dots-vertical)');
    await menuButton.click();

    const deleteMenuItem = window.locator('text=Delete Set').filter({ visible: true });
    await expect(deleteMenuItem).toBeVisible();
    await deleteMenuItem.click();

    // Confirm deletion
    const confirmButton = window.locator('button:has-text("Delete permanently")');
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    // 4. Verify completion notification and grid removal
    await expect(window.locator('text=Set deleted')).toBeVisible({ timeout: 10000 });
    await expect(setCardTitle).not.toBeVisible();
  });
});
