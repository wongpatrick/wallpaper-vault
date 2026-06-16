/**
 * @file
 * Module: Task Context
 * Description: Defines the types and React Context for tracking global background tasks in the application.
 */
import { createContext } from 'react';

export interface TaskInfo {
    id: string;
    status: 'accepted' | 'processing' | 'completed' | 'error';
    progress: number;
    total: number;
    error_message?: string;
    updated_at?: string;
}

export interface TaskContextType {
    tasks: Record<string, TaskInfo>;
    getTaskForSet: (setId: number) => TaskInfo | undefined;
    isTaskRunning: boolean;
}

export const TaskContext = createContext<TaskContextType | undefined>(undefined);
