/**
 * @file
 * Hook for managing library integrity audits, background task tracking, and issue resolution.
 */
import { useState, useEffect } from 'react';
import { useAppNotifications } from '../../../hooks/useAppNotifications';
import { 
    useStartAuditApiAuditStartPost,
    useGetAuditResultsApiAuditResultsGet,
    useResolveAuditIssuesApiAuditResolvePost
} from '../../../api/generated/audit/audit';
import type { AuditIssue } from '../../../api/model';
import { useTasks } from '../../../hooks/useTasks';

export function useAuditEngine() {
    const { showNotification } = useAppNotifications();
    const { tasks } = useTasks();
    const auditTask = Object.values(tasks).find(
        (t) => t.id.startsWith('audit-') && t.status !== 'completed' && t.status !== 'error'
    );
    const isScanning = !!auditTask;
    const progress = auditTask?.progress || 0;
    const status = auditTask?.status === 'accepted' 
        ? 'Starting scan...' 
        : auditTask?.status === 'processing' 
        ? 'Scanning...' 
        : auditTask?.status || 'Processing...';

    const [page, setPage] = useState(1);
    const [issueType, setIssueType] = useState<string | null>(null);

    const startMutation = useStartAuditApiAuditStartPost();
    const resolveMutation = useResolveAuditIssuesApiAuditResolvePost();
    const { data: results, refetch, isFetching } = useGetAuditResultsApiAuditResultsGet({
        skip: (page - 1) * 20,
        limit: 20,
        issue_type: issueType || undefined
    });

    const groupedOrphans = results?.items?.reduce((acc, issue) => {
        if (issue.issue_type !== 'orphan') return acc;
        const dir = issue.directory || 'Unknown';
        if (!acc[dir]) acc[dir] = [];
        acc[dir].push(issue);
        return acc;
    }, {} as Record<string, AuditIssue[]>) || {};

    const groupedDuplicates = results?.items?.reduce((acc, issue) => {
        if (issue.issue_type !== 'duplicate_entry') return acc;
        const dir = issue.directory || 'Unknown';
        if (!acc[dir]) acc[dir] = [];
        acc[dir].push(issue);
        return acc;
    }, {} as Record<string, AuditIssue[]>) || {};

    const otherIssues = results?.items?.filter(i => i.issue_type !== 'orphan' && i.issue_type !== 'duplicate_entry') || [];

    const handleStart = async () => {
        try {
            await startMutation.mutateAsync({ data: { deep_scan: false } });
        } catch {
            showNotification({ title: 'Error', message: 'Failed to start audit.', color: 'red' });
        }
    };

    const taskStatus = auditTask?.status;

    useEffect(() => {
        if (taskStatus === 'completed') {
            refetch();
        }
    }, [taskStatus, refetch]);

    const handleResolve = async (ids: number[], action: string) => {
        try {
            await resolveMutation.mutateAsync({
                data: {
                    issue_ids: ids,
                    action: action
                }
            });
            showNotification({ title: 'Success', message: `Action '${action}' executed.`, color: 'green' });
            refetch();
        } catch {
            showNotification({ title: 'Error', message: 'Failed to execute resolution.', color: 'red' });
        }
    };

    return {
        isScanning,
        progress,
        status,
        page,
        setPage,
        issueType,
        setIssueType,
        results,
        refetch,
        isFetching,
        groupedOrphans,
        groupedDuplicates,
        otherIssues,
        handleStart,
        handleResolve,
        startMutation,
        resolveMutation
    };
}
