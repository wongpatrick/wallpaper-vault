/**
 * @file
 * Component tests for PaginationWithSkip.
 * Verifies page skipping input, clamping rules, and rendering behavior.
 */
/* eslint-disable no-magic-numbers */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '../../test/test-utils';
import { PaginationWithSkip } from './PaginationWithSkip';

describe('PaginationWithSkip', () => {
    it('should render the pagination component and the Go to input', () => {
        const handleChange = vi.fn();
        render(<PaginationWithSkip total={10} value={1} onChange={handleChange} />);
        
        expect(screen.getByText('Go to:')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Page')).toBeInTheDocument();
    });

    it('should call onChange with the parsed page number when a valid page is entered and Enter is pressed', () => {
        const handleChange = vi.fn();
        render(<PaginationWithSkip total={10} value={1} onChange={handleChange} />);
        
        const input = screen.getByPlaceholderText('Page') as HTMLInputElement;
        fireEvent.change(input, { target: { value: '5' } });
        fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
        
        expect(handleChange).toHaveBeenCalledWith(5);
        expect(input.value).toBe('');
    });

    it('should clamp the page number to total if the input is greater than total', () => {
        const handleChange = vi.fn();
        render(<PaginationWithSkip total={10} value={1} onChange={handleChange} />);
        
        const input = screen.getByPlaceholderText('Page') as HTMLInputElement;
        fireEvent.change(input, { target: { value: '15' } });
        fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
        
        expect(handleChange).toHaveBeenCalledWith(10);
    });

    it('should clamp the page number to 1 if the input is less than 1', () => {
        const handleChange = vi.fn();
        render(<PaginationWithSkip total={10} value={1} onChange={handleChange} />);
        
        const input = screen.getByPlaceholderText('Page') as HTMLInputElement;
        fireEvent.change(input, { target: { value: '0' } });
        fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
        
        expect(handleChange).toHaveBeenCalledWith(1);
    });

    it('should do nothing if a non-numeric value is entered', () => {
        const handleChange = vi.fn();
        render(<PaginationWithSkip total={10} value={1} onChange={handleChange} />);
        
        const input = screen.getByPlaceholderText('Page') as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'abc' } });
        fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
        
        expect(handleChange).not.toHaveBeenCalled();
    });
});
