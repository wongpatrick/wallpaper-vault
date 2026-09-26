/**
 * @file
 * Hook: useRotationRules
 * Description: Custom hook orchestrating TanStack Query reads and mutations for scheduled rotation rules.
 */
import { useQueryClient } from '@tanstack/react-query';
import {
    useListRulesApiRotationRulesGet,
    useGetActiveRuleApiRotationRulesActiveGet,
    useCreateRuleApiRotationRulesPost,
    useUpdateRuleApiRotationRulesIdPut,
    useDeleteRuleApiRotationRulesIdDelete,
    getListRulesApiRotationRulesGetQueryKey,
    getGetActiveRuleApiRotationRulesActiveGetQueryKey
} from '../api/generated/rotation-rules/rotation-rules';
import { useReadPlaylistsApiPlaylistsGet } from '../api/generated/playlists/playlists';
import type { RotationRule } from '../api/model/rotationRule';
import type { RotationRuleCreate } from '../api/model/rotationRuleCreate';
import type { RotationRuleUpdate } from '../api/model/rotationRuleUpdate';
import type { PlaylistOption, RuleFormData } from '../types/rotation';
import { PRIORITY_STEP } from './rotationRulesUtils';

export interface UseRotationRulesReturn {
    rules: RotationRule[];
    activeRule: RotationRule | null;
    playlists: PlaylistOption[];
    isLoading: boolean;
    error: Error | null;
    createRule: (formData: RuleFormData) => Promise<void>;
    updateRule: (id: number, formData: RuleFormData) => Promise<void>;
    deleteRule: (id: number) => Promise<void>;
    toggleRule: (rule: RotationRule, enabled: boolean) => Promise<void>;
    reorderRules: (reorderedRules: RotationRule[]) => Promise<void>;
}

export function useRotationRules(): UseRotationRulesReturn {
    const queryClient = useQueryClient();

    const rulesQuery = useListRulesApiRotationRulesGet();
    const activeRuleQuery = useGetActiveRuleApiRotationRulesActiveGet();
    const playlistsQuery = useReadPlaylistsApiPlaylistsGet();

    const createMutation = useCreateRuleApiRotationRulesPost();
    const updateMutation = useUpdateRuleApiRotationRulesIdPut();
    const deleteMutation = useDeleteRuleApiRotationRulesIdDelete();

    const invalidateRules = async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: getListRulesApiRotationRulesGetQueryKey() }),
            queryClient.invalidateQueries({ queryKey: getGetActiveRuleApiRotationRulesActiveGetQueryKey() })
        ]);
    };

    const rules: RotationRule[] = rulesQuery.data ?? [];
    const activeRule: RotationRule | null = activeRuleQuery.data ?? null;
    const playlists: PlaylistOption[] = (playlistsQuery.data ?? []).map(p => ({
        id: p.id,
        name: p.name
    }));

    const isLoading = rulesQuery.isLoading || activeRuleQuery.isLoading || playlistsQuery.isLoading;
    const error = (rulesQuery.error || activeRuleQuery.error || playlistsQuery.error) as Error | null;

    const createRule = async (formData: RuleFormData) => {
        const maxPriority = rules.length > 0
            ? Math.max(...rules.map(r => r.priority ?? 0))
            : 0;

        const payload: RotationRuleCreate = {
            name: formData.name,
            enabled: formData.enabled,
            source: formData.source,
            playlist_id: formData.playlist_id,
            style: formData.style,
            start_date: formData.start_date,
            end_date: formData.end_date,
            days_of_week: formData.days_of_week,
            start_time: formData.start_time,
            end_time: formData.end_time,
            priority: maxPriority + PRIORITY_STEP
        };

        await createMutation.mutateAsync({ data: payload });
        await invalidateRules();
    };

    const updateRule = async (id: number, formData: RuleFormData) => {
        const payload: RotationRuleUpdate = {
            name: formData.name,
            enabled: formData.enabled,
            source: formData.source,
            playlist_id: formData.playlist_id,
            style: formData.style,
            start_date: formData.start_date,
            end_date: formData.end_date,
            days_of_week: formData.days_of_week,
            start_time: formData.start_time,
            end_time: formData.end_time
        };

        await updateMutation.mutateAsync({ id, data: payload });
        await invalidateRules();
    };

    const deleteRule = async (id: number) => {
        await deleteMutation.mutateAsync({ id });
        await invalidateRules();
    };

    const toggleRule = async (rule: RotationRule, enabled: boolean) => {
        await updateMutation.mutateAsync({
            id: rule.id,
            data: { enabled: enabled ? 1 : 0 }
        });
        await invalidateRules();
    };

    const reorderRules = async (reorderedRules: RotationRule[]) => {
        const count = reorderedRules.length;
        for (let idx = 0; idx < count; idx++) {
            const r = reorderedRules[idx];
            const newPriority = (count - idx) * PRIORITY_STEP;
            if (r.priority !== newPriority) {
                await updateMutation.mutateAsync({
                    id: r.id,
                    data: { priority: newPriority }
                });
            }
        }
        await invalidateRules();
    };

    return {
        rules,
        activeRule,
        playlists,
        isLoading,
        error,
        createRule,
        updateRule,
        deleteRule,
        toggleRule,
        reorderRules
    };
}
