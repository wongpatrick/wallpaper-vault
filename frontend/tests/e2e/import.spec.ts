/**
 * @file
 * E2E tests for image import workflows.
 */
import { test, expect } from './e2e.fixtures';

test.describe('Wallpaper Import and Indexing', () => {
  test('should import a folder, create a new set, and verify indexing', async ({ window, testDir }) => {
    // 1. Trigger the mock drop event by dispatching on window
    await window.evaluate((mockPath) => {
      if (window.electron && window.electron.setMockImportPath) {
        window.electron.setMockImportPath(mockPath);
      }
      const file = new File([], 'temp_import_dir');

      const entry = {
        isDirectory: true,
        isFile: false,
        name: 'temp_import_dir',
        createReader: () => ({
          readEntries: (success) => success([])
        })
      };

      const mockEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
      });

      Object.defineProperty(mockEvent, 'dataTransfer', {
        value: {
          files: [file],
          items: [{
            webkitGetAsEntry: () => entry
          }]
        }
      });

      window.dispatchEvent(mockEvent);
    }, testDir);

    // 2. Wait for Import Modal to open
    const modalHeader = window.locator('text=Drag-and-Drop Import Manager');
    await expect(modalHeader).toBeVisible({ timeout: 10000 });

    // 3. Set the target set
    const setInput = window.locator('input[placeholder="Select Set or search/create (fallback: Imports)"]');
    await setInput.fill('Import Test Set');
    
    // Select the "create new set" option from Mantine dropdown
    const createSetOption = window.locator('text=+ Create new set: "Import Test Set"');
    await expect(createSetOption).toBeVisible();
    await createSetOption.click();

    // 4. Set the creator
    const creatorInput = window.locator('input[placeholder="Type & Enter to add"]');
    await creatorInput.fill('E2E Artist');
    await creatorInput.press('Enter');

    // 5. Submit import
    const importButton = window.locator('button:has-text("Import Selected")');
    await importButton.click();

    // 6. Verify notification and wait for job completion
    await expect(window.locator('text=Import Started')).toBeVisible();
    await expect(window.locator('text=Batch Import Complete')).toBeVisible({ timeout: 25000 });

    // 7. Verify images render in Images view
    await window.click('text=Images');
    await expect(window.locator('text=Individual Wallpapers')).toBeVisible();

    // The two dummy images should have been imported
    const imageElements = window.locator('img[alt*="image"]');
    await expect(imageElements).toHaveCount(2, { timeout: 10000 });
  });
});
