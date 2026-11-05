/**
 * @file
 * Tests for DisplayFusionStatus component.
 */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '../../../test/test-utils';
import { DisplayFusionStatus } from './DisplayFusionStatus';

describe('DisplayFusionStatus', () => {
    beforeEach(() => {
        vi.stubGlobal('electron', {
            platform: 'win32',
            getDisplayFusionStatus: vi.fn().mockResolvedValue({
                supported: true,
                installed: true,
                running: true,
                exePath: 'C:\\Program Files\\DisplayFusion\\DisplayFusionCommand.exe',
                source: 'default'
            }),
            setDisplayFusionPath: vi.fn(),
            openFile: vi.fn()
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('renders nothing on non-win32 platforms', () => {
        vi.stubGlobal('electron', {
            platform: 'darwin',
            getDisplayFusionStatus: vi.fn()
        });

        render(<DisplayFusionStatus />);
        expect(screen.queryByText('Status:')).not.toBeInTheDocument();
    });

    it('renders "Detected & running" badge when installed and running', async () => {
        render(<DisplayFusionStatus />);

        await waitFor(() => {
            expect(screen.getByText('Detected & running')).toBeInTheDocument();
        });
        expect(screen.getByText('Source: default')).toBeInTheDocument();
        expect(screen.getByText('C:\\Program Files\\DisplayFusion\\DisplayFusionCommand.exe')).toBeInTheDocument();
    });

    it('renders "Installed but not running" when installed but process is absent', async () => {
        vi.stubGlobal('electron', {
            platform: 'win32',
            getDisplayFusionStatus: vi.fn().mockResolvedValue({
                supported: true,
                installed: true,
                running: false,
                exePath: 'C:\\Program Files\\DisplayFusion\\DisplayFusionCommand.exe',
                source: 'registry'
            }),
            setDisplayFusionPath: vi.fn(),
            openFile: vi.fn()
        });

        render(<DisplayFusionStatus />);

        await waitFor(() => {
            expect(screen.getByText('Installed but not running')).toBeInTheDocument();
        });
        expect(screen.getByText('Source: registry')).toBeInTheDocument();
    });

    it('renders "Not found" when executable is absent', async () => {
        vi.stubGlobal('electron', {
            platform: 'win32',
            getDisplayFusionStatus: vi.fn().mockResolvedValue({
                supported: true,
                installed: false,
                running: false,
                exePath: null,
                source: null
            }),
            setDisplayFusionPath: vi.fn(),
            openFile: vi.fn()
        });

        render(<DisplayFusionStatus />);

        await waitFor(() => {
            expect(screen.getByText('Not found')).toBeInTheDocument();
        });
    });

    it('calls getDisplayFusionStatus when Re-check is clicked', async () => {
        const getStatusMock = vi.fn().mockResolvedValue({
            supported: true,
            installed: true,
            running: true,
            exePath: 'C:\\DF\\DisplayFusionCommand.exe',
            source: 'custom'
        });

        vi.stubGlobal('electron', {
            platform: 'win32',
            getDisplayFusionStatus: getStatusMock,
            setDisplayFusionPath: vi.fn(),
            openFile: vi.fn()
        });

        render(<DisplayFusionStatus />);

        await waitFor(() => {
            expect(screen.getByText('Re-check')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText('Re-check'));

        await waitFor(() => {
            expect(getStatusMock).toHaveBeenCalledTimes(2);
        });
    });

    it('opens file picker and updates custom path when Browse Exe is clicked', async () => {
        const openFileMock = vi.fn().mockResolvedValue('D:\\Custom\\DisplayFusionCommand.exe');
        const setPathMock = vi.fn().mockResolvedValue({
            supported: true,
            installed: true,
            running: true,
            exePath: 'D:\\Custom\\DisplayFusionCommand.exe',
            source: 'custom'
        });

        vi.stubGlobal('electron', {
            platform: 'win32',
            getDisplayFusionStatus: vi.fn().mockResolvedValue({
                supported: true,
                installed: false,
                running: false,
                exePath: null,
                source: null
            }),
            setDisplayFusionPath: setPathMock,
            openFile: openFileMock
        });

        render(<DisplayFusionStatus />);

        await waitFor(() => {
            expect(screen.getByText('Browse Exe...')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText('Browse Exe...'));

        await waitFor(() => {
            expect(openFileMock).toHaveBeenCalled();
            expect(setPathMock).toHaveBeenCalledWith('D:\\Custom\\DisplayFusionCommand.exe');
        });
    });
});
