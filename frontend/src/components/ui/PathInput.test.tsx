/**
 * @file
 * Component tests for PathInput.
 * Verifies TextInput updates and mocking window.electron native directory picking.
 */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '../../test/test-utils';
import { PathInput } from './PathInput';

// Extend global window type to satisfy TypeScript
declare global {
    interface Window {
        electron: {
            openDirectory: () => Promise<string | null>;
        };
    }
}

describe('PathInput', () => {
    beforeEach(() => {
        vi.stubGlobal('electron', {
            openDirectory: vi.fn(),
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('should render the input field with the provided value', () => {
        render(<PathInput value="/initial/path" onChange={vi.fn()} />);
        const input = screen.getByRole('textbox') as HTMLInputElement;
        expect(input.value).toBe('/initial/path');
    });

    it('should trigger onChange when user types in the text input', () => {
        const handleChange = vi.fn();
        render(<PathInput value="" onChange={handleChange} />);
        
        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: '/new/path' } });
        
        expect(handleChange).toHaveBeenCalledWith('/new/path');
    });

    it('should call window.electron.openDirectory and trigger onChange when folder icon is clicked', async () => {
        const openDirectoryMock = vi.fn().mockResolvedValue('/selected/folder');
        vi.stubGlobal('electron', {
            openDirectory: openDirectoryMock,
        });

        const handleChange = vi.fn();
        render(<PathInput value="" onChange={handleChange} />);
        
        const button = screen.getByRole('button');
        fireEvent.click(button);

        await vi.waitFor(() => {
            expect(openDirectoryMock).toHaveBeenCalled();
        });
        
        expect(handleChange).toHaveBeenCalledWith('/selected/folder');
    });

    it('should not trigger onChange if openDirectory returns undefined/null', async () => {
        const openDirectoryMock = vi.fn().mockResolvedValue(null);
        vi.stubGlobal('electron', {
            openDirectory: openDirectoryMock,
        });

        const handleChange = vi.fn();
        render(<PathInput value="" onChange={handleChange} />);
        
        const button = screen.getByRole('button');
        fireEvent.click(button);

        await vi.waitFor(() => {
            expect(openDirectoryMock).toHaveBeenCalled();
        });
        
        expect(handleChange).not.toHaveBeenCalled();
    });
});
