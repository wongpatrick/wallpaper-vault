/**
 * @file
 * E2E tests for image metadata editing and tagging workflows.
 */
import { test, expect } from './e2e.fixtures';

test.describe('Image Metadata Workflows', () => {
  test('should allow editing individual image metadata and tags', async ({ window, testDir }) => {
    // Wait for dashboard to load and layout to mount before dropping
    await expect(window.locator('h1:has-text("Dashboard")')).toBeVisible({ timeout: 15000 });

    // 1. Setup: Import a set first
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
    await setInput.fill('Metadata Test Set');
    await window.locator('text=+ Create new set: "Metadata Test Set"').click();

    await window.locator('button:has-text("Import Selected")').click();
    await expect(window.locator('text=Batch Import Complete')).toBeVisible({ timeout: 25000 });

    // 2. Go to Sets page, click on the new set to view its details
    await window.click('text=Sets');
    await window.click('text=Metadata Test Set');
    await expect(window.locator('h1:has-text("Metadata Test Set")')).toBeVisible();

    // 3. Open the first image in the gallery (Lightbox)
    const galleryImage = window.locator('.masonry-grid img').first();
    await expect(galleryImage).toBeVisible();
    await galleryImage.click();

    // 4. Click "Edit Metadata" inside the lightbox
    const editMetadataButton = window.locator('button:has-text("Edit Metadata")');
    await expect(editMetadataButton).toBeVisible();
    await editMetadataButton.click();

    // 5. Update metadata form fields (e.g. tag & notes)
    const tagInput = window.locator('input[placeholder="Add tags..."]');
    await tagInput.fill('e2e-tag');
    await tagInput.press('Enter');

    const notesInput = window.locator('textarea[placeholder="Specific notes for this image..."]');
    await notesInput.fill('This image was tagged during E2E tests.');

    // Click "Save Changes"
    const saveButton = window.locator('button:has-text("Save Changes")');
    await saveButton.click();

    // 6. Verify image updated notification
    await expect(window.locator('text=Image updated')).toBeVisible({ timeout: 10000 });

    // Close Lightbox
    await window.keyboard.press('Escape');

    // Wait for modals to close to avoid transitions/remnants in the DOM
    await expect(window.locator('text=Edit Image Metadata')).toBeHidden();

    // Verify tag is now listed on the Set detail page
    const tagBadge = window.locator('.mantine-Badge-label', { hasText: 'e2e-tag' }).first();
    await expect(tagBadge).toBeVisible();
  });
});
