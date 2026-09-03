/**
 * @file
 * Module: useTaskActions Hook
 * Description: Hook to access stable task actions (e.g. addTask) without re-rendering on task progress ticks.
 */
import { useContext } from 'react';
import { TaskActionsContext, type TaskActionsContextType } from '../context/TaskActionsContext';

export function useTaskActions(): TaskActionsContextType {
    const context = useContext(TaskActionsContext);
    if (!context) {
        throw new Error('useTaskActions must be used within a TaskProvider');
    }
    return context;
}
