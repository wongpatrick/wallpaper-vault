/**
 * @file
 * Unit tests for TransferModal and useTransfer orchestration flow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '../../test/test-utils';
import { TransferModal } from './TransferModal';
import { AXIOS_INSTANCE } from '../../api/axios-instance';
import type { VaultEntry } from '../../types/electron';

const mockVaults: VaultEntry[] = [
    {
        id: 'local',
        label: 'Local Vault',
        url: 'http://127.0.0.1:8000',
        isLocal: true,
        status: 'online',
    },
    {
        id: 'nas-vault',
        label: 'NAS Vault',
        url: 'http://192.168.1.50:8000',
        apiKey: 'secret-key',
        isLocal: false,
        status: 'online',
    },
];

vi.mock('../../hooks/useVault', () => ({
    useVault: () => ({
        vaults: mockVaults,
        onlineVaults: mockVaults,
        activeVault: mockVaults[0],
        isAggregated: false,
        isLoading: false,
    }),
}));

vi.mock('../../api/generated/library-paths/library-paths', () => ({
    useListLibraryPathsApiLibraryPathsGet: () => ({
        data: {
            items: [
                { id: 1, path: 'C:\\Wallpapers', label: 'Primary Drive', is_default: true },
                { id: 2, path: 'D:\\Archive', label: 'Archive Drive', is_default: false },
            ],
            total: 2,
        },
    }),
}));

describe('TransferModal', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('renders modal title for set transfer and shows destination selector', () => {
        render(
            <TransferModal
                opened={true}
                onClose={vi.fn()}
                setId={42}
                setTitle="Cyberpunk Collection"
                sourceLibraryPathId={1}
            />
        );

        expect(screen.getByText('Transfer Set: Cyberpunk Collection')).toBeInTheDocument();
        expect(screen.getByText('Destination')).toBeInTheDocument();
    });

    it('runs preflight check when a connected vault is selected and surfaces collision warnings', async () => {
        const getSpy = vi.spyOn(AXIOS_INSTANCE, 'get').mockResolvedValueOnce({
            data: {
                source_set_id: 42,
                title: 'Cyberpunk Collection',
                source_url: 'https://example.com/cyberpunk',
                creators: [{ canonical_name: 'NeonArtist' }],
                tags: ['Scifi'],
                characters: [],
                images: [
                    {
                        id: 101,
                        filename: '01.jpg',
                        phash: 'aaaa0000aaaa0000',
                        tags: [],
                        characters: [],
                    },
                ],
            },
        });

        const postSpy = vi.spyOn(AXIOS_INSTANCE, 'post').mockResolvedValueOnce({
            data: {
                transfer_session_id: 'session-123',
                set_collisions: [
                    {
                        source_set_id: 42,
                        source_title: 'Cyberpunk Collection',
                        existing_set_id: 99,
                        existing_title: 'Cyberpunk Collection',
                        match_reason: 'source_url',
                    },
                ],
                image_collisions: [
                    {
                        source_image_id: 101,
                        filename: '01.jpg',
                        source_phash: 'aaaa0000aaaa0000',
                        existing_image_id: 500,
                        existing_set_id: 99,
                        existing_set_title: 'Cyberpunk Collection',
                        hamming_distance: 0,
                    },
                ],
                taxonomy: {
                    existing_creators: [],
                    missing_creators: ['NeonArtist'],
                    existing_franchises: [],
                    missing_franchises: [],
                    existing_characters: [],
                    missing_characters: [],
                    existing_tags: [],
                    missing_tags: ['Scifi'],
                },
            },
        });

        render(
            <TransferModal
                opened={true}
                onClose={vi.fn()}
                setId={42}
                setTitle="Cyberpunk Collection"
                sourceLibraryPathId={1}
            />
        );

        // Open Mantine Select and pick NAS Vault
        const selectInput = screen.getByPlaceholderText(
            'Select a connected vault or local library path...'
        );
        fireEvent.click(selectInput);

        const nasOption = await screen.findByText('NAS Vault');
        fireEvent.click(nasOption);

        const continueBtn = await screen.findByRole('button', {
            name: /Check Collisions & Continue/i,
        });
        fireEvent.click(continueBtn);

        await waitFor(() => {
            expect(getSpy).toHaveBeenCalledWith(
                'http://127.0.0.1:8000/api/vault/transfer/export/set/42',
                expect.any(Object)
            );
            expect(postSpy).toHaveBeenCalledWith(
                'http://192.168.1.50:8000/api/vault/transfer/preflight',
                expect.any(Object),
                expect.any(Object)
            );
        });

        expect(await screen.findByText(/Matching Set Detected/i)).toBeInTheDocument();
        expect(screen.getByText(/Skip duplicate images \(by pHash\)/i)).toBeInTheDocument();
        expect(screen.getByText(/\+1 New Creator\(s\)/i)).toBeInTheDocument();
    });
});
