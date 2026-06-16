/**
 * @file
 * Module: useTasks Hook
 * Description: Custom React hook to consume the global TaskContext.
 */
import { useContext } from 'react';
import { TaskContext } from '../context/TaskContext';

export function useTasks() {
    const context = useContext(TaskContext);
    if (context === undefined) {
        throw new Error('useTasks must be used within a TaskProvider');
    }
    return context;
}
