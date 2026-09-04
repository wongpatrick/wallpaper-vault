/**
 * @file
 * Module: Global Task Overlays Component
 * Description: Renders background task loading overlays isolated from the main layout shell to prevent context re-render churn.
 */
import { useMemo } from 'react';
import { useTasks } from '../../hooks/useTasks';
import { ActionLoadingOverlay } from '../ui/ActionLoadingOverlay';

const AUTO_TAG_OVERLAY_HEIGHT_PX = 110;

export function GlobalTaskOverlays() {
    const { tasks } = useTasks();

    const activeAutoTagTask = useMemo(() => {
        return Object.values(tasks).find(
            (t) => t.id.startsWith('autotag-') && (t.status === 'accepted' || t.status === 'processing')
        );
    }, [tasks]);

    const activeImportTask = useMemo(() => {
        const importTasks = Object.values(tasks).filter(
            (t) => t.id.startsWith('import-') && (t.status === 'accepted' || t.status === 'processing')
        );
        if (importTasks.length === 0) return null;

        let progress = 0;
        let total = 0;
        let isProcessing = false;

        importTasks.forEach(t => {
            progress += t.progress || 0;
            total += t.total || 0;
            if (t.status === 'processing') {
                isProcessing = true;
            }
        });

        return {
            id: 'import-consolidated',
            status: isProcessing ? 'processing' : 'accepted',
            progress,
            total
        };
    }, [tasks]);

    return (
        <>
            <ActionLoadingOverlay 
                visible={!!activeAutoTagTask} 
                title="Auto-tagging Set" 
                message={
                    activeAutoTagTask?.status === 'processing' 
                        ? 'Auto-tagging set...' 
                        : 'Starting auto-tagging...'
                } 
                progress={activeAutoTagTask?.progress}
                total={activeAutoTagTask?.total}
            />
            <ActionLoadingOverlay 
                visible={!!activeImportTask} 
                title="Importing Images" 
                message={
                    activeImportTask?.status === 'processing' 
                        ? 'Importing and processing files...' 
                        : 'Starting file import...'
                } 
                progress={activeImportTask?.progress}
                total={activeImportTask?.total}
                bottomOffset={activeAutoTagTask ? AUTO_TAG_OVERLAY_HEIGHT_PX : 0}
            />
        </>
    );
}
