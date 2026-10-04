/**
 * @file
 * Module: useSettingsAiModel hook
 * Description: Manages AI model cache status checking, model download mutation, and query cache invalidation.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IconCheck } from '@tabler/icons-react';
import { useAppNotifications } from '../../../hooks/useAppNotifications';
import {
    checkAiModelStatusApiSettingsCacheAiModelsStatusPost,
    useDownloadAiModelApiSettingsCacheAiModelsDownloadPost,
    getReadCacheStatsApiSettingsCacheGetQueryKey
} from '../../../api/generated/settings/settings';

const ICON_SIZE = 16;

interface UseSettingsAiModelOptions {
    modelSource: string;
    modelType: string;
    customRepo: string;
    customPath: string;
    enabled: boolean;
}

export function useSettingsAiModel({
    modelSource,
    modelType,
    customRepo,
    customPath,
    enabled,
}: UseSettingsAiModelOptions) {
    const { showNotification } = useAppNotifications();
    const queryClient = useQueryClient();

    const { data: modelStatus, isLoading: isCheckingStatus, refetch: refetchStatus } = useQuery({
        queryKey: ['ai-model-status', modelSource, modelType, customRepo, customPath],
        queryFn: ({ signal }) => checkAiModelStatusApiSettingsCacheAiModelsStatusPost(
            {
                model_source: modelSource,
                model_type: modelType,
                custom_repo: customRepo,
                custom_path: customPath
            },
            undefined,
            undefined,
            signal
        ),
        enabled,
    });

    const downloadMutation = useDownloadAiModelApiSettingsCacheAiModelsDownloadPost();

    const handleDownloadModel = async () => {
        try {
            const res = await downloadMutation.mutateAsync({
                data: {
                    model_source: modelSource,
                    model_type: modelType,
                    custom_repo: customRepo,
                    custom_path: customPath
                }
            });
            showNotification({
                title: 'Model Downloaded',
                message: res.message || `Successfully downloaded ${res.model_name} (${res.human_size})`,
                color: 'teal',
                icon: <IconCheck size={ICON_SIZE} />
            });
            refetchStatus();
            queryClient.invalidateQueries({ queryKey: getReadCacheStatsApiSettingsCacheGetQueryKey() });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to download model';
            showNotification({
                title: 'Download Failed',
                message,
                color: 'red'
            });
        }
    };

    return {
        modelStatus,
        isCheckingStatus,
        refetchStatus,
        handleDownloadModel,
        isDownloading: downloadMutation.isPending,
    };
}
