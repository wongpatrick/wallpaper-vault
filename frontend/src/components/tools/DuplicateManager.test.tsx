/**
 * @file
 * Unit tests for DuplicateManager and near-duplicate detection.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '../../test/test-utils';
import { DuplicateManager } from './DuplicateManager';
import type { DuplicateGroup } from '../../api/model';

const mockExactGroup: DuplicateGroup = {
    group_id: 'dup-1-hash1',
    phash: '1111222233334444',
    max_distance: 0,
    similarity_percentage: 100.0,
    recommended_keep_id: 1,
    images: [
        {
            id: 1,
            filename: 'wallpaper-4k.jpg',
            local_path: '/path/to/wallpaper-4k.jpg',
            phash: '1111222233334444',
            width: 3840,
            height: 2160,
            file_size: 5_000_000,
            sort_order: 0,
            rating: 'safe',
            is_favorite: false,
            is_blacklisted: false,
            set_title: 'Nature Set',
            creator_names: ['Artist Alpha'],
        },
        {
            id: 2,
            filename: 'wallpaper-1080p.jpg',
            local_path: '/path/to/wallpaper-1080p.jpg',
            phash: '1111222233334444',
            width: 1920,
            height: 1080,
            file_size: 1_200_000,
            sort_order: 1,
            rating: 'safe',
            is_favorite: false,
            is_blacklisted: false,
            set_title: 'Nature Set',
            creator_names: ['Artist Alpha'],
        },
    ],
};

const mockNearDuplicateGroup: DuplicateGroup = {
    group_id: 'dup-3-hash3',
    phash: 'aaaabbbbccccdddd',
    max_distance: 3,
    similarity_percentage: 95.3,
    recommended_keep_id: 3,
    images: [
        {
            id: 3,
            filename: 'clean-art.png',
            local_path: '/path/to/clean-art.png',
            phash: 'aaaabbbbccccdddd',
            width: 2560,
            height: 1440,
            file_size: 4_000_000,
            sort_order: 0,
            rating: 'safe',
            is_favorite: true,
            is_blacklisted: false,
            set_title: 'Sci-Fi Collection',
            creator_names: ['Artist Beta'],
        },
        {
            id: 4,
            filename: 'watermarked-art.jpg',
            local_path: '/path/to/watermarked-art.jpg',
            phash: 'aaaabbbbccccddde',
            width: 1920,
            height: 1080,
            file_size: 900_000,
            sort_order: 0,
            rating: 'safe',
            is_favorite: false,
            is_blacklisted: false,
            set_title: 'Sci-Fi Collection',
            creator_names: ['Artist Beta'],
        },
    ],
};

const mockMutateAsync = vi.fn().mockResolvedValue({ status: 'success' });
let mockData: DuplicateGroup[] = [];
let mockIsLoading = false;

vi.mock('../../api/generated/images/images', () => ({
    useReadDuplicateGroupsApiImagesDuplicatesGroupsGet: () => ({
        data: mockData,
        isLoading: mockIsLoading,
        isError: false,
        refetch: vi.fn(),
    }),
    useResolveDuplicatesApiImagesDuplicatesResolvePost: () => ({
        mutateAsync: mockMutateAsync,
        isPending: false,
    }),
    useRevealImageApiImagesImageIdRevealPost: () => ({
        mutate: vi.fn(),
        isPending: false,
    }),
}));

describe('DuplicateManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockData = [];
        mockIsLoading = false;
    });

    it('renders empty state when no duplicate groups exist', () => {
        mockData = [];
        render(<DuplicateManager />);

        expect(screen.getByText(/No duplicates found!/i)).toBeInTheDocument();
        expect(screen.getByText(/Visual Similarity & Duplicate Auditor/i)).toBeInTheDocument();
    });

    it('renders exact and near-duplicate groups with badges', () => {
        mockData = [mockExactGroup, mockNearDuplicateGroup];
        render(<DuplicateManager />);

        expect(screen.getByText(/Exact Match \(100%\)/i)).toBeInTheDocument();
        expect(screen.getByText(/95.3% Similar \(3 bits diff\)/i)).toBeInTheDocument();
        expect(screen.getByText('wallpaper-4k.jpg')).toBeInTheDocument();
        expect(screen.getByText('clean-art.png')).toBeInTheDocument();
    });

    it('opens side-by-side inspection modal on Inspect click', async () => {
        mockData = [mockNearDuplicateGroup];
        render(<DuplicateManager />);

        const inspectButtons = screen.getAllByRole('button', { name: /Inspect/i });
        fireEvent.click(inspectButtons[0]);

        await waitFor(() => {
            expect(screen.getByText(/Side-by-Side Duplicate Comparison/i)).toBeInTheDocument();
        });
        expect(screen.getAllByText(/clean-art.png/i).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(/watermarked-art.jpg/i).length).toBeGreaterThanOrEqual(1);
    });

    it('dismisses a group when clicking Keep Both (Ignore)', async () => {
        mockData = [mockExactGroup];
        render(<DuplicateManager />);

        expect(screen.getByText('wallpaper-4k.jpg')).toBeInTheDocument();

        const ignoreBtn = screen.getByRole('button', { name: /Keep Both \(Ignore\)/i });
        fireEvent.click(ignoreBtn);

        await waitFor(() => {
            expect(screen.queryByText('wallpaper-4k.jpg')).not.toBeInTheDocument();
            expect(screen.getByText(/No duplicates found!/i)).toBeInTheDocument();
        });
    });

    it('calls resolve mutation with chosen keep ID', async () => {
        mockData = [mockExactGroup];
        render(<DuplicateManager />);

        const resolveBtn = screen.getByRole('button', { name: /Resolve Group/i });
        fireEvent.click(resolveBtn);

        await waitFor(() => {
            expect(mockMutateAsync).toHaveBeenCalledWith({
                data: {
                    keep_image_id: 1,
                    remove_image_ids: [2],
                },
            });
        });
    });
});
