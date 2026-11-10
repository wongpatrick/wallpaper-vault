/**
 * @file
 * Hook for managing batch import queue, directory drop parsing, scanning, and execution.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import axios from 'axios';
import { batchImportSetsApiSetsBatchImportPost } from '../../../api/generated/sets/sets';
import { cancelTaskEndpointApiTasksTaskIdCancelPost } from '../../../api/generated/tasks/tasks';
import { useAppNotifications } from '../../../hooks/useAppNotifications';
import { useTasks } from '../../../hooks/useTasks';
import type { BatchImportItem } from '../../../api/model';

export function useBatchImportQueue() {
    const [template, setTemplate] = useState('Coser@[Creator] - [Set]');
    const [results, setResults] = useState<BatchImportItem[]>([]);
    const [isImporting, setIsImporting] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [globalDeleteSource, setGlobalDeleteSource] = useState(true);
    const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

    const activeScanAbortRef = useRef<AbortController | null>(null);
    const { showNotification } = useAppNotifications();
    const { tasks } = useTasks();

    const isTaskRunning = Boolean(
        activeTaskId &&
        tasks[activeTaskId] &&
        tasks[activeTaskId].status !== 'completed' &&
        tasks[activeTaskId].status !== 'error' &&
        tasks[activeTaskId].status !== 'cancelled'
    );

    useEffect(() => {
        if (activeTaskId && tasks[activeTaskId]) {
            const status = tasks[activeTaskId].status;
            if (status === 'completed' || status === 'error' || status === 'cancelled') {
                setActiveTaskId(null);
                setIsImporting(false);
            }
        }
    }, [activeTaskId, tasks]);

    const handleResultChange = (index: number, field: keyof BatchImportItem, value: string | boolean) => {
        setResults(prev => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value } as BatchImportItem;
            return next;
        });
    };

    const handleClearQueue = useCallback(() => {
        if (activeScanAbortRef.current) {
            activeScanAbortRef.current.abort();
            activeScanAbortRef.current = null;
        }
        setIsScanning(false);
        setResults([]);
    }, []);

    const handleCancelImport = useCallback(async () => {
        if (activeTaskId) {
            try {
                await cancelTaskEndpointApiTasksTaskIdCancelPost(activeTaskId);
                showNotification({
                    title: 'Import Cancelled',
                    message: 'Task cancellation requested.',
                    color: 'orange'
                });
            } catch (err) {
                console.error('Failed to cancel task:', err);
            } finally {
                setActiveTaskId(null);
                setIsImporting(false);
            }
        }
    }, [activeTaskId, showNotification]);

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        const items = Array.from(e.dataTransfer.items);
        const paths: string[] = [];

        for (const item of items) {
            const entry = item.webkitGetAsEntry();
            if (entry && entry.isDirectory) {
                const file = item.getAsFile();
                const absolutePath = file && window.electron?.getPathForFile 
                    ? window.electron.getPathForFile(file) 
                    : '';
                if (absolutePath) paths.push(absolutePath);
            }
        }

        if (paths.length > 0) {
            if (activeScanAbortRef.current) {
                activeScanAbortRef.current.abort();
            }
            const abortCtrl = new AbortController();
            activeScanAbortRef.current = abortCtrl;
            setIsScanning(true);

            try {
                const response = await batchImportSetsApiSetsBatchImportPost(
                    {
                        items: paths.map(p => ({ source_path: p })),
                        dry_run: true,
                        parsing_template: template
                    },
                    undefined,
                    undefined,
                    abortCtrl.signal
                );
                
                if (abortCtrl.signal.aborted) return;

                const newItems = response.items || [];
                setResults(prev => {
                    const existingPaths = new Set(prev.map(r => r.source_path));
                    const uniqueNew = newItems.filter(r => !existingPaths.has(r.source_path));
                    return [...prev, ...uniqueNew];
                });
            } catch (err: unknown) {
                const isAborted = abortCtrl.signal.aborted ||
                    axios.isCancel(err) ||
                    (err as { name?: string })?.name === 'CanceledError' ||
                    (err as { name?: string })?.name === 'AbortError';

                if (!isAborted) {
                    console.error('Drop error:', err);
                    showNotification({ title: 'Error', message: 'Failed to parse dropped folders', color: 'red', status: 'error' });
                }
            } finally {
                if (!abortCtrl.signal.aborted) {
                    setIsScanning(false);
                }
            }
        }
    };

    const handleScan = async () => {
        if (activeScanAbortRef.current) {
            activeScanAbortRef.current.abort();
        }
        const abortCtrl = new AbortController();
        activeScanAbortRef.current = abortCtrl;
        setIsScanning(true);

        try {
            const response = await batchImportSetsApiSetsBatchImportPost(
                {
                    scan_auto_path: true,
                    dry_run: true,
                    parsing_template: template
                },
                undefined,
                undefined,
                abortCtrl.signal
            );
            
            if (abortCtrl.signal.aborted) return;

            const newItems = response.items || [];
            if (newItems.length > 0) {
                setResults(prev => {
                    const existingPaths = new Set(prev.map(r => r.source_path));
                    const uniqueNew = newItems.filter(r => !existingPaths.has(r.source_path));
                    return [...prev, ...uniqueNew];
                });
                showNotification({ title: 'Scan Complete', message: `Found ${newItems.length} potential sets.`, color: 'green', status: 'success' });
            } else {
                showNotification({ title: 'Scan Complete', message: 'No folders found in auto-parse path.', color: 'blue', status: 'info' });
            }
        } catch (err: unknown) {
            const isAborted = abortCtrl.signal.aborted ||
                axios.isCancel(err) ||
                (err as { name?: string })?.name === 'CanceledError' ||
                (err as { name?: string })?.name === 'AbortError';

            if (!isAborted) {
                console.error('Scan error:', err);
                showNotification({ title: 'Scan Failed', message: 'Could not access auto-parse path.', color: 'red', status: 'error' });
            }
        } finally {
            if (!abortCtrl.signal.aborted) {
                setIsScanning(false);
            }
        }
    };

    const handleReparse = async () => {
        if (results.length === 0) return;

        if (activeScanAbortRef.current) {
            activeScanAbortRef.current.abort();
        }
        const abortCtrl = new AbortController();
        activeScanAbortRef.current = abortCtrl;
        setIsScanning(true);

        try {
            const response = await batchImportSetsApiSetsBatchImportPost(
                {
                    items: results.map(r => ({ source_path: r.source_path })),
                    dry_run: true,
                    parsing_template: template
                },
                undefined,
                undefined,
                abortCtrl.signal
            );
            
            if (abortCtrl.signal.aborted) return;

            const updatedItems = response.items || [];
            setResults(prev => prev.map(old => {
                const match = updatedItems.find(u => u.source_path === old.source_path);
                return match ? match : old;
            }));
            showNotification({ title: 'Queue Updated', message: 'Applied new template to current queue.', color: 'blue', status: 'info' });
        } catch (err: unknown) {
            const isAborted = abortCtrl.signal.aborted ||
                axios.isCancel(err) ||
                (err as { name?: string })?.name === 'CanceledError' ||
                (err as { name?: string })?.name === 'AbortError';

            if (!isAborted) {
                showNotification({ title: 'Error', message: 'Failed to re-parse queue', color: 'red', status: 'error' });
            }
        } finally {
            if (!abortCtrl.signal.aborted) {
                setIsScanning(false);
            }
        }
    };

    const handleImportAll = async () => {
        const pendingResults = results.filter(r => r.isValid && (r.status === 'pending' || r.status === 'error'));
        if (pendingResults.length === 0) return;

        setIsImporting(true);
        try {
            const response = await batchImportSetsApiSetsBatchImportPost({
                items: pendingResults.map(r => ({
                    source_path: r.source_path,
                    creator_name: r.creator_name,
                    set_title: r.set_title,
                    delete_source: globalDeleteSource,
                    auto_orient: true
                })),
                dry_run: false,
                delete_source_default: globalDeleteSource
            });
            
            if (response.status === 'accepted') {
                setActiveTaskId(response.task_id || null);
                showNotification({ 
                    title: 'Batch Import Started', 
                    message: 'The import is running in the background. You can safely navigate away.', 
                    color: 'blue',
                    status: 'info'
                });
                setResults([]);
            } else {
                const updatedItems = response.items || [];
                setResults(prev => prev.map(old => {
                    const match = updatedItems.find(u => u.source_path === old.source_path);
                    return match ? match : old;
                }));

                showNotification({ title: 'Batch Import Finished', message: 'Check the queue for status details.', color: 'green', status: 'success' });
                setIsImporting(false);
            }
        } catch (err: unknown) {
            console.error('Import error:', err);
            showNotification({ title: 'Import Failed', message: 'An error occurred during batch processing.', color: 'red', status: 'error' });
            setIsImporting(false);
        }
    };

    return {
        template,
        setTemplate,
        results,
        setResults,
        isImporting,
        isScanning,
        isTaskRunning,
        activeTaskId,
        globalDeleteSource,
        setGlobalDeleteSource,
        handleResultChange,
        handleClearQueue,
        handleCancelImport,
        handleDrop,
        handleScan,
        handleReparse,
        handleImportAll
    };
}
