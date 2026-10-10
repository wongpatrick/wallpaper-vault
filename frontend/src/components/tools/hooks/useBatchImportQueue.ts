/**
 * @file
 * Hook for managing batch import queue, directory drop parsing, scanning, and execution.
 */
import { useState } from 'react';
import { useBatchImportSetsApiSetsBatchImportPost } from '../../../api/generated/sets/sets';
import { useAppNotifications } from '../../../hooks/useAppNotifications';
import type { BatchImportItem } from '../../../api/model';

export function useBatchImportQueue() {
    const [template, setTemplate] = useState('Coser@[Creator] - [Set]');
    const [results, setResults] = useState<BatchImportItem[]>([]);
    const [isImporting, setIsImporting] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [globalDeleteSource, setGlobalDeleteSource] = useState(true);

    const { mutateAsync: batchImportApi } = useBatchImportSetsApiSetsBatchImportPost();
    const { showNotification } = useAppNotifications();

    const handleResultChange = (index: number, field: keyof BatchImportItem, value: string | boolean) => {
        setResults(prev => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value } as BatchImportItem;
            return next;
        });
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        const items = Array.from(e.dataTransfer.items);
        const paths: string[] = [];

        for (const item of items) {
            const entry = item.webkitGetAsEntry();
            if (entry && entry.isDirectory) {
                const file = item.getAsFile();
                // Retrieve native path in Electron using the secure webUtils.getPathForFile API exposed in the preload script
                const absolutePath = file && window.electron?.getPathForFile 
                    ? window.electron.getPathForFile(file) 
                    : '';
                if (absolutePath) paths.push(absolutePath);
            }
        }

        if (paths.length > 0) {
            setIsScanning(true);
            try {
                const response = await batchImportApi({
                    data: {
                        items: paths.map(p => ({ source_path: p })),
                        dry_run: true,
                        parsing_template: template
                    }
                });
                
                const newItems = response.items || [];
                setResults(prev => {
                    const existingPaths = new Set(prev.map(r => r.source_path));
                    const uniqueNew = newItems.filter(r => !existingPaths.has(r.source_path));
                    return [...prev, ...uniqueNew];
                });
            } catch (err: unknown) {
                console.error('Drop error:', err);
                showNotification({ title: 'Error', message: 'Failed to parse dropped folders', color: 'red', status: 'error' });
            } finally {
                setIsScanning(false);
            }
        }
    };

    const handleScan = async () => {
        setIsScanning(true);
        try {
            const response = await batchImportApi({
                data: {
                    scan_auto_path: true,
                    dry_run: true,
                    parsing_template: template
                }
            });
            
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
            console.error('Scan error:', err);
            showNotification({ title: 'Scan Failed', message: 'Could not access auto-parse path.', color: 'red', status: 'error' });
        } finally {
            setIsScanning(false);
        }
    };

    const handleReparse = async () => {
        if (results.length === 0) return;
        setIsScanning(true);
        try {
            const response = await batchImportApi({
                data: {
                    items: results.map(r => ({ source_path: r.source_path })),
                    dry_run: true,
                    parsing_template: template
                }
            });
            
            const updatedItems = response.items || [];
            setResults(prev => prev.map(old => {
                const match = updatedItems.find(u => u.source_path === old.source_path);
                return match ? match : old;
            }));
            showNotification({ title: 'Queue Updated', message: 'Applied new template to current queue.', color: 'blue', status: 'info' });
        } catch {
            showNotification({ title: 'Error', message: 'Failed to re-parse queue', color: 'red', status: 'error' });
        } finally {
            setIsScanning(false);
        }
    };

    const handleImportAll = async () => {
        const pendingResults = results.filter(r => r.isValid && (r.status === 'pending' || r.status === 'error'));
        if (pendingResults.length === 0) return;

        setIsImporting(true);
        try {
            const response = await batchImportApi({
                data: {
                    items: pendingResults.map(r => ({
                        source_path: r.source_path,
                        creator_name: r.creator_name,
                        set_title: r.set_title,
                        delete_source: globalDeleteSource,
                        auto_orient: true
                    })),
                    dry_run: false,
                    delete_source_default: globalDeleteSource
                }
            });
            
            if (response.status === 'accepted') {
                showNotification({ 
                    title: 'Batch Import Started', 
                    message: 'The import is running in the background. You can safely navigate away.', 
                    color: 'blue',
                    status: 'info'
                });
                setResults([]); // Clear the local queue since it's now being processed in the background
            } else {
                // Map results back to local state (for sync fallback)
                const updatedItems = response.items || [];
                setResults(prev => prev.map(old => {
                    const match = updatedItems.find(u => u.source_path === old.source_path);
                    return match ? match : old;
                }));

                showNotification({ title: 'Batch Import Finished', message: 'Check the queue for status details.', color: 'green', status: 'success' });
            }
        } catch (err: unknown) {
            console.error('Import error:', err);
            showNotification({ title: 'Import Failed', message: 'An error occurred during batch processing.', color: 'red', status: 'error' });
        } finally {
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
        globalDeleteSource,
        setGlobalDeleteSource,
        handleResultChange,
        handleDrop,
        handleScan,
        handleReparse,
        handleImportAll
    };
}
