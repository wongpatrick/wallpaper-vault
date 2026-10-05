/**
 * @file
 * Module: useDashboardData hook
 * Description: Aggregates multi-vault dashboard metrics, recent sets, auto-refreshing random inspiration, and categorized taxonomy clouds.
 */
import { useMemo } from 'react';
import { 
    useMultiVaultDashboard,
    useMultiVaultSets,
    useMultiVaultRandomImage,
    useMultiVaultTagCloud,
    useMultiVaultCharacters,
    useMultiVaultFranchises
} from '../../../hooks/useMultiVaultQuery';

const INSPIRATION_ROTATION_INTERVAL_MS = 20000;
const LIMIT_RECENT_SETS = 5;
const LIMIT_TAG_CLOUD = 50;

export interface TaxonomyCloudItem {
    tag: string;
    count: number;
    type?: string;
    link?: string;
}

export function useDashboardData() {
    // 1. Fetch Dashboard Stats
    const { 
        data: dashboard, 
        isLoading: statsLoading, 
        error: statsError,
        isAggregated,
        onlineCount,
        totalVaultsCount,
        offlineVaults,
        partialErrors
    } = useMultiVaultDashboard();
    
    // 2. Fetch Recent Sets
    const { data: recentSets, isLoading: setsLoading } = useMultiVaultSets({
        limit: LIMIT_RECENT_SETS,
        sort_by: 'date_added',
        sort_dir: 'desc'
    });

    // 3. Fetch Random Inspiration with auto-rotation interval
    const { 
        data: randomImage, 
        refetch: refetchInspiration, 
        isFetching: isFetchingInspiration 
    } = useMultiVaultRandomImage(
        { log_rotation: false },
        {
            refetchInterval: INSPIRATION_ROTATION_INTERVAL_MS,
            refetchIntervalInBackground: false,
            staleTime: 0,
            refetchOnMount: 'always',
            refetchOnWindowFocus: true
        }
    );

    // 4. Fetch Tag Clouds (Sets & Images)
    const { data: setTagCloud } = useMultiVaultTagCloud({ limit: LIMIT_TAG_CLOUD, scope: 'sets' });
    const { data: imageTagCloud } = useMultiVaultTagCloud({ limit: LIMIT_TAG_CLOUD, scope: 'images' });

    // 5. Fetch Characters (Sets & Images)
    const { data: setCharacters } = useMultiVaultCharacters({ limit: LIMIT_TAG_CLOUD, scope: 'sets' });
    const { data: imageCharacters } = useMultiVaultCharacters({ limit: LIMIT_TAG_CLOUD, scope: 'images' });

    // 6. Fetch Franchises (Sets & Images)
    const { data: setFranchises } = useMultiVaultFranchises({ limit: LIMIT_TAG_CLOUD, scope: 'sets' });
    const { data: imageFranchises } = useMultiVaultFranchises({ limit: LIMIT_TAG_CLOUD, scope: 'images' });

    // 7. Filter and transform tag clouds into pure tag shapes
    const setTagsOnly: TaxonomyCloudItem[] = useMemo(
        () => (setTagCloud || []).filter((t) => !t.type || t.type === 'tag'),
        [setTagCloud]
    );
    const imageTagsOnly: TaxonomyCloudItem[] = useMemo(
        () => (imageTagCloud || []).filter((t) => !t.type || t.type === 'tag'),
        [imageTagCloud]
    );

    // 8. Transform characters data into TagCloudItem shapes
    const characterSetCloud: TaxonomyCloudItem[] = useMemo(() => {
        return (setCharacters?.items || []).map((c) => ({
            tag: c.name,
            count: c.set_count || 0,
            type: 'character',
            link: `/sets?character=${encodeURIComponent(c.name)}`
        }));
    }, [setCharacters]);

    const characterImageCloud: TaxonomyCloudItem[] = useMemo(() => {
        return (imageCharacters?.items || []).map((c) => ({
            tag: c.name,
            count: c.image_count || 0,
            type: 'character',
            link: `/images?character=${encodeURIComponent(c.name)}`
        }));
    }, [imageCharacters]);

    // 9. Transform franchises data into TagCloudItem shapes
    const franchiseSetCloud: TaxonomyCloudItem[] = useMemo(() => {
        return (setFranchises?.items || []).map((f) => ({
            tag: f.name,
            count: f.set_count || 0,
            type: 'franchise',
            link: `/sets?franchise=${encodeURIComponent(f.name)}`
        }));
    }, [setFranchises]);

    const franchiseImageCloud: TaxonomyCloudItem[] = useMemo(() => {
        return (imageFranchises?.items || []).map((f) => ({
            tag: f.name,
            count: f.image_count || 0,
            type: 'franchise',
            link: `/images?franchise=${encodeURIComponent(f.name)}`
        }));
    }, [imageFranchises]);

    return {
        dashboard,
        statsLoading,
        statsError,
        isAggregated,
        onlineCount,
        totalVaultsCount,
        offlineVaults,
        partialErrors,
        recentSets,
        setsLoading,
        randomImage,
        refetchInspiration,
        isFetchingInspiration,
        setTagsOnly,
        imageTagsOnly,
        characterSetCloud,
        characterImageCloud,
        franchiseSetCloud,
        franchiseImageCloud,
    };
}
